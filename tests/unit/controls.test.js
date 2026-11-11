/**
 * Unit tests for Controls, CADTrackballControls, and CADOrbitControls
 * Target: 90%+ coverage
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as THREE from "three";
import { Controls } from "../../src/camera/controls.js";
import { CADTrackballControls } from "../../src/camera/controls/CADTrackballControls.js";
import { CADOrbitControls } from "../../src/camera/controls/CADOrbitControls.js";
import { KeyMapper } from "../../src/utils/utils.js";

// Helper to create a mock DOM element with pointer capture support
function createMockDomElement() {
  const element = document.createElement("div");
  element.style.width = "800px";
  element.style.height = "600px";
  element.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
  });
  // Mock pointer capture methods (not available in happy-dom)
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  document.body.appendChild(element);
  return element;
}

/**
 * A touch pointer event of finger `id` at page and client position (x, y). It
 * bubbles: three's controls follow moves and releases on the document.
 */
function touchEvent(type, id, x, y) {
  const event = new PointerEvent(type, { button: 0, bubbles: true });
  for (const [key, value] of Object.entries({
    pointerType: "touch",
    pointerId: id,
    pageX: x,
    pageY: y,
    clientX: x,
    clientY: y,
  })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

function cleanupElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

// =============================================================================
// CADTrackballControls Tests
// =============================================================================

describe("CADTrackballControls", () => {
  let camera;
  let domElement;
  let controls;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 10);
    domElement = createMockDomElement();
  });

  afterEach(() => {
    if (controls) {
      controls.dispose();
      controls = null;
    }
    cleanupElement(domElement);
  });

  describe("constructor", () => {
    test("creates controls with default holroyd enabled", () => {
      controls = new CADTrackballControls(camera, domElement);

      expect(controls.holroyd).toBe(true);
      expect(controls.radius).toBe(0.9);
      expect(controls.quaternion0).toBeInstanceOf(THREE.Quaternion);
    });

    test("saves initial quaternion in quaternion0", () => {
      camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
      controls = new CADTrackballControls(camera, domElement);

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
      expect(controls.quaternion0.y).toBeCloseTo(camera.quaternion.y);
      expect(controls.quaternion0.z).toBeCloseTo(camera.quaternion.z);
      expect(controls.quaternion0.w).toBeCloseTo(camera.quaternion.w);
    });

    test("initializes holroyd tracking state", () => {
      controls = new CADTrackballControls(camera, domElement);

      expect(controls._holroydStart).toBeInstanceOf(THREE.Vector2);
      expect(controls._holroydEnd).toBeInstanceOf(THREE.Vector2);
      expect(controls._holroydActive).toBe(false);
      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });

    test("creates controls without domElement", () => {
      const controlsWithoutDom = new CADTrackballControls(camera, null);

      expect(controlsWithoutDom.holroyd).toBe(true);
      expect(controlsWithoutDom._holroydPointerDown).toBeUndefined();
      // Don't dispose - no domElement means parent's disconnect() will fail
    });
  });

  describe("holroyd mode", () => {
    test("can be disabled", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      expect(controls.holroyd).toBe(false);
    });

    test("holroyd pointer down activates tracking for button 0", () => {
      controls = new CADTrackballControls(camera, domElement);

      // Create event and manually set pageX/pageY (happy-dom doesn't support these in constructor)
      const event = new PointerEvent("pointerdown", { button: 0 });
      Object.defineProperty(event, "pageX", { value: 100 });
      Object.defineProperty(event, "pageY", { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._holroydActive).toBe(true);
      expect(controls._holroydStart.x).toBe(100);
      expect(controls._holroydStart.y).toBe(100);
    });

    test("holroyd pointer down ignores non-zero buttons", () => {
      controls = new CADTrackballControls(camera, domElement);

      const event = new PointerEvent("pointerdown", { button: 2 });
      Object.defineProperty(event, "pageX", { value: 100 });
      Object.defineProperty(event, "pageY", { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._holroydActive).toBe(false);
    });

    test("holroyd pointer down ignores shift key (pan)", () => {
      controls = new CADTrackballControls(camera, domElement);

      // KeyMapper default: shift maps to ctrlKey
      const event = new PointerEvent("pointerdown", {
        button: 0,
        ctrlKey: true, // This is "shift" in KeyMapper default
      });
      Object.defineProperty(event, "pageX", { value: 100 });
      Object.defineProperty(event, "pageY", { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._holroydActive).toBe(false);
    });

    test("holroyd pointer move updates end position when active", () => {
      controls = new CADTrackballControls(camera, domElement);

      const event = new PointerEvent("pointermove", {});
      Object.defineProperty(event, "pageX", { value: 200 });
      Object.defineProperty(event, "pageY", { value: 150 });
      controls._holroydActive = true;
      controls._holroydPointerId = event.pointerId;
      domElement.dispatchEvent(event);

      expect(controls._holroydEnd.x).toBe(200);
      expect(controls._holroydEnd.y).toBe(150);
    });

    test("holroyd pointer move ignored when not active", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydEnd.set(0, 0);

      const event = new PointerEvent("pointermove", {});
      Object.defineProperty(event, "pageX", { value: 200 });
      Object.defineProperty(event, "pageY", { value: 150 });
      domElement.dispatchEvent(event);

      expect(controls._holroydEnd.x).toBe(0);
      expect(controls._holroydEnd.y).toBe(0);
    });

    test("holroyd pointer up resets active state", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydActive = true;
      controls._horizontalRotate = false;
      controls._verticalRotate = false;

      domElement.dispatchEvent(new PointerEvent("pointerup"));

      expect(controls._holroydActive).toBe(false);
      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });

    test("pointercancel also resets state", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydActive = true;

      domElement.dispatchEvent(new PointerEvent("pointercancel"));

      expect(controls._holroydActive).toBe(false);
    });
  });

  describe("modifier key rotation restrictions", () => {
    test("ctrl key restricts to vertical rotation only", () => {
      controls = new CADTrackballControls(camera, domElement);

      // KeyMapper default: ctrl maps to shiftKey
      const event = new PointerEvent("pointerdown", {
        button: 0,
        shiftKey: true, // This is "ctrl" in KeyMapper default
      });
      Object.defineProperty(event, "pageX", { value: 100 });
      Object.defineProperty(event, "pageY", { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(false);
      expect(controls._verticalRotate).toBe(true);
    });

    test("meta key restricts to horizontal rotation only", () => {
      controls = new CADTrackballControls(camera, domElement);

      // KeyMapper default: meta maps to altKey
      const event = new PointerEvent("pointerdown", {
        button: 0,
        altKey: true, // This is "meta" in KeyMapper default
      });
      Object.defineProperty(event, "pageX", { value: 100 });
      Object.defineProperty(event, "pageY", { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(false);
    });
  });

  describe("saveState and reset", () => {
    test("saveState saves quaternion", () => {
      controls = new CADTrackballControls(camera, domElement);

      // Change camera quaternion
      camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();
      controls.saveState();

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
      expect(controls.quaternion0.y).toBeCloseTo(camera.quaternion.y);
      expect(controls.quaternion0.z).toBeCloseTo(camera.quaternion.z);
      expect(controls.quaternion0.w).toBeCloseTo(camera.quaternion.w);
    });

    test("reset restores quaternion", () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();
      controls.saveState();

      // Change camera quaternion
      camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();

      // Reset should restore original
      controls.reset();

      expect(camera.quaternion.x).toBeCloseTo(originalQ.x);
      expect(camera.quaternion.y).toBeCloseTo(originalQ.y);
      expect(camera.quaternion.z).toBeCloseTo(originalQ.z);
      expect(camera.quaternion.w).toBeCloseTo(originalQ.w);
    });
  });

  describe("saved state getters", () => {
    test("target0 returns saved target", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.target.set(1, 2, 3);
      controls.saveState();

      expect(controls.target0.x).toBe(1);
      expect(controls.target0.y).toBe(2);
      expect(controls.target0.z).toBe(3);
    });

    test("position0 returns saved position", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.saveState();

      expect(controls.position0).toEqual(camera.position);
    });

    test("zoom0 returns saved zoom", () => {
      controls = new CADTrackballControls(camera, domElement);
      camera.zoom = 2.5;
      controls.saveState();

      expect(controls.zoom0).toBe(2.5);
    });
  });

  describe("rotateX/Y/Z", () => {
    test("rotateX rotates around world X axis", () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.rotateX(Math.PI / 4);

      expect(camera.quaternion.equals(originalQ)).toBe(false);
    });

    test("rotateY rotates around world Y axis", () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.rotateY(Math.PI / 4);

      expect(camera.quaternion.equals(originalQ)).toBe(false);
    });

    test("rotateZ rotates around world Z axis", () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.rotateZ(Math.PI / 4);

      expect(camera.quaternion.equals(originalQ)).toBe(false);
    });
  });

  describe("update", () => {
    test("update with holroyd=false calls parent update", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      // Should not throw
      controls.update();
    });

    test("update with holroyd=true skips lookAt", () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.update();

      // Quaternion should not change from update alone
      expect(camera.quaternion.x).toBeCloseTo(originalQ.x);
      expect(camera.quaternion.y).toBeCloseTo(originalQ.y);
      expect(camera.quaternion.z).toBeCloseTo(originalQ.z);
      expect(camera.quaternion.w).toBeCloseTo(originalQ.w);
    });
  });

  describe("_rotateCamera", () => {
    test("delegates to parent when holroyd=false", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      // Should not throw
      controls._rotateCamera();
    });

    test("no rotation when start equals end", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydStart.set(100, 100);
      controls._holroydEnd.set(100, 100);
      const originalQ = camera.quaternion.clone();

      controls._rotateCamera();

      expect(camera.quaternion.x).toBeCloseTo(originalQ.x);
      expect(camera.quaternion.y).toBeCloseTo(originalQ.y);
      expect(camera.quaternion.z).toBeCloseTo(originalQ.z);
      expect(camera.quaternion.w).toBeCloseTo(originalQ.w);
    });
  });

  describe("_panCamera", () => {
    test("delegates to parent when holroyd=false", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      // Should not throw
      controls._panCamera();
    });

    test("no pan when start equals end", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._panStart.set(100, 100);
      controls._panEnd.set(100, 100);
      const originalPos = camera.position.clone();

      controls._panCamera();

      expect(camera.position.x).toBeCloseTo(originalPos.x);
      expect(camera.position.y).toBeCloseTo(originalPos.y);
      expect(camera.position.z).toBeCloseTo(originalPos.z);
    });
  });

  describe("quaternion normalization (view-flip regression)", () => {
    // Holroyd rotation premultiplies object.quaternion every frame and skips the
    // lookAt() that renormalizes stock TrackballControls. Without an explicit
    // normalize() the norm drifts below 1 (a positive-feedback loop, because the
    // sub-unit quaternion scales the next frame's rotation axis by |q|^2), which
    // after enough dragging erupts into ~180deg single-frame view flips.
    // See CADTrackballControls._rotateCamera. This drives many small drags and
    // asserts the quaternion stays unit and no frame rotates wildly.
    function holroydDrag(c, cam, x0, y0, dx, dy, steps = 4) {
      const down = new PointerEvent("pointerdown", { button: 0 });
      Object.defineProperty(down, "pageX", { value: x0 });
      Object.defineProperty(down, "pageY", { value: y0 });
      domElement.dispatchEvent(down);
      for (let i = 1; i <= steps; i++) {
        const mv = new PointerEvent("pointermove", {});
        Object.defineProperty(mv, "pageX", { value: x0 + (dx * i) / steps });
        Object.defineProperty(mv, "pageY", { value: y0 + (dy * i) / steps });
        domElement.dispatchEvent(mv);
      }
      domElement.dispatchEvent(new PointerEvent("pointerup"));
    }

    test("quaternion stays unit and rotation bounded over many drags", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = true;
      controls.target.set(0, 0, 0);

      let seed = 12345;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };

      let minNorm = 1;
      for (let d = 0; d < 1500; d++) {
        const x0 = 100 + rnd() * 600;
        const y0 = 100 + rnd() * 400;
        holroydDrag(camera, controls, x0, y0, (rnd() - 0.5) * 300, (rnd() - 0.5) * 300);
        minNorm = Math.min(minNorm, camera.quaternion.length());
      }

      // As shipped (no normalize) the norm collapses well below 1 within ~1000
      // drags (measured ~0.98 at 1000, ~0.19 at 2000) and the view starts
      // flipping. With the normalize() the quaternion never leaves the unit
      // sphere, so no flip is possible.
      expect(minNorm).toBeCloseTo(1, 6);
      expect(camera.quaternion.length()).toBeCloseTo(1, 6);
    });
  });

  describe("cursor pivot", () => {
    const pointer = (type, x, y) => {
      const event = new PointerEvent(type, { button: 0 });
      for (const [key, value] of Object.entries({
        pageX: x,
        pageY: y,
        clientX: x,
        clientY: y,
      })) {
        Object.defineProperty(event, key, { value });
      }
      return event;
    };

    const drag = (x0, y0, x1, y1) => {
      domElement.dispatchEvent(pointer("pointerdown", x0, y0));
      domElement.dispatchEvent(pointer("pointermove", x1, y1));
      controls.update();
      domElement.dispatchEvent(pointer("pointerup", x1, y1));
    };

    const onScreen = (point) => {
      camera.updateMatrixWorld();
      return point.clone().project(camera);
    };

    const expectFixedOnScreen = (point, before) => {
      const after = onScreen(point);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    };

    test("a rotate drag asks the picker for the pivot at the pointer", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.pivotPicker = vi.fn(() => null);

      domElement.dispatchEvent(pointer("pointerdown", 100, 200));

      expect(controls.pivotPicker).toHaveBeenCalledWith(100, 200);
    });

    test("holroyd: rotates around the picked point, which stays on screen", () => {
      controls = new CADTrackballControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = () => pivot.clone();
      const before = onScreen(pivot);
      const distance = camera.position.distanceTo(pivot);

      drag(400, 300, 480, 340);

      expectFixedOnScreen(pivot, before);
      expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance);
      expect(controls.target.length()).toBeGreaterThan(0.1);
    });

    test("holroyd off: rotates around the picked point, which stays on screen", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;
      controls.staticMoving = true;
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = () => pivot.clone();
      const before = onScreen(pivot);
      const distance = camera.position.distanceTo(pivot);

      controls._onMouseDown(pointer("pointerdown", 400, 300));
      controls._moveCurr.set(0.3, 0.2);
      controls.update();

      expectFixedOnScreen(pivot, before);
      expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance);
      expect(controls.target.length()).toBeGreaterThan(0.1);
    });

    test("without a hit it rotates around the target", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.pivotPicker = () => null;

      drag(400, 300, 480, 340);

      expect(controls.target.length()).toBeCloseTo(0);
    });

    test("holroyd: the ball sits at the pivot, so a drag from there does not roll", () => {
      // The camera-space rotation axis of a vertical drag starting at the pivot's
      // screen position, with the pivot far from the canvas centre
      const pivot = new THREE.Vector3(3, 2, 0);
      const rollOfDrag = (picker) => {
        camera.position.set(0, 0, 10);
        camera.quaternion.identity();
        controls?.dispose();
        controls = new CADTrackballControls(camera, domElement);
        controls.pivotPicker = picker;
        const ndc = onScreen(pivot);
        const rect = domElement.getBoundingClientRect();
        const x = rect.left + ((ndc.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - ndc.y) / 2) * rect.height;
        const before = camera.quaternion.clone();
        drag(x, y, x, y + 40);
        const delta = before.invert().multiply(camera.quaternion);
        return Math.abs(delta.z) / Math.hypot(delta.x, delta.y, delta.z);
      };

      expect(rollOfDrag(() => pivot.clone())).toBeCloseTo(0, 5);
      // Without a pivot the ball is at the canvas centre: the same drag rolls
      expect(rollOfDrag(() => null)).toBeGreaterThan(0.1);
    });

    const touch = (type, id, x, y) =>
      domElement.dispatchEvent(touchEvent(type, id, x, y));

    test("touch: one finger asks the picker for the pivot under it", () => {
      controls = new CADTrackballControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = vi.fn(() => pivot);

      touch("pointerdown", 1, 100, 200);

      expect(controls.pivotPicker).toHaveBeenCalledWith(100, 200);
      expect(controls.pivot).toBe(pivot);
    });

    test.each([true, false])(
      "touch, holroyd %s: rotates around the picked point, which stays on screen",
      (holroyd) => {
        controls = new CADTrackballControls(camera, domElement);
        controls.holroyd = holroyd;
        controls.staticMoving = true;
        const pivot = new THREE.Vector3(3, 2, 0);
        controls.pivotPicker = () => pivot.clone();
        const before = onScreen(pivot);
        const distance = camera.position.distanceTo(pivot);

        touch("pointerdown", 1, 400, 300);
        touch("pointermove", 1, 480, 340);
        controls.update();

        expectFixedOnScreen(pivot, before);
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance);
        expect(controls.target.length()).toBeGreaterThan(0.1);
      },
    );

    test("touch: the holroyd ball sits at the finger's pivot", () => {
      controls = new CADTrackballControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = () => pivot.clone();

      touch("pointerdown", 1, 100, 200);

      const ndc = onScreen(pivot);
      expect(controls._ballCenter.x).toBeCloseTo(ndc.x);
      expect(controls._ballCenter.y).toBeCloseTo(ndc.y);
    });

    test("touch after a mouse drag picks its own pivot, not the mouse's", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.pivotPicker = () => new THREE.Vector3(3, 2, 0);
      drag(400, 300, 480, 340);
      // kept after the release, for the damping
      expect(controls.pivot).not.toBeNull();

      controls.pivotPicker = () => null;
      touch("pointerdown", 1, 100, 200);

      expect(controls.pivot).toBeNull();
      expect(controls._ballCenter.toArray()).toEqual([0, 0]);
    });

    test("a second finger clears the pivot", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.pivotPicker = () => new THREE.Vector3(3, 2, 0);

      touch("pointerdown", 1, 100, 200);
      touch("pointerdown", 2, 300, 250);

      expect(controls.pivot).toBeNull();
    });

    test("holroyd: a two-finger pinch does not rotate", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.pivotPicker = () => null;
      const before = camera.quaternion.clone();

      touch("pointerdown", 1, 360, 300);
      touch("pointerdown", 2, 440, 300);
      for (let i = 1; i <= 5; i++) {
        touch("pointermove", 1, 360 - i * 10, 300);
        touch("pointermove", 2, 440 + i * 10, 300);
      }
      controls.update();

      expect(before.angleTo(camera.quaternion)).toBeCloseTo(0, 6);
    });

    const wheel = (x, y) => {
      const event = new WheelEvent("wheel", { deltaY: -400, cancelable: true });
      // happy-dom's WheelEvent ignores the client coordinates in its init dict
      Object.defineProperty(event, "clientX", { value: x });
      Object.defineProperty(event, "clientY", { value: y });
      domElement.dispatchEvent(event);
    };

    // The world point under client (x, y) on the plane through the target.
    const underCursor = (x, y) => {
      camera.updateMatrixWorld();
      const ndc = new THREE.Vector2((x / 800) * 2 - 1, 1 - (y / 600) * 2);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const normal = camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        normal,
        controls.target,
      );
      return ray.ray.intersectPlane(plane, new THREE.Vector3());
    };

    test("perspective: the wheel zooms towards the cursor", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.zoomToCursor = true;
      const point = underCursor(600, 150);
      const before = onScreen(point);
      const distance = camera.position.distanceTo(controls.target);

      wheel(600, 150);

      expect(camera.position.distanceTo(controls.target)).toBeLessThan(
        distance,
      );
      expectFixedOnScreen(point, before);
    });

    test("orthographic: the wheel zooms towards the cursor", () => {
      camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
      camera.position.set(0, 0, 10);
      controls = new CADTrackballControls(camera, domElement);
      controls.zoomToCursor = true;
      const point = underCursor(600, 150);
      const before = onScreen(point);

      wheel(600, 150);

      expect(camera.zoom).toBeGreaterThan(1);
      expectFixedOnScreen(point, before);
    });

    test("without zoomToCursor the wheel zooms towards the target", () => {
      controls = new CADTrackballControls(camera, domElement);

      wheel(600, 150);

      expect(controls.target.length()).toBeCloseTo(0);
    });

    // A middle-button drag, then what damping is left. The parent listens for the
    // moves and the release on the document.
    const middleDrag = (x, y, dy) => {
      const middle = (type, py) => {
        const event = pointer(type, x, py);
        Object.defineProperty(event, "button", { value: 1 });
        return event;
      };
      domElement.dispatchEvent(middle("pointerdown", y));
      for (let i = 1; i <= 5; i++) {
        document.dispatchEvent(middle("pointermove", y + (dy * i) / 5));
        controls.update();
      }
      document.dispatchEvent(middle("pointerup", y + dy));
      for (let i = 0; i < 20; i++) controls.update();
    };

    test.each([true, false])(
      "orthographic: a middle-button drag zooms towards the cursor (holroyd %s)",
      (holroyd) => {
        camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
        camera.position.set(0, 0, 10);
        controls = new CADTrackballControls(camera, domElement);
        controls.holroyd = holroyd;
        controls.zoomToCursor = true;
        const point = underCursor(600, 150);
        const before = onScreen(point);

        middleDrag(600, 150, 100);

        expect(camera.zoom).not.toBeCloseTo(1);
        expectFixedOnScreen(point, before);
      },
    );

    test("perspective: a middle-button drag zooms towards the cursor", () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.zoomToCursor = true;
      const point = underCursor(600, 150);
      const before = onScreen(point);
      const distance = camera.position.distanceTo(controls.target);

      middleDrag(600, 150, 100);

      expect(camera.position.distanceTo(controls.target)).not.toBeCloseTo(
        distance,
      );
      expectFixedOnScreen(point, before);
    });

    test("without zoomToCursor a middle-button drag zooms towards the target", () => {
      controls = new CADTrackballControls(camera, domElement);
      const distance = camera.position.distanceTo(controls.target);

      middleDrag(600, 150, 100);

      expect(camera.position.distanceTo(controls.target)).not.toBeCloseTo(
        distance,
      );
      expect(controls.target.length()).toBeCloseTo(0);
    });
  });

  describe("dispose", () => {
    test("removes event listeners", () => {
      controls = new CADTrackballControls(camera, domElement);
      const removeEventListenerSpy = vi.spyOn(
        domElement,
        "removeEventListener",
      );

      controls.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerdown",
        controls._holroydPointerDown,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointermove",
        controls._holroydPointerMove,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerup",
        controls._holroydPointerUp,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointercancel",
        controls._holroydPointerUp,
      );
    });
  });
});

// =============================================================================
// CADOrbitControls Tests
// =============================================================================

describe("CADOrbitControls", () => {
  let camera;
  let domElement;
  let controls;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 10);
    domElement = createMockDomElement();
  });

  afterEach(() => {
    if (controls) {
      controls.dispose();
      controls = null;
    }
    cleanupElement(domElement);
  });

  describe("constructor", () => {
    test("creates controls with quaternion0", () => {
      controls = new CADOrbitControls(camera, domElement);

      expect(controls.quaternion0).toBeInstanceOf(THREE.Quaternion);
    });

    test("saves initial quaternion", () => {
      camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
      controls = new CADOrbitControls(camera, domElement);

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
      expect(controls.quaternion0.y).toBeCloseTo(camera.quaternion.y);
      expect(controls.quaternion0.z).toBeCloseTo(camera.quaternion.z);
      expect(controls.quaternion0.w).toBeCloseTo(camera.quaternion.w);
    });

    test("initializes rotation restriction flags", () => {
      controls = new CADOrbitControls(camera, domElement);

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });
  });

  describe("modifier key rotation restrictions", () => {
    test("ctrl key restricts to vertical rotation only", () => {
      controls = new CADOrbitControls(camera, domElement);

      // KeyMapper default: ctrl maps to shiftKey
      const event = new PointerEvent("pointerdown", {
        button: 0,
        shiftKey: true, // This is "ctrl" in KeyMapper default
      });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(false);
      expect(controls._verticalRotate).toBe(true);
    });

    test("meta key restricts to horizontal rotation only", () => {
      controls = new CADOrbitControls(camera, domElement);

      // KeyMapper default: meta maps to altKey
      const event = new PointerEvent("pointerdown", {
        button: 0,
        altKey: true, // This is "meta" in KeyMapper default
      });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(false);
    });

    test("pointer up resets rotation restrictions", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;
      controls._verticalRotate = false;

      domElement.dispatchEvent(new PointerEvent("pointerup"));

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });

    test("pointercancel resets restrictions", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;

      domElement.dispatchEvent(new PointerEvent("pointercancel"));

      expect(controls._horizontalRotate).toBe(true);
    });
  });

  describe("_rotateLeft and _rotateUp", () => {
    test("_rotateLeft respects horizontal restriction", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;
      const originalTheta = controls._sphericalDelta.theta;

      controls._rotateLeft(0.5);

      expect(controls._sphericalDelta.theta).toBe(originalTheta);
    });

    test("_rotateLeft works when not restricted", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = true;
      const originalTheta = controls._sphericalDelta.theta;

      controls._rotateLeft(0.5);

      expect(controls._sphericalDelta.theta).toBe(originalTheta - 0.5);
    });

    test("_rotateUp respects vertical restriction", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._verticalRotate = false;
      const originalPhi = controls._sphericalDelta.phi;

      controls._rotateUp(0.5);

      expect(controls._sphericalDelta.phi).toBe(originalPhi);
    });

    test("_rotateUp works when not restricted", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._verticalRotate = true;
      const originalPhi = controls._sphericalDelta.phi;

      controls._rotateUp(0.5);

      expect(controls._sphericalDelta.phi).toBe(originalPhi - 0.5);
    });
  });

  describe("public rotateLeft and rotateUp", () => {
    test("rotateLeft bypasses restriction", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;
      const originalTheta = controls._sphericalDelta.theta;

      controls.rotateLeft(0.5);

      expect(controls._sphericalDelta.theta).toBe(originalTheta - 0.5);
    });

    test("rotateUp bypasses restriction", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._verticalRotate = false;
      const originalPhi = controls._sphericalDelta.phi;

      controls.rotateUp(0.5);

      expect(controls._sphericalDelta.phi).toBe(originalPhi - 0.5);
    });
  });

  describe("saveState and reset", () => {
    test("saveState saves quaternion", () => {
      controls = new CADOrbitControls(camera, domElement);

      camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();
      controls.saveState();

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
    });

    test("reset restores quaternion", () => {
      controls = new CADOrbitControls(camera, domElement);
      const originalQ = camera.quaternion.clone();
      controls.saveState();

      camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();
      controls.reset();

      expect(camera.quaternion.x).toBeCloseTo(originalQ.x);
      expect(camera.quaternion.y).toBeCloseTo(originalQ.y);
      expect(camera.quaternion.z).toBeCloseTo(originalQ.z);
      expect(camera.quaternion.w).toBeCloseTo(originalQ.w);
    });

    test("reset dispatches change event", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls.saveState();

      const changeSpy = vi.fn();
      controls.addEventListener("change", changeSpy);

      controls.reset();

      expect(changeSpy).toHaveBeenCalled();
    });
  });

  describe("cursor pivot", () => {
    const startRotate = (x = 100, y = 200) =>
      controls._onMouseDown(
        new MouseEvent("pointerdown", { button: 0, clientX: x, clientY: y }),
      );

    const onScreen = (point) => {
      camera.updateMatrixWorld();
      return point.clone().project(camera);
    };

    test("a rotate drag asks the picker for the pivot at the pointer", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls.pivotPicker = vi.fn(() => null);

      startRotate(100, 200);

      expect(controls.pivotPicker).toHaveBeenCalledWith(100, 200);
    });

    test("orbits around the picked point, which stays fixed on screen", () => {
      controls = new CADOrbitControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = () => pivot.clone();
      const before = onScreen(pivot);
      const distance = camera.position.distanceTo(pivot);

      startRotate();
      controls.rotateLeft(0.4);
      controls.rotateUp(0.3);
      controls.update();

      const after = onScreen(pivot);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance);
      expect(controls.target.length()).toBeGreaterThan(0.1);
    });

    test("the change event sees the corrected camera", () => {
      controls = new CADOrbitControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = () => pivot.clone();
      const before = onScreen(pivot);
      const seen = [];
      controls.addEventListener("change", () => seen.push(onScreen(pivot)));

      startRotate();
      controls.rotateLeft(0.4);
      controls.update();

      expect(seen).toHaveLength(1);
      expect(seen[0].x).toBeCloseTo(before.x);
      expect(seen[0].y).toBeCloseTo(before.y);
    });

    test("without a hit it orbits around the target", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls.pivotPicker = () => null;

      startRotate();
      controls.rotateLeft(0.4);
      controls.update();

      expect(controls.target.length()).toBeCloseTo(0);
    });

    test("pointerup clears the pivot", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls.pivotPicker = () => new THREE.Vector3(3, 2, 0);

      startRotate();
      domElement.dispatchEvent(new PointerEvent("pointerup"));
      controls.rotateLeft(0.4);
      controls.update();

      expect(controls.target.length()).toBeCloseTo(0);
    });

    const touch = (type, id, x, y) =>
      domElement.dispatchEvent(touchEvent(type, id, x, y));

    test("touch: one finger asks the picker for the pivot under it", () => {
      controls = new CADOrbitControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = vi.fn(() => pivot);

      touch("pointerdown", 1, 100, 200);

      expect(controls.pivotPicker).toHaveBeenCalledWith(100, 200);
      expect(controls.pivot).toBe(pivot);
    });

    test("touch: orbits around the picked point, which stays fixed on screen", () => {
      // OrbitControls scales the touch rotation by the element height, which
      // happy-dom reports as 0
      Object.defineProperty(domElement, "clientHeight", { value: 600 });
      controls = new CADOrbitControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = () => pivot.clone();
      const before = onScreen(pivot);
      const distance = camera.position.distanceTo(pivot);

      touch("pointerdown", 1, 400, 300);
      touch("pointermove", 1, 480, 340);

      const after = onScreen(pivot);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance);
      expect(controls.target.length()).toBeGreaterThan(0.1);
    });

    test("touch: a second finger clears the pivot", () => {
      controls = new CADOrbitControls(camera, domElement);
      controls.pivotPicker = () => new THREE.Vector3(3, 2, 0);

      touch("pointerdown", 1, 100, 200);
      touch("pointerdown", 2, 300, 250);

      expect(controls.pivot).toBeNull();
    });

    test("touch: lifting one of two fingers picks the pivot under the other", () => {
      controls = new CADOrbitControls(camera, domElement);
      const pivot = new THREE.Vector3(3, 2, 0);
      controls.pivotPicker = vi.fn(() => pivot);

      touch("pointerdown", 1, 100, 200);
      touch("pointerdown", 2, 300, 250);
      touch("pointerup", 2, 300, 250);

      expect(controls.pivotPicker).toHaveBeenLastCalledWith(100, 200);
      expect(controls.pivot).toBe(pivot);
    });
  });

  describe("dispose", () => {
    test("removes event listeners", () => {
      controls = new CADOrbitControls(camera, domElement);
      const removeEventListenerSpy = vi.spyOn(
        domElement,
        "removeEventListener",
      );

      controls.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerdown",
        controls._onCADPointerDown,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerup",
        controls._onCADPointerUp,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointercancel",
        controls._onCADPointerUp,
      );
    });
  });
});

// =============================================================================
// Controls Wrapper Tests
// =============================================================================

describe("Controls", () => {
  let camera;
  let domElement;
  let controls;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 10);
    domElement = createMockDomElement();
  });

  afterEach(() => {
    if (controls) {
      controls.dispose();
      controls = null;
    }
    cleanupElement(domElement);
  });

  describe("constructor", () => {
    test("creates trackball controls", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );

      expect(controls.type).toBe("trackball");
      expect(controls.controls).toBeInstanceOf(CADTrackballControls);
    });

    test("creates orbit controls", () => {
      controls = new Controls("orbit", camera, new THREE.Vector3(), domElement);

      expect(controls.type).toBe("orbit");
      expect(controls.controls).toBeInstanceOf(CADOrbitControls);
    });

    test("applies speed parameters", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
        2.0,
        3.0,
        4.0,
      );

      expect(controls.rotateSpeed).toBe(2.0);
      expect(controls.zoomSpeed).toBe(3.0);
      expect(controls.panSpeed).toBe(4.0);
    });

    test("passes holroyd parameter to trackball", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
        1,
        1,
        1,
        false,
      );

      expect(controls.holroyd).toBe(false);
      expect(controls.controls.holroyd).toBe(false);
    });

    test("sets target from array", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(1, 2, 3),
        domElement,
      );

      expect(controls.controls.target.x).toBe(1);
      expect(controls.controls.target.y).toBe(2);
      expect(controls.controls.target.z).toBe(3);
    });

    test("stores target0 copy", () => {
      const target = new THREE.Vector3(1, 2, 3);
      controls = new Controls("trackball", camera, target, domElement);

      expect(controls.target0).toEqual(new THREE.Vector3(1, 2, 3));
      expect(controls.target0).not.toBe(target); // Should be a copy
    });
  });

  describe("speed normalization", () => {
    test("trackball applies speed factors", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
        1.0,
        1.0,
        1.0,
      );

      // Trackball factors: pan: 0.22, rotate: 1.0, zoom: 2.0
      expect(controls.controls.rotateSpeed).toBe(1.0);
      expect(controls.controls.zoomSpeed).toBe(2.0);
      expect(controls.controls.panSpeed).toBe(0.22);
    });

    test("orbit applies speed factors", () => {
      controls = new Controls(
        "orbit",
        camera,
        new THREE.Vector3(),
        domElement,
        1.0,
        1.0,
        1.0,
      );

      // Orbit factors: pan: 1.0, rotate: 1.0, zoom: 1.0
      expect(controls.controls.rotateSpeed).toBe(1.0);
      expect(controls.controls.zoomSpeed).toBe(1.0);
      expect(controls.controls.panSpeed).toBe(1.0);
    });
  });

  describe("setZoomSpeed", () => {
    test("updates zoom speed with factor", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );

      controls.setZoomSpeed(2.0);

      expect(controls.zoomSpeed).toBe(2.0);
      expect(controls.controls.zoomSpeed).toBe(4.0); // 2.0 * 2.0 factor
    });
  });

  describe("setPanSpeed", () => {
    test("updates pan speed with factor", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );

      controls.setPanSpeed(2.0);

      expect(controls.panSpeed).toBe(2.0);
      expect(controls.controls.panSpeed).toBe(0.44); // 2.0 * 0.22 factor
    });
  });

  describe("setRotateSpeed", () => {
    test("updates rotate speed with factor", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );

      controls.setRotateSpeed(2.0);

      expect(controls.rotateSpeed).toBe(2.0);
      expect(controls.controls.rotateSpeed).toBe(2.0); // 2.0 * 1.0 factor
    });
  });

  describe("setHolroydTrackball", () => {
    test("updates holroyd flag on trackball controls", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );

      controls.setHolroydTrackball(false);

      expect(controls.controls.holroyd).toBe(false);
    });
  });

  describe.each(["orbit", "trackball"])("cursor options (%s)", (type) => {
    beforeEach(() => {
      controls = new Controls(type, camera, new THREE.Vector3(), domElement);
    });

    test("setCursorPivot switches only the pivot picker", () => {
      const picker = () => null;
      controls.setZoomToCursor(false);

      controls.setCursorPivot(true, picker);
      expect(controls.controls.pivotPicker).toBe(picker);
      expect(controls.controls.zoomToCursor).toBe(false);

      controls.setCursorPivot(false, picker);
      expect(controls.controls.pivotPicker).toBe(null);
      expect(controls.controls.zoomToCursor).toBe(false);
    });

    test("setZoomToCursor switches only the zoom", () => {
      const picker = () => null;
      controls.setCursorPivot(true, picker);

      controls.setZoomToCursor(true);
      expect(controls.controls.zoomToCursor).toBe(true);
      expect(controls.controls.pivotPicker).toBe(picker);

      controls.setZoomToCursor(false);
      expect(controls.controls.zoomToCursor).toBe(false);
      expect(controls.controls.pivotPicker).toBe(picker);
    });
  });

  describe("getTarget and setTarget", () => {
    test("getTarget returns current target", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(1, 2, 3),
        domElement,
      );

      const target = controls.getTarget();

      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    test("setTarget updates target", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const newTarget = new THREE.Vector3(5, 6, 7);

      controls.setTarget(newTarget);

      expect(controls.controls.target.x).toBe(5);
      expect(controls.controls.target.y).toBe(6);
      expect(controls.controls.target.z).toBe(7);
    });
  });

  describe("getZoom0", () => {
    test("returns initial zoom value", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      camera.zoom = 2.0;
      controls.saveState();

      expect(controls.getZoom0()).toBe(2.0);
    });
  });

  describe("getResetLocation and setResetLocation", () => {
    test("getResetLocation returns saved state", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      controls.controls.target.set(1, 2, 3);
      camera.position.set(4, 5, 6);
      camera.zoom = 2.0;
      controls.saveState();

      const location = controls.getResetLocation();

      expect(location.target0.x).toBe(1);
      expect(location.position0.x).toBe(4);
      expect(location.zoom0).toBe(2.0);
      expect(location.quaternion0).toBeInstanceOf(THREE.Quaternion);
    });

    test("setResetLocation updates saved state (orbit)", () => {
      // Use orbit controls as they support zoom0 setter
      controls = new Controls("orbit", camera, new THREE.Vector3(), domElement);

      const target = new THREE.Vector3(10, 20, 30);
      const position = new THREE.Vector3(40, 50, 60);
      const quaternion = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5).normalize();
      const zoom = 3.0;

      controls.setResetLocation(target, position, quaternion, zoom);

      const location = controls.getResetLocation();
      expect(location.target0.x).toBe(10);
      expect(location.position0.x).toBe(40);
      expect(location.zoom0).toBe(3.0);
    });

    test("setResetLocation normalizes a rounded quaternion", () => {
      controls = new Controls("orbit", camera, new THREE.Vector3(), domElement);
      const rounded = new THREE.Quaternion(0.6, 0.27, 0.31, 0.69);

      controls.setResetLocation(
        new THREE.Vector3(),
        new THREE.Vector3(1, 1, 1),
        rounded,
        1,
      );

      expect(controls.getResetLocation().quaternion0.length()).toBeCloseTo(
        1,
        10,
      );
      expect(rounded.toArray()).toEqual([0.6, 0.27, 0.31, 0.69]);
    });
  });

  describe("addChangeListener and removeChangeListener", () => {
    test("addChangeListener registers callback", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const callback = vi.fn();

      controls.addChangeListener(callback);

      expect(controls.currentUpdateCallback).toBe(callback);
    });

    test("addChangeListener ignores second callback", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      controls.addChangeListener(callback1);
      controls.addChangeListener(callback2);

      expect(controls.currentUpdateCallback).toBe(callback1);
    });

    test("removeChangeListener clears callback", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const callback = vi.fn();

      controls.addChangeListener(callback);
      controls.removeChangeListener();

      expect(controls.currentUpdateCallback).toBeNull();
    });
  });

  describe("rotateUp and rotateLeft (orbit)", () => {
    test("rotateUp converts degrees to radians", () => {
      controls = new Controls("orbit", camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, "rotateUp");

      controls.rotateUp(90);

      expect(rotateSpy).toHaveBeenCalledWith(-Math.PI / 2);
    });

    test("rotateLeft converts degrees to radians", () => {
      controls = new Controls("orbit", camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, "rotateLeft");

      controls.rotateLeft(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });
  });

  describe("rotateX/Y/Z (trackball)", () => {
    test("rotateX converts degrees to radians", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const rotateSpy = vi.spyOn(controls.controls, "rotateX");

      controls.rotateX(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });

    test("rotateY converts degrees to radians", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const rotateSpy = vi.spyOn(controls.controls, "rotateY");

      controls.rotateY(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });

    test("rotateZ converts degrees to radians", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const rotateSpy = vi.spyOn(controls.controls, "rotateZ");

      controls.rotateZ(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });
  });

  describe("update and reset", () => {
    test("update calls controls.update", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const updateSpy = vi.spyOn(controls.controls, "update");

      controls.update();

      expect(updateSpy).toHaveBeenCalled();
    });

    test("reset calls controls.reset", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const resetSpy = vi.spyOn(controls.controls, "reset");

      controls.reset();

      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    test("disposes controls", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const disposeSpy = vi.spyOn(controls.controls, "dispose");

      controls.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    test("handles double dispose", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      controls.dispose();

      // Should not throw (dispose can be called multiple times)
      expect(() => controls.dispose()).not.toThrow();
    });
  });

  describe("setCamera", () => {
    test("updates controls object", () => {
      controls = new Controls(
        "trackball",
        camera,
        new THREE.Vector3(),
        domElement,
      );
      const newCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

      controls.setCamera(newCamera);

      expect(controls.controls.object).toBe(newCamera);
    });
  });
});
