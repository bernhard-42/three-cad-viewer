/**
 * Unit tests for the lightmap UV atlas builder (renderer-agnostic).
 */
import { describe, test, expect } from "vitest";
import {
  chartMesh,
  packCharts,
  writeAtlasUv,
} from "../../src/rendering/lightmap-uv.js";

/** Unit cube: 24 vertices (4 per face), 12 triangles, 6 faces, no shared vertices. */
function cube(withUv) {
  const positions = [];
  const uv = [];
  const index = [];
  const faces = [
    // normal axis, sign, u axis, v axis
    [0, 1, 1, 2],
    [0, -1, 1, 2],
    [1, 1, 2, 0],
    [1, -1, 2, 0],
    [2, 1, 0, 1],
    [2, -1, 0, 1],
  ];
  for (const [n, s, ua, va] of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const p = [0, 0, 0];
      p[n] = s > 0 ? 1 : 0;
      p[ua] = a;
      p[va] = b;
      positions.push(...p);
      uv.push(a * 3, b * 3); // parametric uv with a uniform 3x stretch
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    index: new Uint32Array(index),
    uv: withUv ? new Float32Array(uv) : null,
    trianglesPerFace: [2, 2, 2, 2, 2, 2],
    matrixWorld: null,
  };
}

describe("chartMesh", () => {
  test("faces with parametric UVs become one chart each, no split", () => {
    const charted = chartMesh(cube(true));
    expect(charted.charts.length).toBe(6);
    expect(charted.uvFaces).toBe(6);
    expect(charted.planarFaces).toBe(0);
    expect(charted.remap).toBeNull();
    expect(charted.vertexCount).toBe(24);
    // uv stretch of 3 per unit → world size 1x1 for every face
    for (const c of charted.charts) {
      expect(c.w).toBeCloseTo(1, 5);
      expect(c.h).toBeCloseTo(1, 5);
    }
    // local coords are normalized to [0,1]
    for (let i = 0; i < charted.local.length; i++) {
      expect(charted.local[i]).toBeGreaterThanOrEqual(0);
      expect(charted.local[i]).toBeLessThanOrEqual(1);
    }
  });

  test("faces without UVs use planar projection", () => {
    const charted = chartMesh(cube(false));
    expect(charted.charts.length).toBe(6);
    expect(charted.planarFaces).toBe(6);
    expect(charted.remap).toBeNull();
    for (const c of charted.charts) {
      expect(c.w).toBeCloseTo(1, 5);
      expect(c.h).toBeCloseTo(1, 5);
    }
  });

  test("world matrix scales chart sizes", () => {
    const mesh = cube(false);
    const m = new Array(16).fill(0);
    m[0] = 2;
    m[5] = 2;
    m[10] = 2;
    m[15] = 1;
    mesh.matrixWorld = m;
    const charted = chartMesh(mesh);
    for (const c of charted.charts) {
      expect(c.w).toBeCloseTo(2, 5);
      expect(c.h).toBeCloseTo(2, 5);
    }
  });

  test("vertices shared across faces are split", () => {
    // Two faces sharing an edge (vertices 1 and 2): a folded strip.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1,
    ]);
    // face A: quad 0-1-2-3 in z=0 plane; face B: quad 1-4-5-2 in x=1 plane
    const index = new Uint32Array([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2]);
    const charted = chartMesh({
      positions,
      index,
      uv: null,
      trianglesPerFace: [2, 2],
      matrixWorld: null,
    });
    expect(charted.charts.length).toBe(2);
    expect(charted.remap).not.toBeNull();
    // 6 original + 2 duplicated (vertices 1 and 2 used by both faces)
    expect(charted.vertexCount).toBe(8);
    // first 6 remap to themselves
    for (let i = 0; i < 6; i++) expect(charted.remap[i]).toBe(i);
    expect(Array.from(charted.remap.slice(6)).sort()).toEqual([1, 2]);
    // no triangle references a vertex from another chart
    for (let t = 0; t < 4; t++) {
      const ch = charted.chartOfVertex[charted.index[t * 3]];
      expect(charted.chartOfVertex[charted.index[t * 3 + 1]]).toBe(ch);
      expect(charted.chartOfVertex[charted.index[t * 3 + 2]]).toBe(ch);
    }
  });

  test("degenerate UVs fall back to planar", () => {
    const mesh = cube(true);
    mesh.uv.fill(0.25); // all identical → zero uv area
    const charted = chartMesh(mesh);
    expect(charted.uvFaces).toBe(0);
    expect(charted.planarFaces).toBe(6);
  });

  test("non-indexed meshes and missing trianglesPerFace work", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const charted = chartMesh({
      positions,
      index: null,
      uv: null,
      trianglesPerFace: null,
      matrixWorld: null,
    });
    expect(charted.charts.length).toBe(1);
    expect(charted.vertexCount).toBe(3);
    expect(Array.from(charted.index)).toEqual([0, 1, 2]);
  });
});

describe("packCharts + writeAtlasUv", () => {
  test("packs charts without overlap inside the atlas", () => {
    const charts = [];
    for (let i = 0; i < 50; i++) {
      charts.push({
        w: 1 + (i % 7),
        h: 1 + (i % 5),
        fixed: false,
        x: 0,
        y: 0,
        pw: 0,
        ph: 0,
      });
    }
    const res = packCharts(charts, 256, 2);
    expect(res).not.toBeNull();
    expect(res.scale).toBeGreaterThan(0);
    for (const c of charts) {
      expect(c.pw).toBeGreaterThanOrEqual(1);
      expect(c.ph).toBeGreaterThanOrEqual(1);
      expect(c.x - 2).toBeGreaterThanOrEqual(0);
      expect(c.y - 2).toBeGreaterThanOrEqual(0);
      expect(c.x + c.pw + 2).toBeLessThanOrEqual(256);
      expect(c.y + c.ph + 2).toBeLessThanOrEqual(256);
    }
    // pairwise overlap check including gutters
    for (let i = 0; i < charts.length; i++) {
      for (let j = i + 1; j < charts.length; j++) {
        const a = charts[i],
          b = charts[j];
        const sep =
          a.x + a.pw + 2 <= b.x - 2 ||
          b.x + b.pw + 2 <= a.x - 2 ||
          a.y + a.ph + 2 <= b.y - 2 ||
          b.y + b.ph + 2 <= a.y - 2;
        expect(sep).toBe(true);
      }
    }
    expect(res.fill).toBeGreaterThan(0.3);
  });

  test("fixed charts keep their texel size", () => {
    const charts = [
      { w: 100, h: 100, fixed: true, x: 0, y: 0, pw: 0, ph: 0 },
      { w: 1, h: 1, fixed: false, x: 0, y: 0, pw: 0, ph: 0 },
    ];
    const res = packCharts(charts, 256, 2);
    expect(res).not.toBeNull();
    expect(charts[0].pw).toBe(100);
    expect(charts[0].ph).toBe(100);
  });

  test("returns null when charts cannot fit", () => {
    const charts = [];
    for (let i = 0; i < 2000; i++) {
      charts.push({ w: 1, h: 1, fixed: false, x: 0, y: 0, pw: 0, ph: 0 });
    }
    // 2000 charts of >= 5x5 texels (1 + 2*2 gutter) need > 16x16 atlas
    expect(packCharts(charts, 16, 2)).toBeNull();
  });

  test("writeAtlasUv maps local coords into the packed rect", () => {
    const charted = chartMesh(cube(true));
    const res = packCharts(charted.charts, 128, 2);
    expect(res).not.toBeNull();
    const uv1 = writeAtlasUv(charted, 128);
    expect(uv1.length).toBe(48);
    for (let v = 0; v < 24; v++) {
      const c = charted.charts[charted.chartOfVertex[v]];
      const u = uv1[v * 2] * 128;
      const w = uv1[v * 2 + 1] * 128;
      expect(u).toBeGreaterThanOrEqual(c.x - 1e-3);
      expect(u).toBeLessThanOrEqual(c.x + c.pw + 1e-3);
      expect(w).toBeGreaterThanOrEqual(c.y - 1e-3);
      expect(w).toBeLessThanOrEqual(c.y + c.ph + 1e-3);
    }
  });
});
