import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./patches.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Theme, AxisColorsFlatArray } from "./types";

/**
 * Renders XYZ axes as colored line segments.
 * Extends LineSegments2 for thick line rendering.
 */
class AxesHelper extends LineSegments2 {
  declare type: string;
  declare geometry: LineSegmentsGeometry;
  colors: AxisColorsFlatArray;
  center: number[];

  /**
   * Create an AxesHelper.
   * @param center - Origin point [x, y, z] for the axes.
   * @param size - Length of each axis in world units.
   * @param lineWidth - Line width in pixels.
   * @param width - Viewport width for material resolution.
   * @param height - Viewport height for material resolution.
   * @param axes0 - If true, position at origin; if false, at center.
   * @param visible - Initial visibility state.
   * @param theme - Color theme ("dark" or "light").
   */
  constructor(
    center: number[],
    size: number,
    lineWidth: number,
    width: number,
    height: number,
    axes0: boolean,
    visible: boolean,
    theme: Theme,
  ) {
    // prettier-ignore
    const vertices = new Float32Array([
            0, 0, 0, size, 0, 0,
            0, 0, 0, 0, size, 0,
            0, 0, 0, 0, 0, size
        ]);

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
   * @param axes0 - If true, position at origin; if false, at center.
   */
  setCenter(axes0: boolean): void {
    if (axes0) {
      this.position.set(0, 0, 0);
    } else {
      this.position.set(this.center[0], this.center[1], this.center[2]);
    }
  }

  /**
   * Set the visibility of the axes helper.
   * @param visible - Whether the axes should be visible.
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  /**
   * Change the color theme of the axes.
   * @param theme - The theme name ("dark" or "light").
   */
  changeTheme(theme: Theme): void {
    this.geometry.setColors(new Float32Array(this.colors[theme]));
  }
}

export { AxesHelper };
