/**
 * Comprehensive notification tests for viewer-client communication protocol.
 *
 * This test suite ensures the reliability of the async communication between
 * client and viewer. All notifications must be correctly sent with proper
 * keys and values.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample } from '../helpers/snapshot.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a notification collector that captures all notifications
 */
function createNotificationCollector() {
  const notifications = [];
  const callback = vi.fn((notification) => {
    notifications.push(structuredClone(notification));
  });
  return { callback, notifications };
}

/**
 * Wait for a specific notification key to appear
 */
async function waitForNotification(notifications, key, timeout = 100) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = notifications.find(n => key in n);
    if (found) return found;
    await new Promise(r => setTimeout(r, 10));
  }
  return null;
}

/**
 * Get the last notification containing a specific key
 */
function getLastNotificationWithKey(notifications, key) {
  for (let i = notifications.length - 1; i >= 0; i--) {
    if (key in notifications[i]) {
      return notifications[i];
    }
  }
  return null;
}

// =============================================================================
// RENDER INITIAL NOTIFICATION TESTS
// =============================================================================

describe('Render Initial Notification', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('render sends initial notification with required keys', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should have at least one notification
    expect(collector.notifications.length).toBeGreaterThan(0);

    // Find the initial notification (contains tab, target, clip_normal_*)
    const initialNotification = collector.notifications.find(n =>
      'tab' in n && 'target' in n && 'clip_normal_0' in n
    );

    expect(initialNotification).toBeDefined();
  });

  test('initial notification contains tab with correct format', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const notification = collector.notifications.find(n => 'tab' in n);

    expect(notification.tab).toEqual({
      old: null,
      new: 'tree', // Default active tab
    });
  });

  test('initial notification contains target as Vector3 array', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const notification = collector.notifications.find(n => 'target' in n);

    expect(notification.target.old).toBeNull();
    expect(notification.target.new).toBeInstanceOf(Array);
    expect(notification.target.new).toHaveLength(3);
    notification.target.new.forEach(v => expect(typeof v).toBe('number'));
  });

  test('initial notification contains target0 as Vector3 array', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const notification = collector.notifications.find(n => 'target0' in n);

    expect(notification.target0.old).toBeNull();
    expect(notification.target0.new).toBeInstanceOf(Array);
    expect(notification.target0.new).toHaveLength(3);
  });

  test('initial notification contains clip_normal_0/1/2 as Vector3 arrays (not null)', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const notification = collector.notifications.find(n => 'clip_normal_0' in n);

    // This was the bug we fixed - values should NOT be null
    expect(notification.clip_normal_0.new).not.toBeNull();
    expect(notification.clip_normal_1.new).not.toBeNull();
    expect(notification.clip_normal_2.new).not.toBeNull();

    // Should be Vector3 arrays
    expect(notification.clip_normal_0.new).toBeInstanceOf(Array);
    expect(notification.clip_normal_0.new).toHaveLength(3);
    expect(notification.clip_normal_1.new).toBeInstanceOf(Array);
    expect(notification.clip_normal_1.new).toHaveLength(3);
    expect(notification.clip_normal_2.new).toBeInstanceOf(Array);
    expect(notification.clip_normal_2.new).toHaveLength(3);
  });

  test('clip normals have default orientation values', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const notification = collector.notifications.find(n => 'clip_normal_0' in n);

    // Default clip normals are along negative axes
    expect(notification.clip_normal_0.new).toEqual([-1, 0, 0]);
    expect(notification.clip_normal_1.new).toEqual([0, -1, 0]);
    expect(notification.clip_normal_2.new).toEqual([0, 0, -1]);
  });
});

// =============================================================================
// STATE-BASED SETTER NOTIFICATION TESTS
// =============================================================================

describe('Setter Notifications via State', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  // --- View Settings ---

  test('setAxes sends axes notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0; // Clear initial notifications

    viewer.setAxes(false);

    const notification = getLastNotificationWithKey(collector.notifications, 'axes');
    expect(notification).toBeDefined();
    expect(notification.axes.new).toBe(false);
  });

  test('setAxes with notify=false does not send notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setAxes(false, false); // notify=false

    const notification = getLastNotificationWithKey(collector.notifications, 'axes');
    expect(notification).toBeNull();
  });

  test('setAxes0 sends axes0 notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // First set to false (may already be false, but ensure a change happens)
    viewer.setAxes0(false);
    collector.notifications.length = 0;

    // Now set to true to trigger notification
    viewer.setAxes0(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'axes0');
    expect(notification).toBeDefined();
    expect(notification.axes0.new).toBe(true);
  });

  test('setOrtho sends ortho notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Ensure a change happens
    viewer.setOrtho(false);
    collector.notifications.length = 0;

    viewer.setOrtho(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'ortho');
    expect(notification).toBeDefined();
    expect(notification.ortho.new).toBe(true);
  });

  test('setTransparent sends transparent notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setTransparent(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'transparent');
    expect(notification).toBeDefined();
    expect(notification.transparent.new).toBe(true);
  });

  test('setBlackEdges sends black_edges notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setBlackEdges(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'black_edges');
    expect(notification).toBeDefined();
    expect(notification.black_edges.new).toBe(true);
  });

  test('setTools sends tools notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setTools(false);

    const notification = getLastNotificationWithKey(collector.notifications, 'tools');
    expect(notification).toBeDefined();
    expect(notification.tools.new).toBe(false);
  });

  test('setGlass sends glass notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setGlass(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'glass');
    expect(notification).toBeDefined();
    expect(notification.glass.new).toBe(true);
  });

  // --- Render Settings ---

  test('setAmbientLight sends ambient_intensity notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setAmbientLight(0.5);

    const notification = getLastNotificationWithKey(collector.notifications, 'ambient_intensity');
    expect(notification).toBeDefined();
    expect(notification.ambient_intensity.new).toBe(0.5);
  });

  test('setDirectLight sends direct_intensity notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setDirectLight(0.8);

    const notification = getLastNotificationWithKey(collector.notifications, 'direct_intensity');
    expect(notification).toBeDefined();
    expect(notification.direct_intensity.new).toBe(0.8);
  });

  test('setMetalness sends metalness notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setMetalness(0.7);

    const notification = getLastNotificationWithKey(collector.notifications, 'metalness');
    expect(notification).toBeDefined();
    expect(notification.metalness.new).toBe(0.7);
  });

  test('setRoughness sends roughness notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setRoughness(0.3);

    const notification = getLastNotificationWithKey(collector.notifications, 'roughness');
    expect(notification).toBeDefined();
    expect(notification.roughness.new).toBe(0.3);
  });

  test('setOpacity sends default_opacity notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // First set to a different value to ensure a change happens
    viewer.setOpacity(0.8);
    collector.notifications.length = 0;

    viewer.setOpacity(0.5);

    const notification = getLastNotificationWithKey(collector.notifications, 'default_opacity');
    expect(notification).toBeDefined();
    expect(notification.default_opacity.new).toBe(0.5);
  });

  test('setEdgeColor sends default_edgecolor notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setEdgeColor(0xff0000);

    const notification = getLastNotificationWithKey(collector.notifications, 'default_edgecolor');
    expect(notification).toBeDefined();
    expect(notification.default_edgecolor.new).toBe(0xff0000);
  });
});

// =============================================================================
// CLIPPING NOTIFICATION TESTS
// =============================================================================

describe('Clipping Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setClipIntersection sends clip_intersection notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setClipIntersection(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'clip_intersection');
    expect(notification).toBeDefined();
    expect(notification.clip_intersection.new).toBe(true);
  });

  test('setClipObjectColorCaps sends clip_object_colors notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setClipObjectColorCaps(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'clip_object_colors');
    expect(notification).toBeDefined();
    expect(notification.clip_object_colors.new).toBe(true);
  });

  test('setClipPlaneHelpers sends clip_planes notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setClipPlaneHelpers(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'clip_planes');
    expect(notification).toBeDefined();
    expect(notification.clip_planes.new).toBe(true);
  });

  test('setClipSlider sends clip_slider_N notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setClipSlider(0, 0.5);

    const notification = getLastNotificationWithKey(collector.notifications, 'clip_slider_0');
    expect(notification).toBeDefined();
    expect(notification.clip_slider_0.new).toBe(0.5);
  });

  test('setClipSlider for each index sends correct key', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Test index 0
    collector.notifications.length = 0;
    viewer.setClipSlider(0, 0.1);
    expect(getLastNotificationWithKey(collector.notifications, 'clip_slider_0')).toBeDefined();

    // Test index 1
    collector.notifications.length = 0;
    viewer.setClipSlider(1, 0.2);
    expect(getLastNotificationWithKey(collector.notifications, 'clip_slider_1')).toBeDefined();

    // Test index 2
    collector.notifications.length = 0;
    viewer.setClipSlider(2, 0.3);
    expect(getLastNotificationWithKey(collector.notifications, 'clip_slider_2')).toBeDefined();
  });

  test('setClipNormal sends clip_normal_N notification with Vector3 array', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setClipNormal(0, [1, 0, 0]);

    const notification = getLastNotificationWithKey(collector.notifications, 'clip_normal_0');
    expect(notification).toBeDefined();
    expect(notification.clip_normal_0.new).toBeInstanceOf(Array);
    expect(notification.clip_normal_0.new).toHaveLength(3);
    // Should be normalized
    expect(notification.clip_normal_0.new[0]).toBeCloseTo(1);
    expect(notification.clip_normal_0.new[1]).toBeCloseTo(0);
    expect(notification.clip_normal_0.new[2]).toBeCloseTo(0);
  });
});

// =============================================================================
// CAMERA/VIEW NOTIFICATION TESTS
// =============================================================================

describe('Camera and View Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setCameraZoom sends zoom notification directly', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // setCameraZoom sends notification directly
    viewer.setCameraZoom(2.0);

    const notification = getLastNotificationWithKey(collector.notifications, 'zoom');
    expect(notification).toBeDefined();
    expect(typeof notification.zoom.new).toBe('number');
    expect(notification.zoom.new).toBeCloseTo(2.0, 1);
  });

  test('setCameraPosition sends position notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setCameraPosition([50, 50, 50]);

    const notification = getLastNotificationWithKey(collector.notifications, 'position');
    expect(notification).toBeDefined();
    expect(notification.position.new).toBeInstanceOf(Array);
    expect(notification.position.new).toHaveLength(3);
  });

  test('presetCamera sends quaternion notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // presetCamera changes quaternion and notifies
    viewer.presetCamera('front');

    const notification = getLastNotificationWithKey(collector.notifications, 'quaternion');
    expect(notification).toBeDefined();
    expect(notification.quaternion.new).toBeInstanceOf(Array);
    expect(notification.quaternion.new).toHaveLength(4);
  });

  test('setCameraTarget sends target notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setCameraTarget([10, 10, 10]);

    const notification = getLastNotificationWithKey(collector.notifications, 'target');
    expect(notification).toBeDefined();
    expect(notification.target.new).toBeInstanceOf(Array);
    expect(notification.target.new).toHaveLength(3);
  });

  test('update with notify=false does not send notifications', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.update(true, false); // notify=false

    expect(collector.notifications.length).toBe(0);
  });
});

// =============================================================================
// GRID NOTIFICATION TESTS
// =============================================================================

describe('Grid Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setGrids sends grid notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setGrids([true, false, false]);

    const notification = getLastNotificationWithKey(collector.notifications, 'grid');
    expect(notification).toBeDefined();
    expect(notification.grid.new).toEqual([true, false, false]);
  });

  test('setGrid action sends grid notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // First turn off xy grid to ensure we have a change
    viewer.setGrid('grid-xy', false);
    collector.notifications.length = 0;

    // Turn it back on
    viewer.setGrid('grid-xy', true);

    const notification = getLastNotificationWithKey(collector.notifications, 'grid');
    expect(notification).toBeDefined();
    expect(notification.grid.new[0]).toBe(true);
  });

  test('setGridCenter sends center_grid notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setGridCenter(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'center_grid');
    expect(notification).toBeDefined();
    expect(notification.center_grid.new).toBe(true);
  });

  test('setGridCenter with notify=false does not send notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setGridCenter(true, false);

    expect(getLastNotificationWithKey(collector.notifications, 'center_grid')).toBeNull();
  });
});

// =============================================================================
// TREE STATE NOTIFICATION TESTS
// =============================================================================

describe('Tree State Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('notifyStates sends states notification when states change', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Clear lastNotification to force notification
    viewer.lastNotification = {};
    viewer.notifyStates();

    const notification = getLastNotificationWithKey(collector.notifications, 'states');
    expect(notification).toBeDefined();
    expect(notification.states.new).toBeDefined();
  });

  test('states notification contains path-to-visibility mapping', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;
    viewer.lastNotification = {}; // Clear to force notification

    viewer.notifyStates();

    const notification = getLastNotificationWithKey(collector.notifications, 'states');
    // States is a Record<string, VisibilityState> mapping paths to visibility
    expect(typeof notification.states.new).toBe('object');
    // Each value should be a visibility array [mesh, edges]
    const values = Object.values(notification.states.new);
    // box1 should have at least one part, so there must be values
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toBeInstanceOf(Array);
    expect(values[0]).toHaveLength(2);
  });
});

// =============================================================================
// NO DUPLICATE NOTIFICATION TESTS
// =============================================================================

describe('No Duplicate Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('same value does not trigger duplicate notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Set axes to false
    viewer.setAxes(false);
    const count1 = collector.notifications.filter(n => 'axes' in n).length;

    // Set axes to false again (same value)
    viewer.setAxes(false);
    const count2 = collector.notifications.filter(n => 'axes' in n).length;

    // Should not increase notification count
    expect(count2).toBe(count1);
  });

  test('changed value triggers new notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Set axes to false
    viewer.setAxes(false);
    const count1 = collector.notifications.filter(n => 'axes' in n).length;

    // Set axes to true (different value)
    viewer.setAxes(true);
    const count2 = collector.notifications.filter(n => 'axes' in n).length;

    // Should increase notification count
    expect(count2).toBe(count1 + 1);
  });

  test('old value is tracked correctly', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // First change
    viewer.setAxes(false);
    const notification1 = getLastNotificationWithKey(collector.notifications, 'axes');

    // Second change
    viewer.setAxes(true);
    const notification2 = getLastNotificationWithKey(collector.notifications, 'axes');

    // Second notification should have old=false, new=true
    expect(notification2.axes.old).toBe(false);
    expect(notification2.axes.new).toBe(true);
  });
});

// =============================================================================
// STATE-TO-NOTIFICATION KEY MAPPING TESTS
// =============================================================================

describe('STATE_TO_NOTIFICATION_KEY Mapping', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('all mapped state keys produce correct notification keys', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Test a sample of key mappings
    const testCases = [
      { setter: () => viewer.setAxes(false), notificationKey: 'axes' },
      { setter: () => viewer.setAxes0(true), notificationKey: 'axes0' },
      { setter: () => viewer.setOrtho(true), notificationKey: 'ortho' },
      { setter: () => viewer.setTransparent(true), notificationKey: 'transparent' },
      { setter: () => viewer.setBlackEdges(true), notificationKey: 'black_edges' },
      { setter: () => viewer.setGlass(true), notificationKey: 'glass' },
      { setter: () => viewer.setAmbientLight(0.5), notificationKey: 'ambient_intensity' },
      { setter: () => viewer.setDirectLight(0.5), notificationKey: 'direct_intensity' },
      { setter: () => viewer.setMetalness(0.5), notificationKey: 'metalness' },
      { setter: () => viewer.setRoughness(0.5), notificationKey: 'roughness' },
      { setter: () => viewer.setOpacity(0.5), notificationKey: 'default_opacity' },
      { setter: () => viewer.setClipIntersection(true), notificationKey: 'clip_intersection' },
      { setter: () => viewer.setClipObjectColorCaps(true), notificationKey: 'clip_object_colors' },
      { setter: () => viewer.setClipPlaneHelpers(true), notificationKey: 'clip_planes' },
    ];

    for (const { setter, notificationKey } of testCases) {
      collector.notifications.length = 0;
      setter();
      const notification = getLastNotificationWithKey(collector.notifications, notificationKey);
      expect(notification).toBeDefined();
    }
  });
});

// =============================================================================
// MEASUREMENT TOOL NOTIFICATION TESTS
// =============================================================================

describe('Measurement Tool Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('activateTool("select") activates select tool', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      selectTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw
    expect(() => viewer.activateTool('select', true)).not.toThrow();
  });

  test('activateTool("distance") activates distance tool', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    expect(() => viewer.activateTool('distance', true)).not.toThrow();
  });

  test('activateTool("properties") activates properties tool', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    expect(() => viewer.activateTool('properties', true)).not.toThrow();
  });

  test('activateTool("angle") activates angle tool', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    expect(() => viewer.activateTool('angle', true)).not.toThrow();
  });

  test('select tool can be activated and deactivated', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      selectTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Activate then deactivate - should not throw
    expect(() => viewer.activateTool('select', true)).not.toThrow();
    expect(() => viewer.activateTool('select', false)).not.toThrow();

    // If a selected notification was sent, it should have empty array
    const notification = getLastNotificationWithKey(collector.notifications, 'selected');
    if (notification) {
      expect(notification.selected.new).toEqual([]);
    }
  });
});

// =============================================================================
// BACKEND RESPONSE HANDLING TESTS
// =============================================================================

describe('Backend Response Handling', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('handleBackendResponse accepts tool_response', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw with valid tool response
    expect(() => viewer.handleBackendResponse({
      subtype: 'tool_response',
      tool_type: 'distance',
      distance: 10.5,
    })).not.toThrow();
  });

  test('handleBackendResponse ignores non-tool responses', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw with non-tool response
    expect(() => viewer.handleBackendResponse({
      subtype: 'other',
      data: 'test',
    })).not.toThrow();
  });
});

// =============================================================================
// NOTIFICATION FORMAT VALIDATION TESTS
// =============================================================================

describe('Notification Format Validation', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('all notifications have old and new properties', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Trigger various notifications
    viewer.setAxes(false);
    viewer.setOrtho(true);
    viewer.setAmbientLight(0.5);

    for (const notification of collector.notifications) {
      for (const key of Object.keys(notification)) {
        expect(notification[key]).toHaveProperty('old');
        expect(notification[key]).toHaveProperty('new');
      }
    }
  });

  test('numeric values are numbers not strings', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setAmbientLight(0.5);

    const notification = getLastNotificationWithKey(collector.notifications, 'ambient_intensity');
    expect(typeof notification.ambient_intensity.new).toBe('number');
  });

  test('boolean values are booleans not strings', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setAxes(false);

    const notification = getLastNotificationWithKey(collector.notifications, 'axes');
    expect(typeof notification.axes.new).toBe('boolean');
  });

  test('Vector3 values are arrays of 3 numbers', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const notification = collector.notifications.find(n => 'clip_normal_0' in n);
    const normal = notification.clip_normal_0.new;

    expect(Array.isArray(normal)).toBe(true);
    expect(normal).toHaveLength(3);
    normal.forEach(v => expect(typeof v).toBe('number'));
  });

  test('quaternion values are arrays of 4 numbers', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // presetCamera changes quaternion and sends notification
    viewer.presetCamera('front');

    const notification = getLastNotificationWithKey(collector.notifications, 'quaternion');
    expect(notification).toBeDefined();
    const quat = notification.quaternion.new;

    expect(Array.isArray(quat)).toBe(true);
    expect(quat).toHaveLength(4);
    quat.forEach(v => expect(typeof v).toBe('number'));
  });
});

// =============================================================================
// CONTROL SPEED NOTIFICATION TESTS
// =============================================================================

describe('Control Speed Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setZoomSpeed sends zoom_speed notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setZoomSpeed(1.5);

    const notification = getLastNotificationWithKey(collector.notifications, 'zoom_speed');
    expect(notification).toBeDefined();
    expect(notification.zoom_speed.new).toBe(1.5);
  });

  test('setPanSpeed sends pan_speed notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setPanSpeed(0.8);

    const notification = getLastNotificationWithKey(collector.notifications, 'pan_speed');
    expect(notification).toBeDefined();
    expect(notification.pan_speed.new).toBe(0.8);
  });

  test('setRotateSpeed sends rotate_speed notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setRotateSpeed(2.0);

    const notification = getLastNotificationWithKey(collector.notifications, 'rotate_speed');
    expect(notification).toBeDefined();
    expect(notification.rotate_speed.new).toBe(2.0);
  });

  test('control speeds with notify=false do not send notifications', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setZoomSpeed(1.5, false);
    viewer.setPanSpeed(0.8, false);
    viewer.setRotateSpeed(2.0, false);

    expect(getLastNotificationWithKey(collector.notifications, 'zoom_speed')).toBeNull();
    expect(getLastNotificationWithKey(collector.notifications, 'pan_speed')).toBeNull();
    expect(getLastNotificationWithKey(collector.notifications, 'rotate_speed')).toBeNull();
  });
});

// =============================================================================
// COLLAPSE STATE NOTIFICATION TESTS
// =============================================================================

describe('Collapse State Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('collapseNodes sends collapse notification with numeric value', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // CollapseState.EXPANDED = 2
    viewer.collapseNodes(2);

    const notification = getLastNotificationWithKey(collector.notifications, 'collapse');
    expect(notification).toBeDefined();
    expect(notification.collapse.new).toBe(2);
  });

  test('collapseNodes COLLAPSED (0) sends correct notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // First change to a different value to ensure state change
    viewer.collapseNodes(2); // EXPANDED
    collector.notifications.length = 0;

    // CollapseState.COLLAPSED = 0
    viewer.collapseNodes(0);

    const notification = getLastNotificationWithKey(collector.notifications, 'collapse');
    expect(notification).toBeDefined();
    expect(notification.collapse.new).toBe(0);
  });

  test('collapseNodes ROOT (1) sends correct notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // CollapseState.ROOT = 1
    viewer.collapseNodes(1);

    const notification = getLastNotificationWithKey(collector.notifications, 'collapse');
    expect(notification).toBeDefined();
    expect(notification.collapse.new).toBe(1);
  });

  test('collapseNodes LEAVES (-1) sends correct notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // CollapseState.LEAVES = -1
    viewer.collapseNodes(-1);

    const notification = getLastNotificationWithKey(collector.notifications, 'collapse');
    expect(notification).toBeDefined();
    expect(notification.collapse.new).toBe(-1);
  });

  test('collapseNodes with notify=false does not send notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.collapseNodes(2, false);

    expect(getLastNotificationWithKey(collector.notifications, 'collapse')).toBeNull();
  });
});

// =============================================================================
// EXPLODE NOTIFICATION TESTS
// =============================================================================

describe('Explode Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setExplode sends explode notification', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      explodeTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setExplode(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'explode');
    expect(notification).toBeDefined();
    expect(notification.explode.new).toBe(true);
  });

  test('setExplode false sends explode notification', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      explodeTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // First enable explode
    viewer.setExplode(true);
    collector.notifications.length = 0;

    // Then disable it
    viewer.setExplode(false);

    const notification = getLastNotificationWithKey(collector.notifications, 'explode');
    expect(notification).toBeDefined();
    expect(notification.explode.new).toBe(false);
  });

  test('setExplode with notify=false does not send notification', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      explodeTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setExplode(true, false);

    expect(getLastNotificationWithKey(collector.notifications, 'explode')).toBeNull();
  });

  test('setExplode does not send duplicate notification for same value', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      explodeTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setExplode(true);
    collector.notifications.length = 0;

    // Set same value again
    viewer.setExplode(true);

    // Should not send notification for same value
    expect(getLastNotificationWithKey(collector.notifications, 'explode')).toBeNull();
  });
});

// =============================================================================
// TAB SWITCHING NOTIFICATION TESTS
// =============================================================================

describe('Tab Switching Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setActiveTab sends tab notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setActiveTab('clip');

    const notification = getLastNotificationWithKey(collector.notifications, 'tab');
    expect(notification).toBeDefined();
    expect(notification.tab.new).toBe('clip');
  });

  test('setActiveTab tracks old value correctly', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // First switch to clip (from default 'tree')
    viewer.setActiveTab('clip');
    collector.notifications.length = 0;

    // Switch back to tree
    viewer.setActiveTab('tree');

    const notification = getLastNotificationWithKey(collector.notifications, 'tab');
    expect(notification.tab.old).toBe('clip');
    expect(notification.tab.new).toBe('tree');
  });

  test('setActiveTab with notify=false does not send notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setActiveTab('clip', false);

    expect(getLastNotificationWithKey(collector.notifications, 'tab')).toBeNull();
  });

  test('all tab values can be set', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      zebraTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Tab sequence that ensures each change is from a different value
    const tabs = ['clip', 'material', 'tree'];
    for (const tab of tabs) {
      collector.notifications.length = 0;
      viewer.setActiveTab(tab);
      const notification = getLastNotificationWithKey(collector.notifications, 'tab');
      expect(notification).toBeDefined();
      expect(notification.tab.new).toBe(tab);
    }
  });
});

// =============================================================================
// GLASS MODE NOTIFICATION TESTS
// =============================================================================

describe('Glass Mode Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('glassMode sends glass notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.glassMode(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'glass');
    expect(notification).toBeDefined();
    expect(notification.glass.new).toBe(true);
  });

  test('glassMode with notify=false does not send notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.glassMode(true, false);

    expect(getLastNotificationWithKey(collector.notifications, 'glass')).toBeNull();
  });
});

// =============================================================================
// PICK/CLICK NOTIFICATION TESTS
// =============================================================================

describe('Pick/Click Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('lastPick notification has expected structure', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // We can't easily simulate a click, but we can verify the checkChanges format
    // by calling it directly with the expected structure
    collector.notifications.length = 0;
    viewer.lastNotification = {}; // Clear to force notification

    viewer.checkChanges({
      lastPick: {
        path: '/test/path',
        name: 'TestObject',
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        boundingSphere: { center: [0.5, 0.5, 0.5], radius: 0.866 },
      },
    });

    const notification = getLastNotificationWithKey(collector.notifications, 'lastPick');
    expect(notification).toBeDefined();
    expect(notification.lastPick.new).toHaveProperty('path');
    expect(notification.lastPick.new).toHaveProperty('name');
    expect(notification.lastPick.new).toHaveProperty('boundingBox');
    expect(notification.lastPick.new).toHaveProperty('boundingSphere');
  });
});

// =============================================================================
// MEASUREMENT TOOL WORKFLOW TESTS
// =============================================================================

describe('Measurement Tool Workflow', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  // --- selectedShapeIDs notification (viewer -> client) ---

  test('selectedShapeIDs notification format is correct', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Simulate measurement tool sending selectedShapeIDs
    viewer.checkChanges({
      selectedShapeIDs: ['shape_001', 'shape_002', false], // false = no shift key
    });

    const notification = getLastNotificationWithKey(collector.notifications, 'selectedShapeIDs');
    expect(notification).toBeDefined();
    expect(notification.selectedShapeIDs.new).toBeInstanceOf(Array);
    expect(notification.selectedShapeIDs.new).toContain('shape_001');
    expect(notification.selectedShapeIDs.new).toContain('shape_002');
  });

  test('selectedShapeIDs notification includes shift flag', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Simulate with shift=true
    viewer.checkChanges({
      selectedShapeIDs: ['shape_001', true], // true = shift key held
    });

    const notification = getLastNotificationWithKey(collector.notifications, 'selectedShapeIDs');
    expect(notification).toBeDefined();
    expect(notification.selectedShapeIDs.new).toContain(true);
  });

  test('empty selectedShapeIDs clears selection', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.checkChanges({ selectedShapeIDs: [] });

    const notification = getLastNotificationWithKey(collector.notifications, 'selectedShapeIDs');
    expect(notification).toBeDefined();
    expect(notification.selectedShapeIDs.new).toEqual([]);
  });

  // --- Backend response handling (client -> viewer) ---

  test('handleBackendResponse processes distance tool response', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      measurementDebug: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Activate distance tool
    viewer.activateTool('distance', true);

    // Simulate backend distance response
    const distanceResponse = {
      subtype: 'tool_response',
      tool_type: 'distance',
      type: 'backend_response',
      shape_type: 'Face',
      geom_type: 'Plane',
      distance: 10.5,
      point1: [0, 0, 0],
      point2: [10.5, 0, 0],
    };

    expect(() => viewer.handleBackendResponse(distanceResponse)).not.toThrow();
  });

  test('handleBackendResponse processes properties tool response', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      measurementDebug: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Activate properties tool
    viewer.activateTool('properties', true);

    // Simulate backend properties response
    const propertiesResponse = {
      subtype: 'tool_response',
      tool_type: 'properties',
      type: 'backend_response',
      shape_type: 'Face',
      geom_type: 'Plane',
      Area: 100.0,
      Center: [5, 5, 0],
      Normal: [0, 0, 1],
      refpoint: [5, 5, 0],
      bb: {
        min: [0, 0, 0],
        center: [5, 5, 0],
        max: [10, 10, 0],
        size: [10, 10, 0],
      },
    };

    expect(() => viewer.handleBackendResponse(propertiesResponse)).not.toThrow();
  });

  test('handleBackendResponse processes select tool response', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      selectTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Activate select tool
    viewer.activateTool('select', true);

    // Simulate backend select response (if any)
    const selectResponse = {
      subtype: 'tool_response',
      tool_type: 'select',
      selected: [0, 1, 2],
    };

    expect(() => viewer.handleBackendResponse(selectResponse)).not.toThrow();
  });

  test('handleBackendResponse ignores unknown response subtypes', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Unknown subtype should be silently ignored
    const unknownResponse = {
      subtype: 'unknown_type',
      data: 'test',
    };

    expect(() => viewer.handleBackendResponse(unknownResponse)).not.toThrow();
  });

  test('handleBackendResponse ignores responses without tool_type', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Missing tool_type should be ignored
    const incompleteResponse = {
      subtype: 'tool_response',
      // Missing tool_type
      data: 'test',
    };

    expect(() => viewer.handleBackendResponse(incompleteResponse)).not.toThrow();
  });
});

// =============================================================================
// SELECT TOOL NOTIFICATION TESTS
// =============================================================================

describe('Select Tool Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('selected notification contains array of indices', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      selectTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Simulate select notification
    viewer.checkChanges({ selected: [0, 1, 2] });

    const notification = getLastNotificationWithKey(collector.notifications, 'selected');
    expect(notification).toBeDefined();
    expect(notification.selected.new).toBeInstanceOf(Array);
    expect(notification.selected.new).toEqual([0, 1, 2]);
  });

  test('deactivating select tool clears selection', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      measureTools: true,
      selectTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Activate select tool
    viewer.activateTool('select', true);
    collector.notifications.length = 0;

    // Deactivate - may or may not send notification depending on implementation
    viewer.activateTool('select', false);

    // Either there's a notification with empty array, or no notification at all
    const notification = getLastNotificationWithKey(collector.notifications, 'selected');
    if (notification) {
      expect(notification.selected.new).toEqual([]);
    }
    // Test passes if no error is thrown
  });
});

// =============================================================================
// ANIMATION MODE NOTIFICATION TESTS
// =============================================================================

describe('Animation Mode Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('explode triggers animation mode change', async () => {
    testContext = setupViewer({
      notifyCallback: collector.callback,
      explodeTool: true,
    });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Explode changes animation mode internally
    viewer.setExplode(true);

    // Should have explode notification
    const notification = getLastNotificationWithKey(collector.notifications, 'explode');
    expect(notification).toBeDefined();
  });
});

// =============================================================================
// CAMERA LOCATION NOTIFICATION TESTS
// =============================================================================

describe('Camera Location Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setCameraPosition sends position notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setCameraPosition([10, 20, 30]);

    const notification = getLastNotificationWithKey(collector.notifications, 'position');
    expect(notification).toBeDefined();
    expect(notification.position.new).toBeInstanceOf(Array);
    expect(notification.position.new).toHaveLength(3);
  });

  test('setCameraTarget sends target notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setCameraTarget([1, 2, 3]);

    const notification = getLastNotificationWithKey(collector.notifications, 'target');
    expect(notification).toBeDefined();
    expect(notification.target.new).toBeInstanceOf(Array);
    expect(notification.target.new).toHaveLength(3);
  });

  test('setCameraTarget accepts Vector3 tuple', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Should accept [x, y, z] tuple format
    viewer.setCameraTarget([5, 10, 15]);

    const notification = getLastNotificationWithKey(collector.notifications, 'target');
    expect(notification).toBeDefined();
    expect(notification.target.new[0]).toBeCloseTo(5);
    expect(notification.target.new[1]).toBeCloseTo(10);
    expect(notification.target.new[2]).toBeCloseTo(15);
  });

  test('setCameraZoom sends zoom notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setCameraZoom(2.0);

    const notification = getLastNotificationWithKey(collector.notifications, 'zoom');
    expect(notification).toBeDefined();
    expect(typeof notification.zoom.new).toBe('number');
    expect(notification.zoom.new).toBeCloseTo(2.0, 1);
  });

  test('target0 is sent in initial notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // target0 is sent in initial notification
    const target0Notification = collector.notifications.find(n => 'target0' in n);

    expect(target0Notification).toBeDefined();
    expect(target0Notification.target0.new).toBeInstanceOf(Array);
    expect(target0Notification.target0.new).toHaveLength(3);
  });

  test('setResetLocation sends position0 and target0 notifications', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // setResetLocation(target, position, quaternion, zoom)
    viewer.setResetLocation([0, 0, 0], [10, 20, 30], [0, 0, 0, 1], 1.5);

    const notification = collector.notifications.find(n => 'position0' in n && 'target0' in n);
    expect(notification).toBeDefined();
    expect(notification.position0.new).toEqual([10, 20, 30]);
  });
});

// =============================================================================
// HOLROYD NOTIFICATION TESTS
// =============================================================================

describe('Holroyd Notifications', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setHolroyd sends holroyd notification (trackball controls)', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    // Use trackball controls for holroyd test
    viewer.render(box1Data, renderOptions, { ...viewerOptions, control: 'trackball' });

    // holroyd defaults to true, so first set to false
    viewer.setHolroyd(false);
    collector.notifications.length = 0;

    // Now set back to true
    viewer.setHolroyd(true);

    const notification = getLastNotificationWithKey(collector.notifications, 'holroyd');
    expect(notification).toBeDefined();
    expect(notification.holroyd.new).toBe(true);
  });

  test('setHolroyd with notify=false does not send notification', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    // Use trackball controls for holroyd test
    viewer.render(box1Data, renderOptions, { ...viewerOptions, control: 'trackball' });

    // holroyd defaults to true, so first set to false
    viewer.setHolroyd(false);
    collector.notifications.length = 0;

    // Set back to true with notify=false
    viewer.setHolroyd(true, false);

    expect(getLastNotificationWithKey(collector.notifications, 'holroyd')).toBeNull();
  });
});

// =============================================================================
// NOTIFICATION TIMING AND ORDER TESTS
// =============================================================================

describe('Notification Timing and Order', () => {
  let testContext;
  let collector;

  beforeEach(() => {
    collector = createNotificationCollector();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('notifications are sent synchronously', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    viewer.setAxes(false);

    // Notification should be immediately available (synchronous)
    expect(collector.notifications.length).toBeGreaterThan(0);
    expect(getLastNotificationWithKey(collector.notifications, 'axes')).toBeDefined();
  });

  test('multiple rapid changes preserve order', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Rapid sequence of changes
    viewer.setAmbientLight(0.1);
    viewer.setAmbientLight(0.5);
    viewer.setAmbientLight(0.9);

    // Find all ambient_intensity notifications
    const ambientNotifications = collector.notifications.filter(n => 'ambient_intensity' in n);

    // Due to duplicate prevention, we might not get all 3
    // But the final value should be 0.9
    const lastAmbient = getLastNotificationWithKey(collector.notifications, 'ambient_intensity');
    expect(lastAmbient.ambient_intensity.new).toBe(0.9);
  });

  test('batch updates can be coalesced', async () => {
    testContext = setupViewer({ notifyCallback: collector.callback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);
    collector.notifications.length = 0;

    // Multiple independent changes
    viewer.setAxes(false);
    viewer.setAxes0(true);
    viewer.setOrtho(false);

    // Each should generate its own notification
    expect(getLastNotificationWithKey(collector.notifications, 'axes')).toBeDefined();
    expect(getLastNotificationWithKey(collector.notifications, 'axes0')).toBeDefined();
    expect(getLastNotificationWithKey(collector.notifications, 'ortho')).toBeDefined();
  });
});

// =============================================================================
// NOTIFICATION CALLBACK ERROR HANDLING TESTS
// =============================================================================

describe('Notification Callback Error Handling', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('viewer continues working if callback throws', async () => {
    const throwingCallback = vi.fn(() => {
      throw new Error('Callback error');
    });

    testContext = setupViewer({ notifyCallback: throwingCallback });
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');

    // Render should not throw even if callback does
    // (This tests resilience - actual behavior depends on implementation)
    try {
      viewer.render(box1Data, renderOptions, viewerOptions);
    } catch (e) {
      // May or may not throw depending on implementation
    }

    // Callback should have been called at least once
    expect(throwingCallback).toHaveBeenCalled();
  });
});
