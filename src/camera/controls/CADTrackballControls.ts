/**
 * CADTrackballControls - Extended TrackballControls for CAD applications
 *
 * Adds:
 * - Holroyd (non-tumbling) trackball rotation mode
 * - rotateX/Y/Z methods for programmatic world-axis rotation
 * - Quaternion-based saveState/reset
 *
 * Internal TrackballControls methods/properties used (see three-augmentation.d.ts):
 * - _onMouseDown: Replaced to customize modifier key behavior (shift=pan)
 * - _getMouseOnCircle: Called to convert page coordinates for rotation
 * - _getMouseOnScreen: Called to convert page coordinates for pan/zoom
 * - _rotateCamera: Overridden to implement holroyd sphere projection
 * - _panCamera: Overridden to use quaternion-based camera orientation in holroyd mode
 * - _zoomCamera: Called for zoom handling
 * - _moveCurr/_movePrev: Rotation tracking vectors
 * - _zoomStart/_zoomEnd: Zoom tracking vectors
 * - _panStart/_panEnd: Pan tracking vectors
 * - _eye: Camera-to-target vector
 * - _lastPosition: Change detection
 * - _target0/_position0/_up0/_zoom0: Saved state for reset
 * - state/keyState: Current interaction mode tracking
 * - noRotate/noZoom/noPan: Feature disable flags
 */

import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { MOUSE, Quaternion, Vector2, Vector3, Camera } from "three";
import {
  KeyMapper,
  AXIS_VECTORS,
  isOrthographicCamera,
  isPerspectiveCamera,
} from "../../utils/utils.js";
import type { Axis } from "../../core/types.js";

// State constants matching TrackballControls internal state
const STATE = {
  NONE: -1,
  ROTATE: 0,
  ZOOM: 1,
  PAN: 2,
};

// Used for change detection in holroyd mode
const _lastQuaternion = new Quaternion();
let _lastZoom = 1;

// Reusable objects for rotation calculations
const _quaternion = new Quaternion();
const _axis = new Vector3();
const _rotateStart3 = new Vector3();
const _rotateEnd3 = new Vector3();

// Reusable objects for pan calculations
const _panDirection = new Vector3();
const _cameraUp = new Vector3();
const _cameraRight = new Vector3();

class CADTrackballControls extends TrackballControls {
  holroyd: boolean;
  radius: number;
  quaternion0: Quaternion;
  private _holroydStart: Vector2;
  private _holroydEnd: Vector2;
  private _holroydActive: boolean;
  private _horizontalRotate: boolean;
  private _verticalRotate: boolean;
  private _holroydPointerDown?: (event: PointerEvent) => void;
  private _holroydPointerMove?: (event: PointerEvent) => void;
  private _holroydPointerUp?: () => void;
  private _holroydWheel?: (event: WheelEvent) => void;
  private _parentOnMouseDown!: (event: MouseEvent) => void;

  // Expose internal properties for type safety
  declare state: number;
  declare keyState: number;
  declare _moveCurr: Vector2;
  declare _movePrev: Vector2;
  declare _zoomStart: Vector2;
  declare _zoomEnd: Vector2;
  declare _panStart: Vector2;
  declare _panEnd: Vector2;
  declare _eye: Vector3;
  declare _lastPosition: Vector3;
  declare _target0: Vector3;
  declare _position0: Vector3;
  declare _up0: Vector3;
  declare _zoom0: number;
  declare noRotate: boolean;
  declare noZoom: boolean;
  declare noPan: boolean;
  declare _onMouseDown: (event: MouseEvent) => void;
  declare _getMouseOnCircle: (pageX: number, pageY: number) => Vector2;
  declare _getMouseOnScreen: (pageX: number, pageY: number) => Vector2;
  declare _zoomCamera: () => void;

  /**
   * Constructs CAD-enhanced trackball controls.
   *
   * @param object - The camera to control.
   * @param domElement - The HTML element for event listeners.
   */
  constructor(object: Camera, domElement: HTMLElement | null = null) {
    super(object, domElement!);

    /**
     * Enable holroyd (non-tumbling) trackball mode.
     * When true, uses a projection that prevents disorientation.
     */
    this.holroyd = true;

    /**
     * NDC trackball radius for holroyd projection.
     */
    this.radius = 0.9;

    /**
     * Saved quaternion for reset (in addition to position/up/zoom).
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
      this._holroydWheel = this._onHolroydWheel.bind(this);
      domElement.addEventListener("pointerdown", this._holroydPointerDown);
      domElement.addEventListener("pointermove", this._holroydPointerMove);
      domElement.addEventListener("pointerup", this._holroydPointerUp);
      domElement.addEventListener("pointercancel", this._holroydPointerUp);
      domElement.addEventListener("wheel", this._holroydWheel, {
        passive: false,
      });
    }

    // Save parent's _onMouseDown before overriding (for holroyd=false fallback)
    this._parentOnMouseDown = this._onMouseDown;
    this._onMouseDown = this._handleMouseDown.bind(this);
  }

  /**
   * Custom mouse down handler to support shift+drag for pan.
   * When holroyd=false, delegates to parent for pure Three.js behavior.
   */
  private _handleMouseDown(event: MouseEvent): void {
    // When holroyd is disabled, use pure Three.js TrackballControls behavior
    if (!this.holroyd) {
      this._parentOnMouseDown(event);
      return;
    }

    let mouseAction: number;

    switch (event.button) {
      case 0:
        mouseAction = this.mouseButtons.LEFT!;
        break;
      case 1:
        mouseAction = this.mouseButtons.MIDDLE!;
        break;
      case 2:
        mouseAction = this.mouseButtons.RIGHT!;
        break;
      default:
        mouseAction = -1;
    }

    // Shift + left click = pan (via KeyMapper)
    if (mouseAction === MOUSE.ROTATE && KeyMapper.get(event, "shift")) {
      mouseAction = MOUSE.PAN;
    }

    switch (mouseAction) {
      case MOUSE.DOLLY:
        this.state = STATE.ZOOM;
        break;
      case MOUSE.ROTATE:
        this.state = STATE.ROTATE;
        break;
      case MOUSE.PAN:
        this.state = STATE.PAN;
        break;
      default:
        this.state = STATE.NONE;
    }

    const state = this.keyState !== STATE.NONE ? this.keyState : this.state;

    if (state === STATE.ROTATE && !this.noRotate) {
      this._moveCurr.copy(this._getMouseOnCircle(event.pageX, event.pageY));
      this._movePrev.copy(this._moveCurr);
    } else if (state === STATE.ZOOM && !this.noZoom) {
      this._zoomStart.copy(this._getMouseOnScreen(event.pageX, event.pageY));
      this._zoomEnd.copy(this._zoomStart);
    } else if (state === STATE.PAN && !this.noPan) {
      this._panStart.copy(this._getMouseOnScreen(event.pageX, event.pageY));
      this._panEnd.copy(this._panStart);
    }

    this.dispatchEvent({ type: "start" });
  }

  /**
   * Capture raw pointer coordinates on pointer down for holroyd.
   * Works for all pointer types (mouse, touch, pen, trackpad).
   * Also checks modifier keys for rotation axis restriction.
   */
  private _onHolroydPointerDown(event: PointerEvent): void {
    if (!this.holroyd) return;

    // Only activate holroyd for rotation (left mouse button or touch)
    // Right mouse (button 2) is for pan, middle (button 1) for zoom
    // For touch, button is 0
    if (event.button !== 0) return;

    // Shift key triggers pan instead of rotation (via KeyMapper)
    if (KeyMapper.get(event, "shift")) return;

    this._holroydStart.set(event.pageX, event.pageY);
    this._holroydEnd.set(event.pageX, event.pageY);
    this._holroydActive = true;

    // Check modifier keys for rotation restriction
    // Works for all pointer types (e.g., touchscreen + keyboard on laptops)
    // ctrl: restrict to vertical rotation only (horizontalRotate = false)
    // meta: restrict to horizontal rotation only (verticalRotate = false)
    this._horizontalRotate = !KeyMapper.get(event, "ctrl");
    this._verticalRotate = !KeyMapper.get(event, "meta");
  }

  /**
   * Capture raw pointer coordinates on pointer move for holroyd.
   * Only captures when actively dragging.
   * Works for all pointer types (mouse, touch, pen, trackpad).
   */
  private _onHolroydPointerMove(event: PointerEvent): void {
    if (this.holroyd && this._holroydActive) {
      this._holroydEnd.set(event.pageX, event.pageY);
    }
    // Call update to process the pointer movement and dispatch "change" event
    // This enables change-listener mode (non-animation loop) to work
    // Note: this runs for all pointer moves while dragging (rotate, pan, zoom)
    if (this.state !== -1) {
      // STATE.NONE = -1
      this.update();
    }
  }

  /**
   * Reset holroyd active state and rotation restrictions on pointer up.
   */
  private _onHolroydPointerUp(): void {
    this._holroydActive = false;
    this._horizontalRotate = true;
    this._verticalRotate = true;
  }

  /**
   * Handle wheel events for zoom - call update after parent processes wheel.
   * This enables change-listener mode (non-animation loop) to work for zoom.
   */
  private _onHolroydWheel(): void {
    // Parent's wheel handler already processed the event, just call update
    this.update();
  }

  /**
   * Override dispose to clean up our event listeners.
   */
  dispose(): void {
    if (
      this.domElement &&
      this._holroydPointerDown &&
      this._holroydPointerMove &&
      this._holroydPointerUp &&
      this._holroydWheel
    ) {
      this.domElement.removeEventListener(
        "pointerdown",
        this._holroydPointerDown,
      );
      this.domElement.removeEventListener(
        "pointermove",
        this._holroydPointerMove,
      );
      this.domElement.removeEventListener("pointerup", this._holroydPointerUp);
      this.domElement.removeEventListener(
        "pointercancel",
        this._holroydPointerUp,
      );
      this.domElement.removeEventListener("wheel", this._holroydWheel);
    }
    super.dispose();
  }

  /**
   * Save the current state including quaternion.
   */
  saveState(): void {
    this._target0.copy(this.target);
    this._position0.copy(this.object.position);
    this._up0.copy(this.object.up);
    if (isPerspectiveCamera(this.object) || isOrthographicCamera(this.object)) {
      this._zoom0 = this.object.zoom;
    }
    this.quaternion0.copy(this.object.quaternion);
  }

  /**
   * Reset to saved state including quaternion.
   */
  reset(): void {
    super.reset();
    this.object.quaternion.copy(this.quaternion0);
  }

  // Expose saved state properties for compatibility with controls.js
  get target0(): Vector3 {
    return this._target0;
  }
  get position0(): Vector3 {
    return this._position0;
  }
  get zoom0(): number {
    return this._zoom0;
  }
  set zoom0(value: number) {
    this._zoom0 = value;
  }

  /**
   * Project page coordinates onto the holroyd trackball sphere.
   * Uses the original CameraControls coordinate system:
   * - NDC x: -1 (left) to +1 (right)
   * - NDC y: -1 (bottom) to +1 (top)
   */
  private _getMouseOnSphere(
    pageX: number,
    pageY: number,
    target: Vector3,
  ): Vector3 {
    const rect = this.domElement!.getBoundingClientRect();

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
   *
   * When holroyd=false, delegates to parent for pure Three.js behavior.
   */
  update(): void {
    // When holroyd is disabled, use pure Three.js TrackballControls behavior
    if (!this.holroyd) {
      super.update();
      return;
    }

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

    // In holroyd mode, we set quaternion directly - skip lookAt
    // Just check for changes and dispatch event
    const currentZoom =
      isPerspectiveCamera(this.object) || isOrthographicCamera(this.object)
        ? this.object.zoom
        : 1;
    const zoomChanged = Math.abs(currentZoom - _lastZoom) > 0.000001;
    if (
      this._lastPosition.distanceToSquared(this.object.position) > 0.000001 ||
      _lastQuaternion.dot(this.object.quaternion) < 0.999999 ||
      zoomChanged
    ) {
      this.dispatchEvent({ type: "change" });
      this._lastPosition.copy(this.object.position);
      _lastQuaternion.copy(this.object.quaternion);
      _lastZoom = currentZoom;
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
   */
  _rotateCamera(): void {
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
      _rotateStart3,
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
   * Override pan to use quaternion-based camera orientation in holroyd mode.
   *
   * The parent TrackballControls uses this.object.up for pan direction,
   * but in holroyd mode we rotate via quaternion without updating up.
   * This calculates pan direction from the camera's actual orientation.
   */
  _panCamera(): void {
    if (!this.holroyd) {
      super._panCamera();
      return;
    }

    const mouseChange = _panDirection.set(
      this._panEnd.x - this._panStart.x,
      this._panEnd.y - this._panStart.y,
      0,
    );

    if (mouseChange.lengthSq() === 0) {
      return;
    }

    // Apply pan scaling based on camera type
    if (isOrthographicCamera(this.object)) {
      // For orthographic: pan distance = frustum size at zoom level
      // mouseChange is already normalized, so just scale by world units visible
      const scaleX = (this.object.right - this.object.left) / this.object.zoom;
      const scaleY = (this.object.top - this.object.bottom) / this.object.zoom;
      mouseChange.x *= scaleX * this.panSpeed * 4;
      mouseChange.y *= scaleY * this.panSpeed * 4;
    } else if (isPerspectiveCamera(this.object) && this.domElement) {
      // For perspective: correct for aspect ratio since _getMouseOnScreen normalizes by width
      const aspect = this.domElement.clientWidth / this.domElement.clientHeight;
      mouseChange.x *= aspect;
      mouseChange.multiplyScalar(this._eye.length() * this.panSpeed * 1.6);
    } else {
      // Fallback for other camera types
      mouseChange.multiplyScalar(this._eye.length() * this.panSpeed * 2.0);
    }

    // Get camera's actual right and up vectors from quaternion
    // Camera looks down -Z in its local space, so:
    // - local +X is right
    // - local +Y is up
    _cameraRight.set(1, 0, 0).applyQuaternion(this.object.quaternion);
    _cameraUp.set(0, 1, 0).applyQuaternion(this.object.quaternion);

    // Pan = right * mouseX + up * mouseY (negate X for correct direction)
    _cameraRight.multiplyScalar(-mouseChange.x);
    _cameraUp.multiplyScalar(mouseChange.y);

    this.object.position.add(_cameraRight).add(_cameraUp);
    this.target.add(_cameraRight).add(_cameraUp);

    this._panStart.copy(this._panEnd);
  }

  /**
   * Rotate camera around world X-axis.
   */
  rotateX(angle: number): void {
    this._rotateAroundAxis("x", angle);
  }

  /**
   * Rotate camera around world Y-axis.
   */
  rotateY(angle: number): void {
    this._rotateAroundAxis("y", angle);
  }

  /**
   * Rotate camera around world Z-axis.
   */
  rotateZ(angle: number): void {
    this._rotateAroundAxis("z", angle);
  }

  /**
   * Internal method to rotate around a world axis.
   */
  private _rotateAroundAxis(axisName: Axis, angle: number): void {
    const axis = AXIS_VECTORS[axisName];
    _quaternion.setFromAxisAngle(axis, angle);

    this.object.quaternion.premultiply(_quaternion);
    this.object.position
      .sub(this.target)
      .applyQuaternion(_quaternion)
      .add(this.target);
  }
}

export { CADTrackballControls };
