import * as THREE from "three";
import { ObjectGroup } from "./objectgroup.js";
import { deepDispose } from "./utils.js";

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
const PLANE_COLORS = {
  light: [0xff0000, 0x00ff00, 0x0000ff],
  dark: [0xff4500, 0x32cd32, 0x3b9eff],
};

/** Plane helper opacity by theme */
const PLANE_HELPER_OPACITY = {
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
   * @param {string} theme - The UI theme ('light' or 'dark').
   * @returns {THREE.MeshBasicMaterial} The plane helper material.
   */
  static createPlaneHelperMaterial(theme) {
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
   * @returns {THREE.MeshBasicMaterial} The back stencil material.
   */
  static createBackStencilMaterial() {
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
   * @returns {THREE.MeshBasicMaterial} The front stencil material.
   */
  static createFrontStencilMaterial() {
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
   * @param {number} color - The plane color as hex.
   * @param {THREE.Plane[]} clippingPlanes - Other clipping planes to apply.
   * @returns {THREE.MeshStandardMaterial} The stencil plane material.
   */
  static createStencilPlaneMaterial(color, clippingPlanes) {
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
 * @extends THREE.Plane
 */
class CenteredPlane extends THREE.Plane {
  /**
   * Create a CenteredPlane.
   * @param {THREE.Vector3} normal - The plane normal vector.
   * @param {number} constant - The centered constant value.
   * @param {number[]} center - The center point [x, y, z].
   */
  constructor(normal, constant, center) {
    super(normal, constant);
    this.center = center;
    this.setConstant(constant);
  }

  /**
   * Set the constant relative to the center point.
   * @param {number} value - The centered constant value.
   */
  setConstant(value) {
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
 * A mesh that visually represents a clipping plane.
 * @extends THREE.Mesh
 */
class PlaneMesh extends THREE.Mesh {
  /** Shared matrix for lookAt calculations */
  static matrix = new THREE.Matrix4();

  /**
   * Create a PlaneMesh.
   * @param {number} index - The plane index (0, 1, or 2).
   * @param {CenteredPlane} plane - The clipping plane.
   * @param {number[]} center - The center point [x, y, z].
   * @param {number} size - The size of the plane mesh.
   * @param {THREE.Material} material - The material for the mesh.
   * @param {number} color - The color as hex value.
   * @param {string} type - The mesh type identifier.
   */
  constructor(index, plane, center, size, material, color, type) {
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
   * @param {THREE.WebGLRenderer} renderer - The renderer.
   */
  onAfterRender = (renderer) => {
    if (this.type.startsWith("StencilPlane")) {
      renderer.clearStencil();
    }
  };

  /**
   * Update the mesh's world matrix to align with the clipping plane.
   * @param {boolean} force - Force update even if not needed.
   */
  updateMatrixWorld(force) {
    this.position.set(0, 0, 0);
    this.scale.set(0.5 * this.size, 0.5 * this.size, 1);

    PlaneMesh.matrix.lookAt(this.position, this.plane.normal, this.up);
    this.quaternion.setFromRotationMatrix(PlaneMesh.matrix);

    this.translateZ(this.plane.constant);
    super.updateMatrixWorld(this, force);
  }
}

/**
 * Create a stencil mesh for clipping visualization.
 * @param {string} name - The mesh name.
 * @param {THREE.Material} material - The stencil material.
 * @param {THREE.BufferGeometry} geometry - The shape geometry.
 * @param {THREE.Plane} plane - The clipping plane.
 * @returns {THREE.Mesh} The stencil mesh.
 * @private
 */
function createStencil(name, material, geometry, plane) {
  material.clippingPlanes = [plane];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

// ============================================================================
// Clipping - Main clipping management class
// ============================================================================

/**
 * Manages clipping planes, stencil rendering, and plane visualization.
 * @extends THREE.Group
 */
class Clipping extends THREE.Group {
  /**
   * Create a Clipping instance.
   * @param {number[]} center - The center point [x, y, z].
   * @param {number} size - The size of the clipping region.
   * @param {Object} nestedGroup - The nested group containing objects to clip.
   * @param {Object} options - Configuration options.
   * @param {Function} [options.onNormalChange] - Callback when a plane normal changes: (index, normalArray) => void.
   * @param {string} theme - The UI theme ('light' or 'dark').
   */
  constructor(center, size, nestedGroup, options, theme) {
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
   * @param {number[]} center - The center point.
   * @private
   */
  _createClipPlanes(center) {
    for (let i = 0; i < 3; i++) {
      const plane = new CenteredPlane(DEFAULT_NORMALS[i], this.distance, center);
      this.clipPlanes.push(plane);

      const reversePlane = new CenteredPlane(
        DEFAULT_NORMALS[i].clone().negate(),
        -this.distance,
        center,
      );
      this.reverseClipPlanes.push(reversePlane);

      if (this.onNormalChange) {
        this.onNormalChange(i, DEFAULT_NORMALS[i].toArray());
      }
    }
  }

  /**
   * Create the visual plane helpers.
   * @param {number[]} center - The center point.
   * @param {number} size - The size of the plane helpers.
   * @param {string} theme - The UI theme.
   * @private
   */
  _createPlaneHelpers(center, size, theme) {
    this.planeHelpers = new THREE.Group();
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
   * Creates front/back stencil meshes and colored plane meshes for each
   * solid object on each of the 3 clipping planes.
   *
   * Note: objectColors and _planeMeshGroup.children are parallel arrays.
   * Each solid's color is stored once per plane (3x total) to match
   * the mesh ordering: [solid0-plane0, solid1-plane0, ..., solid0-plane1, ...].
   *
   * @param {number[]} center - The center point.
   * @param {number} size - The size of the stencil planes.
   * @param {string} theme - The UI theme.
   * @private
   */
  _createStencils(center, size, theme) {
    this._planeMeshGroup = new THREE.Group();
    this._planeMeshGroup.name = "PlaneMeshes";

    for (let i = 0; i < 3; i++) {
      const plane = this.clipPlanes[i];
      const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);
      let j = 0;

      for (const path in this.nestedGroup.groups) {
        const group = this.nestedGroup.groups[path];

        if (group instanceof ObjectGroup && group.subtype === "solid") {
          // Store color for each plane-solid combination (mirrors _planeMeshGroup order)
          this.objectColors.push(group.children[0].material.color.getHex());

          // Create clipping group with front and back stencils
          const clippingGroup = new THREE.Group();
          clippingGroup.name = `clipping-${i}`;

          clippingGroup.add(
            createStencil(
              `frontStencil-${i}-${j}`,
              ClippingMaterials.createFrontStencilMaterial(),
              group.shapeGeometry,
              plane,
            ),
          );

          clippingGroup.add(
            createStencil(
              `backStencil-${i}-${j}`,
              ClippingMaterials.createBackStencilMaterial(),
              group.shapeGeometry,
              plane,
            ),
          );

          group.addType(clippingGroup, `clipping-${i}`);

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

    this.nestedGroup.rootGroup.add(this._planeMeshGroup);
  }

  /**
   * Set the constant (distance from center) for a clipping plane.
   * @param {number} index - The plane index (0, 1, or 2).
   * @param {number} value - The constant value relative to center.
   */
  setConstant(index, value) {
    this.clipPlanes[index].setConstant(value);
    this.reverseClipPlanes[index].setConstant(-value);
  }

  /**
   * Set the normal vector for a clipping plane.
   * @param {number} index - The plane index (0, 1, or 2).
   * @param {THREE.Vector3} normal - The new normal vector.
   */
  setNormal = (index, normal) => {
    const n = normal.clone();
    this.clipPlanes[index].normal = n;
    this.reverseClipPlanes[index].normal = n.clone().negate();
    this.setConstant(index, this.distance);
    if (this.onNormalChange) {
      this.onNormalChange(index, n.toArray());
    }
  };

  /**
   * Get whether object color caps mode is enabled.
   * @returns {boolean} True if object color caps mode is enabled.
   */
  getObjectColorCaps = () => {
    return this.objectColorCaps;
  };

  /**
   * Toggle object color caps mode.
   * When enabled, stencil planes use the original object colors.
   * When disabled, stencil planes use theme-based plane colors.
   * @param {boolean} flag - True to enable object color caps.
   */
  setObjectColorCaps = (flag) => {
    const pmGroup = this._planeMeshGroup;
    if (!pmGroup) return;

    let i = 0;
    let j = -1;
    const len = pmGroup.children.length / 3;
    for (const mesh of pmGroup.children) {
      if (i % len === 0) {
        j++;
      }
      if (flag) {
        mesh.material.color.set(new THREE.Color(this.objectColors[i]));
      } else {
        mesh.material.color.set(new THREE.Color(PLANE_COLORS[this.theme][j]));
      }
      i++;
    }
    this.objectColorCaps = flag;
  };

  /**
   * Set visibility of stencil plane meshes.
   * @param {boolean} flag - True to show, false to hide.
   */
  setVisible = (flag) => {
    const pmGroup = this._planeMeshGroup;
    if (!pmGroup) return;

    for (const mesh of pmGroup.children) {
      mesh.material.visible = flag;
    }
  };

  /**
   * Clean up resources and null out references.
   * Call this when the Clipping instance is no longer needed.
   * Note: Three.js objects (planeHelpers, _planeMeshGroup) are disposed
   * by scene disposal; we only null references here for GC.
   */
  dispose() {
    deepDispose(this.clipPlanes);
    deepDispose(this.reverseClipPlanes);

    this.nestedGroup = null;
    this.clipPlanes = null;
    this.reverseClipPlanes = null;
    this.objectColors = null;
    this.onNormalChange = null;
    this.center = null;
    this.planeHelpers = null;
    this._planeMeshGroup = null;
  }
}

export { Clipping };
