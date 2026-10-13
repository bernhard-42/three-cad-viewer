/**
 * Unit tests for the radiosity pieces that run without a GPU: the display
 * material patch, the lightmapped floor, and the quality presets.
 */
import { describe, test, expect } from "vitest";
import * as THREE from "three";
import {
  applyRadiosityPatch,
  removeRadiosityPatch,
  hasRadiosityPatch,
  hasTriplanarKey,
  RADIOSITY_QUALITY,
} from "../../src/rendering/radiosity.js";
import { RadiosityFloor } from "../../src/rendering/studio-floor.js";

function uniforms() {
  return { uRadWeight: { value: 1 }, uRadShadow: { value: 0.5 } };
}

describe("applyRadiosityPatch", () => {
  test("attaches the lightmap and chains an existing onBeforeCompile", () => {
    const mat = new THREE.MeshPhysicalMaterial();
    const calls = [];
    mat.onBeforeCompile = () => calls.push("triplanar");
    mat.customProgramCacheKey = () => "triplanar";
    const tex = new THREE.Texture();

    applyRadiosityPatch(mat, tex, uniforms());

    expect(hasRadiosityPatch(mat)).toBe(true);
    expect(mat.lightMap).toBe(tex);
    expect(mat.customProgramCacheKey()).toBe("triplanar|radiosity");
    expect(hasTriplanarKey(mat)).toBe(true);

    // The chained hook calls the previous one and patches the chunks.
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n",
      fragmentShader:
        "#include <common>\n#include <lights_fragment_maps>\n#include <aomap_fragment>\n",
    };
    mat.onBeforeCompile(shader, null);
    expect(calls).toEqual(["triplanar"]);
    expect(shader.uniforms.uRadWeight).toBeDefined();
    expect(shader.fragmentShader).not.toContain(
      "#include <lights_fragment_maps>",
    );
    expect(shader.fragmentShader).toContain("tcvRadVisibility");
    expect(shader.fragmentShader).toContain("#include <aomap_fragment>");
  });

  test("is idempotent and only recompiles when the lightmap is first attached", () => {
    const mat = new THREE.MeshPhysicalMaterial();
    const a = new THREE.Texture();
    const b = new THREE.Texture();
    const v0 = mat.version;
    applyRadiosityPatch(mat, a, uniforms());
    const v1 = mat.version;
    expect(v1).toBeGreaterThan(v0);
    const hook = mat.onBeforeCompile;
    applyRadiosityPatch(mat, b, uniforms());
    expect(mat.onBeforeCompile).toBe(hook);
    expect(mat.lightMap).toBe(b);
    expect(mat.version).toBe(v1); // texture swap: no recompile
    expect(mat.customProgramCacheKey()).toBe("radiosity");
  });

  test("removeRadiosityPatch restores the previous hooks", () => {
    const mat = new THREE.MeshPhysicalMaterial();
    const prev = () => {};
    mat.onBeforeCompile = prev;
    applyRadiosityPatch(mat, new THREE.Texture(), uniforms());
    removeRadiosityPatch(mat);
    expect(hasRadiosityPatch(mat)).toBe(false);
    expect(mat.onBeforeCompile).toBe(prev);
    expect(mat.lightMap).toBeNull();
    expect(hasTriplanarKey(mat)).toBe(false);
  });
});

describe("RadiosityFloor", () => {
  test("configure builds a uv1 plane centred under the model (Z up)", () => {
    const floor = new RadiosityFloor();
    floor.configure(new THREE.Vector3(10, 20, 30), 5, 100, "Z");
    const mesh = floor.mesh;
    expect(mesh).not.toBeNull();
    expect(mesh.position.z).toBe(5);
    expect(mesh.rotation.x).toBe(0);
    const uv1 = floor.geometry.getAttribute("uv1");
    expect(uv1.count).toBe(16);
    // inner square = 4 × extent, centred on the model
    const pos = floor.geometry.getAttribute("position");
    const xs = new Set();
    for (let i = 0; i < pos.count; i++) xs.add(pos.getX(i));
    expect(xs.has(10 - 200)).toBe(true);
    expect(xs.has(10 + 200)).toBe(true);
    expect(floor.innerSize).toBe(400);
  });

  test("Y up rotates the plane so its normal is +Y", () => {
    const floor = new RadiosityFloor();
    floor.configure(new THREE.Vector3(0, 0, 0), -2, 10, "Y");
    const mesh = floor.mesh;
    expect(mesh.position.y).toBe(-2);
    mesh.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
    expect(n.y).toBeCloseTo(1, 6);
  });

  test("setAtlasRect maps the inner square into the atlas", () => {
    const floor = new RadiosityFloor();
    floor.configure(new THREE.Vector3(), 0, 10, "Z");
    floor.setAtlasRect(100, 200, 300, 300, 1024);
    const uv1 = floor.geometry.getAttribute("uv1");
    const us = new Set();
    const vs = new Set();
    for (let i = 0; i < uv1.count; i++) {
      us.add(uv1.getX(i));
      vs.add(uv1.getY(i));
    }
    expect([...us].sort()).toEqual([100 / 1024, 400 / 1024]);
    expect([...vs].sort()).toEqual([200 / 1024, 500 / 1024]);
  });

  test("setAtlasRect can be applied repeatedly (floor rebuilds)", () => {
    const floor = new RadiosityFloor();
    floor.configure(new THREE.Vector3(), 0, 10, "Z");
    floor.setAtlasRect(2, 6, 508, 508, 1024);
    // A second build (e.g. after a floor-mode change) must not collapse the
    // chart: the corner flags come from the original layout, not from the
    // already-mapped attribute.
    floor.setAtlasRect(2, 6, 1020, 1020, 2048);
    const uv1 = floor.geometry.getAttribute("uv1");
    const us = new Set();
    for (let i = 0; i < uv1.count; i++) us.add(uv1.getX(i));
    expect([...us].sort()).toEqual([2 / 2048, 1022 / 2048]);
  });

  test("setMode switches material and visibility", () => {
    const floor = new RadiosityFloor();
    expect(floor.group.visible).toBe(false);
    floor.configure(new THREE.Vector3(), 0, 10, "Z");
    floor.setMode("grid");
    expect(floor.group.visible).toBe(true);
    expect(floor.mesh.material.name).toBe("radiosityFloorGrid");
    expect(floor.mesh.material.transparent).toBe(false);
    floor.setMode("shadow");
    expect(floor.mesh.material.name).toBe("radiosityFloorShadow");
    expect(floor.mesh.material.transparent).toBe(true);
    floor.setMode("none");
    expect(floor.group.visible).toBe(false);
    // bake albedo follows the mode
    floor.setMode("grid");
    expect(floor.albedo().r).toBeLessThan(0.1);
    floor.setMode("shadow");
    expect(floor.albedo().r).toBeCloseTo(0.35, 5);
    floor.dispose();
    expect(floor.mesh).toBeNull();
  });
});

describe("RADIOSITY_QUALITY", () => {
  test("presets use square direction grids and sane sizes", () => {
    for (const preset of Object.values(RADIOSITY_QUALITY)) {
      const side = Math.sqrt(preset.directions);
      expect(Number.isInteger(side)).toBe(true);
      expect(preset.lightmapResolution % 2).toBe(0);
      expect(preset.gatherRadius).toBeGreaterThanOrEqual(1);
      expect(preset.maxSamples).toBeGreaterThanOrEqual(0);
    }
  });
});
