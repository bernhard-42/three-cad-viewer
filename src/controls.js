import * as THREE from "three";

import { CameraControls } from "./controls/CameraControls.js";

class Controls {
  constructor(
    type,
    camera,
    target,
    domElement,
    rotateSpeed,
    zoomSpeed,
    panSpeed
  ) {
    this.type = type;
    this.camera = camera;
    this.target = target;
    this.target0 = target.slice();
    this.domElement = domElement;
    this.rotateSpeed = rotateSpeed;
    this.zoomSpeed = zoomSpeed;
    this.panSpeed = panSpeed;

    switch (type) {
      case "orbit":
        this.initOrbitControls();
        break;
      case "trackball":
        this.initTrackballControls();
        break;
    }

    this.controls.target = new THREE.Vector3(...this.target);
    this.controls.rotateSpeed = this.rotateSpeed;
    this.controls.zoomSpeed = this.zoomSpeed;
    this.controls.panSpeed = this.panSpeed;

    // save default view for reset
    this.controls.saveState();
    this.update();
  }

  initTrackballControls() {
    this.controls = new CameraControls(this.camera, this.domElement);
    this.controls.trackball = true;
    this.controls.holroyd = true;
  }

  initOrbitControls() {
    this.controls = new CameraControls(this.camera, this.domElement);
  }

  addChangeListener(callback) {
    this.controls.addEventListener("change", callback);
  }

  update() {
    this.controls.update();
  }

  reset() {
    this.controls.reset();
  }

  setCamera(camera) {
    this.controls.object = camera;
  }

  getTarget() {
    return this.controls.target;
  }

  setZoomSpeed(val) {
    this.controls.zoomSpeed = val;
  }

  setPanSpeed(val) {
    this.controls.panSpeed = val;
  }

  setRotateSpeed(val) {
    this.controls.rotateSpeed = val;
  }

  // Rotations for OrbitControls

  rotateUp(angle) {
    this.controls.rotateUp((-angle / 180) * Math.PI);
  }

  rotateLeft(angle) {
    this.controls.rotateLeft((angle / 180) * Math.PI);
  }

  // Rotations for TrackballControls

  rotateX(angle) {
    this.controls.rotateX((angle / 180) * Math.PI);
  }

  rotateY(angle) {
    this.controls.rotateY((angle / 180) * Math.PI);
  }

  rotateZ(angle) {
    this.controls.rotateZ((angle / 180) * Math.PI);
  }
}

export { Controls };
