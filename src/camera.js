import * as THREE from "three";
const defaultDirections = {
  iso: new THREE.Vector3(1, 1, 1),
  front: new THREE.Vector3(1, 0, 0),
  rear: new THREE.Vector3(-1, 0, 0),
  left: new THREE.Vector3(0, 1, 0),
  right: new THREE.Vector3(0, -1, 0),
  top: new THREE.Vector3(0, 0, 1),
  bottom: new THREE.Vector3(0, 0, -1),
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
      100 * distance,
    );
    this.pCamera.up.set(0, 0, 1);
    this.pCamera.lookAt(this.target);

    // define the orthographic camera

    const w = distance * 1.35;
    const h = (distance * 1.35) / aspect;

    this.oCamera = new THREE.OrthographicCamera(
      -w,
      w,
      h,
      -h,
      0.1,
      100 * distance,
    );
    this.oCamera.up.set(0, 0, 1);
    this.oCamera.lookAt(this.target);

    this.camera = ortho ? this.oCamera : this.pCamera;
    this.camera.up.set(0, 0, 1);
  }

  /**
   * Remove assets.
   */
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

    this.setPosition(p0, false);
    this.setZoom(z0);
    this.setQuaternion(q0);

    this.updateProjectionMatrix();
  }

  /**
   * Setup the current camera.
   * @param {boolean} relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {THREE.Vector3} position - the camera position (relative or absolute).
   * @param {THREE.Quaternion} quaternion - the camera rotation expressed by a quaternion.
   * @param {number} zoom - zoom value.
   **/
  setupCamera(relative, position = null, quaternion = null, zoom = null) {
    if (position != null) {
      var cameraPosition = relative
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
   * @param {string} dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   **/
  presetCamera(dir, zoom = null) {
    if (zoom == null) {
      zoom = this.camera.zoom;
    }
    // For the default directions quaternion can be ignored, it will be reset automatically
    this.setupCamera(true, defaultDirections[dir], null, zoom);
    this.lookAtTarget();
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
   * @param {boolean} relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {(Array(3) | THREE.Vector3)} position - position as 3 dim Array [x,y,z] or as Vector3.
   **/
  setPosition(position, relative) {
    const scope = this;

    if (Array.isArray(position) && position.length === 3) {
      scope.setupCamera(relative, new THREE.Vector3(...position));
    } else if (position instanceof THREE.Vector3) {
      scope.setupCamera(relative, position);
    } else {
      console.error("wrong type for position", position);
    }
  }

  /**
   * Get the current camera quaternion.
   * @returns {THREE.Quaternion} camera quaternion.
   **/
  getQuaternion() {
    return this.camera.quaternion;
  }

  /**
   * Set camera quaternion.
   * @param {(Array(4)|THREE.Vector3)} quaternion - quaternion as 4 dim Array or as Quaternion.
   **/
  setQuaternion(quaternion) {
    const scope = this;

    if (Array.isArray(quaternion) && quaternion.length === 4) {
      scope.setupCamera(null, null, new THREE.Quaternion(...quaternion));
    } else if (quaternion instanceof THREE.Quaternion) {
      scope.setupCamera(null, null, quaternion);
    } else {
      console.error("wrong type for quaternion", quaternion);
    }

    this.updateProjectionMatrix();
  }

  /**
   * Get the current camera rotation.
   * @returns {THREE.Euler} camera rotation.
   **/
  getRotation() {
    return this.camera.rotation;
  }

  changeDimensions(distance, width, height) {
    const aspect = width / height;
    const w = distance * 1.35;
    const h = (distance * 1.35) / aspect;

    this.oCamera.left = -w;
    this.oCamera.right = w;
    this.oCamera.top = h;
    this.oCamera.bottom = -h;

    this.pCamera.aspect = aspect;

    this.camera.updateProjectionMatrix();    
  }
}

export { Camera };
