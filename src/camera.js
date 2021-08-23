import * as THREE from "three";
import { defaultDirections } from "./directions.js";

class Camera {
  constructor(width, height, distance, target, ortho, control) {
    this.target = new THREE.Vector3(...target);
    this.control = control;
    this.ortho = ortho;

    this.yaxis = new THREE.Vector3(0, 1, 0);
    this.zaxis = new THREE.Vector3(0, 0, 1);

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
    this.camera.up.set(0, 0, 1);
  }

  setupCamera(relative, position, zoom) {
    if (position != null) {
      var cameraPosition = relative
        ? new THREE.Vector3(...position)
            .normalize()
            .multiplyScalar(this.camera_distance)
            .add(this.target)
            .toArray()
        : position;

      this.camera.position.set(...cameraPosition);
    }

    if (zoom != null) {
      this.camera.zoom = zoom;
    }

    this.camera.up.set(0, 0, 1);

    this.camera.lookAt(this.target);

    this.camera.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    this.camera.updateProjectionMatrix();
  }

  setCamera = (dir) => {
    this.setupCamera(
      true,
      defaultDirections[dir]["position"],
      this.camera.zoom
    );
  };

  switchCamera(ortho_flag) {
    var p0 = this.camera.position;
    var z0 = null;

    if (ortho_flag) {
      // Orthographic camera uses both zoom and position
      z0 = this.getZoom();
      p0.multiplyScalar(z0);
      this.camera = this.oCamera;
      this.ortho = true;
    } else {
      // Perspective camera scalar multiplies zoom to position
      p0.sub(this.target)
        .multiplyScalar(1 / this.getZoom())
        .add(this.target);
      this.camera = this.pCamera;
      this.ortho = false;
    }

    // reposition to the last camera position and zoom
    this.setupCamera(false, p0.toArray(), z0);
  }

  getCamera() {
    return this.camera;
  }

  getZoom() {
    if (this.ortho) {
      return this.camera.zoom;
    } else {
      var p = this.camera.position.clone().sub(this.target);
      return this.camera_distance / p.length();
    }
  }

  setZoom(val) {
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

  getPosition() {
    return this.camera.position;
  }

  setPosition = (x, y, z, relative = false) => {
    this.setupCamera(relative, [x, y, z], null);
  };

  getRotation() {
    return this.camera.rotation;
  }
}

export { Camera };
