import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { ObjectGroup } from "./nestedgroup.js";
import { CLIP_INDICES } from "../core/types";
import type { Theme, ClipIndex } from "../core/types";
import { toVector3Tuple } from "../utils/utils.js";

// ============================================================================
// Constants
// ============================================================================

/** Default normals for the three clipping planes (X, Y, Z) */
const DEFAULT_NORMALS = [
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, -1),
];

/** Plane colors by theme */
const PLANE_COLORS: Record<Theme, number[]> = {
  light: [0xff0000, 0x00ff00, 0x0000ff],
  dark: [0xff4500, 0x32cd32, 0x3b9eff],
};

/** Plane helper opacity by theme */
const PLANE_HELPER_OPACITY: Record<Theme, number> = {
  light: 0.1,
  dark: 0.2,
};

// ============================================================================
// ClippingMaterials - Factory for clipping-related materials
// ============================================================================

/**
 * Factory for creating clipping-related materials.
 * Centralizes material creation and avoids global state.
 */
class ClippingMaterials {
  /**
   * Create a plane helper material.
   * @param theme - The UI theme ('light' or 'dark').
   * @returns The plane helper material.
   */
  static createPlaneHelperMaterial(theme: Theme): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      opacity: PLANE_HELPER_OPACITY[theme] || 0.1,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Create a back stencil material.
   * Increments stencil buffer where back faces are visible (clipped region).
   * @returns The back stencil material.
   */
  static createBackStencilMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      side: THREE.BackSide,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.IncrementWrapStencilOp,
      stencilZFail: THREE.IncrementWrapStencilOp,
      stencilZPass: THREE.IncrementWrapStencilOp,
    });
  }

  /**
   * Create a front stencil material.
   * Decrements stencil buffer where front faces are visible.
   * @returns The front stencil material.
   */
  static createFrontStencilMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: false,
      colorWrite: false,
      side: THREE.FrontSide,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilFail: THREE.DecrementWrapStencilOp,
      stencilZFail: THREE.DecrementWrapStencilOp,
      stencilZPass: THREE.DecrementWrapStencilOp,
    });
  }

  /**
   * Create a stencil plane material.
   * Draws plane where stencil buffer != 0 (clipped region).
   * @param color - The plane color as hex.
   * @param clippingPlanes - Other clipping planes to apply.
   * @returns The stencil plane material.
   */
  static createStencilPlaneMaterial(color: number, clippingPlanes: THREE.Plane[]): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      metalness: 0.3,
      roughness: 0.65,
      opacity: 1.0,
      transparent: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
      clippingPlanes: clippingPlanes,
    });
    return material;
  }
}

// ============================================================================
// CenteredPlane - Plane with center-relative constant
// ============================================================================

/**
 * A THREE.Plane that maintains a constant relative to a center point.
 */
class CenteredPlane extends THREE.Plane {
  center: number[];
  centeredConstant: number;

  /**
   * Create a CenteredPlane.
   * @param normal - The plane normal vector.
   * @param constant - The centered constant value.
   * @param center - The center point [x, y, z].
   */
  constructor(normal: THREE.Vector3, constant: number, center: number[]) {
    super(normal, constant);
    this.center = center;
    this.centeredConstant = constant;
    this.setConstant(constant);
  }

  /**
   * Set the constant relative to the center point.
   * @param value - The centered constant value.
   */
  setConstant(value: number): void {
    this.centeredConstant = value;
    const c = this.distanceToPoint(new THREE.Vector3(...this.center));
    const z = this.distanceToPoint(new THREE.Vector3(0, 0, 0));
    this.constant = z - c + value;
  }
}

// ============================================================================
// PlaneMesh - Visual representation of a clipping plane
// ============================================================================

/**
 * A THREE.Group that only contains PlaneMesh children.
 */
class PlaneMeshGroup extends THREE.Group {
  declare children: PlaneMesh[];
}

/**
 * A mesh that visually represents a clipping plane.
 */
class PlaneMesh extends THREE.Mesh {
  declare type: string;
  declare material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

  /** Shared matrix for lookAt calculations */
  static matrix = new THREE.Matrix4();

  index: number;
  plane: CenteredPlane;
  size: number;
  center: number[];

  /**
   * Create a PlaneMesh.
   * @param index - The plane index (0, 1, or 2).
   * @param plane - The clipping plane.
   * @param center - The center point [x, y, z].
   * @param size - The size of the plane mesh.
   * @param material - The material for the mesh.
   * @param color - The color as hex value.
   * @param type - The mesh type identifier.
   */
  constructor(
    index: number,
    plane: CenteredPlane,
    center: number[],
    size: number,
    material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial,
    color: number,
    type: string
  ) {
    const meshGeometry = new THREE.PlaneGeometry(2, 2);
    meshGeometry.computeBoundingSphere();
    material.color.set(new THREE.Color(color));
    super(meshGeometry, material);

    this.type = type;
    this.index = index;
    this.plane = plane;
    this.size = size;
    this.center = center;
  }

  /**
   * Clear stencil buffer after rendering stencil planes.
   * @param renderer - The renderer.
   */
  onAfterRender = (renderer: THREE.WebGLRenderer): void => {
    if (this.type.startsWith("StencilPlane")) {
      renderer.clearStencil();
    }
  };

  /**
   * Update the mesh's world matrix to align with the clipping plane.
   * @param force - Force update even if not needed.
   */
  updateMatrixWorld(force?: boolean): void {
    this.position.set(0, 0, 0);
    this.scale.set(0.5 * this.size, 0.5 * this.size, 1);

    PlaneMesh.matrix.lookAt(this.position, this.plane.normal, this.up);
    this.quaternion.setFromRotationMatrix(PlaneMesh.matrix);

    this.translateZ(this.plane.constant);
    super.updateMatrixWorld(force);
  }
}

/**
 * Create a stencil mesh for clipping visualization.
 * @param name - The mesh name.
 * @param material - The stencil material.
 * @param geometry - The shape geometry.
 * @param plane - The clipping plane.
 * @returns The stencil mesh.
 */
function createStencil(
  name: string,
  material: THREE.MeshBasicMaterial,
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane
): THREE.Mesh {
  material.clippingPlanes = [plane];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

// ============================================================================
// Clipping - Main clipping management class
// ============================================================================

interface NestedGroupLike {
  groups: Record<string, ObjectGroup | unknown>;
  rootGroup: THREE.Group | null;
}

interface ClippingOptions {
  onNormalChange?: (index: ClipIndex, normalArray: Vector3Tuple) => void;
}

/**
 * Manages clipping planes, stencil rendering, and plane visualization.
 */
class Clipping extends THREE.Group {
  center: number[] | null;
  distance: number;
  onNormalChange: ((index: ClipIndex, normalArray: Vector3Tuple) => void) | null;
  theme: Theme;
  nestedGroup!: NestedGroupLike;
  size: number;
  clipPlanes!: CenteredPlane[];
  reverseClipPlanes!: CenteredPlane[];
  objectColors!: number[];
  objectColorCaps: boolean;
  planeHelpers!: PlaneMeshGroup | null;
  private _planeMeshGroup: PlaneMeshGroup | null;

  /**
   * Create a Clipping instance.
   * @param center - The center point [x, y, z].
   * @param size - The size of the clipping region.
   * @param nestedGroup - The nested group containing objects to clip.
   * @param options - Configuration options.
   * @param theme - The UI theme ('light' or 'dark').
   */
  constructor(
    center: number[],
    size: number,
    nestedGroup: NestedGroupLike,
    options: ClippingOptions,
    theme: Theme
  ) {
    super();
    this.center = center;
    this.distance = size / 2;
    this.onNormalChange = options.onNormalChange || null;
    this.theme = theme;
    this.nestedGroup = nestedGroup;
    this.size = size;

    this.clipPlanes = [];
    this.reverseClipPlanes = [];
    this.objectColors = [];
    this.objectColorCaps = false;

    // Cached reference to avoid O(n) lookups
    this._planeMeshGroup = null;

    this.name = "PlaneHelpers";

    this._createClipPlanes(center);
    this._createPlaneHelpers(center, size, theme);
    this._createStencils(center, size, theme);
  }

  /**
   * Create the three clipping planes and their reverse counterparts.
   * @param center - The center point.
   */
  private _createClipPlanes(center: number[]): void {
    for (const i of CLIP_INDICES) {
      const plane = new CenteredPlane(DEFAULT_NORMALS[i], this.distance, center);
      this.clipPlanes.push(plane);

      const reversePlane = new CenteredPlane(
        DEFAULT_NORMALS[i].clone().negate(),
        -this.distance,
        center,
      );
      this.reverseClipPlanes.push(reversePlane);

      if (this.onNormalChange) {
        this.onNormalChange(i, toVector3Tuple(DEFAULT_NORMALS[i].toArray()));
      }
    }
  }

  /**
   * Create the visual plane helpers.
   * @param center - The center point.
   * @param size - The size of the plane helpers.
   * @param theme - The UI theme.
   */
  private _createPlaneHelpers(center: number[], size: number, theme: Theme): void {
    this.planeHelpers = new PlaneMeshGroup();
    this.planeHelpers.name = "PlaneHelpers";

    for (let i = 0; i < 3; i++) {
      const material = ClippingMaterials.createPlaneHelperMaterial(theme);

      this.planeHelpers.add(
        new PlaneMesh(
          i,
          this.clipPlanes[i],
          center,
          size,
          material,
          PLANE_COLORS[theme][i],
          "PlaneHelper",
        ),
      );
    }

    // Each plane helper is clipped by the other two planes
    for (let i = 0; i < 3; i++) {
      const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);
      this.planeHelpers.children[i].material.clippingPlanes = otherPlanes;
    }

    this.planeHelpers.visible = false;
    this.add(this.planeHelpers);
  }

  /**
   * Create stencil meshes for solid objects.
   * @param center - The center point.
   * @param size - The size of the stencil planes.
   * @param theme - The UI theme.
   */
  private _createStencils(center: number[], size: number, theme: Theme): void {
    this._planeMeshGroup = new PlaneMeshGroup();
    this._planeMeshGroup.name = "PlaneMeshes";

    for (let i = 0; i < 3; i++) {
      const plane = this.clipPlanes[i];
      const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);
      let j = 0;

      for (const path in this.nestedGroup.groups) {
        const group = this.nestedGroup.groups[path];

        if (group instanceof ObjectGroup && group.subtype === "solid" && group.front) {
          // Store color for each plane-solid combination (mirrors _planeMeshGroup order)
          const frontMesh = group.front;
          const material = frontMesh.material;
          this.objectColors.push(material.color.getHex());

          // Create clipping group with front and back stencils
          const clippingGroup = new THREE.Group();
          clippingGroup.name = `clipping-${i}`;

          clippingGroup.add(
            createStencil(
              `frontStencil-${i}-${j}`,
              ClippingMaterials.createFrontStencilMaterial(),
              group.shapeGeometry!,
              plane,
            ),
          );

          clippingGroup.add(
            createStencil(
              `backStencil-${i}-${j}`,
              ClippingMaterials.createBackStencilMaterial(),
              group.shapeGeometry!,
              plane,
            ),
          );

          group.addClipping(clippingGroup, i);

          // Create stencil plane mesh
          const planeMaterial = ClippingMaterials.createStencilPlaneMaterial(
            PLANE_COLORS[theme][i],
            otherPlanes,
          );

          this._planeMeshGroup.add(
            new PlaneMesh(
              i,
              plane,
              center,
              size,
              planeMaterial,
              PLANE_COLORS[theme][i],
              `StencilPlane-${i}-${j}`,
            ),
          );
          j++;
        }
      }
    }

    this.nestedGroup.rootGroup!.add(this._planeMeshGroup);
  }

  /**
   * Set the constant (distance from center) for a clipping plane.
   * @param index - The plane index (0, 1, or 2).
   * @param value - The constant value relative to center.
   */
  setConstant(index: ClipIndex, value: number): void {
    this.clipPlanes[index].setConstant(value);
    this.reverseClipPlanes[index].setConstant(-value);
  }

  /**
   * Set the normal vector for a clipping plane.
   * @param index - The plane index (0, 1, or 2).
   * @param normal - The new normal vector.
   */
  setNormal = (index: ClipIndex, normal: THREE.Vector3): void => {
    const n = normal.clone();
    this.clipPlanes[index].normal = n;
    this.reverseClipPlanes[index].normal = n.clone().negate();
    this.setConstant(index, this.distance);
    if (this.onNormalChange) {
      this.onNormalChange(index, toVector3Tuple(n.toArray()));
    }
  };

  /**
   * Get whether object color caps mode is enabled.
   * @returns True if object color caps mode is enabled.
   */
  getObjectColorCaps = (): boolean => {
    return this.objectColorCaps;
  };

  /**
   * Toggle object color caps mode.
   * When enabled, stencil planes use the original object colors.
   * When disabled, stencil planes use theme-based plane colors.
   * @param flag - True to enable object color caps.
   */
  setObjectColorCaps = (flag: boolean): void => {
    if (!this._planeMeshGroup) return;

    let i = 0;
    let j = -1;
    const len = this._planeMeshGroup.children.length / 3;
    for (const mesh of this._planeMeshGroup.children) {
      if (i % len === 0) {
        j++;
      }
      const color = flag ? this.objectColors[i] : PLANE_COLORS[this.theme][j];
      mesh.material.color.set(new THREE.Color(color));
      i++;
    }
    this.objectColorCaps = flag;
  };

  /**
   * Set visibility of stencil plane meshes.
   * @param flag - True to show, false to hide.
   */
  setVisible = (flag: boolean): void => {
    if (!this._planeMeshGroup) return;

    for (const mesh of this._planeMeshGroup.children) {
      mesh.material.visible = flag;
    }
  };

  /**
   * Clean up resources.
   * Note: We don't null out arrays/references as GC handles cleanup when the Clipping object is collected.
   */
  dispose(): void {
    this.onNormalChange = null;
    this.center = null;
    this.planeHelpers = null;
    this._planeMeshGroup = null;
  }
}

export { Clipping };
