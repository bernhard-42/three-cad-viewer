import * as THREE from "three";

/**
 * Studio floor — shadow-catching ground plane for Studio mode.
 *
 * Uses ShadowMaterial which is fully transparent except where shadows
 * are cast, providing a natural grounding effect without obscuring
 * the background (like KeyShot's Ground material or Fusion 360's
 * ground plane).
 *
 * The floor is added to the scene via its `group` property.
 * Shadow plane visibility is toggled via `setShadowsEnabled()`.
 */
class StudioFloor {
  /** The Group to add to the scene. Contains the shadow plane. */
  readonly group: THREE.Group;

  /** Shadow-receiving plane (ShadowMaterial) */
  private _shadowPlane: THREE.Mesh | null = null;

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
   * Call this when the bounding box changes (new shapes loaded).
   *
   * @param zPosition - Z coordinate for the floor (typically bbox.min.z)
   * @param sceneSize - Approximate scene size (max extent) for sizing the floor
   */
  configure(zPosition: number, sceneSize: number): void {
    this._clearCurrent();
    this._createShadowPlane(zPosition, sceneSize);
  }

  /**
   * Toggle shadow plane visibility.
   *
   * @param enabled - Whether to show the shadow plane
   */
  setShadowsEnabled(enabled: boolean): void {
    this._shadowsEnabled = enabled;
    if (this._shadowPlane) this._shadowPlane.visible = enabled;
    this.group.visible = this._shadowsEnabled;
  }

  /**
   * Set the ground shadow opacity (how dark the shadow appears on the floor).
   * This supplements `light.shadow.intensity` which controls shadow darkness
   * on lit materials; the ground plane ShadowMaterial needs its own opacity.
   *
   * @param intensity - Shadow intensity 0-1
   */
  setShadowIntensity(intensity: number): void {
    if (this._shadowPlane) {
      (this._shadowPlane.material as THREE.ShadowMaterial).opacity =
        intensity * 1.0;
    }
  }

  /** Dispose all GPU resources. */
  dispose(): void {
    this._clearCurrent();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Create a shadow-receiving plane at the floor position.
   */
  private _createShadowPlane(zPosition: number, sceneSize: number): void {
    const floorSize = sceneSize * 6;

    const geometry = new THREE.PlaneGeometry(floorSize, floorSize);
    const material = new THREE.ShadowMaterial({
      opacity: 0.5,
      depthWrite: false,
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.position.z = zPosition;
    plane.receiveShadow = true;
    plane.name = "studioShadowPlane";

    // Start hidden; setShadowsEnabled() controls visibility
    plane.visible = this._shadowsEnabled;

    this._shadowPlane = plane;
    this.group.add(plane);
  }

  /** Remove and dispose the current shadow plane. */
  private _clearCurrent(): void {
    if (this._shadowPlane) {
      this.group.remove(this._shadowPlane);
      this._shadowPlane.geometry.dispose();
      (this._shadowPlane.material as THREE.Material).dispose();
      this._shadowPlane = null;
    }
  }
}

export { StudioFloor };
