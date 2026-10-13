/**
 * Lightmap UV atlas builder (renderer-agnostic).
 *
 * The Studio radiosity solver needs every surface to own a unique, non-
 * overlapping region of one shared lightmap ("uv1"). CAD meshes arrive as
 * indexed triangle lists grouped into B-rep faces (`triangles_per_face`),
 * optionally with the faces' parametric UVs. This module turns them into
 * charts and packs the charts of ALL meshes into one atlas:
 *
 * - A face with usable parametric UVs becomes one chart: its UV rectangle,
 *   sized in the atlas by the face's world size (a per-face Jacobian estimate
 *   so u and v get texels proportional to their world length).
 * - A face without UVs (or with degenerate ones) is split by the dominant axis
 *   of each triangle's normal into up to six planar charts (box projection).
 * - Vertices shared by triangles of different charts are duplicated, so the
 *   output may carry more vertices than the input (`remap` maps new → old).
 *
 * Packing uses a fixed-size atlas: a global texels-per-world-unit scale is
 * searched so the charts fill the atlas, with a texel gutter around each chart
 * (the solver dilates lighting into the gutters so bilinear sampling never
 * bleeds across charts). Charts flagged `fixed` keep their pixel size (used
 * for the floor, which gets a large reserved region). The atlas origin is kept
 * empty (`originGuard`) so geometry without `uv1` reads an empty texel.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One mesh to chart. Positions are in object space; `matrixWorld` scales them to world units. */
export interface LightmapMeshInput {
  /** Flat xyz positions. */
  positions: Float32Array;
  /** Triangle indices; null for a non-indexed triangle list. */
  index: Uint32Array | Uint16Array | null;
  /** Flat per-vertex parametric uv, or null. */
  uv: Float32Array | null;
  /** Triangle count per B-rep face (same order as `index`), or null (= one face). */
  trianglesPerFace: ArrayLike<number> | null;
  /** Column-major 4x4 world matrix elements (THREE.Matrix4.elements), or null for identity. */
  matrixWorld: ArrayLike<number> | null;
}

/** A chart before packing: world size plus the vertices it owns. */
export interface LightmapChart {
  /** World-unit width/height (chart-local u/v extents). */
  w: number;
  h: number;
  /** When true, `w`/`h` are already texels and are not scaled by the packer. */
  fixed: boolean;
  /** Packed texel rect (set by `packCharts`): origin and inner size (without gutter). */
  x: number;
  y: number;
  pw: number;
  ph: number;
}

/** Per-mesh result of `chartMesh`. */
export interface ChartedMesh {
  /** Vertex count after splitting. */
  vertexCount: number;
  /** New triangle indices (into the split vertex list). */
  index: Uint32Array;
  /** New vertex → original vertex, or null when nothing was split. */
  remap: Uint32Array | null;
  /** Chart id per new vertex (index into `charts`). */
  chartOfVertex: Uint32Array;
  /** Chart-local coordinates per new vertex, each in [0,1]. */
  local: Float32Array;
  /** Charts of this mesh (fresh objects; packer writes their rects). */
  charts: LightmapChart[];
  /** How many faces used their parametric UVs vs planar projection (diagnostics). */
  uvFaces: number;
  planarFaces: number;
}

export interface PackResult {
  /** Texels per world unit chosen for scalable charts. */
  scale: number;
  /** Fraction of the atlas covered by chart rects (incl. gutters). */
  fill: number;
}

// ---------------------------------------------------------------------------
// Charting
// ---------------------------------------------------------------------------

const _m = new Float64Array(16);

function transformPoint(
  out: Float64Array,
  o: number,
  px: number,
  py: number,
  pz: number,
  m: Float64Array | null,
): void {
  if (m === null) {
    out[o] = px;
    out[o + 1] = py;
    out[o + 2] = pz;
    return;
  }
  out[o] = m[0] * px + m[4] * py + m[8] * pz + m[12];
  out[o + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
  out[o + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
}

/**
 * Chart one mesh. Pure function: never touches the inputs.
 *
 * @param mesh - Geometry data
 * @param minUvArea - Faces whose total UV area is below this use planar projection
 */
export function chartMesh(
  mesh: LightmapMeshInput,
  minUvArea: number = 1e-10,
): ChartedMesh {
  const nv = mesh.positions.length / 3;
  const index: ArrayLike<number> =
    mesh.index ?? sequentialIndex(mesh.positions.length / 3);
  const triCount = Math.floor(index.length / 3);

  // World-space positions (doubles) for size estimates.
  let m: Float64Array | null = null;
  if (mesh.matrixWorld) {
    for (let i = 0; i < 16; i++) _m[i] = mesh.matrixWorld[i];
    m = _m;
  }
  const world = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    transformPoint(
      world,
      i * 3,
      mesh.positions[i * 3],
      mesh.positions[i * 3 + 1],
      mesh.positions[i * 3 + 2],
      m,
    );
  }

  // Face id per triangle.
  const faceOfTri = new Uint32Array(triCount);
  let faceCount: number;
  if (mesh.trianglesPerFace && mesh.trianglesPerFace.length > 0) {
    let t = 0;
    for (let f = 0; f < mesh.trianglesPerFace.length; f++) {
      const n = mesh.trianglesPerFace[f];
      for (let k = 0; k < n && t < triCount; k++) faceOfTri[t++] = f;
    }
    faceCount = mesh.trianglesPerFace.length;
    // Leftover triangles (malformed input) get their own face.
    if (t < triCount) {
      for (; t < triCount; t++) faceOfTri[t] = faceCount;
      faceCount++;
    }
  } else {
    faceCount = 1;
  }

  // --- Per-face UV analysis: usable? and the u/v world stretch ---
  const uv = mesh.uv && mesh.uv.length >= nv * 2 ? mesh.uv : null;
  const faceUvOk = new Uint8Array(faceCount);
  const faceSu = new Float64Array(faceCount); // world length per unit u
  const faceSv = new Float64Array(faceCount);
  if (uv) {
    const uvArea = new Float64Array(faceCount);
    const wArea = new Float64Array(faceCount);
    const suAcc = new Float64Array(faceCount);
    const svAcc = new Float64Array(faceCount);
    const bad = new Uint8Array(faceCount);
    for (let t = 0; t < triCount; t++) {
      const f = faceOfTri[t];
      const a = index[t * 3],
        b = index[t * 3 + 1],
        c = index[t * 3 + 2];
      const ua = uv[a * 2],
        va = uv[a * 2 + 1];
      const ub = uv[b * 2],
        vb = uv[b * 2 + 1];
      const uc = uv[c * 2],
        vc = uv[c * 2 + 1];
      if (
        !isFinite(ua) ||
        !isFinite(va) ||
        !isFinite(ub) ||
        !isFinite(vb) ||
        !isFinite(uc) ||
        !isFinite(vc)
      ) {
        bad[f] = 1;
        continue;
      }
      const du1 = ub - ua,
        dv1 = vb - va,
        du2 = uc - ua,
        dv2 = vc - va;
      const det = du1 * dv2 - du2 * dv1;
      const e1x = world[b * 3] - world[a * 3],
        e1y = world[b * 3 + 1] - world[a * 3 + 1],
        e1z = world[b * 3 + 2] - world[a * 3 + 2];
      const e2x = world[c * 3] - world[a * 3],
        e2y = world[c * 3 + 1] - world[a * 3 + 1],
        e2z = world[c * 3 + 2] - world[a * 3 + 2];
      const cx = e1y * e2z - e1z * e2y,
        cy = e1z * e2x - e1x * e2z,
        cz = e1x * e2y - e1y * e2x;
      const area3 = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      const area2 = 0.5 * Math.abs(det);
      uvArea[f] += area2;
      wArea[f] += area3;
      if (area2 > 1e-14 && area3 > 0) {
        // Jacobian J = [e1 e2] * inv([duv1 duv2]); columns = dP/du, dP/dv
        const inv = 1 / det;
        const i00 = dv2 * inv,
          i01 = -du2 * inv,
          i10 = -dv1 * inv,
          i11 = du1 * inv;
        const jux = e1x * i00 + e2x * i10,
          juy = e1y * i00 + e2y * i10,
          juz = e1z * i00 + e2z * i10;
        const jvx = e1x * i01 + e2x * i11,
          jvy = e1y * i01 + e2y * i11,
          jvz = e1z * i01 + e2z * i11;
        const su = Math.sqrt(jux * jux + juy * juy + juz * juz);
        const sv = Math.sqrt(jvx * jvx + jvy * jvy + jvz * jvz);
        suAcc[f] += su * area3;
        svAcc[f] += sv * area3;
      }
    }
    for (let f = 0; f < faceCount; f++) {
      if (bad[f] || uvArea[f] < minUvArea || wArea[f] <= 0) continue;
      const su = suAcc[f] / wArea[f];
      const sv = svAcc[f] / wArea[f];
      if (!(su > 0) || !(sv > 0) || !isFinite(su) || !isFinite(sv)) continue;
      // Extreme anisotropy means the UVs are unusable for a lightmap.
      const ratio = su / sv;
      if (ratio > 1e3 || ratio < 1e-3) continue;
      faceUvOk[f] = 1;
      faceSu[f] = su;
      faceSv[f] = sv;
    }
  }

  // --- Chart key per triangle: UV faces → face; planar → face*6 + axis ---
  // Chart ids are assigned in first-seen order.
  const chartKeyToId = new Map<number, number>();
  const chartOfTri = new Uint32Array(triCount);
  const chartAxis: number[] = []; // -1 for UV charts, 0..5 for planar
  const chartFace: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const f = faceOfTri[t];
    let key: number;
    let axis = -1;
    if (faceUvOk[f]) {
      key = f * 7 + 6;
    } else {
      const a = index[t * 3],
        b = index[t * 3 + 1],
        c = index[t * 3 + 2];
      const e1x = world[b * 3] - world[a * 3],
        e1y = world[b * 3 + 1] - world[a * 3 + 1],
        e1z = world[b * 3 + 2] - world[a * 3 + 2];
      const e2x = world[c * 3] - world[a * 3],
        e2y = world[c * 3 + 1] - world[a * 3 + 1],
        e2z = world[c * 3 + 2] - world[a * 3 + 2];
      const nx = e1y * e2z - e1z * e2y,
        ny = e1z * e2x - e1x * e2z,
        nz = e1x * e2y - e1y * e2x;
      const ax = Math.abs(nx),
        ay = Math.abs(ny),
        az = Math.abs(nz);
      if (ax >= ay && ax >= az) axis = nx >= 0 ? 0 : 1;
      else if (ay >= az) axis = ny >= 0 ? 2 : 3;
      else axis = nz >= 0 ? 4 : 5;
      key = f * 7 + axis;
    }
    let id = chartKeyToId.get(key);
    if (id === undefined) {
      id = chartKeyToId.size;
      chartKeyToId.set(key, id);
      chartAxis.push(axis);
      chartFace.push(f);
    }
    chartOfTri[t] = id;
  }
  const chartCount = chartKeyToId.size;

  // --- Vertex splitting: one output vertex per (original vertex, chart) ---
  // The first chart that uses an input vertex keeps the input index, so the
  // output is identity-ordered and, without conflicts, index-compatible with
  // the input geometry. Extra copies for other charts are appended after nv.
  const firstChart = new Int32Array(nv).fill(-1);
  const overflow = new Map<string, number>();
  const newToOld: number[] = [];
  const newChart: number[] = [];
  for (let v = 0; v < nv; v++) {
    newToOld.push(v);
    newChart.push(0);
  }
  const newIndex = new Uint32Array(triCount * 3);
  let split = false;
  for (let t = 0; t < triCount; t++) {
    const ch = chartOfTri[t];
    for (let k = 0; k < 3; k++) {
      const old = index[t * 3 + k];
      let nidx: number;
      if (firstChart[old] === -1) {
        firstChart[old] = ch;
        newChart[old] = ch;
        nidx = old;
      } else if (firstChart[old] === ch) {
        nidx = old;
      } else {
        split = true;
        const key = old + "," + ch;
        const existing = overflow.get(key);
        if (existing !== undefined) {
          nidx = existing;
        } else {
          nidx = newToOld.length;
          overflow.set(key, nidx);
          newToOld.push(old);
          newChart.push(ch);
        }
      }
      newIndex[t * 3 + k] = nidx;
    }
  }
  const vertexCount = newToOld.length;
  const chartOfVertex = Uint32Array.from(newChart);

  // --- Chart-local coordinates and world sizes ---
  const local = new Float32Array(vertexCount * 2);
  const raw = new Float64Array(vertexCount * 2);
  const minA = new Float64Array(chartCount).fill(Infinity);
  const maxA = new Float64Array(chartCount).fill(-Infinity);
  const minB = new Float64Array(chartCount).fill(Infinity);
  const maxB = new Float64Array(chartCount).fill(-Infinity);
  const used = new Uint8Array(chartCount);
  for (let v = 0; v < vertexCount; v++) {
    const old = newToOld[v];
    const ch = chartOfVertex[v];
    if (firstChart[old] === -1) continue; // unreferenced vertex
    const axis = chartAxis[ch];
    let a: number, b: number;
    if (axis < 0) {
      a = uv![old * 2];
      b = uv![old * 2 + 1];
    } else {
      const wx = world[old * 3],
        wy = world[old * 3 + 1],
        wz = world[old * 3 + 2];
      // Project onto the plane perpendicular to the dominant axis, keeping
      // a consistent handedness so charts of one face line up.
      if (axis <= 1) {
        a = axis === 0 ? wy : -wy;
        b = wz;
      } else if (axis <= 3) {
        a = axis === 2 ? wz : -wz;
        b = wx;
      } else {
        a = axis === 4 ? wx : -wx;
        b = wy;
      }
    }
    raw[v * 2] = a;
    raw[v * 2 + 1] = b;
    used[ch] = 1;
    if (a < minA[ch]) minA[ch] = a;
    if (a > maxA[ch]) maxA[ch] = a;
    if (b < minB[ch]) minB[ch] = b;
    if (b > maxB[ch]) maxB[ch] = b;
  }

  const charts: LightmapChart[] = [];
  let uvFaces = 0;
  let planarFaces = 0;
  const uvFaceSeen = new Uint8Array(faceCount);
  for (let ch = 0; ch < chartCount; ch++) {
    const axis = chartAxis[ch];
    const f = chartFace[ch];
    if (axis < 0) {
      if (!uvFaceSeen[f]) {
        uvFaceSeen[f] = 1;
        uvFaces++;
      }
    } else {
      planarFaces++;
    }
    let w = 0,
      h = 0;
    if (used[ch]) {
      const da = maxA[ch] - minA[ch];
      const db = maxB[ch] - minB[ch];
      if (axis < 0) {
        w = da * faceSu[f];
        h = db * faceSv[f];
      } else {
        w = da;
        h = db;
      }
    }
    charts.push({ w, h, fixed: false, x: 0, y: 0, pw: 0, ph: 0 });
  }

  for (let v = 0; v < vertexCount; v++) {
    const old = newToOld[v];
    if (firstChart[old] === -1) {
      local[v * 2] = 0.5;
      local[v * 2 + 1] = 0.5;
      continue;
    }
    const ch = chartOfVertex[v];
    const da = maxA[ch] - minA[ch];
    const db = maxB[ch] - minB[ch];
    local[v * 2] = da > 0 ? (raw[v * 2] - minA[ch]) / da : 0.5;
    local[v * 2 + 1] = db > 0 ? (raw[v * 2 + 1] - minB[ch]) / db : 0.5;
  }

  return {
    vertexCount,
    index: newIndex,
    remap: split ? Uint32Array.from(newToOld) : null,
    chartOfVertex,
    local,
    charts,
    uvFaces,
    planarFaces,
  };
}

function sequentialIndex(n: number): Uint32Array {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  return idx;
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

interface Box {
  w: number;
  h: number;
  x: number;
  y: number;
  chart: LightmapChart;
}

/**
 * Shelf-free rectangle packer (the potpack algorithm) into a fixed width.
 * Boxes are sorted by height; returns the used height, or Infinity when a
 * box is wider than the atlas.
 */
function packBoxes(boxes: Box[], width: number, guard: number): number {
  // The guard keeps the atlas origin free: a mesh without a `uv1` attribute
  // samples texel (0,0), which must stay empty so the display shader falls
  // back to plain IBL for it.
  const spaces: { x: number; y: number; w: number; h: number }[] =
    guard > 0
      ? [
          { x: 0, y: guard, w: width, h: Infinity },
          { x: guard, y: 0, w: width - guard, h: guard },
        ]
      : [{ x: 0, y: 0, w: width, h: Infinity }];
  let height = 0;
  for (const box of boxes) {
    if (box.w > width) return Infinity;
    let placed = false;
    for (let i = spaces.length - 1; i >= 0; i--) {
      const space = spaces[i];
      if (box.w > space.w || box.h > space.h) continue;
      box.x = space.x;
      box.y = space.y;
      height = Math.max(height, box.y + box.h);
      if (box.w === space.w && box.h === space.h) {
        const last = spaces.pop()!;
        if (i < spaces.length) spaces[i] = last;
      } else if (box.h === space.h) {
        space.x += box.w;
        space.w -= box.w;
      } else if (box.w === space.w) {
        space.y += box.h;
        space.h -= box.h;
      } else {
        spaces.push({
          x: space.x + box.w,
          y: space.y,
          w: space.w - box.w,
          h: box.h,
        });
        space.y += box.h;
        space.h -= box.h;
      }
      placed = true;
      break;
    }
    if (!placed) return Infinity;
  }
  return height;
}

/**
 * Pack charts into a `resolution`×`resolution` atlas with `padding` texels of
 * gutter on every side of each chart. Writes `x`, `y`, `pw`, `ph` on the charts.
 * Returns null when even the smallest scale does not fit (too many charts).
 */
export function packCharts(
  charts: LightmapChart[],
  resolution: number,
  padding: number = 2,
  originGuard: number = 4,
): PackResult | null {
  if (charts.length === 0) return { scale: 1, fill: 0 };

  let worldArea = 0;
  let fixedArea = 0;
  for (const c of charts) {
    if (c.fixed) fixedArea += (c.w + 2 * padding) * (c.h + 2 * padding);
    else worldArea += Math.max(c.w, 1e-9) * Math.max(c.h, 1e-9);
  }
  const free = Math.max(resolution * resolution - fixedArea, 1);

  const boxes: Box[] = charts.map((chart) => ({
    w: 0,
    h: 0,
    x: 0,
    y: 0,
    chart,
  }));

  const tryScale = (scale: number): boolean => {
    for (const box of boxes) {
      const c = box.chart;
      if (c.fixed) {
        box.w = Math.ceil(c.w) + 2 * padding;
        box.h = Math.ceil(c.h) + 2 * padding;
      } else {
        box.w = Math.max(1, Math.ceil(c.w * scale)) + 2 * padding;
        box.h = Math.max(1, Math.ceil(c.h * scale)) + 2 * padding;
      }
    }
    boxes.sort((a, b) => b.h - a.h || b.w - a.w);
    const height = packBoxes(boxes, resolution, originGuard);
    return height <= resolution;
  };

  // Initial guess from the area budget (texel^2 per world^2), then bracket.
  const scale = worldArea > 0 ? Math.sqrt((free * 0.6) / worldArea) : 1;
  let lo = 0;
  let hi = 0;
  if (tryScale(scale)) {
    lo = scale;
    for (let i = 0; i < 12; i++) {
      const next = lo * 1.2;
      if (tryScale(next)) lo = next;
      else {
        hi = next;
        break;
      }
    }
  } else {
    hi = scale;
    let s = scale;
    let fits = false;
    for (let i = 0; i < 24; i++) {
      s *= 0.75;
      if (tryScale(s)) {
        lo = s;
        fits = true;
        break;
      }
      hi = s;
    }
    if (!fits) return null;
  }
  if (hi > 0) {
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (tryScale(mid)) lo = mid;
      else hi = mid;
    }
  }
  // Final placement at the best fitting scale.
  tryScale(lo);
  let covered = 0;
  for (const box of boxes) {
    box.chart.x = box.x + padding;
    box.chart.y = box.y + padding;
    box.chart.pw = box.w - 2 * padding;
    box.chart.ph = box.h - 2 * padding;
    covered += box.w * box.h;
  }
  return { scale: lo, fill: covered / (resolution * resolution) };
}

/**
 * Write the atlas-normalized uv1 for a charted mesh after packing.
 */
export function writeAtlasUv(
  charted: ChartedMesh,
  resolution: number,
  out?: Float32Array,
): Float32Array {
  const uv1 = out ?? new Float32Array(charted.vertexCount * 2);
  const inv = 1 / resolution;
  for (let v = 0; v < charted.vertexCount; v++) {
    const c = charted.charts[charted.chartOfVertex[v]];
    uv1[v * 2] = (c.x + charted.local[v * 2] * c.pw) * inv;
    uv1[v * 2 + 1] = (c.y + charted.local[v * 2 + 1] * c.ph) * inv;
  }
  return uv1;
}
