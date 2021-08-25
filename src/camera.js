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
    this.pCamera.up.set(0, 0, 1);
    this.pCamera.lookAt(this.target);

    // define the orthographic camera

    const w = distance * 1.3;
    const h = (distance * 1.3) / aspect;

    this.oCamera = new THREE.OrthographicCamera(
      -w,
      w,
      h,
      -h,
      0.1,
      100 * distance
    );
    this.oCamera.up.set(0, 0, 1);
    this.oCamera.lookAt(this.target);

    this.camera = ortho ? this.oCamera : this.pCamera;
    this.camera.up.set(0, 0, 1);
  }

  getCamera() {
    return this.camera;
  }

  lookAtCenter() {
    this.camera.lookAt(this.target);
  }

  updateProjectionMatrix() {
    this.camera.updateProjectionMatrix();
  }

  switchCamera(ortho_flag) {
    var p0 = this.getPosition().clone();
    const z0 = this.getZoom();
    const q0 = this.getQuaternion().clone();

    if (ortho_flag) {
      this.camera = this.oCamera;
      this.ortho = true;
    } else {
      this.camera = this.pCamera;
      this.ortho = false;
    }

    this.setPosition(p0);
    this.setZoom(z0);
    this.setQuaternion(q0);

    this.updateProjectionMatrix();
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

    this.camera.lookAt(this.target);
    this.updateProjectionMatrix();
  }

  presetCamera = (dir) => {
    this.setupCamera(
      true,
      defaultDirections[dir]["position"],
      this.camera.zoom
    );
  };

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

  setPosition = (x, y = null, z = null, relative = false) => {
    const scope = this;

    function set() {
      const first = arguments[0];

      if (Array.isArray(first) && first.length === 3) {
        scope.setupCamera(y == null ? false : y, first, null);
      } else if (first instanceof THREE.Vector3) {
        scope.setupCamera(y == null ? false : y, first.toArray(), null);
      } else {
        scope.setupCamera(relative, [x, y, z], null);
      }
    }
    set(x, y, z, relative);
  };

  getQuaternion() {
    return this.camera.quaternion;
  }

  setQuaternion = (x, y = null, z = null, w = null) => {
    const scope = this;

    function set() {
      const first = arguments[0];

      if (Array.isArray(first) && first.length === 4) {
        scope.camera.quaternion.set(...first);
      } else if (first instanceof THREE.Quaternion) {
        scope.camera.quaternion.set(...first.toArray());
      } else {
        scope.camera.quaternion.set(...arguments);
      }
    }
    set(x, y, z, w);
  };

  getRotation() {
    return this.camera.rotation;
  }
}

export { Camera };
