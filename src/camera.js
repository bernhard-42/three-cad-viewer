import * as THREE from "three";
const defaultDirections = {
  iso: [1, 1, 1],
  front: [1, 0, 0],
  rear: [-1, 0, 0],
  left: [0, 1, 0],
  right: [0, -1, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1]
};
class Camera {
  /**
   * Create a combined camera (orthographic and persepctive).
   * @param {number} width - canvas width.
   * @param {number} height - canvas height.
   * @param {number} distance - distance from the lookAt point.
   * @param {THREE.Vector3} target - target (Vector3) to look at.
   * @param {boolean} ortho - flag whether the initial camera should be orthographic.
   **/
  constructor(width, height, distance, target, ortho) {
    this.target = new THREE.Vector3(...target);
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

  dispose() {
    this.oCamera = null;
    this.pCamera = null;
  }

  /**
   * Get the current camera.
   * @returns {THREE.Camera} Camera object.
   **/
  getCamera() {
    return this.camera;
  }

  /**
   * Set the lookAt point for the camera to the provided target.
   **/
  lookAtTarget() {
    this.camera.lookAt(this.target);
  }

  /**
   * Update current camera's projection matrix.
   **/
  updateProjectionMatrix() {
    this.camera.updateProjectionMatrix();
  }

  /**
   * Switch between orthographic and perspective camera.
   * @param {boolean} ortho_flag - true for orthographic camera, else persepctive camera.
   **/
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

    this.setPosition(false, p0);
    this.setZoom(z0);
    this.setQuaternion(q0);

    this.updateProjectionMatrix();
  }

  /**
   * Setup the current camera.
   * @param {boolean} relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {number[]} position - array of x,y,z coordinates of the position (relative or absolute).
   * @param {number} zoom - zoom value.
   **/
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

  /**
   * Move the camera to a given preset.
   * @param {string} dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   **/
  presetCamera(dir) {
    this.setupCamera(true, defaultDirections[dir], this.camera.zoom);
  }

  /**
   * Return current zoom value.
   * @returns {number} zoom value.
   **/
  getZoom() {
    if (this.ortho) {
      return this.camera.zoom;
    } else {
      var p = this.camera.position.clone().sub(this.target);
      return this.camera_distance / p.length();
    }
  }

  /**
   * Set zoom value.
   * @param {number} val - float zoom value.
   **/
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

  /**
   * Get the current camera position.
   * @returns {THREE.Vector3} camera position.
   **/
  getPosition() {
    return this.camera.position;
  }

  /**
   * Set camera position.
   * @param {relative} - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {(number | Array(3) | THREE.Vector3)} x - float value x of position or position as 3 dim Array [x,y,z] or as Vector3.
   * @param {number} [y] - float value y of position or null if x is array or Vector3.
   * @param {number} [z] - float value z of position or null if x is array or Vector3.
   **/
  setPosition(relative, x, y = null, z = null) {
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

    this.updateProjectionMatrix();
  }

  /**
   * Get the current camera quaternion.
   * @returns {THREE.Quaternion} camera quaternion.
   **/
  getQuaternion() {
    return this.camera.quaternion;
  }

  /**
   * Set camera position.
   * @param {(number|Array(4)|THREE.Vector3)} x - float x value of position or position as 4 dim Array or as Quaternion.
   * @param {number} [y] - float y value of position or null if x is array or Vector3.
   * @param {number} [z] - float z value of position or null if x is array or Vector3.
   * @param {number} [w] - float w value of position or null if x is array or Vector3.
   **/
  setQuaternion(x, y = null, z = null, w = null) {
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

    this.updateProjectionMatrix();
  }

  /**
   * Get the current camera rotation.
   * @returns {THREE.Euler} camera rotation.
   **/
  getRotation() {
    return this.camera.rotation;
  }
}

export { Camera };
