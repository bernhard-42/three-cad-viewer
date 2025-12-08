/**
 * Unit tests for Controls, CADTrackballControls, and CADOrbitControls
 * Target: 90%+ coverage
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Controls } from '../../src/controls.js';
import { CADTrackballControls } from '../../src/controls/CADTrackballControls.js';
import { CADOrbitControls } from '../../src/controls/CADOrbitControls.js';
import { KeyMapper } from '../../src/utils.js';

// Helper to create a mock DOM element with pointer capture support
function createMockDomElement() {
  const element = document.createElement('div');
  element.style.width = '800px';
  element.style.height = '600px';
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

function cleanupElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

// =============================================================================
// CADTrackballControls Tests
// =============================================================================

describe('CADTrackballControls', () => {
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

  describe('constructor', () => {
    test('creates controls with default holroyd enabled', () => {
      controls = new CADTrackballControls(camera, domElement);

      expect(controls.holroyd).toBe(true);
      expect(controls.radius).toBe(0.9);
      expect(controls.quaternion0).toBeInstanceOf(THREE.Quaternion);
    });

    test('saves initial quaternion in quaternion0', () => {
      camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
      controls = new CADTrackballControls(camera, domElement);

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
      expect(controls.quaternion0.y).toBeCloseTo(camera.quaternion.y);
      expect(controls.quaternion0.z).toBeCloseTo(camera.quaternion.z);
      expect(controls.quaternion0.w).toBeCloseTo(camera.quaternion.w);
    });

    test('initializes holroyd tracking state', () => {
      controls = new CADTrackballControls(camera, domElement);

      expect(controls._holroydStart).toBeInstanceOf(THREE.Vector2);
      expect(controls._holroydEnd).toBeInstanceOf(THREE.Vector2);
      expect(controls._holroydActive).toBe(false);
      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });

    test('creates controls without domElement', () => {
      const controlsWithoutDom = new CADTrackballControls(camera, null);

      expect(controlsWithoutDom.holroyd).toBe(true);
      expect(controlsWithoutDom._holroydPointerDown).toBeUndefined();
      // Don't dispose - no domElement means parent's disconnect() will fail
    });
  });

  describe('holroyd mode', () => {
    test('can be disabled', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      expect(controls.holroyd).toBe(false);
    });

    test('holroyd pointer down activates tracking for button 0', () => {
      controls = new CADTrackballControls(camera, domElement);

      // Create event and manually set pageX/pageY (happy-dom doesn't support these in constructor)
      const event = new PointerEvent('pointerdown', { button: 0 });
      Object.defineProperty(event, 'pageX', { value: 100 });
      Object.defineProperty(event, 'pageY', { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._holroydActive).toBe(true);
      expect(controls._holroydStart.x).toBe(100);
      expect(controls._holroydStart.y).toBe(100);
    });

    test('holroyd pointer down ignores non-zero buttons', () => {
      controls = new CADTrackballControls(camera, domElement);

      const event = new PointerEvent('pointerdown', { button: 2 });
      Object.defineProperty(event, 'pageX', { value: 100 });
      Object.defineProperty(event, 'pageY', { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._holroydActive).toBe(false);
    });

    test('holroyd pointer down ignores shift key (pan)', () => {
      controls = new CADTrackballControls(camera, domElement);

      // KeyMapper default: shift maps to ctrlKey
      const event = new PointerEvent('pointerdown', {
        button: 0,
        ctrlKey: true, // This is "shift" in KeyMapper default
      });
      Object.defineProperty(event, 'pageX', { value: 100 });
      Object.defineProperty(event, 'pageY', { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._holroydActive).toBe(false);
    });

    test('holroyd pointer move updates end position when active', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydActive = true;

      const event = new PointerEvent('pointermove', {});
      Object.defineProperty(event, 'pageX', { value: 200 });
      Object.defineProperty(event, 'pageY', { value: 150 });
      domElement.dispatchEvent(event);

      expect(controls._holroydEnd.x).toBe(200);
      expect(controls._holroydEnd.y).toBe(150);
    });

    test('holroyd pointer move ignored when not active', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydEnd.set(0, 0);

      const event = new PointerEvent('pointermove', {});
      Object.defineProperty(event, 'pageX', { value: 200 });
      Object.defineProperty(event, 'pageY', { value: 150 });
      domElement.dispatchEvent(event);

      expect(controls._holroydEnd.x).toBe(0);
      expect(controls._holroydEnd.y).toBe(0);
    });

    test('holroyd pointer up resets active state', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydActive = true;
      controls._horizontalRotate = false;
      controls._verticalRotate = false;

      domElement.dispatchEvent(new PointerEvent('pointerup'));

      expect(controls._holroydActive).toBe(false);
      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });

    test('pointercancel also resets state', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls._holroydActive = true;

      domElement.dispatchEvent(new PointerEvent('pointercancel'));

      expect(controls._holroydActive).toBe(false);
    });
  });

  describe('modifier key rotation restrictions', () => {
    test('ctrl key restricts to vertical rotation only', () => {
      controls = new CADTrackballControls(camera, domElement);

      // KeyMapper default: ctrl maps to shiftKey
      const event = new PointerEvent('pointerdown', {
        button: 0,
        shiftKey: true, // This is "ctrl" in KeyMapper default
      });
      Object.defineProperty(event, 'pageX', { value: 100 });
      Object.defineProperty(event, 'pageY', { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(false);
      expect(controls._verticalRotate).toBe(true);
    });

    test('meta key restricts to horizontal rotation only', () => {
      controls = new CADTrackballControls(camera, domElement);

      // KeyMapper default: meta maps to altKey
      const event = new PointerEvent('pointerdown', {
        button: 0,
        altKey: true, // This is "meta" in KeyMapper default
      });
      Object.defineProperty(event, 'pageX', { value: 100 });
      Object.defineProperty(event, 'pageY', { value: 100 });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(false);
    });
  });

  describe('saveState and reset', () => {
    test('saveState saves quaternion', () => {
      controls = new CADTrackballControls(camera, domElement);

      // Change camera quaternion
      camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();
      controls.saveState();

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
      expect(controls.quaternion0.y).toBeCloseTo(camera.quaternion.y);
      expect(controls.quaternion0.z).toBeCloseTo(camera.quaternion.z);
      expect(controls.quaternion0.w).toBeCloseTo(camera.quaternion.w);
    });

    test('reset restores quaternion', () => {
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

  describe('saved state getters', () => {
    test('target0 returns saved target', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.target.set(1, 2, 3);
      controls.saveState();

      expect(controls.target0.x).toBe(1);
      expect(controls.target0.y).toBe(2);
      expect(controls.target0.z).toBe(3);
    });

    test('position0 returns saved position', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.saveState();

      expect(controls.position0).toEqual(camera.position);
    });

    test('zoom0 returns saved zoom', () => {
      controls = new CADTrackballControls(camera, domElement);
      camera.zoom = 2.5;
      controls.saveState();

      expect(controls.zoom0).toBe(2.5);
    });
  });

  describe('rotateX/Y/Z', () => {
    test('rotateX rotates around world X axis', () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.rotateX(Math.PI / 4);

      expect(camera.quaternion.equals(originalQ)).toBe(false);
    });

    test('rotateY rotates around world Y axis', () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.rotateY(Math.PI / 4);

      expect(camera.quaternion.equals(originalQ)).toBe(false);
    });

    test('rotateZ rotates around world Z axis', () => {
      controls = new CADTrackballControls(camera, domElement);
      const originalQ = camera.quaternion.clone();

      controls.rotateZ(Math.PI / 4);

      expect(camera.quaternion.equals(originalQ)).toBe(false);
    });
  });

  describe('update', () => {
    test('update with holroyd=false calls parent update', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      // Should not throw
      controls.update();
    });

    test('update with holroyd=true skips lookAt', () => {
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

  describe('_rotateCamera', () => {
    test('delegates to parent when holroyd=false', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      // Should not throw
      controls._rotateCamera();
    });

    test('no rotation when start equals end', () => {
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

  describe('_panCamera', () => {
    test('delegates to parent when holroyd=false', () => {
      controls = new CADTrackballControls(camera, domElement);
      controls.holroyd = false;

      // Should not throw
      controls._panCamera();
    });

    test('no pan when start equals end', () => {
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

  describe('dispose', () => {
    test('removes event listeners', () => {
      controls = new CADTrackballControls(camera, domElement);
      const removeEventListenerSpy = vi.spyOn(domElement, 'removeEventListener');

      controls.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', controls._holroydPointerDown);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', controls._holroydPointerMove);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerup', controls._holroydPointerUp);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointercancel', controls._holroydPointerUp);
    });
  });
});

// =============================================================================
// CADOrbitControls Tests
// =============================================================================

describe('CADOrbitControls', () => {
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

  describe('constructor', () => {
    test('creates controls with quaternion0', () => {
      controls = new CADOrbitControls(camera, domElement);

      expect(controls.quaternion0).toBeInstanceOf(THREE.Quaternion);
    });

    test('saves initial quaternion', () => {
      camera.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
      controls = new CADOrbitControls(camera, domElement);

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
      expect(controls.quaternion0.y).toBeCloseTo(camera.quaternion.y);
      expect(controls.quaternion0.z).toBeCloseTo(camera.quaternion.z);
      expect(controls.quaternion0.w).toBeCloseTo(camera.quaternion.w);
    });

    test('initializes rotation restriction flags', () => {
      controls = new CADOrbitControls(camera, domElement);

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });
  });

  describe('modifier key rotation restrictions', () => {
    test('ctrl key restricts to vertical rotation only', () => {
      controls = new CADOrbitControls(camera, domElement);

      // KeyMapper default: ctrl maps to shiftKey
      const event = new PointerEvent('pointerdown', {
        button: 0,
        shiftKey: true, // This is "ctrl" in KeyMapper default
      });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(false);
      expect(controls._verticalRotate).toBe(true);
    });

    test('meta key restricts to horizontal rotation only', () => {
      controls = new CADOrbitControls(camera, domElement);

      // KeyMapper default: meta maps to altKey
      const event = new PointerEvent('pointerdown', {
        button: 0,
        altKey: true, // This is "meta" in KeyMapper default
      });
      domElement.dispatchEvent(event);

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(false);
    });

    test('pointer up resets rotation restrictions', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;
      controls._verticalRotate = false;

      domElement.dispatchEvent(new PointerEvent('pointerup'));

      expect(controls._horizontalRotate).toBe(true);
      expect(controls._verticalRotate).toBe(true);
    });

    test('pointercancel resets restrictions', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;

      domElement.dispatchEvent(new PointerEvent('pointercancel'));

      expect(controls._horizontalRotate).toBe(true);
    });
  });

  describe('_rotateLeft and _rotateUp', () => {
    test('_rotateLeft respects horizontal restriction', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;
      const originalTheta = controls._sphericalDelta.theta;

      controls._rotateLeft(0.5);

      expect(controls._sphericalDelta.theta).toBe(originalTheta);
    });

    test('_rotateLeft works when not restricted', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = true;
      const originalTheta = controls._sphericalDelta.theta;

      controls._rotateLeft(0.5);

      expect(controls._sphericalDelta.theta).toBe(originalTheta - 0.5);
    });

    test('_rotateUp respects vertical restriction', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._verticalRotate = false;
      const originalPhi = controls._sphericalDelta.phi;

      controls._rotateUp(0.5);

      expect(controls._sphericalDelta.phi).toBe(originalPhi);
    });

    test('_rotateUp works when not restricted', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._verticalRotate = true;
      const originalPhi = controls._sphericalDelta.phi;

      controls._rotateUp(0.5);

      expect(controls._sphericalDelta.phi).toBe(originalPhi - 0.5);
    });
  });

  describe('public rotateLeft and rotateUp', () => {
    test('rotateLeft bypasses restriction', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._horizontalRotate = false;
      const originalTheta = controls._sphericalDelta.theta;

      controls.rotateLeft(0.5);

      expect(controls._sphericalDelta.theta).toBe(originalTheta - 0.5);
    });

    test('rotateUp bypasses restriction', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls._verticalRotate = false;
      const originalPhi = controls._sphericalDelta.phi;

      controls.rotateUp(0.5);

      expect(controls._sphericalDelta.phi).toBe(originalPhi - 0.5);
    });
  });

  describe('saveState and reset', () => {
    test('saveState saves quaternion', () => {
      controls = new CADOrbitControls(camera, domElement);

      camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();
      controls.saveState();

      expect(controls.quaternion0.x).toBeCloseTo(camera.quaternion.x);
    });

    test('reset restores quaternion', () => {
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

    test('reset dispatches change event', () => {
      controls = new CADOrbitControls(camera, domElement);
      controls.saveState();

      const changeSpy = vi.fn();
      controls.addEventListener('change', changeSpy);

      controls.reset();

      expect(changeSpy).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    test('removes event listeners', () => {
      controls = new CADOrbitControls(camera, domElement);
      const removeEventListenerSpy = vi.spyOn(domElement, 'removeEventListener');

      controls.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', controls._onCADPointerDown);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerup', controls._onCADPointerUp);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointercancel', controls._onCADPointerUp);
    });
  });
});

// =============================================================================
// Controls Wrapper Tests
// =============================================================================

describe('Controls', () => {
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

  describe('constructor', () => {
    test('creates trackball controls', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);

      expect(controls.type).toBe('trackball');
      expect(controls.controls).toBeInstanceOf(CADTrackballControls);
    });

    test('creates orbit controls', () => {
      controls = new Controls('orbit', camera, new THREE.Vector3(), domElement);

      expect(controls.type).toBe('orbit');
      expect(controls.controls).toBeInstanceOf(CADOrbitControls);
    });

    test('applies speed parameters', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement, 2.0, 3.0, 4.0);

      expect(controls.rotateSpeed).toBe(2.0);
      expect(controls.zoomSpeed).toBe(3.0);
      expect(controls.panSpeed).toBe(4.0);
    });

    test('passes holroyd parameter to trackball', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement, 1, 1, 1, false);

      expect(controls.holroyd).toBe(false);
      expect(controls.controls.holroyd).toBe(false);
    });

    test('sets target from array', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(1, 2, 3), domElement);

      expect(controls.controls.target.x).toBe(1);
      expect(controls.controls.target.y).toBe(2);
      expect(controls.controls.target.z).toBe(3);
    });

    test('stores target0 copy', () => {
      const target = new THREE.Vector3(1, 2, 3);
      controls = new Controls('trackball', camera, target, domElement);

      expect(controls.target0).toEqual(new THREE.Vector3(1, 2, 3));
      expect(controls.target0).not.toBe(target); // Should be a copy
    });
  });

  describe('speed normalization', () => {
    test('trackball applies speed factors', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement, 1.0, 1.0, 1.0);

      // Trackball factors: pan: 0.25, rotate: 1.0, zoom: 0.5
      expect(controls.controls.rotateSpeed).toBe(1.0);
      expect(controls.controls.zoomSpeed).toBe(0.5);
      expect(controls.controls.panSpeed).toBe(0.25);
    });

    test('orbit applies speed factors', () => {
      controls = new Controls('orbit', camera, new THREE.Vector3(), domElement, 1.0, 1.0, 1.0);

      // Orbit factors: pan: 1.0, rotate: 1.0, zoom: 1.0
      expect(controls.controls.rotateSpeed).toBe(1.0);
      expect(controls.controls.zoomSpeed).toBe(1.0);
      expect(controls.controls.panSpeed).toBe(1.0);
    });
  });

  describe('setZoomSpeed', () => {
    test('updates zoom speed with factor', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);

      controls.setZoomSpeed(2.0);

      expect(controls.zoomSpeed).toBe(2.0);
      expect(controls.controls.zoomSpeed).toBe(1.0); // 2.0 * 0.5 factor
    });
  });

  describe('setPanSpeed', () => {
    test('updates pan speed with factor', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);

      controls.setPanSpeed(2.0);

      expect(controls.panSpeed).toBe(2.0);
      expect(controls.controls.panSpeed).toBe(0.5); // 2.0 * 0.25 factor
    });
  });

  describe('setRotateSpeed', () => {
    test('updates rotate speed with factor', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);

      controls.setRotateSpeed(2.0);

      expect(controls.rotateSpeed).toBe(2.0);
      expect(controls.controls.rotateSpeed).toBe(2.0); // 2.0 * 1.0 factor
    });
  });

  describe('setHolroydTrackball', () => {
    test('updates holroyd flag on trackball controls', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);

      controls.setHolroydTrackball(false);

      expect(controls.controls.holroyd).toBe(false);
    });
  });

  describe('getTarget and setTarget', () => {
    test('getTarget returns current target', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(1, 2, 3), domElement);

      const target = controls.getTarget();

      expect(target.x).toBe(1);
      expect(target.y).toBe(2);
      expect(target.z).toBe(3);
    });

    test('setTarget updates target', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const newTarget = new THREE.Vector3(5, 6, 7);

      controls.setTarget(newTarget);

      expect(controls.controls.target.x).toBe(5);
      expect(controls.controls.target.y).toBe(6);
      expect(controls.controls.target.z).toBe(7);
    });
  });

  describe('getZoom0', () => {
    test('returns initial zoom value', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      camera.zoom = 2.0;
      controls.saveState();

      expect(controls.getZoom0()).toBe(2.0);
    });
  });

  describe('getResetLocation and setResetLocation', () => {
    test('getResetLocation returns saved state', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
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

    test('setResetLocation updates saved state (orbit)', () => {
      // Use orbit controls as they support zoom0 setter
      controls = new Controls('orbit', camera, new THREE.Vector3(), domElement);

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
  });

  describe('addChangeListener and removeChangeListener', () => {
    test('addChangeListener registers callback', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const callback = vi.fn();

      controls.addChangeListener(callback);

      expect(controls.currentUpdateCallback).toBe(callback);
    });

    test('addChangeListener ignores second callback', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      controls.addChangeListener(callback1);
      controls.addChangeListener(callback2);

      expect(controls.currentUpdateCallback).toBe(callback1);
    });

    test('removeChangeListener clears callback', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const callback = vi.fn();

      controls.addChangeListener(callback);
      controls.removeChangeListener();

      expect(controls.currentUpdateCallback).toBeNull();
    });
  });

  describe('rotateUp and rotateLeft (orbit)', () => {
    test('rotateUp converts degrees to radians', () => {
      controls = new Controls('orbit', camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, 'rotateUp');

      controls.rotateUp(90);

      expect(rotateSpy).toHaveBeenCalledWith(-Math.PI / 2);
    });

    test('rotateLeft converts degrees to radians', () => {
      controls = new Controls('orbit', camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, 'rotateLeft');

      controls.rotateLeft(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });
  });

  describe('rotateX/Y/Z (trackball)', () => {
    test('rotateX converts degrees to radians', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, 'rotateX');

      controls.rotateX(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });

    test('rotateY converts degrees to radians', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, 'rotateY');

      controls.rotateY(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });

    test('rotateZ converts degrees to radians', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const rotateSpy = vi.spyOn(controls.controls, 'rotateZ');

      controls.rotateZ(90);

      expect(rotateSpy).toHaveBeenCalledWith(Math.PI / 2);
    });
  });

  describe('update and reset', () => {
    test('update calls controls.update', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const updateSpy = vi.spyOn(controls.controls, 'update');

      controls.update();

      expect(updateSpy).toHaveBeenCalled();
    });

    test('reset calls controls.reset', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const resetSpy = vi.spyOn(controls.controls, 'reset');

      controls.reset();

      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    test('disposes controls and sets to null', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const disposeSpy = vi.spyOn(controls.controls, 'dispose');

      controls.dispose();

      expect(disposeSpy).toHaveBeenCalled();
      expect(controls.controls).toBeNull();
    });

    test('handles already disposed controls', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      controls.dispose();

      // Should not throw
      controls.dispose();
    });
  });

  describe('setCamera', () => {
    test('updates controls object', () => {
      controls = new Controls('trackball', camera, new THREE.Vector3(), domElement);
      const newCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

      controls.setCamera(newCamera);

      expect(controls.controls.object).toBe(newCamera);
    });
  });
});
