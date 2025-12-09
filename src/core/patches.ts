import { InstancedBufferGeometry } from "three";
import { LineSegmentsGeometry as _LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

/**
 * Extended LineSegmentsGeometry with fixed toJSON method.
 * The original LineSegmentsGeometry has a broken toJSON implementation.
 */
class LineSegmentsGeometry extends _LineSegmentsGeometry {
  toJSON(): ReturnType<typeof InstancedBufferGeometry.prototype.toJSON> {
    // skip the broken toJSON method of _LineSegmentsGeometry
    const data = InstancedBufferGeometry.prototype.toJSON.call(this);
    return data;
  }
}

export { LineSegmentsGeometry };
