/**
 * CADTrackballControls - Extended TrackballControls for CAD applications
 *
 * Adds:
 * - Holroyd (non-tumbling) trackball rotation mode
 * - rotateX/Y/Z methods for programmatic world-axis rotation
 * - Quaternion-based saveState/reset
 * - Pivot under the cursor: a rotate drag turns around the pivot picked at its
 *   start (see {@link CADTrackballControls.pivotPicker}), and in holroyd mode the
 *   trackball sphere sits at the pivot's screen position
 * - Zoom towards the cursor for the wheel, trackpad pinch and middle-button drag
 *   (see {@link CADTrackballControls.zoomToCursor})
 *
 * Internal TrackballControls methods/properties used (see three-augmentation.d.ts):
 * - _onMouseDown: Replaced to customize modifier key behavior (shift=pan)
 * - _getMouseOnCircle: Called to convert page coordinates for rotation
 * - _getMouseOnScreen: Called to convert page coordinates for pan/zoom
 * - _rotateCamera: Overridden to implement holroyd sphere projection
 * - _panCamera: Overridden to use quaternion-based camera orientation in holroyd mode
 * - _zoomCamera: Overridden to zoom towards the cursor
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
import { MOUSE, Matrix4, Quaternion, Vector2, Vector3, Camera } from "three";
import {
  KeyMapper,
  AXIS_VECTORS,
  isOrthographicCamera,
  isPerspectiveCamera,
} from "../../utils/utils.js";
import type { Axis } from "../../core/types.js";
import { pivotShift, type PivotPicker } from "./cursor-pivot.js";

// State constants matching TrackballControls internal state
const STATE = {
  NONE: -1,
  ROTATE: 0,
  ZOOM: 1,
  PAN: 2,
  TOUCH_ROTATE: 3,
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

// Reusable objects for the cursor pivot and zoom to cursor
const _pivotShift = new Vector3();
const _eyeBefore = new Vector3();
const _upBefore = new Vector3();
const _frame = new Matrix4();
const _frameBefore = new Quaternion();
const _frameRotation = new Quaternion();
const _origin = new Vector3();
const _ndc = new Vector2();
const _zoomPoint = new Vector3();
const _zoomPointAfter = new Vector3();
const _rayDirection = new Vector3();
const _viewDirection = new Vector3();

/**
 * The orientation of a camera frame given by its eye vector (camera - target)
 * and up vector, as a quaternion.
 */
function frameQuaternion(
  eye: Vector3,
  up: Vector3,
  out: Quaternion,
): Quaternion {
  return out.setFromRotationMatrix(_frame.lookAt(eye, _origin, up));
}

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
  private _parentOnTouchStart!: (event: PointerEvent) => void;
  /** The pointer whose moves drive the holroyd rotation. */
  private _holroydPointerId: number | null = null;
  /**
   * Picks the rotation pivot when a rotate drag starts. `null` keeps the
   * classic behavior of rotating around `target`.
   */
  pivotPicker: PivotPicker | null;
  /**
   * Zoom towards the cursor for the wheel, trackpad pinch and middle-button drag,
   * instead of towards the center of the view.
   */
  zoomToCursor: boolean;
  private _pivot: Vector3 | null;
  private _zoomCursor: Vector2 | null;
  /**
   * Where a middle-button drag started. Unlike {@link _zoomCursor} it outlives one
   * update: the drag spans many, and the damping goes on after the release. The
   * next pointer down replaces it.
   */
  private _dragZoomCursor: Vector2 | null;
  /** Centre of the holroyd ball in NDC, fixed at the start of a drag. */
  private _ballCenter: Vector2;

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
  declare _onTouchStart: (event: PointerEvent) => void;
  declare _getMouseOnCircle: (pageX: number, pageY: number) => Vector2;
  declare _getMouseOnScreen: (pageX: number, pageY: number) => Vector2;

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

    // The parent constructor already calls update(), before these are set, so
    // the checks against _pivot and _zoomCursor use == null.
    this.pivotPicker = null;
    this.zoomToCursor = false;
    this._pivot = null;
    this._zoomCursor = null;
    this._dragZoomCursor = null;
    this._ballCenter = new Vector2(0, 0);

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
    this._parentOnTouchStart = this._onTouchStart;
    this._onTouchStart = this._handleTouchStart.bind(this);
  }

  /**
   * Custom mouse down handler to support shift+drag for pan.
   * When holroyd=false, delegates to parent for pure Three.js behavior.
   */
  private _handleMouseDown(event: MouseEvent): void {
    // When holroyd is disabled, use pure Three.js TrackballControls behavior
    if (!this.holroyd) {
      this._parentOnMouseDown(event);
      this._setPivot(
        this.state === STATE.ROTATE && !this.noRotate
          ? this._pickPivot(event)
          : null,
      );
      this._dragZoomCursor = this._dragZoomStart(event, this.state);
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

    this._setPivot(
      state === STATE.ROTATE && !this.noRotate ? this._pickPivot(event) : null,
    );
    this._dragZoomCursor = this._dragZoomStart(event, state);

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
   * Touch start: a one-finger rotation turns around the point under the finger,
   * like a mouse drag. Two or more fingers zoom and pan, without a pivot.
   */
  private _handleTouchStart(event: PointerEvent): void {
    this._parentOnTouchStart(event);
    this._setPivot(
      this.state === STATE.TOUCH_ROTATE && !this.noRotate
        ? this._pickPivot(event)
        : null,
    );
  }

  /**
   * Make `pivot` the point the rotation turns around, or the target for `null`.
   *
   * The holroyd ball sits at the pivot's screen position. The pivot keeps that
   * position during the drag, so the centre taken now is valid for the whole
   * drag. Without a pivot the rotation is around the target, which is at the
   * canvas centre.
   */
  private _setPivot(pivot: Vector3 | null): void {
    this._pivot = pivot;
    if (pivot !== null) {
      this.object.updateMatrixWorld();
      const ndc = pivot.clone().project(this.object as Camera);
      this._ballCenter.set(ndc.x, ndc.y);
    } else {
      this._ballCenter.set(0, 0);
    }
  }

  /** The cursor of a zoom drag starting at `event` in `state`, else `null`. */
  private _dragZoomStart(event: MouseEvent, state: number): Vector2 | null {
    return state === STATE.ZOOM && !this.noZoom
      ? new Vector2(event.clientX, event.clientY)
      : null;
  }

  /**
   * The pivot for a rotate drag starting at `event`, or `null` to rotate
   * around `target`.
   *
   * It is kept after the pointer is released, not cleared like the orbit
   * controls' pivot: with holroyd off, the parent's damping keeps rotating for
   * a moment after release, and that should turn around the same point. The
   * next pointer down replaces it.
   */
  private _pickPivot(event: MouseEvent): Vector3 | null {
    return this.pivotPicker?.(event.clientX, event.clientY) ?? null;
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

    // A second finger turns the touch into a pinch (zoom and pan): no rotation.
    // Following both fingers would rotate by the jumps between them.
    if (this._holroydActive) {
      this._holroydActive = false;
      this._holroydPointerId = null;
      return;
    }

    this._holroydPointerId = event.pointerId;
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
    if (
      this.holroyd &&
      this._holroydActive &&
      event.pointerId === this._holroydPointerId
    ) {
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
    this._holroydPointerId = null;
    this._horizontalRotate = true;
    this._verticalRotate = true;
  }

  /**
   * Handle wheel events for zoom - call update after parent processes wheel.
   * This enables change-listener mode (non-animation loop) to work for zoom.
   */
  private _onHolroydWheel(event: WheelEvent): void {
    // Parent's wheel handler already processed the event, just call update
    this._zoomCursor = new Vector2(event.clientX, event.clientY);
    try {
      this.update();
    } finally {
      this._zoomCursor = null;
    }

    // TrackballControls uses dynamic damping (staticMoving=false) which only
    // consumes ~20% of the zoom delta per update() call. In animation-loop mode
    // this creates smooth deceleration, but in change-listener mode (no continuous
    // updates) the residual delta persists and gets applied on the next interaction
    // (e.g., clicking to rotate), causing a phantom zoom. Clear it.
    this._zoomStart.copy(this._zoomEnd);
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
      const el = this.domElement as HTMLElement;
      el.removeEventListener("pointerdown", this._holroydPointerDown);
      el.removeEventListener("pointermove", this._holroydPointerMove);
      el.removeEventListener("pointerup", this._holroydPointerUp);
      el.removeEventListener("pointercancel", this._holroydPointerUp);
      el.removeEventListener("wheel", this._holroydWheel);
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

  /**
   * The pivot of the latest mouse drag, `null` when that drag did not rotate
   * around a pivot. It is kept after the release for the damping (see
   * {@link _pickPivot}); wheel and touch input leave it as it is.
   */
  get pivot(): Vector3 | null {
    return this._pivot;
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
   * Project page coordinates onto the holroyd trackball sphere, which is centred
   * at {@link _ballCenter}.
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
      ? (pageX - rect.left) / (rect.width / 2) - 1.0 - this._ballCenter.x
      : 0;
    const y = this._verticalRotate
      ? 1.0 - (pageY - rect.top) / (rect.height / 2) - this._ballCenter.y
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
      const pivot = this._pivot;
      if (pivot == null) {
        super._rotateCamera();
        return;
      }
      // The parent rotates the eye and up vectors by a rotation it does not
      // expose, so recover it from the camera frame before and after.
      _eyeBefore.copy(this._eye);
      _upBefore.copy(this.object.up);
      super._rotateCamera();
      frameQuaternion(_eyeBefore, _upBefore, _frameBefore).invert();
      frameQuaternion(this._eye, this.object.up, _frameRotation);
      _frameRotation.multiply(_frameBefore);
      this.target.add(
        pivotShift(_frameRotation, this.target, pivot, _pivotShift),
      );
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
      // Renormalize: holroyd mode skips the lookAt() that renormalizes stock
      // TrackballControls every frame, so the accumulated premultiply()s would
      // otherwise let the quaternion norm drift below 1. A sub-unit quaternion
      // makes line above's `_axis.applyQuaternion(this.object.quaternion)` scale
      // the axis by |q|^2 < 1, which shrinks the norm further next frame — a
      // positive-feedback loop that, after enough dragging, erupts into ~180deg
      // single-frame view flips. One normalize() per rotation keeps it unit.
      this.object.quaternion.normalize();
      this._eye.applyQuaternion(_quaternion);

      // Turn around the pivot instead of the target: update() puts the camera
      // at target + eye, so moving the target moves the camera with it.
      if (this._pivot != null) {
        this.target.add(
          pivotShift(_quaternion, this.target, this._pivot, _pivotShift),
        );
      }
    }

    // Update start to end for next frame
    this._holroydStart.copy(this._holroydEnd);

    // Keep parent state consistent
    this._movePrev.copy(this._moveCurr);
  }

  /**
   * Zoom towards the cursor for the wheel, trackpad pinch and middle-button drag.
   *
   * The parent zooms towards the target: it scales the eye vector of a
   * perspective camera, or the zoom of an orthographic one. Moving the target
   * as well keeps the point under the cursor in place:
   * - perspective: the point where the cursor ray meets the plane through the
   *   target. Scaling camera and target about it by the same factor keeps its
   *   projection, as three.js OrbitControls' `zoomToCursor` does;
   * - orthographic: the world point under the cursor, exactly, since depth
   *   does not change where a point lands on screen.
   */
  _zoomCamera(): void {
    // A finished drag leaves its cursor set: only use it while there is zoom left
    const cursor =
      this._zoomCursor ??
      (this._zoomStart.equals(this._zoomEnd) ? null : this._dragZoomCursor);
    if (!this.zoomToCursor || cursor == null || this.domElement == null) {
      super._zoomCamera();
      return;
    }

    const rect = (this.domElement as HTMLElement).getBoundingClientRect();
    _ndc.set(
      ((cursor.x - rect.left) / rect.width) * 2 - 1,
      1 - ((cursor.y - rect.top) / rect.height) * 2,
    );
    this.object.updateMatrixWorld();

    if (isPerspectiveCamera(this.object)) {
      const distance = this._eye.length();
      _rayDirection
        .set(_ndc.x, _ndc.y, 0.5)
        .unproject(this.object)
        .sub(this.object.position)
        .normalize();
      this.object.getWorldDirection(_viewDirection);
      const facing = _rayDirection.dot(_viewDirection);
      super._zoomCamera();
      if (facing <= 0 || distance === 0) return;
      const depth =
        _zoomPoint
          .subVectors(this.target, this.object.position)
          .dot(_viewDirection) / facing;
      _zoomPoint
        .copy(this.object.position)
        .addScaledVector(_rayDirection, depth);
      this.target.lerp(_zoomPoint, 1 - this._eye.length() / distance);
    } else if (isOrthographicCamera(this.object)) {
      _zoomPoint.set(_ndc.x, _ndc.y, 0).unproject(this.object);
      super._zoomCamera();
      this.object.updateProjectionMatrix();
      _zoomPointAfter.set(_ndc.x, _ndc.y, 0).unproject(this.object);
      this.target.add(_zoomPoint.sub(_zoomPointAfter));
    } else {
      super._zoomCamera();
    }
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
