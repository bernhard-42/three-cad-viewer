import * as THREE from "three";
import { defaultDirections } from "./directions.js";

class Camera {
  constructor(width, height, distance, target, ortho, control) {
    this.target = target;
    this.control = control;

    // define the perspective camera

    const aspect = width / height;

    // calculate FOV
    const dfactor = 5;
    this.camera_distance = dfactor * distance;
    var fov = ((2 * Math.atan(1 / dfactor)) / Math.PI) * 180;

    this.pCamera = new THREE.PerspectiveCamera(
      fov,
      aspect,
      0.1,
      100 * distance
    );

    // define the orthographic camera

    const w = distance * 1.3;
    const h = (distance * 1.3) / aspect;

    this.oCamera = new THREE.OrthographicCamera(
      -w,
      w,
      h,
      -h,
      0.1,
      10 * distance
    );

    this.camera = ortho ? this.oCamera : this.pCamera;
  }

  setupCamera(relative, position, up, zoom) {
    const center = new THREE.Vector3(...this.target);

    if (position != null) {
      var cameraPosition = relative
        ? new THREE.Vector3(...position)
            .normalize()
            .multiplyScalar(this.camera_distance)
            .add(center)
            .toArray()
        : position;

      this.camera.position.set(...cameraPosition);
    }

    if (zoom != null) {
      this.camera.zoom = zoom;
    }

    if (this.control == "trackball") {
      this.camera.up.set(...up);
    } else {
      this.camera.up.set(0, 0, 1);
    }

    this.camera.lookAt(center);

    this.camera.updateProjectionMatrix();
  }

  setCamera = (dir) => {
    this.setupCamera(
      true,
      defaultDirections[dir]["position"],
      defaultDirections[dir]["up"],
      this.camera.zoom
    );
  };

  setCameraPosition = (x, y, z, relative = false) => {
    const up = null; // TODO fix for trackball
    this.setupCamera(relative, [x, y, z], up, null);
  };

  setCameraZoom = (value) => {
    this.setupCamera(false, null, null, null, value);
  };

  switchCamera(ortho_flag) {
    this.camera = ortho_flag ? this.oCamera : this.pCamera;

    // TODO fix for trackball and orbit
    var p0 = this.camera.position.toArray();
    var z0 = this.camera.zoom;
    var u0 = this.camera.up.toArray();
    // reposition to the last camera position and zoom
    this.setupCamera(false, p0, u0, z0);
  }

  getCamera() {
    return this.camera;
  }

  getZoom() {
    return this.camera.zoom;
  }

  setZoom(val) {
    this.camera.zoom = val;
  }

  updateProjectionMatrix() {
    this.camera.updateProjectionMatrix();
  }

  getPosition() {
    return this.camera.position;
  }

  getRotation() {
    return this.camera.rotation;
  }
}

export { Camera };
