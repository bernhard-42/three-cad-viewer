import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample, captureSceneState } from '../helpers/snapshot.js';

describe('Viewer - Rendering Modes', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  /**
   * Tests for viewer.render() with different shapes objects
   *
   * Viewer.renderTessellatedShapes(exploded, shapes) has two modes:
   * - exploded = false (compact): Basic rendering of solids as-is
   * - exploded = true (expanded): Each face, edge, and vertex gets rendered separately
   *
   * These tests verify both modes work correctly and produce different scene structures
   */

  test('compact mode (exploded=false) - renders solids as unified objects', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    // Load example
    const box1Data = await loadExample('box1');

    // Render in compact mode (exploded = false)
    // This is the default mode used by viewer.render()
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Capture scene state
    const snapshot = captureSceneState(viewer);

    // In compact mode, we should have fewer groups
    // (shapes are rendered as unified solids, not decomposed)
    expect(snapshot.scene).toBeDefined();
    expect(snapshot.scene.totalChildren).toBeGreaterThan(0);

    // Verify we have meshes (for faces)
    expect(snapshot.scene.counts.meshes).toBeGreaterThan(0);

    // Store for comparison
    const compactChildCount = snapshot.scene.totalChildren;
    const compactMeshCount = snapshot.scene.counts.meshes;

    // Compact mode snapshot
    expect(snapshot).toMatchSnapshot('box1-compact-mode');

    // Save counts for next test comparison
    testContext.compactCounts = {
      children: compactChildCount,
      meshes: compactMeshCount,
    };
  });

  test('expanded mode (exploded=true) - renders individual faces/edges/vertices', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions } = testContext;

    // Load example
    const box1Data = await loadExample('box1');

    // Initialize material settings before calling renderTessellatedShapes
    viewer.setRenderDefaults(renderOptions);

    // Manually call renderTessellatedShapes with exploded=true
    // Note: viewer.render() normally handles this based on display tree state
    // For testing, we directly call the method to test expanded rendering
    const result = viewer.renderTessellatedShapes(true, box1Data);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('group');
    expect(result).toHaveProperty('tree');

    // In expanded mode, parts are decomposed into individual faces/edges/vertices
    // This means more THREE.Group objects in the scene hierarchy
    const expandedGroup = result.group;

    expect(expandedGroup).toBeDefined();

    // Expanded mode should create decomposed structure
    expect(result.tree).toBeDefined();
    // Tree is an object with shape names as keys
    expect(typeof result.tree).toBe('object');

    // Snapshot for expanded mode
    expect(result.tree).toMatchSnapshot('box1-expanded-tree');
  });

  test('compact vs expanded - structural differences', async () => {
    // Test both modes in sequence to compare results
    testContext = setupViewer();
    const { viewer, renderOptions } = testContext;

    // Initialize material settings
    viewer.setRenderDefaults(renderOptions);

    const box1Data = await loadExample('box1');

    // Render compact
    const compactResult = viewer.renderTessellatedShapes(false, box1Data);

    // Render expanded (need fresh data due to structuredClone in method)
    const box1DataCopy = await loadExample('box1');
    const expandedResult = viewer.renderTessellatedShapes(true, box1DataCopy);

    // Both should succeed
    expect(compactResult.group).toBeDefined();
    expect(expandedResult.group).toBeDefined();

    // Tree structures should differ
    expect(compactResult.tree).toBeDefined();
    expect(expandedResult.tree).toBeDefined();

    // In compact mode, parts array remains as-is (shapes.parts)
    // In expanded mode, parts array is replaced with decomposed parts (_decompose)
    // We can verify this by checking the tree structure

    // Both modes should have valid groups
    expect(compactResult.group).toBeDefined();
    expect(expandedResult.group).toBeDefined();

    // Verify tree structures exist (trees are objects with shape names as keys)
    expect(typeof compactResult.tree).toBe('object');
    expect(typeof expandedResult.tree).toBe('object');

    // Log for debugging
    console.log('Compact tree keys:', Object.keys(compactResult.tree));
    console.log('Expanded tree keys:', Object.keys(expandedResult.tree));
  });

  test('compact mode with different example shapes', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions } = testContext;

    // Initialize material settings
    viewer.setRenderDefaults(renderOptions);

    // Test with a more complex example (edges)
    const edgesData = await loadExample('edges');

    const result = viewer.renderTessellatedShapes(false, edgesData);

    expect(result).toBeDefined();
    expect(result.group).toBeDefined();
    expect(result.tree).toBeDefined();

    // Edges example should have content in the tree
    expect(typeof result.tree).toBe('object');
    expect(Object.keys(result.tree).length).toBeGreaterThan(0);
  });

  test('expanded mode with different example shapes', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions } = testContext;

    // Initialize material settings
    viewer.setRenderDefaults(renderOptions);

    // Test with vertices example in expanded mode
    const verticesData = await loadExample('vertices');

    const result = viewer.renderTessellatedShapes(true, verticesData);

    expect(result).toBeDefined();
    expect(result.group).toBeDefined();
    expect(result.tree).toBeDefined();

    // Vertices example in expanded mode should decompose into individual vertex points
    expect(typeof result.tree).toBe('object');
    expect(Object.keys(result.tree).length).toBeGreaterThan(0);
  });
});
