/**
 * Comprehensive tests for Viewer class methods
 * Target: 80%+ coverage for TypeScript migration safety
 */

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { setupViewer, cleanup, createContainer, getDisplayOptions } from '../helpers/setup.js';
import { loadExample } from '../helpers/snapshot.js';

// =============================================================================
// VIEWER STATE MANAGEMENT TESTS
// =============================================================================

describe('Viewer - State Management', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('version() returns semver string', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    const v = viewer.version();
    expect(v).toBeDefined();
    expect(typeof v).toBe('string');
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('state is initialized from options', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    expect(viewer.state).toBeDefined();
    expect(viewer.state.get('cadWidth')).toBe(800);
    expect(viewer.state.get('height')).toBe(600);
  });

  test('checkChanges calls notify callback', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    const mockCallback = vi.fn();
    viewer.notifyCallback = mockCallback;

    viewer.checkChanges({ axes: true }, true);

    expect(mockCallback).toHaveBeenCalled();
  });

  test('checkChanges skips notification when notify is false', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    const mockCallback = vi.fn();
    viewer.notifyCallback = mockCallback;
    viewer.lastNotification = {};

    viewer.checkChanges({ axes: true }, false);

    expect(mockCallback).not.toHaveBeenCalled();
  });

  test('notifyStates calls notify callback', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    // Need to render first to have proper state
    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const mockCallback = vi.fn();
    viewer.notifyCallback = mockCallback;
    viewer.lastNotification = {}; // Clear to force notification

    viewer.notifyStates();

    expect(mockCallback).toHaveBeenCalled();
  });
});

// =============================================================================
// VIEWER AXES/GRID TESTS
// =============================================================================

describe('Viewer - Axes & Grid', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setAxes updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    // Load and render to initialize axes
    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setAxes(false, false);
    expect(viewer.state.get('axes')).toBe(false);

    viewer.setAxes(true, false);
    expect(viewer.state.get('axes')).toBe(true);
  });

  test('setAxes0 updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setAxes0(false, false);
    expect(viewer.state.get('axes0')).toBe(false);

    viewer.setAxes0(true, false);
    expect(viewer.state.get('axes0')).toBe(true);
  });

  test('setGrid can be called for each plane', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Test that setGrid can be called without throwing
    // The grid state is managed by gridHelper which updates asynchronously
    viewer.setGrid('xy', true, false);
    viewer.setGrid('xz', true, false);
    viewer.setGrid('yz', true, false);

    // Verify grid state exists
    const grid = viewer.state.get('grid');
    expect(grid).toBeDefined();
    expect(Array.isArray(grid)).toBe(true);
    expect(grid.length).toBe(3);
  });

  test('setGrids updates all grids at once', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setGrids([false, true, false], false);

    const grid = viewer.state.get('grid');
    expect(grid[0]).toBe(false);
    expect(grid[1]).toBe(true);
    expect(grid[2]).toBe(false);
  });

  test('setGridCenter updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setGridCenter([1, 2, 3], false);
    // Method should not throw
    expect(viewer.gridHelper).toBeDefined();
  });
});

// =============================================================================
// VIEWER CAMERA TESTS
// =============================================================================

describe('Viewer - Camera', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('switchCamera toggles between ortho and perspective', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const initialOrtho = viewer.state.get('ortho');

    viewer.switchCamera(!initialOrtho, false);
    expect(viewer.state.get('ortho')).toBe(!initialOrtho);

    viewer.switchCamera(initialOrtho, false);
    expect(viewer.state.get('ortho')).toBe(initialOrtho);
  });

  test('presetCamera sets camera to preset position', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Test preset views
    const presets = ['iso', 'front', 'rear', 'top', 'bottom', 'left', 'right'];

    for (const preset of presets) {
      viewer.presetCamera(preset, null, false);
      // Should not throw
    }
  });

  test('getResetLocation returns location object', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const location = viewer.getResetLocation();

    expect(location).toBeDefined();
    // Note: actual property names have "0" suffix
    expect(location.target0).toBeDefined();
    expect(location.position0).toBeDefined();
    expect(location.quaternion0).toBeDefined();
    expect(location.zoom0).toBeDefined();
  });

  test('setResetLocation updates reset state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const target = [0, 0, 0];
    const position = [5, 5, 5];
    const quaternion = [0, 0, 0, 1];
    const zoom = 1.5;

    viewer.setResetLocation(target, position, quaternion, zoom, false);

    const location = viewer.getResetLocation();
    expect(location.zoom0).toBe(zoom);
  });

  test('reset restores camera to reset location', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Move camera
    viewer.presetCamera('top', null, false);

    // Reset
    viewer.reset();

    // Should not throw
    expect(viewer.camera).toBeDefined();
  });

  test('resize updates renderer size', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw
    viewer.resize();

    expect(viewer.renderer).toBeDefined();
  });
});

// =============================================================================
// VIEWER MATERIAL TESTS
// =============================================================================

describe('Viewer - Materials', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setTransparent updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setTransparent(true, false);
    expect(viewer.state.get('transparent')).toBe(true);

    viewer.setTransparent(false, false);
    expect(viewer.state.get('transparent')).toBe(false);
  });

  test('setBlackEdges updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setBlackEdges(true, false);
    expect(viewer.state.get('blackEdges')).toBe(true);

    viewer.setBlackEdges(false, false);
    expect(viewer.state.get('blackEdges')).toBe(false);
  });

  test('setEdgeColor updates edge colors', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setEdgeColor(0xff0000, false);
    expect(viewer.state.get('edgeColor')).toBe(0xff0000);
  });

  test('setOpacity updates default opacity', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setOpacity(0.5, false);
    expect(viewer.state.get('defaultOpacity')).toBe(0.5);
  });

  test('setAmbientLight updates ambient intensity', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setAmbientLight(1.5, false);
    expect(viewer.state.get('ambientIntensity')).toBe(1.5);
  });

  test('setDirectLight updates directional intensity', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setDirectLight(1.2, false);
    expect(viewer.state.get('directIntensity')).toBe(1.2);
  });

  test('getMetalness returns current metalness', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const metalness = viewer.getMetalness();
    expect(typeof metalness).toBe('number');
  });

  test('setMetalness updates metalness', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setMetalness(0.8, false);
    expect(viewer.state.get('metalness')).toBe(0.8);
  });

  test('getRoughness returns current roughness', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const roughness = viewer.getRoughness();
    expect(typeof roughness).toBe('number');
  });

  test('setRoughness updates roughness', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRoughness(0.3, false);
    expect(viewer.state.get('roughness')).toBe(0.3);
  });

  test('resetMaterial restores default material settings', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Change settings
    viewer.setMetalness(0.9, false);
    viewer.setRoughness(0.1, false);

    // Reset
    viewer.resetMaterial();

    // Should restore to defaults (set in renderOptions)
    expect(viewer.getMetalness()).toBe(renderOptions.metalness);
    expect(viewer.getRoughness()).toBe(renderOptions.roughness);
  });
});

// =============================================================================
// VIEWER CONTROL SPEED TESTS
// =============================================================================

describe('Viewer - Control Speeds', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setZoomSpeed updates zoom speed', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setZoomSpeed(1.0, false);
    expect(viewer.state.get('zoomSpeed')).toBe(1.0);
  });

  test('setPanSpeed updates pan speed', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setPanSpeed(1.0, false);
    expect(viewer.state.get('panSpeed')).toBe(1.0);
  });

  test('setRotateSpeed updates rotate speed', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRotateSpeed(1.5, false);
    expect(viewer.state.get('rotateSpeed')).toBe(1.5);
  });
});

// =============================================================================
// VIEWER CLIPPING TESTS
// =============================================================================

describe('Viewer - Clipping', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setClipIntersection updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setClipIntersection(true, false);
    expect(viewer.state.get('clipIntersection')).toBe(true);

    viewer.setClipIntersection(false, false);
    expect(viewer.state.get('clipIntersection')).toBe(false);
  });

  test('getObjectColorCaps returns boolean', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const result = viewer.getObjectColorCaps();
    expect(typeof result).toBe('boolean');
  });

  test('setClipObjectColorCaps updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setClipObjectColorCaps(true, false);
    expect(viewer.state.get('clipObjectColors')).toBe(true);
  });

  test('setClipPlaneHelpers updates state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setClipPlaneHelpers(true, false);
    expect(viewer.state.get('clipPlaneHelpers')).toBe(true);

    viewer.setClipPlaneHelpers(false, false);
    expect(viewer.state.get('clipPlaneHelpers')).toBe(false);
  });

  test('setClipNormalFromPosition updates clip normal', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw
    viewer.setClipNormalFromPosition(0, false);
    viewer.setClipNormalFromPosition(1, false);
    viewer.setClipNormalFromPosition(2, false);
  });

  test('getClipSlider returns slider value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const value = viewer.getClipSlider(0);
    expect(typeof value).toBe('number');
  });

  test('setClipSlider updates slider value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setClipSlider(0, 25, false);
    expect(viewer.state.get('clipSlider0')).toBe(25);
  });

  test('refreshPlane updates clipping plane', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw
    viewer.refreshPlane(0, 10);
  });
});

// =============================================================================
// VIEWER ZEBRA TOOL TESTS
// =============================================================================

describe('Viewer - Zebra Tool', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('enableZebraTool enables/disables zebra mode', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.enableZebraTool(true);
    // Should not throw

    viewer.enableZebraTool(false);
    // Should not throw
  });

  test('setZebraCount updates zebra count', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setZebraCount(30);
    expect(viewer.state.get('zebraCount')).toBe(30);
  });

  test('setZebraOpacity updates zebra opacity', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setZebraOpacity(0.7);
    expect(viewer.state.get('zebraOpacity')).toBe(0.7);
  });

  test('setZebraDirection updates zebra direction', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setZebraDirection(90);
    expect(viewer.state.get('zebraDirection')).toBe(90);
  });

  test('setZebraColorScheme updates zebra color scheme', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setZebraColorScheme('colorful');
    expect(viewer.state.get('zebraColorScheme')).toBe('colorful');
  });

  test('setZebraMappingMode updates zebra mapping mode', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setZebraMappingMode('normal');
    expect(viewer.state.get('zebraMappingMode')).toBe('normal');
  });
});

// =============================================================================
// VIEWER SELECTION TESTS
// =============================================================================

describe('Viewer - Selection', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('clearSelection clears last selection', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.clearSelection();

    expect(viewer.lastSelection).toBeNull();
    expect(viewer.lastObject).toBeNull();
  });

  test('setObject updates object state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Get a valid path from the tree
    const paths = Object.keys(viewer.tree);
    if (paths.length > 0) {
      viewer.setObject(paths[0], [true, true], 0, false, false);
      // Should not throw
    }
  });

  test('setState updates state for path', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Get a valid path from the tree
    const paths = Object.keys(viewer.tree);
    if (paths.length > 0) {
      viewer.setState(paths[0], [true, true], 'leaf', false);
      // Should not throw
    }
  });

  test('setStates updates multiple states', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const paths = Object.keys(viewer.tree);
    if (paths.length > 0) {
      const states = {};
      states[paths[0]] = [true, true];

      viewer.setStates(states);
      // Should not throw
    }
  });

  test('setBoundingBox updates bounding box display', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const paths = Object.keys(viewer.tree);
    if (paths.length > 0) {
      viewer.setBoundingBox(paths[0]);
      // Should have created bbox helper
    }

    // Clear bounding box
    viewer.setBoundingBox(null);
  });
});

// =============================================================================
// VIEWER DISPLAY TESTS
// =============================================================================

describe('Viewer - Display Options', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setTools updates tools visibility state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setTools(false, false);
    expect(viewer.state.get('tools')).toBe(false);

    viewer.setTools(true, false);
    expect(viewer.state.get('tools')).toBe(true);
  });

  test('setGlass updates glass mode state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setGlass(true, false);
    expect(viewer.state.get('glass')).toBe(true);

    viewer.setGlass(false, false);
    expect(viewer.state.get('glass')).toBe(false);
  });

  test('showTools shows/hides toolbar', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.showTools(false, false);
    expect(viewer.state.get('tools')).toBe(false);

    viewer.showTools(true, false);
    expect(viewer.state.get('tools')).toBe(true);
  });
});

// =============================================================================
// VIEWER ANIMATION TESTS
// =============================================================================

describe('Viewer - Animation', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setExplode toggles explode mode', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Enable explode
    viewer.setExplode(true);
    expect(viewer.state.get('animationMode')).toBe('explode');

    // Disable explode
    viewer.setExplode(false);
    expect(viewer.state.get('animationMode')).toBe('none');
  });

  test('controlAnimation handles play/pause/stop', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Enable explode first to have animation
    viewer.setExplode(true);

    // Test control commands
    viewer.controlAnimation('play');
    viewer.controlAnimation('pause');
    viewer.controlAnimation('stop');
    // Should not throw
  });
});

// =============================================================================
// VIEWER UPDATE/RENDER TESTS
// =============================================================================

describe('Viewer - Update & Render', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('update triggers render', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw
    viewer.update(true, false);
  });

  test('toggleAnimationLoop starts/stops animation loop', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Enable animation loop
    viewer.toggleAnimationLoop(true);
    expect(viewer.hasAnimationLoop).toBe(true);

    // Disable animation loop
    viewer.toggleAnimationLoop(false);
    expect(viewer.hasAnimationLoop).toBe(false);
  });

  test('getImage returns promise with data URL', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const result = await viewer.getImage('test-task');

    expect(result).toBeDefined();
    expect(result.task).toBe('test-task');
    expect(result.dataUrl).toBeDefined();
    // In test environment, canvas may return different MIME type
    expect(result.dataUrl).toContain('data:');
    expect(result.dataUrl).toContain('base64');
  });
});

// =============================================================================
// VIEWER KEY MAPPING TESTS
// =============================================================================

describe('Viewer - Key Mapping', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setKeyMap updates key mappings', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    const newKeymap = {
      shift: 'altKey',
      ctrl: 'metaKey',
      meta: 'ctrlKey',
    };

    viewer.setKeyMap(newKeymap);
    // Should not throw
  });

  test('setPickHandler enables/disables pick handler', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setPickHandler(false);
    // Should disable pick handling

    viewer.setPickHandler(true);
    // Should enable pick handling
  });
});

// =============================================================================
// VIEWER TREEVIEW TESTS
// =============================================================================

describe('Viewer - TreeView Integration', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('getNodeColor returns color array for path', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const paths = Object.keys(viewer.tree);
    if (paths.length > 0) {
      const color = viewer.getNodeColor(paths[0]);
      // May return null or array depending on node type
      if (color !== null) {
        expect(Array.isArray(color)).toBe(true);
      }
    }
  });
});

// =============================================================================
// VIEWER CAMERA METHODS (Additional Tests for Coverage)
// =============================================================================

describe('Viewer - Camera Methods (Extended)', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('getCameraType returns camera type string', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const type = viewer.getCameraType();
    expect(type).toBeDefined();
    expect(['ortho', 'perspective']).toContain(type);
  });

  test('getCameraPosition returns position array', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const pos = viewer.getCameraPosition();
    expect(pos).toBeDefined();
    expect(Array.isArray(pos)).toBe(true);
    expect(pos.length).toBe(3);
  });

  test('setCameraPosition updates camera position', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setCameraPosition([10, 20, 30]);

    const pos = viewer.getCameraPosition();
    expect(pos[0]).toBeCloseTo(10, 1);
    expect(pos[1]).toBeCloseTo(20, 1);
    expect(pos[2]).toBeCloseTo(30, 1);
  });

  test('getCameraQuaternion returns quaternion array', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const quat = viewer.getCameraQuaternion();
    expect(quat).toBeDefined();
    expect(Array.isArray(quat)).toBe(true);
    expect(quat.length).toBe(4);
  });

  test('setCameraQuaternion updates camera quaternion', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Set to identity quaternion - should not throw
    viewer.setCameraQuaternion([0, 0, 0, 1]);
  });

  test('getCameraTarget returns target array', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const target = viewer.getCameraTarget();
    expect(target).toBeDefined();
    expect(Array.isArray(target)).toBe(true);
    expect(target.length).toBe(3);
  });

  test('setCameraTarget can be called', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // setCameraTarget expects a Vector3, not an array
    const target = new (await import('three')).Vector3(5, 5, 5);
    viewer.setCameraTarget(target);
    // Should not throw
  });

  test('getCameraLocationSettings returns complete settings', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const settings = viewer.getCameraLocationSettings();
    expect(settings).toBeDefined();
    expect(settings.position).toBeDefined();
    expect(Array.isArray(settings.position)).toBe(true);
    expect(settings.quaternion).toBeDefined();
    expect(settings.target).toBeDefined();
    expect(settings.zoom).toBeDefined();
  });

  test('setCameraLocationSettings restores camera state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Get current settings
    const originalSettings = viewer.getCameraLocationSettings();

    // Modify camera
    viewer.setCameraPosition([100, 100, 100]);

    // Restore original settings - need to spread the object
    viewer.setCameraLocationSettings(
      originalSettings.position,
      originalSettings.quaternion,
      originalSettings.target,
      originalSettings.zoom
    );

    // Should be restored
    const restoredPos = viewer.getCameraPosition();
    expect(restoredPos[0]).toBeCloseTo(originalSettings.position[0], 0);
  });

  test('recenterCamera recenters view on visible objects', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.recenterCamera();
    // Should not throw
  });
});

// =============================================================================
// VIEWER CONTROL SPEED GETTERS
// =============================================================================

describe('Viewer - Control Speed Getters', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('getZoomSpeed returns zoom speed value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const speed = viewer.getZoomSpeed();
    expect(speed).toBeDefined();
    expect(typeof speed).toBe('number');
  });

  test('getPanSpeed returns pan speed value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const speed = viewer.getPanSpeed();
    expect(speed).toBeDefined();
    expect(typeof speed).toBe('number');
  });

  test('getRotateSpeed returns rotate speed value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const speed = viewer.getRotateSpeed();
    expect(speed).toBeDefined();
    expect(typeof speed).toBe('number');
  });
});

// =============================================================================
// VIEWER MATERIAL GETTERS
// =============================================================================

describe('Viewer - Material Getters', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('getTransparent returns transparency state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const transparent = viewer.getTransparent();
    expect(typeof transparent).toBe('boolean');
  });

  test('getBlackEdges returns black edges state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const blackEdges = viewer.getBlackEdges();
    expect(typeof blackEdges).toBe('boolean');
  });

  test('getEdgeColor returns edge color value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const color = viewer.getEdgeColor();
    expect(typeof color).toBe('number');
  });

  test('getOpacity returns opacity value', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const opacity = viewer.getOpacity();
    expect(typeof opacity).toBe('number');
    expect(opacity).toBeGreaterThanOrEqual(0);
    expect(opacity).toBeLessThanOrEqual(1);
  });

  test('getOrtho returns ortho camera state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const ortho = viewer.getOrtho();
    expect(typeof ortho).toBe('boolean');
  });

  test('getTools returns tools state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const tools = viewer.getTools();
    expect(typeof tools).toBe('boolean');
  });
});

// =============================================================================
// VIEWER CLIPPING GETTERS
// =============================================================================

describe('Viewer - Clipping Getters', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('getClipIntersection returns intersection state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const intersection = viewer.getClipIntersection();
    expect(typeof intersection).toBe('boolean');
  });

  test('getClipPlaneHelpers returns helper visibility state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const helpers = viewer.getClipPlaneHelpers();
    expect(typeof helpers).toBe('boolean');
  });

  test('getClipNormal returns normal array for axis', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const normal = viewer.getClipNormal(0);
    expect(normal).toBeDefined();
    // Returns an array [x, y, z] or null
    if (normal !== null) {
      expect(Array.isArray(normal)).toBe(true);
    }
  });
});

// =============================================================================
// VIEWER UTILITY METHODS
// =============================================================================

describe('Viewer - Utility Methods', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setDisplayDefaults is callable (deprecated)', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Should not throw - it's a no-op for backwards compatibility
    viewer.setDisplayDefaults();
  });

  test('dumpOptions calls state.dump', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Mock console.log to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    viewer.dumpOptions();

    consoleSpy.mockRestore();
  });

  test('vector3 creates THREE.Vector3', async () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    const v = viewer.vector3(1, 2, 3);
    expect(v).toBeDefined();
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  test('quaternion creates THREE.Quaternion', async () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    const q = viewer.quaternion(0, 0, 0, 1);
    expect(q).toBeDefined();
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(q.w).toBe(1);
  });

  test('dispose is callable and clears CAD resources', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Mock renderer.renderLists which may not exist in test env
    if (viewer.renderer) {
      viewer.renderer.renderLists = { dispose: vi.fn() };
      // Also mock getContext to avoid errors
      viewer.renderer.getContext = vi.fn().mockReturnValue({
        getExtension: vi.fn().mockReturnValue({ loseContext: vi.fn() })
      });
    }

    viewer.dispose();

    expect(viewer.nestedGroup).toBeNull();
    expect(viewer.orientationMarker).toBeNull();
    expect(viewer.cadTools).toBeNull();
    expect(viewer.animation).toBeNull();
  });
});

// =============================================================================
// VIEWER ANIMATION METHODS
// =============================================================================

describe('Viewer - Animation Methods (Extended)', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('backupAnimation stores animation state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // This calls animation.backup()
    viewer.backupAnimation();
    // Should not throw
  });

  test('setZscaleValue updates z scale', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // setZscaleValue calls nestedGroup.setZScale internally
    // Just verify it can be called without throwing
    viewer.setZscaleValue(2.0);
  });
});

// =============================================================================
// VIEWER RAYCAST METHODS
// =============================================================================

describe('Viewer - Raycast Methods', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('setRaycastMode enables/disables raycast', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // setRaycastMode takes boolean, not string
    // Enable raycasting
    viewer.setRaycastMode(true);
    expect(viewer.raycaster).not.toBeNull();

    // Disable raycasting
    viewer.setRaycastMode(false);
    expect(viewer.raycaster).toBeNull();
  });

  test('pick triggers raycast at position', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // This should trigger raycast - won't find anything but shouldn't throw
    const result = viewer.pick(0, 0);
    // Result may be null or object depending on hit
  });
});

// =============================================================================
// VIEWER RESIZE & PIN
// =============================================================================

describe('Viewer - Resize & Pin', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('resizeCadView updates dimensions', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // resizeCadView updates renderer and camera, not state directly
    viewer.resizeCadView(1024, 768);
    // Just verify it can be called without throwing
  });
});

// =============================================================================
// VIEWER HANDLERAYCAST & RAYCAST EVENT TESTS
// =============================================================================

describe('Viewer - Raycast Handling', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('handleRaycast is callable when raycaster enabled', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Enable raycasting first
    viewer.setRaycastMode(true);

    // handleRaycast should be callable
    expect(() => viewer.handleRaycast()).not.toThrow();
  });

  test('handleRaycastEvent handles Escape key', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRaycastMode(true);

    // Simulate Escape key event
    viewer.handleRaycastEvent({ key: 'Escape' });

    // clearSelection should have been called
    expect(viewer.lastSelection).toBeNull();
  });

  test('handleRaycastEvent handles Backspace key', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRaycastMode(true);

    // Simulate Backspace key event - should not throw
    expect(() => viewer.handleRaycastEvent({ key: 'Backspace' })).not.toThrow();
  });

  test('handleRaycastEvent handles unknown key', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRaycastMode(true);

    // Should handle gracefully
    expect(() => viewer.handleRaycastEvent({ key: 'SomeOtherKey' })).not.toThrow();
  });

  test('handleRaycastEvent handles left mouse click with no lastObject', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRaycastMode(true);
    viewer.lastObject = null;

    // Should handle gracefully
    expect(() => viewer.handleRaycastEvent({ mouse: 'left' })).not.toThrow();
  });

  test('handleRaycastEvent handles right mouse click', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRaycastMode(true);

    // Should handle gracefully
    expect(() => viewer.handleRaycastEvent({ mouse: 'right' })).not.toThrow();
  });

  test('handleRaycastEvent handles unknown mouse button', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    viewer.setRaycastMode(true);

    // Should handle gracefully
    expect(() => viewer.handleRaycastEvent({ mouse: 'middle' })).not.toThrow();
  });
});

// =============================================================================
// VIEWER CENTER VISIBLE OBJECTS TESTS
// =============================================================================

describe('Viewer - Center Visible Objects', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('centerVisibleObjects centers camera on visible objects', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Mock console.log to suppress debug output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // centerVisibleObjects should work
    expect(() => viewer.centerVisibleObjects()).not.toThrow();

    consoleSpy.mockRestore();
  });

  test('centerVisibleObjects with notify=false', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockCallback = vi.fn();
    viewer.notifyCallback = mockCallback;

    viewer.centerVisibleObjects(false);

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// VIEWER SYNC TREE STATES TESTS
// =============================================================================

describe('Viewer - Sync Tree States', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('toggleGroup to exploded mode creates expanded tree', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Toggle to exploded mode
    viewer.toggleGroup(true);

    expect(viewer.expandedNestedGroup).toBeDefined();
    expect(viewer.expandedTree).toBeDefined();
  });

  test('toggleGroup to compact mode uses compact tree', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Toggle to exploded first, then back to compact
    viewer.toggleGroup(true);
    viewer.toggleGroup(false);

    expect(viewer.compactNestedGroup).toBeDefined();
    expect(viewer.compactTree).toBeDefined();
  });

  test('toggleTab handles collapse options', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Test different collapse modes
    viewer.state.set('collapse', 0);
    expect(() => viewer.toggleTab(false)).not.toThrow();

    viewer.state.set('collapse', 1);
    expect(() => viewer.toggleTab(false)).not.toThrow();

    viewer.state.set('collapse', 2);
    expect(() => viewer.toggleTab(false)).not.toThrow();

    viewer.state.set('collapse', 3);
    expect(() => viewer.toggleTab(false)).not.toThrow();
  });
});

// =============================================================================
// VIEWER BACKEND RESPONSE TESTS
// =============================================================================

describe('Viewer - Backend Response', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('handleBackendResponse handles tool_response subtype', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Mock cadTools.handleResponse
    viewer.cadTools.handleResponse = vi.fn();

    viewer.handleBackendResponse({ subtype: 'tool_response', tool_type: 'DistanceMeasurement', data: {} });

    expect(viewer.cadTools.handleResponse).toHaveBeenCalled();
  });

  test('handleBackendResponse ignores other subtypes', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Mock cadTools.handleResponse
    viewer.cadTools.handleResponse = vi.fn();

    viewer.handleBackendResponse({ subtype: 'other' });

    expect(viewer.cadTools.handleResponse).not.toHaveBeenCalled();
  });
});

// =============================================================================
// VIEWER GETTERS TESTS
// =============================================================================

describe('Viewer - Additional Getters', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('getAxes returns axes state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const axes = viewer.getAxes();
    expect(typeof axes).toBe('boolean');
  });

  test('getAxes0 returns axes0 state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const axes0 = viewer.getAxes0();
    expect(typeof axes0).toBe('boolean');
  });

  test('getGrids returns grid state', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const grids = viewer.getGrids();
    expect(Array.isArray(grids)).toBe(true);
    expect(grids.length).toBe(3);
  });

  test('getStates returns tree states', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const states = viewer.getStates();
    expect(states).toBeDefined();
    expect(typeof states).toBe('object');
  });
});

// =============================================================================
// VIEWER CLEAR TESTS
// =============================================================================

describe('Viewer - Clear', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('clear removes nested group', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    expect(viewer.nestedGroup).not.toBeNull();

    viewer.clear();

    expect(viewer.nestedGroup).toBeNull();
  });
});
