/**
 * Tests for ViewerState class
 * Target: 100% coverage
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ViewerState } from '../../src/core/viewer-state.js';

describe('ViewerState', () => {
  describe('constructor', () => {
    test('creates state with all defaults', () => {
      const state = new ViewerState();

      // Check some display defaults
      expect(state.get('theme')).toBe('light');
      expect(state.get('cadWidth')).toBe(800);
      expect(state.get('tools')).toBe(true);

      // Check render defaults
      expect(state.get('metalness')).toBe(0.3);
      expect(state.get('roughness')).toBe(0.65);

      // Check viewer defaults
      expect(state.get('axes')).toBe(false);
      expect(state.get('ortho')).toBe(true);

      // Check runtime defaults
      expect(state.get('activeTool')).toBeNull();
      expect(state.get('activeTab')).toBe('tree');
    });

    test('applies user options over defaults', () => {
      const state = new ViewerState({
        cadWidth: 1024,
        metalness: 0.5,
        axes: true,
      });

      expect(state.get('cadWidth')).toBe(1024);
      expect(state.get('metalness')).toBe(0.5);
      expect(state.get('axes')).toBe(true);
    });

    test('handles theme="dark"', () => {
      const state = new ViewerState({ theme: 'dark' });
      expect(state.get('theme')).toBe('dark');
    });

    test('handles theme="light"', () => {
      const state = new ViewerState({ theme: 'light' });
      expect(state.get('theme')).toBe('light');
    });

    test('handles theme="browser" with dark preference', () => {
      // Mock window.matchMedia to return dark preference
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });

      const state = new ViewerState({ theme: 'browser' });
      expect(state.get('theme')).toBe('dark');

      window.matchMedia = originalMatchMedia;
    });

    test('handles theme="browser" with light preference', () => {
      // Mock window.matchMedia to return light preference
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      const state = new ViewerState({ theme: 'browser' });
      // When browser prefers light, theme stays as default 'light'
      expect(state.get('theme')).toBe('light');

      window.matchMedia = originalMatchMedia;
    });

    test('warns about unknown options', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      new ViewerState({ unknownOption: 'value' });

      expect(warnSpy).toHaveBeenCalledWith(
        'ViewerState: Unknown option "unknownOption" - ignored'
      );

      warnSpy.mockRestore();
    });
  });

  describe('get/set', () => {
    test('get returns state value', () => {
      const state = new ViewerState();
      expect(state.get('cadWidth')).toBe(800);
    });

    test('set updates state value', () => {
      const state = new ViewerState();
      state.set('cadWidth', 1024);
      expect(state.get('cadWidth')).toBe(1024);
    });

    test('set notifies listeners', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('cadWidth', listener);

      state.set('cadWidth', 1024);

      expect(listener).toHaveBeenCalledWith({ old: 800, new: 1024 });
    });

    test('set skips notification when value unchanged', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('cadWidth', listener);

      state.set('cadWidth', 800); // Same as default

      expect(listener).not.toHaveBeenCalled();
    });

    test('set skips notification for identical arrays', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('grid', listener);

      // Set to identical array
      state.set('grid', [false, false, false]);

      expect(listener).not.toHaveBeenCalled();
    });

    test('set notifies for changed arrays', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('grid', listener);

      state.set('grid', [true, false, false]);

      expect(listener).toHaveBeenCalledWith({
        old: [false, false, false],
        new: [true, false, false],
      });
    });

    test('set respects notify=false', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('cadWidth', listener);

      state.set('cadWidth', 1024, false);

      expect(state.get('cadWidth')).toBe(1024);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('updateRenderState', () => {
    test('updates multiple render values at once', () => {
      const state = new ViewerState();

      state.updateRenderState({
        ambientIntensity: 0.8,
        metalness: 0.5,
      });

      expect(state.get('ambientIntensity')).toBe(0.8);
      expect(state.get('metalness')).toBe(0.5);
    });

    test('notifies for each changed value', () => {
      const state = new ViewerState();
      const intensityListener = vi.fn();
      const metalnessListener = vi.fn();
      state.subscribe('ambientIntensity', intensityListener);
      state.subscribe('metalness', metalnessListener);

      state.updateRenderState({ ambientIntensity: 0.8, metalness: 0.5 });

      expect(intensityListener).toHaveBeenCalled();
      expect(metalnessListener).toHaveBeenCalled();
    });

    test('skips unchanged values', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('metalness', listener);

      state.updateRenderState({ metalness: 0.3 }); // Same as default

      expect(listener).not.toHaveBeenCalled();
    });

    test('respects notify=false', () => {
      const state = new ViewerState();
      const listener = vi.fn();
      state.subscribe('metalness', listener);

      state.updateRenderState({ metalness: 0.5 }, false);

      expect(state.get('metalness')).toBe(0.5);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('updateViewerState', () => {
    test('updates viewer values', () => {
      const state = new ViewerState();

      state.updateViewerState({
        axes: true,
        ortho: false,
      });

      expect(state.get('axes')).toBe(true);
      expect(state.get('ortho')).toBe(false);
    });

    test('converts Vector3Tuple to THREE.Vector3', () => {
      const state = new ViewerState();

      state.updateViewerState({
        clipNormal0: [1, 0, 0],
        position: [10, 20, 30],
      });

      const clipNormal = state.get('clipNormal0');
      const position = state.get('position');

      expect(clipNormal.x).toBe(1);
      expect(clipNormal.y).toBe(0);
      expect(clipNormal.z).toBe(0);

      expect(position.x).toBe(10);
      expect(position.y).toBe(20);
      expect(position.z).toBe(30);
    });

    test('converts QuaternionTuple to THREE.Quaternion', () => {
      const state = new ViewerState();

      state.updateViewerState({
        quaternion: [0, 0, 0, 1],
      });

      const quaternion = state.get('quaternion');

      expect(quaternion.x).toBe(0);
      expect(quaternion.y).toBe(0);
      expect(quaternion.z).toBe(0);
      expect(quaternion.w).toBe(1);
    });

    test('handles null position/quaternion/target', () => {
      const state = new ViewerState();
      state.set('position', { x: 1, y: 2, z: 3 }); // Set non-null first

      state.updateViewerState({
        position: null,
      });

      expect(state.get('position')).toBeNull();
    });
  });

  describe('getAll', () => {
    test('returns copy of all state', () => {
      const state = new ViewerState({ cadWidth: 1024 });
      const all = state.getAll();

      expect(all.cadWidth).toBe(1024);
      expect(all.theme).toBe('light');

      // Verify it's a copy
      all.cadWidth = 2048;
      expect(state.get('cadWidth')).toBe(1024);
    });
  });

  describe('subscribe', () => {
    test('subscribes to specific key', () => {
      const state = new ViewerState();
      const listener = vi.fn();

      state.subscribe('cadWidth', listener);
      state.set('cadWidth', 1024);

      expect(listener).toHaveBeenCalledWith({ old: 800, new: 1024 });
    });

    test('immediate option invokes listener immediately', () => {
      const state = new ViewerState();
      const listener = vi.fn();

      state.subscribe('cadWidth', listener, { immediate: true });

      expect(listener).toHaveBeenCalledWith({ old: undefined, new: 800 });
    });

    test('returns unsubscribe function', () => {
      const state = new ViewerState();
      const listener = vi.fn();

      const unsubscribe = state.subscribe('cadWidth', listener);
      unsubscribe();
      state.set('cadWidth', 1024);

      expect(listener).not.toHaveBeenCalled();
    });

    test('multiple listeners for same key', () => {
      const state = new ViewerState();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      state.subscribe('cadWidth', listener1);
      state.subscribe('cadWidth', listener2);
      state.set('cadWidth', 1024);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('subscribeAll', () => {
    test('subscribes to all state changes', () => {
      const state = new ViewerState();
      const listener = vi.fn();

      state.subscribeAll(listener);
      state.set('cadWidth', 1024);
      state.set('axes', true);

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith('cadWidth', { old: 800, new: 1024 });
      expect(listener).toHaveBeenCalledWith('axes', { old: false, new: true });
    });

    test('returns unsubscribe function', () => {
      const state = new ViewerState();
      const listener = vi.fn();

      const unsubscribe = state.subscribeAll(listener);
      unsubscribe();
      state.set('cadWidth', 1024);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    test('resets all values to defaults', () => {
      const state = new ViewerState();
      state.set('cadWidth', 1024);
      state.set('axes', true);
      state.set('theme', 'dark');

      state.reset();

      expect(state.get('cadWidth')).toBe(800);
      expect(state.get('axes')).toBe(false);
      expect(state.get('theme')).toBe('light');
    });

    test('reset applies new options', () => {
      const state = new ViewerState();
      state.set('cadWidth', 1024);

      state.reset({ cadWidth: 640, axes: true });

      expect(state.get('cadWidth')).toBe(640);
      expect(state.get('axes')).toBe(true);
    });

    test('reset handles theme="dark"', () => {
      const state = new ViewerState();

      state.reset({ theme: 'dark' });

      expect(state.get('theme')).toBe('dark');
    });

    test('reset handles theme="light"', () => {
      const state = new ViewerState({ theme: 'dark' });

      state.reset({ theme: 'light' });

      expect(state.get('theme')).toBe('light');
    });

    test('reset handles theme="browser" with dark preference', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockReturnValue({ matches: true });

      const state = new ViewerState();
      state.reset({ theme: 'browser' });

      expect(state.get('theme')).toBe('dark');

      window.matchMedia = originalMatchMedia;
    });

    test('reset notifies listeners of changes', () => {
      const state = new ViewerState();
      state.set('cadWidth', 1024, false); // Change without notify
      const listener = vi.fn();
      state.subscribe('cadWidth', listener);

      state.reset();

      expect(listener).toHaveBeenCalledWith({ old: 1024, new: 800 });
    });

    test('reset ignores unknown options', () => {
      const state = new ViewerState();

      // Should not throw
      state.reset({ unknownOption: 'value' });
    });
  });

  describe('getDefaults', () => {
    test('returns all default values', () => {
      const defaults = ViewerState.getDefaults();

      // Check display defaults
      expect(defaults.theme).toBe('light');
      expect(defaults.cadWidth).toBe(800);

      // Check render defaults
      expect(defaults.metalness).toBe(0.3);

      // Check viewer defaults
      expect(defaults.axes).toBe(false);

      // Check zebra defaults
      expect(defaults.zebraCount).toBe(9);

      // Check runtime defaults
      expect(defaults.activeTool).toBeNull();
    });

    test('returns a fresh object each call', () => {
      const defaults1 = ViewerState.getDefaults();
      const defaults2 = ViewerState.getDefaults();

      expect(defaults1).not.toBe(defaults2);
      expect(defaults1).toEqual(defaults2);
    });
  });

  describe('dump', () => {
    test('logs all state values by category', () => {
      const state = new ViewerState();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      state.dump();

      // Should have category headers
      expect(logSpy).toHaveBeenCalledWith('Display:');
      expect(logSpy).toHaveBeenCalledWith('Render:');
      expect(logSpy).toHaveBeenCalledWith('View:');
      expect(logSpy).toHaveBeenCalledWith('Zebra:');
      expect(logSpy).toHaveBeenCalledWith('Runtime:');

      // Should log actual values
      expect(logSpy).toHaveBeenCalledWith('- theme', 'light');
      expect(logSpy).toHaveBeenCalledWith('- cadWidth', 800);

      logSpy.mockRestore();
    });
  });

  describe('static defaults', () => {
    test('DISPLAY_DEFAULTS has expected keys', () => {
      expect(ViewerState.DISPLAY_DEFAULTS).toHaveProperty('theme');
      expect(ViewerState.DISPLAY_DEFAULTS).toHaveProperty('cadWidth');
      expect(ViewerState.DISPLAY_DEFAULTS).toHaveProperty('tools');
    });

    test('RENDER_DEFAULTS has expected keys', () => {
      expect(ViewerState.RENDER_DEFAULTS).toHaveProperty('metalness');
      expect(ViewerState.RENDER_DEFAULTS).toHaveProperty('roughness');
      expect(ViewerState.RENDER_DEFAULTS).toHaveProperty('edgeColor');
    });

    test('VIEWER_DEFAULTS has expected keys', () => {
      expect(ViewerState.VIEWER_DEFAULTS).toHaveProperty('axes');
      expect(ViewerState.VIEWER_DEFAULTS).toHaveProperty('ortho');
      expect(ViewerState.VIEWER_DEFAULTS).toHaveProperty('grid');
    });

    test('ZEBRA_DEFAULTS has expected keys', () => {
      expect(ViewerState.ZEBRA_DEFAULTS).toHaveProperty('zebraCount');
      expect(ViewerState.ZEBRA_DEFAULTS).toHaveProperty('zebraOpacity');
    });

    test('RUNTIME_DEFAULTS has expected keys', () => {
      expect(ViewerState.RUNTIME_DEFAULTS).toHaveProperty('activeTool');
      expect(ViewerState.RUNTIME_DEFAULTS).toHaveProperty('activeTab');
    });
  });
});
