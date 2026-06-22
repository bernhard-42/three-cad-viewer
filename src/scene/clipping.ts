import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { ObjectGroup } from "./nestedgroup.js";
import { CLIP_INDICES } from "../core/types";
import type { Theme, ClipIndex } from "../core/types";
import { toVector3Tuple, deepDispose } from "../utils/utils.js";

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

/**
 * Cap-culling thresholds (see {@link Clipping.cull}). The per-solid stencil + cap
 * meshes are correct but O(N) in draw calls; on a large assembly (~1300 solids ×
 * 3 planes × 3 meshes ≈ 12000 draws/frame) a zoomed-out clip+rotate overruns the
 * GPU watchdog → context loss. Culling bounds the per-frame work:
 * - `CAP_CULL_MIN_PX`: skip a solid's caps when its projected screen radius is
 *   below this (sub-pixel solids contribute nothing visible zoomed out).
 * - `CAP_CULL_BUDGET`: hard cap on the number of capped solids (largest-first);
 *   the real crash guard for pathologically dense views. Tune on a real GPU.
 */
export const CAP_CULL_MIN_PX = 3;
export const CAP_CULL_BUDGET = 400;

// Scratch objects for the per-frame screen-size projection + plane-straddle test
// (no per-call alloc).
const _cullCenter = new THREE.Vector3();
const _cullEdge = new THREE.Vector3();
const _cullRight = new THREE.Vector3();
const _cullBox = new THREE.Box3();

/**
 * The stencil + cap meshes backing one solid, grouped so {@link Clipping.cull}
 * can toggle all of a solid's per-plane units together by a single screen-size
 * test. `radiusPx` caches the solid's projected screen radius for the frame.
 */
interface CapUnit {
  solid: ObjectGroup;
  /** The solid's per-plane stencil groups (front+back stencil meshes). */
  stencilGroups: THREE.Group[];
  /** The solid's per-plane cap quads (in `_planeMeshGroup`). */
  capMeshes: PlaneMesh[];
  radiusPx: number;
}

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
  static createStencilPlaneMaterial(
    color: number,
    clippingPlanes: THREE.Plane[],
  ): THREE.MeshStandardMaterial {
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

  /**
   * Clone this CenteredPlane.
   * Overrides THREE.Plane.clone() which calls `new this.constructor()` without
   * arguments, causing `center` to be undefined during shadow map generation.
   */
  // @ts-expect-error -- THREE.Plane.clone() returns `this`, but we need a concrete CenteredPlane
  clone(): CenteredPlane {
    return new CenteredPlane(this.normal.clone(), this.centeredConstant, [
      ...this.center,
    ]);
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
    type: string,
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
  plane: THREE.Plane,
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
 * Saved clipping state for mode transitions (e.g., entering/leaving Studio mode).
 * Captures only Clipping-internal state; renderer flags and ViewerState keys
 * are managed by the caller.
 */
interface ClippingState {
  /** Centered constant (position) for each of the 3 clip planes */
  planeConstants: [number, number, number];
  /** Whether the plane helper meshes (translucent colored rectangles) are visible */
  helperVisible: boolean;
  /** Whether the stencil plane meshes (solid colored caps) are visible */
  planesVisible: boolean;
}

/**
 * Manages clipping planes, stencil rendering, and plane visualization.
 */
class Clipping extends THREE.Group {
  center: number[] | null;
  distance: number;
  onNormalChange:
    | ((index: ClipIndex, normalArray: Vector3Tuple) => void)
    | null;
  theme: Theme;
  nestedGroup!: NestedGroupLike;
  size: number;
  clipPlanes!: CenteredPlane[];
  reverseClipPlanes!: CenteredPlane[];
  objectColors!: number[];
  objectColorCaps: boolean;
  planeHelpers!: PlaneMeshGroup | null;
  private _planeMeshGroup: PlaneMeshGroup | null;
  /** Per-solid stencil/cap units, the unit of screen-size culling. */
  private _capUnits: CapUnit[] = [];
  /**
   * Whether {@link cull} last ran with clipping active. Lets the inactive path
   * gate stencils/caps off exactly once, then early-return on later still frames.
   * Starts `true` so the first inactive call performs the initial gate-off (the
   * meshes default to `visible:true`).
   */
  private _cullActive = true;
  /** Reused buffer for the budget threshold sort (no per-frame alloc). */
  private _radiiScratch: number[] = [];

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
    theme: Theme,
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
      const plane = new CenteredPlane(
        DEFAULT_NORMALS[i],
        this.distance,
        center,
      );
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
  private _createPlaneHelpers(
    center: number[],
    size: number,
    theme: Theme,
  ): void {
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

    // Group the per-(solid,plane) units by solid for screen-size culling. The
    // loop below is plane-major (and `objectColors`/`_planeMeshGroup` order must
    // stay plane-major for setObjectColorCaps), so accumulate into a Map keyed by
    // solid and flatten afterwards — without touching the plane-major structures.
    const unitsBySolid = new Map<ObjectGroup, CapUnit>();

    for (let i = 0; i < 3; i++) {
      const plane = this.clipPlanes[i];
      const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);
      let j = 0;

      for (const path in this.nestedGroup.groups) {
        const group = this.nestedGroup.groups[path];

        if (
          group instanceof ObjectGroup &&
          group.subtype === "solid" &&
          group.front
        ) {
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

          const capMesh = new PlaneMesh(
            i,
            plane,
            center,
            size,
            planeMaterial,
            PLANE_COLORS[theme][i],
            `StencilPlane-${i}-${j}`,
          );
          this._planeMeshGroup.add(capMesh);

          // Record the cull unit for this solid (one entry per solid, holding
          // its up-to-3 per-plane stencil groups + cap quads).
          let unit = unitsBySolid.get(group);
          if (unit === undefined) {
            unit = { solid: group, stencilGroups: [], capMeshes: [], radiusPx: 0 };
            unitsBySolid.set(group, unit);
          }
          unit.stencilGroups.push(clippingGroup);
          unit.capMeshes.push(capMesh);
          j++;
        }
      }
    }

    this._capUnits = [...unitsBySolid.values()];
    this.nestedGroup.rootGroup!.add(this._planeMeshGroup);
  }

  /**
   * Rebuild stencil meshes after scene changes (part add/remove).
   * Clears existing stencils from all ObjectGroups and rebuilds from scratch.
   * Also updates clipping region size if center/size changed.
   * @param center - The new center point [x, y, z].
   * @param size - The new size of the clipping region.
   */
  rebuildStencils(center: number[], size: number): void {
    // Clear existing clipping stencils from all ObjectGroups
    for (const path in this.nestedGroup.groups) {
      const group = this.nestedGroup.groups[path];
      if (group instanceof ObjectGroup) {
        group.clearClipping();
      }
    }

    // Remove old plane mesh group from scene
    if (this._planeMeshGroup && this.nestedGroup.rootGroup) {
      this.nestedGroup.rootGroup.remove(this._planeMeshGroup);
      deepDispose(this._planeMeshGroup);
      this._planeMeshGroup = null;
    }

    // Clear object colors
    this.objectColors = [];

    // Update size/distance
    this.center = center;
    this.size = size;
    this.distance = size / 2;

    // Rebuild stencils with current state
    this._createStencils(center, size, this.theme);

    // Fresh stencil/cap meshes default to visible:true; force the next cull to
    // re-gate them (else an inactive-clip cull would early-return and leave the
    // new meshes rendering).
    this._cullActive = true;

    // Reapply object color caps if enabled
    if (this.objectColorCaps) {
      this.setObjectColorCaps(true);
    }
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
   * Bound the per-frame stencil/cap draw work to keep large assemblies from
   * overrunning the GPU watchdog on clip+rotate (see {@link CAP_CULL_MIN_PX}).
   *
   * Toggles each unit's `Object3D.visible` (NOT material.visible), which composes
   * by AND with the existing material-level toggles — `setShapeVisible` (per-solid
   * hide) and `setVisible` (clip-tab on/off) — so a unit renders only when it is
   * un-culled AND its solid is shown AND the clip tab is active. Render order and
   * the per-solid `clearStencil` isolation are untouched (removing a whole solid's
   * units never affects the remaining solids' cap correctness).
   *
   * @param camera - The active camera (ortho or perspective).
   * @param width - Canvas width in CSS px.
   * @param height - Canvas height in CSS px.
   * @param clipActive - `renderer.localClippingEnabled` (clip tab selected).
   */
  cull(
    camera: THREE.Camera,
    width: number,
    height: number,
    clipActive: boolean,
  ): void {
    if (this._capUnits.length === 0) return;

    if (!clipActive) {
      // Clip off: gate every unit off once (master leaves the stencils rendering
      // every frame as scene-graph children — pure waste), then skip still frames.
      if (!this._cullActive) return;
      for (const unit of this._capUnits) {
        for (const g of unit.stencilGroups) g.visible = false;
        for (const c of unit.capMeshes) c.visible = false;
      }
      this._cullActive = false;
      return;
    }
    this._cullActive = true;

    // Camera right vector in world space = column 0 of the camera world matrix.
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    _cullRight.set(e[0], e[1], e[2]).normalize();
    const halfW = width * 0.5;
    const halfH = height * 0.5;

    // Project each solid's bounding sphere to a screen radius (px).
    const radii = this._radiiScratch;
    radii.length = 0;
    for (const unit of this._capUnits) {
      unit.radiusPx = this._solidScreenRadius(unit.solid, camera, halfW, halfH);
      if (unit.radiusPx >= CAP_CULL_MIN_PX) radii.push(unit.radiusPx);
    }

    // Hard budget: when more solids pass MIN_PX than the budget, keep only the
    // largest CAP_CULL_BUDGET (threshold = the budget-th largest radius). Ties at
    // the threshold may let a few extra through — fine, the budget is approximate.
    let threshold = 0;
    if (radii.length > CAP_CULL_BUDGET) {
      radii.sort((a, b) => b - a);
      threshold = radii[CAP_CULL_BUDGET - 1];
    }

    for (const unit of this._capUnits) {
      const solidPass =
        unit.radiusPx >= CAP_CULL_MIN_PX && unit.radiusPx >= threshold;
      // Per-plane gate: also require the plane to actually cut the solid. A plane
      // parked open (or entirely past the solid) does not straddle the bbox; on a
      // non-watertight solid its front/back stencil parity then fails to cancel,
      // leaving a "ghost" cap floating where nothing is cut. Skipping those units
      // (stencil AND cap together — they MUST stay paired so the per-cap
      // clearStencil keeps isolating solids) removes the ghosts. Stencil/cap are
      // gated jointly because an orphaned stencil write with no cap to clear it
      // would corrupt the next solid's cap.
      const box = solidPass ? this._solidWorldBox(unit.solid) : null;
      for (let k = 0; k < unit.capMeshes.length; k++) {
        const cap = unit.capMeshes[k];
        const planeHit =
          box !== null && this.clipPlanes[cap.index].intersectsBox(box);
        unit.stencilGroups[k].visible = planeHit;
        cap.visible = planeHit;
      }
    }
  }

  /**
   * World-space AABB of a solid (local bounding box transformed by the front
   * mesh's world matrix, which folds in GDS z-scale). Returns a shared scratch
   * Box3 (valid only until the next call) or `null` when geometry is missing.
   */
  private _solidWorldBox(solid: ObjectGroup): THREE.Box3 | null {
    const front = solid.front;
    const geometry = solid.shapeGeometry;
    if (!front || !geometry) return null;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb === null) return null;
    _cullBox.copy(bb).applyMatrix4(front.matrixWorld);
    return _cullBox;
  }

  /**
   * Projected screen radius (px) of a solid's bounding sphere. Projects the world
   * sphere center and a point one world-radius along the camera-right axis, and
   * measures their screen-space separation — correct for both ortho and
   * perspective. Returns `Infinity` (never cull) when geometry is missing.
   */
  private _solidScreenRadius(
    solid: ObjectGroup,
    camera: THREE.Camera,
    halfW: number,
    halfH: number,
  ): number {
    const front = solid.front;
    const geometry = solid.shapeGeometry;
    if (!front || !geometry) return Infinity;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    const bs = geometry.boundingSphere;
    if (bs === null) return Infinity;

    // front.matrixWorld already folds in GDS z-scale (applied below ObjectGroup);
    // read it as-is (one-frame stale during animation is harmless for culling).
    const m = front.matrixWorld;
    _cullCenter.copy(bs.center).applyMatrix4(m);
    const r = bs.radius * m.getMaxScaleOnAxis();
    _cullEdge.copy(_cullCenter).addScaledVector(_cullRight, r);

    _cullCenter.project(camera);
    _cullEdge.project(camera);
    const dx = (_cullEdge.x - _cullCenter.x) * halfW;
    const dy = (_cullEdge.y - _cullCenter.y) * halfH;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Save the current clipping state for later restoration.
   * Captures plane positions, helper visibility, and stencil plane visibility.
   * Used by Studio mode to snapshot clipping state before disabling clipping.
   *
   * Note: `renderer.localClippingEnabled` and `clipPlaneHelpers` ViewerState
   * are managed by the caller (Display/Viewer layer), not captured here.
   */
  saveState(): ClippingState {
    return {
      planeConstants: [
        this.clipPlanes[0].centeredConstant,
        this.clipPlanes[1].centeredConstant,
        this.clipPlanes[2].centeredConstant,
      ],
      helperVisible: this.planeHelpers?.visible ?? false,
      planesVisible: this._planeMeshGroup?.children.length
        ? this._planeMeshGroup.children[0].material.visible
        : false,
    };
  }

  /**
   * Restore a previously saved clipping state.
   * Re-applies plane positions, helper visibility, and stencil plane visibility.
   * Used by Studio mode when leaving to restore the clipping configuration.
   *
   * @param state - The state previously captured by `saveState()`.
   */
  restoreState(state: ClippingState): void {
    // Restore plane positions
    for (const i of CLIP_INDICES) {
      this.setConstant(i, state.planeConstants[i]);
    }

    // Restore plane helper visibility
    if (this.planeHelpers) {
      this.planeHelpers.visible = state.helperVisible;
    }

    // Restore stencil plane mesh visibility
    this.setVisible(state.planesVisible);
  }

  /**
   * Clean up resources.
   * Note: We don't null out arrays/references as GC handles cleanup when the Clipping object is collected.
   */
  dispose(): void {
    this.onNormalChange = null;
    this.center = null;
    this.planeHelpers = null;
    this._planeMeshGroup = null;
    this._capUnits = [];
  }
}

export { Clipping };
export type { ClippingState };
