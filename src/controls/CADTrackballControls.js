/**
 * CADTrackballControls - Extended TrackballControls for CAD applications
 *
 * Adds:
 * - Holroyd (non-tumbling) trackball rotation mode
 * - rotateX/Y/Z methods for programmatic world-axis rotation
 * - Quaternion-based saveState/reset
 */

import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { Quaternion, Vector3 } from "three";

// Reusable objects for rotation calculations
const _quaternion = new Quaternion();
const _axis = new Vector3();
const _rotateStart3 = new Vector3();
const _rotateEnd3 = new Vector3();

const _AXES = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

class CADTrackballControls extends TrackballControls {
  /**
   * Constructs CAD-enhanced trackball controls.
   *
   * @param {Object3D} object - The camera to control.
   * @param {HTMLDOMElement} domElement - The HTML element for event listeners.
   */
  constructor(object, domElement = null) {
    super(object, domElement);

    /**
     * Enable holroyd (non-tumbling) trackball mode.
     * When true, uses a projection that prevents disorientation.
     * @type {boolean}
     * @default true
     */
    this.holroyd = true;

    /**
     * NDC trackball radius for holroyd projection.
     * @type {number}
     * @default 0.9
     */
    this.radius = 0.9;

    /**
     * Saved quaternion for reset (in addition to position/up/zoom).
     * @type {Quaternion}
     */
    this.quaternion0 = this.object.quaternion.clone();

    // Internal state for holroyd rotation
    this._holroydStart = new Vector3();
    this._holroydEnd = new Vector3();
  }

  /**
   * Save the current state including quaternion.
   */
  saveState() {
    this._target0.copy(this.target);
    this._position0.copy(this.object.position);
    this._up0.copy(this.object.up);
    this._zoom0 = this.object.zoom;
    this.quaternion0.copy(this.object.quaternion);
  }

  /**
   * Reset to saved state including quaternion.
   */
  reset() {
    super.reset();
    this.object.quaternion.copy(this.quaternion0);
  }

  // Expose saved state properties for compatibility with controls.js
  get target0() {
    return this._target0;
  }
  get position0() {
    return this._position0;
  }
  get zoom0() {
    return this._zoom0;
  }

  /**
   * Project mouse coordinates to trackball sphere using holroyd projection.
   * @param {number} pageX - Page X coordinate
   * @param {number} pageY - Page Y coordinate
   * @param {Vector3} target - Vector3 to store result
   * @returns {Vector3} The projected point on the sphere
   * @private
   */
  _getMouseOnSphere(pageX, pageY, target) {
    const rect = this.domElement.getBoundingClientRect();
    // Convert to NDC space
    let x = ((pageX - rect.left) / (rect.width / 2) - 1.0) * this.rotateSpeed;
    let y = (1.0 - (pageY - rect.top) / (rect.height / 2)) * this.rotateSpeed;

    const r2 = this.radius * this.radius;
    const d2 = x * x + y * y;

    if (d2 <= r2 / 2) {
      // Inside sphere
      target.set(x, y, Math.sqrt(r2 - d2));
    } else {
      // Outside sphere - use hyperbolic sheet
      target.set(x, y, r2 / (2 * Math.sqrt(d2)));
    }

    return target;
  }

  /**
   * Override rotation to support holroyd mode.
   * @private
   */
  _rotateCamera() {
    if (!this.holroyd) {
      // Use default TrackballControls rotation
      super._rotateCamera();
      return;
    }

    // Holroyd rotation using quaternion premultiplication
    this._getMouseOnSphere(
      this._movePrev.x * this.screen.width + this.screen.left,
      this._movePrev.y * this.screen.height + this.screen.top,
      _rotateStart3
    );
    this._getMouseOnSphere(
      this._moveCurr.x * this.screen.width + this.screen.left,
      this._moveCurr.y * this.screen.height + this.screen.top,
      _rotateEnd3
    );

    _axis.crossVectors(_rotateStart3, _rotateEnd3);
    const dot = _rotateStart3.dot(_rotateEnd3);
    let angle = Math.atan2(_axis.length(), dot);

    if (angle && !isNaN(angle)) {
      _axis.normalize();
      _axis.applyQuaternion(this.object.quaternion);

      // Apply damping if not static
      if (!this.staticMoving) {
        angle *= this.dynamicDampingFactor * 5; // Scale factor for feel
      }

      angle *= -2;

      _quaternion.setFromAxisAngle(_axis, angle);

      this.object.quaternion.premultiply(_quaternion);
      this._eye.applyQuaternion(_quaternion);
    }

    this._movePrev.copy(this._moveCurr);
  }

  /**
   * Rotate camera around world X-axis.
   * @param {number} angle - Rotation angle in radians.
   */
  rotateX(angle) {
    this._rotateAroundAxis("x", angle);
  }

  /**
   * Rotate camera around world Y-axis.
   * @param {number} angle - Rotation angle in radians.
   */
  rotateY(angle) {
    this._rotateAroundAxis("y", angle);
  }

  /**
   * Rotate camera around world Z-axis.
   * @param {number} angle - Rotation angle in radians.
   */
  rotateZ(angle) {
    this._rotateAroundAxis("z", angle);
  }

  /**
   * Internal method to rotate around a world axis.
   * @param {string} axisName - 'x', 'y', or 'z'
   * @param {number} angle - Rotation angle in radians
   * @private
   */
  _rotateAroundAxis(axisName, angle) {
    const axis = _AXES[axisName];
    _quaternion.setFromAxisAngle(axis, angle);

    this.object.quaternion.premultiply(_quaternion);
    this.object.position.sub(this.target).applyQuaternion(_quaternion).add(this.target);
  }
}

export { CADTrackballControls };
