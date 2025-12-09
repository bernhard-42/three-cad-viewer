/**
 * Comprehensive tests for Animation class
 * Target: 80%+ coverage for TypeScript migration safety
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Animation } from '../../src/scene/animation.js';

describe('Animation - Constructor', () => {
  test('creates Animation with delimiter', () => {
    const anim = new Animation('|');

    expect(anim.delim).toBe('|');
    expect(anim.tracks).toEqual([]);
    expect(anim.mixer).toBeNull();
    expect(anim.clip).toBeNull();
    expect(anim.clipAction).toBeNull();
    expect(anim.clock).toBeDefined();
    expect(anim._backup).toBeNull();
    expect(anim.root).toBeNull();
  });

  test('creates Animation with different delimiter', () => {
    const anim = new Animation('/');
    expect(anim.delim).toBe('/');
  });
});

describe('Animation - addPositionTrack', () => {
  let anim;
  let mockGroup;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.position.set(0, 0, 0);
  });

  test('adds position track with full 3D translation', () => {
    anim.addPositionTrack('object/part', mockGroup, [0, 1], [[0, 0, 0], [1, 2, 3]]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object|part.position');
  });

  test('replaces / with delimiter in selector', () => {
    anim.addPositionTrack('root/child/part', mockGroup, [0, 1], [[0, 0, 0], [1, 1, 1]]);

    expect(anim.tracks[0].name).toBe('root|child|part.position');
  });

  test('logs error for mismatched times/positions length', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    anim.addPositionTrack('object', mockGroup, [0, 1, 2], [[0, 0, 0], [1, 1, 1]]);

    expect(consoleSpy).toHaveBeenCalled();
    expect(anim.tracks.length).toBe(0);

    consoleSpy.mockRestore();
  });
});

describe('Animation - addTranslationTrack', () => {
  let anim;
  let mockGroup;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.position.set(0, 0, 0);
  });

  test('adds translation track for x axis', () => {
    anim.addTranslationTrack('object', mockGroup, 'x', [0, 1], [0, 5]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.position');
  });

  test('adds translation track for y axis', () => {
    anim.addTranslationTrack('object', mockGroup, 'y', [0, 1], [0, 5]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.position');
  });

  test('adds translation track for z axis', () => {
    anim.addTranslationTrack('object', mockGroup, 'z', [0, 1], [0, 5]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.position');
  });

  test('logs error for mismatched times/values length', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    anim.addTranslationTrack('object', mockGroup, 'x', [0, 1, 2], [0, 5]);

    expect(consoleSpy).toHaveBeenCalled();
    expect(anim.tracks.length).toBe(0);

    consoleSpy.mockRestore();
  });
});

describe('Animation - addRotationTrack', () => {
  let anim;
  let mockGroup;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.quaternion.set(0, 0, 0, 1);
  });

  test('adds rotation track for x axis', () => {
    anim.addRotationTrack('object', mockGroup, 'x', [0, 1], [0, 90]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.quaternion');
  });

  test('adds rotation track for y axis', () => {
    anim.addRotationTrack('object', mockGroup, 'y', [0, 1], [0, 90]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.quaternion');
  });

  test('adds rotation track for z axis', () => {
    anim.addRotationTrack('object', mockGroup, 'z', [0, 1], [0, 90]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.quaternion');
  });

  test('logs error for mismatched times/angles length', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    anim.addRotationTrack('object', mockGroup, 'z', [0, 1, 2], [0, 90]);

    expect(consoleSpy).toHaveBeenCalled();
    expect(anim.tracks.length).toBe(0);

    consoleSpy.mockRestore();
  });
});

describe('Animation - addQuaternionTrack', () => {
  let anim;
  let mockGroup;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.quaternion.set(0, 0, 0, 1);
  });

  test('adds quaternion track', () => {
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);

    anim.addQuaternionTrack('object', mockGroup, [0, 1], [
      [0, 0, 0, 1],
      [q.x, q.y, q.z, q.w]
    ]);

    expect(anim.tracks.length).toBe(1);
    expect(anim.tracks[0].name).toBe('object.quaternion');
  });

  test('logs error for mismatched times/quaternions length', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    anim.addQuaternionTrack('object', mockGroup, [0, 1, 2], [[0, 0, 0, 1]]);

    expect(consoleSpy).toHaveBeenCalled();
    expect(anim.tracks.length).toBe(0);

    consoleSpy.mockRestore();
  });
});

describe('Animation - Multiple Tracks', () => {
  test('adds multiple tracks of different types', () => {
    const anim = new Animation('|');
    const mockGroup = new THREE.Object3D();

    anim.addTranslationTrack('obj1', mockGroup, 'x', [0, 1], [0, 5]);
    anim.addTranslationTrack('obj2', mockGroup, 'y', [0, 1], [0, 3]);
    anim.addRotationTrack('obj3', mockGroup, 'z', [0, 1], [0, 90]);

    expect(anim.tracks.length).toBe(3);
  });
});

describe('Animation - Backup & Restore', () => {
  let anim;
  let mockGroup;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.position.set(1, 2, 3);
  });

  test('backup stores current state', () => {
    anim.addTranslationTrack('obj', mockGroup, 'x', [0, 1], [0, 5]);
    anim.root = mockGroup;
    anim.duration = 2;
    anim.speed = 1.5;
    anim.repeat = false;

    anim.backup();

    expect(anim._backup.tracks).toBe(anim.tracks);
    expect(anim._backup.root).toBe(mockGroup);
    expect(anim._backup.duration).toBe(2);
    expect(anim._backup.speed).toBe(1.5);
    expect(anim._backup.repeat).toBe(false);
  });

  test('restore returns stored settings', () => {
    anim.addTranslationTrack('obj', mockGroup, 'x', [0, 1], [0, 5]);
    anim.root = mockGroup;
    anim.duration = 2;
    anim.speed = 1.5;
    anim.repeat = false;

    anim.backup();

    // Modify current state
    anim.tracks = [];

    const restored = anim.restore();

    expect(restored.duration).toBe(2);
    expect(restored.speed).toBe(1.5);
    expect(restored.repeat).toBe(false);
    expect(anim.tracks.length).toBe(1);
  });

  test('cleanBackup clears backup', () => {
    anim.backup();
    expect(Object.keys(anim._backup).length).toBeGreaterThan(0);

    anim.cleanBackup();
    expect(anim._backup).toBeNull();
  });
});

describe('Animation - hasTracks & hasBackup', () => {
  test('hasTracks returns false when no tracks', () => {
    const anim = new Animation('|');
    expect(anim.hasTracks()).toBe(false);
  });

  test('hasTracks returns true when tracks exist', () => {
    const anim = new Animation('|');
    const mockGroup = new THREE.Object3D();

    anim.addTranslationTrack('obj', mockGroup, 'x', [0, 1], [0, 5]);

    expect(anim.hasTracks()).toBe(true);
  });

  test('hasBackup returns false when no backup', () => {
    const anim = new Animation('|');
    expect(anim.hasBackup()).toBe(false);
  });

  test('hasBackup returns true after backup', () => {
    const anim = new Animation('|');
    anim.backup();

    expect(anim.hasBackup()).toBe(true);
  });

  test('hasBackup returns false after cleanBackup', () => {
    const anim = new Animation('|');
    anim.backup();
    anim.cleanBackup();

    expect(anim.hasBackup()).toBe(false);
  });
});

describe('Animation - animate', () => {
  let anim;
  let mockGroup;
  let root;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.name = 'animated';

    root = new THREE.Object3D();
    root.add(mockGroup);

    anim.addTranslationTrack('animated', mockGroup, 'x', [0, 1, 2], [0, 5, 0]);
  });

  test('creates animation clip and mixer', () => {
    const clipAction = anim.animate(root, 2, 1);

    expect(anim.clip).toBeDefined();
    expect(anim.mixer).toBeDefined();
    expect(anim.clipAction).toBeDefined();
    expect(clipAction).toBeDefined();
  });

  test('sets duration', () => {
    anim.animate(root, 3, 1);

    expect(anim.duration).toBe(3);
  });

  test('sets speed', () => {
    anim.animate(root, 2, 2.5);

    expect(anim.speed).toBe(2.5);
    expect(anim.mixer.timeScale).toBe(2.5);
  });

  test('sets repeat mode to LoopRepeat when repeat=true', () => {
    anim.animate(root, 2, 1, true);

    expect(anim.repeat).toBe(true);
  });

  test('sets repeat mode to LoopPingPong when repeat=false', () => {
    anim.animate(root, 2, 1, false);

    expect(anim.repeat).toBe(false);
  });

  test('stores root object', () => {
    anim.animate(root, 2, 1);

    expect(anim.root).toBe(root);
  });
});

describe('Animation - setRelativeTime & getRelativeTime', () => {
  let anim;
  let mockGroup;
  let root;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.name = 'animated';

    root = new THREE.Object3D();
    root.add(mockGroup);

    anim.addTranslationTrack('animated', mockGroup, 'x', [0, 1], [0, 10]);
    anim.animate(root, 2, 1);
  });

  test('setRelativeTime sets animation to relative position', () => {
    anim.setRelativeTime(0.5);

    expect(anim.clipAction.time).toBe(1); // 50% of 2 seconds
    expect(anim.clipAction.paused).toBe(true);
  });

  test('setRelativeTime at 0 sets to start', () => {
    anim.setRelativeTime(0);

    expect(anim.clipAction.time).toBe(0);
  });

  test('setRelativeTime at 1 sets to end', () => {
    anim.setRelativeTime(1);

    expect(anim.clipAction.time).toBe(2);
  });

  test('getRelativeTime returns current fraction', () => {
    anim.clipAction.time = 1; // 50% of 2 seconds

    const fraction = anim.getRelativeTime();

    expect(fraction).toBe(0.5);
  });
});

describe('Animation - dispose', () => {
  let anim;
  let mockGroup;
  let root;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.name = 'animated';

    root = new THREE.Object3D();
    root.add(mockGroup);

    anim.addTranslationTrack('animated', mockGroup, 'x', [0, 1], [0, 10]);
    anim.animate(root, 2, 1);
  });

  test('dispose clears all resources', () => {
    anim.dispose();

    expect(anim.mixer).toBeNull();
    expect(anim.clipAction).toBeNull();
    expect(anim.clip).toBeNull();
    expect(anim.tracks).toEqual([]);
    expect(anim.root).toBeNull();
  });

  test('dispose handles null mixer gracefully', () => {
    anim.mixer = null;

    // Should not throw
    expect(() => anim.dispose()).not.toThrow();
  });
});

describe('Animation - update', () => {
  let anim;
  let mockGroup;
  let root;

  beforeEach(() => {
    anim = new Animation('|');
    mockGroup = new THREE.Object3D();
    mockGroup.name = 'animated';

    root = new THREE.Object3D();
    root.add(mockGroup);

    anim.addTranslationTrack('animated', mockGroup, 'x', [0, 1], [0, 10]);
    anim.animate(root, 2, 1);
  });

  test('update calls mixer.update', () => {
    const updateSpy = vi.spyOn(anim.mixer, 'update');

    anim.update();

    expect(updateSpy).toHaveBeenCalled();
  });

  test('update handles null mixer gracefully', () => {
    anim.mixer = null;

    // Should not throw
    expect(() => anim.update()).not.toThrow();
  });
});

describe('Animation - Integration', () => {
  test('full animation workflow', () => {
    const anim = new Animation('|');
    const root = new THREE.Object3D();

    const obj1 = new THREE.Object3D();
    obj1.name = 'part1';
    root.add(obj1);

    const obj2 = new THREE.Object3D();
    obj2.name = 'part2';
    root.add(obj2);

    // Add multiple tracks
    anim.addTranslationTrack('part1', obj1, 'x', [0, 0.5, 1], [0, 5, 0]);
    anim.addRotationTrack('part2', obj2, 'z', [0, 1], [0, 180]);

    expect(anim.hasTracks()).toBe(true);

    // Backup
    anim.backup();
    expect(anim.hasBackup()).toBe(true);

    // Start animation
    const clipAction = anim.animate(root, 2, 1.5, true);
    expect(clipAction).toBeDefined();

    // Set to middle
    anim.setRelativeTime(0.5);
    expect(anim.getRelativeTime()).toBeCloseTo(0.5, 2);

    // Update
    anim.update();

    // Dispose
    anim.dispose();
    expect(anim.hasTracks()).toBe(false);
  });
});
