import * as THREE from "three";
import { deepDispose, disposeGeometry } from "./utils.js";
import { ZebraTool } from "./cad_tools/zebra.js";
import type { ZebraColorScheme, ZebraMappingMode } from "./types";

/**
 * Symbol marker for identifying ObjectGroup instances.
 * Used by BoundingBox to avoid circular dependency with instanceof.
 */
const OBJECT_GROUP_MARKER = Symbol.for("tcv.ObjectGroup");

/** Highlight color when object is selected */
const HIGHLIGHT_COLOR_SELECTED = 0x53a0e3;
/** Highlight color when object is hovered but not selected */
const HIGHLIGHT_COLOR_HOVER = 0x89b9e3;

interface ShapeInfo {
  topo: string;
  geomtype: string | null;
}

interface TypesMap {
  front: THREE.Mesh | null;
  back: THREE.Mesh | null;
  edges: THREE.Line | THREE.LineSegments | THREE.Object3D | null;
  vertices: THREE.Points | null;
  [key: string]: THREE.Object3D | null;
}

/**
 * Encapsulates material, visibility, and interaction state for a renderable CAD object.
 * Extends THREE.Group to manage front/back faces, edges, and vertices as a unit.
 */
class ObjectGroup extends THREE.Group {
  [OBJECT_GROUP_MARKER]: boolean;
  opacity: number;
  alpha: number;
  edge_color: number;
  shapeInfo: ShapeInfo | null;
  subtype: string | null;
  renderback: boolean;
  types: TypesMap;
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
    edge_color: number,
    shapeInfo: ShapeInfo | null,
    subtype: string | null,
    renderback: boolean = false
  ) {
    super();
    // Set marker for BoundingBox detection (avoids circular dependency)
    this[OBJECT_GROUP_MARKER] = true;
    this.opacity = opacity;
    this.alpha = alpha == null ? 1.0 : alpha;
    this.edge_color = edge_color;
    this.shapeInfo = shapeInfo;
    this.subtype = subtype;
    this.renderback = renderback;
    this.types = { front: null, back: null, edges: null, vertices: null };
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
    deepDispose(Object.values(this.types));
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
   * Register a mesh by type and cache its original color/width for highlighting.
   * @param mesh - The mesh to add.
   * @param type - Type identifier ("front", "back", "edges", "vertices").
   */
  addType(mesh: THREE.Mesh | THREE.Line | THREE.Points | THREE.Object3D, type: string): void {
    this.add(mesh);
    this.types[type] = mesh;
    if (this.types.vertices) {
      this.originalColor = ((this.types.vertices as THREE.Points).material as THREE.PointsMaterial).color.clone();
      this.originalWidth = ((this.types.vertices as THREE.Points).material as THREE.PointsMaterial).size;
    } else if (this.types.edges && !this.types.front) {
      // ignore edges of faces
      this.originalColor = ((this.types.edges as THREE.Line).material as THREE.LineBasicMaterial).color.clone();
      this.originalWidth = ((this.types.edges as THREE.Line).material as THREE.LineBasicMaterial).linewidth;
    } else if (this.types.front) {
      this.originalColor = ((this.types.front as THREE.Mesh).material as THREE.MeshStandardMaterial).color.clone();
    } else if (this.types.back) {
      this.originalBackColor = ((this.types.back as THREE.Mesh).material as THREE.MeshBasicMaterial).color.clone();
    }
  }

  /**
   * Widen or restore point/edge size for visual emphasis.
   * @param flag - Whether to widen (true) or restore original size (false).
   */
  widen(flag: boolean): void {
    if (this.types.vertices) {
      ((this.types.vertices as THREE.Points).material as THREE.PointsMaterial).size = flag
        ? this.vertexFocusSize
        : this.isSelected
          ? this.vertexFocusSize - 2
          : this.originalWidth!;
    } else if (this.types.edges) {
      ((this.types.edges as THREE.Line).material as THREE.LineBasicMaterial).linewidth = flag
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
  private _applyColor(mesh: THREE.Mesh | THREE.Line | THREE.Points, color: THREE.Color): void {
    ((mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).color = color;
    ((mesh as THREE.Mesh).material as THREE.Material).needsUpdate = true;
  }

  /**
   * Iterate over all child materials, excluding clipping planes.
   */
  private _forEachMaterial(callback: (material: THREE.Material) => void): void {
    for (const child of this.children) {
      if (!child.name.startsWith("clipping")) {
        callback((child as THREE.Mesh).material as THREE.Material);
      }
    }
  }

  /**
   * Apply or remove highlight color to this object.
   * @param flag - Whether to apply highlight (true) or restore original color (false).
   */
  highlight(flag: boolean): void {
    const hColor = this._getHighlightColor();

    // Find primary object (front face, vertices, or edges)
    const primaryObject =
      this.types.front || this.types.vertices || this.types.edges;

    if (primaryObject) {
      this.widen(flag);
      this._applyColor(primaryObject as THREE.Mesh, flag ? hColor : this.originalColor!);
    }

    // Handle back face separately (uses originalBackColor)
    if (this.types.back) {
      this._applyColor(
        this.types.back,
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
    if (this.types.front) {
      return { name: "face", value: 0 };
    } else if (this.types.vertices) {
      return { name: "vertex", value: 0 };
    } else if (this.types.edges) {
      return { name: "edge", value: 0 };
    }
    return null;
  }

  /**
   * Set metalness value for all materials (excluding clipping planes).
   */
  setMetalness(value: number): void {
    this._forEachMaterial((material) => {
      (material as THREE.MeshStandardMaterial).metalness = value;
      material.needsUpdate = true;
    });
  }

  /**
   * Set roughness value for all materials (excluding clipping planes).
   */
  setRoughness(value: number): void {
    this._forEachMaterial((material) => {
      (material as THREE.MeshStandardMaterial).roughness = value;
      material.needsUpdate = true;
    });
  }

  /**
   * Enable or disable transparency mode.
   * Adjusts opacity and depth write settings.
   */
  setTransparent(flag: boolean): void {
    const newOpacity = flag ? this.opacity * this.alpha : this.alpha;
    if (this.types.back) {
      ((this.types.back as THREE.Mesh).material as THREE.Material).opacity = newOpacity;
    }
    if (this.types.front) {
      ((this.types.front as THREE.Mesh).material as THREE.Material).opacity = newOpacity;
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
    if (this.types.edges) {
      const color = flag ? 0x000000 : this.edge_color;
      this.originalColor = new THREE.Color(color);
      ((this.types.edges as THREE.Line).material as THREE.LineBasicMaterial).color = new THREE.Color(color);
      ((this.types.edges as THREE.Line).material as THREE.Material).needsUpdate = true;
    }
  }

  /**
   * Set the edge color.
   */
  setEdgeColor(color: number): void {
    if (this.types.edges) {
      this.edge_color = color;
      ((this.types.edges as THREE.Line).material as THREE.LineBasicMaterial).color = new THREE.Color(color);
      ((this.types.edges as THREE.Line).material as THREE.Material).needsUpdate = true;
    }
  }

  /**
   * Set the opacity for front and back materials.
   */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
    if (this.types.front) {
      ((this.types.front as THREE.Mesh).material as THREE.Material).opacity = this.opacity;
      ((this.types.front as THREE.Mesh).material as THREE.Material).needsUpdate = true;
    }
    if (this.types.back) {
      ((this.types.back as THREE.Mesh).material as THREE.Material).opacity = this.opacity;
      ((this.types.back as THREE.Mesh).material as THREE.Material).needsUpdate = true;
    }
  }

  /**
   * Set visibility of the shape (front face and clipping caps).
   */
  setShapeVisible(flag: boolean): void {
    if (this.types.front) {
      ((this.types.front as THREE.Mesh).material as THREE.Material).visible = flag;
    }
    for (const t of ["clipping-0", "clipping-1", "clipping-2"]) {
      if (this.types[t]) {
        ((this.types[t]!.children[0] as THREE.Mesh).material as THREE.Material).visible = flag;
        ((this.types[t]!.children[1] as THREE.Mesh).material as THREE.Material).visible = flag;
      }
    }
    if (this.types.back && this.renderback) {
      ((this.types.back as THREE.Mesh).material as THREE.Material).visible = flag;
    }
  }

  /**
   * Set visibility of edges and vertices.
   */
  setEdgesVisible(flag: boolean): void {
    if (this.types.edges) {
      ((this.types.edges as THREE.Line).material as THREE.Material).visible = flag;
    }
    if (this.types.vertices) {
      ((this.types.vertices as THREE.Points).material as THREE.Material).visible = flag;
    }
  }

  /**
   * Set visibility of back faces.
   */
  setBackVisible(flag: boolean): void {
    if (this.types.back && this.types.front && ((this.types.front as THREE.Mesh).material as THREE.Material).visible) {
      ((this.types.back as THREE.Mesh).material as THREE.Material).visible = this.renderback || flag;
    }
  }

  /**
   * Get the current visibility state.
   */
  getVisibility(): boolean {
    if (this.types.front) {
      if (this.types.edges) {
        return (
          ((this.types.front as THREE.Mesh).material as THREE.Material).visible ||
          ((this.types.edges as THREE.Line).material as THREE.Material).visible
        );
      } else {
        return ((this.types.front as THREE.Mesh).material as THREE.Material).visible;
      }
    } else if (this.types.edges) {
      return ((this.types.edges as THREE.Line).material as THREE.Material).visible;
    } else if (this.types.vertices) {
      return ((this.types.vertices as THREE.Points).material as THREE.Material).visible;
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
    if (this.types.back) {
      ((this.types.back as THREE.Mesh).material as THREE.Material).clippingPlanes = planes;
    }
    if (this.types.front) {
      ((this.types.front as THREE.Mesh).material as THREE.Material).clippingPlanes = planes;
    }
    if (this.types.edges) {
      ((this.types.edges as THREE.Line).material as THREE.Material).clippingPlanes = planes;
    }
    if (this.types.vertices) {
      ((this.types.vertices as THREE.Points).material as THREE.Material).clippingPlanes = planes;
    }
    this.updateMaterials(true);
  }

  /**
   * Set polygon offset for depth sorting of back faces.
   */
  setPolygonOffset(offset: number): void {
    if (this.types.back) {
      ((this.types.back as THREE.Mesh).material as THREE.MeshBasicMaterial).polygonOffsetUnits = offset;
    }
  }

  /**
   * Set Z-axis scale for GDS extrusion visualization.
   * Recursively scales all meshes and adjusts positions.
   */
  setZScale(value: number): void {
    const walk = (obj: THREE.Object3D, minZ: number, height: number, scalePos: boolean = true) => {
      for (const child of obj.children) {
        if ((child as THREE.Mesh).isMesh || (child as THREE.Line).isLine) {
          child.scale.z = value;
          if (scalePos && child.parent) {
            child.parent.position.z = minZ * value;
          }
        } else if ((child as THREE.Group).isGroup) {
          // don't scale position of clipping planes
          walk(child, minZ, height, !child.name.startsWith("clipping"));
        }
      }
    };
    if (this.types.front || this.types.back || this.types.edges) {
      walk(this, this.minZ!, this.height!);
    }
  }

  /**
   * Mark all materials as needing update.
   */
  updateMaterials(flag: boolean): void {
    if (this.types.back) {
      ((this.types.back as THREE.Mesh).material as THREE.Material).needsUpdate = flag;
    }
    if (this.types.front) {
      ((this.types.front as THREE.Mesh).material as THREE.Material).needsUpdate = flag;
    }
    if (this.types.edges) {
      ((this.types.edges as THREE.Line).material as THREE.Material).needsUpdate = flag;
    }
    if (this.types.vertices) {
      ((this.types.vertices as THREE.Points).material as THREE.Material).needsUpdate = flag;
    }
  }

  /**
   * Enable or disable zebra stripe visualization on front faces.
   */
  setZebra(flag: boolean): void {
    if (this.types.front) {
      const visible = ((this.types.front as THREE.Mesh).material as THREE.Material).visible;
      if (flag) {
        this.zebra.applyToMesh(this.types.front as THREE.Mesh, visible);
      } else {
        this.zebra.restoreMesh(this.types.front as THREE.Mesh, visible);
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
 * Uses the OBJECT_GROUP_MARKER symbol to avoid circular dependency with instanceof.
 */
function isObjectGroup(obj: THREE.Object3D | null): obj is ObjectGroup {
  return obj != null && (obj as ObjectGroup)[OBJECT_GROUP_MARKER] === true;
}

export { ObjectGroup, OBJECT_GROUP_MARKER, isObjectGroup };
export type { ShapeInfo };
