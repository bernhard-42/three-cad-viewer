/**
 * Shape tessellation for rendering CAD objects.
 */

import * as THREE from "three";
import { NestedGroup } from "./nestedgroup.js";
import { BoundingBox } from "./bbox.js";
import type { Shapes, VisibilityState } from "../core/types.js";

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
  /** PHASE-7 BASELINE (temporary): log id-picking build timings. Remove after Phase 7. */
  timeit: boolean;
}

// =============================================================================
// ShapeRenderer Class
// =============================================================================

/**
 * Handles tessellation of CAD shapes for rendering.
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
  private _renderTessellatedShapes(
    shapes: Shapes,
    assignIds: boolean = false,
  ): NestedGroup {
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
    // id-based picking: assign per-vertex component ids for the GPU picker.
    nestedGroup.assignIds = assignIds;
    // PHASE-7 BASELINE (temporary): forward the timeit flag so render() logs timings.
    nestedGroup.timeit = this.config.timeit;
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
   * Render the shapes of the CAD object.
   * @param shapes - The Shapes object.
   * @returns A nested THREE.Group object and navigation tree.
   */
  render(shapes: Shapes): RenderResult {
    // Clone so the renderer never mutates the caller's shapes (NestedGroup
    // consumes/mutates the parts in place); this.shapes is reused across renders.
    const processedShapes = structuredClone(shapes);
    const group = this._renderTessellatedShapes(processedShapes, true);
    const tree = this._getTree(processedShapes);

    return { group, tree };
  }
}

export { ShapeRenderer };
export type { ShapeTreeData, RenderResult, ShapeRenderConfig };
