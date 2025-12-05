/**
 * CADOrbitControls - Extended OrbitControls for CAD applications
 *
 * Adds:
 * - Public rotateLeft/rotateUp methods for programmatic rotation
 * - Quaternion-based saveState/reset
 */

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

class CADOrbitControls extends OrbitControls {
  /**
   * Constructs CAD-enhanced orbit controls.
   *
   * @param {Object3D} object - The camera to control.
   * @param {HTMLDOMElement} domElement - The HTML element for event listeners.
   */
  constructor(object, domElement = null) {
    super(object, domElement);

    /**
     * Saved quaternion for reset (in addition to position/target/zoom).
     * @type {Quaternion}
     */
    this.quaternion0 = this.object.quaternion.clone();
  }

  /**
   * Save the current state including quaternion.
   */
  saveState() {
    super.saveState();
    this.quaternion0.copy(this.object.quaternion);
  }

  /**
   * Reset to saved state including quaternion.
   */
  reset() {
    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    this.object.quaternion.copy(this.quaternion0);
    this.object.zoom = this.zoom0;

    this.object.updateProjectionMatrix();
    this.dispatchEvent({ type: "change" });

    this.update();

    this.state = -1; // STATE.NONE
  }

  /**
   * Rotate camera left (around the up axis).
   * @param {number} angle - Rotation angle in radians.
   */
  rotateLeft(angle) {
    this._rotateLeft(angle);
  }

  /**
   * Rotate camera up (around the right axis).
   * @param {number} angle - Rotation angle in radians.
   */
  rotateUp(angle) {
    this._rotateUp(angle);
  }
}

export { CADOrbitControls };
