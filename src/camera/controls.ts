import * as THREE from "three";

import { CADOrbitControls } from "./controls/CADOrbitControls.js";
import { CADTrackballControls } from "./controls/CADTrackballControls.js";
import type { ControlType } from "../core/types";

// Internal normalization factors for user-facing speed settings (1.0 = default experience)
// TrackballControls and OrbitControls have different internal scaling, so we normalize separately
const SPEED_FACTORS: Record<
  ControlType,
  { pan: number; rotate: number; zoom: number }
> = {
  trackball: {
    pan: 0.25,
    rotate: 1.0,
    zoom: 0.5,
  },
  orbit: {
    pan: 1.0,
    rotate: 1.0,
    zoom: 1.0,
  },
};

type ControlsInstance = CADOrbitControls | CADTrackballControls;

class Controls {
  type: ControlType;
  camera: THREE.Camera;
  target: THREE.Vector3;
  target0: THREE.Vector3;
  domElement: HTMLElement;
  rotateSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  holroyd: boolean;
  controls!: ControlsInstance; // Initialized in constructor via initOrbitControls/initTrackballControls
  currentUpdateCallback: (() => void) | null;

  /**
   * Create Camera Controls.
   * @param type - Type of controls: "orbit", "trackball".
   * @param camera - The camera object.
   * @param target - The lookAt target for the camera.
   * @param domElement - The dom element of the rendering canvas.
   * @param rotateSpeed - Speed for rotating.
   * @param zoomSpeed - Speed for zooming.
   * @param panSpeed - Speed for panning.
   * @param holroyd - Enable holroyd (non-tumbling) mode for trackball.
   */
  constructor(
    type: ControlType,
    camera: THREE.Camera,
    target: THREE.Vector3,
    domElement: HTMLElement,
    rotateSpeed: number = 1.0,
    zoomSpeed: number = 1.0,
    panSpeed: number = 1.0,
    holroyd: boolean = true,
  ) {
    this.type = type;
    this.camera = camera;
    this.target = target;
    this.target0 = target.clone();
    this.domElement = domElement;
    this.rotateSpeed = rotateSpeed;
    this.zoomSpeed = zoomSpeed;
    this.panSpeed = panSpeed;
    this.holroyd = holroyd;

    switch (type) {
      case "orbit":
        this.initOrbitControls();
        break;
      case "trackball":
        this.initTrackballControls(holroyd);
        break;
    }

    this.controls.target.copy(this.target);
    this._applySpeedFactors();

    this.currentUpdateCallback = null;

    // save default view for reset
    this.saveState();
    this.update();
  }

  /**
   * Get the speed factors for the current control type.
   */
  private _getSpeedFactors(): { pan: number; rotate: number; zoom: number } {
    return SPEED_FACTORS[this.type];
  }

  /**
   * Apply speed factors to controls.
   */
  private _applySpeedFactors(): void {
    const factors = this._getSpeedFactors();
    this.controls.rotateSpeed = this.rotateSpeed * factors.rotate;
    this.controls.zoomSpeed = this.zoomSpeed * factors.zoom;
    this.controls.panSpeed = this.panSpeed * factors.pan;
  }

  /**
   * Remove assets and event handlers.
   */
  dispose(): void {
    this.controls.dispose();
  }

  /**
   * Save state for reset.
   */
  saveState(): void {
    this.controls.saveState();
  }

  /**
   * Initialize Trackball Controls.
   * @param holroyd - enable holroyd (non tumbling) mode.
   */
  initTrackballControls(holroyd: boolean = true): void {
    this.controls = new CADTrackballControls(this.camera, this.domElement);
    this.setHolroydTrackball(holroyd);
  }

  /**
   * Initialize Orbit Controls.
   */
  initOrbitControls(): void {
    this.controls = new CADOrbitControls(this.camera, this.domElement);
  }

  /**
   * Add an event listener callback for the "change" event.
   * @param callback - the callback function.
   */
  addChangeListener(callback: () => void): void {
    if (this.currentUpdateCallback == null) {
      this.currentUpdateCallback = callback;
      this.controls.addEventListener("change", callback);
    }
  }

  /**
   * Remove the event listener callback for the "change" event.
   */
  removeChangeListener(): void {
    if (this.currentUpdateCallback != null) {
      this.controls.removeEventListener("change", this.currentUpdateCallback);
      this.currentUpdateCallback = null;
    }
  }

  /**
   * Update controls after camera position, zoom or quaternion changes.
   */
  update(): void {
    this.controls.update();
  }

  /**
   * Reset camera to initial (automatically saved) state of position, up, quaternion and zoom.
   */
  reset(): void {
    this.controls.reset();
  }

  /**
   * Set the camera to be controlled.
   * @param camera - a threejs Camera object.
   */
  setCamera(camera: THREE.Camera): void {
    this.controls.object = camera;
  }

  /**
   * Change the trackball holroyd (non tumbling) flag.
   * @param flag - holroyd mode enabled.
   */
  setHolroydTrackball(flag: boolean): void {
    this.getTrackballControls().holroyd = flag;
  }

  /**
   * Get the lookAt target of the camera.
   * @returns The lookAt target
   */
  getTarget(): THREE.Vector3 {
    return this.controls.target;
  }

  /**
   * Get the initial zoom value of the camera.
   */
  getZoom0(): number {
    return this.controls.zoom0;
  }

  /**
   * Set the lookAt target of the camera.
   * @param target - camera target as THREE.Vector3.
   */
  setTarget(target: THREE.Vector3): void {
    this.controls.target.copy(target);
  }

  /**
   * Set the zoom speed.
   * @param val - the speed value (1.0 = default).
   */
  setZoomSpeed(val: number): void {
    this.zoomSpeed = val;
    this.controls.zoomSpeed = val * this._getSpeedFactors().zoom;
  }

  /**
   * Set the pan speed.
   * @param val - the speed value (1.0 = default).
   */
  setPanSpeed(val: number): void {
    this.panSpeed = val;
    this.controls.panSpeed = val * this._getSpeedFactors().pan;
  }

  /**
   * Set the rotate speed.
   * @param val - the speed value (1.0 = default).
   */
  setRotateSpeed(val: number): void {
    this.rotateSpeed = val;
    this.controls.rotateSpeed = val * this._getSpeedFactors().rotate;
  }

  /**
   * Get reset location value.
   * @returns target, position, quaternion, zoom as object.
   */
  getResetLocation = (): {
    target0: THREE.Vector3;
    position0: THREE.Vector3;
    quaternion0: THREE.Quaternion;
    zoom0: number;
  } => {
    return {
      target0: this.controls.target0.clone(),
      position0: this.controls.position0.clone(),
      quaternion0: this.controls.quaternion0.clone(),
      zoom0: this.controls.zoom0,
    };
  };

  /**
   * Set reset location value.
   * @param target - camera target as THREE.Vector3.
   * @param position - camera position as THREE.Vector3.
   * @param quaternion - camera rotation as THREE.Quaternion.
   * @param zoom - camera zoom value.
   */
  setResetLocation = (
    target: THREE.Vector3,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    zoom: number,
  ): void => {
    this.controls.target0.copy(target);
    this.controls.position0.copy(position);
    this.controls.quaternion0.copy(quaternion);
    this.controls.zoom0 = zoom;
  };

  // Type-safe accessors for control-specific methods

  private getOrbitControls(): CADOrbitControls {
    if (!(this.controls instanceof CADOrbitControls)) {
      throw new Error("Operation requires OrbitControls");
    }
    return this.controls;
  }

  private getTrackballControls(): CADTrackballControls {
    if (!(this.controls instanceof CADTrackballControls)) {
      throw new Error("Operation requires TrackballControls");
    }
    return this.controls;
  }

  // Rotations for OrbitControls

  /**
   * Rotate camera up (OrbitControls only)
   * @param angle - the angle to rotate.
   */
  rotateUp(angle: number): void {
    this.getOrbitControls().rotateUp((-angle / 180) * Math.PI);
    this.update();
  }

  /**
   * Rotate camera left (OrbitControls only)
   * @param angle - the angle to rotate.
   */
  rotateLeft(angle: number): void {
    this.getOrbitControls().rotateLeft((angle / 180) * Math.PI);
    this.update();
  }

  // Rotations for TrackballControls

  /**
   * Rotate camera around x-axis (TrackballControls only)
   * @param angle - the angle to rotate.
   */
  rotateX(angle: number): void {
    this.getTrackballControls().rotateX((angle / 180) * Math.PI);
    this.update();
  }

  /**
   * Rotate camera around y-axis (TrackballControls only)
   * @param angle - the angle to rotate.
   */
  rotateY(angle: number): void {
    this.getTrackballControls().rotateY((angle / 180) * Math.PI);
    this.update();
  }

  /**
   * Rotate camera around z-axis (TrackballControls only)
   * @param angle - the angle to rotate.
   */
  rotateZ(angle: number): void {
    this.getTrackballControls().rotateZ((angle / 180) * Math.PI);
    this.update();
  }
}

export { Controls };
