import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { captureSceneState, captureMinimalSnapshot, loadExample } from '../helpers/snapshot.js';

describe('Examples - Snapshot Tests', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  // Small examples for snapshot testing (avoiding huge files like transpalet 80MB)
  const smallExamples = [
    'box1',
    'box',
    'vertices',
    'single-vertices',
    'single-edges',
    'single-faces',
    'faces',
    'objs1d',
    'edges',
  ];

  // Important examples for comprehensive testing
  const importantExamples = [
    'assembly',              // 1.6MB - nested groups
    'boxes',                 // 150KB - nested groups
    'hexapod',               // 2.0MB - nested groups
    'box_uncentered_feet',   // 310KB - unit testing (feet)
    'box_uncentered_mm',     // 312KB - unit testing (mm)
    'linkage',               // 1.0MB - animation/assembly
    // Note: linkage-tracks.js is animation data, not renderable shapes
  ];

  // Very large/slow examples that use special rendering paths
  const specialExamples = [
    'transceiver_mzi',       // 3.4MB - uses renderPolygons() special path
  ];

  // Smoke test: Can load small example files
  test.each(smallExamples)('can load example: %s', async (exampleName) => {
    const data = await loadExample(exampleName);

    expect(data).toBeDefined();
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('parts');
    expect(Array.isArray(data.parts)).toBe(true);
  });

  // Basic rendering test for simple example
  test('can render box1 example', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    // Load example
    const box1Data = await loadExample('box1');

    // Render (this will add objects to the scene)
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Capture minimal snapshot
    const snapshot = captureMinimalSnapshot(viewer);

    expect(snapshot.hasRenderer).toBe(true);
    expect(snapshot.hasScene).toBe(true);
    expect(snapshot.hasCamera).toBe(true);
    expect(snapshot.sceneChildCount).toBeGreaterThan(0);
  });

  // Full snapshot test for box1
  test('box1 scene state snapshot', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureSceneState(viewer);

    // Validate snapshot structure
    expect(snapshot).toHaveProperty('renderer');
    expect(snapshot).toHaveProperty('camera');
    expect(snapshot).toHaveProperty('scene');
    expect(snapshot).toHaveProperty('animation');
    expect(snapshot).toHaveProperty('display');

    // Check scene has content
    expect(snapshot.scene.totalChildren).toBeGreaterThan(0);

    // Full snapshot comparison (will create baseline on first run)
    expect(snapshot).toMatchSnapshot();
  });

  // Snapshot test for all small examples
  test.each(smallExamples)('scene snapshot for %s', async (exampleName) => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    // Load and render example
    const data = await loadExample(exampleName);
    viewer.render(data, renderOptions, viewerOptions);

    // Capture scene state
    const snapshot = captureSceneState(viewer);

    // Verify basic structure
    expect(snapshot.scene).toBeDefined();
    expect(snapshot.scene.totalChildren).toBeGreaterThan(0);

    // Create named snapshot for this example
    expect(snapshot).toMatchSnapshot(`${exampleName}-scene`);
  });

  // Snapshot test for important examples (nested groups, unit testing, complex geometry)
  test.each(importantExamples)(
    'important snapshot for %s',
    async (exampleName) => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Load and render example
      const data = await loadExample(exampleName);
      viewer.render(data, renderOptions, viewerOptions);

      // Capture scene state
      const snapshot = captureSceneState(viewer);

      // Verify basic structure
      expect(snapshot.scene).toBeDefined();
      expect(snapshot.scene.totalChildren).toBeGreaterThan(0);

      // Create named snapshot for this example
      expect(snapshot).toMatchSnapshot(`${exampleName}-scene`);
    },
    { timeout: 10000 } // 10 seconds for large examples
  );

  // Snapshot test for special examples that use unique rendering paths
  // Slow tests (22+ seconds) - skip by default, run with: RUN_SLOW_TESTS=true yarn test
  test.skipIf(!process.env.RUN_SLOW_TESTS).each(specialExamples)(
    'special rendering snapshot for %s',
    async (exampleName) => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Load and render example
      const data = await loadExample(exampleName);
      viewer.render(data, renderOptions, viewerOptions);

      // Capture scene state
      const snapshot = captureSceneState(viewer);

      // Verify basic structure
      expect(snapshot.scene).toBeDefined();
      expect(snapshot.scene.totalChildren).toBeGreaterThan(0);

      // Create named snapshot for this example
      expect(snapshot).toMatchSnapshot(`${exampleName}-scene`);
    },
    { timeout: 60000 } // 60 seconds for very large/slow examples
  );
});
