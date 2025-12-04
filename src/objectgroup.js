import * as THREE from "three";
import { deepDispose, disposeGeometry } from "./utils.js";
import { ZebraTool } from "./cad_tools/zebra.js";

/** Highlight color when object is selected */
const HIGHLIGHT_COLOR_SELECTED = 0x53a0e3;
/** Highlight color when object is hovered but not selected */
const HIGHLIGHT_COLOR_HOVER = 0x89b9e3;

/**
 * Encapsulates material, visibility, and interaction state for a renderable CAD object.
 * Extends THREE.Group to manage front/back faces, edges, and vertices as a unit.
 */
class ObjectGroup extends THREE.Group {
  /**
   * Create an ObjectGroup for managing a CAD object's visual representation.
   * @param {number} opacity - Default opacity value (0.0 to 1.0).
   * @param {number} alpha - Transparency alpha value (0.0 to 1.0).
   * @param {number} edge_color - Edge color as hex value.
   * @param {Object} shapeInfo - Shape metadata with topo and geomtype fields.
   * @param {string} subtype - Shape subtype (e.g., "solid", "edges", "vertices").
   * @param {boolean} renderback - Whether back faces should be rendered.
   */
  constructor(opacity, alpha, edge_color, shapeInfo, subtype, renderback) {
    super();
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
   * @returns {ZebraTool} The zebra tool instance.
   * @private
   */
  get zebra() {
    if (!this._zebra) {
      this._zebra = new ZebraTool();
    }
    return this._zebra;
  }

  /**
   * Dispose of all resources and clean up memory.
   * Releases geometry, materials, children, and zebra tool.
   */
  dispose() {
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
   * @param {THREE.Mesh|THREE.Line|THREE.Points} mesh - The mesh to add.
   * @param {string} type - Type identifier ("front", "back", "edges", "vertices").
   */
  addType(mesh, type) {
    this.add(mesh);
    this.types[type] = mesh;
    if (this.types.vertices) {
      this.originalColor = this.types.vertices.material.color.clone();
      this.originalWidth = this.types.vertices.material.size;
    } else if (this.types.edges && !this.types.front) {
      // ignore edges of faces
      this.originalColor = this.types.edges.material.color.clone();
      this.originalWidth = this.types.edges.material.linewidth;
    } else if (this.types.front) {
      this.originalColor = this.types.front.material.color.clone();
    } else if (this.types.back) {
      this.originalBackColor = this.types.back.material.color.clone();
    }
  }

  /**
   * Widen or restore point/edge size for visual emphasis.
   * @param {boolean} flag - Whether to widen (true) or restore original size (false).
   */
  widen(flag) {
    if (this.types.vertices) {
      this.types.vertices.material.size = flag
        ? this.vertexFocusSize
        : this.isSelected
          ? this.vertexFocusSize - 2
          : this.originalWidth;
    } else if (this.types.edges) {
      this.types.edges.material.linewidth = flag
        ? this.edgeFocusWidth
        : this.isSelected
          ? this.edgeFocusWidth - 2
          : this.originalWidth;
    }
  }

  /**
   * Toggle the selection state of this object.
   * Updates highlight and resets widening.
   */
  toggleSelection() {
    const flag = !this.isSelected;
    this.isSelected = flag;
    this.highlight(flag);
    this.widen(false);
  }

  /**
   * Remove highlight from this object.
   * @param {boolean} keepSelection - If true, preserve selection state.
   */
  unhighlight(keepSelection) {
    if (!keepSelection || !this.isSelected) {
      this.isSelected = false;
      this.highlight(false);
    }
    this.widen(false);
  }

  /**
   * Get the highlight color based on selection state.
   * @returns {THREE.Color} The appropriate highlight color.
   * @private
   */
  _getHighlightColor() {
    return new THREE.Color(
      this.isSelected ? HIGHLIGHT_COLOR_SELECTED : HIGHLIGHT_COLOR_HOVER,
    );
  }

  /**
   * Apply color to a mesh and mark material for update.
   * @param {THREE.Mesh|THREE.Line|THREE.Points} mesh - The mesh to update.
   * @param {THREE.Color} color - The color to apply.
   * @private
   */
  _applyColor(mesh, color) {
    mesh.material.color = color;
    mesh.material.needsUpdate = true;
  }

  /**
   * Iterate over all child materials, excluding clipping planes.
   * @param {function(THREE.Material): void} callback - Function to call for each material.
   * @private
   */
  _forEachMaterial(callback) {
    for (const child of this.children) {
      if (!child.name.startsWith("clipping")) {
        callback(child.material);
      }
    }
  }

  /**
   * Apply or remove highlight color to this object.
   * @param {boolean} flag - Whether to apply highlight (true) or restore original color (false).
   */
  highlight(flag) {
    const hColor = this._getHighlightColor();

    // Find primary object (front face, vertices, or edges)
    const primaryObject =
      this.types.front || this.types.vertices || this.types.edges;

    if (primaryObject) {
      this.widen(flag);
      this._applyColor(primaryObject, flag ? hColor : this.originalColor);
    }

    // Handle back face separately (uses originalBackColor)
    if (this.types.back) {
      this._applyColor(
        this.types.back,
        flag ? hColor : this.originalBackColor,
      );
    }
  }

  /**
   * Clear all highlights and selection state.
   */
  clearHighlights() {
    this.highlight(false);
    this.isSelected = false;
    this.widen(false);
  }

  /**
   * Get metrics about this object's topology type.
   * @returns {{name: string, value: number}|null} Object with topology name and value, or null if no type.
   */
  metrics() {
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
   * @param {number} value - Metalness value (0.0 to 1.0).
   */
  setMetalness(value) {
    this._forEachMaterial((material) => {
      material.metalness = value;
      material.needsUpdate = true;
    });
  }

  /**
   * Set roughness value for all materials (excluding clipping planes).
   * @param {number} value - Roughness value (0.0 to 1.0).
   */
  setRoughness(value) {
    this._forEachMaterial((material) => {
      material.roughness = value;
      material.needsUpdate = true;
    });
  }

  /**
   * Enable or disable transparency mode.
   * Adjusts opacity and depth write settings.
   * @param {boolean} flag - Whether to enable transparency.
   */
  setTransparent(flag) {
    const newOpacity = flag ? this.opacity * this.alpha : this.alpha;
    if (this.types.back) {
      this.types.back.material.opacity = newOpacity;
    }
    if (this.types.front) {
      this.types.front.material.opacity = newOpacity;
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
   * @param {boolean} flag - Whether to use black edges.
   */
  setBlackEdges(flag) {
    if (this.types.edges) {
      const color = flag ? 0x000000 : this.edge_color;
      this.originalColor = new THREE.Color(color);
      this.types.edges.material.color = new THREE.Color(color);
      this.types.edges.material.needsUpdate = true;
    }
  }

  /**
   * Set the edge color.
   * @param {number} color - Edge color as hex value.
   */
  setEdgeColor(color) {
    if (this.types.edges) {
      this.edge_color = color;
      this.types.edges.material.color = new THREE.Color(color);
      this.types.edges.material.needsUpdate = true;
    }
  }

  /**
   * Set the opacity for front and back materials.
   * @param {number} opacity - Opacity value (0.0 to 1.0).
   */
  setOpacity(opacity) {
    this.opacity = opacity;
    if (this.types.front) {
      this.types.front.material.opacity = this.opacity;
      this.types.front.material.needsUpdate = true;
    }
    if (this.types.back) {
      this.types.back.material.opacity = this.opacity;
      this.types.back.material.needsUpdate = true;
    }
  }

  /**
   * Set visibility of the shape (front face and clipping caps).
   * @param {boolean} flag - Whether shape should be visible.
   */
  setShapeVisible(flag) {
    if (this.types.front) {
      this.types.front.material.visible = flag;
    }
    for (var t of ["clipping-0", "clipping-1", "clipping-2"]) {
      if (this.types[t]) {
        this.types[t].children[0].material.visible = flag;
        this.types[t].children[1].material.visible = flag;
      }
    }
    if (this.types.back && this.renderback) {
      this.types.back.material.visible = flag;
    }
  }

  /**
   * Set visibility of edges and vertices.
   * @param {boolean} flag - Whether edges/vertices should be visible.
   */
  setEdgesVisible(flag) {
    if (this.types.edges) {
      this.types.edges.material.visible = flag;
    }
    if (this.types.vertices) {
      this.types.vertices.material.visible = flag;
    }
  }

  /**
   * Set visibility of back faces.
   * @param {boolean} flag - Whether back faces should be visible.
   */
  setBackVisible(flag) {
    if (this.types.back && this.types.front && this.types.front.material.visible) {
      this.types.back.material.visible = this.renderback || flag;
    }
  }

  /**
   * Get the current visibility state.
   * @returns {boolean} True if any component is visible.
   */
  getVisibility() {
    if (this.types.front) {
      if (this.types.edges) {
        return (
          this.types.front.material.visible || this.types.edges.material.visible
        );
      } else {
        return this.types.front.material.visible;
      }
    } else if (this.types.edges) {
      return this.types.edges.material.visible;
    } else if (this.types.vertices) {
      return this.types.vertices.material.visible;
    }
    return false;
  }

  /**
   * Set clip intersection mode for all materials.
   * @param {boolean} flag - Whether to use intersection clipping.
   */
  setClipIntersection(flag) {
    this._forEachMaterial((material) => {
      material.clipIntersection = flag;
    });
  }

  /**
   * Set clipping planes for all materials.
   * @param {THREE.Plane[]} planes - Array of clipping planes.
   */
  setClipPlanes(planes) {
    if (this.types.back) {
      this.types.back.material.clippingPlanes = planes;
    }
    if (this.types.front) {
      this.types.front.material.clippingPlanes = planes;
    }
    if (this.types.edges) {
      this.types.edges.material.clippingPlanes = planes;
    }
    if (this.types.vertices) {
      this.types.vertices.material.clippingPlanes = planes;
    }
    this.updateMaterials(true);
  }

  /**
   * Set polygon offset for depth sorting of back faces.
   * @param {number} offset - Polygon offset units value.
   */
  setPolygonOffset(offset) {
    if (this.types.back) {
      this.types.back.material.polygonOffsetUnits = offset;
    }
  }

  /**
   * Set Z-axis scale for GDS extrusion visualization.
   * Recursively scales all meshes and adjusts positions.
   * @param {number} value - Z scale factor.
   */
  setZScale(value) {
    function walk(obj, minZ, height, scalePos = true) {
      for (var child of obj.children) {
        if (child.isMesh || child.isLine) {
          child.scale.z = value;
          if (scalePos) {
            child.parent.position.z = minZ * value;
          }
        } else if (child.isGroup) {
          // don't scale position of clipping planes
          walk(child, minZ, height, !child.name.startsWith("clipping"));
        }
      }
    }
    if (this.types.front || this.types.back || this.types.edges) {
      walk(this, this.minZ, this.height);
    }
  }

  /**
   * Mark all materials as needing update.
   * @param {boolean} flag - Whether materials need update.
   */
  updateMaterials(flag) {
    if (this.types.back) {
      this.types.back.material.needsUpdate = flag;
    }
    if (this.types.front) {
      this.types.front.material.needsUpdate = flag;
    }
    if (this.types.edges) {
      this.types.edges.material.needsUpdate = flag;
    }
    if (this.types.vertices) {
      this.types.vertices.material.needsUpdate = flag;
    }
  }

  /**
   * Enable or disable zebra stripe visualization on front faces.
   * @param {boolean} flag - Whether to enable zebra stripes.
   */
  setZebra(flag) {
    if (this.types.front) {
      var visible = this.types.front.material.visible;
      if (flag) {
        this.zebra.applyToMesh(this.types.front, visible);
      } else {
        this.zebra.restoreMesh(this.types.front, visible);
      }
    }
  }

  /**
   * Set the number of zebra stripes.
   * @param {number} value - Number of stripes (2-50).
   */
  setZebraCount(value) {
    this.zebra.setStripeCount(value);
  }

  /**
   * Set the opacity of zebra stripes.
   * @param {number} value - Stripe opacity (0.0 to 1.0).
   */
  setZebraOpacity(value) {
    this.zebra.setStripeOpacity(value);
  }

  /**
   * Set the direction/angle of zebra stripes.
   * @param {number} value - Stripe direction in degrees (0-90).
   */
  setZebraDirection(value) {
    this.zebra.setStripeDirection(value);
  }

  /**
   * Set the color scheme for zebra stripes.
   * @param {string} value - Color scheme ("blackwhite", "colorful", "grayscale").
   */
  setZebraColorScheme(value) {
    this.zebra.setColorScheme(value);
  }

  /**
   * Set the mapping mode for zebra stripes.
   * @param {string} value - Mapping mode ("reflection", "normal").
   */
  setZebraMappingMode(value) {
    this.zebra.setMappingMode(value);
  }
}

export { ObjectGroup };
