import * as THREE from "three";

/**
 * Topology type of a pickable component. Mirrors the values of `TopoFilter` in
 * `raycast.ts` (minus the `none` sentinel).
 */
export type TopoType = "face" | "edge" | "vertex" | "solid";

/** Picking strategy. The migration flag selects between these. */
export type PickingMode = "raycast" | "idbuffer";

/** Reserved component id meaning "nothing under the cursor". */
export const BACKGROUND_ID = 0;

/**
 * Metadata for one pickable component (face, edge, vertex, or solid).
 *
 * Replaces the per-component `ObjectGroup.shapeInfo` lookup the CPU raycaster
 * relies on: the id-buffer pass reads back an id, and this is what it resolves to.
 */
export interface ComponentInfo {
  /** Unique id within the current model; encoded into the pick buffer. Never 0. */
  id: number;
  /** Full path, e.g. "/Assembly/Part1/faces/faces_3". */
  path: string;
  /** Leaf name, e.g. "faces_3". */
  name: string;
  /** Topology type. */
  topo: TopoType;
  /** Subtype of the owning shape (e.g. "solid"), or null. */
  subtype: string | null;
  /**
   * Path of the owning solid when this component is a face/edge/vertex *inside* a
   * solid — pick-only, no tree node (see Migration-ID-Picking.md, D1/D2). `null`
   * for standalone faces/edges/vertices that are tree leaves in their own right.
   */
  solidPath: string | null;
}

/**
 * Flat `id -> ComponentInfo` registry. Replaces the `NestedGroup.groups[id]`
 * explosion for pick lookups. Ids are allocated monotonically starting at 1;
 * id 0 ({@link BACKGROUND_ID}) means "nothing".
 */
export class ComponentRegistry {
  private byId: Map<number, ComponentInfo>;
  private nextId: number;

  constructor() {
    this.byId = new Map();
    this.nextId = 1; // 0 reserved for background
  }

  /**
   * Register a component and return its freshly allocated id. The returned id is
   * also written onto the stored record's `id` field.
   */
  register(info: Omit<ComponentInfo, "id">): number {
    const id = this.nextId;
    this.nextId += 1;
    this.byId.set(id, { ...info, id });
    return id;
  }

  /** Look up a component by id; `undefined` for unknown ids or background (0). */
  get(id: number): ComponentInfo | undefined {
    return this.byId.get(id);
  }

  /** Number of registered components. */
  get size(): number {
    return this.byId.size;
  }

  /** Drop all entries and reset id allocation. */
  clear(): void {
    this.byId.clear();
    this.nextId = 1;
  }
}

/**
 * Pack a component id into an RGBA8 byte tuple (full 32-bit range, low byte in R).
 * The pick fragment shader must write the same layout. Inverse of {@link unpackId}.
 */
export function packId(id: number): [number, number, number, number] {
  return [id & 0xff, (id >> 8) & 0xff, (id >> 16) & 0xff, (id >> 24) & 0xff];
}

/** Decode an RGBA8 tuple (as written by {@link packId}) back into a component id. */
export function unpackId(r: number, g: number, b: number, a: number): number {
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

/**
 * Build the per-vertex face component-id attribute for a solid/standalone-face
 * node's EXISTING indexed tessellation, registering one face component per face
 * under `{path}/faces/faces_{i}` in array (backend-enumeration) order.
 *
 * No de-indexing: vertices are pooled per face, so each vertex maps to exactly one
 * face. `collisions` counts vertices referenced by more than one face — it must be
 * 0 (a non-zero value means cross-face sharing, i.e. de-indexing would be required).
 *
 * @param vertexCount - number of vertices in the position pool (`positions.length / 3`)
 * @param triangles - flat index array (with `trianglesPerFace`) OR nested
 *   `number[][]` (one face's flat index list per entry)
 * @param trianglesPerFace - per-face triangle counts when `triangles` is flat;
 *   `undefined` for the nested format
 */
export function buildFaceComponentIds(
  vertexCount: number,
  triangles: Uint32Array | number[] | number[][],
  trianglesPerFace: Uint32Array | number[] | undefined,
  path: string,
  subtype: string | null,
  registry: ComponentRegistry,
): { componentId: Uint32Array; collisions: number } {
  const componentId = new Uint32Array(vertexCount); // 0 = unreferenced / background
  const owner = new Int32Array(vertexCount).fill(-1);
  const solidPath = subtype === "solid" ? path : null;
  let collisions = 0;

  const tagFace = (
    face: number,
    indices: ArrayLike<number>,
    start: number,
    count: number,
  ): void => {
    const id = registry.register({
      path: `${path}/faces/faces_${face}`,
      name: `faces_${face}`,
      topo: "face",
      subtype,
      solidPath,
    });
    for (let k = 0; k < count; k++) {
      const vi = indices[start + k];
      if (owner[vi] === -1) {
        owner[vi] = face;
        componentId[vi] = id;
      } else if (owner[vi] !== face) {
        collisions += 1; // cross-face shared vertex — invariant violation
      }
    }
  };

  if (trianglesPerFace !== undefined) {
    // flat index array + per-face triangle counts (binary format)
    const flat = triangles as Uint32Array | number[];
    let cur = 0;
    for (let f = 0; f < trianglesPerFace.length; f++) {
      const n = trianglesPerFace[f] * 3; // index entries for this face
      tagFace(f, flat, cur, n);
      cur += n;
    }
  } else if (Array.isArray(triangles) && Array.isArray(triangles[0])) {
    // nested number[][] — one face's flat index list per entry
    const nested = triangles as number[][];
    for (let f = 0; f < nested.length; f++) {
      tagFace(f, nested[f], 0, nested[f].length);
    }
  } else if (triangles.length > 0) {
    // flat index array with no per-face counts → treat as a single face
    tagFace(0, triangles as Uint32Array | number[], 0, triangles.length);
  }
  return { componentId, collisions };
}

/**
 * Build the per-segment (instanced) edge component-id attribute, registering one
 * edge component per edge under `{path}/edges/edges_{i}` in array order. Produces
 * one id per line segment (one `LineSegments2` instance).
 *
 * @param edges - flat segment endpoints (with `segmentsPerEdge`) OR nested
 *   `number[][]` (one edge's flat points per entry, 6 floats per segment)
 * @param segmentsPerEdge - per-edge segment counts when `edges` is flat;
 *   `undefined` for the nested format
 */
export function buildEdgeComponentIds(
  edges: Float32Array | number[] | number[][],
  segmentsPerEdge: Uint32Array | number[] | undefined,
  path: string,
  subtype: string | null,
  registry: ComponentRegistry,
): { componentId: Uint32Array } {
  const solidPath = subtype === "solid" ? path : null;
  const ids: number[] = [];
  const registerEdge = (e: number): number =>
    registry.register({
      path: `${path}/edges/edges_${e}`,
      name: `edges_${e}`,
      topo: "edge",
      subtype,
      solidPath,
    });

  if (segmentsPerEdge !== undefined) {
    // flat segment endpoints + per-edge segment counts (binary format)
    for (let e = 0; e < segmentsPerEdge.length; e++) {
      const id = registerEdge(e);
      for (let s = 0; s < segmentsPerEdge[e]; s++) ids.push(id);
    }
  } else if (Array.isArray(edges) && Array.isArray(edges[0])) {
    // nested number[][] — one edge's flat points per entry (6 floats / segment)
    const nested = edges as number[][];
    for (let e = 0; e < nested.length; e++) {
      const id = registerEdge(e);
      const segs = nested[e].length / 6;
      for (let s = 0; s < segs; s++) ids.push(id);
    }
  } else if (edges.length > 0) {
    // flat points with no per-edge counts → treat as a single edge
    const id = registerEdge(0);
    const segs = (edges as Float32Array | number[]).length / 6;
    for (let s = 0; s < segs; s++) ids.push(id);
  }
  return { componentId: new Uint32Array(ids) };
}

/**
 * GPU id-based picker.
 *
 * Phase 0 stub: holds the renderer + registry wiring only. The pick render
 * target (id + position MRT), the pick override-material, and the N×N async
 * readback land in Phase 2 (see Migration-ID-Picking.md).
 */
export class IdPicker {
  readonly registry: ComponentRegistry;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, registry: ComponentRegistry) {
    this.renderer = renderer;
    this.registry = registry;
  }

  /** Release GPU resources. Phase 0: nothing allocated yet. */
  dispose(): void {
    // Phase 2: dispose the pick render target(s) here.
    void this.renderer;
  }
}
