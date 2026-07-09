import * as THREE from "three";
import type { Camera } from "../camera/camera.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";

/**
 * Topology type of a pickable component. Mirrors the values of `TopoFilter`
 * below (minus the `none` sentinel).
 */
export type TopoType = "face" | "edge" | "vertex" | "solid";

/**
 * Filter types for topology-based picking. `none` is the "no filter" sentinel
 * (all topos eligible).
 */
export const TopoFilter: {
  none: null;
  vertex: "vertex";
  edge: "edge";
  face: "face";
  solid: "solid";
} = {
  none: null,
  vertex: "vertex",
  edge: "edge",
  face: "face",
  solid: "solid",
};

export type TopoFilterType = (typeof TopoFilter)[keyof typeof TopoFilter];

/** Reserved component id meaning "nothing under the cursor". */
export const BACKGROUND_ID = 0;

/**
 * Name of the per-vertex integer buffer attribute carrying the component id on
 * every pickable geometry (faces, edges and vertices). The geometry attaches a
 * `Uint32BufferAttribute` under this name; the pick pass reads it as an **integer**
 * attribute (`gpuType = THREE.IntType`, GLSL3 `in uint`) so ids stay exact past
 * 2^24. The geometry side must set `gpuType = THREE.IntType` on the attribute for
 * the pick shader to read it.
 */
export const COMPONENT_ID_ATTRIBUTE = "componentId";

/**
 * three.js camera/object layers reserved for the pick passes.
 *
 * A pickable object lives on visual layer 0 (so the main camera draws it) **and**
 * its topo's pick layer. The pick pass sets the (reused) main camera to a single
 * pick layer so `overrideMaterial` only touches one topo at a time — a mesh shader
 * can't render lines/points. `obj_vertices` points live on `VERTEX` *only* (off the
 * visual pass).
 */
export const PICK_LAYER = {
  FACE: 1,
  EDGE: 2,
  VERTEX: 3,
} as const;

export type PickLayer = (typeof PICK_LAYER)[keyof typeof PICK_LAYER];

const PICK_LAYER_BY_TOPO: Record<"face" | "edge" | "vertex", PickLayer> = {
  face: PICK_LAYER.FACE,
  edge: PICK_LAYER.EDGE,
  vertex: PICK_LAYER.VERTEX,
};

/**
 * Attach the per-vertex `componentId` integer attribute to a pickable geometry: the
 * canonical way to bind {@link COMPONENT_ID_ATTRIBUTE} so the GLSL3 pick shader reads
 * it as `in uint` (`gpuType = IntType` — without it three uploads floats and the bits
 * are wrong). Use `instanced` for fat-line (per-segment) edge geometry.
 */
export function applyComponentIds(
  geometry: THREE.BufferGeometry,
  componentId: Uint32Array,
  instanced = false,
): void {
  const attr = instanced
    ? new THREE.InstancedBufferAttribute(componentId, 1)
    : new THREE.Uint32BufferAttribute(componentId, 1);
  attr.gpuType = THREE.IntType;
  geometry.setAttribute(COMPONENT_ID_ATTRIBUTE, attr);
}

/**
 * Add `object` to its topo's pick layer additively — it stays on visual layer 0 (the
 * main render pass) AND becomes pickable. For face/edge geometry and visible vertices.
 */
export function enablePickLayer(
  object: THREE.Object3D,
  topo: "face" | "edge" | "vertex",
): void {
  object.layers.enable(PICK_LAYER_BY_TOPO[topo]);
}

/**
 * Put `object` on its topo's pick layer ONLY (off visual layer 0), so the main camera
 * never draws it — for the pick-only `obj_vertices` Points cloud.
 */
export function setPickLayerExclusive(
  object: THREE.Object3D,
  topo: "face" | "edge" | "vertex",
): void {
  object.layers.set(PICK_LAYER_BY_TOPO[topo]);
}

/**
 * Metadata for one pickable component (face, edge, vertex, or solid). The id-buffer
 * pass reads back an id, and this is what it resolves to.
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
   * solid — pick-only, no tree node. `null` for standalone faces/edges/vertices
   * that are tree leaves in their own right.
   */
  solidPath: string | null;
}

/**
 * Map a dropdown topo filter to the picker's `TopoType[]`. `none`/`[null]` (the
 * "no filter" sentinel) → `undefined` (all topos eligible).
 */
export function pickerTopoFilter(
  filter: TopoFilterType[],
): TopoType[] | undefined {
  const mapped = filter.filter((t): t is TopoType => t !== null);
  return mapped.length === 0 ? undefined : mapped;
}

/**
 * Tree-leaf path that owns a picked component: the owning solid's path for a
 * sub-component, else the component's own path with the topo suffix stripped. This
 * is the leaf the double-click pick and the visibility gate operate on.
 */
export function leafPath(info: ComponentInfo): string {
  return (
    info.solidPath ?? info.path.replace(/\/(faces|edges|vertices)\/[^/]+$/, "")
  );
}

/**
 * Signature of the live clip state, to detect actual clip changes for the picker
 * (used by the render loop's dirty cadence).
 */
export function clipSignature(
  planes: THREE.Plane[] | null,
  intersection: boolean,
): string {
  if (planes === null) return "off";
  let s = intersection ? "i" : "u";
  for (const p of planes) {
    s += `|${p.normal.x},${p.normal.y},${p.normal.z},${p.constant}`;
  }
  return s;
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

  /**
   * Iterate every registered component in registration (id-ascending) order.
   * Used by the highlight controller to resolve solid selection (all components
   * sharing a `solidPath`) without a scene-graph walk.
   */
  entries(): IterableIterator<ComponentInfo> {
    return this.byId.values();
  }

  /**
   * Largest allocated id so far (0 when empty). Ids are allocated contiguously from
   * 1 and NEVER recycled ({@link removeByPathPrefix} deletes records but keeps
   * `nextId`), so this is the high-water mark used as the upper bound for sizing the
   * highlight-state texture; it is `>=` {@link size} (equal until the first removal).
   */
  get maxId(): number {
    return this.nextId - 1;
  }

  /** Number of registered components. */
  get size(): number {
    return this.byId.size;
  }

  /**
   * Drop every component whose path is `prefix` or lies under it (`prefix + "/"`),
   * for {@link Viewer.removePart}. Does NOT recycle ids — surviving components keep
   * their ids (and thus their highlight-state texel), and {@link maxId} stays put.
   */
  removeByPathPrefix(prefix: string): void {
    const sub = prefix + "/";
    for (const [id, info] of this.byId) {
      if (info.path === prefix || info.path.startsWith(sub)) {
        this.byId.delete(id);
      }
    }
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
 * Build the per-point vertex component-id attribute for a node's `obj_vertices`
 * (the real B-rep corners — the *selectable* vertices, NOT the triangle-mesh
 * vertices), registering one vertex component per point under
 * `{path}/vertices/vertices_{i}` in array (backend `get_vertices`) order.
 *
 * @param objVertices - flat xyz triples (3 floats per vertex)
 */
export function buildVertexComponentIds(
  objVertices: Float32Array | number[],
  path: string,
  subtype: string | null,
  registry: ComponentRegistry,
): { componentId: Uint32Array } {
  const solidPath = subtype === "solid" ? path : null;
  const count = Math.floor(objVertices.length / 3);
  const ids = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = registry.register({
      path: `${path}/vertices/vertices_${i}`,
      name: `vertices_${i}`,
      topo: "vertex",
      subtype,
      solidPath,
    });
  }
  return { componentId: ids };
}

/**
 * Result of a successful pick: the component id read from the id buffer, its
 * registry metadata, and the world-space hit point.
 */
export interface PickResult {
  /** Picked component id (never {@link BACKGROUND_ID}). */
  id: number;
  /** Registry metadata for the picked component. */
  info: ComponentInfo;
  /**
   * World-space hit point, sourced from the position-MRT attachment. `null` when
   * the RGBA32F position attachment is unsupported (id-only pick).
   */
  point: THREE.Vector3 | null;
}

/** Options for {@link IdPicker.pickAt}. */
export interface PickAtOptions {
  /**
   * Restrict which topo types may be resolved (mirrors the existing
   * `topoFilter`). `undefined`/empty = all (priority vertex>edge>face applies).
   * `"solid"` makes faces eligible (caller maps the face to its `solidPath`).
   */
  topoFilter?: TopoType[];
  /**
   * Odd N for the N×N readback window (touch radius for thin edges / tiny
   * vertices). Defaults to {@link IdPicker}'s window size (5).
   */
  windowSize?: number;
}

/** Options for the per-topo pick materials. */
export interface PickMaterialOptions {
  /** Live clipping planes the pick pass must honor (so clipped geometry is not picked). */
  clippingPlanes?: THREE.Plane[] | null;
  /** Intersection clipping (mirror the visual material's `clipIntersection`). */
  clipIntersection?: boolean;
  /**
   * Forward depth bias in **view-space world units** (a positive nudge toward the
   * camera) so a corner's higher-priority topo wins the shared-depth pick test over
   * its coincident lower-priority topo. Applied to `mvPosition.z` BEFORE projection —
   * i.e. a constant world distance, independent of the camera's near/far spread.
   * (An earlier build biased a constant in NDC z, which under an orthographic camera
   * on a large scene became a multi-mm world window that let geometry behind an
   * occluding face get picked "through" it.) Set per-scene from the bounding radius.
   */
  depthBias?: number;
}

/**
 * View-space depth-bias factors (× scene bounding radius) for the edge and vertex
 * pick passes. Face = 0. Kept monotonic with the vertex > edge > face hover priority
 * so a corner's vertex wins over its edges and its edges over their faces. The factor
 * is a fraction of the bounding radius: large enough to clear 24-bit depth-buffer
 * quantization (≈ (far−near)/2^24 with far/near ∝ radius), small enough that the
 * world window stays sub-mm on typical models so geometry a real distance behind an
 * occluder is NOT picked through it.
 */
export const EDGE_DEPTH_BIAS_FACTOR = 1e-4;
export const VERTEX_DEPTH_BIAS_FACTOR = 2e-4;

/**
 * Pick size (framebuffer px in the half-res target) for vertex pick points. Kept
 * SMALL: the N×N readback window provides the "touch radius" by reading neighbours,
 * so fat rendering is unnecessary and would only overwrite neighbouring face pixels
 * in the shared id buffer (hurting faces-only picks near corners). A few px keeps
 * the corner reliably present without eating faces.
 */
export const PICK_POINT_SIZE = 3;

/**
 * Shared GLSL3 MRT fragment shader for all pick materials (face/vertex/edge): packs
 * the flat `vId` into attachment 0 (byte order MUST match `packId()`: low byte in R)
 * and writes the interpolated world position into attachment 1 (RGBA32F; `w=1` marks
 * "has position"). The fragment clip chunk only `discard`s (non-ALPHA_TO_COVERAGE),
 * so no `diffuseColor` symbol is required.
 */
const PICK_FRAGMENT_SHADER = /* glsl */ `
  #include <clipping_planes_pars_fragment>

  flat in uint vId;
  in vec3 vWorldPos;
  layout(location = 0) out vec4 fragId;
  layout(location = 1) out vec4 fragPos;

  void main() {
    #include <clipping_planes_fragment>
    fragId = vec4(
      float( vId & 0xFFu ) / 255.0,
      float( ( vId >> 8 ) & 0xFFu ) / 255.0,
      float( ( vId >> 16 ) & 0xFFu ) / 255.0,
      float( ( vId >> 24 ) & 0xFFu ) / 255.0
    );
    fragPos = vec4( vWorldPos, 1.0 );
  }
`;

/**
 * Build the **face** pick override-material: a GLSL3 `ShaderMaterial` that reads the
 * integer {@link COMPONENT_ID_ATTRIBUTE} and writes `packId(componentId)` +
 * world position to the MRT pick target. Honors clipping (planes + intersection).
 */
export function createFacePickMaterial(
  options: PickMaterialOptions = {},
): THREE.ShaderMaterial {
  // GLSL3 (WebGL2). For a (non-Raw) ShaderMaterial three.js auto-injects
  // `in vec3 position;`, `uniform mat4 modelMatrix/modelViewMatrix/projectionMatrix`,
  // so we declare ONLY the custom integer attribute + flat varying. Integer
  // varyings MUST be `flat`. Clip chunks use legacy `varying`/`attribute` keywords
  // which three remaps via `#define` under GLSL3; the vertex chunk reads a local
  // `vec4 mvPosition`, which we compute before the include.
  const vertexShader = /* glsl */ `
    #include <clipping_planes_pars_vertex>

    in uint componentId;
    flat out uint vId;
    out vec3 vWorldPos;

    void main() {
      vId = componentId;
      vec4 worldPos = modelMatrix * vec4( position, 1.0 );
      vWorldPos = worldPos.xyz;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
    }
  `;

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: PICK_FRAGMENT_SHADER,
    side: THREE.FrontSide,
    // Nearest face must win in the id buffer.
    depthTest: true,
    depthWrite: true,
    // Honor live clipping planes so clipped geometry is not picked. `clipping`
    // tells three to compile in the clip chunks / NUM_CLIPPING_PLANES define.
    clipping: true,
    clippingPlanes: options.clippingPlanes ?? [],
    clipIntersection: options.clipIntersection ?? false,
  });

  gpuTracker.track("material", material, "ShaderMaterial (face pick)");
  return material;
}

/**
 * Build the **vertex** pick override-material for an `obj_vertices` `THREE.Points`
 * cloud: a GLSL3 `ShaderMaterial` that draws each point **fat** (`gl_PointSize` =
 * {@link PICK_POINT_SIZE}, a touch radius independent of the visual point size),
 * reads the integer `componentId`, and writes id + world position to the MRT. A
 * tiny forward depth bias lets a corner vertex win the depth test over its
 * coincident face (so it can be picked), while occluded vertices stay hidden.
 * Honors clipping.
 */
export function createVertexPickMaterial(
  options: PickMaterialOptions = {},
): THREE.ShaderMaterial {
  const vertexShader = /* glsl */ `
    #include <clipping_planes_pars_vertex>

    in uint componentId;
    flat out uint vId;
    out vec3 vWorldPos;
    uniform float uPickSize;
    uniform float uDepthBias;

    void main() {
      vId = componentId;
      vec4 worldPos = modelMatrix * vec4( position, 1.0 );
      vWorldPos = worldPos.xyz;
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      // Forward depth bias in VIEW SPACE (constant world distance toward the camera,
      // camera looks down -z so +z is nearer) so a corner vertex wins the shared
      // depth test over its coincident edges AND face. Biasing here (not in NDC z)
      // keeps the world window independent of the near/far spread. Must exceed the
      // edge bias so vertex > edge > face stays monotonic with hover priority.
      mvPosition.z += uDepthBias;
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = uPickSize;
      #include <clipping_planes_vertex>
    }
  `;

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: PICK_FRAGMENT_SHADER,
    uniforms: {
      uPickSize: { value: PICK_POINT_SIZE },
      uDepthBias: { value: options.depthBias ?? 0 },
    },
    depthTest: true,
    depthWrite: true,
    clipping: true,
    clippingPlanes: options.clippingPlanes ?? [],
    clipIntersection: options.clipIntersection ?? false,
  });

  gpuTracker.track("material", material, "ShaderMaterial (vertex pick)");
  return material;
}

/**
 * Pick width (px in the half-res target) for edge pick lines. Kept THIN: edges run
 * along face boundaries, so a fat band would overwrite face pixels on both sides and
 * wreck faces-only picks. The N×N readback window supplies the touch radius instead.
 */
export const PICK_EDGE_WIDTH = 2;

/**
 * Build the **edge** pick override-material for a `LineSegments2` /
 * `LineSegmentsGeometry` fat line: a GLSL3 `ShaderMaterial` that ports three
 * `LineMaterial`'s screen-space instanced fat-line expansion (instanceStart/End +
 * the `position` quad template, `linewidth`/`resolution` uniforms), reads the
 * **instanced** integer `componentId`, and writes id + world position to the MRT.
 * Drawn fat ({@link PICK_EDGE_WIDTH}) for a touch radius independent of the visual
 * line width. `resolution` MUST be set to the pick target size by the caller.
 * Honors clipping. (World-units + dash + color paths are dropped — pick only.)
 */
export function createEdgePickMaterial(
  options: PickMaterialOptions = {},
): THREE.ShaderMaterial {
  const vertexShader = /* glsl */ `
    #include <clipping_planes_pars_vertex>

    uniform float linewidth;
    uniform vec2 resolution;
    uniform float uDepthBias;

    in vec3 instanceStart;
    in vec3 instanceEnd;
    in uint componentId;

    flat out uint vId;
    out vec3 vWorldPos;

    void trimSegment( const in vec4 start, inout vec4 end ) {
      float a = projectionMatrix[ 2 ][ 2 ];
      float b = projectionMatrix[ 3 ][ 2 ];
      float nearEstimate = - 0.5 * b / a;
      float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );
      end.xyz = mix( start.xyz, end.xyz, alpha );
    }

    void main() {
      vId = componentId;

      // World-space segment endpoints → approximate hit point along the edge.
      vWorldPos = ( position.y < 0.5 )
        ? ( modelMatrix * vec4( instanceStart, 1.0 ) ).xyz
        : ( modelMatrix * vec4( instanceEnd, 1.0 ) ).xyz;

      float aspect = resolution.x / resolution.y;

      vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
      vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

      // Forward depth bias in VIEW SPACE (constant world nudge toward the camera,
      // which looks down -z) so an edge wins the shared depth test over its two
      // coincident faces at a crease. Applied to the view-space endpoints before
      // projection → a constant world distance, independent of the near/far spread
      // (a constant NDC bias became a multi-mm window under an ortho camera on a
      // large scene). Stays below the vertex bias so vertex > edge > face holds.
      start.z += uDepthBias;
      end.z += uDepthBias;

      // Segments crossing the camera plane (perspective) need trimming.
      bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 );
      if ( perspective ) {
        if ( start.z < 0.0 && end.z >= 0.0 ) trimSegment( start, end );
        else if ( end.z < 0.0 && start.z >= 0.0 ) trimSegment( end, start );
      }

      vec4 clipStart = projectionMatrix * start;
      vec4 clipEnd = projectionMatrix * end;

      vec3 ndcStart = clipStart.xyz / clipStart.w;
      vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

      vec2 dir = ndcEnd.xy - ndcStart.xy;
      dir.x *= aspect;
      dir = normalize( dir );

      vec2 offset = vec2( dir.y, - dir.x );
      dir.x /= aspect;
      offset.x /= aspect;
      if ( position.x < 0.0 ) offset *= - 1.0;
      if ( position.y < 0.0 ) offset += - dir;
      else if ( position.y > 1.0 ) offset += dir;
      offset *= linewidth;
      offset /= resolution.y;

      vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;
      offset *= clip.w;
      clip.xy += offset;

      gl_Position = clip;

      vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // approximation, for clipping
      #include <clipping_planes_vertex>
    }
  `;

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: PICK_FRAGMENT_SHADER,
    uniforms: {
      linewidth: { value: PICK_EDGE_WIDTH },
      resolution: { value: new THREE.Vector2(1, 1) },
      uDepthBias: { value: options.depthBias ?? 0 },
    },
    depthTest: true,
    depthWrite: true,
    clipping: true,
    clippingPlanes: options.clippingPlanes ?? [],
    clipIntersection: options.clipIntersection ?? false,
  });

  gpuTracker.track("material", material, "ShaderMaterial (edge pick)");
  return material;
}

/** MRT attachment index of the packed-id texture. */
export const PICK_ID_ATTACHMENT = 0;
/** MRT attachment index of the world-position texture. */
export const PICK_POS_ATTACHMENT = 1;

/**
 * Create the MRT pick render target: a single `WebGLRenderTarget` with two color
 * attachments —
 *  - {@link PICK_ID_ATTACHMENT} (0): RGBA8/UnsignedByte packed `componentId`
 *    (`packId`, low byte in R), and
 *  - {@link PICK_POS_ATTACHMENT} (1): RGBA32F world-space hit position,
 *    `xyz` = point, `w = 1` where a fragment was written (0 = background).
 *
 * `NearestFilter` on both — interpolated ids/positions are meaningless. A depth
 * buffer keeps the nearest fragment per pixel; no depth *texture* is read.
 * `NoColorSpace` on the id texture stops any sRGB transform corrupting the bytes.
 *
 * Plain factory: the caller ({@link IdPicker.pickAt}) owns sizing/resize/disposal.
 * `width`/`height` are already the pick-buffer pixel size (caller applies half-DPR).
 *
 * @param withPosition - allocate the RGBA32F world-position attachment. Requires
 *   `EXT_color_buffer_float` (probed by {@link IdPicker}); when `false` the target
 *   carries the id attachment only and `pickAt` returns `point = null` (the fat
 *   `out` at location 1 in the pick shaders is simply dropped — writing to an
 *   unbound draw buffer is well-defined and discarded in WebGL2).
 */
export function createPickTargets(
  width: number,
  height: number,
  withPosition: boolean = true,
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    count: withPosition ? 2 : 1,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });
  const idTex = target.textures[PICK_ID_ATTACHMENT];
  idTex.type = THREE.UnsignedByteType;
  idTex.colorSpace = THREE.NoColorSpace;
  if (withPosition) {
    const posTex = target.textures[PICK_POS_ATTACHMENT];
    posTex.type = THREE.FloatType; // world position needs full float range
    posTex.colorSpace = THREE.NoColorSpace;
  }
  return target;
}

/** Priority rank for hover resolution: vertex > edge > face (background = 0). */
function topoRank(topo: TopoType): number {
  if (topo === "vertex") return 3;
  if (topo === "edge") return 2;
  if (topo === "face") return 1;
  return 0;
}

/** Whether `topo` is eligible under `filter` (undefined/empty = all). */
function topoEligible(topo: TopoType, filter: TopoType[] | undefined): boolean {
  if (filter === undefined || filter.length === 0) return true;
  if (filter.includes(topo)) return true;
  // `solid` selection picks via faces (caller maps the face to its solidPath).
  if (filter.includes("solid") && topo === "face") return true;
  return false;
}

/**
 * GPU id-based picker: cursor → component id → registry → backend path, plus the
 * world-space hit point.
 *
 * Lifecycle the host (viewer) drives:
 *  - {@link attach} once the scene + camera exist (re-attach after `clear()`),
 *  - {@link setSize} on canvas resize, {@link setClippingPlanes} on clip change,
 *  - {@link setDirty} whenever the view/geometry changes (camera move, geometry
 *    rebuild) so the pick buffer is re-rendered lazily on the next {@link pickAt},
 *  - {@link pickAt} on hover/click to resolve the component under the cursor.
 *
 * Per-topo passes (FACE, then fat EDGE lines, then fat VERTEX points) accumulate
 * into one MRT target; `pickAt` reads an N×N window and resolves **vertex > edge >
 * face** priority via the registry's topo, honoring `topoFilter`, then reads the
 * position attachment → `point`.
 */
export class IdPicker {
  readonly registry: ComponentRegistry;
  /**
   * Default N for the N×N readback window — the pick "touch radius" applied to the
   * (thin) geometry. 3 is odd, so the window is symmetric about the cursor pixel
   * (half = 1 → cursor ±1 on each axis); an even size is asymmetric. Tuned
   * interactively (pick-explore.html): 2 and 3 feel identical, much larger (e.g. 7)
   * pulls edge/vertex priority too far off the actual line/point; 1 is too unforgiving.
   */
  windowSize: number;
  private renderer: THREE.WebGLRenderer;
  /** Render source — the scene + camera the pick pass renders. */
  private scene: THREE.Scene | null;
  private camera: Camera | null;
  /** Live clipping planes mirrored onto the pick materials (`null` = clipping off). */
  private clippingPlanes: THREE.Plane[] | null;
  /** Canvas size in CSS px (the pick target is sized at half-DPR internally). */
  private width: number;
  private height: number;
  /** Intersection clipping mode mirrored onto the pick materials. */
  private clipIntersection: boolean;
  /**
   * Scene bounding radius, used to scale the edge/vertex view-space depth bias to a
   * small constant world distance (see {@link setSceneRadius}). 0 until the host sets
   * it — with 0, coincident corner topo would z-fight and be unpickable, so the host
   * MUST call {@link setSceneRadius} once the model bounds are known.
   */
  private sceneRadius: number;
  /** Whether the pick buffer must be re-rendered before the next read. */
  private dirty: boolean;
  /** MRT pick target (id + world-position attachments). Allocated lazily in `pickAt`. */
  private pickTarget: THREE.WebGLRenderTarget | null;
  /** Per-topo pick override-materials. Allocated lazily in `pickAt`. */
  private faceMaterial: THREE.ShaderMaterial | null;
  private edgeMaterial: THREE.ShaderMaterial | null;
  private vertexMaterial: THREE.ShaderMaterial | null;
  /** Clip-plane count the pick materials were last compiled for (program key). */
  private compiledPlaneCount: number;
  /** Intersection mode the pick materials were last compiled for (program key). */
  private compiledIntersection: boolean;
  /** Scratch to save/restore the renderer clear color across a pick pass. */
  private readonly savedClearColor: THREE.Color;
  /** Scratch to save/restore the renderer viewport across a pick pass. */
  private readonly savedViewport: THREE.Vector4;
  /** Scratch readback buffer for the position attachment (one RGBA32F pixel). */
  private readonly posPixel: Float32Array;
  /** Scratch readback buffer for the N×N id window (grown as needed). */
  private idWindow: Uint8Array;
  /**
   * Whether the GPU can render to a float color attachment (`EXT_color_buffer_float`,
   * probed at construction). When `false`, the pick target carries the id attachment
   * only and {@link pickAt} returns `point = null` — id picking still works, just
   * without the world-space hit point (degrades hover coords / double-click pivot to
   * the bbox-center fallback). Universal in real WebGL2; the probe guards exotic
   * contexts.
   */
  readonly positionSupported: boolean;

  constructor(renderer: THREE.WebGLRenderer, registry: ComponentRegistry) {
    this.renderer = renderer;
    this.registry = registry;
    this.positionSupported = IdPicker._probeFloatColor(renderer);
    if (!this.positionSupported) {
      // Dev-facing only (debug, not warn): a missing extension degrades gracefully
      // to `point = null` and id picking is unaffected; real WebGL2 has it.
      logger.debug(
        "IdPicker: EXT_color_buffer_float unavailable — pick world-position " +
          "disabled (point = null); id picking unaffected.",
      );
    }
    this.windowSize = 3;
    this.scene = null;
    this.camera = null;
    this.clippingPlanes = null;
    this.clipIntersection = false;
    this.sceneRadius = 0;
    this.width = 0;
    this.height = 0;
    this.dirty = true;
    this.pickTarget = null;
    this.faceMaterial = null;
    this.edgeMaterial = null;
    this.vertexMaterial = null;
    this.compiledPlaneCount = 0;
    this.compiledIntersection = false;
    this.savedClearColor = new THREE.Color();
    this.savedViewport = new THREE.Vector4();
    this.posPixel = new Float32Array(4);
    this.idWindow = new Uint8Array(this.windowSize * this.windowSize * 4);
  }

  /**
   * Probe `EXT_color_buffer_float` — the capability needed to *render into* the
   * RGBA32F world-position attachment. Getting the extension is the canonical
   * feature test (no side effects) and is WebGL2-only: it does not exist on WebGL1
   * (whose float-color extension is `WEBGL_color_buffer_float`), so a non-null result
   * already implies a WebGL2 context. Near-universal on WebGL2 but spec-optional.
   */
  private static _probeFloatColor(renderer: THREE.WebGLRenderer): boolean {
    // Guard the probe: mocked test renderers (happy-dom) may expose no `getContext`,
    // and an exotic context may lack `getExtension`.
    if (typeof renderer.getContext !== "function") return false;
    const gl = renderer.getContext();
    return (
      gl != null &&
      typeof gl.getExtension === "function" &&
      gl.getExtension("EXT_color_buffer_float") !== null
    );
  }

  /**
   * Point the picker at the scene + camera it renders for picking. Call once
   * the scene exists and again after the scene/camera are recreated (`clear()`).
   */
  attach(scene: THREE.Scene, camera: Camera): void {
    this.scene = scene;
    this.camera = camera;
    this.setDirty();
  }

  /**
   * Mark the pick buffer stale so the next {@link pickAt} re-renders it. Call on any
   * view change (camera move/zoom, geometry rebuild) — NOT on mouse-move.
   */
  setDirty(): void {
    this.dirty = true;
  }

  /**
   * Set the scene bounding radius so the edge/vertex pick passes bias depth by a
   * small constant WORLD distance (radius × {@link EDGE_DEPTH_BIAS_FACTOR} /
   * {@link VERTEX_DEPTH_BIAS_FACTOR}) rather than a constant in NDC z. The world
   * window is then independent of the camera near/far spread — the fix for geometry
   * behind an occluding face getting picked "through" it under an orthographic camera
   * on a large scene. Call whenever the model bounds change (initial build, add/remove
   * part). Updates existing materials in place and seeds lazily-created ones.
   */
  setSceneRadius(radius: number): void {
    this.sceneRadius = radius;
    if (this.edgeMaterial !== null) {
      this.edgeMaterial.uniforms.uDepthBias.value = this._edgeDepthBias();
    }
    if (this.vertexMaterial !== null) {
      this.vertexMaterial.uniforms.uDepthBias.value = this._vertexDepthBias();
    }
    this.setDirty();
  }

  /** View-space edge depth bias (world units) for the current scene radius. */
  private _edgeDepthBias(): number {
    return this.sceneRadius * EDGE_DEPTH_BIAS_FACTOR;
  }

  /** View-space vertex depth bias (world units) for the current scene radius. */
  private _vertexDepthBias(): number {
    return this.sceneRadius * VERTEX_DEPTH_BIAS_FACTOR;
  }

  /** Resize the pick render target to match the canvas (CSS px; half-DPR internally). */
  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.setDirty();
  }

  /**
   * Update the clipping the pick materials must honor — planes (`null` when the
   * viewer's clipping is off) and intersection mode (mirror the visual material's
   * `clipIntersection`). Recompiles the materials only when the plane *count* or the
   * intersection *mode* changes (three keys the program on `NUM_CLIPPING_PLANES` /
   * `UNION_CLIPPING_PLANES`); a value-only change just re-renders. Always
   * re-renders next {@link pickAt}.
   */
  setClippingPlanes(
    planes: THREE.Plane[] | null,
    intersection: boolean = false,
  ): void {
    this.clippingPlanes = planes;
    this.clipIntersection = intersection;
    const count = planes === null ? 0 : planes.length;
    const recompile =
      count !== this.compiledPlaneCount ||
      intersection !== this.compiledIntersection;
    for (const material of [
      this.faceMaterial,
      this.edgeMaterial,
      this.vertexMaterial,
    ]) {
      if (material === null) continue;
      material.clippingPlanes = planes ?? [];
      material.clipIntersection = intersection;
      if (recompile) material.needsUpdate = true;
    }
    if (recompile) {
      this.compiledPlaneCount = count;
      this.compiledIntersection = intersection;
    }
    this.setDirty();
  }

  /**
   * Resolve the component under the cursor, with its world-space hit point.
   *
   * @param x - canvas-relative x in CSS px (`getBoundingClientRect`)
   * @param y - canvas-relative y in CSS px (top-left origin; WebGL Y-flip is internal)
   * @returns the picked component (`point` = world hit position), or `null` for
   *   background / no hit.
   *
   * Re-renders the MRT pick target if {@link dirty} (per-topo passes on the pick
   * layers, honoring clipping), then reads an N×N window around the cursor pixel
   * (canvas px → ×dpr×0.5 → Y-flip) and resolves **vertex > edge > face** priority
   * via the registry's topo (nearest-to-center tie-break), restricted to
   * `options.topoFilter`. The position attachment at the chosen pixel → `point`.
   */
  pickAt(x: number, y: number, options: PickAtOptions = {}): PickResult | null {
    if (this.scene === null || this.camera === null) return null;

    const dpr = this.renderer.getPixelRatio();
    const tw = Math.floor(this.width * dpr * 0.5);
    const th = Math.floor(this.height * dpr * 0.5);
    if (tw < 1 || th < 1) return null;

    this._ensureResources(tw, th);

    // Re-render the pick target only when the view/geometry changed.
    if (this.dirty) {
      this._renderPickBuffer(this.camera.getCamera(), this.pickTarget!);
      this.dirty = false;
    }

    // canvas px → target px (×dpr×0.5) → Y-flip (WebGL origin is bottom-left).
    const tx = Math.min(tw - 1, Math.max(0, Math.floor(x * dpr * 0.5)));
    const tyTop = Math.floor(y * dpr * 0.5);
    const ty = Math.min(th - 1, Math.max(0, th - 1 - tyTop));

    // N×N window clamped within the target.
    const win = Math.max(1, options.windowSize ?? this.windowSize);
    const bw = Math.min(win, tw);
    const bh = Math.min(win, th);
    const half = win >> 1;
    const x0 = Math.min(Math.max(0, tx - half), tw - bw);
    const y0 = Math.min(Math.max(0, ty - half), th - bh);

    const need = bw * bh * 4;
    if (this.idWindow.length < need) this.idWindow = new Uint8Array(need);
    const buf = this.idWindow;
    this.renderer.readRenderTargetPixels(
      this.pickTarget!,
      x0,
      y0,
      bw,
      bh,
      buf,
      undefined,
      PICK_ID_ATTACHMENT,
    );

    // Scan the window: pick the highest-priority eligible topo, nearest to center.
    const filter = options.topoFilter;
    let bestId = BACKGROUND_ID;
    let bestRank = 0;
    let bestDist = Infinity;
    let bestX = -1;
    let bestY = -1;
    for (let row = 0; row < bh; row++) {
      for (let col = 0; col < bw; col++) {
        const o = (row * bw + col) * 4;
        const id = unpackId(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
        if (id === BACKGROUND_ID) continue;
        const info = this.registry.get(id);
        if (info === undefined) continue;
        if (!topoEligible(info.topo, filter)) continue;
        const rank = topoRank(info.topo);
        const px = x0 + col;
        const py = y0 + row;
        const dist = (px - tx) * (px - tx) + (py - ty) * (py - ty);
        if (rank > bestRank || (rank === bestRank && dist < bestDist)) {
          bestRank = rank;
          bestDist = dist;
          bestId = id;
          bestX = px;
          bestY = py;
        }
      }
    }
    if (bestId === BACKGROUND_ID) return null;
    const info = this.registry.get(bestId)!;

    // World-space hit point from the position attachment (w marks a written texel).
    // Skipped when the float attachment is unavailable (probe failed) → point = null.
    let point: THREE.Vector3 | null = null;
    if (this.positionSupported) {
      this.renderer.readRenderTargetPixels(
        this.pickTarget!,
        bestX,
        bestY,
        1,
        1,
        this.posPixel,
        undefined,
        PICK_POS_ATTACHMENT,
      );
      if (this.posPixel[3] !== 0) {
        point = new THREE.Vector3(
          this.posPixel[0],
          this.posPixel[1],
          this.posPixel[2],
        );
      }
    }
    return { id: bestId, info, point };
  }

  /** Lazily allocate / resize the MRT target and the per-topo pick materials. */
  private _ensureResources(tw: number, th: number): void {
    if (this.pickTarget === null) {
      this.pickTarget = createPickTargets(tw, th, this.positionSupported);
      this.dirty = true;
    } else if (this.pickTarget.width !== tw || this.pickTarget.height !== th) {
      this.pickTarget.setSize(tw, th);
      this.dirty = true;
    }
    if (
      this.faceMaterial === null ||
      this.edgeMaterial === null ||
      this.vertexMaterial === null
    ) {
      const opts = {
        clippingPlanes: this.clippingPlanes,
        clipIntersection: this.clipIntersection,
      };
      // Face pass carries no depth bias (bias 0 = the occluder reference plane).
      if (this.faceMaterial === null) this.faceMaterial = createFacePickMaterial(opts);
      if (this.edgeMaterial === null)
        this.edgeMaterial = createEdgePickMaterial({
          ...opts,
          depthBias: this._edgeDepthBias(),
        });
      if (this.vertexMaterial === null)
        this.vertexMaterial = createVertexPickMaterial({
          ...opts,
          depthBias: this._vertexDepthBias(),
        });
      this.compiledPlaneCount =
        this.clippingPlanes === null ? 0 : this.clippingPlanes.length;
      this.compiledIntersection = this.clipIntersection;
    }
    // The fat edge expansion is in screen space → keep resolution = target size.
    this.edgeMaterial.uniforms.resolution.value.set(tw, th);
  }

  /**
   * Render the per-topo pick passes into the MRT target, reusing the main camera.
   * Clears once, then accumulates **FACE → EDGE → VERTEX** (each drawn fat
   * and later, so higher-priority topos overwrite at coincident pixels). All
   * renderer state touched here is saved and restored.
   */
  private _renderPickBuffer(
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget,
  ): void {
    const renderer = this.renderer;
    const scene = this.scene!;

    const savedMask = camera.layers.mask;
    const savedOverride = scene.overrideMaterial;
    const savedTarget = renderer.getRenderTarget();
    const savedAlpha = renderer.getClearAlpha();
    const savedAutoClear = renderer.autoClear;
    renderer.getClearColor(this.savedClearColor);
    renderer.getViewport(this.savedViewport);

    try {
      renderer.autoClear = false; // passes accumulate into one cleared target
      renderer.setRenderTarget(target); // viewport follows the target size
      renderer.setClearColor(0x000000, 0); // 0 = BACKGROUND_ID
      renderer.clear();
      this._pass(camera, PICK_LAYER.FACE, this.faceMaterial!);
      this._pass(camera, PICK_LAYER.EDGE, this.edgeMaterial!);
      this._pass(camera, PICK_LAYER.VERTEX, this.vertexMaterial!);
    } finally {
      camera.layers.mask = savedMask;
      scene.overrideMaterial = savedOverride;
      renderer.setRenderTarget(savedTarget);
      renderer.setClearColor(this.savedClearColor, savedAlpha);
      renderer.setViewport(this.savedViewport);
      renderer.autoClear = savedAutoClear;
    }
  }

  /** One pick pass: render only `layer`'s objects with `material` (no clear).
   * Clipping planes are kept in sync solely by {@link setClippingPlanes} (and the
   * lazy material creation in {@link _ensureResources}); re-assigning them here per
   * pass would mutate `clippingPlanes` without `needsUpdate`, risking a stale
   * `NUM_CLIPPING_PLANES` if the count ever changed off that path. */
  private _pass(
    camera: THREE.Camera,
    layer: PickLayer,
    material: THREE.ShaderMaterial,
  ): void {
    const scene = this.scene!;
    camera.layers.set(layer);
    scene.overrideMaterial = material;
    this.renderer.render(scene, camera);
  }

  /** Release GPU resources (pick render target + materials). */
  dispose(): void {
    if (this.pickTarget !== null) {
      this.pickTarget.dispose();
      this.pickTarget = null;
    }
    for (const material of [
      this.faceMaterial,
      this.edgeMaterial,
      this.vertexMaterial,
    ]) {
      if (material === null) continue;
      gpuTracker.untrack("material", material);
      material.dispose();
    }
    this.faceMaterial = null;
    this.edgeMaterial = null;
    this.vertexMaterial = null;
    this.scene = null;
    this.camera = null;
  }
}
