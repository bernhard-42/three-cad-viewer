/**
 * Shape tessellation and decomposition for rendering CAD objects.
 */

import * as THREE from "three";
import { NestedGroup } from "./nestedgroup.js";
import { BoundingBox } from "./bbox.js";
import { flatten } from "./utils.js";
import { hasTrianglesPerFace, hasSegmentsPerEdge } from "./types.js";
import type { Shapes, Shape, VisibilityState } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Tree data structure for shape visibility navigation.
 * Maps object names to either nested tree data or visibility state.
 */
interface ShapeTreeData {
  [key: string]: ShapeTreeData | VisibilityState;
}

/**
 * Result from rendering tessellated shapes.
 */
interface RenderResult {
  group: NestedGroup;
  tree: ShapeTreeData;
}

/**
 * Configuration options for shape rendering.
 */
interface ShapeRenderConfig {
  cadWidth: number;
  height: number;
  edgeColor: number;
  transparent: boolean;
  defaultOpacity: number;
  metalness: number;
  roughness: number;
  normalLen: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/** Convert a hex color number to CSS hex string */
function hexToColorString(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

// =============================================================================
// ShapeRenderer Class
// =============================================================================

/**
 * Handles tessellation and decomposition of CAD shapes for rendering.
 */
class ShapeRenderer {
  private config: ShapeRenderConfig;
  private _bbox: BoundingBox | null = null;

  constructor(config: ShapeRenderConfig) {
    this.config = config;
  }

  /**
   * Get the computed bounding box (set after rendering if shapes.bb is defined).
   */
  get bbox(): BoundingBox | null {
    return this._bbox;
  }

  /**
   * Update configuration (e.g., when state changes).
   */
  updateConfig(config: Partial<ShapeRenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Render tessellated shapes of a CAD object.
   * @param shapes - The Shapes object representing the tessellated CAD object.
   * @returns A nested THREE.Group object.
   */
  private _renderTessellatedShapes(shapes: Shapes): NestedGroup {
    const nestedGroup = new NestedGroup(
      shapes,
      this.config.cadWidth,
      this.config.height,
      this.config.edgeColor,
      this.config.transparent,
      this.config.defaultOpacity,
      this.config.metalness,
      this.config.roughness,
      this.config.normalLen,
    );
    if (shapes.bb) {
      this._bbox = new BoundingBox(
        new THREE.Vector3(shapes.bb.xmin, shapes.bb.ymin, shapes.bb.zmin),
        new THREE.Vector3(shapes.bb.xmax, shapes.bb.ymax, shapes.bb.zmax),
      );
    }
    nestedGroup.render();
    return nestedGroup;
  }

  /**
   * Retrieve the navigation tree from a Shapes object.
   * @param shapes - The Shapes object.
   * @returns The navigation tree object.
   */
  private _getTree(shapes: Shapes): ShapeTreeData {
    const _getTree = (parts: Shapes[]): ShapeTreeData => {
      const result: ShapeTreeData = {};
      for (const part of parts) {
        if (part.parts != null) {
          result[part.name] = _getTree(part.parts);
        } else {
          result[part.name] = part.state as VisibilityState;
        }
      }
      return result;
    };
    const tree: ShapeTreeData = {};
    tree[shapes.name] = _getTree(shapes.parts ?? []);
    return tree;
  }

  /**
   * Decompose a CAD object into faces, edges and vertices.
   * @param part - The part to decompose.
   * @returns A decomposed part object.
   */
  private _decompose(part: Shapes): Shapes {
    const shape = part.shape!;
    let j: number;

    part.parts = [];

    if (part.type === "shapes") {
      // decompose faces
      const new_part: Shapes = {
        version: 2,
        name: "faces",
        id: `${part.id}/faces`,
        parts: [],
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
      };
      let triangles: Uint32Array | number[];
      // _convertArrays must be called before _decompose to ensure TypedArrays
      if (!(shape.vertices instanceof Float32Array)) {
        throw new Error("_decompose requires shape.vertices to be Float32Array (call _convertArrays first)");
      }
      if (!(shape.normals instanceof Float32Array)) {
        throw new Error("_decompose requires shape.normals to be Float32Array (call _convertArrays first)");
      }
      const vertices = shape.vertices;
      const normals = shape.normals;
      // Determine format and validate
      let current = 0;
      if (hasTrianglesPerFace(shape)) {
        // Binary format: flat Uint32Array with per-face counts
        if (!(shape.triangles instanceof Uint32Array)) {
          throw new Error("Expected Uint32Array for triangles in binary format");
        }
        const trianglesArray = shape.triangles;
        const perFace = shape.triangles_per_face;
        const num = perFace.length;
        for (j = 0; j < num; j++) {
          triangles = trianglesArray.subarray(
            current,
            current + 3 * perFace[j],
          );
          current += 3 * perFace[j];

          const vecs = new Float32Array(triangles.length * 3);
          const norms = new Float32Array(triangles.length * 3);
          for (let i = 0; i < triangles.length; i++) {
            const s = triangles[i];
            vecs[3 * i] = vertices[3 * s];
            vecs[3 * i + 1] = vertices[3 * s + 1];
            vecs[3 * i + 2] = vertices[3 * s + 2];
            norms[3 * i] = normals[3 * s];
            norms[3 * i + 1] = normals[3 * s + 1];
            norms[3 * i + 2] = normals[3 * s + 2];
          }
          const new_shape: Shapes = {
            version: 2,
            loc: [
              [0, 0, 0],
              [0, 0, 0, 1],
            ],
            name: `faces_${j}`,
            id: `${part.id}/faces/faces_${j}`,
            type: "shapes",
            color: part.color,
            alpha: part.alpha,
            renderback: true,
            state: [1, 3],
            accuracy: part.accuracy,
            bb: null,
            shape: {
              triangles: [...Array(triangles.length).keys()],
              vertices: Array.from(vecs),
              normals: Array.from(norms),
              edges: [],
              obj_vertices: [],
              edge_types: [],
              face_types: [shape.face_types[j]],
            },
          };
          if (part.texture) {
            new_shape.texture = part.texture;
          }
          new_shape.geomtype = shape.face_types[j];
          new_shape.subtype = part.subtype;
          new_shape.exploded = true;
          new_part.parts!.push(new_shape);
        }
      } else {
        // Non-binary format: nested number[][] arrays
        if (!Array.isArray(shape.triangles) || !Array.isArray(shape.triangles[0])) {
          throw new Error("Expected nested array for triangles in non-binary format");
        }
        // After validation, we know shape.triangles is number[][] (TypeScript can't infer this)
        const trianglesNested = shape.triangles as number[][];
        const num = trianglesNested.length;
        for (j = 0; j < num; j++) {
          triangles = trianglesNested[j];

          const vecs = new Float32Array(triangles.length * 3);
          const norms = new Float32Array(triangles.length * 3);
          for (let i = 0; i < triangles.length; i++) {
            const s = triangles[i];
            vecs[3 * i] = vertices[3 * s];
            vecs[3 * i + 1] = vertices[3 * s + 1];
            vecs[3 * i + 2] = vertices[3 * s + 2];
            norms[3 * i] = normals[3 * s];
            norms[3 * i + 1] = normals[3 * s + 1];
            norms[3 * i + 2] = normals[3 * s + 2];
          }
          const new_shape: Shapes = {
            version: 2,
            loc: [
              [0, 0, 0],
              [0, 0, 0, 1],
            ],
            name: `faces_${j}`,
            id: `${part.id}/faces/faces_${j}`,
            type: "shapes",
            color: part.color,
            alpha: part.alpha,
            renderback: true,
            state: [1, 3],
            accuracy: part.accuracy,
            bb: null,
            shape: {
              triangles: [...Array(triangles.length).keys()],
              vertices: Array.from(vecs),
              normals: Array.from(norms),
              edges: [],
              obj_vertices: [],
              edge_types: [],
              face_types: [shape.face_types[j]],
            },
          };
          if (part.texture) {
            new_shape.texture = part.texture;
          }
          new_shape.geomtype = shape.face_types[j];
          new_shape.subtype = part.subtype;
          new_shape.exploded = true;
          new_part.parts!.push(new_shape);
        }
      }

      part.parts.push(new_part);
    }

    if (part.type === "shapes" || part.type === "edges") {
      // decompose edges
      const new_part: Shapes = {
        version: 2,
        parts: [],
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        name: "edges",
        id: `${part.id}/edges`,
      };
      // Check if multiColor (array of colors per edge)
      const multiColorArray = Array.isArray(part.color) ? part.color : null;
      let color: string | string[] | undefined;
      let edge: Float32Array | number[];
      let current = 0;

      if (hasSegmentsPerEdge(shape)) {
        // Binary format: flat Float32Array with per-edge counts
        if (!(shape.edges instanceof Float32Array)) {
          throw new Error("Expected Float32Array for edges in binary format");
        }
        const edgesArray = shape.edges;
        const perEdge = shape.segments_per_edge;
        const num = perEdge.length;
        for (j = 0; j < num; j++) {
          edge = edgesArray.subarray(current, current + 6 * perEdge[j]);
          current += 6 * perEdge[j];
          color = multiColorArray ? multiColorArray[j] : part.color;
          const new_shape: Shapes = {
            version: 2,
            loc: [
              [0, 0, 0],
              [0, 0, 0, 1],
            ],
            name: `edges_${j}`,
            id: `${part.id}/edges/edges_${j}`,
            type: "edges",
            color:
              part.type === "shapes"
                ? hexToColorString(this.config.edgeColor)
                : color,
            state: [3, 1],
            bb: null,
            shape: {
              edges: Array.from(edge),
              vertices: [],
              normals: [],
              triangles: [],
              obj_vertices: [],
              edge_types: [shape.edge_types[j]],
              face_types: [],
            },
          };
          new_shape.width = part.type === "shapes" ? 1 : part.width;
          new_shape.geomtype = shape.edge_types[j];
          new_part.parts!.push(new_shape);
        }
      } else {
        // Non-binary format: nested number[][] arrays
        const edgesRaw = shape.edges;
        if (!Array.isArray(edgesRaw) || (edgesRaw.length > 0 && !Array.isArray(edgesRaw[0]))) {
          throw new Error("Expected nested array for edges in non-binary format");
        }
        // After validation, we know this is number[][] (TypeScript can't infer from the check)
        const edgesNested = edgesRaw as number[][];
        const num = edgesNested.length;
        for (j = 0; j < num; j++) {
          edge = edgesNested[j];
          color = multiColorArray ? multiColorArray[j] : part.color;
          const new_shape: Shapes = {
            version: 2,
            loc: [
              [0, 0, 0],
              [0, 0, 0, 1],
            ],
            name: `edges_${j}`,
            id: `${part.id}/edges/edges_${j}`,
            type: "edges",
            color:
              part.type === "shapes"
                ? hexToColorString(this.config.edgeColor)
                : color,
            state: [3, 1],
            bb: null,
            shape: {
              edges: edge,
              vertices: [],
              normals: [],
              triangles: [],
              obj_vertices: [],
              edge_types: [shape.edge_types[j]],
              face_types: [],
            },
          };
          new_shape.width = part.type === "shapes" ? 1 : part.width;
          new_shape.geomtype = shape.edge_types[j];
          new_part.parts!.push(new_shape);
        }
      }
      if (new_part.parts!.length > 0) {
        part.parts.push(new_part);
      }
    }

    // decompose vertices
    const new_part: Shapes = {
      version: 2,
      parts: [],
      loc: [
        [0, 0, 0],
        [0, 0, 0, 1],
      ],
      name: "vertices",
      id: `${part.id}/vertices`,
    };
    const vertices = shape.obj_vertices;
    for (j = 0; j < vertices.length / 3; j++) {
      const new_shape: Shapes = {
        version: 2,
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        name: `vertices_${j}`,
        id: `${part.id}/vertices/vertices_${j}`,
        type: "vertices",
        color:
          part.type === "shapes" || part.type === "edges"
            ? hexToColorString(this.config.edgeColor)
            : part.color,
        state: [3, 1],
        bb: null,
        shape: {
          obj_vertices: [
            vertices[3 * j],
            vertices[3 * j + 1],
            vertices[3 * j + 2],
          ],
          vertices: [],
          normals: [],
          triangles: [],
          edges: [],
          edge_types: [],
          face_types: [],
        },
      };
      new_shape.size =
        part.type === "shapes" || part.type === "edges" ? 4 : part.size;
      new_part.parts!.push(new_shape);
    }
    if (new_part.parts!.length > 0) {
      part.parts.push(new_part);
    }
    delete part.shape;
    delete part.color;
    delete part.alpha;
    delete part.accuracy;
    delete part.renderback;

    return part;
  }

  /**
   * Convert Shape arrays to TypedArrays for efficient rendering.
   * Note: This mutates the shape in place.
   */
  private _convertArrays(shape: Shape): void {
    // Mutable interface to allow TypedArray assignment
    interface MutableShape {
      triangles: number[] | number[][] | Uint32Array;
      edges: number[] | number[][] | Float32Array;
      vertices: number[] | Float32Array;
      normals: number[] | number[][] | Float32Array;
      obj_vertices: number[] | Float32Array;
      face_types: number[] | Uint32Array;
      edge_types: number[] | Uint8Array | Uint32Array;
      triangles_per_face?: number[] | Uint32Array;
      segments_per_edge?: number[] | Uint32Array;
    }

    // Shape interface matches MutableShape - we cast to allow reassignment
    const s: MutableShape = shape;

    // triangles: flat array or nested array -> Uint32Array
    // Note: Only flat triangles (with triangles_per_face) are converted here.
    // Nested triangles (number[][]) are kept as-is for _decompose to handle.
    if (s.triangles != null && !(s.triangles instanceof Uint32Array)) {
      // Only convert if it's a flat number[] (has triangles_per_face)
      if (s.triangles_per_face !== undefined) {
        if (!Array.isArray(s.triangles[0])) {
          s.triangles = new Uint32Array(s.triangles as number[]);
        }
      }
      // If no triangles_per_face, leave as number[][] for _decompose
    }

    // edges: nested number[][] -> Float32Array (flattened)
    // Only flatten if it's actually nested (no segments_per_edge means nested format)
    if (s.edges != null && !(s.edges instanceof Float32Array)) {
      if (s.segments_per_edge !== undefined) {
        // Binary format with flat edges - convert directly
        if (!Array.isArray(s.edges[0])) {
          s.edges = new Float32Array(s.edges as number[]);
        }
      }
      // If no segments_per_edge, leave as number[][] for _decompose
    }

    // vertices: always flat number[] -> Float32Array
    if (s.vertices != null && !(s.vertices instanceof Float32Array)) {
      s.vertices = new Float32Array(s.vertices as number[]);
    }

    // normals: flat or nested -> Float32Array
    // Only process if there are normals (non-empty array)
    if (s.normals != null && !(s.normals instanceof Float32Array)) {
      if (Array.isArray(s.normals) && s.normals.length > 0) {
        if (Array.isArray(s.normals[0])) {
          // Nested format: flatten first
          s.normals = new Float32Array(flatten(s.normals as number[][], 2));
        } else {
          // Already flat
          s.normals = new Float32Array(s.normals as number[]);
        }
      }
    }

    // obj_vertices: always flat number[] -> Float32Array
    if (s.obj_vertices != null && !(s.obj_vertices instanceof Float32Array)) {
      s.obj_vertices = new Float32Array(s.obj_vertices as number[]);
    }

    // face_types: number[] -> Uint32Array
    if (s.face_types != null && !(s.face_types instanceof Uint32Array)) {
      s.face_types = new Uint32Array(s.face_types);
    }

    // edge_types: number[] or Uint8Array -> Uint32Array
    if (s.edge_types != null && !(s.edge_types instanceof Uint32Array)) {
      if (s.edge_types instanceof Uint8Array) {
        s.edge_types = new Uint32Array(s.edge_types);
      } else {
        s.edge_types = new Uint32Array(s.edge_types);
      }
    }

    // triangles_per_face: number[] -> Uint32Array
    if (
      s.triangles_per_face != null &&
      !(s.triangles_per_face instanceof Uint32Array)
    ) {
      s.triangles_per_face = new Uint32Array(s.triangles_per_face);
    }

    // segments_per_edge: number[] -> Uint32Array
    if (
      s.segments_per_edge != null &&
      !(s.segments_per_edge instanceof Uint32Array)
    ) {
      s.segments_per_edge = new Uint32Array(s.segments_per_edge);
    }
  }

  /**
   * Recursively process shapes, converting arrays and decomposing parts.
   */
  private _processShapes(shapes: Shapes): Shapes {
    if (shapes.version === 2 || shapes.version === 3) {
      const parts: Shapes[] = [];
      for (let i = 0; i < (shapes.parts?.length ?? 0); i++) {
        const part = shapes.parts![i];
        if (part.shape != null) {
          this._convertArrays(part.shape);
        }
        if (part.parts != null) {
          const tmp = this._processShapes(part);
          parts.push(tmp);
        } else {
          parts.push(this._decompose(part));
        }
      }
      shapes.parts = parts;
    }
    return shapes;
  }

  /**
   * Render the shapes of the CAD object.
   * @param exploded - Whether to render the compact or exploded version
   * @param shapes - The Shapes object.
   * @returns A nested THREE.Group object and navigation tree.
   */
  render(exploded: boolean, shapes: Shapes): RenderResult {
    let processedShapes: Shapes;
    if (exploded) {
      processedShapes = this._processShapes(structuredClone(shapes));
    } else {
      processedShapes = structuredClone(shapes);
    }
    const group = this._renderTessellatedShapes(processedShapes);
    const tree = this._getTree(processedShapes);

    return { group, tree };
  }
}

export { ShapeRenderer };
export type { ShapeTreeData, RenderResult, ShapeRenderConfig };
