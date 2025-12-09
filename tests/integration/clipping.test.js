import { describe, test, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  setupClipping,
  cleanupClipping,
  getPlaneMeshes,
  getPlaneHelpers,
  countStencilGroups,
  getPlaneConstant,
  getPlaneNormal,
} from '../helpers/clipping-setup.js';

describe('Clipping - Basic Setup', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('can create Clipping instance', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    expect(clipping).toBeDefined();
    expect(clipping.clipPlanes).toHaveLength(3);
    expect(clipping.reverseClipPlanes).toHaveLength(3);
  });

  test('creates three clip planes with correct normals', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    // X plane: normal (-1, 0, 0)
    expect(clipping.clipPlanes[0].normal.x).toBe(-1);
    expect(clipping.clipPlanes[0].normal.y).toBe(0);
    expect(clipping.clipPlanes[0].normal.z).toBe(0);

    // Y plane: normal (0, -1, 0)
    expect(clipping.clipPlanes[1].normal.x).toBe(0);
    expect(clipping.clipPlanes[1].normal.y).toBe(-1);
    expect(clipping.clipPlanes[1].normal.z).toBe(0);

    // Z plane: normal (0, 0, -1)
    expect(clipping.clipPlanes[2].normal.x).toBe(0);
    expect(clipping.clipPlanes[2].normal.y).toBe(0);
    expect(clipping.clipPlanes[2].normal.z).toBe(-1);
  });

  test('creates reverse clip planes with negated normals', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    for (let i = 0; i < 3; i++) {
      const normal = clipping.clipPlanes[i].normal;
      const reverseNormal = clipping.reverseClipPlanes[i].normal;

      expect(reverseNormal.x).toBe(-normal.x);
      expect(reverseNormal.y).toBe(-normal.y);
      expect(reverseNormal.z).toBe(-normal.z);
    }
  });

  test('creates plane helpers (initially hidden)', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    expect(clipping.planeHelpers).toBeDefined();
    expect(clipping.planeHelpers.children).toHaveLength(3);
    expect(clipping.planeHelpers.visible).toBe(false);
  });

  test('calls display.setNormalLabel for each plane', () => {
    testContext = setupClipping();
    const { calls } = testContext;

    expect(calls.setNormalLabel).toHaveLength(3);
    expect(calls.setNormalLabel[0].index).toBe(0);
    expect(calls.setNormalLabel[1].index).toBe(1);
    expect(calls.setNormalLabel[2].index).toBe(2);
  });

  test('respects center parameter', () => {
    const center = new THREE.Vector3(5, 10, 15);
    testContext = setupClipping({ center });
    const { clipping } = testContext;

    expect(clipping.center).toEqual([5, 10, 15]);
  });

  test('respects size parameter', () => {
    testContext = setupClipping({ size: 20 });
    const { clipping } = testContext;

    expect(clipping.distance).toBe(10); // size / 2
  });
});

describe('Clipping - Stencil Setup', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('creates stencil groups for solid objects only', () => {
    testContext = setupClipping({ numSolids: 2 });
    const { nestedGroup } = testContext;

    // 2 solids × 3 planes = 6 clipping groups
    const count = countStencilGroups(nestedGroup);
    expect(count).toBe(6);
  });

  test('creates PlaneMeshes group in rootGroup', () => {
    testContext = setupClipping({ numSolids: 2 });
    const { nestedGroup } = testContext;

    const planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes.length).toBeGreaterThan(0);
  });

  test('creates correct number of plane meshes', () => {
    testContext = setupClipping({ numSolids: 3 });
    const { nestedGroup } = testContext;

    // 3 solids × 3 planes = 9 plane meshes
    const planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes).toHaveLength(9);
  });

  test('stores object colors for color caps feature', () => {
    testContext = setupClipping({ numSolids: 2 });
    const { clipping } = testContext;

    // 2 solids × 3 planes = 6 colors stored
    expect(clipping.objectColors).toHaveLength(6);
  });

  test('skips non-solid objects for stencil creation', () => {
    testContext = setupClipping({ numSolids: 1 });
    const { nestedGroup } = testContext;

    // Only 1 solid, edges-only group should be skipped
    // 1 solid × 3 planes = 3 clipping groups
    const count = countStencilGroups(nestedGroup);
    expect(count).toBe(3);
  });
});

describe('Clipping - Constant Setting', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('setConstant updates clip plane constant', () => {
    testContext = setupClipping({ size: 10 });
    const { clipping } = testContext;

    const initialConstant = getPlaneConstant(clipping, 0);

    clipping.setConstant(0, 2.0);

    expect(getPlaneConstant(clipping, 0)).toBe(2.0);
    expect(getPlaneConstant(clipping, 0)).not.toBe(initialConstant);
  });

  test('setConstant updates reverse plane with negated value', () => {
    testContext = setupClipping({ size: 10 });
    const { clipping } = testContext;

    clipping.setConstant(0, 3.0);

    // Reverse plane should have negated centered constant
    expect(clipping.reverseClipPlanes[0].centeredConstant).toBe(-3.0);
  });

  test('setConstant works for all three planes', () => {
    testContext = setupClipping({ size: 10 });
    const { clipping } = testContext;

    clipping.setConstant(0, 1.0);
    clipping.setConstant(1, 2.0);
    clipping.setConstant(2, 3.0);

    expect(getPlaneConstant(clipping, 0)).toBe(1.0);
    expect(getPlaneConstant(clipping, 1)).toBe(2.0);
    expect(getPlaneConstant(clipping, 2)).toBe(3.0);
  });
});

describe('Clipping - Normal Setting', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('setNormal updates clip plane normal', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    const newNormal = new THREE.Vector3(1, 0, 0);
    clipping.setNormal(0, newNormal);

    const normal = getPlaneNormal(clipping, 0);
    expect(normal.x).toBe(1);
    expect(normal.y).toBe(0);
    expect(normal.z).toBe(0);
  });

  test('setNormal updates reverse plane with negated normal', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    const newNormal = new THREE.Vector3(0.5, 0.5, 0.1);
    clipping.setNormal(0, newNormal);

    const reverseNormal = clipping.reverseClipPlanes[0].normal;
    expect(reverseNormal.x).toBe(-0.5);
    expect(reverseNormal.y).toBe(-0.5);
    expect(reverseNormal.z).toBe(-0.1);
  });

  test('setNormal calls display.setNormalLabel', () => {
    testContext = setupClipping();
    const { clipping, calls } = testContext;

    // Clear initial calls
    calls.setNormalLabel.length = 0;

    const newNormal = new THREE.Vector3(0, 1, 0);
    clipping.setNormal(1, newNormal);

    expect(calls.setNormalLabel).toHaveLength(1);
    expect(calls.setNormalLabel[0].index).toBe(1);
    expect(calls.setNormalLabel[0].normal).toEqual([0, 1, 0]);
  });

  test('setNormal resets constant to distance', () => {
    testContext = setupClipping({ size: 10 });
    const { clipping } = testContext;

    // Change constant
    clipping.setConstant(0, 2.0);
    expect(getPlaneConstant(clipping, 0)).toBe(2.0);

    // Set normal should reset constant to distance (size/2 = 5)
    clipping.setNormal(0, new THREE.Vector3(1, 0, 0));
    expect(getPlaneConstant(clipping, 0)).toBe(5.0);
  });
});

describe('Clipping - Visibility', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('setVisible shows/hides plane meshes', () => {
    testContext = setupClipping({ numSolids: 2 });
    const { clipping, nestedGroup } = testContext;

    // Initially visible
    clipping.setVisible(true);
    let planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes[0].material.visible).toBe(true);

    // Hide
    clipping.setVisible(false);
    planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes[0].material.visible).toBe(false);

    // Show again
    clipping.setVisible(true);
    planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes[0].material.visible).toBe(true);
  });

  test('setVisible affects all plane meshes', () => {
    testContext = setupClipping({ numSolids: 2 });
    const { clipping, nestedGroup } = testContext;

    clipping.setVisible(false);

    const planeMeshes = getPlaneMeshes(nestedGroup);
    for (const mesh of planeMeshes) {
      expect(mesh.material.visible).toBe(false);
    }
  });
});

describe('Clipping - Object Color Caps', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('getObjectColorCaps returns initial state', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    expect(clipping.getObjectColorCaps()).toBe(false);
  });

  test('setObjectColorCaps toggles color mode', () => {
    testContext = setupClipping({ numSolids: 2 });
    const { clipping } = testContext;

    clipping.setObjectColorCaps(true);
    expect(clipping.getObjectColorCaps()).toBe(true);

    clipping.setObjectColorCaps(false);
    expect(clipping.getObjectColorCaps()).toBe(false);
  });

  test('setObjectColorCaps changes plane mesh colors', () => {
    testContext = setupClipping({ numSolids: 1 });
    const { clipping, nestedGroup } = testContext;

    const planeMeshes = getPlaneMeshes(nestedGroup);
    const originalColor = planeMeshes[0].material.color.getHex();

    // Enable object color caps
    clipping.setObjectColorCaps(true);
    const objectColor = planeMeshes[0].material.color.getHex();

    // Color should change to object color (red = 0xff0000 from mock)
    expect(objectColor).toBe(0xff0000);

    // Disable - should return to plane color
    clipping.setObjectColorCaps(false);
    const restoredColor = planeMeshes[0].material.color.getHex();

    // Should be back to original plane color
    expect(restoredColor).toBe(originalColor);
  });
});

describe('Clipping - Theme Support', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('light theme uses correct plane colors', () => {
    testContext = setupClipping({ theme: 'light', numSolids: 1 });
    const { clipping } = testContext;

    const helpers = getPlaneHelpers(clipping);

    // Light theme colors: red, green, blue
    expect(helpers[0].material.color.getHex()).toBe(0xff0000);
    expect(helpers[1].material.color.getHex()).toBe(0x00ff00);
    expect(helpers[2].material.color.getHex()).toBe(0x0000ff);
  });

  test('dark theme uses correct plane colors', () => {
    testContext = setupClipping({ theme: 'dark', numSolids: 1 });
    const { clipping } = testContext;

    const helpers = getPlaneHelpers(clipping);

    // Dark theme colors: orange-red, lime green, light blue
    expect(helpers[0].material.color.getHex()).toBe(0xff4500);
    expect(helpers[1].material.color.getHex()).toBe(0x32cd32);
    expect(helpers[2].material.color.getHex()).toBe(0x3b9eff);
  });

  test('dark theme uses higher opacity for plane helpers', () => {
    testContext = setupClipping({ theme: 'dark', numSolids: 1 });
    const { clipping } = testContext;

    const helpers = getPlaneHelpers(clipping);
    expect(helpers[0].material.opacity).toBe(0.2);
  });

  test('light theme uses lower opacity for plane helpers', () => {
    testContext = setupClipping({ theme: 'light', numSolids: 1 });
    const { clipping } = testContext;

    const helpers = getPlaneHelpers(clipping);
    expect(helpers[0].material.opacity).toBe(0.1);
  });
});

describe('Clipping - Dispose', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('dispose cleans up references', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    clipping.dispose();

    // These are nulled out for callback cleanup
    expect(clipping.onNormalChange).toBeNull();
    expect(clipping.center).toBeNull();
    expect(clipping.planeHelpers).toBeNull();
    expect(clipping._planeMeshGroup).toBeNull();
    // Note: nestedGroup, clipPlanes, reverseClipPlanes, objectColors
    // are not nulled out - GC handles cleanup when Clipping object is collected
  });

  test('dispose can be called multiple times without error', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    expect(() => {
      clipping.dispose();
      clipping.dispose();
    }).not.toThrow();
  });
});

describe('Clipping - CenteredPlane', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('CenteredPlane stores center reference', () => {
    testContext = setupClipping({ center: new THREE.Vector3(1, 2, 3) });
    const { clipping } = testContext;

    expect(clipping.clipPlanes[0].center).toEqual([1, 2, 3]);
  });

  test('CenteredPlane adjusts constant based on center', () => {
    // With center at origin, constant should equal centeredConstant
    testContext = setupClipping({
      center: new THREE.Vector3(0, 0, 0),
      size: 10,
    });
    const { clipping } = testContext;

    const plane = clipping.clipPlanes[0];
    // For X plane with normal (-1,0,0), center at origin
    // constant should be adjusted to account for center offset
    expect(plane.centeredConstant).toBe(5); // size / 2
  });
});

describe('Clipping - Edge Cases', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupClipping(testContext);
      testContext = null;
    }
  });

  test('handles zero solids gracefully', () => {
    testContext = setupClipping({ numSolids: 0 });
    const { clipping, nestedGroup } = testContext;

    expect(clipping).toBeDefined();
    expect(clipping.objectColors).toHaveLength(0);

    const planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes).toHaveLength(0);
  });

  test('handles large number of solids', () => {
    testContext = setupClipping({ numSolids: 10 });
    const { nestedGroup } = testContext;

    // 10 solids × 3 planes = 30 clipping groups
    const count = countStencilGroups(nestedGroup);
    expect(count).toBe(30);

    const planeMeshes = getPlaneMeshes(nestedGroup);
    expect(planeMeshes).toHaveLength(30);
  });

  test('handles negative constant values', () => {
    testContext = setupClipping({ size: 10 });
    const { clipping } = testContext;

    clipping.setConstant(0, -5.0);
    expect(getPlaneConstant(clipping, 0)).toBe(-5.0);
  });

  test('handles non-unit normal vectors', () => {
    testContext = setupClipping();
    const { clipping } = testContext;

    // Non-unit normal (should still work)
    const newNormal = new THREE.Vector3(2, 0, 0);
    clipping.setNormal(0, newNormal);

    const normal = getPlaneNormal(clipping, 0);
    expect(normal.x).toBe(2);
  });
});
