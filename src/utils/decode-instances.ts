/**
 * Decode the compressed/instanced shape format.
 *
 * The instanced format wraps a standard Shapes object:
 * ```
 * { instances: [ { vertices: {shape,dtype,buffer,codec}, ... }, ... ],
 *   shapes:    { version, parts, loc, name, id, bb, ... } }
 * ```
 *
 * Each instance contains base64-encoded geometry buffers. Parts reference
 * instances via `"shape": { "ref": N }`. After decoding, the result is a
 * standard Shapes tree with TypedArrays — identical to the existing format.
 */
import type { Shape, Shapes } from "../core/types.js";

// =============================================================================
// Types for the encoded format
// =============================================================================

/** A single base64-encoded buffer entry. */
interface EncodedBuffer {
  shape: number[];
  dtype: "float32" | "int32" | "uint32";
  buffer: string;
  codec: "b64";
}

/** An encoded geometry instance (all 9 buffer fields + optional uvs). */
interface EncodedInstance {
  vertices: EncodedBuffer;
  triangles: EncodedBuffer;
  normals: EncodedBuffer;
  edges: EncodedBuffer;
  obj_vertices: EncodedBuffer;
  face_types: EncodedBuffer;
  edge_types: EncodedBuffer;
  triangles_per_face: EncodedBuffer;
  segments_per_edge: EncodedBuffer;
  uvs?: EncodedBuffer;
}

/** Top-level structure of the instanced format. */
interface InstancedData {
  instances: EncodedInstance[];
  shapes: Shapes;
}

/** Shape reference (before resolution). */
interface ShapeRef {
  ref: number;
}

// =============================================================================
// Decoding
// =============================================================================

/** Decode a base64 string to a Uint8Array. */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decode a single encoded buffer entry to a typed array. */
function decodeBuffer(buf: EncodedBuffer): Float32Array | Uint32Array {
  const bytes = fromBase64(buf.buffer);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  switch (buf.dtype) {
    case "float32":
      return new Float32Array(arrayBuffer);
    case "int32":
    case "uint32":
      return new Uint32Array(arrayBuffer);
    default:
      throw new Error(`Unknown dtype: ${buf.dtype}`);
  }
}

/** Decode all buffer fields of an instance into a Shape object. */
function decodeInstance(inst: EncodedInstance): Shape {
  const shape: Shape = {
    vertices: decodeBuffer(inst.vertices) as Float32Array,
    triangles: decodeBuffer(inst.triangles) as Uint32Array,
    normals: decodeBuffer(inst.normals) as Float32Array,
    edges: decodeBuffer(inst.edges) as Float32Array,
    obj_vertices: decodeBuffer(inst.obj_vertices) as Float32Array,
    face_types: decodeBuffer(inst.face_types) as Uint32Array,
    edge_types: decodeBuffer(inst.edge_types) as Uint32Array,
    triangles_per_face: decodeBuffer(inst.triangles_per_face) as Uint32Array,
    segments_per_edge: decodeBuffer(inst.segments_per_edge) as Uint32Array,
  };
  if (inst.uvs) {
    shape.uvs = decodeBuffer(inst.uvs) as Float32Array;
  }
  return shape;
}

/** Check if a shape field is an unresolved reference. */
function isShapeRef(shape: unknown): shape is ShapeRef {
  return (
    typeof shape === "object" &&
    shape !== null &&
    "ref" in shape &&
    typeof (shape as ShapeRef).ref === "number"
  );
}

/**
 * Recursively walk the shapes tree and replace { ref: N } entries
 * with the corresponding decoded instance.
 *
 * Before decoding, `part.shape` may be `{ ref: N }` which doesn't match
 * the `Shape` type. We use `unknown` casts since this operates on raw
 * (pre-typed) data that is being transformed into the proper type.
 */
function resolveRefs(shapes: Shapes, decoded: Shape[]): void {
  if (shapes.parts) {
    for (const part of shapes.parts) {
      if (isShapeRef(part.shape as unknown)) {
        part.shape = decoded[(part.shape as unknown as ShapeRef).ref];
      }
      if (part.parts) {
        resolveRefs(part, decoded);
      }
    }
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Type guard: check if data is in the instanced format.
 * Detected by the presence of an `instances` array and a `shapes` object.
 */
function isInstancedFormat(data: unknown): data is InstancedData {
  return (
    typeof data === "object" &&
    data !== null &&
    "instances" in data &&
    Array.isArray((data as InstancedData).instances) &&
    "shapes" in data &&
    typeof (data as InstancedData).shapes === "object"
  );
}

/**
 * Decode the instanced format into a standard Shapes object.
 *
 * 1. Decode all instance buffers from base64 → TypedArrays
 * 2. Walk the shapes tree and replace { ref: N } with decoded instances
 * 3. Return the unwrapped Shapes object
 */
function decodeInstancedFormat(data: InstancedData): Shapes {
  // Decode all instances
  const decoded = data.instances.map(decodeInstance);

  // Resolve all shape references
  const shapes = data.shapes;
  resolveRefs(shapes, decoded);

  return shapes;
}

export { isInstancedFormat, decodeInstancedFormat };
export type { InstancedData, EncodedBuffer, EncodedInstance };
