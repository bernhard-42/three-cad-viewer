/**
 * CADOrbitControls - Extended OrbitControls for CAD applications
 *
 * Adds:
 * - Public rotateLeft/rotateUp methods for programmatic rotation
 * - Quaternion-based saveState/reset
 * - Modifier key rotation restrictions (ctrl: vertical only, meta: horizontal only)
 */

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MOUSE, Quaternion, Vector3, Camera, PerspectiveCamera, OrthographicCamera } from "three";
import { KeyMapper } from "../utils.js";

// State constants matching OrbitControls internal state
const STATE = {
  NONE: -1,
  ROTATE: 0,
  DOLLY: 1,
  PAN: 2,
};

// Internal methods/properties exist on OrbitControls but are not typed
interface OrbitControlsInternal {
  _onMouseDown: (event: MouseEvent) => void;
  _handleMouseDownDolly: (event: MouseEvent) => void;
  _handleMouseDownPan: (event: MouseEvent) => void;
  _handleMouseDownRotate: (event: MouseEvent) => void;
}

// Access to OrbitControls prototype methods (single cast point)
const _proto = OrbitControls.prototype as unknown as OrbitControlsInternal;

class CADOrbitControls extends OrbitControls {
  quaternion0: Quaternion;
  private _horizontalRotate: boolean;
  private _verticalRotate: boolean;
  private _onCADPointerDown: (event: PointerEvent) => void;
  private _onCADPointerUp: () => void;

  // Expose internal properties for type safety
  declare state: number;
  declare _sphericalDelta: { theta: number; phi: number };
  declare zoom0: number;
  declare target0: Vector3;
  declare position0: Vector3;

  /**
   * Constructs CAD-enhanced orbit controls.
   *
   * @param object - The camera to control.
   * @param domElement - The HTML element for event listeners.
   */
  constructor(object: Camera, domElement: HTMLElement | null = null) {
    super(object, domElement!);

    /**
     * Saved quaternion for reset (in addition to position/target/zoom).
     */
    this.quaternion0 = this.object.quaternion.clone();

    // Rotation axis restriction flags (set via modifier keys)
    this._horizontalRotate = true; // meta key restricts to horizontal only
    this._verticalRotate = true; // ctrl key restricts to vertical only

    // Add pointer event listeners for modifier key detection
    if (domElement) {
      this._onCADPointerDown = this._handleCADPointerDown.bind(this);
      this._onCADPointerUp = this._handleCADPointerUp.bind(this);
      domElement.addEventListener("pointerdown", this._onCADPointerDown);
      domElement.addEventListener("pointerup", this._onCADPointerUp);
      domElement.addEventListener("pointercancel", this._onCADPointerUp);
    }

    // Override the parent's _onMouseDown which was bound in parent constructor
    _proto._onMouseDown = this._handleMouseDown.bind(this);
  }

  /**
   * Handle pointer down to check modifier keys for rotation restriction.
   */
  private _handleCADPointerDown(event: PointerEvent): void {
    // Check modifier keys for rotation restriction
    // ctrl: restrict to vertical rotation only (horizontalRotate = false)
    // meta: restrict to horizontal rotation only (verticalRotate = false)
    this._horizontalRotate = !KeyMapper.get(event, "ctrl");
    this._verticalRotate = !KeyMapper.get(event, "meta");
  }

  /**
   * Handle pointer up to reset rotation restrictions.
   */
  private _handleCADPointerUp(): void {
    this._horizontalRotate = true;
    this._verticalRotate = true;
  }

  /**
   * Override dispose to clean up our event listeners.
   */
  dispose(): void {
    if (this.domElement) {
      this.domElement.removeEventListener("pointerdown", this._onCADPointerDown);
      this.domElement.removeEventListener("pointerup", this._onCADPointerUp);
      this.domElement.removeEventListener("pointercancel", this._onCADPointerUp);
    }
    super.dispose();
  }

  /**
   * Custom mouse down handler for rotation restriction via modifier keys.
   *
   * Original OrbitControls: ctrl/meta/shift + left mouse = pan
   * CADOrbitControls: ctrl = vertical rotate only, meta = horizontal rotate only,
   *                   shift = pan (via KeyMapper)
   */
  private _handleMouseDown(event: MouseEvent): void {
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

    const handleMouseDownDolly = _proto._handleMouseDownDolly;
    const handleMouseDownPan = _proto._handleMouseDownPan;
    const handleMouseDownRotate = _proto._handleMouseDownRotate;

    switch (mouseAction) {
      case MOUSE.DOLLY:
        if (this.enableZoom === false) return;
        handleMouseDownDolly.call(this, event);
        this.state = STATE.DOLLY;
        break;

      case MOUSE.ROTATE:
        // Check if shift key (via KeyMapper) is pressed for pan
        if (KeyMapper.get(event, "shift")) {
          if (this.enablePan === false) return;
          handleMouseDownPan.call(this, event);
          this.state = STATE.PAN;
        } else {
          // ctrl and meta are handled for rotation restriction in _handleCADPointerDown
          if (this.enableRotate === false) return;
          handleMouseDownRotate.call(this, event);
          this.state = STATE.ROTATE;
        }
        break;

      case MOUSE.PAN:
        // For right mouse button, check if any modifier for rotate
        if (
          KeyMapper.get(event, "ctrl") ||
          KeyMapper.get(event, "meta") ||
          KeyMapper.get(event, "shift")
        ) {
          if (this.enableRotate === false) return;
          handleMouseDownRotate.call(this, event);
          this.state = STATE.ROTATE;
        } else {
          if (this.enablePan === false) return;
          handleMouseDownPan.call(this, event);
          this.state = STATE.PAN;
        }
        break;

      default:
        this.state = STATE.NONE;
    }
  }

  /**
   * Override _rotateLeft to respect horizontal rotation restriction.
   */
  _rotateLeft(angle: number): void {
    if (this._horizontalRotate) {
      this._sphericalDelta.theta -= angle;
    }
  }

  /**
   * Override _rotateUp to respect vertical rotation restriction.
   */
  _rotateUp(angle: number): void {
    if (this._verticalRotate) {
      this._sphericalDelta.phi -= angle;
    }
  }

  /**
   * Save the current state including quaternion.
   */
  saveState(): void {
    super.saveState();
    this.quaternion0.copy(this.object.quaternion);
  }

  /**
   * Reset to saved state including quaternion.
   */
  reset(): void {
    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    this.object.quaternion.copy(this.quaternion0);
    (this.object as PerspectiveCamera | OrthographicCamera).zoom = this.zoom0;

    (this.object as PerspectiveCamera | OrthographicCamera).updateProjectionMatrix();
    this.dispatchEvent({ type: "change" });

    this.update();

    this.state = -1; // STATE.NONE
  }

  /**
   * Rotate camera left (around the up axis).
   * Programmatic rotation bypasses modifier key restrictions.
   */
  rotateLeft(angle: number): void {
    // Bypass restriction for programmatic rotation
    this._sphericalDelta.theta -= angle;
  }

  /**
   * Rotate camera up (around the right axis).
   * Programmatic rotation bypasses modifier key restrictions.
   */
  rotateUp(angle: number): void {
    // Bypass restriction for programmatic rotation
    this._sphericalDelta.phi -= angle;
  }
}

export { CADOrbitControls };
