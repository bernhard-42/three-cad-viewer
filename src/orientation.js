import * as THREE from "three";
import { AxesHelper } from "./axes.js";
import { sceneTraverse } from "./utils.js";
import { Font } from "./fontloader/FontLoader.js";
import { helvetiker } from "./font.js";

const length = 54;
const distance = length + 18;
class OrientationMarker {
  constructor(width, height, camera, theme) {
    this.width = width;
    this.height = height;
    this.cad_camera = camera;
    this.theme = theme;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.labels = [];
    this.ready = false;
  }
  create() {
    const font = new Font(helvetiker);
    const size = 2.5;

    // scene
    this.scene = new THREE.Scene();

    // camera
    this.camera = new THREE.OrthographicCamera(
      -this.width,
      this.width,
      this.height,
      -this.height,
      1,
      1000,
    );
    this.camera.up = this.cad_camera.up; // important!
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    // axes
    const axes = new AxesHelper(
      [0, 0, 0],
      length,
      size,
      this.width,
      this.height,
      true,
      true,
      this.theme,
    );
    this.scene.add(axes);

    const colors =
      this.theme === "dark"
        ? [
            [1, 0x45 / 255, 0],
            [0x32 / 255, 0xcd / 255, 0x32 / 255],
            [0x3b / 255, 0x9e / 255, 1],
          ]
        : [
            [1, 0, 0],
            [0, 0.7, 0],
            [0, 0, 1],
          ];
    this.cones = [];
    for (var i = 0; i < 3; i++) {
      var coneGeometry = new THREE.CylinderGeometry(
        0,
        2.5 * size,
        5 * size,
        20,
        1,
      );
      const coneMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(...colors[i]),
        toneMapped: false,
      });
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.matrixAutoUpdate = false;
      this.cones.push(cone);
    }

    this.cones[0].geometry.rotateZ(-Math.PI / 2);
    this.cones[0].geometry.translate(length, 0, 0);
    this.cones[1].geometry.translate(0, length, 0);
    this.cones[2].geometry.rotateX(Math.PI / 2);
    this.cones[2].geometry.translate(0, 0, length);

    this.scene.add(...this.cones);
    const axesNames = ["X", "Y", "Z"];

    for (i = 0; i < 3; i++) {
      const mat = new THREE.LineBasicMaterial({
        // color: new THREE.Color(...colors[i]),
        color:
          this.theme === "dark"
            ? new THREE.Color(0.9, 0.9, 0.9)
            : new THREE.Color(0, 0, 0),
        side: THREE.DoubleSide,
      });
      const shape = font.generateShapes(axesNames[i], 16);
      const geom = new THREE.ShapeGeometry(shape);
      geom.computeBoundingBox();
      const xMid = -0.5 * (geom.boundingBox.max.x - geom.boundingBox.min.x);
      const yMid = -0.5 * (geom.boundingBox.max.y - geom.boundingBox.min.y);
      geom.translate(xMid, yMid, 0);
      const label = new THREE.Mesh(geom, mat);

      this.scene.add(label);
      this.labels.push(label);
    }

    const geometry = new THREE.SphereGeometry(3 * size, 20, 20);
    const material = new THREE.MeshBasicMaterial({ color: 0xa0a0a0 });
    const sphere = new THREE.Mesh(geometry, material);
    this.scene.add(sphere);

    this.scene.background = null;
    this.ready = true;
  }

  dispose() {
    sceneTraverse(this.scene, (o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.scene = null;
    this.camera = null;
  }

  render(renderer) {
    if (this.ready) {
      renderer.setViewport(0, 0, this.width, this.height);

      renderer.render(this.scene, this.camera);
    }
  }

  // handler (bound to OrientationMarker instance)

  update(position, quaternion) {
    if (this.ready) {
      let q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), position.normalize()
      );
      this.camera.position.set(0, 0, 1).applyQuaternion(q).multiplyScalar(300);

      this.camera.quaternion.copy(quaternion);

      for (var i = 0; i < 3; i++) {
        this.labels[i].position.set(
          i == 0 ? distance : 0,
          i == 1 ? distance : 0,
          i == 2 ? distance : 0,
        );
        this.labels[i].quaternion.copy(quaternion);
      }
    }
  }
}

export { OrientationMarker };
