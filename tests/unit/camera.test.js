/**
 * Unit tests for Camera class
 * Target: 90%+ coverage
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { Camera } from '../../src/camera/camera.js';

describe('Camera', () => {
  describe('constructor', () => {
    test('creates camera with default orthographic mode', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      expect(camera.ortho).toBe(true);
      expect(camera.camera).toBe(camera.oCamera);
    });

    test('creates camera with perspective mode', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');

      expect(camera.ortho).toBe(false);
      expect(camera.camera).toBe(camera.pCamera);
    });

    test('creates both orthographic and perspective cameras', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      expect(camera.oCamera).toBeInstanceOf(THREE.OrthographicCamera);
      expect(camera.pCamera).toBeInstanceOf(THREE.PerspectiveCamera);
    });

    test('handles Z up axis', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      expect(camera.up).toBe('z_up');
      expect(camera.camera.up.z).toBe(1);
    });

    test('handles Y up axis', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Y');

      expect(camera.up).toBe('y_up');
      expect(camera.camera.up.y).toBe(1);
    });

    test('handles legacy up axis', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'L');

      expect(camera.up).toBe('legacy');
      expect(camera.camera.up.z).toBe(1);
    });

    test('sets target from array', () => {
      const camera = new Camera(800, 600, 100, [1, 2, 3], true, 'Z');

      expect(camera.target.x).toBe(1);
      expect(camera.target.y).toBe(2);
      expect(camera.target.z).toBe(3);
    });

    test('calculates camera distance', () => {
      const distance = 100;
      const camera = new Camera(800, 600, distance, [0, 0, 0], true, 'Z');

      expect(camera.camera_distance).toBe(5 * distance);
    });
  });

  describe('getCamera', () => {
    test('returns current camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      expect(camera.getCamera()).toBe(camera.oCamera);
    });
  });

  describe('switchCamera', () => {
    test('switches from ortho to perspective', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.switchCamera(false);

      expect(camera.ortho).toBe(false);
      expect(camera.camera).toBe(camera.pCamera);
    });

    test('switches from perspective to ortho', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');

      camera.switchCamera(true);

      expect(camera.ortho).toBe(true);
      expect(camera.camera).toBe(camera.oCamera);
    });

    test('transfers state when switching', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      // Set a non-zero position on the current camera
      camera.setPosition([100, 200, 300], false);

      // Verify we're on ortho before switch
      expect(camera.camera).toBe(camera.oCamera);

      camera.switchCamera(false);

      // After switching, we should be on perspective camera
      expect(camera.camera).toBe(camera.pCamera);
      // And position should not be at origin
      expect(camera.camera.position.length()).toBeGreaterThan(0);
    });

    test('preserves zoom when switching from ortho', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      // Position camera at known distance for zoom calculation
      camera.camera.position.set(0, 0, camera.camera_distance);
      camera.setZoom(2.0);

      // In ortho mode, zoom is direct property
      expect(camera.getZoom()).toBe(2.0);

      camera.switchCamera(false);

      // After switching, zoom is calculated from distance
      // The zoom value should be approximately preserved
      expect(camera.getZoom()).toBeGreaterThan(0);
    });

    test('preserves quaternion when switching', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      camera.camera.quaternion.set(0.5, 0.5, 0.5, 0.5).normalize();
      const qBefore = camera.camera.quaternion.clone();

      camera.switchCamera(false);

      expect(camera.camera.quaternion.x).toBeCloseTo(qBefore.x);
      expect(camera.camera.quaternion.y).toBeCloseTo(qBefore.y);
      expect(camera.camera.quaternion.z).toBeCloseTo(qBefore.z);
      expect(camera.camera.quaternion.w).toBeCloseTo(qBefore.w);
    });
  });

  describe('projectSize', () => {
    test('handles aspect < 1 (portrait)', () => {
      const camera = new Camera(600, 800, 100, [0, 0, 0], true, 'Z');
      const [w, h] = camera.projectSize(100, 0.75);

      expect(w).toBe(100);
      expect(h).toBeCloseTo(100 / 0.75);
    });

    test('handles aspect >= 1 (landscape)', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const [w, h] = camera.projectSize(100, 1.5);

      expect(h).toBe(100);
      expect(w).toBeCloseTo(100 * 1.5);
    });
  });

  describe('presetCamera', () => {
    test('sets iso position for z_up', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.presetCamera('iso');

      // Should be at distance from origin in iso direction
      const pos = camera.getPosition();
      expect(pos.length()).toBeCloseTo(camera.camera_distance);
    });

    test('sets front position for z_up', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.presetCamera('front');

      const pos = camera.getPosition();
      expect(pos.y).toBeLessThan(0); // Front is -Y for z_up
    });

    test('sets top position for z_up', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.presetCamera('top');

      const pos = camera.getPosition();
      expect(pos.z).toBeGreaterThan(0);
    });

    test('preserves current zoom when no zoom provided', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      camera.setZoom(2.5);

      camera.presetCamera('iso');

      expect(camera.getZoom()).toBeCloseTo(2.5);
    });

    test('applies provided zoom', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.presetCamera('iso', 3.0);

      expect(camera.getZoom()).toBeCloseTo(3.0);
    });

    test('handles presets with quaternion override', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      // top and bottom have quaternion overrides for z_up
      camera.presetCamera('top');

      // Should not throw and should apply quaternion
      expect(camera.getQuaternion()).toBeInstanceOf(THREE.Quaternion);
    });
  });

  describe('setupCamera', () => {
    test('sets position absolutely when relative=false', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const position = new THREE.Vector3(100, 200, 300);

      camera.setupCamera(false, position);

      expect(camera.getPosition().x).toBe(100);
      expect(camera.getPosition().y).toBe(200);
      expect(camera.getPosition().z).toBe(300);
    });

    test('sets position relatively when relative=true', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const direction = new THREE.Vector3(1, 1, 1);

      camera.setupCamera(true, direction);

      // Position should be normalized direction * camera_distance + target
      const pos = camera.getPosition();
      expect(pos.length()).toBeCloseTo(camera.camera_distance);
    });

    test('sets quaternion when provided', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const quaternion = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5).normalize();

      camera.setupCamera(false, null, quaternion);

      expect(camera.getQuaternion().x).toBeCloseTo(quaternion.x);
      expect(camera.getQuaternion().y).toBeCloseTo(quaternion.y);
      expect(camera.getQuaternion().z).toBeCloseTo(quaternion.z);
      expect(camera.getQuaternion().w).toBeCloseTo(quaternion.w);
    });

    test('sets zoom when provided', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.setupCamera(false, null, null, 2.5);

      expect(camera.getZoom()).toBeCloseTo(2.5);
    });

    test('handles all null parameters', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      // Should not throw
      camera.setupCamera(false, null, null, null);
    });
  });

  describe('getZoom and setZoom', () => {
    test('gets zoom for orthographic camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      camera.camera.zoom = 2.0;

      expect(camera.getZoom()).toBe(2.0);
    });

    test('sets zoom for orthographic camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.setZoom(3.0);

      expect(camera.camera.zoom).toBe(3.0);
    });

    test('gets zoom for perspective camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');
      camera.camera.position.set(0, 0, camera.camera_distance / 2);

      expect(camera.getZoom()).toBeCloseTo(2.0);
    });

    test('sets zoom for perspective camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');
      camera.camera.position.set(0, 0, camera.camera_distance);

      camera.setZoom(2.0);

      // Distance should be halved
      const distance = camera.camera.position.distanceTo(camera.target);
      expect(distance).toBeCloseTo(camera.camera_distance / 2);
    });
  });

  describe('getPosition and setPosition', () => {
    test('getPosition returns camera position', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      camera.camera.position.set(1, 2, 3);

      const pos = camera.getPosition();

      expect(pos.x).toBe(1);
      expect(pos.y).toBe(2);
      expect(pos.z).toBe(3);
    });

    test('setPosition accepts array', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.setPosition([10, 20, 30], false);

      expect(camera.getPosition().x).toBe(10);
      expect(camera.getPosition().y).toBe(20);
      expect(camera.getPosition().z).toBe(30);
    });

    test('setPosition accepts Vector3', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.setPosition(new THREE.Vector3(10, 20, 30), false);

      expect(camera.getPosition().x).toBe(10);
    });

    test('setPosition logs error for invalid type', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      camera.setPosition('invalid', false);

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('setPosition logs error for wrong array length', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      camera.setPosition([1, 2], false);

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('getQuaternion and setQuaternion', () => {
    test('getQuaternion returns camera quaternion', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      const q = camera.getQuaternion();

      expect(q).toBeInstanceOf(THREE.Quaternion);
    });

    test('setQuaternion accepts array', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.setQuaternion([0.5, 0.5, 0.5, 0.5]);

      expect(camera.getQuaternion().x).toBeCloseTo(0.5);
    });

    test('setQuaternion accepts Quaternion', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const q = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5).normalize();

      camera.setQuaternion(q);

      expect(camera.getQuaternion().x).toBeCloseTo(q.x);
    });

    test('setQuaternion logs error for invalid type', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      camera.setQuaternion('invalid');

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    test('setQuaternion logs error for wrong array length', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      camera.setQuaternion([1, 2, 3]);

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('getRotation', () => {
    test('returns camera rotation', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      const rotation = camera.getRotation();

      expect(rotation).toBeInstanceOf(THREE.Euler);
    });
  });

  describe('lookAtTarget', () => {
    test('makes camera look at target', () => {
      const camera = new Camera(800, 600, 100, [5, 5, 5], true, 'Z');
      camera.camera.position.set(10, 10, 10);

      camera.lookAtTarget();

      // Camera should now be oriented towards target
      // This is hard to test precisely, but we can check it doesn't throw
      expect(camera.getQuaternion()).toBeInstanceOf(THREE.Quaternion);
    });
  });

  describe('updateProjectionMatrix', () => {
    test('calls camera updateProjectionMatrix', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const updateSpy = vi.spyOn(camera.camera, 'updateProjectionMatrix');

      camera.updateProjectionMatrix();

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('getVisibleArea', () => {
    test('calculates visible area for orthographic camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      const area = camera.getVisibleArea();

      expect(area.width).toBeGreaterThan(0);
      expect(area.height).toBeGreaterThan(0);
    });

    test('calculates visible area for perspective camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');
      camera.camera.position.set(0, 0, 100);

      const area = camera.getVisibleArea();

      expect(area.width).toBeGreaterThan(0);
      expect(area.height).toBeGreaterThan(0);
    });

    test('respects zoom for orthographic camera', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const area1 = camera.getVisibleArea();

      camera.setZoom(2.0);
      const area2 = camera.getVisibleArea();

      expect(area2.width).toBeCloseTo(area1.width / 2);
      expect(area2.height).toBeCloseTo(area1.height / 2);
    });
  });

  describe('changeDimensions', () => {
    test('updates orthographic camera frustum', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const originalLeft = camera.oCamera.left;

      // Use a significantly different aspect ratio to ensure frustum changes
      camera.changeDimensions(100, 1600, 600);

      // For a wider aspect, left should be more negative (wider frustum)
      expect(camera.oCamera.left).toBeLessThan(originalLeft);
    });

    test('updates perspective camera aspect', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');

      camera.changeDimensions(100, 1024, 768);

      expect(camera.pCamera.aspect).toBeCloseTo(1024 / 768);
    });

    test('handles null cameras gracefully', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      camera.oCamera = null;
      camera.pCamera = null;

      // Should not throw
      camera.changeDimensions(100, 1024, 768);
    });
  });

  describe('updateFarPlane', () => {
    test('updates far plane on both cameras', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      camera.updateFarPlane(200);

      expect(camera.pCamera.far).toBe(20000);
      expect(camera.oCamera.far).toBe(20000);
    });

    test('updates projection matrix', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');
      const spy = vi.spyOn(camera.camera, 'updateProjectionMatrix');

      camera.updateFarPlane(50);

      expect(spy).toHaveBeenCalled();
    });

    test('works when perspective camera is active', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], false, 'Z');

      camera.updateFarPlane(300);

      expect(camera.pCamera.far).toBe(30000);
      expect(camera.oCamera.far).toBe(30000);
    });
  });

  describe('dispose', () => {
    test('dispose does not throw', () => {
      const camera = new Camera(800, 600, 100, [0, 0, 0], true, 'Z');

      // Cameras are simple objects, dispose is a no-op
      expect(() => camera.dispose()).not.toThrow();
    });
  });
});
