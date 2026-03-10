import * as THREE from "three";
import type { StudioBackground } from "../core/types.js";

/** Backgrounds that are light-toned and need dark grid lines. */
const LIGHT_BACKGROUNDS = new Set<StudioBackground>(["white", "gradient"]);

/**
 * Floor types for Studio mode.
 *
 * - `"grid"` — Grid lines on transparent background
 *
 * Future extensions: `"checker"`, `"textured"`, etc.
 */
export type StudioFloorType = "grid";

/**
 * Studio floor — provides visual grounding for objects in Studio mode.
 *
 * Creates a floor element at the bottom of the scene bounding box.
 * Designed to be extensible: currently supports a grid line pattern,
 * with future support for checkerboard, textured floors, etc.
 *
 * The floor is added to the scene via its `group` property.
 * Grid visibility is toggled via `show()` / `hide()`.
 * Shadow plane visibility is toggled via `setShadowsEnabled()`.
 * The group is visible whenever either the grid or shadow plane is shown.
 */
class StudioFloor {
  /** The Group to add to the scene. Contains the floor mesh(es). */
  readonly group: THREE.Group;

  /** Current grid child (GridHelper) */
  private _currentChild: THREE.Object3D | null = null;

  /** Shadow-receiving plane (ShadowMaterial) */
  private _shadowPlane: THREE.Mesh | null = null;

  /** Whether the grid is currently shown */
  private _gridVisible: boolean = false;

  /** Whether shadows are currently enabled */
  private _shadowsEnabled: boolean = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "studioFloor";
    this.group.visible = false;
  }

  /**
   * Create or recreate the floor for the given scene bounds.
   *
   * Call this when the bounding box changes (new shapes loaded) or
   * when the floor type changes.
   *
   * @param type - The floor pattern to display
   * @param zPosition - Z coordinate for the floor (typically bbox.min.z)
   * @param sceneSize - Approximate scene size (max extent) for sizing the floor
   */
  configure(type: StudioFloorType, zPosition: number, sceneSize: number): void {
    this._clearCurrent();

    switch (type) {
      case "grid":
        this._createGrid(zPosition, sceneSize);
        break;
    }

    // Create shadow plane at the same position and size
    this._createShadowPlane(zPosition, sceneSize);
  }

  /** Make the grid visible. */
  show(): void {
    this._gridVisible = true;
    if (this._currentChild) this._currentChild.visible = true;
    this._updateGroupVisibility();
  }

  /** Hide the grid. */
  hide(): void {
    this._gridVisible = false;
    if (this._currentChild) this._currentChild.visible = false;
    this._updateGroupVisibility();
  }

  /**
   * Toggle shadow plane visibility independently from the grid.
   *
   * @param enabled - Whether to show the shadow plane
   */
  setShadowsEnabled(enabled: boolean): void {
    this._shadowsEnabled = enabled;
    if (this._shadowPlane) this._shadowPlane.visible = enabled;
    this._updateGroupVisibility();
  }

  /**
   * Update grid color/opacity to contrast with the current background.
   * Light backgrounds get dark lines; dark backgrounds get white lines.
   */
  updateForBackground(bg: StudioBackground): void {
    if (!this._currentChild) return;
    this._currentChild.traverse((obj) => {
      if (obj instanceof THREE.LineSegments) {
        const mat = obj.material as THREE.LineBasicMaterial;
        if (LIGHT_BACKGROUNDS.has(bg)) {
          mat.color.setHex(0x000000);
          mat.opacity = 0.12;
        } else {
          mat.color.setHex(0xffffff);
          mat.opacity = 0.15;
        }
      }
    });
  }

  /** Dispose all GPU resources. */
  dispose(): void {
    this._clearCurrent();
  }

  // ---------------------------------------------------------------------------
  // Floor type implementations
  // ---------------------------------------------------------------------------

  /**
   * Create a grid-line floor (like the Three.js car paint example).
   *
   * Uses THREE.GridHelper rotated into the XY plane (Z-up),
   * with subtle white lines and no depth write.
   */
  private _createGrid(zPosition: number, sceneSize: number): void {
    // Floor extends well beyond the objects
    const floorSize = sceneSize * 4;
    // Grid cell size ≈ 5% of scene size, at least 20 divisions
    const divisions = Math.max(40, Math.round(floorSize / (sceneSize * 0.05)));

    // GridHelper creates lines in XZ plane (Y-up convention).
    // Rotate into XY plane for Z-up.
    const grid = new THREE.GridHelper(floorSize, divisions, 0xffffff, 0xffffff);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = zPosition;

    // Subtle appearance: low opacity, no depth write
    const material = grid.material as THREE.LineBasicMaterial;
    material.opacity = 0.15;
    material.transparent = true;
    material.depthWrite = false;

    // Start hidden; show() will make it visible
    grid.visible = this._gridVisible;

    this._currentChild = grid;
    this.group.add(grid);
  }

  /**
   * Create a shadow-receiving plane at the floor position.
   *
   * Uses ShadowMaterial which is fully transparent except where shadows
   * are cast, providing a natural grounding effect without obscuring
   * the background.
   */
  private _createShadowPlane(zPosition: number, sceneSize: number): void {
    const floorSize = sceneSize * 4;

    const geometry = new THREE.PlaneGeometry(floorSize, floorSize);
    const material = new THREE.ShadowMaterial({ opacity: 0.35 });

    const plane = new THREE.Mesh(geometry, material);
    plane.position.z = zPosition;
    plane.receiveShadow = true;
    plane.name = "studioShadowPlane";

    // Start hidden; setShadowsEnabled() controls visibility
    plane.visible = this._shadowsEnabled;

    this._shadowPlane = plane;
    this.group.add(plane);
  }

  // Future: _createChecker(), _createTextured(), etc.

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Update group visibility: visible if either grid or shadow plane is shown. */
  private _updateGroupVisibility(): void {
    this.group.visible = this._gridVisible || this._shadowsEnabled;
  }

  /** Remove and dispose the current floor children (grid + shadow plane). */
  private _clearCurrent(): void {
    if (this._currentChild) {
      this.group.remove(this._currentChild);

      // Dispose geometry and material(s)
      this._currentChild.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.LineSegments
        ) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else if (mat) {
            mat.dispose();
          }
        }
      });

      this._currentChild = null;
    }

    if (this._shadowPlane) {
      this.group.remove(this._shadowPlane);
      this._shadowPlane.geometry.dispose();
      (this._shadowPlane.material as THREE.Material).dispose();
      this._shadowPlane = null;
    }
  }
}

export { StudioFloor };
