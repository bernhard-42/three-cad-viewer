import * as THREE from "three";

import { OrbitControls } from "./controls/OrbitControls.js";
import { TrackballControls } from "./controls/TrackballControls.js";

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
    this.controls = new TrackballControls(this.camera, this.domElement);
    this.controls.dynamicDampingFactor = 1;
  }

  initOrbitControls() {
    this.controls = new OrbitControls(this.camera, this.domElement);
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

  pitch(angle) {
    if (this.type == "orbit") {
      this.controls.rotateUp((-angle / 180) * Math.PI);
    } else {
      console.log("pitch not implmented yet");
    }
  }

  yaw(angle) {
    if (this.type == "orbit") {
      this.controls.rotateLeft((angle / 180) * Math.PI);
    } else {
      console.log("yaw not implmented yet");
    }
  }

  roll(angle) {
    if (this.type == "orbit") {
      console.error("roll does not exist for OrbitControls");
    } else {
      console.log("roll not implmented yet", angle);
    }
  }
}

export { Controls };
