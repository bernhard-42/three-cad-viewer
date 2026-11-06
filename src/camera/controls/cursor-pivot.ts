/**
 * Shared pieces of the cursor pivot for CADOrbitControls and
 * CADTrackballControls: a rotate drag turns the camera around the pivot the
 * picker gives for its start position, instead of around `target`.
 */

import { Quaternion, Vector3 } from "three";

/**
 * Resolves the world-space pivot for a rotate drag that starts at a client (page
 * viewport) coordinate, or `null` to rotate around `target`.
 */
type PivotPicker = (clientX: number, clientY: number) => Vector3 | null;

const _offset = new Vector3();

/**
 * The translation that turns a rotation of the camera around `target` into the
 * same rotation around `pivot`.
 *
 * Both controls rotate the camera around `target`. Shifting camera and target
 * together by q·r - r afterwards (q the rotation, r = target - pivot) makes it
 * a rotation about the pivot: the pivot stays fixed on screen, and `target`
 * drifts with it.
 *
 * @param rotation - the rotation just applied around `target`.
 * @param target - the controls' target before the shift.
 * @param pivot - the world-space point to rotate around.
 * @param out - receives the shift.
 */
function pivotShift(
  rotation: Quaternion,
  target: Vector3,
  pivot: Vector3,
  out: Vector3,
): Vector3 {
  _offset.subVectors(target, pivot);
  return out.copy(_offset).applyQuaternion(rotation).sub(_offset);
}

export { pivotShift };
export type { PivotPicker };
