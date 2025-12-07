import * as THREE from "three";
import { AxesHelper } from "./axes.js";
import { sceneTraverse } from "./utils.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { helvetiker, FontData } from "./font.js";
import type { Theme } from "./types";

/** Length of orientation marker axes in pixels */
const length = 54;
/** Distance from origin to axis labels */
const distance = length + 18;

type ColorTuple = [number, number, number];
type ThemeColors = Record<Theme, ColorTuple[]>;

/**
 * Displays an orientation gizmo in the corner showing XYZ axes.
 * Syncs rotation with the main camera.
 */
class OrientationMarker {
  width: number;
  height: number;
  cad_camera: THREE.Camera | null;
  theme: Theme;
  camera: THREE.OrthographicCamera | null;
  scene: THREE.Scene | null;
  renderer: THREE.WebGLRenderer | null;
  labels: THREE.Mesh[];
  ready: boolean;
  colors: ThemeColors;
  cones: THREE.Mesh[];
  axes: AxesHelper | null;

  /**
   * Create an OrientationMarker.
   * @param width - Viewport width for the marker.
   * @param height - Viewport height for the marker.
   * @param camera - The main CAD camera to sync orientation with.
   * @param theme - Color theme ("dark" or "light").
   */
  constructor(width: number, height: number, camera: THREE.Camera, theme: Theme) {
    this.width = width;
    this.height = height;
    this.cad_camera = camera;
    this.theme = theme;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.labels = [];
    this.ready = false;
    this.colors = {
      dark: [
        [1, 69 / 255, 0],
        [50 / 255, 205 / 255, 50 / 255],
        [59 / 255, 158 / 255, 1],
      ],
      light: [
        [1, 0, 0],
        [0, 0.5, 0],
        [0, 0, 1],
      ],
    };
    this.cones = [];
    this.axes = null;
  }

  /**
   * Create the orientation marker scene with axes, cones, and labels.
   */
  create(): void {
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
    this.camera.up = this.cad_camera!.up; // important!
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    // axes
    this.axes = new AxesHelper(
      [0, 0, 0],
      length,
      size,
      this.width,
      this.height,
      true,
      true,
      this.theme,
    );
    this.scene.add(this.axes);

    this.cones = [];
    for (let i = 0; i < 3; i++) {
      const coneGeometry = new THREE.CylinderGeometry(
        0,
        2.5 * size,
        5 * size,
        20,
        1,
      );
      const coneMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(...this.colors[this.theme][i]),
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

    for (let i = 0; i < 3; i++) {
      const mat = new THREE.LineBasicMaterial({
        color:
          this.theme === "dark"
            ? new THREE.Color(0.9, 0.9, 0.9)
            : new THREE.Color(0, 0, 0),
        side: THREE.DoubleSide,
      });
      const shape = font.generateShapes(axesNames[i], 16);
      const geom = new THREE.ShapeGeometry(shape);
      geom.computeBoundingBox();
      const xMid = -0.5 * (geom.boundingBox!.max.x - geom.boundingBox!.min.x);
      const yMid = -0.5 * (geom.boundingBox!.max.y - geom.boundingBox!.min.y);
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

  /**
   * Set visibility of all orientation marker elements.
   * @param flag - Whether the marker should be visible.
   */
  setVisible(flag: boolean): void {
    if (!this.scene) return;
    for (const child of this.scene.children) {
      child.visible = flag;
    }
  }

  /**
   * Dispose of all resources and clean up memory.
   */
  dispose(): void {
    sceneTraverse(this.scene, (o) => {
      const obj = o as THREE.Mesh;
      obj.geometry?.dispose();
      (obj.material as THREE.Material)?.dispose?.();
    });
    this.scene = null;
    this.camera = null;
    this.cad_camera = null;
    this.cones = [];
    this.labels = [];
  }

  /**
   * Render the orientation marker to the given renderer.
   * @param renderer - The renderer to draw to.
   */
  render(renderer: THREE.WebGLRenderer): void {
    if (this.ready && this.scene && this.camera) {
      renderer.setViewport(0, 0, this.width, this.height);
      renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Update the marker to match the main camera's orientation.
   * @param position - Camera position (will be normalized).
   * @param quaternion - Camera rotation quaternion.
   */
  update(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    if (this.ready && this.camera) {
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        position.normalize(),
      );
      this.camera.position.set(0, 0, 1).applyQuaternion(q).multiplyScalar(300);

      this.camera.quaternion.copy(quaternion);

      for (let i = 0; i < 3; i++) {
        this.labels[i].position.set(
          i == 0 ? distance : 0,
          i == 1 ? distance : 0,
          i == 2 ? distance : 0,
        );
        this.labels[i].quaternion.copy(quaternion);
      }
    }
  }

  /**
   * Change the color theme of the orientation marker.
   * @param theme - The theme name ("dark" or "light").
   */
  changeTheme(theme: Theme): void {
    for (const i in this.cones) {
      const cone = this.cones[i];
      (cone.material as THREE.MeshBasicMaterial).color = new THREE.Color(...this.colors[theme][i]);
    }
    if (this.axes) {
      this.axes.changeTheme(theme);
    }
    for (const i in this.labels) {
      const label = this.labels[i];
      (label.material as THREE.LineBasicMaterial).color =
        theme === "dark"
          ? new THREE.Color(0.9, 0.9, 0.9)
          : new THREE.Color(0, 0, 0);
    }
  }
}

export { OrientationMarker };
