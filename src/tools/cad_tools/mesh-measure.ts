import * as THREE from "three";
import type { TopoType, ComponentInfo } from "../../rendering/id-picking.js";
import type { ToolType } from "./tools.js";

/**
 * A measurement response. Carries both `subtype` (so the viewer's
 * `handleBackendResponse` routes it like a Python response) and `tool_type` (so
 * `Tools.handleResponse` dispatches to the right measurement). The remaining fields
 * (`result`, `refpoint*`, `shape_type`, `geom_type`, …) mirror the Python backend.
 */
export interface MeasureResponse {
  type: "backend_response";
  subtype: "tool_response";
  tool_type: ToolType;
  [key: string]: unknown;
}

/**
 * TypeScript mesh-based measurement backend.
 *
 * Computes meaningful measurements (area, length, volume, bounding box, min/center
 * distance, angle) from the tessellated mesh, so the measure tools work WITHOUT the
 * external Python (`ocp_vscode`) backend — the default when developing three-cad-viewer
 * standalone. Selected via the `externalMeasurementBackend` option (default `false` =
 * this backend; `ocp_vscode` sets `true` to use Python). See MeshBackend.md.
 *
 * Accuracy: `shape_type` / `geom_type` are EXACT (carried per-component in the
 * tessellation `face_types` / `edge_types`). Numeric values are mesh-accurate — exact
 * for planar faces / straight edges, within tessellation deflection for curved geometry.
 *
 * This module is the FROZEN contract (APPROACH.md "contracts-first"): the GeomAbs name
 * tables, the {@link MeshComponentGeometry} shape the provider yields, the
 * {@link MeshGeometryProvider} interface, and the pure geometry math operate on
 * world-space coordinates (the provider applies each node's transform).
 */

// ---------------------------------------------------------------------------
// geom_type — OCCT GeomAbs enums (exact, from face_types / edge_types)
//
// face_types[i] is OCCT `GeomAbs_SurfaceType`, edge_types[i] is `GeomAbs_CurveType`
// (ocp_tessellate get_face_type/get_edge_type → BRepAdaptor_*.GetType()). The Python
// `measure.py` reports the enum name with the `GeomAbs_` prefix stripped; these tables
// reproduce that mapping by ordinal.
// ---------------------------------------------------------------------------

/** GeomAbs_SurfaceType ordinals → name (face_types). */
export const SURFACE_TYPE_NAMES = [
  "Plane",
  "Cylinder",
  "Cone",
  "Sphere",
  "Torus",
  "BezierSurface",
  "BSplineSurface",
  "SurfaceOfRevolution",
  "SurfaceOfExtrusion",
  "OffsetSurface",
  "OtherSurface",
] as const;

/** GeomAbs_CurveType ordinals → name (edge_types). */
export const CURVE_TYPE_NAMES = [
  "Line",
  "Circle",
  "Ellipse",
  "Hyperbola",
  "Parabola",
  "BezierCurve",
  "BSplineCurve",
  "OffsetCurve",
  "OtherCurve",
] as const;

/** Resolve a face's `face_types` code to its geom_type name (`"Other"` if unknown). */
export function faceGeomType(code: number): string {
  return SURFACE_TYPE_NAMES[code] ?? "Other";
}

/** Resolve an edge's `edge_types` code to its geom_type name (`"Other"` if unknown). */
export function edgeGeomType(code: number): string {
  return CURVE_TYPE_NAMES[code] ?? "Other";
}

/**
 * Short, lowercase geom_type for a status-line readout (drops the `Curve`/`Surface`
 * suffix): e.g. `BSplineSurface`/`BSplineCurve` → `bspline`, `Plane` → `plane`,
 * `Line` → `line`. Topo selects the surface vs curve table.
 */
export function displayGeomType(topo: TopoType, code: number): string {
  const name = topo === "edge" ? edgeGeomType(code) : faceGeomType(code);
  return name.replace(/(Curve|Surface)$/, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

/**
 * Mesh geometry for one resolved component, in WORLD space (the provider has already
 * applied the owning node's transform). Discriminated by {@link topo}:
 * - `face` / `solid`: {@link positions} is a vertex pool, {@link indices} are triangle
 *   index triples into it (a solid merges all its faces).
 * - `edge`: {@link positions} is a flat list of segment endpoint pairs (6 floats per
 *   segment: `x0,y0,z0, x1,y1,z1`); {@link indices} is undefined.
 * - `vertex`: {@link positions} is exactly one point (3 floats); {@link indices} undefined.
 */
export interface MeshComponentGeometry {
  topo: TopoType;
  /** Raw GeomAbs code (`face_types`/`edge_types` entry); `-1` for vertex/solid. */
  geomType: number;
  /** World-space coordinates (layout depends on {@link topo}; see interface doc). */
  positions: Float32Array;
  /** Triangle index triples into {@link positions} (face/solid only). */
  indices?: Uint32Array;
}

/**
 * Resolves a backend component path (e.g. `"/box/faces/faces_3"`, `"/box/edges/edges_1"`,
 * `"/box/vertices/vertices_0"`, or a bare solid path `"/box"`) to its world-space mesh
 * geometry. Returns `null` for unknown paths or components with no captured geometry.
 * Populated at tessellation time (see Phase task: render-shape / nestedgroup).
 */
export interface MeshGeometryProvider {
  resolve(path: string): MeshComponentGeometry | null;
}

// ---------------------------------------------------------------------------
// Geometry features — primitive sets the distance math operates on
// ---------------------------------------------------------------------------

/**
 * Decomposition of a component into closest-distance primitives. The minimum distance
 * between two triangle meshes is always realized by a vertex-vs-triangle or an
 * edge-vs-edge pair, so these three lists are sufficient (and exact for the mesh).
 */
export interface MeshFeatures {
  /** All vertices (world space). */
  points: THREE.Vector3[];
  /** Triangles as [a, b, c] vertex triples (face/solid). */
  tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][];
  /** Line segments as [a, b] endpoint pairs (edges, and triangle edges of faces). */
  segs: [THREE.Vector3, THREE.Vector3][];
}

/** Build the {@link MeshFeatures} primitive sets from a component's geometry. */
export function buildFeatures(geom: MeshComponentGeometry): MeshFeatures {
  const points: THREE.Vector3[] = [];
  const tris: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  const segs: [THREE.Vector3, THREE.Vector3][] = [];
  const p = geom.positions;

  if (geom.topo === "vertex") {
    points.push(new THREE.Vector3(p[0], p[1], p[2]));
    return { points, tris, segs };
  }

  if (geom.topo === "edge") {
    // flat segment endpoint pairs: 6 floats per segment
    for (let i = 0; i + 5 < p.length; i += 6) {
      const a = new THREE.Vector3(p[i], p[i + 1], p[i + 2]);
      const b = new THREE.Vector3(p[i + 3], p[i + 4], p[i + 5]);
      points.push(a, b);
      segs.push([a, b]);
    }
    return { points, tris, segs };
  }

  // face / solid: triangle indices into the shared vertex pool. Build `verts` for
  // indexing (no `points.push(...verts)` spread — it overflows the argument limit on
  // big faces, RangeError). CRITICAL: collect `points` from ONLY the vertices this
  // component's triangles reference. A face is a SUBSET of its solid's shared pool, so
  // using the whole pool would let a vertex OUTSIDE the face win the closest-point
  // search → wrong distance / arrow on the wrong spot. For a solid the indices cover
  // every used vertex, so this is the same set (minus unreferenced pool vertices).
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < p.length; i += 3) {
    verts.push(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
  }
  const idx = geom.indices;
  if (idx === undefined) {
    for (const v of verts) points.push(v);
    return { points, tris, segs };
  }
  const seen = new Set<number>();
  const addPoint = (vi: number): void => {
    if (!seen.has(vi)) {
      seen.add(vi);
      points.push(verts[vi]);
    }
  };
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const ia = idx[t];
    const ib = idx[t + 1];
    const ic = idx[t + 2];
    const a = verts[ia];
    const b = verts[ib];
    const c = verts[ic];
    if (a === undefined || b === undefined || c === undefined) continue;
    tris.push([a, b, c]);
    segs.push([a, b], [b, c], [c, a]);
    addPoint(ia);
    addPoint(ib);
    addPoint(ic);
  }
  return { points, tris, segs };
}

// ---------------------------------------------------------------------------
// Scalar measurements
// ---------------------------------------------------------------------------

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _cross = new THREE.Vector3();

/** Total surface area of a triangulated face/solid (Σ ½·|(b−a)×(c−a)|). */
export function triangulatedArea(geom: MeshComponentGeometry): number {
  let area = 0;
  for (const [a, b, c] of buildFeatures(geom).tris) {
    _ab.subVectors(b, a);
    _ac.subVectors(c, a);
    area += 0.5 * _cross.crossVectors(_ab, _ac).length();
  }
  return area;
}

/** Total length of an edge polyline (Σ segment lengths). */
export function polylineLength(geom: MeshComponentGeometry): number {
  let len = 0;
  for (const [a, b] of buildFeatures(geom).segs) len += a.distanceTo(b);
  return len;
}

/**
 * Signed volume of a closed triangulated solid via the divergence theorem
 * (Σ (1/6)·a·(b×c) over triangles). The tessellation winds triangles CCW outward, so
 * the sum is positive; returned as an absolute value for robustness.
 */
export function meshVolume(geom: MeshComponentGeometry): number {
  let v6 = 0;
  for (const [a, b, c] of buildFeatures(geom).tris) {
    v6 += a.dot(_cross.crossVectors(b, c));
  }
  return Math.abs(v6) / 6;
}

const _ccA = new THREE.Vector3();
const _ccB = new THREE.Vector3();
const _ccC = new THREE.Vector3();
const _ccAC = new THREE.Vector3();
const _ccBC = new THREE.Vector3();
const _ccN = new THREE.Vector3();
const _ccTmp = new THREE.Vector3();

/**
 * Exact circle (center + radius) through three well-separated points of a circular
 * edge's tessellation polyline. The tessellation vertices lie ON the true curve, so
 * the circumcircle of any three is exact (up to float precision). `positions` is the
 * flat segment-endpoint list (works for both arcs and closed circles). Returns `null`
 * if the three points are degenerate/collinear.
 */
export function circleFromPolyline(
  positions: Float32Array,
): { center: number[]; radius: number } | null {
  const n = Math.floor(positions.length / 3);
  if (n < 3) return null;
  const at = (i: number, out: THREE.Vector3): THREE.Vector3 =>
    out.set(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]);
  const a = at(0, _ccA);
  const b = at(Math.floor(n / 3), _ccB);
  const c = at(Math.floor((2 * n) / 3), _ccC);
  // Circumcenter (3D): O = C + ((|ac|² b' - |bc|² a') × N) / (2|N|²),
  // with a' = A-C, b' = B-C, N = a' × b'.
  const ac = _ccAC.subVectors(a, c);
  const bc = _ccBC.subVectors(b, c);
  const nrm = _ccN.crossVectors(ac, bc);
  const denom = 2 * nrm.lengthSq();
  if (denom < 1e-20) return null; // collinear / coincident
  const tmp = _ccTmp
    .copy(bc)
    .multiplyScalar(ac.lengthSq())
    .addScaledVector(ac, -bc.lengthSq()); // |ac|² b' - |bc|² a'
  tmp.cross(nrm).divideScalar(denom).add(c); // → center
  return { center: [tmp.x, tmp.y, tmp.z], radius: tmp.distanceTo(a) };
}

/**
 * Status-line text for a hovered component — FIXED attributes only, no backend, no
 * live cursor coord, NO path (the object is identified via the tree on double-click).
 * Mesh-estimated length/area/volume are shown with `≈` (BRep-grade values come from
 * the measurement tool). face: `geom: area ≈ A`; edge: `geom: len ≈ L, start/end`;
 * vertex: coords; solid: `solid: N faces, M edges, vol ≈ V`.
 */
export function hoverStatusText(
  info: ComponentInfo,
  fromSolid: boolean,
  provider: MeshGeometrySource,
): string {
  const f2 = (n: number): string => n.toFixed(2);
  if (fromSolid && info.solidPath !== null) {
    // Solid face/edge totals from the tessellation type arrays (len(face_types) /
    // len(edge_types)). Per-face edge counts are NOT derivable (no face→edge map).
    const c = provider.nodeCounts(info.solidPath);
    if (c === null) return "solid";
    const g = provider.resolve(info.solidPath);
    const vol = g !== null ? `, vol ≈ ${f2(meshVolume(g))}` : "";
    return `solid: ${c.faces} faces, ${c.edges} edges${vol}`;
  }
  const geom = provider.resolve(info.path);
  const pt = (a: Float32Array, o: number): string =>
    `(${f2(a[o])}, ${f2(a[o + 1])}, ${f2(a[o + 2])})`;
  if (info.topo === "vertex") {
    const p = geom?.positions;
    return p && p.length >= 3 ? `vertex: ${pt(p, 0)}` : "";
  }
  const gt = geom != null ? displayGeomType(info.topo, geom.geomType) : "";
  if (info.topo === "edge") {
    const p = geom?.positions;
    if (geom != null && p != null && p.length >= 6) {
      const len = f2(polylineLength(geom));
      const start = pt(p, 0);
      const end = pt(p, p.length - 3);
      const curve = edgeGeomType(geom.geomType);
      if (curve === "Circle") {
        const circ = circleFromPolyline(p);
        if (circ !== null) {
          const r = f2(circ.radius);
          const c = `(${f2(circ.center[0])}, ${f2(circ.center[1])}, ${f2(circ.center[2])})`;
          // full circle (start === end): center + radius say it all; an arc keeps
          // its start/end too. Mesh-derived, so ≈.
          return start === end
            ? `${gt}: r ≈ ${r}, c ≈ ${c}, len ≈ ${len}`
            : `${gt}: r ≈ ${r}, c ≈ ${c}, len ≈ ${len}, start=${start}, end=${end}`;
        }
      }
      // closed edge (e.g. circle): start === end → show one point
      return start === end
        ? `${gt}: len ≈ ${len}, at=${start}`
        : `${gt}: len ≈ ${len}, start=${start}, end=${end}`;
    }
    return gt;
  }
  // face
  return geom != null ? `${gt}: area ≈ ${f2(triangulatedArea(geom))}` : gt;
}

/** Axis-aligned bounding box of a component's vertices. */
export function boundingBox(geom: MeshComponentGeometry): {
  min: number[];
  center: number[];
  max: number[];
  size: number[];
} {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of buildFeatures(geom).points) {
    min.min(p);
    max.max(p);
  }
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(max, min);
  return {
    min: min.toArray(),
    center: center.toArray(),
    max: max.toArray(),
    size: size.toArray(),
  };
}

/**
 * Representative center point of a component (mesh approximation of `refpoint`):
 * - vertex → the point;
 * - edge → length-weighted midpoint of its segments;
 * - face → area-weighted centroid of its triangles;
 * - solid → volume-weighted centroid of its tetrahedra (apex at origin).
 */
export function centroid(geom: MeshComponentGeometry): THREE.Vector3 {
  const f = buildFeatures(geom);
  const acc = new THREE.Vector3();

  if (geom.topo === "vertex") {
    return f.points[0]?.clone() ?? acc;
  }

  if (geom.topo === "edge") {
    let total = 0;
    const mid = new THREE.Vector3();
    for (const [a, b] of f.segs) {
      const w = a.distanceTo(b);
      mid.addVectors(a, b).multiplyScalar(0.5);
      acc.addScaledVector(mid, w);
      total += w;
    }
    return total > 0 ? acc.multiplyScalar(1 / total) : acc;
  }

  if (geom.topo === "solid") {
    let vol6 = 0;
    const tetC = new THREE.Vector3();
    for (const [a, b, c] of f.tris) {
      const w = a.dot(_cross.crossVectors(b, c)); // 6× signed tet volume
      tetC.copy(a).add(b).add(c).multiplyScalar(0.25); // tet centroid (4th vertex = origin)
      acc.addScaledVector(tetC, w);
      vol6 += w;
    }
    return Math.abs(vol6) > 1e-12 ? acc.multiplyScalar(1 / vol6) : acc;
  }

  // face: area-weighted triangle centroids
  let area = 0;
  const triC = new THREE.Vector3();
  for (const [a, b, c] of f.tris) {
    _ab.subVectors(b, a);
    _ac.subVectors(c, a);
    const w = 0.5 * _cross.crossVectors(_ab, _ac).length();
    triC.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    acc.addScaledVector(triC, w);
    area += w;
  }
  return area > 0 ? acc.multiplyScalar(1 / area) : acc;
}

// ---------------------------------------------------------------------------
// Directions / normals (for angle)
// ---------------------------------------------------------------------------

/** Area-weighted average triangle normal of a face (unit length), or `null`. */
export function averageNormal(geom: MeshComponentGeometry): THREE.Vector3 | null {
  const acc = new THREE.Vector3();
  for (const [a, b, c] of buildFeatures(geom).tris) {
    _ab.subVectors(b, a);
    _ac.subVectors(c, a);
    acc.add(_cross.crossVectors(_ab, _ac)); // magnitude = 2× triangle area
  }
  return acc.lengthSq() > 1e-20 ? acc.normalize() : null;
}

/** Overall direction of an edge (first → last endpoint, unit length), or `null`. */
export function edgeDirection(geom: MeshComponentGeometry): THREE.Vector3 | null {
  const segs = buildFeatures(geom).segs;
  if (segs.length === 0) return null;
  const start = segs[0][0];
  const end = segs[segs.length - 1][1];
  const dir = new THREE.Vector3().subVectors(end, start);
  return dir.lengthSq() > 1e-20 ? dir.normalize() : null;
}

// ---------------------------------------------------------------------------
// Closest-point primitives (Ericson, Real-Time Collision Detection)
// ---------------------------------------------------------------------------

/** Closest point on segment [a,b] to point p, written into `out`. */
export function closestPointOnSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  _ab.subVectors(b, a);
  const t = _ab.lengthSq();
  if (t < 1e-20) return out.copy(a);
  const proj = _ac.subVectors(p, a).dot(_ab) / t;
  const clamped = Math.min(1, Math.max(0, proj));
  return out.copy(a).addScaledVector(_ab, clamped);
}

const _cpA = new THREE.Vector3();
const _cpB = new THREE.Vector3();

/** Closest point on triangle (a,b,c) to point p, written into `out` (Ericson §5.1.5). */
export function closestPointOnTriangle(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  const bp = new THREE.Vector3().subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(ab, v);
  }

  const cp = new THREE.Vector3().subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    // NOTE: a fresh vector, NOT the module scratch `_cpA` — `minDistance` passes
    // `_cpA` as `out`, so reusing it here aliases the output mid-expression and
    // returns garbage (~origin) whenever the closest point lands on edge BC.
    const bc = new THREE.Vector3().subVectors(c, b);
    return out.copy(b).addScaledVector(bc, w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.copy(a).addScaledVector(ab, v).addScaledVector(ac, w);
}

/**
 * Closest points between segments [p1,q1] and [p2,q2], written into `outA`/`outB`;
 * returns the squared distance (Ericson §5.1.9).
 */
export function closestSegmentSegment(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
  outA: THREE.Vector3,
  outB: THREE.Vector3,
): number {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  const EPS = 1e-20;

  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1.dot(r);
    if (e <= EPS) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  outA.copy(p1).addScaledVector(d1, s);
  outB.copy(p2).addScaledVector(d2, t);
  return outA.distanceToSquared(outB);
}

/**
 * Brute-force minimum distance between two components and the realizing points.
 * Evaluates every closest-feature pair, in BOTH argument orders, over the feature sets:
 * point-vs-triangle, point-vs-segment, segment-vs-segment, and point-vs-point. This is
 * the complete set of closest-feature pairs for triangle meshes and their lower-dim
 * degenerations (edges = segments, vertices = points), so the result is exact for the
 * mesh and independent of which component is passed first.
 *
 * O(Ta·Tb) — quadratic. {@link minDistance} is the production entry: it uses this
 * directly for small components and the BVH branch-and-bound above the pair threshold.
 * Kept exported as the reference oracle the BVH path is property-tested against.
 */
export function minDistanceBrute(
  ga: MeshComponentGeometry,
  gb: MeshComponentGeometry,
): { distance: number; point1: THREE.Vector3; point2: THREE.Vector3 } {
  const fa = buildFeatures(ga);
  const fb = buildFeatures(gb);
  let best = Infinity;
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();

  // Record a candidate pair; `aPt` is on ga, `bPt` on gb (so p1/p2 stay order-correct).
  const consider = (d2: number, aPt: THREE.Vector3, bPt: THREE.Vector3): void => {
    if (d2 < best) {
      best = d2;
      p1.copy(aPt);
      p2.copy(bPt);
    }
  };

  // point (ga) vs triangle (gb), and the mirror
  for (const pt of fa.points) {
    for (const [a, b, c] of fb.tris) {
      closestPointOnTriangle(pt, a, b, c, _cpB);
      consider(pt.distanceToSquared(_cpB), pt, _cpB);
    }
  }
  for (const pt of fb.points) {
    for (const [a, b, c] of fa.tris) {
      closestPointOnTriangle(pt, a, b, c, _cpA);
      consider(_cpA.distanceToSquared(pt), _cpA, pt);
    }
  }
  // point (ga) vs segment (gb), and the mirror — covers vertex-vs-edge-interior in
  // both orders (the case the previous guard-based version missed when ga was the edge)
  for (const pt of fa.points) {
    for (const [a, b] of fb.segs) {
      closestPointOnSegment(pt, a, b, _cpB);
      consider(pt.distanceToSquared(_cpB), pt, _cpB);
    }
  }
  for (const pt of fb.points) {
    for (const [a, b] of fa.segs) {
      closestPointOnSegment(pt, a, b, _cpA);
      consider(_cpA.distanceToSquared(pt), _cpA, pt);
    }
  }
  // segment vs segment (edge-edge, and triangle-edge pairs for faces)
  for (const [a1, b1] of fa.segs) {
    for (const [a2, b2] of fb.segs) {
      consider(closestSegmentSegment(a1, b1, a2, b2, _cpA, _cpB), _cpA, _cpB);
    }
  }

  // point vs point — the only matching pair when both sides are bare vertices
  if (fa.tris.length === 0 && fb.tris.length === 0) {
    for (const pa of fa.points) {
      for (const pb of fb.points) consider(pa.distanceToSquared(pb), pa, pb);
    }
  }

  return {
    distance: Number.isFinite(best) ? Math.sqrt(best) : 0,
    point1: p1,
    point2: p2,
  };
}

// ---------------------------------------------------------------------------
// BVH-accelerated minimum distance
//
// The brute force above is O(Ta·Tb): sphere-vs-sphere faces (5008 triangles each →
// 25M tri-pairs, 226M seg-pairs) freeze the viewer for >8 s on a click; a helix face
// for >1 min. This replaces it with an exact, sub-quadratic AABB-tree branch-and-bound.
//
// Each component reduces to a flat list of primitives — a face/solid to its triangles
// (a triangle-vs-triangle distance subsumes vertex-face AND edge-edge contact, so the
// separate segment loops vanish), an edge to its segments, a vertex to one point. One
// generic traversal dispatches a primitive×primitive distance by type, so every topo
// combination (face×face, face×edge, edge×edge, vertex×*) runs through the same pruned
// search; small components fall back to the proven brute oracle below the threshold.
// ---------------------------------------------------------------------------

const PRIM_TRI = 0;
const PRIM_SEG = 1;
const PRIM_PT = 2;
type PrimKind = typeof PRIM_TRI | typeof PRIM_SEG | typeof PRIM_PT;

/** Leaf primitive: a triangle (a,b,c), segment (a,b) or point (a), + its centroid. */
interface Prim {
  kind: PrimKind;
  a: THREE.Vector3;
  b: THREE.Vector3 | null;
  c: THREE.Vector3 | null;
  cx: number;
  cy: number;
  cz: number;
}

/** AABB tree node: a leaf carries `prims`, an internal node carries `left`/`right`. */
interface BVHNode {
  minx: number;
  miny: number;
  minz: number;
  maxx: number;
  maxy: number;
  maxz: number;
  left: BVHNode | null;
  right: BVHNode | null;
  prims: Prim[] | null;
}

/** Primitives per leaf; small enough that leaf-leaf brute is cheap, big enough to keep
 *  the tree shallow. */
const BVH_LEAF_SIZE = 8;
/** Below this many primitive pairs, skip the tree (build overhead > savings) and use the
 *  brute oracle directly. ≈ a few leaves per side (BVH_LEAF_SIZE² = 64 is one leaf-leaf);
 *  a one-shot click query, so the bar to bother building a tree is low. */
const BVH_BRUTE_PAIR_THRESHOLD = 8192;

function makeTri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): Prim {
  return {
    kind: PRIM_TRI,
    a,
    b,
    c,
    cx: (a.x + b.x + c.x) / 3,
    cy: (a.y + b.y + c.y) / 3,
    cz: (a.z + b.z + c.z) / 3,
  };
}

function makeSeg(a: THREE.Vector3, b: THREE.Vector3): Prim {
  return {
    kind: PRIM_SEG,
    a,
    b,
    c: null,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    cz: (a.z + b.z) / 2,
  };
}

function makePt(a: THREE.Vector3): Prim {
  return { kind: PRIM_PT, a, b: null, c: null, cx: a.x, cy: a.y, cz: a.z };
}

/**
 * Reduce a component to its distance primitives, extracted DIRECTLY from the geometry
 * (face/solid → triangles, edge → segments, vertex → point; a face with no indices
 * degrades to a point cloud). NOT via {@link buildFeatures}: the BVH face path needs
 * only the triangles, but buildFeatures also materializes the 3-per-triangle segment
 * list and a deduped point set — ~3× the allocation, all discarded here. That waste is
 * invisible on small models but dominates at the ~100k-triangle helix scale, so this
 * builds only the primitives the tree consumes.
 */
function primReduce(geom: MeshComponentGeometry): Prim[] {
  const p = geom.positions;
  const prims: Prim[] = [];
  if (geom.topo === "edge") {
    // 6 floats per segment (endpoint pair)
    for (let i = 0; i + 5 < p.length; i += 6) {
      prims.push(
        makeSeg(
          new THREE.Vector3(p[i], p[i + 1], p[i + 2]),
          new THREE.Vector3(p[i + 3], p[i + 4], p[i + 5]),
        ),
      );
    }
    return prims;
  }
  if (geom.topo === "vertex") {
    prims.push(makePt(new THREE.Vector3(p[0], p[1], p[2])));
    return prims;
  }
  // face / solid → triangles only
  const idx = geom.indices;
  if (idx === undefined) {
    for (let i = 0; i + 2 < p.length; i += 3) {
      prims.push(makePt(new THREE.Vector3(p[i], p[i + 1], p[i + 2])));
    }
    return prims;
  }
  // shared vertex pool; triangles index into it (vertices reused across triangles)
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < p.length; i += 3) {
    verts.push(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
  }
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = verts[idx[t]];
    const b = verts[idx[t + 1]];
    const c = verts[idx[t + 2]];
    if (a === undefined || b === undefined || c === undefined) continue;
    prims.push(makeTri(a, b, c));
  }
  return prims;
}

/** Centroid coordinate of `p` on axis 0=x / 1=y / 2=z (branch, not dynamic key lookup —
 *  this is the quickselect comparison hot path). */
function centroidOnAxis(p: Prim, axis: number): number {
  return axis === 0 ? p.cx : axis === 1 ? p.cy : p.cz;
}

// Split threshold on the chosen axis, produced by boundRange and consumed by buildRange
// (single-threaded build → read immediately after boundRange, before any recursion).
let _bvhSplit = 0;

/**
 * Bound the primitives `order[lo..hi)` index into `prims`: set `node`'s vertex AABB and
 * return the longest centroid axis (0/1/2) for the split — both in ONE pass. Also stashes
 * the spatial-median split threshold for that axis into `_bvhSplit`.
 */
function boundRange(
  node: BVHNode,
  prims: Prim[],
  order: Uint32Array,
  lo: number,
  hi: number,
): number {
  let minx = Infinity;
  let miny = Infinity;
  let minz = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  let maxz = -Infinity;
  let cminx = Infinity;
  let cminy = Infinity;
  let cminz = Infinity;
  let cmaxx = -Infinity;
  let cmaxy = -Infinity;
  let cmaxz = -Infinity;
  const grow = (v: THREE.Vector3): void => {
    if (v.x < minx) minx = v.x;
    if (v.y < miny) miny = v.y;
    if (v.z < minz) minz = v.z;
    if (v.x > maxx) maxx = v.x;
    if (v.y > maxy) maxy = v.y;
    if (v.z > maxz) maxz = v.z;
  };
  for (let i = lo; i < hi; i++) {
    const p = prims[order[i]];
    if (p.cx < cminx) cminx = p.cx;
    if (p.cy < cminy) cminy = p.cy;
    if (p.cz < cminz) cminz = p.cz;
    if (p.cx > cmaxx) cmaxx = p.cx;
    if (p.cy > cmaxy) cmaxy = p.cy;
    if (p.cz > cmaxz) cmaxz = p.cz;
    grow(p.a);
    if (p.b !== null) grow(p.b);
    if (p.c !== null) grow(p.c);
  }
  node.minx = minx;
  node.miny = miny;
  node.minz = minz;
  node.maxx = maxx;
  node.maxy = maxy;
  node.maxz = maxz;
  const ex = cmaxx - cminx;
  const ey = cmaxy - cminy;
  const ez = cmaxz - cminz;
  const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
  // split threshold = midpoint of the centroid extent on the chosen axis (the spatial
  // median). Stashed for buildRange to read before any recursion overwrites it.
  _bvhSplit =
    axis === 0
      ? (cminx + cmaxx) / 2
      : axis === 1
        ? (cminy + cmaxy) / 2
        : (cminz + cmaxz) / 2;
  return axis;
}

/** Build a subtree over the primitives `order[lo..hi)` index into `prims`. */
function buildRange(
  prims: Prim[],
  order: Uint32Array,
  lo: number,
  hi: number,
): BVHNode {
  const node: BVHNode = {
    minx: 0,
    miny: 0,
    minz: 0,
    maxx: 0,
    maxy: 0,
    maxz: 0,
    left: null,
    right: null,
    prims: null,
  };
  const axis = boundRange(node, prims, order, lo, hi);
  if (hi - lo <= BVH_LEAF_SIZE) {
    // materialize just this leaf's ≤ BVH_LEAF_SIZE primitives
    const leaf: Prim[] = [];
    for (let i = lo; i < hi; i++) leaf.push(prims[order[i]]);
    node.prims = leaf;
    return node;
  }
  // Partition order[lo..hi) in place around the spatial-median threshold on `axis`:
  // centroids below it move left, the rest stay right. A single O(n) pass with a FIXED
  // threshold — no sort, and no data-dependent pivot that could scan past the range.
  const split = _bvhSplit;
  let m = lo;
  for (let i = lo; i < hi; i++) {
    if (centroidOnAxis(prims[order[i]], axis) < split) {
      const t = order[m];
      order[m] = order[i];
      order[i] = t;
      m++;
    }
  }
  // Degenerate cluster (everything on one side of the midpoint, incl. zero centroid
  // extent) → split by count so the range still shrinks → recursion always terminates.
  if (m === lo || m === hi) m = (lo + hi) >> 1;
  node.left = buildRange(prims, order, lo, m);
  node.right = buildRange(prims, order, m, hi);
  return node;
}

/** Build an AABB tree over `prims` (spatial-median split on the longest centroid axis).
 *  Works over an index permutation so internal nodes neither sort nor allocate. */
function buildBVH(prims: Prim[]): BVHNode {
  const order = new Uint32Array(prims.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  return buildRange(prims, order, 0, prims.length);
}

/** Squared distance between two AABBs (0 if they overlap). */
function boxBoxDistSq(n: BVHNode, m: BVHNode): number {
  let s = 0;
  let d = m.minx - n.maxx;
  if (d > 0) s += d * d;
  else {
    d = n.minx - m.maxx;
    if (d > 0) s += d * d;
  }
  d = m.miny - n.maxy;
  if (d > 0) s += d * d;
  else {
    d = n.miny - m.maxy;
    if (d > 0) s += d * d;
  }
  d = m.minz - n.maxz;
  if (d > 0) s += d * d;
  else {
    d = n.minz - m.maxz;
    if (d > 0) s += d * d;
  }
  return s;
}

/** Squared length of an AABB's diagonal (used to pick which node to descend). */
function boxDiagSq(n: BVHNode): number {
  const dx = n.maxx - n.minx;
  const dy = n.maxy - n.miny;
  const dz = n.maxz - n.minz;
  return dx * dx + dy * dy + dz * dz;
}

// Scratch for the primitive×primitive helpers — DISTINCT from `_cpA`/`_cpB` (which the
// traversal passes as the out buffers), so an inner helper never clobbers the output.
const _pdA = new THREE.Vector3();
const _pdB = new THREE.Vector3();

/**
 * Minimum squared distance between triangle (ta,tb,tc) and segment (sa,sb), with the
 * realizing points (on the triangle → `outTri`, on the segment → `outSeg`). Complete
 * set: each segment endpoint vs the triangle (covers face interior + edges + vertices)
 * and each triangle edge vs the segment.
 */
export function triSegDistance(
  ta: THREE.Vector3,
  tb: THREE.Vector3,
  tc: THREE.Vector3,
  sa: THREE.Vector3,
  sb: THREE.Vector3,
  outTri: THREE.Vector3,
  outSeg: THREE.Vector3,
): number {
  let best = Infinity;
  closestPointOnTriangle(sa, ta, tb, tc, _pdA);
  let d = _pdA.distanceToSquared(sa);
  if (d < best) {
    best = d;
    outTri.copy(_pdA);
    outSeg.copy(sa);
  }
  closestPointOnTriangle(sb, ta, tb, tc, _pdA);
  d = _pdA.distanceToSquared(sb);
  if (d < best) {
    best = d;
    outTri.copy(_pdA);
    outSeg.copy(sb);
  }
  const edges: [THREE.Vector3, THREE.Vector3][] = [
    [ta, tb],
    [tb, tc],
    [tc, ta],
  ];
  for (const [e0, e1] of edges) {
    d = closestSegmentSegment(e0, e1, sa, sb, _pdA, _pdB);
    if (d < best) {
      best = d;
      outTri.copy(_pdA);
      outSeg.copy(_pdB);
    }
  }
  return best;
}

/**
 * Minimum squared distance between triangles (a0,a1,a2) and (b0,b1,b2), with the
 * realizing points (`outA` on the first, `outB` on the second). Complete set for
 * disjoint triangles: each vertex vs the other triangle, plus all 9 edge-edge pairs.
 * (Interpenetrating triangles can report a small positive value rather than 0 — the
 * same limitation the brute oracle has, and irrelevant for distance between surfaces.)
 */
export function triTriDistance(
  a0: THREE.Vector3,
  a1: THREE.Vector3,
  a2: THREE.Vector3,
  b0: THREE.Vector3,
  b1: THREE.Vector3,
  b2: THREE.Vector3,
  outA: THREE.Vector3,
  outB: THREE.Vector3,
): number {
  let best = Infinity;
  const va: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [a0, a1, a2];
  const vb: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [b0, b1, b2];
  for (const v of va) {
    closestPointOnTriangle(v, b0, b1, b2, _pdA);
    const d = v.distanceToSquared(_pdA);
    if (d < best) {
      best = d;
      outA.copy(v);
      outB.copy(_pdA);
    }
  }
  for (const v of vb) {
    closestPointOnTriangle(v, a0, a1, a2, _pdA);
    const d = v.distanceToSquared(_pdA);
    if (d < best) {
      best = d;
      outA.copy(_pdA);
      outB.copy(v);
    }
  }
  for (let i = 0; i < 3; i++) {
    const p0 = va[i];
    const p1 = va[(i + 1) % 3];
    for (let j = 0; j < 3; j++) {
      const d = closestSegmentSegment(p0, p1, vb[j], vb[(j + 1) % 3], _pdA, _pdB);
      if (d < best) {
        best = d;
        outA.copy(_pdA);
        outB.copy(_pdB);
      }
    }
  }
  return best;
}

/** Minimum squared distance between two primitives, dispatched by kind; closest points
 *  written to `outA` (on `pa`) / `outB` (on `pb`). */
function primDistance(
  pa: Prim,
  pb: Prim,
  outA: THREE.Vector3,
  outB: THREE.Vector3,
): number {
  if (pa.kind === PRIM_TRI) {
    if (pb.kind === PRIM_TRI) {
      return triTriDistance(pa.a, pa.b!, pa.c!, pb.a, pb.b!, pb.c!, outA, outB);
    }
    if (pb.kind === PRIM_SEG) {
      return triSegDistance(pa.a, pa.b!, pa.c!, pb.a, pb.b!, outA, outB);
    }
    closestPointOnTriangle(pb.a, pa.a, pa.b!, pa.c!, outA);
    outB.copy(pb.a);
    return outA.distanceToSquared(pb.a);
  }
  if (pa.kind === PRIM_SEG) {
    if (pb.kind === PRIM_TRI) {
      // triangle is pb → its realizing point is outB, the segment's is outA
      return triSegDistance(pb.a, pb.b!, pb.c!, pa.a, pa.b!, outB, outA);
    }
    if (pb.kind === PRIM_SEG) {
      return closestSegmentSegment(pa.a, pa.b!, pb.a, pb.b!, outA, outB);
    }
    closestPointOnSegment(pb.a, pa.a, pa.b!, outA);
    outB.copy(pb.a);
    return outA.distanceToSquared(pb.a);
  }
  // pa is a point
  if (pb.kind === PRIM_TRI) {
    closestPointOnTriangle(pa.a, pb.a, pb.b!, pb.c!, outB);
    outA.copy(pa.a);
    return outB.distanceToSquared(pa.a);
  }
  if (pb.kind === PRIM_SEG) {
    closestPointOnSegment(pa.a, pb.a, pb.b!, outB);
    outA.copy(pa.a);
    return outB.distanceToSquared(pa.a);
  }
  outA.copy(pa.a);
  outB.copy(pb.a);
  return pa.a.distanceToSquared(pb.a);
}

/** Mutable best-so-far carried through the branch-and-bound recursion. */
interface BVHBest {
  d2: number;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
}

/** Branch-and-bound descent over node pairs: prune any pair whose box-box distance is
 *  already ≥ the best found, and visit the closer child first so `best` tightens early. */
function bvhTraverse(na: BVHNode, nb: BVHNode, best: BVHBest): void {
  if (boxBoxDistSq(na, nb) >= best.d2) return;
  if (na.prims !== null && nb.prims !== null) {
    for (const pa of na.prims) {
      for (const pb of nb.prims) {
        const d = primDistance(pa, pb, _cpA, _cpB);
        if (d < best.d2) {
          best.d2 = d;
          best.p1.copy(_cpA);
          best.p2.copy(_cpB);
        }
      }
    }
    return;
  }
  let splitA: boolean;
  if (na.prims !== null) splitA = false;
  else if (nb.prims !== null) splitA = true;
  else splitA = boxDiagSq(na) >= boxDiagSq(nb);
  if (splitA) {
    const l = na.left!;
    const r = na.right!;
    if (boxBoxDistSq(l, nb) <= boxBoxDistSq(r, nb)) {
      bvhTraverse(l, nb, best);
      bvhTraverse(r, nb, best);
    } else {
      bvhTraverse(r, nb, best);
      bvhTraverse(l, nb, best);
    }
  } else {
    const l = nb.left!;
    const r = nb.right!;
    if (boxBoxDistSq(na, l) <= boxBoxDistSq(na, r)) {
      bvhTraverse(na, l, best);
      bvhTraverse(na, r, best);
    } else {
      bvhTraverse(na, r, best);
      bvhTraverse(na, l, best);
    }
  }
}

/**
 * Minimum distance between two components and the realizing points — the production
 * entry. Exact and sub-quadratic via a per-component AABB tree + branch-and-bound
 * (see {@link minDistanceBrute} for the O(Ta·Tb) reference it is property-tested
 * against, and which it delegates to for small inputs). Result is identical to the
 * brute force and independent of argument order.
 */
export function minDistance(
  ga: MeshComponentGeometry,
  gb: MeshComponentGeometry,
): { distance: number; point1: THREE.Vector3; point2: THREE.Vector3 } {
  const pa = primReduce(ga);
  const pb = primReduce(gb);
  if (pa.length * pb.length <= BVH_BRUTE_PAIR_THRESHOLD) {
    return minDistanceBrute(ga, gb);
  }
  const ta = buildBVH(pa);
  const tb = buildBVH(pb);
  const best: BVHBest = {
    d2: Infinity,
    p1: new THREE.Vector3(),
    p2: new THREE.Vector3(),
  };
  bvhTraverse(ta, tb, best);

  return {
    distance: Number.isFinite(best.d2) ? Math.sqrt(best.d2) : 0,
    point1: best.p1,
    point2: best.p2,
  };
}

// ---------------------------------------------------------------------------
// Angles
// ---------------------------------------------------------------------------

const _UP = new THREE.Vector3(0, 0, 1);

/** Angle (degrees) between two unit directions. */
export function angleBetween(d1: THREE.Vector3, d2: THREE.Vector3): number {
  const c = Math.min(1, Math.max(-1, d1.dot(d2)));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * Angle (degrees) of a face normal or edge tangent to the world XY plane (+Z up),
 * mirroring `measure.py` `angle to XY`: for a face normal, the angle to +Z; for an edge
 * direction `abs(90 − angle(dir, +Z))`.
 */
export function angleToXY(dir: THREE.Vector3, isEdge: boolean): number {
  const a = angleBetween(dir, _UP);
  return isEdge ? Math.abs(90 - a) : a;
}

// ---------------------------------------------------------------------------
// MeshGeometrySource — populated at tessellation, resolves a backend path
// ---------------------------------------------------------------------------

/** Raw per-node tessellation arrays the source needs (subset of `Shape`). */
export interface RawNodeShape {
  vertices?: number[] | number[][] | Float32Array | undefined;
  triangles?: number[] | number[][] | Uint32Array | undefined;
  triangles_per_face?: number[] | Uint32Array | undefined;
  edges?: number[] | number[][] | Float32Array | undefined;
  segments_per_edge?: number[] | Uint32Array | undefined;
  obj_vertices?: number[] | Float32Array | undefined;
  face_types?: number[] | Uint32Array | undefined;
  edge_types?: number[] | Uint8Array | Uint32Array | undefined;
}

interface MeshNodeEntry {
  shape: RawNodeShape;
  /** Object whose `matrixWorld` maps the node's local geometry into world space. */
  object: THREE.Object3D;
  subtype: string | null;
}

const _PATH_RE = /^(.*)\/(faces|edges|vertices)\/(?:faces|edges|vertices)_(\d+)$/;

function toF32(
  a: number[] | number[][] | Float32Array | undefined,
): Float32Array {
  if (a === undefined) return new Float32Array(0);
  if (a instanceof Float32Array) return a;
  if (Array.isArray(a) && Array.isArray(a[0])) {
    const flat: number[] = [];
    for (const row of a as number[][]) flat.push(...row);
    return Float32Array.from(flat);
  }
  return Float32Array.from(a as number[]);
}

/** Apply a Matrix4 to a flat xyz array, returning a new world-space Float32Array. */
function transformPoints(local: Float32Array, m: THREE.Matrix4): Float32Array {
  const out = new Float32Array(local.length);
  const v = new THREE.Vector3();
  for (let i = 0; i + 2 < local.length; i += 3) {
    v.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(m);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  return out;
}

/**
 * Populated as the compact `NestedGroup` tessellates each node (faces/edges/vertices),
 * keyed by the node's `/`-path — the SAME paths the `ComponentRegistry` uses, so a
 * backend component id resolves directly. Mode-independent: it stores the raw per-node
 * arrays + the owning group (for `matrixWorld`) and slices/transforms on demand.
 */
export class MeshGeometrySource implements MeshGeometryProvider {
  private nodes: Map<string, MeshNodeEntry>;

  constructor() {
    this.nodes = new Map();
  }

  /** Record a node's raw tessellation arrays. `object` provides the world transform. */
  register(
    path: string,
    shape: RawNodeShape,
    object: THREE.Object3D,
    subtype: string | null,
  ): void {
    this.nodes.set(path, { shape, object, subtype });
  }

  /** Drop all entries (called from `NestedGroup.clear`/`dispose`). */
  clear(): void {
    this.nodes.clear();
  }

  /**
   * Static face/edge counts of a node from its tessellation type arrays
   * (`len(face_types)` / `len(edge_types)`). For a solid node these are the solid's
   * total face/edge counts. `null` for an unknown node.
   */
  nodeCounts(path: string): { faces: number; edges: number } | null {
    const entry = this.nodes.get(path);
    if (entry === undefined) return null;
    const ft = entry.shape.face_types;
    const et = entry.shape.edge_types;
    return { faces: ft?.length ?? 0, edges: et?.length ?? 0 };
  }

  resolve(path: string): MeshComponentGeometry | null {
    const m = path.match(_PATH_RE);
    const nodePath = m === null ? path : m[1];
    const kind = m === null ? "solid" : m[2];
    const index = m === null ? -1 : parseInt(m[3], 10);

    const entry = this.nodes.get(nodePath);
    if (entry === undefined) return null;

    entry.object.updateWorldMatrix(true, false);
    const world = entry.object.matrixWorld;
    const shape = entry.shape;

    if (kind === "vertices") {
      const all = toF32(shape.obj_vertices);
      if (index * 3 + 2 >= all.length) return null;
      const local = all.slice(index * 3, index * 3 + 3);
      return { topo: "vertex", geomType: -1, positions: transformPoints(local, world) };
    }

    if (kind === "edges") {
      const local = this._edgeSegments(shape, index);
      if (local === null) return null;
      const geomType = this._typeAt(shape.edge_types, index);
      return { topo: "edge", geomType, positions: transformPoints(local, world) };
    }

    // faces / solid — vertex pool + triangle index slice
    const poolLocal = toF32(shape.vertices);
    if (poolLocal.length === 0) return null;
    const positions = transformPoints(poolLocal, world);

    if (kind === "solid") {
      const indices = this._allTriangleIndices(shape);
      return { topo: "solid", geomType: -1, positions, indices };
    }

    const indices = this._faceTriangleIndices(shape, index);
    if (indices === null) return null;
    const geomType = this._typeAt(shape.face_types, index);
    return { topo: "face", geomType, positions, indices };
  }

  private _typeAt(
    types: number[] | Uint8Array | Uint32Array | undefined,
    i: number,
  ): number {
    return types !== undefined && i >= 0 && i < types.length ? types[i] : -1;
  }

  /** Index triples for face `i` into the vertex pool (flat-with-counts or nested). */
  private _faceTriangleIndices(
    shape: RawNodeShape,
    face: number,
  ): Uint32Array | null {
    const tris = shape.triangles;
    if (tris === undefined) return null;
    if (Array.isArray(tris) && Array.isArray(tris[0])) {
      const nested = tris as number[][];
      return face < nested.length ? Uint32Array.from(nested[face]) : null;
    }
    const flat = tris as Uint32Array | number[];
    const tpf = shape.triangles_per_face;
    if (tpf === undefined) {
      return face === 0 ? Uint32Array.from(flat) : null; // single face
    }
    let start = 0;
    for (let f = 0; f < face; f++) start += tpf[f] * 3;
    if (face >= tpf.length) return null;
    const count = tpf[face] * 3;
    const out = new Uint32Array(count);
    for (let k = 0; k < count; k++) out[k] = flat[start + k];
    return out;
  }

  /** All triangle index triples (every face) for a solid. */
  private _allTriangleIndices(shape: RawNodeShape): Uint32Array {
    const tris = shape.triangles;
    if (tris === undefined) return new Uint32Array(0);
    if (Array.isArray(tris) && Array.isArray(tris[0])) {
      const flat: number[] = [];
      for (const face of tris as number[][]) flat.push(...face);
      return Uint32Array.from(flat);
    }
    return tris instanceof Uint32Array ? tris : Uint32Array.from(tris as number[]);
  }

  /** World-local segment endpoint pairs (6 floats/segment) for edge `i`. */
  private _edgeSegments(shape: RawNodeShape, edge: number): Float32Array | null {
    const edges = shape.edges;
    if (edges === undefined) return null;
    const spe = shape.segments_per_edge;
    if (spe !== undefined) {
      // segments_per_edge is authoritative: `edges` is one flat point stream
      // (2 points / 6 floats per segment) and `spe` partitions it. `toF32` flattens
      // BOTH a flat array and a nested array — note some tessellations (e.g. rc.js)
      // store `edges` as a nested list of individual [x,y,z] points, NOT one array
      // per edge, so the old `nested[edge]` returned a single point. Slice by `spe`.
      if (edge >= spe.length) return null;
      const flat = toF32(edges);
      let start = 0;
      for (let e = 0; e < edge; e++) start += spe[e] * 6;
      return flat.slice(start, start + spe[edge] * 6);
    }
    // No counts: a nested array is one edge's flat points per entry; a flat array is
    // a single edge.
    if (Array.isArray(edges) && Array.isArray(edges[0])) {
      const nested = edges as number[][];
      return edge < nested.length ? Float32Array.from(nested[edge]) : null;
    }
    return edge === 0 ? toF32(edges) : null;
  }
}

// ---------------------------------------------------------------------------
// MeshMeasureBackend — assembles Distance/Properties responses
// ---------------------------------------------------------------------------

const SHAPE_TYPE_LABEL: Record<TopoType, string> = {
  face: "Face",
  edge: "Edge",
  vertex: "Vertex",
  solid: "Solid",
};

/** geom_type name for a resolved component. */
function geomTypeName(geom: MeshComponentGeometry): string {
  if (geom.topo === "face") return faceGeomType(geom.geomType);
  if (geom.topo === "edge") return edgeGeomType(geom.geomType);
  if (geom.topo === "vertex") return "Point";
  return "Other";
}

/** Unit direction (face normal / edge tangent) + reference label, or null. */
function directionOf(
  geom: MeshComponentGeometry,
): { dir: THREE.Vector3; isEdge: boolean; label: string } | null {
  if (geom.topo === "face" || geom.topo === "solid") {
    // A closed solid has no single direction: its area-weighted normal sums to ~0,
    // so averageNormal returns null and a distance involving a solid omits the angle
    // block (intended — there is no meaningful solid-to-X angle).
    const n = averageNormal(geom);
    return n === null
      ? null
      : { dir: n, isEdge: false, label: "face normal" };
  }
  if (geom.topo === "edge") {
    const d = edgeDirection(geom);
    return d === null ? null : { dir: d, isEdge: true, label: "line" };
  }
  return null;
}

/**
 * Computes measurement responses from the mesh (no external Python backend). The
 * default measurement backend when `externalMeasurementBackend === false`. Returns a
 * `ToolResponse` ready for `viewer.handleBackendResponse`, or `null` if a component
 * can't be resolved (caller leaves the panel unanswered, same as a backend timeout).
 */
export class MeshMeasureBackend {
  constructor(private getProvider: () => MeshGeometryProvider | null) {}

  /** PropertiesMeasurement response for a single component. */
  properties(path: string): MeasureResponse | null {
    const provider = this.getProvider();
    const geom = provider?.resolve(path) ?? null;
    if (geom === null) return null;

    const refpoint = centroid(geom);
    const result: Record<string, unknown>[] = [];

    if (geom.topo === "vertex") {
      result.push({ xyz: refpoint.toArray() });
    } else if (geom.topo === "edge") {
      result.push({ center: refpoint.toArray() });
      const meas: Record<string, unknown> = { length: polylineLength(geom) };
      const d = edgeDirection(geom);
      if (d !== null) meas["angle to XY"] = angleToXY(d, true);
      result.push(meas);
      result.push({ bb: boundingBox(geom) });
    } else if (geom.topo === "face") {
      result.push({ center: refpoint.toArray() });
      const meas: Record<string, unknown> = { area: triangulatedArea(geom) };
      const n = averageNormal(geom);
      if (n !== null) meas["angle to XY"] = angleToXY(n, false);
      result.push(meas);
      result.push({ bb: boundingBox(geom) });
    } else {
      result.push({ volume: meshVolume(geom) });
      result.push({ bb: boundingBox(geom) });
    }

    return {
      type: "backend_response",
      subtype: "tool_response",
      tool_type: "PropertiesMeasurement",
      meshBased: true,
      shape_type: SHAPE_TYPE_LABEL[geom.topo],
      geom_type: geomTypeName(geom),
      refpoint: refpoint.toArray(),
      result,
    };
  }

  /** DistanceMeasurement response between two components. */
  distance(path1: string, path2: string, center: boolean): MeasureResponse | null {
    const provider = this.getProvider();
    const g1 = provider?.resolve(path1) ?? null;
    const g2 = provider?.resolve(path2) ?? null;
    if (g1 === null || g2 === null) return null;

    let p1: THREE.Vector3;
    let p2: THREE.Vector3;
    let distance: number;
    if (center) {
      p1 = centroid(g1);
      p2 = centroid(g2);
      distance = p1.distanceTo(p2);
    } else {
      const r = minDistance(g1, g2);
      p1 = r.point1;
      p2 = r.point2;
      distance = r.distance;
    }

    const result: Record<string, unknown>[] = [
      {
        distance,
        "⇒ X | Y | Z": [
          Math.abs(p2.x - p1.x),
          Math.abs(p2.y - p1.y),
          Math.abs(p2.z - p1.z),
        ],
        info: center ? "center" : "min",
      },
      { "point 1": p1.toArray(), "point 2": p2.toArray() },
    ];

    const d1 = directionOf(g1);
    const d2 = directionOf(g2);
    if (d1 !== null && d2 !== null) {
      let angle = angleBetween(d1.dir, d2.dir);
      // edge-vs-face: tangent-vs-normal → convert to edge-to-surface angle
      if (d1.isEdge !== d2.isEdge) angle = Math.abs(90 - angle);
      result.push({
        angle,
        "reference 1": d1.label,
        "reference 2": d2.label,
      });
    }

    return {
      type: "backend_response",
      subtype: "tool_response",
      tool_type: "DistanceMeasurement",
      meshBased: true,
      refpoint1: p1.toArray(),
      refpoint2: p2.toArray(),
      result,
    };
  }
}
