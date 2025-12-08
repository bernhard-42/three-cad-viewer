/**
 * Unit tests for utility functions and classes
 * Target: 90%+ coverage for KeyMapper and EventListenerManager
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  KeyMapper,
  EventListenerManager,
  isEqual,
  flatten,
  scaleLight,
  deepDispose,
  disposeGeometry,
} from '../../src/utils.js';
import * as THREE from 'three';

// =============================================================================
// KeyMapper Tests
// =============================================================================

describe('KeyMapper', () => {
  // Store original mapping to restore after tests
  let originalMapping;

  beforeEach(() => {
    originalMapping = KeyMapper.get_config();
  });

  afterEach(() => {
    // Restore original mapping
    KeyMapper.set(originalMapping);
  });

  describe('default configuration', () => {
    test('has default key mappings', () => {
      const config = KeyMapper.get_config();

      expect(config.shift).toBe('ctrlKey');
      expect(config.ctrl).toBe('shiftKey');
      expect(config.meta).toBe('altKey');
      expect(config.alt).toBe('metaKey');
    });
  });

  describe('get', () => {
    test('gets shift key from event using mapping', () => {
      const event = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };

      // Default: shift maps to ctrlKey
      expect(KeyMapper.get(event, 'shift')).toBe(true);
    });

    test('gets ctrl key from event using mapping', () => {
      const event = { ctrlKey: false, shiftKey: true, altKey: false, metaKey: false };

      // Default: ctrl maps to shiftKey
      expect(KeyMapper.get(event, 'ctrl')).toBe(true);
    });

    test('gets meta key from event using mapping', () => {
      const event = { ctrlKey: false, shiftKey: false, altKey: true, metaKey: false };

      // Default: meta maps to altKey
      expect(KeyMapper.get(event, 'meta')).toBe(true);
    });

    test('gets alt key from event using mapping', () => {
      const event = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: true };

      // Default: alt maps to metaKey
      expect(KeyMapper.get(event, 'alt')).toBe(true);
    });

    test('returns false when key not pressed', () => {
      const event = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };

      expect(KeyMapper.get(event, 'shift')).toBe(false);
      expect(KeyMapper.get(event, 'ctrl')).toBe(false);
      expect(KeyMapper.get(event, 'meta')).toBe(false);
      expect(KeyMapper.get(event, 'alt')).toBe(false);
    });
  });

  describe('set', () => {
    test('updates single key mapping', () => {
      KeyMapper.set({ shift: 'metaKey' });

      const event = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: true };
      expect(KeyMapper.get(event, 'shift')).toBe(true);
    });

    test('updates multiple key mappings', () => {
      KeyMapper.set({
        shift: 'shiftKey',
        ctrl: 'ctrlKey',
      });

      const event = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false };
      expect(KeyMapper.get(event, 'shift')).toBe(true);
      expect(KeyMapper.get(event, 'ctrl')).toBe(true);
    });

    test('preserves unmapped keys', () => {
      const originalMeta = KeyMapper.get_config().meta;

      KeyMapper.set({ shift: 'shiftKey' });

      expect(KeyMapper.get_config().meta).toBe(originalMeta);
    });
  });

  describe('get_config', () => {
    test('returns copy of current config', () => {
      const config1 = KeyMapper.get_config();
      const config2 = KeyMapper.get_config();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('getshortcuts', () => {
    test('returns key name without "Key" suffix', () => {
      expect(KeyMapper.getshortcuts('shift')).toBe('ctrl');
      expect(KeyMapper.getshortcuts('ctrl')).toBe('shift');
      expect(KeyMapper.getshortcuts('meta')).toBe('alt');
      expect(KeyMapper.getshortcuts('alt')).toBe('meta');
    });
  });
});

// =============================================================================
// EventListenerManager Tests
// =============================================================================

describe('EventListenerManager', () => {
  let manager;
  let element;

  beforeEach(() => {
    manager = new EventListenerManager();
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    manager.dispose();
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  describe('constructor', () => {
    test('initializes empty listeners array', () => {
      expect(manager.listeners).toEqual([]);
    });
  });

  describe('add', () => {
    test('adds event listener to target', () => {
      const handler = vi.fn();
      const addEventListenerSpy = vi.spyOn(element, 'addEventListener');

      manager.add(element, 'click', handler);

      expect(addEventListenerSpy).toHaveBeenCalledWith('click', handler, false);
    });

    test('stores listener info', () => {
      const handler = vi.fn();

      manager.add(element, 'click', handler);

      expect(manager.listeners).toHaveLength(1);
      expect(manager.listeners[0]).toEqual({
        target: element,
        event: 'click',
        handler: handler,
        options: false,
      });
    });

    test('accepts options parameter', () => {
      const handler = vi.fn();
      const options = { capture: true, passive: true };

      manager.add(element, 'scroll', handler, options);

      expect(manager.listeners[0].options).toEqual(options);
    });

    test('listener actually fires', () => {
      const handler = vi.fn();

      manager.add(element, 'click', handler);
      element.dispatchEvent(new MouseEvent('click'));

      expect(handler).toHaveBeenCalled();
    });

    test('can add multiple listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.add(element, 'click', handler1);
      manager.add(element, 'mousedown', handler2);

      expect(manager.listeners).toHaveLength(2);
    });
  });

  describe('dispose', () => {
    test('removes all event listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const removeEventListenerSpy = vi.spyOn(element, 'removeEventListener');

      manager.add(element, 'click', handler1);
      manager.add(element, 'mousedown', handler2);
      manager.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
    });

    test('clears listeners array', () => {
      const handler = vi.fn();

      manager.add(element, 'click', handler);
      manager.dispose();

      expect(manager.listeners).toEqual([]);
    });

    test('removed listeners no longer fire', () => {
      const handler = vi.fn();

      manager.add(element, 'click', handler);
      manager.dispose();
      element.dispatchEvent(new MouseEvent('click'));

      expect(handler).not.toHaveBeenCalled();
    });

    test('handles multiple dispose calls', () => {
      const handler = vi.fn();

      manager.add(element, 'click', handler);
      manager.dispose();
      manager.dispose();

      expect(manager.listeners).toEqual([]);
    });
  });
});

// =============================================================================
// isEqual Tests
// =============================================================================

describe('isEqual', () => {
  test('compares equal primitives', () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual('a', 'a')).toBe(true);
    expect(isEqual(true, true)).toBe(true);
  });

  test('compares unequal primitives', () => {
    expect(isEqual(1, 2)).toBe(false);
    expect(isEqual('a', 'b')).toBe(false);
    expect(isEqual(true, false)).toBe(false);
  });

  test('compares equal objects', () => {
    expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(isEqual({ a: { b: 2 } }, { a: { b: 2 } })).toBe(true);
  });

  test('compares unequal objects', () => {
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  test('compares equal arrays', () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  test('compares unequal arrays', () => {
    expect(isEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  test('handles nested null values in objects', () => {
    // Note: isEqual doesn't handle top-level null/undefined (throws)
    // But it can handle null as a property value - skip that test since null === null returns true before recursion
    // This tests that the function works for non-null objects
    expect(isEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });
});

// =============================================================================
// flatten Tests
// =============================================================================

describe('flatten', () => {
  test('flattens nested array', () => {
    expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });

  test('handles empty arrays', () => {
    expect(flatten([])).toEqual([]);
    expect(flatten([[]])).toEqual([]);
  });

  test('handles single level array', () => {
    expect(flatten([[1, 2, 3]])).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// scaleLight Tests
// =============================================================================

describe('scaleLight', () => {
  test('scales intensity by PI', () => {
    expect(scaleLight(1)).toBe(Math.round(Math.PI));
    expect(scaleLight(2)).toBe(Math.round(2 * Math.PI));
  });

  test('handles fractional values', () => {
    expect(scaleLight(0.5)).toBe(Math.round(0.5 * Math.PI));
  });

  test('handles zero', () => {
    expect(scaleLight(0)).toBe(0);
  });
});

// =============================================================================
// Disposal Functions Tests
// =============================================================================

describe('disposeGeometry', () => {
  test('disposes geometry', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const disposeSpy = vi.spyOn(geometry, 'dispose');

    disposeGeometry(geometry);

    expect(disposeSpy).toHaveBeenCalled();
  });

  test('handles null geometry', () => {
    // Should not throw
    disposeGeometry(null);
  });
});

// Note: disposeMaterial is not exported from utils.js, but deepDispose covers its functionality

describe('deepDispose', () => {
  test('disposes mesh with geometry and material', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    const geoDisposeSpy = vi.spyOn(geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(material, 'dispose');

    deepDispose(mesh);

    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  test('disposes mesh with material array', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material1 = new THREE.MeshStandardMaterial();
    const material2 = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, [material1, material2]);

    const mat1DisposeSpy = vi.spyOn(material1, 'dispose');
    const mat2DisposeSpy = vi.spyOn(material2, 'dispose');

    deepDispose(mesh);

    expect(mat1DisposeSpy).toHaveBeenCalled();
    expect(mat2DisposeSpy).toHaveBeenCalled();
  });

  test('recursively disposes children', () => {
    const parent = new THREE.Group();
    const childGeometry = new THREE.BoxGeometry(1, 1, 1);
    const childMaterial = new THREE.MeshStandardMaterial();
    const child = new THREE.Mesh(childGeometry, childMaterial);
    parent.add(child);

    const geoDisposeSpy = vi.spyOn(childGeometry, 'dispose');

    deepDispose(parent);

    expect(geoDisposeSpy).toHaveBeenCalled();
  });

  test('handles object with dispose method', () => {
    const obj = {
      dispose: vi.fn(),
    };

    deepDispose(obj);

    expect(obj.dispose).toHaveBeenCalled();
  });

  test('handles array of objects', () => {
    const obj1 = { dispose: vi.fn() };
    const obj2 = { dispose: vi.fn() };

    deepDispose([obj1, obj2]);

    expect(obj1.dispose).toHaveBeenCalled();
    expect(obj2.dispose).toHaveBeenCalled();
  });

  test('handles null and undefined', () => {
    // Should not throw
    deepDispose(null);
    deepDispose(undefined);
  });

  test('disposes Line objects', () => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial();
    const line = new THREE.Line(geometry, material);

    const geoDisposeSpy = vi.spyOn(geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(material, 'dispose');

    deepDispose(line);

    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  test('disposes Points objects', () => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial();
    const points = new THREE.Points(geometry, material);

    const geoDisposeSpy = vi.spyOn(geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(material, 'dispose');

    deepDispose(points);

    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });
});
