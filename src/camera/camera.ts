import * as THREE from "three";
import type { Vector3Tuple, QuaternionTuple } from "three";
import type { UpDirection } from "../core/types";
import { logger } from "../utils/logger.js";

type CameraDirection = "iso" | "front" | "rear" | "left" | "right" | "top" | "bottom";

interface DirectionConfig {
  pos: THREE.Vector3;
  quat: THREE.Quaternion | null;
}

type DirectionMap = Record<CameraDirection, DirectionConfig>;

type UpMode = "y_up" | "z_up" | "legacy";

const defaultDirections: Record<UpMode, DirectionMap> = {
  y_up: {
    // compatible to fusion 360
    iso: { pos: new THREE.Vector3(1, 1, 1), quat: null },
    front: { pos: new THREE.Vector3(0, 0, 1), quat: null },
    rear: { pos: new THREE.Vector3(0, 0, -1), quat: null },
    left: { pos: new THREE.Vector3(-1, 0, 0), quat: null },
    right: { pos: new THREE.Vector3(1, 0, 0), quat: null },
    top: { pos: new THREE.Vector3(0, 1, 0), quat: null },
    bottom: { pos: new THREE.Vector3(0, -1, 0), quat: null },
  },
  z_up: {
    // compatible to FreeCAD, OnShape
    iso: { pos: new THREE.Vector3(1, -1, 1), quat: null },
    front: { pos: new THREE.Vector3(0, -1, 0), quat: null },
    rear: { pos: new THREE.Vector3(0, 1, 0), quat: null },
    left: { pos: new THREE.Vector3(-1, 0, 0), quat: null },
    right: { pos: new THREE.Vector3(1, 0, 0), quat: null },
    top: { pos: new THREE.Vector3(0, 0, 1), quat: new THREE.Quaternion(0, 0, 0, 1) },
    bottom: { pos: new THREE.Vector3(0, 0, -1), quat: new THREE.Quaternion(1, 0, 0, 0) },
  },
  legacy: {
    // legacy Z up
    iso: { pos: new THREE.Vector3(1, 1, 1), quat: null },
    front: { pos: new THREE.Vector3(1, 0, 0), quat: null },
    rear: { pos: new THREE.Vector3(-1, 0, 0), quat: null },
    left: { pos: new THREE.Vector3(0, 1, 0), quat: null },
    right: { pos: new THREE.Vector3(0, -1, 0), quat: null },
    top: { pos: new THREE.Vector3(0, 0, 1), quat: null },
    bottom: { pos: new THREE.Vector3(0, 0, -1), quat: null },
  },
};

const cameraUp: Record<UpMode, [number, number, number]> = {
  y_up: [0, 1, 0],
  z_up: [0, 0, 1],
  legacy: [0, 0, 1],
};

/**
 * Manages orthographic and perspective cameras for the viewer.
 *
 * Camera wraps both camera types and provides:
 * - Seamless switching between orthographic and perspective
 * - Preset positions (iso, front, top, etc.)
 * - Support for Y-up and Z-up coordinate systems
 * - Synchronized position/zoom across camera types
 *
 * ## Coordinate Systems
 * Supports three modes via `up` parameter:
 * - `"Y"`: Y-up (Fusion 360 compatible)
 * - `"Z"`: Z-up (FreeCAD, OnShape compatible)
 * - Legacy Z-up mode
 *
 * @internal - This is an internal class used by Viewer
 */
class Camera {
  private static readonly DISTANCE_FACTOR = 5;

  target: THREE.Vector3;
  ortho: boolean;
  up: UpMode;
  yaxis: THREE.Vector3;
  zaxis: THREE.Vector3;
  camera_distance: number;
  pCamera!: THREE.PerspectiveCamera; // Initialized in constructor
  oCamera!: THREE.OrthographicCamera; // Initialized in constructor
  camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera; // Set in constructor

  /**
   * Create a combined camera (orthographic and perspective).
   * @param width - canvas width.
   * @param height - canvas height.
   * @param distance - distance from the lookAt point.
   * @param target - target (Vector3) to look at.
   * @param ortho - flag whether the initial camera should be orthographic.
   * @param up - Z or Y to define whether Z or Y direction is camera up.
   */
  constructor(
    width: number,
    height: number,
    distance: number,
    target: Vector3Tuple,
    ortho: boolean,
    up: UpDirection
  ) {
    const mapping: Record<string, UpMode> = {
      Y: "y_up",
      Z: "z_up",
      L: "legacy",
    };
    this.target = new THREE.Vector3(...target);
    this.ortho = ortho;
    this.up = mapping[up] || "z_up";
    this.yaxis = new THREE.Vector3(0, 1, 0);
    this.zaxis = new THREE.Vector3(0, 0, 1);

    // define the perspective camera

    const aspect = width / height;

    // 22 is a good compromise
    const fov = 22;

    this.camera_distance = Camera.DISTANCE_FACTOR * distance;

    this.pCamera = new THREE.PerspectiveCamera(
      fov,
      aspect,
      0.1,
      100 * distance,
    );
    this.pCamera.up.set(...cameraUp[this.up]);
    this.pCamera.lookAt(this.target);

    // define the orthographic camera
    const pSize = this.projectSize(distance, aspect);

    this.oCamera = new THREE.OrthographicCamera(
      -pSize[0],
      pSize[0],
      pSize[1],
      -pSize[1],
      0.1,
      100 * distance,
    );
    this.oCamera.up.set(...cameraUp[this.up]);
    this.oCamera.lookAt(this.target);

    this.camera = ortho ? this.oCamera! : this.pCamera!;
    this.camera.up.set(...cameraUp[this.up]);
  }

  /**
   * Update the far clipping plane for both cameras.
   * @param distance - The new bounding radius to base the far plane on.
   */
  updateFarPlane(distance: number): void {
    const far = 100 * distance;
    this.pCamera.far = far;
    this.oCamera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Recalculate camera_distance from a new bounding radius.
   * Uses the same factor as the constructor so that zoom 1.0 frames the scene.
   * @param distance - The new bounding radius (bb_radius).
   */
  updateCameraDistance(distance: number): void {
    this.camera_distance = Camera.DISTANCE_FACTOR * distance;
  }

  /**
   * Remove assets.
   */
  dispose(): void {
    // Cameras are simple objects; no explicit cleanup needed.
    // The Camera instance itself will be garbage collected.
  }

  /**
   * Get the current camera.
   * @returns Camera object.
   */
  getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Set the lookAt point for the camera to the provided target.
   */
  lookAtTarget(): void {
    this.camera.lookAt(this.target);
  }

  /**
   * Update current camera's projection matrix.
   */
  updateProjectionMatrix(): void {
    this.camera.updateProjectionMatrix();
  }

  /**
   * Switch between orthographic and perspective camera.
   * @param ortho_flag - true for orthographic camera, else perspective camera.
   */
  switchCamera(ortho_flag: boolean): void {
    const p0 = this.getPosition().clone();
    const z0 = this.getZoom();
    const q0 = this.getQuaternion().clone();

    if (ortho_flag) {
      this.camera = this.oCamera;
      this.ortho = true;
    } else {
      this.camera = this.pCamera;
      this.ortho = false;
    }

    this.setPosition(p0, false);
    this.setZoom(z0);
    this.setQuaternion(q0);

    this.updateProjectionMatrix();
  }

  /**
   * Calculate projected size for orthographic camera.
   * @param frustum - View frustum size.
   * @param aspect - Viewer aspect ratio (width / height).
   * @returns Width and height [w, h] for the orthographic camera.
   */
  projectSize(frustum: number, aspect: number): [number, number] {
    let w: number, h: number;
    if (aspect < 1) {
      w = frustum;
      h = w / aspect;
    } else {
      h = frustum;
      w = h * aspect;
    }
    return [w, h];
  }

  /**
   * Setup the current camera.
   * @param relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param position - the camera position (relative or absolute).
   * @param quaternion - the camera rotation expressed by a quaternion.
   * @param zoom - zoom value.
   */
  setupCamera(
    relative: boolean,
    position: THREE.Vector3 | null = null,
    quaternion: THREE.Quaternion | null = null,
    zoom: number | null = null
  ): void {
    if (position != null) {
      const cameraPosition = relative
        ? position
            .clone()
            .normalize()
            .multiplyScalar(this.camera_distance)
            .add(this.target)
        : position;

      this.camera.position.set(...cameraPosition.toArray());
    }

    if (quaternion != null) {
      this.camera.quaternion.set(...quaternion.toArray());
    }

    if (zoom != null) {
      this.setZoom(zoom);
    }

    this.updateProjectionMatrix();
  }

  /**
   * Move the camera to a given preset.
   * @param dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   */
  presetCamera(dir: CameraDirection, zoom: number | null = null): void {
    if (zoom == null) {
      zoom = this.camera.zoom;
    }
    // For the default directions quaternion can be ignored, it will be reset automatically
    this.setupCamera(true, defaultDirections[this.up][dir].pos, null, zoom);
    this.lookAtTarget();

    const quat = defaultDirections[this.up][dir].quat;
    if (quat != null) {
      this.setQuaternion(quat);
    }
  }

  /**
   * Return current zoom value.
   * @returns zoom value.
   */
  getZoom(): number {
    if (this.ortho) {
      return this.camera.zoom;
    } else {
      const p = this.camera.position.clone().sub(this.target);
      return this.camera_distance / p.length();
    }
  }

  /**
   * Set zoom value.
   * @param val - float zoom value.
   */
  setZoom(val: number): void {
    if (this.ortho) {
      this.camera.zoom = val;
    } else {
      this.camera.position
        .sub(this.target)
        .setLength(this.camera_distance / val)
        .add(this.target);
    }

    this.updateProjectionMatrix();
  }

  /**
   * Get the current camera position.
   * @returns camera position.
   */
  getPosition(): THREE.Vector3 {
    return this.camera.position;
  }

  /**
   * Set camera position.
   * @param position - position as 3 dim Array [x,y,z] or as Vector3.
   * @param relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   */
  setPosition(position: Vector3Tuple | THREE.Vector3, relative: boolean): void {
    if (Array.isArray(position) && position.length === 3) {
      this.setupCamera(relative, new THREE.Vector3(...position));
    } else if (position instanceof THREE.Vector3) {
      this.setupCamera(relative, position);
    } else {
      logger.error("wrong type for position", position);
    }
  }

  /**
   * Get the current camera quaternion.
   * @returns camera quaternion.
   */
  getQuaternion(): THREE.Quaternion {
    return this.camera.quaternion;
  }

  /**
   * Set camera quaternion.
   * @param quaternion - quaternion as 4 dim Array or as Quaternion.
   */
  setQuaternion(quaternion: QuaternionTuple | THREE.Quaternion): void {
    if (Array.isArray(quaternion) && quaternion.length === 4) {
      this.setupCamera(false, null, new THREE.Quaternion(...quaternion));
    } else if (quaternion instanceof THREE.Quaternion) {
      this.setupCamera(false, null, quaternion);
    } else {
      logger.error("wrong type for quaternion", quaternion);
    }

    this.updateProjectionMatrix();
  }

  /**
   * Get the current camera rotation.
   * @returns camera rotation.
   */
  getRotation(): THREE.Euler {
    return this.camera.rotation;
  }

  /**
   * Get the visible area dimensions at the target plane.
   * @returns The visible width and height.
   */
  getVisibleArea(): { width: number; height: number } {
    if (this.ortho && this.oCamera) {
      const height = (this.oCamera.top - this.oCamera.bottom) / this.oCamera.zoom;
      const width = (this.oCamera.right - this.oCamera.left) / this.oCamera.zoom;
      return { width, height };
    } else if (this.pCamera) {
      const distance = this.pCamera.position.distanceTo(this.target);
      const vFOV = (this.pCamera.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFOV / 2) * distance;
      const width = height * this.pCamera.aspect;
      return { width, height };
    }
    return { width: 0, height: 0 };
  }

  /**
   * Update camera dimensions when viewport size changes.
   * @param distance - Distance used for orthographic frustum calculation.
   * @param width - New viewport width in pixels.
   * @param height - New viewport height in pixels.
   */
  changeDimensions(distance: number, width: number, height: number): void {
    const aspect = width / height;
    const pSize = this.projectSize(distance, aspect);

    if (this.oCamera) {
      this.oCamera.left = -pSize[0];
      this.oCamera.right = pSize[0];
      this.oCamera.top = pSize[1];
      this.oCamera.bottom = -pSize[1];
    }

    if (this.pCamera) {
      this.pCamera.aspect = aspect;
    }

    if (this.camera) {
      this.camera.updateProjectionMatrix();
    }
  }
}

export { Camera };
export type { CameraDirection, UpMode };
