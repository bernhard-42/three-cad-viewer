import { describe, test, expect } from "vitest";
import * as THREE from "three";
import {
  SURFACE_TYPE_NAMES,
  CURVE_TYPE_NAMES,
  faceGeomType,
  edgeGeomType,
  buildFeatures,
  triangulatedArea,
  polylineLength,
  meshVolume,
  boundingBox,
  centroid,
  averageNormal,
  edgeDirection,
  closestPointOnSegment,
  closestPointOnTriangle,
  closestSegmentSegment,
  minDistance,
  minDistanceBrute,
  triSegDistance,
  triTriDistance,
  angleBetween,
  angleToXY,
  circleFromPolyline,
  MeshMeasureBackend,
} from "../../src/tools/cad_tools/mesh-measure.js";

// A unit cube spanning [0,2]^3 → volume 8, total surface area 24, each face area 4.
// 8 corner vertices, 12 triangles (2 per face), CCW outward winding.
function cube() {
  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 0,  2, 0, 0,  2, 2, 0,  0, 2, 0, // z=0 (bottom)
    0, 0, 2,  2, 0, 2,  2, 2, 2,  0, 2, 2, // z=2 (top)
  ]);
  // outward-facing triangles
  // prettier-ignore
  const indices = new Uint32Array([
    0, 3, 2,  0, 2, 1, // bottom (z=0), normal -Z
    4, 5, 6,  4, 6, 7, // top (z=2), normal +Z
    0, 1, 5,  0, 5, 4, // front (y=0), normal -Y
    2, 3, 7,  2, 7, 6, // back (y=2), normal +Y
    1, 2, 6,  1, 6, 5, // right (x=2), normal +X
    0, 4, 7,  0, 7, 3, // left (x=0), normal -X
  ]);
  return { topo: "solid", geomType: -1, positions, indices };
}

// A single square face in the z=5 plane, 2×2 → area 4, normal +Z.
function squareFace() {
  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 5,  2, 0, 5,  2, 2, 5,  0, 2, 5,
  ]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { topo: "face", geomType: 0, positions, indices };
}

// An edge polyline: two segments along +X from (0,0,0) to (3,0,0) → length 3.
function edge() {
  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 0,  1, 0, 0,
    1, 0, 0,  3, 0, 0,
  ]);
  return { topo: "edge", geomType: 0, positions };
}

function vertexAt(x, y, z) {
  return { topo: "vertex", geomType: -1, positions: new Float32Array([x, y, z]) };
}

describe("mesh-measure: geom_type tables", () => {
  test("surface/curve ordinals map to the OCCT GeomAbs names", () => {
    expect(SURFACE_TYPE_NAMES[0]).toBe("Plane");
    expect(SURFACE_TYPE_NAMES[1]).toBe("Cylinder");
    expect(CURVE_TYPE_NAMES[0]).toBe("Line");
    expect(CURVE_TYPE_NAMES[1]).toBe("Circle");
    expect(faceGeomType(3)).toBe("Sphere");
    expect(edgeGeomType(2)).toBe("Ellipse");
  });

  test("unknown codes fall back to Other", () => {
    expect(faceGeomType(99)).toBe("Other");
    expect(edgeGeomType(99)).toBe("Other");
  });
});

describe("mesh-measure: buildFeatures", () => {
  test("face yields vertices, triangles and triangle edges", () => {
    const f = buildFeatures(squareFace());
    expect(f.points.length).toBe(4);
    expect(f.tris.length).toBe(2);
    expect(f.segs.length).toBe(6); // 3 edges per triangle
  });

  test("edge yields endpoint pairs as segments", () => {
    const f = buildFeatures(edge());
    expect(f.segs.length).toBe(2);
    expect(f.tris.length).toBe(0);
  });

  test("vertex yields a single point", () => {
    const f = buildFeatures(vertexAt(1, 2, 3));
    expect(f.points.length).toBe(1);
    expect(f.points[0].toArray()).toEqual([1, 2, 3]);
  });
});

describe("mesh-measure: scalar measurements", () => {
  test("face area = 4 for a 2×2 square", () => {
    expect(triangulatedArea(squareFace())).toBeCloseTo(4, 9);
  });

  test("cube total surface area = 24", () => {
    expect(triangulatedArea(cube())).toBeCloseTo(24, 9);
  });

  test("cube volume = 8 (divergence theorem)", () => {
    expect(meshVolume(cube())).toBeCloseTo(8, 9);
  });

  test("edge length = 3", () => {
    expect(polylineLength(edge())).toBeCloseTo(3, 9);
  });

  test("bounding box of the cube", () => {
    const bb = boundingBox(cube());
    expect(bb.min).toEqual([0, 0, 0]);
    expect(bb.max).toEqual([2, 2, 2]);
    expect(bb.center).toEqual([1, 1, 1]);
    expect(bb.size).toEqual([2, 2, 2]);
  });
});

describe("mesh-measure: centroids", () => {
  test("cube centroid is its center", () => {
    const c = centroid(cube());
    expect(c.x).toBeCloseTo(1, 6);
    expect(c.y).toBeCloseTo(1, 6);
    expect(c.z).toBeCloseTo(1, 6);
  });

  test("square face centroid is its center", () => {
    const c = centroid(squareFace());
    expect(c.x).toBeCloseTo(1, 9);
    expect(c.y).toBeCloseTo(1, 9);
    expect(c.z).toBeCloseTo(5, 9);
  });

  test("edge centroid is the length-weighted midpoint", () => {
    const c = centroid(edge());
    expect(c.x).toBeCloseTo(1.5, 9);
    expect(c.y).toBeCloseTo(0, 9);
  });

  test("vertex centroid is the point", () => {
    expect(centroid(vertexAt(7, 8, 9)).toArray()).toEqual([7, 8, 9]);
  });
});

describe("mesh-measure: directions", () => {
  test("square face normal is +Z", () => {
    const n = averageNormal(squareFace());
    expect(n.z).toBeCloseTo(1, 9);
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(0, 9);
  });

  test("edge direction is +X", () => {
    expect(edgeDirection(edge()).toArray()).toEqual([1, 0, 0]);
  });
});

describe("mesh-measure: closest-point primitives", () => {
  test("closest point on a segment clamps to the ends", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const out = new THREE.Vector3();
    closestPointOnSegment(new THREE.Vector3(1, 5, 0), a, b, out);
    expect(out.toArray()).toEqual([1, 0, 0]);
    closestPointOnSegment(new THREE.Vector3(-3, 0, 0), a, b, out);
    expect(out.toArray()).toEqual([0, 0, 0]);
  });

  test("closest point on a triangle (interior projection)", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const c = new THREE.Vector3(0, 2, 0);
    const out = new THREE.Vector3();
    closestPointOnTriangle(new THREE.Vector3(0.5, 0.5, 3), a, b, c, out);
    expect(out.x).toBeCloseTo(0.5, 9);
    expect(out.y).toBeCloseTo(0.5, 9);
    expect(out.z).toBeCloseTo(0, 9);
  });

  test("closest distance between two skew segments", () => {
    const oa = new THREE.Vector3();
    const ob = new THREE.Vector3();
    // segment along X at z=0, segment along Y at z=4 → distance 4
    const d2 = closestSegmentSegment(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, -1, 4),
      new THREE.Vector3(0, 1, 4),
      oa,
      ob,
    );
    expect(Math.sqrt(d2)).toBeCloseTo(4, 9);
  });
});

describe("mesh-measure: min distance", () => {
  test("vertex to vertex", () => {
    const r = minDistance(vertexAt(0, 0, 0), vertexAt(0, 0, 5));
    expect(r.distance).toBeCloseTo(5, 9);
  });

  test("vertex to face (point above the square)", () => {
    const r = minDistance(vertexAt(1, 1, 5 + 3), squareFace());
    expect(r.distance).toBeCloseTo(3, 9);
  });

  test("two parallel faces", () => {
    const top = squareFace(); // z=5
    const r = minDistance(cube(), top); // cube top z=2 → gap 3
    expect(r.distance).toBeCloseTo(3, 6);
  });

  test("vertex projects onto edge interior — both argument orders (BLOCKER fix)", () => {
    // edge along +X from (0,0,0)→(3,0,0); vertex at (1.5,4,0) projects to (1.5,0,0) → 4
    const v = vertexAt(1.5, 4, 0);
    const rEdgeFirst = minDistance(edge(), v); // edge as FIRST arg (previously wrong)
    const rVertFirst = minDistance(v, edge());
    expect(rEdgeFirst.distance).toBeCloseTo(4, 9);
    expect(rVertFirst.distance).toBeCloseTo(4, 9);
    // realizing point on the edge is the interior projection, order-correct
    expect(rEdgeFirst.point1.x).toBeCloseTo(1.5, 9);
    expect(rEdgeFirst.point1.y).toBeCloseTo(0, 9);
    expect(rVertFirst.point2.x).toBeCloseTo(1.5, 9);
  });

  test("edge to edge (skew)", () => {
    const e1 = edge(); // along X at y=0,z=0
    const e2 = { topo: "edge", geomType: 0, positions: new Float32Array([0, 5, 0, 3, 5, 0]) };
    expect(minDistance(e1, e2).distance).toBeCloseTo(5, 9);
  });
});

// ---------------------------------------------------------------------------
// BVH minDistance: property-tested == the brute oracle, across topo combos.
// Inputs are sized so the primitive-pair count exceeds BVH_BRUTE_PAIR_THRESHOLD
// (8192) → the BVH branch-and-bound runs (not the small-input brute fallback).
// ---------------------------------------------------------------------------

// Deterministic PRNG (mulberry32) so failures reproduce.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n random triangles (a soup — adversarial for the BVH), each within `spread` of the
// centre. topo "face": positions = 9 floats/tri, indices = 0,1,2,…,3n-1.
function randomFace(rand, n, cx, cy, cz, spread) {
  const positions = new Float32Array(n * 9);
  const indices = new Uint32Array(n * 3);
  const ctr = [cx, cy, cz];
  for (let i = 0; i < n * 9; i++) positions[i] = ctr[i % 3] + (rand() * 2 - 1) * spread;
  for (let i = 0; i < n * 3; i++) indices[i] = i;
  return { topo: "face", geomType: 0, positions, indices };
}

// n random segments (6 floats/seg) within `spread` of the centre.
function randomEdgeSet(rand, n, cx, cy, cz, spread) {
  const positions = new Float32Array(n * 6);
  const ctr = [cx, cy, cz];
  for (let i = 0; i < n * 6; i++) positions[i] = ctr[i % 3] + (rand() * 2 - 1) * spread;
  return { topo: "edge", geomType: 0, positions };
}

// Primitive count a component reduces to (mirrors mesh-measure's primReduce), used to
// guard that the fixtures actually trip the BVH path.
function primCount(geom) {
  const f = buildFeatures(geom);
  if (geom.topo === "edge") return f.segs.length;
  if (geom.topo === "vertex") return f.points.length;
  return f.tris.length || f.points.length;
}

// Assert the BVH result matches the brute oracle (value + internal consistency +
// argument-order independence). The realizing POINTS may differ from brute's on ties,
// so we check the DISTANCE matches and that the BVH's own points reproduce it.
// prec=4: both paths run identical float arithmetic, but the inputs are Float32 so a
// tighter bound only tests summation-order stability, not the algorithm.
function expectBVHMatchesBrute(A, B, prec = 4) {
  // GUARD: the fixtures must exceed BVH_BRUTE_PAIR_THRESHOLD (8192) so the branch-and-
  // bound runs — otherwise minDistance silently delegates to the brute fallback and this
  // would be testing brute-vs-brute (a future fixture shrink would pass while the BVH
  // path goes untested).
  expect(primCount(A) * primCount(B)).toBeGreaterThan(8192);
  const bvh = minDistance(A, B);
  const brute = minDistanceBrute(A, B);
  expect(bvh.distance).toBeCloseTo(brute.distance, prec);
  expect(bvh.point1.distanceTo(bvh.point2)).toBeCloseTo(bvh.distance, prec);
  // order independence
  expect(minDistance(B, A).distance).toBeCloseTo(brute.distance, prec);
}

describe("mesh-measure: BVH minDistance == brute oracle", () => {
  // face×face at several separations: well-separated (heavy pruning), touching, and
  // interpenetrating (≈0). 128 tris/side → 16384 pairs > threshold → BVH path runs.
  test.each([
    ["well separated", 50],
    ["near", 4],
    ["touching/overlapping", 1],
    ["interpenetrating", 0],
  ])("face × face — %s", (_label, offset) => {
    const rand = rng(1234 + offset);
    const A = randomFace(rand, 128, 0, 0, 0, 1.5);
    const B = randomFace(rand, 128, offset, 0, 0, 1.5);
    expectBVHMatchesBrute(A, B);
  });

  test("face × edge (triangle-segment path)", () => {
    const rand = rng(77);
    const A = randomFace(rand, 128, 0, 0, 0, 1.5); // 128 tris
    const B = randomEdgeSet(rand, 128, 8, 0, 0, 1.5); // 128 segs → 16384 pairs
    expectBVHMatchesBrute(A, B);
  });

  test("edge × edge (segment-segment path)", () => {
    const rand = rng(99);
    const A = randomEdgeSet(rand, 128, 0, 0, 0, 1.5);
    const B = randomEdgeSet(rand, 128, 0, 7, 0, 1.5);
    expectBVHMatchesBrute(A, B);
  });

  test("vertex × face (point primitive in the tree)", () => {
    // 1 × 9000 pairs > threshold → vertex goes through the BVH (point-leaf vs tri-leaves)
    const rand = rng(555);
    const v = vertexAt(0, 0, 0);
    const F = randomFace(rand, 9000, 12, 0, 0, 2);
    expectBVHMatchesBrute(v, F);
  });

  test("repeatable over many random seeds (face × face)", () => {
    for (let seed = 0; seed < 25; seed++) {
      const rand = rng(seed * 2654435761);
      const offset = rand() * 12; // mix of separated / overlapping
      const A = randomFace(rand, 100, 0, 0, 0, 2); // 100×100 = 10000 > threshold
      const B = randomFace(rand, 100, offset, offset * 0.3, 0, 2);
      expectBVHMatchesBrute(A, B);
    }
  });
});

// ---------------------------------------------------------------------------
// closestPointOnTriangle — edge-BC branch regression (scratch-aliasing bug, 7f96119).
// The bug clobbered the output when the closest point lay on edge BC, returning ~origin;
// it surfaced as an order-dependent, ~0 face distance. Guard the primitive directly.
// ---------------------------------------------------------------------------

describe("mesh-measure: closestPointOnTriangle edge-BC regression", () => {
  test("closest point on edge BC is correct (not clobbered to origin)", () => {
    // triangle a=(0,0,0) b=(2,0,0) c=(0,2,0); p beyond edge BC → foot = midpoint (1,1,0)
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const c = new THREE.Vector3(0, 2, 0);
    const p = new THREE.Vector3(2, 2, 0);
    const out = new THREE.Vector3();
    closestPointOnTriangle(p, a, b, c, out);
    expect(out.x).toBeCloseTo(1, 9);
    expect(out.y).toBeCloseTo(1, 9);
    expect(out.z).toBeCloseTo(0, 9);
  });

  test("face distance realized on edge BC is order-independent", () => {
    // faceA's closest feature to faceB's point is edge BC of one of A's triangles.
    const faceA = {
      topo: "face",
      geomType: 0,
      positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const v = vertexAt(2, 2, 3); // above the (2,2) corner region → foot on edge BC
    const ab = minDistance(faceA, v);
    const ba = minDistance(v, faceA);
    expect(ab.distance).toBeCloseTo(ba.distance, 9);
    // independent ground truth: distance from (2,2,3) to midpoint (1,1,0) of BC
    expect(ab.distance).toBeCloseTo(Math.hypot(1, 1, 3), 6);
  });
});

// ---------------------------------------------------------------------------
// triSegDistance / triTriDistance — direct checks of the new primitive helpers.
// ---------------------------------------------------------------------------

describe("mesh-measure: triangle-segment / triangle-triangle primitives", () => {
  const ta = new THREE.Vector3(0, 0, 0);
  const tb = new THREE.Vector3(4, 0, 0);
  const tc = new THREE.Vector3(0, 4, 0); // triangle in z=0

  test("triSeg: segment hovering above the face interior → perpendicular gap", () => {
    const sa = new THREE.Vector3(1, 1, 5);
    const sb = new THREE.Vector3(1.2, 1.1, 5);
    const oT = new THREE.Vector3();
    const oS = new THREE.Vector3();
    const d2 = triSegDistance(ta, tb, tc, sa, sb, oT, oS);
    expect(Math.sqrt(d2)).toBeCloseTo(5, 6);
    expect(oT.z).toBeCloseTo(0, 6); // realizing point on the triangle plane
  });

  test("triTri: two parallel triangles → plane gap, points reproduce it", () => {
    const b0 = new THREE.Vector3(0, 0, 3);
    const b1 = new THREE.Vector3(4, 0, 3);
    const b2 = new THREE.Vector3(0, 4, 3);
    const oA = new THREE.Vector3();
    const oB = new THREE.Vector3();
    const d2 = triTriDistance(ta, tb, tc, b0, b1, b2, oA, oB);
    expect(Math.sqrt(d2)).toBeCloseTo(3, 6);
    expect(oA.distanceTo(oB)).toBeCloseTo(Math.sqrt(d2), 6);
  });

  test("triTri: edge-edge winner (skew triangles, no vertex/face contact)", () => {
    // Triangle A in z=0, triangle B in a vertical plane (y=10) rotated so the closest
    // approach is edge-to-edge, not vertex-to-face. A's edge tb→tc vs B's bottom edge.
    const b0 = new THREE.Vector3(2, 10, -1);
    const b1 = new THREE.Vector3(2, 10, 1);
    const b2 = new THREE.Vector3(6, 14, 0);
    const oA = new THREE.Vector3();
    const oB = new THREE.Vector3();
    const d2 = triTriDistance(ta, tb, tc, b0, b1, b2, oA, oB);
    // brute oracle over the same two triangles must agree
    const A = {
      topo: "face",
      geomType: 0,
      positions: new Float32Array([0, 0, 0, 4, 0, 0, 0, 4, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const B = {
      topo: "face",
      geomType: 0,
      positions: new Float32Array([2, 10, -1, 2, 10, 1, 6, 14, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    expect(Math.sqrt(d2)).toBeCloseTo(minDistanceBrute(A, B).distance, 6);
    expect(oA.distanceTo(oB)).toBeCloseTo(Math.sqrt(d2), 6);
    expect(oA.z).toBeCloseTo(0, 6); // realizing point stays on A's plane (its edge)
  });

  test("primReduce fallback: face with no triangle indices degrades to its points", () => {
    // A "face" with positions but no indices → buildFeatures yields points only; the
    // distance must still resolve (treated as a point cloud), matching the brute path.
    const ptCloud = {
      topo: "face",
      geomType: 0,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    };
    const v = vertexAt(0, 0, 5);
    expect(minDistance(ptCloud, v).distance).toBeCloseTo(5, 9);
  });
});

describe("mesh-measure: angles", () => {
  test("angle between +X and +Y is 90°", () => {
    expect(
      angleBetween(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
    ).toBeCloseTo(90, 9);
  });

  test("face normal +Z is 0° to XY; horizontal edge is 0° to XY", () => {
    expect(angleToXY(new THREE.Vector3(0, 0, 1), false)).toBeCloseTo(0, 9);
    expect(angleToXY(new THREE.Vector3(1, 0, 0), true)).toBeCloseTo(0, 9);
  });

  test("vertical edge is 90° to XY", () => {
    expect(angleToXY(new THREE.Vector3(0, 0, 1), true)).toBeCloseTo(90, 9);
  });
});

describe("mesh-measure: MeshMeasureBackend responses", () => {
  // A provider resolving a few fixed paths to hand-built geometry.
  const provider = {
    resolve(path) {
      if (path === "/m/faces/faces_0") return squareFace(); // z=5, area 4, +Z
      if (path === "/m") return cube(); // solid, volume 8
      if (path === "/m/edges/edges_0") return edge(); // length 3 along +X
      if (path === "/v0") return vertexAt(1, 1, 8);
      return null;
    },
  };
  const backend = new MeshMeasureBackend(() => provider);

  test("properties of a face: type, geom_type, area, refpoint, routing fields", () => {
    const r = backend.properties("/m/faces/faces_0");
    expect(r.type).toBe("backend_response");
    expect(r.subtype).toBe("tool_response");
    expect(r.tool_type).toBe("PropertiesMeasurement");
    expect(r.shape_type).toBe("Face");
    expect(r.geom_type).toBe("Plane"); // geomType 0
    expect(r.refpoint).toEqual([1, 1, 5]);
    // result blocks: { center }, { area, angle to XY }, { bb }
    const areaBlock = r.result.find((b) => "area" in b);
    expect(areaBlock.area).toBeCloseTo(4, 9);
    expect(areaBlock["angle to XY"]).toBeCloseTo(0, 6);
    expect(r.result.some((b) => "bb" in b)).toBe(true);
  });

  test("properties of a solid reports volume", () => {
    const r = backend.properties("/m");
    expect(r.shape_type).toBe("Solid");
    const volBlock = r.result.find((b) => "volume" in b);
    expect(volBlock.volume).toBeCloseTo(8, 9);
  });

  test("properties of an edge reports length + geom_type Line", () => {
    const r = backend.properties("/m/edges/edges_0");
    expect(r.shape_type).toBe("Edge");
    expect(r.geom_type).toBe("Line");
    const lenBlock = r.result.find((b) => "length" in b);
    expect(lenBlock.length).toBeCloseTo(3, 9);
  });

  test("distance (min) between a vertex and a face", () => {
    const r = backend.distance("/v0", "/m/faces/faces_0", false);
    expect(r.tool_type).toBe("DistanceMeasurement");
    const distBlock = r.result.find((b) => "distance" in b);
    expect(distBlock.distance).toBeCloseTo(3, 9); // vertex z=8, face z=5
    expect(distBlock.info).toBe("min");
    expect(r.refpoint1).toBeDefined();
    expect(r.refpoint2).toBeDefined();
  });

  test("distance (center) uses centroids", () => {
    const r = backend.distance("/m", "/m/faces/faces_0", true);
    const distBlock = r.result.find((b) => "distance" in b);
    expect(distBlock.info).toBe("center");
    // cube centroid (1,1,1) to face centroid (1,1,5) → 4
    expect(distBlock.distance).toBeCloseTo(4, 6);
  });

  test("returns null when a component can't be resolved", () => {
    expect(backend.properties("/missing")).toBeNull();
    expect(backend.distance("/v0", "/missing", false)).toBeNull();
  });
});

describe("mesh-measure: circleFromPolyline", () => {
  // Sample a circle (center c, radius r) in the plane spanned by orthonormal u,v,
  // emitted as segment-endpoint pairs [P0,P1, P1,P2, ...] like edge tessellations.
  function circlePolyline(c, r, u, v, segments = 24, arc = 2 * Math.PI) {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = (arc * i) / segments;
      const cs = Math.cos(t) * r;
      const sn = Math.sin(t) * r;
      pts.push([
        c[0] + cs * u[0] + sn * v[0],
        c[1] + cs * u[1] + sn * v[1],
        c[2] + cs * u[2] + sn * v[2],
      ]);
    }
    const flat = [];
    for (let i = 0; i < segments; i++) flat.push(...pts[i], ...pts[i + 1]);
    return new Float32Array(flat);
  }

  test("recovers center + radius of an axis-aligned circle", () => {
    const res = circleFromPolyline(
      circlePolyline([1, 2, 3], 5, [1, 0, 0], [0, 1, 0]),
    );
    expect(res).not.toBeNull();
    expect(res.radius).toBeCloseTo(5, 3);
    expect(res.center[0]).toBeCloseTo(1, 3);
    expect(res.center[1]).toBeCloseTo(2, 3);
    expect(res.center[2]).toBeCloseTo(3, 3);
  });

  test("recovers a tilted circle in an arbitrary plane", () => {
    const u = new THREE.Vector3(1, 1, 0).normalize();
    const v = new THREE.Vector3(0, 1, 1);
    v.addScaledVector(u, -v.dot(u)).normalize(); // orthonormalize against u
    const res = circleFromPolyline(
      circlePolyline([-2, 0.5, 4], 3, u.toArray(), v.toArray()),
    );
    expect(res.radius).toBeCloseTo(3, 3);
    expect(res.center[0]).toBeCloseTo(-2, 3);
    expect(res.center[1]).toBeCloseTo(0.5, 3);
    expect(res.center[2]).toBeCloseTo(4, 3);
  });

  test("works on an arc (partial sweep)", () => {
    const res = circleFromPolyline(
      circlePolyline([0, 0, 0], 2, [1, 0, 0], [0, 1, 0], 12, Math.PI / 2),
    );
    expect(res.radius).toBeCloseTo(2, 3);
    expect(res.center[0]).toBeCloseTo(0, 3);
    expect(res.center[1]).toBeCloseTo(0, 3);
  });

  test("returns null for collinear / too few points", () => {
    const line = [];
    for (let i = 0; i < 6; i++) line.push(i, 0, 0, i + 1, 0, 0);
    expect(circleFromPolyline(new Float32Array(line))).toBeNull();
    expect(circleFromPolyline(new Float32Array([0, 0, 0]))).toBeNull();
  });
});
