import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./patches.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

class AxesHelper extends LineSegments2 {
  constructor(center, size, lineWidth, width, height, axes0, visible, theme) {
    // prettier-ignore
    const vertices = new Float32Array([
            0, 0, 0, size, 0, 0,
            0, 0, 0, 0, size, 0,
            0, 0, 0, 0, 0, size
        ]);
    // prettier-ignore

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(vertices);

    const material = new LineMaterial({
      vertexColors: true,
      toneMapped: false,
      linewidth: lineWidth,
      transparent: true,
    });
    material.resolution.set(width, height);

    super(geometry, material);
    // prettier-ignore
    this.colors = {
        dark:[
            1,         69 / 255, 0,         1,        69 / 255, 0,         // x
            50 / 255, 205 / 255, 50 / 255, 50 / 255, 205 / 255, 50 / 255,  // y
            59 / 255, 158 / 255, 1,        59 / 255, 158 / 255, 1          // z
        ],
        light:[
            1, 0,   0, 1, 0,   0,  // x
            0, 0.7, 0, 0, 0.7, 0,  // y
            0, 0,   1, 0, 0,   1   // z
        ]};
    geometry.setColors(new Float32Array(this.colors[theme]));
    this.geometry = geometry;

    this.center = center;

    this.type = "AxesHelper";
    this.name = "AxesHelper";
    this.visible = visible;
    this.setCenter(axes0);
  }

  setCenter(axes0) {
    if (axes0) {
      this.position.set(0, 0, 0);
    } else {
      this.position.set(...this.center);
    }
  }

  setVisible(visible) {
    this.visible = visible;
  }

  changeTheme(theme) {
    this.geometry.setColors(new Float32Array(this.colors[theme]));
  }
}

export { AxesHelper };
