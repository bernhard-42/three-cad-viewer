/**
 * CADTrackballControls - Extended TrackballControls for CAD applications
 *
 * Adds:
 * - Holroyd (non-tumbling) trackball rotation mode
 * - rotateX/Y/Z methods for programmatic world-axis rotation
 * - Quaternion-based saveState/reset
 */

import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { Quaternion, Vector2, Vector3 } from "three";
import { KeyMapper } from "../utils.js";

// Used for change detection in holroyd mode
const _lastQuaternion = new Quaternion();

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

    // Holroyd-specific: track absolute page coordinates for sphere projection
    // These store the raw page coordinates, not processed values
    this._holroydStart = new Vector2();
    this._holroydEnd = new Vector2();
    this._holroydActive = false;

    // Rotation axis restriction flags (set via modifier keys)
    // When false, that axis is locked (coordinate set to 0 in sphere projection)
    this._horizontalRotate = true; // meta key restricts to horizontal only
    this._verticalRotate = true; // ctrl key restricts to vertical only

    // Add our own pointer event listeners to capture raw coordinates
    // This runs alongside the parent's handlers
    if (domElement) {
      this._holroydPointerDown = this._onHolroydPointerDown.bind(this);
      this._holroydPointerMove = this._onHolroydPointerMove.bind(this);
      this._holroydPointerUp = this._onHolroydPointerUp.bind(this);
      domElement.addEventListener("pointerdown", this._holroydPointerDown);
      domElement.addEventListener("pointermove", this._holroydPointerMove);
      domElement.addEventListener("pointerup", this._holroydPointerUp);
      domElement.addEventListener("pointercancel", this._holroydPointerUp);
    }
  }

  /**
   * Capture raw pointer coordinates on pointer down for holroyd.
   * Also checks modifier keys for rotation axis restriction.
   * @private
   */
  _onHolroydPointerDown(event) {
    if (this.holroyd && event.pointerType !== "touch") {
      this._holroydStart.set(event.pageX, event.pageY);
      this._holroydEnd.set(event.pageX, event.pageY);
      this._holroydActive = true;

      // Check modifier keys for rotation restriction
      // ctrl: restrict to vertical rotation only (horizontalRotate = false)
      // meta: restrict to horizontal rotation only (verticalRotate = false)
      this._horizontalRotate = !KeyMapper.get(event, "ctrl");
      this._verticalRotate = !KeyMapper.get(event, "meta");
    }
  }

  /**
   * Capture raw pointer coordinates on pointer move for holroyd.
   * Only captures when actively dragging.
   * @private
   */
  _onHolroydPointerMove(event) {
    if (this.holroyd && this._holroydActive && event.pointerType !== "touch") {
      this._holroydEnd.set(event.pageX, event.pageY);
    }
  }

  /**
   * Reset holroyd active state and rotation restrictions on pointer up.
   * @private
   */
  _onHolroydPointerUp() {
    this._holroydActive = false;
    this._horizontalRotate = true;
    this._verticalRotate = true;
  }

  /**
   * Override dispose to clean up our event listeners.
   */
  dispose() {
    if (this.domElement) {
      this.domElement.removeEventListener(
        "pointerdown",
        this._holroydPointerDown
      );
      this.domElement.removeEventListener(
        "pointermove",
        this._holroydPointerMove
      );
      this.domElement.removeEventListener("pointerup", this._holroydPointerUp);
      this.domElement.removeEventListener(
        "pointercancel",
        this._holroydPointerUp
      );
    }
    super.dispose();
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
   * Project page coordinates onto the holroyd trackball sphere.
   * Uses the original CameraControls coordinate system:
   * - NDC x: -1 (left) to +1 (right)
   * - NDC y: -1 (bottom) to +1 (top)
   *
   * @param {number} pageX - Page X coordinate
   * @param {number} pageY - Page Y coordinate
   * @param {Vector3} target - Vector3 to store result
   * @returns {Vector3} The projected point on the sphere
   * @private
   */
  _getMouseOnSphere(pageX, pageY, target) {
    const rect = this.domElement.getBoundingClientRect();

    // Convert to NDC space (-1 to 1)
    // Note: Do NOT apply rotateSpeed here - it would break the sphere geometry
    // rotateSpeed is applied to the final angle instead
    // Apply rotation axis restrictions: set coordinate to 0 if that axis is locked
    const x = this._horizontalRotate
      ? (pageX - rect.left) / (rect.width / 2) - 1.0
      : 0;
    const y = this._verticalRotate
      ? 1.0 - (pageY - rect.top) / (rect.height / 2)
      : 0;

    // Holroyd sphere projection
    const r2 = this.radius * this.radius;
    const d2 = x * x + y * y;

    if (d2 <= r2 / 2) {
      // Inside sphere - project onto sphere surface
      target.set(x, y, Math.sqrt(r2 - d2));
    } else {
      // Outside sphere - use hyperbolic sheet for smooth falloff
      target.set(x, y, r2 / (2 * Math.sqrt(d2)));
    }

    return target;
  }

  /**
   * Override update to skip lookAt in holroyd mode.
   *
   * Standard TrackballControls calls lookAt() which recomputes the quaternion
   * from position and up. In holroyd mode, we set the quaternion directly,
   * so lookAt() would destroy the tilted rotation axis effect.
   */
  update() {
    this._eye.subVectors(this.object.position, this.target);

    if (!this.noRotate) {
      this._rotateCamera();
    }

    if (!this.noZoom) {
      this._zoomCamera();
    }

    if (!this.noPan) {
      this._panCamera();
    }

    this.object.position.addVectors(this.target, this._eye);

    if (this.holroyd) {
      // In holroyd mode, we set quaternion directly - skip lookAt
      // Just check for changes and dispatch event
      if (
        this._lastPosition.distanceToSquared(this.object.position) > 0.000001 ||
        _lastQuaternion.dot(this.object.quaternion) < 0.999999
      ) {
        this.dispatchEvent({ type: "change" });
        this._lastPosition.copy(this.object.position);
        _lastQuaternion.copy(this.object.quaternion);
      }
    } else {
      // Standard mode - use lookAt like parent
      this.object.lookAt(this.target);

      if (
        this._lastPosition.distanceToSquared(this.object.position) > 0.000001
      ) {
        this.dispatchEvent({ type: "change" });
        this._lastPosition.copy(this.object.position);
      }
    }
  }

  /**
   * Override rotation to support holroyd mode.
   *
   * The key difference from standard TrackballControls:
   * - Standard: uses delta-based rotation from _moveCurr - _movePrev
   * - Holroyd: projects absolute positions onto a virtual sphere
   *
   * This gives the "grab and rotate" feel where the rotation axis
   * depends on WHERE you grab, not just HOW you move.
   *
   * @private
   */
  _rotateCamera() {
    if (!this.holroyd) {
      // Use default TrackballControls rotation
      super._rotateCamera();
      return;
    }

    // Only process if start and end are different (actual movement)
    if (
      this._holroydStart.x === this._holroydEnd.x &&
      this._holroydStart.y === this._holroydEnd.y
    ) {
      this._movePrev.copy(this._moveCurr);
      return;
    }

    // Project both start and end positions onto the holroyd sphere
    this._getMouseOnSphere(
      this._holroydStart.x,
      this._holroydStart.y,
      _rotateStart3
    );
    this._getMouseOnSphere(this._holroydEnd.x, this._holroydEnd.y, _rotateEnd3);

    // Calculate rotation axis as cross product of the two sphere points
    _axis.crossVectors(_rotateStart3, _rotateEnd3);
    const angle = Math.atan(_axis.length() / _rotateStart3.dot(_rotateEnd3));

    if (angle) {
      _axis.normalize();

      // Transform axis from screen space to world space via camera orientation
      _axis.applyQuaternion(this.object.quaternion);

      // Apply rotation - use full rotation (no damping) to preserve non-tumbling property
      // The original CameraControls had enableDamping=false by default
      // Damping would break the geodesic rotation property that prevents tumbling
      const finalAngle = -2 * angle * this.rotateSpeed;

      _quaternion.setFromAxisAngle(_axis, finalAngle);

      // Apply rotation via premultiplication (world-space rotation)
      this.object.quaternion.premultiply(_quaternion);
      this._eye.applyQuaternion(_quaternion);
    }

    // Update start to end for next frame
    this._holroydStart.copy(this._holroydEnd);

    // Keep parent state consistent
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
    this.object.position
      .sub(this.target)
      .applyQuaternion(_quaternion)
      .add(this.target);
  }
}

export { CADTrackballControls };
