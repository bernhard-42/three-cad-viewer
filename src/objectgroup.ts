import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { deepDispose, disposeGeometry, isMesh } from "./utils.js";
import { ZebraTool } from "./cad_tools/zebra.js";
import type { ZebraColorScheme, ZebraMappingMode, ColorValue, ColoredMaterial } from "./types";


/** Highlight color when object is selected */
const HIGHLIGHT_COLOR_SELECTED = 0x53a0e3;

/** Highlight color when object is hovered but not selected */
const HIGHLIGHT_COLOR_HOVER = 0x89b9e3;

interface ShapeInfo {
  topo: string;
  geomtype: number | string | null;
}

// Typed mesh/line/points
// FaceMesh accepts MeshStandardMaterial, MeshBasicMaterial, or any material with color
type FaceMesh = THREE.Mesh<THREE.BufferGeometry, ColoredMaterial>;
type VertexPoints = THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

// Edge material interface - properties common to LineMaterial and LineBasicMaterial
interface EdgeMaterial extends THREE.Material {
  color: THREE.Color;
  linewidth: number;
}

/**
 * Type guard to check if a material has color and linewidth properties.
 * Parameter is THREE.Material or LineMaterial (which has incompatible vertexColors type).
 */
function isEdgeMaterial(mat: THREE.Material | import("three/examples/jsm/lines/LineMaterial.js").LineMaterial): mat is EdgeMaterial {
  return "color" in mat && "linewidth" in mat;
}

// Edges: LineSegments2 (fat lines) or THREE.LineSegments (polygon edges)
// We store the material separately for type safety since Three.js types LineSegments.material as Material | Material[]
type Edges = LineSegments2 | THREE.LineSegments;

/**
 * Encapsulates material, visibility, and interaction state for a renderable CAD object.
 * Extends THREE.Group to manage front/back faces, edges, and vertices as a unit.
 */
class ObjectGroup extends THREE.Group {
  [key: string]: unknown; // Allow dynamic method access

  /** Type identifier following Three.js convention */
  override readonly type = "ObjectGroup";
  /** Type guard property following Three.js convention */
  readonly isObjectGroup = true;
  opacity: number;
  alpha: number;
  edge_color: ColorValue;
  shapeInfo: ShapeInfo | null;
  subtype: string | null;
  renderback: boolean;

  // Typed geometry references
  front: FaceMesh | null;
  back: FaceMesh | null;
  edges: Edges | null;
  edgeMaterial: EdgeMaterial | null;  // Stored separately for type safety
  vertices: VertexPoints | null;
  clipping: Map<number, THREE.Group>;

  isSelected: boolean;
  originalColor: THREE.Color | null;
  originalBackColor: THREE.Color | null;
  originalWidth: number | null;
  vertexFocusSize: number;
  edgeFocusWidth: number;
  shapeGeometry?: THREE.BufferGeometry | null;
  minZ?: number;
  height?: number;
  private _zebra: ZebraTool | null;

  /**
   * Create an ObjectGroup for managing a CAD object's visual representation.
   * @param opacity - Default opacity value (0.0 to 1.0).
   * @param alpha - Transparency alpha value (0.0 to 1.0).
   * @param edge_color - Edge color as hex value.
   * @param shapeInfo - Shape metadata with topo and geomtype fields.
   * @param subtype - Shape subtype (e.g., "solid", "edges", "vertices").
   * @param renderback - Whether back faces should be rendered.
   */
  constructor(
    opacity: number,
    alpha: number,
    edge_color: ColorValue,
    shapeInfo: ShapeInfo | null,
    subtype: string | null,
    renderback: boolean = false,
  ) {
    super();
    this.opacity = opacity;
    this.alpha = alpha == null ? 1.0 : alpha;
    this.edge_color = edge_color;
    this.shapeInfo = shapeInfo;
    this.subtype = subtype;
    this.renderback = renderback;

    // Initialize typed geometry references
    this.front = null;
    this.back = null;
    this.edges = null;
    this.edgeMaterial = null;
    this.vertices = null;
    this.clipping = new Map();

    this.isSelected = false;
    this.originalColor = null;
    this.originalBackColor = null;
    this.originalWidth = null;
    this.vertexFocusSize = 8; // Size of the points when highlighted
    this.edgeFocusWidth = 5; // Size of the edges when highlighted

    this._zebra = null; // Lazy-initialized zebra tool
  }

  /**
   * Get the zebra tool, creating it on first access.
   */
  get zebra(): ZebraTool {
    if (!this._zebra) {
      this._zebra = new ZebraTool();
    }
    return this._zebra;
  }

  /**
   * Dispose of all resources and clean up memory.
   * Releases geometry, materials, children, and zebra tool.
   */
  dispose(): void {
    if (this.shapeGeometry) {
      disposeGeometry(this.shapeGeometry);
      this.shapeGeometry = null;
    }
    // Dispose all children (includes front, back, edges, vertices, clipping groups)
    if (this.children) {
      deepDispose(this.children);
      this.clear();
    }
    if (this._zebra) {
      this._zebra.dispose();
      this._zebra = null;
    }
  }

  /**
   * Set the front face mesh.
   */
  setFront(mesh: FaceMesh): void {
    this.add(mesh);
    this.front = mesh;
    this.originalColor = mesh.material.color.clone();
  }

  /**
   * Set the back face mesh.
   */
  setBack(mesh: FaceMesh): void {
    this.add(mesh);
    this.back = mesh;
    if (!this.front) {
      this.originalBackColor = mesh.material.color.clone();
    }
  }

  /**
   * Set the edges geometry.
   * Extracts and stores the material separately for type-safe access.
   */
  setEdges(edges: Edges): void {
    this.add(edges);
    this.edges = edges;
    // Extract material - both LineMaterial and LineBasicMaterial have color and linewidth
    const mat = edges.material;
    if (Array.isArray(mat)) {
      throw new Error("Multi-material edges are not supported");
    } else if (!isEdgeMaterial(mat)) {
      throw new Error("Edge material must have color and linewidth properties");
    }
    this.edgeMaterial = mat;
    // Only cache edge color/width if this is an edge-only object (no faces)
    if (!this.front) {
      this.originalColor = this.edgeMaterial.color.clone();
      this.originalWidth = this.edgeMaterial.linewidth;
    }
  }

  /**
   * Set the vertices points.
   */
  setVertices(points: VertexPoints): void {
    this.add(points);
    this.vertices = points;
    this.originalColor = points.material.color.clone();
    this.originalWidth = points.material.size;
  }

  /**
   * Add a clipping group for a plane index.
   */
  addClipping(group: THREE.Group, index: number): void {
    this.add(group);
    this.clipping.set(index, group);
  }

  /**
   * Widen or restore point/edge size for visual emphasis.
   * @param flag - Whether to widen (true) or restore original size (false).
   */
  widen(flag: boolean): void {
    if (this.vertices) {
      this.vertices.material.size = flag
        ? this.vertexFocusSize
        : this.isSelected
          ? this.vertexFocusSize - 2
          : this.originalWidth!;
    } else if (this.edgeMaterial) {
      this.edgeMaterial.linewidth = flag
        ? this.edgeFocusWidth
        : this.isSelected
          ? this.edgeFocusWidth - 2
          : this.originalWidth!;
    }
  }

  /**
   * Toggle the selection state of this object.
   * Updates highlight and resets widening.
   */
  toggleSelection(): void {
    const flag = !this.isSelected;
    this.isSelected = flag;
    this.highlight(flag);
    this.widen(false);
  }

  /**
   * Remove highlight from this object.
   * @param keepSelection - If true, preserve selection state.
   */
  unhighlight(keepSelection: boolean): void {
    if (!keepSelection || !this.isSelected) {
      this.isSelected = false;
      this.highlight(false);
    }
    this.widen(false);
  }

  /**
   * Get the highlight color based on selection state.
   */
  private _getHighlightColor(): THREE.Color {
    return new THREE.Color(
      this.isSelected ? HIGHLIGHT_COLOR_SELECTED : HIGHLIGHT_COLOR_HOVER,
    );
  }

  /**
   * Apply color to a mesh and mark material for update.
   */
  private _applyColorToMaterial(
    material: { color: THREE.Color; needsUpdate: boolean },
    color: THREE.Color,
  ): void {
    material.color = color;
    material.needsUpdate = true;
  }

  /**
   * Iterate over all child materials, excluding clipping planes.
   */
  private _forEachMaterial(callback: (material: THREE.Material) => void): void {
    for (const child of this.children) {
      if (!child.name.startsWith("clipping") && isMesh(child)) {
        if (Array.isArray(child.material)) {
          throw new Error("Multi-material meshes are not supported");
        }
        callback(child.material);
      }
    }
  }

  /**
   * Iterate over face materials that are MeshStandardMaterial (have PBR properties).
   * Skips MeshBasicMaterial and other non-PBR materials.
   */
  private _forEachStandardMaterial(callback: (material: THREE.MeshStandardMaterial) => void): void {
    if (this.front && this.front.material instanceof THREE.MeshStandardMaterial) {
      callback(this.front.material);
    }
    // back can also be MeshStandardMaterial (e.g., for polygon rendering)
    if (this.back && this.back.material instanceof THREE.MeshStandardMaterial) {
      callback(this.back.material);
    }
  }

  /**
   * Apply or remove highlight color to this object.
   * @param flag - Whether to apply highlight (true) or restore original color (false).
   */
  highlight(flag: boolean): void {
    const hColor = this._getHighlightColor();

    // Find primary material (front face, vertices, or edges)
    const primaryMaterial =
      this.front?.material ||
      this.vertices?.material ||
      this.edgeMaterial;

    if (primaryMaterial) {
      this.widen(flag);
      this._applyColorToMaterial(primaryMaterial, flag ? hColor : this.originalColor!);
    }

    // Handle back face separately (uses originalBackColor)
    if (this.back) {
      this._applyColorToMaterial(
        this.back.material,
        flag ? hColor : this.originalBackColor!,
      );
    }
  }

  /**
   * Clear all highlights and selection state.
   */
  clearHighlights(): void {
    this.highlight(false);
    this.isSelected = false;
    this.widen(false);
  }

  /**
   * Get metrics about this object's topology type.
   */
  metrics(): { name: string; value: number } | null {
    if (this.front) {
      return { name: "face", value: 0 };
    } else if (this.vertices) {
      return { name: "vertex", value: 0 };
    } else if (this.edges) {
      return { name: "edge", value: 0 };
    }
    return null;
  }

  /**
   * Set metalness value for front face materials.
   */
  setMetalness(value: number): void {
    this._forEachStandardMaterial((material) => {
      material.metalness = value;
      material.needsUpdate = true;
    });
  }

  /**
   * Set roughness value for front face materials.
   */
  setRoughness(value: number): void {
    this._forEachStandardMaterial((material) => {
      material.roughness = value;
      material.needsUpdate = true;
    });
  }

  /**
   * Enable or disable transparency mode.
   * Adjusts opacity and depth write settings.
   */
  setTransparent(flag: boolean): void {
    const newOpacity = flag ? this.opacity * this.alpha : this.alpha;
    if (this.back) {
      this.back.material.opacity = newOpacity;
    }
    if (this.front) {
      this.front.material.opacity = newOpacity;
    }
    this._forEachMaterial((material) => {
      // turn depth write off for transparent objects
      material.depthWrite = this.alpha < 1.0 ? false : !flag;
      // but keep depth test
      material.depthTest = true;
      material.needsUpdate = true;
    });
  }

  /**
   * Set whether edges should be rendered in black or original color.
   */
  setBlackEdges(flag: boolean): void {
    if (this.edgeMaterial) {
      const color = flag ? 0x000000 : this.edge_color;
      this.originalColor = new THREE.Color(color);
      this.edgeMaterial.color = new THREE.Color(color);
      this.edgeMaterial.needsUpdate = true;
    }
  }

  /**
   * Set the edge color.
   */
  setEdgeColor(color: number): void {
    if (this.edgeMaterial) {
      this.edge_color = color;
      this.edgeMaterial.color = new THREE.Color(color);
      this.edgeMaterial.needsUpdate = true;
    }
  }

  /**
   * Set the opacity for front and back materials.
   */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (this.front) {
      this.front.material.opacity = this.opacity;
      this.front.material.needsUpdate = true;
    }
    if (this.back) {
      this.back.material.opacity = this.opacity;
      this.back.material.needsUpdate = true;
    }
  }

  /**
   * Set visibility of the shape (front face and clipping caps).
   */
  setShapeVisible(flag: boolean): void {
    if (this.front) {
      this.front.material.visible = flag;
    }
    for (const clippingGroup of this.clipping.values()) {
      const child0 = clippingGroup.children[0];
      const child1 = clippingGroup.children[1];
      if (isMesh(child0)) {
        if (Array.isArray(child0.material)) {
          throw new Error("Multi-material meshes are not supported");
        }
        child0.material.visible = flag;
      }
      if (isMesh(child1)) {
        if (Array.isArray(child1.material)) {
          throw new Error("Multi-material meshes are not supported");
        }
        child1.material.visible = flag;
      }
    }
    if (this.back && this.renderback) {
      this.back.material.visible = flag;
    }
  }

  /**
   * Set visibility of edges and vertices.
   */
  setEdgesVisible(flag: boolean): void {
    if (this.edgeMaterial) {
      this.edgeMaterial.visible = flag;
    }
    if (this.vertices) {
      this.vertices.material.visible = flag;
    }
  }

  /**
   * Set visibility of back faces.
   */
  setBackVisible(flag: boolean): void {
    if (
      this.back &&
      this.front &&
      this.front.material.visible
    ) {
      this.back.material.visible = this.renderback || flag;
    }
  }

  /**
   * Get the current visibility state.
   */
  getVisibility(): boolean {
    if (this.front) {
      if (this.edgeMaterial) {
        return this.front.material.visible || this.edgeMaterial.visible;
      } else {
        return this.front.material.visible;
      }
    } else if (this.edgeMaterial) {
      return this.edgeMaterial.visible;
    } else if (this.vertices) {
      return this.vertices.material.visible;
    }
    return false;
  }

  /**
   * Set clip intersection mode for all materials.
   */
  setClipIntersection(flag: boolean): void {
    this._forEachMaterial((material) => {
      material.clipIntersection = flag;
    });
  }

  /**
   * Set clipping planes for all materials.
   */
  setClipPlanes(planes: THREE.Plane[]): void {
    if (this.back) {
      this.back.material.clippingPlanes = planes;
    }
    if (this.front) {
      this.front.material.clippingPlanes = planes;
    }
    if (this.edgeMaterial) {
      this.edgeMaterial.clippingPlanes = planes;
    }
    if (this.vertices) {
      this.vertices.material.clippingPlanes = planes;
    }
    this.updateMaterials(true);
  }

  /**
   * Set polygon offset for depth sorting of back faces.
   */
  setPolygonOffset(offset: number): void {
    if (this.back) {
      this.back.material.polygonOffsetUnits = offset;
    }
  }

  /**
   * Set Z-axis scale for GDS extrusion visualization.
   * Recursively scales all meshes and adjusts positions.
   */
  setZScale(value: number): void {
    const walk = (
      obj: THREE.Object3D,
      minZ: number,
      height: number,
      scalePos: boolean = true,
    ) => {
      for (const child of obj.children) {
        if ("isMesh" in child || "isLine" in child) {
          child.scale.z = value;
          if (scalePos && child.parent) {
            child.parent.position.z = minZ * value;
          }
        } else if ("isGroup" in child) {
          // don't scale position of clipping planes
          walk(child, minZ, height, !child.name.startsWith("clipping"));
        }
      }
    };
    if (this.front || this.back || this.edges) {
      walk(this, this.minZ!, this.height!);
    }
  }

  /**
   * Mark all materials as needing update.
   */
  updateMaterials(flag: boolean): void {
    if (this.back) {
      this.back.material.needsUpdate = flag;
    }
    if (this.front) {
      this.front.material.needsUpdate = flag;
    }
    if (this.edgeMaterial) {
      this.edgeMaterial.needsUpdate = flag;
    }
    if (this.vertices) {
      this.vertices.material.needsUpdate = flag;
    }
  }

  /**
   * Enable or disable zebra stripe visualization on front faces.
   */
  setZebra(flag: boolean): void {
    if (this.front) {
      const visible = this.front.material.visible;
      if (flag) {
        this.zebra.applyToMesh(this.front, visible);
      } else {
        this.zebra.restoreMesh(this.front, visible);
      }
    }
  }

  /**
   * Set the number of zebra stripes.
   */
  setZebraCount(value: number): void {
    this.zebra.setStripeCount(value);
  }

  /**
   * Set the opacity of zebra stripes.
   */
  setZebraOpacity(value: number): void {
    this.zebra.setStripeOpacity(value);
  }

  /**
   * Set the direction/angle of zebra stripes.
   */
  setZebraDirection(value: number): void {
    this.zebra.setStripeDirection(value);
  }

  /**
   * Set the color scheme for zebra stripes.
   */
  setZebraColorScheme(value: ZebraColorScheme): void {
    this.zebra.setColorScheme(value);
  }

  /**
   * Set the mapping mode for zebra stripes.
   */
  setZebraMappingMode(value: ZebraMappingMode): void {
    this.zebra.setMappingMode(value);
  }
}

/**
 * Type guard to check if an object is an ObjectGroup instance.
 * Uses the isObjectGroup property following Three.js convention.
 */
function isObjectGroup(obj: THREE.Object3D | null): obj is ObjectGroup {
  return obj != null && "isObjectGroup" in obj && obj.isObjectGroup === true;
}

export { ObjectGroup, isObjectGroup };
export type { ShapeInfo, FaceMesh, Edges, EdgeMaterial, VertexPoints };
