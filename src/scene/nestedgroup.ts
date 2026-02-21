import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "../core/patches.js";
import { VertexNormalsHelper } from "three/examples/jsm/helpers/VertexNormalsHelper.js";
import { BoundingBox } from "./bbox.js";
import { ObjectGroup, isObjectGroup } from "./objectgroup.js";
import { MaterialFactory } from "../rendering/material-factory.js";
import { deepDispose, flatten } from "../utils/utils.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import type {
  ZebraColorScheme,
  ZebraMappingMode,
  Shapes,
  ColorValue,
  ColoredMaterial,
  MaterialAppearance,
  MaterialXMaterial,
  TextureEntry,
} from "../core/types";
import { isMaterialXMaterial } from "../core/types";
import { MATERIAL_PRESETS } from "../rendering/material-presets.js";
import { logger } from "../utils/logger.js";
import { TextureCache } from "../rendering/texture-cache.js";
import type { TextureCacheInterface } from "../rendering/material-factory.js";

interface ShapeData {
  vertices: Float32Array | number[][];
  normals: Float32Array | number[][];
  triangles: Uint32Array | number[][];
  edges?: Float32Array | number[][];
  uvs?: Float32Array | number[];
}

interface EdgeData {
  edges: Float32Array | number[][];
}

interface VertexData {
  obj_vertices: Float32Array | number[];
}

interface PolygonShape {
  refs: string[];
  matrices?: number[];
  height: number;
}

interface TextureData {
  format: string;
  data: string;
}

interface ShapeEntry {
  type: string;
  shape: ShapeData | EdgeData | VertexData | PolygonShape;
  id: string;
  name: string;
  color?: string | string[];
  alpha?: number;
  width?: number;
  size?: number;
  state: number[];
  loc?: [[number, number, number], [number, number, number, number]];
  renderback?: boolean;
  exploded?: boolean;
  geomtype?: number | null;
  subtype?: string | null;
  texture?: { image: TextureData; width: number; height: number };
  material?: string;
}

interface ShapeTree {
  id: string;
  loc?: [[number, number, number], [number, number, number, number]];
  parts: (ShapeEntry | ShapeTree)[];
  format?: string;
  instances?: Record<string, number[]>;
}

type GroupsMap = Record<string, ObjectGroup | CompoundGroup>;

/** Type guard to check if a shape entry has nested parts (is a ShapeTree) */
function isShapeTree(
  shape: ShapeEntry | ShapeTree | Shapes,
): shape is ShapeTree {
  return "parts" in shape;
}

/**
 * A THREE.Group for compound geometry that contains ObjectGroups.
 * Follows Three.js convention with type identifier and type guard property.
 */
class CompoundGroup extends THREE.Group {
  /** Type identifier following Three.js convention */
  override readonly type = "CompoundGroup";
  /** Type guard property following Three.js convention */
  readonly isCompoundGroup = true;
}

/**
 * Manages hierarchical 3D geometry rendering from tessellated CAD data.
 *
 * NestedGroup is the central scene graph manager that:
 * - Parses Shapes data into Three.js geometry
 * - Creates ObjectGroup instances for individual shapes, edges, and vertices
 * - Maintains a flat `groups` map for path-based access
 * - Handles materials, transparency, and clipping planes
 *
 * ## Architecture
 * ```
 * NestedGroup (manager)
 *   └── rootGroup (THREE.Group)
 *         └── CompoundGroup (per assembly)
 *               └── ObjectGroup (per shape/edge/vertex)
 *                     └── THREE.Mesh / LineSegments2
 * ```
 *
 * ## Key Methods
 * - `render()`: Build geometry from Shapes data
 * - `setTransparent()`: Toggle transparency mode
 * - `setClipPlanes()`: Apply clipping planes
 * - `groups[path]`: Access ObjectGroup by path
 *
 * @internal - This is an internal class used by Viewer
 */

/** Texture field names on MaterialAppearance that require UV coordinates. */
const TEXTURE_FIELDS = [
  "baseColorTexture", "normalTexture", "occlusionTexture",
  "metallicRoughnessTexture", "emissiveTexture", "transmissionTexture",
  "clearcoatTexture", "clearcoatRoughnessTexture", "clearcoatNormalTexture",
  "thicknessTexture", "specularIntensityTexture", "specularColorTexture",
  "sheenColorTexture", "sheenRoughnessTexture", "anisotropyTexture",
] as const;

/** Check whether a resolved MaterialAppearance references any texture. */
function materialHasTexture(def: MaterialAppearance): boolean {
  for (const f of TEXTURE_FIELDS) {
    if ((def as Record<string, unknown>)[f]) return true;
  }
  return false;
}

/** Check whether a materialx-db entry has texture references in its params. */
function materialXHasTextures(entry: MaterialXMaterial): boolean {
  for (const [key, value] of Object.entries(entry.params)) {
    // colorOverride removes "map", but other texture params may still exist
    if (entry.colorOverride && key === "map") continue;
    if (typeof value === "string" && value.startsWith("textures/")) return true;
  }
  return false;
}

/**
 * Generate box-projected UV coordinates for a BufferGeometry that lacks them.
 *
 * For each triangle, the dominant axis of the face normal selects the
 * projection plane (XY, XZ, or YZ). UVs are normalized to [0, 1] based on
 * the geometry's own bounding box so the texture tiles once across the part.
 */
function generateBoxProjectedUVs(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  if (!pos || !nor) return;

  // Compute bounding box for normalization
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  // Avoid division by zero on degenerate axes
  const sx = size.x > 1e-6 ? size.x : 1;
  const sy = size.y > 1e-6 ? size.y : 1;
  const sz = size.z > 1e-6 ? size.z : 1;

  const index = geometry.getIndex();
  const vertexCount = pos.count;
  const uvs = new Float32Array(vertexCount * 2);

  const triCount = index ? index.count / 3 : vertexCount / 3;
  const faceNormal = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    // Average face normal from vertex normals
    faceNormal.set(
      nor.getX(i0) + nor.getX(i1) + nor.getX(i2),
      nor.getY(i0) + nor.getY(i1) + nor.getY(i2),
      nor.getZ(i0) + nor.getZ(i1) + nor.getZ(i2),
    );
    const ax = Math.abs(faceNormal.x);
    const ay = Math.abs(faceNormal.y);
    const az = Math.abs(faceNormal.z);

    for (const vi of [i0, i1, i2]) {
      let u: number, v: number;
      if (ax >= ay && ax >= az) {
        // Project onto YZ plane
        u = (pos.getY(vi) - bb.min.y) / sy;
        v = (pos.getZ(vi) - bb.min.z) / sz;
      } else if (ay >= ax && ay >= az) {
        // Project onto XZ plane
        u = (pos.getX(vi) - bb.min.x) / sx;
        v = (pos.getZ(vi) - bb.min.z) / sz;
      } else {
        // Project onto XY plane
        u = (pos.getX(vi) - bb.min.x) / sx;
        v = (pos.getY(vi) - bb.min.y) / sy;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
}

class NestedGroup {
  shapes!: Shapes;
  width: number;
  height: number;
  edgeColor: number;
  transparent: boolean;
  metalness: number;
  roughness: number;
  defaultOpacity: number;
  normalLen: number;
  blackEdges: boolean;
  backVisible: boolean;
  bb_max: number;
  delim: string;
  rootGroup: THREE.Group | null;
  instances: Record<string, number[]> | null;
  bbox: BoundingBox | null;
  bsphere: THREE.Sphere | null;
  groups!: GroupsMap; // Initialized to {} in constructor
  clipPlanes: THREE.Plane[] | null;
  materialFactory: MaterialFactory;
  texturesTable: Record<string, TextureEntry> | null;
  materialsTable: Record<string, string | MaterialXMaterial> | null;
  resolvedMaterials: Map<string, MaterialAppearance>;
  /** Cache for materialx-db entries resolved from the materials table */
  resolvedMaterialX: Map<string, MaterialXMaterial>;
  private _textureCache: TextureCache | null;
  private _studioMaterialCache: Map<string, THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial>;
  /** Sharing keys of materials that have textures (for UV generation on cache hits) */
  private _texturedMaterialKeys: Set<string>;
  private _isStudioMode: boolean;

  /**
   * Create a NestedGroup for rendering CAD geometry.
   * @param shapes - The tessellated shape data to render.
   * @param width - Canvas/viewport width for line material resolution.
   * @param height - Canvas/viewport height for line material resolution.
   * @param edgeColor - Default edge color as hex value (e.g., 0x000000).
   * @param transparent - Whether to render shapes with transparency.
   * @param opacity - Default opacity value (0.0 to 1.0).
   * @param metalness - Material metalness value (0.0 to 1.0).
   * @param roughness - Material roughness value (0.0 to 1.0).
   * @param normalLen - Length for vertex normal helpers (0 to disable).
   * @param bb_max - Maximum bounding box dimension.
   */
  constructor(
    shapes: Shapes,
    width: number,
    height: number,
    edgeColor: number,
    transparent: boolean,
    opacity: number,
    metalness: number,
    roughness: number,
    normalLen: number,
    bb_max: number = 0,
  ) {
    this.shapes = shapes;
    this.width = width;
    this.height = height;
    this.edgeColor = edgeColor;
    this.transparent = transparent;
    this.metalness = metalness;
    this.roughness = roughness;
    this.defaultOpacity = opacity;
    this.normalLen = normalLen;
    this.blackEdges = false;
    this.backVisible = false;
    this.bb_max = bb_max;
    this.delim = "|";
    this.rootGroup = null;
    this.instances = null;
    this.bbox = null;
    this.bsphere = null;
    this.groups = {};

    this.clipPlanes = null;

    this.texturesTable = null;
    this.materialsTable = null;
    this.resolvedMaterials = new Map();
    this.resolvedMaterialX = new Map();
    this._textureCache = null;
    this._studioMaterialCache = new Map();
    this._texturedMaterialKeys = new Set();
    this._isStudioMode = false;

    this.materialFactory = new MaterialFactory({
      defaultOpacity: opacity,
      metalness: metalness,
      roughness: roughness,
      edgeColor: edgeColor,
      transparent: transparent,
    });
  }

  /**
   * Dispose of all resources and clean up memory.
   */
  dispose(): void {
    if (Object.keys(this.groups).length > 0) {
      deepDispose(Object.values(this.groups));
      this.groups = {};
    }
    if (this.rootGroup) {
      deepDispose(this.rootGroup);
      this.rootGroup = null;
    }
    this._disposeStudioResources();
    this.resolvedMaterials.clear();
    this.resolvedMaterialX.clear();
    this.texturesTable = null;
    this.materialsTable = null;
  }

  /**
   * Resolve a material tag to its definition.
   *
   * Returns either a MaterialAppearance (for builtin presets) or a
   * MaterialXMaterial (for materialx-db entries). The caller must check the
   * return type to determine which factory method to use.
   *
   * Resolution order:
   * 1. Check caches (resolvedMaterials / resolvedMaterialX)
   * 2. Look up in root-level `materials` table:
   *    - string starting with "builtin:" → MATERIAL_PRESETS lookup
   *    - object with `params` key → materialx-db entry
   * 3. Direct lookup in MATERIAL_PRESETS by tag name
   * 4. No match → warning, return null
   *
   * @param tag - The material tag from a leaf node
   * @param objectPath - The object path (for warning messages)
   * @returns Resolved material definition or null if not found
   */
  resolveMaterialTag(
    tag: string,
    objectPath: string,
  ): MaterialAppearance | MaterialXMaterial | null {
    // Empty string is equivalent to no tag -- skip silently
    if (tag === "") {
      return null;
    }

    // Check caches
    const cachedPreset = this.resolvedMaterials.get(tag);
    if (cachedPreset !== undefined) return cachedPreset;

    const cachedMX = this.resolvedMaterialX.get(tag);
    if (cachedMX !== undefined) return cachedMX;

    // 1. Look up in user-defined materials table
    if (this.materialsTable && tag in this.materialsTable) {
      const entry = this.materialsTable[tag];

      // String entry: "builtin:<preset-name>"
      if (typeof entry === "string") {
        if (entry.startsWith("builtin:")) {
          const presetName = entry.slice(8);
          const preset = MATERIAL_PRESETS[presetName];
          if (preset) {
            const resolved = { ...preset };
            this.resolvedMaterials.set(tag, resolved);
            return resolved;
          }
          logger.warn(
            `Unknown builtin preset '${presetName}' referenced by '${tag}' on '${objectPath}'`,
          );
          return null;
        }
        logger.warn(
          `Invalid material string '${entry}' for tag '${tag}' (expected "builtin:" prefix)`,
        );
        return null;
      }

      // MaterialXMaterial entry: object with `params` key
      if (isMaterialXMaterial(entry)) {
        this.resolvedMaterialX.set(tag, entry);
        return entry;
      }

      // Should not happen with current type, but guard anyway
      logger.warn(`Unrecognised material entry for tag '${tag}' on '${objectPath}'`);
      return null;
    }

    // 2. Direct lookup in built-in presets (leaf tag matches preset name)
    const preset = MATERIAL_PRESETS[tag];
    if (preset) {
      const resolved = { ...preset };
      this.resolvedMaterials.set(tag, resolved);
      return resolved;
    }

    // 3. No match
    logger.warn(`Unknown material tag '${tag}' on object '${objectPath}'`);
    return null;
  }

  /**
   * Check if array is nested (number[][]).
   */
  private _isNestedArray(data: number[] | number[][]): data is number[][] {
    return data.length > 0 && Array.isArray(data[0]);
  }

  /**
   * Convert array data to Float32Array, detecting nested arrays at runtime.
   */
  private _toFloat32Array(
    data: Float32Array | number[] | number[][],
    depth: number = 1,
  ): Float32Array {
    if (data instanceof Float32Array) {
      return data;
    }
    if (this._isNestedArray(data)) {
      return new Float32Array(flatten(data, depth));
    }
    return new Float32Array(data);
  }

  /**
   * Convert array data to Uint32Array, detecting nested arrays at runtime.
   */
  private _toUint32Array(
    data: Uint32Array | number[] | number[][],
    depth: number = 1,
  ): Uint32Array {
    if (data instanceof Uint32Array) {
      return data;
    }
    if (this._isNestedArray(data)) {
      return new Uint32Array(flatten(data, depth));
    }
    return new Uint32Array(data);
  }

  /**
   * Internal method to render edge geometry as fat lines.
   */
  private _renderEdges(
    edgeList: Float32Array | number[] | number[][],
    lineWidth: number,
    color: ColorValue | ColorValue[] | null,
    state: number,
    label?: string,
  ): LineSegments2 {
    const positions = this._toFloat32Array(edgeList, 3);

    const lineGeometry = gpuTracker.trackGeometry(
      new LineSegmentsGeometry(),
      label
        ? `LineSegmentsGeometry for ${label}`
        : "LineSegmentsGeometry (edges)",
    );
    lineGeometry.setPositions(positions);

    // Handle vertex colors for multi-colored edges (e.g., trihedron axes)
    if (Array.isArray(color)) {
      const colors = color
        .map((c) => {
          const col = new THREE.Color(c);
          return [col.r, col.g, col.b, col.r, col.g, col.b];
        })
        .flat();
      lineGeometry.setColors(new Float32Array(colors));
    }

    const lineMaterial = this.materialFactory.createEdgeMaterial(
      {
        lineWidth,
        color: Array.isArray(color) ? null : (color ?? this.edgeColor),
        vertexColors: Array.isArray(color),
        visible: state == 1,
        resolution: { width: this.width, height: this.height },
      },
      label ? `LineMaterial for ${label}` : "LineMaterial (edges)",
    );

    const edges = new LineSegments2(lineGeometry, lineMaterial);
    edges.renderOrder = 999;

    return edges;
  }

  /**
   * Render standalone edge geometry (not associated with a face).
   */
  renderEdges(
    edgeData: EdgeData,
    lineWidth: number,
    color: ColorValue | ColorValue[] | null,
    path: string,
    name: string,
    state: number,
    geomtype: { topo: string; geomtype: number | string | null } | null = null,
  ): ObjectGroup {
    // For vertex colors (array), use default edge color for the group
    const groupColor = Array.isArray(color)
      ? this.edgeColor
      : (color ?? this.edgeColor);
    const group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      groupColor,
      geomtype,
      "edges",
    );

    const edges = this._renderEdges(
      edgeData.edges,
      lineWidth,
      color,
      state,
      path,
    );
    if (name) {
      edges.name = name;
    }
    group.setEdges(edges);

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    return group;
  }

  /**
   * Render vertex points as a point cloud.
   */
  renderVertices(
    vertexData: VertexData,
    size: number,
    color: ColorValue | null,
    path: string,
    name: string,
    state: number,
    geomtype: { topo: string; geomtype: number | string | null } | null = null,
  ): ObjectGroup {
    const group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      color ?? this.edgeColor,
      geomtype,
      "vertices",
    );

    const positions = this._toFloat32Array(vertexData.obj_vertices);

    const geometry = gpuTracker.trackGeometry(
      new THREE.BufferGeometry(),
      `BufferGeometry (vertices) for ${path}`,
    );
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    const material = this.materialFactory.createVertexMaterial(
      {
        size: size,
        color: color,
        visible: state == 1,
      },
      `PointsMaterial for ${path}`,
    );

    const points = new THREE.Points(geometry, material);
    if (name) {
      points.name = name;
    }
    group.setVertices(points);

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    return group;
  }

  /**
   * Render a tessellated 3D shape with front/back faces and optional edges.
   */
  renderShape(
    shape: ShapeData,
    color: ColorValue,
    alpha: number | null,
    renderback: boolean,
    exploded: boolean,
    path: string,
    name: string,
    states: number[],
    geomtype: { topo: string; geomtype: number | string | null } | null = null,
    subtype: string | null = null,
    texture_data: TextureData | null = null,
    texture_width: number | null = null,
    texture_height: number | null = null,
  ): ObjectGroup {
    const positions = this._toFloat32Array(shape.vertices);
    const normals = this._toFloat32Array(shape.normals);
    const triangles = this._toUint32Array(shape.triangles);

    const group = new ObjectGroup(
      this.defaultOpacity,
      alpha ?? 1.0,
      this.edgeColor,
      geomtype,
      subtype,
      renderback,
    );

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    if (alpha == null) {
      alpha = 1.0;
    } else if (alpha < 1.0) {
      this.transparent = true;
    }

    let shapeGeometry: THREE.BufferGeometry | THREE.PlaneGeometry;
    let texture: THREE.Texture | null = null;
    let frontMaterial: ColoredMaterial;

    if (texture_data != null) {
      const url = `data:image/${texture_data.format};base64,${texture_data.data}`;
      const img = new Image();
      shapeGeometry = gpuTracker.trackGeometry(
        new THREE.PlaneGeometry(texture_width!, texture_height!),
        `PlaneGeometry (textured) for ${path}`,
      );

      texture = gpuTracker.trackTexture(
        new THREE.Texture(img),
        `Texture for ${path}`,
      );
      texture.colorSpace = THREE.SRGBColorSpace;

      // Set src after texture is created, and mark needsUpdate in onload handler
      // to avoid "Texture marked for update but image is incomplete" warning
      img.onload = () => {
        texture!.needsUpdate = true;
      };
      img.src = url;

      frontMaterial = this.materialFactory.createTextureMaterial(
        { texture },
        `MeshBasicMaterial (textured) for ${path}`,
      );
      renderback = false;
    } else {
      shapeGeometry = gpuTracker.trackGeometry(
        new THREE.BufferGeometry(),
        `BufferGeometry (shape) for ${path}`,
      );
      shapeGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      shapeGeometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(normals, 3),
      );
      shapeGeometry.setIndex(new THREE.BufferAttribute(triangles, 1));
      if (shape.uvs && shape.uvs.length > 0) {
        const uvArray = shape.uvs instanceof Float32Array
          ? shape.uvs
          : new Float32Array(shape.uvs);
        shapeGeometry.setAttribute(
          "uv",
          new THREE.BufferAttribute(uvArray, 2),
        );
      }
      group.shapeGeometry = shapeGeometry;

      frontMaterial = this.materialFactory.createFrontFaceMaterial(
        {
          color: color,
          alpha: alpha,
          visible: states[0] == 1,
        },
        `MeshStandardMaterial (front) for ${path}`,
      );
      frontMaterial.name = "frontMaterial";
    }

    const backColor =
      group.subtype === "solid" && !exploded
        ? color
        : new THREE.Color(this.edgeColor)
            .lerp(new THREE.Color(1, 1, 1), 0.15)
            .getHex();

    const backMaterial = this.materialFactory.createBackFaceBasicMaterial(
      {
        color: backColor,
        alpha: alpha,
        visible: states[0] == 1 && (renderback || this.backVisible),
      },
      `MeshBasicMaterial (back) for ${path}`,
    );
    backMaterial.name = "backMaterial";

    const back = new THREE.Mesh(shapeGeometry, backMaterial);
    back.name = name;

    const front = new THREE.Mesh(shapeGeometry, frontMaterial);
    front.name = name;

    // ensure, transparent objects will be rendered at the end
    if (alpha < 1.0) {
      back.renderOrder = 999;
      front.renderOrder = 999;
    }

    if (front.geometry.boundingBox == null) {
      front.geometry.computeBoundingBox();
    }

    group.setBack(back);
    group.setFront(front);

    if (this.normalLen > 0) {
      const normalsHelper = new VertexNormalsHelper(
        front,
        this.normalLen,
        0xff00ff,
      );
      group.add(normalsHelper);
    }

    const edgeList = shape.edges;
    if (edgeList && edgeList.length > 0) {
      const edges = this._renderEdges(edgeList, 1, null, states[1], path);
      edges.name = name;
      group.setEdges(edges);
    }

    return group;
  }

  /**
   * Create edge geometry from extruded polygons.
   */
  private _createEdgesFromPolygons(
    polygons: THREE.Shape[],
    depth: number,
  ): THREE.BufferGeometry {
    const vertices: THREE.Vector3[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (let j = 0; j < polygons.length; j++) {
      const polygon = polygons[j];
      const points = polygon.getPoints(); // Get 2D polygon points
      const bottomPoints = points.map((p) => new THREE.Vector3(p.x, p.y, 0));
      const topPoints = points.map((p) => new THREE.Vector3(p.x, p.y, depth));

      // Add bottom and top perimeter edges
      const addPerimeter = (perimeterPoints: THREE.Vector3[]) => {
        for (let i = 0; i < perimeterPoints.length; i++) {
          const nextIndex = (i + 1) % perimeterPoints.length;
          indices.push(vertexOffset + i, vertexOffset + nextIndex);
        }
        vertices.push(...perimeterPoints);
        vertexOffset += perimeterPoints.length;
      };

      addPerimeter(bottomPoints);
      addPerimeter(topPoints);

      // Add vertical edges between corresponding points
      for (let i = 0; i < points.length; i++) {
        indices.push(
          vertexOffset - 2 * points.length + i, // Bottom point index
          vertexOffset - points.length + i, // Top point index
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(vertices);
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Render extruded 2D polygons (GDS format) as 3D geometry.
   */
  renderPolygons(
    shape: PolygonShape,
    minZ: number,
    color: ColorValue,
    alpha: number,
    renderback: boolean,
    _exploded: boolean,
    path: string,
    name: string,
    states: number[],
    geomtype: { topo: string; geomtype: number | string | null } | null = null,
    subtype: string | null = null,
  ): ObjectGroup {
    const group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      this.edgeColor,
      geomtype,
      subtype,
      renderback,
    );
    group.name = path.replaceAll("/", this.delim);
    group.minZ = minZ;
    group.height = shape.height;

    this.groups[path] = group;

    const polygons: THREE.Shape[] = [];
    let matrices: number[];
    if (shape.matrices && shape.matrices.length > 0) {
      matrices = shape.matrices;
    } else {
      matrices = [1, 0, 0, 0, 1, 0];
    }
    for (const ref of shape.refs) {
      const vertices = this.instances![ref];
      const n = vertices.length / 2;
      const points = new Array<THREE.Vector2>(n);
      for (let i = 0; i < matrices.length / 6; i++) {
        const a = matrices[6 * i];
        const b = matrices[6 * i + 1];
        const x = matrices[6 * i + 2];
        const d = matrices[6 * i + 3];
        const e = matrices[6 * i + 4];
        const y = matrices[6 * i + 5];
        for (let j = 0; j < n; j++) {
          points[j] = new THREE.Vector2(
            a * vertices[2 * j] + b * vertices[2 * j + 1] + x,
            d * vertices[2 * j] + e * vertices[2 * j + 1] + y,
          );
        }

        const polygon = new THREE.Shape(points);
        polygons.push(polygon);
      }
    }

    const extrudeSettings = {
      depth: shape.height,
      bevelEnabled: false,
    };
    const polyGeometry = gpuTracker.trackGeometry(
      new THREE.ExtrudeGeometry(polygons, extrudeSettings),
      `ExtrudeGeometry (polygon) for ${path}`,
    );

    const frontMaterial = this.materialFactory.createFrontFaceMaterial(
      {
        color: color,
        alpha: alpha,
        visible: states[0] == 1,
      },
      `MeshStandardMaterial (front polygon) for ${path}`,
    );
    frontMaterial.name = "frontMaterial";

    const backMaterial = this.materialFactory.createBackFaceStandardMaterial(
      {
        color: color,
        alpha: alpha,
        visible: states[0] == 1 && (renderback || this.backVisible),
      },
      `MeshStandardMaterial (back polygon) for ${path}`,
    );
    backMaterial.name = "backMaterial";

    const back = new THREE.Mesh(polyGeometry, backMaterial);
    back.name = name;
    const front = new THREE.Mesh(polyGeometry, frontMaterial);
    front.name = name;

    // Edges
    const edgeGeom = gpuTracker.trackGeometry(
      this._createEdgesFromPolygons(polygons, shape.height),
      `BufferGeometry (polygon edges) for ${path}`,
    );

    const lineMat = this.materialFactory.createSimpleEdgeMaterial(
      {},
      `LineBasicMaterial (polygon edges) for ${path}`,
    );

    const polyEdges = new THREE.LineSegments(edgeGeom, lineMat);

    group.shapeGeometry = polyGeometry;
    group.setFront(front);
    group.setBack(back);
    group.setEdges(polyEdges);

    return group;
  }

  /**
   * Recursively render all shapes in the shape tree.
   * Note: The shapes parameter uses the public Shapes type but internally
   * contains ShapeEntry/ShapeTree data after decomposition by viewer._decompose()
   */
  renderLoop(shapes: Shapes): THREE.Group {
    const _render = (
      shape: ShapeEntry,
      texture: TextureData | null,
      width: number | null,
      height: number | null,
    ): ObjectGroup => {
      let mesh: ObjectGroup;
      switch (shape.type) {
        case "edges":
          mesh = this.renderEdges(
            shape.shape as EdgeData,
            shape.width!,
            shape.color as ColorValue | ColorValue[] | null,
            shape.id,
            shape.name,
            shape.state[1],
            { topo: "edge", geomtype: shape.geomtype || null },
          );
          break;
        case "vertices":
          mesh = this.renderVertices(
            shape.shape as VertexData,
            shape.size!,
            (shape.color as ColorValue) ?? null,
            shape.id,
            shape.name,
            shape.state[1],
            { topo: "vertex", geomtype: null },
          );
          break;
        case "polygon":
          mesh = this.renderPolygons(
            shape.shape as PolygonShape,
            shape.loc![0][2],
            (shape.color as ColorValue) ?? this.edgeColor,
            1.0,
            shape.renderback == null ? false : shape.renderback,
            false, //exploded
            shape.id,
            shape.name,
            shape.state,
            { topo: "face", geomtype: shape.geomtype || null },
            shape.subtype || null,
          );
          break;
        default: {
          // Shape color must be a single value, not an array
          const shapeColor = Array.isArray(shape.color)
            ? shape.color[0]
            : shape.color;
          mesh = this.renderShape(
            shape.shape as ShapeData,
            shapeColor ?? this.edgeColor,
            shape.alpha ?? null,
            shape.renderback == null ? false : shape.renderback,
            shape.exploded ?? false,
            shape.id,
            shape.name,
            shape.state,
            { topo: "face", geomtype: shape.geomtype || null },
            shape.subtype || null,
            texture,
            width,
            height,
          );
        }
      }
      // support object locations
      if (shape.loc != null) {
        mesh.position.set(...shape.loc[0]);
        mesh.quaternion.set(...shape.loc[1]);
      }
      return mesh;
    };

    const group = new CompoundGroup();
    if (shapes.loc == null) {
      shapes.loc = [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
      ];
    }
    group.position.set(...shapes.loc[0]);
    group.quaternion.set(...shapes.loc[1]);

    this.groups[shapes.id] = group;
    group.name = shapes.id.replaceAll("/", "|");

    // shapes.parts contains ShapeEntry | ShapeTree after viewer._decompose()
    for (const shape of shapes.parts!) {
      if (isShapeTree(shape)) {
        group.add(this.renderLoop(shape));
      } else {
        const entry = shape as ShapeEntry;
        // Propagate material tag from shapes data to local ShapeEntry
        const materialTag = (shape as Shapes).material;
        if (materialTag != null) {
          entry.material = materialTag;
        }
        const has_texture = entry.texture != null;
        const texture = has_texture ? entry.texture!.image : null;
        const width = has_texture ? entry.texture!.width : null;
        const height = has_texture ? entry.texture!.height : null;
        const objectGroup = _render(entry, texture, width, height);
        this.groups[entry.id] = objectGroup;
        // Store material tag on ObjectGroup for Studio mode lookup
        if (entry.material !== undefined && entry.material !== null) {
          objectGroup.materialTag = entry.material;
        }
        group.add(objectGroup);
      }
    }
    return group;
  }

  /**
   * Main entry point to render all shapes.
   */
  render(): THREE.Group {
    if (this.shapes.format == "GDS") {
      this.instances = this.shapes.instances || null;
    }
    this.texturesTable = this.shapes.textures || null;
    this.materialsTable = this.shapes.materials || null;
    this.resolvedMaterials.clear();
    this.resolvedMaterialX.clear();
    this.rootGroup = this.renderLoop(this.shapes);
    return this.rootGroup;
  }

  /**
   * Get the bounding box of all rendered geometry.
   */
  boundingBox(): BoundingBox {
    if (this.bbox == null) {
      this.bbox = new BoundingBox();
      this.bbox.setFromObject(this.rootGroup!, false);
    }
    return this.bbox;
  }

  /**
   * Traverse all ObjectGroup instances and call a method on each.
   * Note: Uses dynamic dispatch for methods that exist on ObjectGroup.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _traverse(func: string, flag?: any): void {
    for (const path in this.groups) {
      const obj = this.groups[path];
      if (obj instanceof ObjectGroup) {
        const method = obj[func];
        if (typeof method === "function") {
          method.call(obj, flag);
        }
      }
    }
  }

  /**
   * Get all currently selected ObjectGroup instances.
   */
  selection(): ObjectGroup[] {
    const result: ObjectGroup[] = [];
    for (const path in this.groups) {
      for (const obj of this.groups[path].children) {
        if (obj instanceof ObjectGroup) {
          if (obj.isSelected) {
            result.push(obj);
          }
        }
      }
    }
    return result;
  }

  /**
   * Clear selection and highlights from all selected objects.
   */
  clearSelection(): void {
    for (const object of this.selection()) {
      object.clearHighlights();
    }
  }

  /**
   * Set metalness value for all materials.
   */
  setMetalness(value: number): void {
    this.metalness = value;
    this.materialFactory.update({ metalness: value });
    this._traverse("setMetalness", value);
  }

  /**
   * Set roughness value for all materials.
   */
  setRoughness(value: number): void {
    this.roughness = value;
    this.materialFactory.update({ roughness: value });
    this._traverse("setRoughness", value);
  }

  /**
   * Enable or disable transparency for all shapes.
   */
  setTransparent(flag: boolean): void {
    this.transparent = flag;
    this.materialFactory.update({ transparent: flag });
    this._traverse("setTransparent", flag);
  }

  /**
   * Set whether edges should be rendered in black.
   */
  setBlackEdges(flag: boolean): void {
    this.blackEdges = flag;
    this._traverse("setBlackEdges", flag);
  }

  /**
   * Set visibility of back faces.
   */
  setBackVisible(flag: boolean): void {
    this.backVisible = flag;
    this._traverse("setBackVisible", flag);
  }

  /**
   * Set the edge color for all shapes.
   */
  setEdgeColor(color: number): void {
    this.edgeColor = color;
    this._traverse("setEdgeColor", color);
  }

  /**
   * Set the opacity for all shapes.
   */
  setOpacity(opacity: number): void {
    this.defaultOpacity = opacity;
    this._traverse("setOpacity", opacity);
  }

  /**
   * Set clip intersection mode for all materials.
   */
  setClipIntersection(flag: boolean): void {
    this._traverse("setClipIntersection", flag);
  }

  /**
   * Set clipping planes for all materials.
   */
  setClipPlanes(planes: THREE.Plane[]): void {
    this.clipPlanes = planes;
    this._traverse("setClipPlanes", planes);
  }

  /**
   * Set polygon offset for depth sorting.
   */
  setPolygonOffset(offset: number): void {
    this._traverse("setPolygonOffset", offset);
  }

  /**
   * Set Z-axis scale for all shapes (used for GDS extrusion visualization).
   */
  setZScale(value: number): void {
    this._traverse("setZScale", value);
  }

  /**
   * Reset minimum Z position for all shapes.
   */
  setMinZ(): void {
    this._traverse("setMinZ");
  }

  /**
   * Mark all materials as needing update.
   */
  updateMaterials(): void {
    this._traverse("updateMaterials", true);
  }

  /**
   * Enable or disable zebra stripe visualization.
   */
  setZebra(flag: boolean): void {
    this._traverse("setZebra", flag);
  }

  /**
   * Set the number of zebra stripes.
   */
  setZebraCount(value: number): void {
    this._traverse("setZebraCount", value);
  }

  /**
   * Set the opacity of zebra stripes.
   */
  setZebraOpacity(value: number): void {
    this._traverse("setZebraOpacity", value);
  }

  /**
   * Set the direction/angle of zebra stripes.
   */
  setZebraDirection(value: number): void {
    this._traverse("setZebraDirection", value);
  }

  /**
   * Set the color scheme for zebra stripes.
   */
  setZebraColorScheme(flag: ZebraColorScheme): void {
    this._traverse("setZebraColorScheme", flag);
  }

  /**
   * Set the mapping mode for zebra stripes.
   */
  setZebraMappingMode(flag: ZebraMappingMode): void {
    this._traverse("setZebraMappingMode", flag);
  }

  // ===========================================================================
  // Studio Mode
  // ===========================================================================

  /**
   * Enter Studio mode: build and apply studio materials to all ObjectGroups.
   *
   * Material resolution per ObjectGroup:
   * 1. Resolve the material tag via `resolveMaterialTag()`
   *    - MaterialXMaterial  → `createStudioMaterialFromMaterialX`
   *    - MaterialAppearance → `createStudioMaterial` (builtin presets)
   *    - null (no tag)      → fallback plastic-glossy preset tinted with CAD color
   * 2. Cache by sharing key for reuse across objects with the same tag+color
   * 3. Clone BackSide variant for renderback objects
   * 4. Auto-generate box-projected UVs when textured but geometry has no UVs
   */
  async enterStudioMode(): Promise<void> {
    // Create TextureCache lazily
    if (!this._textureCache) {
      this._textureCache = new TextureCache();
    }
    this._textureCache.setTexturesTable(this.texturesTable ?? undefined);

    // Iterate all ObjectGroups with front meshes
    for (const path in this.groups) {
      const obj = this.groups[path];
      if (!(obj instanceof ObjectGroup)) continue;
      if (!obj.front) continue;

      // Determine material tag, leaf color, and leaf alpha
      const tag = obj.materialTag || "";
      const leafColor = obj.originalColor
        ? "#" + obj.originalColor.getHexString()
        : "#707070";
      const leafAlpha = obj.alpha;

      // Compute sharing key
      const sharingKey = `${tag}:${leafColor}:${leafAlpha}`;

      // Check cached material for this key
      let studioMaterial = this._studioMaterialCache.get(sharingKey);

      if (!studioMaterial) {
        // Resolve the tag
        const resolved = tag ? this.resolveMaterialTag(tag, path) : null;

        // Per-object try/catch: a single failure should not abort the rest
        try {
          if (resolved && isMaterialXMaterial(resolved)) {
            // --- materialx-db path ---
            studioMaterial = await this.materialFactory.createStudioMaterialFromMaterialX(
              resolved.params,
              resolved.textures ?? {},
              resolved.colorOverride,
              resolved.textureRepeat,
              this._textureCache as TextureCacheInterface,
            );
            if (materialXHasTextures(resolved)) {
              this._texturedMaterialKeys.add(sharingKey);
            }
          } else {
            // --- Builtin preset path (or fallback) ---
            let materialDef: MaterialAppearance;
            if (resolved) {
              materialDef = resolved;
            } else {
              // Fallback: plastic-glossy tinted with CAD color
              const { baseColor: _, ...plasticGlossy } = MATERIAL_PRESETS["plastic-glossy"];
              materialDef = plasticGlossy;
            }
            studioMaterial = await this.materialFactory.createStudioMaterial({
              materialDef,
              fallbackColor: leafColor,
              fallbackAlpha: leafAlpha,
              textureCache: this._textureCache as TextureCacheInterface,
            });
            if (materialHasTexture(materialDef)) {
              this._texturedMaterialKeys.add(sharingKey);
            }
          }
        } catch (err) {
          logger.warn(
            `Studio material creation failed for "${path}" (tag="${tag}"), skipping`,
            err,
          );
          continue;
        }

        this._studioMaterialCache.set(sharingKey, studioMaterial);
      }

      // Build back-face variant if needed
      let studioBack: THREE.MeshPhysicalMaterial | null = null;
      if (obj.renderback && studioMaterial instanceof THREE.MeshPhysicalMaterial) {
        const backKey = sharingKey + ":back";
        let cachedBack = this._studioMaterialCache.get(backKey);
        if (!cachedBack) {
          cachedBack = studioMaterial.clone();
          cachedBack.side = THREE.BackSide;
          this._studioMaterialCache.set(backKey, cachedBack);
        }
        studioBack = cachedBack as THREE.MeshPhysicalMaterial;
      }

      // Auto-generate box-projected UVs if material uses textures but
      // geometry has none (common for CAD meshes without explicit UVs).
      // Uses _texturedMaterialKeys so cache-hit objects also get UVs.
      if (this._texturedMaterialKeys.has(sharingKey) && obj.shapeGeometry && !obj.shapeGeometry.getAttribute("uv")) {
        generateBoxProjectedUVs(obj.shapeGeometry);
      }

      // Apply to ObjectGroup
      obj.enterStudioMode(
        studioMaterial instanceof THREE.MeshPhysicalMaterial ? studioMaterial : null,
        studioBack,
      );
    }

    this._isStudioMode = true;
  }

  /**
   * Leave Studio mode: restore CAD materials on all ObjectGroups.
   * Does NOT clear the material cache (allows fast re-entry).
   */
  leaveStudioMode(): void {
    for (const path in this.groups) {
      const obj = this.groups[path];
      if (!(obj instanceof ObjectGroup)) continue;
      obj.leaveStudioMode();
    }
    this._isStudioMode = false;
  }

  /**
   * Set edge visibility across all ObjectGroups while in Studio mode.
   * @param visible - Whether edges should be visible
   */
  setStudioShowEdges(visible: boolean): void {
    for (const path in this.groups) {
      const obj = this.groups[path];
      if (!(obj instanceof ObjectGroup)) continue;
      obj.setStudioShowEdges(visible);
    }
  }

  /**
   * Dispose all Studio mode resources (material cache + texture cache).
   */
  private _disposeStudioResources(): void {
    // Leave studio mode if still active
    if (this._isStudioMode) {
      this.leaveStudioMode();
    }

    // Dispose cached studio materials
    for (const [, material] of this._studioMaterialCache) {
      material.dispose();
    }
    this._studioMaterialCache.clear();
    this._texturedMaterialKeys.clear();

    // Dispose texture cache
    if (this._textureCache) {
      this._textureCache.disposeFull();
      this._textureCache = null;
    }

    this._isStudioMode = false;
  }
}

/**
 * Type guard to check if an object is a CompoundGroup instance.
 * Uses the isCompoundGroup property following Three.js convention.
 */
function isCompoundGroup(obj: THREE.Object3D | null): obj is CompoundGroup {
  return (
    obj != null && "isCompoundGroup" in obj && obj.isCompoundGroup === true
  );
}

export {
  NestedGroup,
  ObjectGroup,
  CompoundGroup,
  isObjectGroup,
  isCompoundGroup,
};
export type { ShapeEntry };
