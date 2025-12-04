import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./patches.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Renders XYZ axes as colored line segments.
 * Extends LineSegments2 for thick line rendering.
 */
class AxesHelper extends LineSegments2 {
  /**
   * Create an AxesHelper.
   * @param {number[]} center - Origin point [x, y, z] for the axes.
   * @param {number} size - Length of each axis in world units.
   * @param {number} lineWidth - Line width in pixels.
   * @param {number} width - Viewport width for material resolution.
   * @param {number} height - Viewport height for material resolution.
   * @param {boolean} axes0 - If true, position at origin; if false, at center.
   * @param {boolean} visible - Initial visibility state.
   * @param {string} theme - Color theme ("dark" or "light").
   */
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

  /**
   * Set the axes position based on the axes0 flag.
   * @param {boolean} axes0 - If true, position at origin; if false, at center.
   */
  setCenter(axes0) {
    if (axes0) {
      this.position.set(0, 0, 0);
    } else {
      this.position.set(...this.center);
    }
  }

  /**
   * Set the visibility of the axes helper.
   * @param {boolean} visible - Whether the axes should be visible.
   */
  setVisible(visible) {
    this.visible = visible;
  }

  /**
   * Change the color theme of the axes.
   * @param {string} theme - The theme name ("dark" or "light").
   */
  changeTheme(theme) {
    this.geometry.setColors(new Float32Array(this.colors[theme]));
  }
}

export { AxesHelper };
