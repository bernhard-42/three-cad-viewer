import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample, captureSceneState } from '../helpers/snapshot.js';

/**
 * Approval Tests - Comprehensive User Interaction Workflows
 *
 * These tests lock in current behavior for safe refactoring.
 * They verify complete user workflows and interactions work correctly.
 *
 * Coverage:
 * - Loading & rendering workflows
 * - Camera interactions
 * - Display controls
 * - Object manipulation
 * - Material adjustments
 * - Clipping operations
 */
describe('Approval Tests - User Interaction Workflows', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  // =====================================================================
  // LOADING & RENDERING WORKFLOWS
  // =====================================================================

  describe('Loading & Rendering Workflows', () => {
    test('complete workflow: load box1 → render → verify state', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Load example
      const box1Data = await loadExample('box1');
      expect(box1Data).toBeDefined();

      // Render with default options
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Capture and verify final state
      const state = captureSceneState(viewer);

      expect(state.renderer).toBeDefined();
      expect(state.scene.counts.meshes).toBeGreaterThan(0);
      expect(state.camera.type).toBe('OrthographicCamera');
      expect(state.display.axes).toBe(true);
      expect(state.display.grid).toEqual([true, true, true]);

      // Full state snapshot for regression detection
      expect(state).toMatchSnapshot('box1-complete-workflow');
    });

    test('workflow: load assembly → render in compact mode → verify nested groups', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, { ...viewerOptions, explode: false });

      const state = captureSceneState(viewer);

      // Verify nested group structure
      expect(state.cadObjects).toBeDefined();
      expect(state.cadObjects.meshMaterials.length).toBeGreaterThan(0);
      expect(state.cadObjects.edgeMaterials.length).toBeGreaterThan(0);

      expect(state).toMatchSnapshot('assembly-compact-workflow');
    });

    test('workflow: load assembly → render in expanded mode → verify individual parts', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, { ...viewerOptions, explode: true });

      const state = captureSceneState(viewer);

      // Expanded mode should have more objects
      expect(state.scene.counts.meshes).toBeGreaterThan(0);

      expect(state).toMatchSnapshot('assembly-expanded-workflow');
    });

    test('workflow: load vertices example → verify Points rendering', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const verticesData = await loadExample('vertices');
      viewer.render(verticesData, renderOptions, viewerOptions);

      const state = captureSceneState(viewer);

      expect(state.scene.counts.points).toBeGreaterThan(0);

      expect(state).toMatchSnapshot('vertices-workflow');
    });

    test('workflow: load edges example → verify Line rendering', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const edgesData = await loadExample('edges');
      viewer.render(edgesData, renderOptions, viewerOptions);

      const state = captureSceneState(viewer);

      expect(state.scene.counts.lines).toBeGreaterThan(0);

      expect(state).toMatchSnapshot('edges-workflow');
    });

    test('workflow: sequential renders → clear → re-render', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // First render
      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);
      const state1 = captureSceneState(viewer);

      // Clear
      viewer.clear();

      // Second render with different example
      const verticesData = await loadExample('vertices');
      viewer.render(verticesData, renderOptions, viewerOptions);
      const state2 = captureSceneState(viewer);

      // States should be different
      expect(state2.scene.counts).not.toEqual(state1.scene.counts);
      expect(state2).toMatchSnapshot('sequential-render-workflow');
    });
  });

  // =====================================================================
  // CAMERA INTERACTION WORKFLOWS
  // =====================================================================

  describe('Camera Interaction Workflows', () => {
    test('workflow: render → zoom in → zoom out', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);
      const initialZoom = initialState.camera.zoom;

      // Zoom in
      viewer.camera.setZoom(1.5);
      const zoomedInState = captureSceneState(viewer);
      expect(zoomedInState.camera.zoom).toBeGreaterThan(initialZoom);

      // Zoom out
      viewer.camera.setZoom(0.7);
      const zoomedOutState = captureSceneState(viewer);
      expect(zoomedOutState.camera.zoom).toBeLessThan(zoomedInState.camera.zoom);

      // Reset to initial zoom
      viewer.camera.setZoom(initialZoom);
      const resetState = captureSceneState(viewer);
      expect(resetState.camera.zoom).toBe(initialZoom);

      expect({ initialState, zoomedInState, zoomedOutState, resetState }).toMatchSnapshot('camera-zoom-workflow');
    });

    test('workflow: cycle through camera presets', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const presets = ['iso', 'top', 'front', 'right'];
      const states = {};

      for (const preset of presets) {
        viewer.camera.presetCamera(preset);
        states[preset] = captureSceneState(viewer);
      }

      // Each preset should have different camera position/rotation
      expect(states.iso.camera.position).not.toEqual(states.top.camera.position);
      expect(states.top.camera.position).not.toEqual(states.front.camera.position);

      expect(states).toMatchSnapshot('camera-presets-workflow');
    });

    test('workflow: switch between ortho and perspective cameras', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Start with ortho
      const orthoState = captureSceneState(viewer);
      expect(orthoState.camera.type).toBe('OrthographicCamera');

      // Switch to perspective
      viewer.setOrtho(false, false);
      const perspectiveState = captureSceneState(viewer);
      expect(perspectiveState.camera.type).toBe('PerspectiveCamera');

      // Switch back to ortho
      viewer.setOrtho(true, false);
      const orthoAgainState = captureSceneState(viewer);
      expect(orthoAgainState.camera.type).toBe('OrthographicCamera');

      expect({ orthoState, perspectiveState, orthoAgainState }).toMatchSnapshot('camera-projection-workflow');
    });
  });

  // =====================================================================
  // DISPLAY CONTROL WORKFLOWS
  // =====================================================================

  describe('Display Control Workflows', () => {
    test('workflow: toggle axes on/off', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Initial state - axes ON
      const axesOnState = captureSceneState(viewer);
      expect(axesOnState.display.axes).toBe(true);

      // Turn axes OFF
      viewer.setAxes(false, false);
      const axesOffState = captureSceneState(viewer);
      expect(axesOffState.display.axes).toBe(false);

      // Turn axes back ON
      viewer.setAxes(true, false);
      const axesOnAgainState = captureSceneState(viewer);
      expect(axesOnAgainState.display.axes).toBe(true);

      expect({ axesOnState, axesOffState, axesOnAgainState }).toMatchSnapshot('axes-toggle-workflow');
    });

    test('workflow: toggle grid planes individually', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // All grids ON initially
      const allOnState = captureSceneState(viewer);
      expect(allOnState.display.grid).toEqual([true, true, true]);

      // Turn OFF xy plane
      viewer.setGrid('grid-xy', false);
      const xyOffState = captureSceneState(viewer);
      expect(xyOffState.display.grid[0]).toBe(false);

      // Turn OFF xz plane
      viewer.setGrid('grid-xz', false);
      const xzOffState = captureSceneState(viewer);
      expect(xzOffState.display.grid[1]).toBe(false);

      // Turn all grids OFF
      viewer.setGrid('grid', false);
      const allOffState = captureSceneState(viewer);
      expect(allOffState.display.grid).toEqual([false, false, false]);

      // Turn all grids back ON
      viewer.setGrid('grid', true);
      const allOnAgainState = captureSceneState(viewer);
      expect(allOnAgainState.display.grid).toEqual([true, true, true]);

      expect({ allOnState, xyOffState, xzOffState, allOffState, allOnAgainState }).toMatchSnapshot('grid-toggle-workflow');
    });

    test('workflow: verify theme is captured in state', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Theme is set at initialization, verify it's captured
      const state = captureSceneState(viewer);
      expect(state.display.theme).toBe('light');

      expect(state).toMatchSnapshot('theme-state-workflow');
    });
  });

  // =====================================================================
  // OBJECT MANIPULATION WORKFLOWS
  // =====================================================================

  describe('Object Manipulation Workflows', () => {
    test('workflow: select object → hide → show', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Get first ObjectGroup
      const paths = Object.keys(viewer.nestedGroup.groups).filter(
        path => viewer.nestedGroup.groups[path].constructor.name === 'ObjectGroup'
      );

      if (paths.length > 0) {
        const path = paths[0];

        // Initial state - visible
        const visibleState = captureSceneState(viewer);

        // Hide object
        viewer.setObject(path, 0, 0, false, true);
        const hiddenState = captureSceneState(viewer);

        // Show object
        viewer.setObject(path, 1, 0, false, true);
        const shownState = captureSceneState(viewer);

        // Verify states changed
        expect(hiddenState).not.toEqual(visibleState);
        expect(shownState).not.toEqual(hiddenState);

        expect({ visibleState, hiddenState, shownState }).toMatchSnapshot('object-hide-show-workflow');
      }
    });

    test('workflow: hide multiple objects sequentially', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      const paths = Object.keys(viewer.nestedGroup.groups).filter(
        path => viewer.nestedGroup.groups[path].constructor.name === 'ObjectGroup'
      );

      const states = { initial: captureSceneState(viewer) };

      // Hide objects one by one
      paths.slice(0, 2).forEach((path, index) => {
        viewer.setObject(path, 0, 0, false, true);
        states[`hidden_${index}`] = captureSceneState(viewer);
      });

      expect(states).toMatchSnapshot('multiple-hide-workflow');
    });
  });

  // =====================================================================
  // MATERIAL ADJUSTMENT WORKFLOWS
  // =====================================================================

  describe('Material Adjustment Workflows', () => {
    test('workflow: adjust metalness incrementally', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const metalnessValues = [0, 0.3, 0.5, 0.8, 1.0];
      const states = {};

      for (const value of metalnessValues) {
        viewer.setMetalness(value, false);
        states[`metalness_${value}`] = captureSceneState(viewer);
      }

      expect(states).toMatchSnapshot('metalness-adjustment-workflow');
    });

    test('workflow: adjust roughness incrementally', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const roughnessValues = [0, 0.25, 0.5, 0.75, 1.0];
      const states = {};

      for (const value of roughnessValues) {
        viewer.setRoughness(value, false);
        states[`roughness_${value}`] = captureSceneState(viewer);
      }

      expect(states).toMatchSnapshot('roughness-adjustment-workflow');
    });

    test('workflow: combined material adjustments', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Adjust multiple material properties
      viewer.setMetalness(0.8, false);
      viewer.setRoughness(0.2, false);
      viewer.setTransparent(0.7, false);

      const finalState = captureSceneState(viewer);

      expect({ initialState, finalState }).toMatchSnapshot('combined-material-workflow');
    });

    test('workflow: toggle black edges', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Initial state - black edges OFF
      const edgesOffState = captureSceneState(viewer);

      // Turn black edges ON
      viewer.setBlackEdges(true, false);
      const edgesOnState = captureSceneState(viewer);

      // Turn black edges OFF
      viewer.setBlackEdges(false, false);
      const edgesOffAgainState = captureSceneState(viewer);

      expect({ edgesOffState, edgesOnState, edgesOffAgainState }).toMatchSnapshot('black-edges-workflow');
    });

    test('workflow: transparency on assembly with nested groups', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      const opaqueState = captureSceneState(viewer);

      // Make partially transparent
      viewer.setTransparent(0.5, false);
      const transparentState = captureSceneState(viewer);

      // Verify all nested materials updated
      const allTransparent = transparentState.cadObjects.meshMaterials.every(
        mat => mat.transparent === true && mat.opacity === 0.5
      );
      expect(allTransparent).toBe(true);

      expect({ opaqueState, transparentState }).toMatchSnapshot('assembly-transparency-workflow');
    });
  });

  // =====================================================================
  // LIGHTING WORKFLOWS
  // =====================================================================

  describe('Lighting Adjustment Workflows', () => {
    test('workflow: adjust ambient light intensity', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Increase ambient light
      viewer.setAmbientLight(2.0, false);
      const brightState = captureSceneState(viewer);

      // Decrease ambient light
      viewer.setAmbientLight(0.5, false);
      const dimState = captureSceneState(viewer);

      expect({ initialState, brightState, dimState }).toMatchSnapshot('ambient-light-workflow');
    });

    test('workflow: adjust directional light intensity', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Increase direct light
      viewer.setDirectLight(2.0, false);
      const brightState = captureSceneState(viewer);

      // Decrease direct light
      viewer.setDirectLight(0.3, false);
      const dimState = captureSceneState(viewer);

      expect({ initialState, brightState, dimState }).toMatchSnapshot('direct-light-workflow');
    });
  });

  // =====================================================================
  // COMPLEX WORKFLOWS
  // =====================================================================

  describe('Complex Multi-Step Workflows', () => {
    test('workflow: complete user session - load, adjust, change view, modify materials', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Step 1: Load and render
      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);
      const step1 = captureSceneState(viewer);

      // Step 2: Adjust camera
      viewer.camera.presetCamera('iso');
      const step2 = captureSceneState(viewer);

      // Step 3: Adjust materials
      viewer.setMetalness(0.9, false);
      viewer.setRoughness(0.3, false);
      const step3 = captureSceneState(viewer);

      // Step 4: Toggle display elements
      viewer.setAxes(false, false);
      viewer.setGrid('grid', false);
      const step4 = captureSceneState(viewer);

      // Step 5: Adjust lighting
      viewer.setAmbientLight(1.5, false);
      viewer.setDirectLight(1.8, false);
      const step5 = captureSceneState(viewer);

      expect({ step1, step2, step3, step4, step5 }).toMatchSnapshot('complete-session-workflow');
    });

    test('workflow: render → modify → clear → re-render with different settings', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // First render with default settings
      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);
      viewer.setMetalness(0.8, false);
      const firstRender = captureSceneState(viewer);

      // Clear
      viewer.clear();

      // Second render with different settings
      viewer.render(box1Data, renderOptions, { ...viewerOptions, explode: true });
      viewer.setMetalness(0.3, false);
      viewer.setTransparent(0.5, false);
      const secondRender = captureSceneState(viewer);

      expect({ firstRender, secondRender }).toMatchSnapshot('render-modify-clear-workflow');
    });
  });
});
