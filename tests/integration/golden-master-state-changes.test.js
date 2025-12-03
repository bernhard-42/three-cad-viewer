import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample, captureSceneState } from '../helpers/snapshot.js';

describe('Golden Master - State Changes', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  /**
   * Golden Master tests for state changes
   * These capture before/after states to ensure refactoring doesn't break state transitions
   */

  describe('Material property state changes', () => {
    test('changing metalness updates material properties', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Change metalness
      viewer.setMetalness(0.8);

      const finalState = captureSceneState(viewer);

      // Material metalness should be updated
      expect(finalState.scene.sampleMaterial.metalness).toBe(0.8);
      expect(finalState.scene.sampleMaterial.metalness).not.toBe(initialState.scene.sampleMaterial.metalness);

      // Scene structure unchanged
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('changing roughness updates material properties', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setRoughness(0.2);

      const finalState = captureSceneState(viewer);

      expect(finalState.scene.sampleMaterial.roughness).toBe(0.2);
      expect(finalState.scene.sampleMaterial.roughness).not.toBe(initialState.scene.sampleMaterial.roughness);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('toggling transparency updates material opacity', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // setTransparent changes opacity: false=1.0 (opaque), true=0.5 (semi-transparent)
      viewer.setTransparent(false);
      const opaqueState = captureSceneState(viewer);

      viewer.setTransparent(true);
      const transparentState = captureSceneState(viewer);

      // Check opacity values changed
      expect(opaqueState.scene.sampleMaterial.opacity).toBeGreaterThan(transparentState.scene.sampleMaterial.opacity);
      expect(transparentState.scene.sampleMaterial.opacity).toBeLessThan(1.0);
      expect(transparentState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('toggling black edges updates edge material', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setBlackEdges(true);

      const finalState = captureSceneState(viewer);

      // Black edges changes edge line color to black (0x000000)
      expect(finalState.scene.sampleEdgeMaterial).toBeDefined();
      expect(finalState.scene.sampleEdgeMaterial.color).toBe(0x000000);
      expect(finalState.scene.sampleEdgeMaterial.color).not.toBe(initialState.scene.sampleEdgeMaterial?.color);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });
  });

  describe('Lighting state changes', () => {
    test('changing ambient intensity updates lights', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setAmbientLight(0.5);

      const finalState = captureSceneState(viewer);

      // Find ambient light and check intensity
      const ambientLight = finalState.scene.lights.find(l => l.type === 'AmbientLight');
      const initialAmbientLight = initialState.scene.lights.find(l => l.type === 'AmbientLight');

      expect(ambientLight).toBeDefined();
      expect(ambientLight.intensity).not.toBe(initialAmbientLight.intensity);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('changing direct intensity updates lights', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setDirectLight(0.7);

      const finalState = captureSceneState(viewer);

      const directLight = finalState.scene.lights.find(l => l.type === 'DirectionalLight');
      const initialDirectLight = initialState.scene.lights.find(l => l.type === 'DirectionalLight');

      expect(directLight).toBeDefined();
      expect(directLight.intensity).not.toBe(initialDirectLight.intensity);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });
  });

  describe('Object visibility state changes', () => {
    test('hiding object using setObject', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Find an ObjectGroup (not just a Group)
      const paths = Object.keys(viewer.nestedGroup.groups).filter(
        path => viewer.nestedGroup.groups[path].constructor.name === 'ObjectGroup'
      );

      if (paths.length > 0) {
        // setObject expects state as number: 1 = show, 0 = hide
        viewer.setObject(paths[0], 0, 0, false, true);

        const finalState = captureSceneState(viewer);

        // State changed (visibility affected)
        expect(finalState).not.toEqual(initialState);
        expect(finalState.scene.counts).toEqual(initialState.scene.counts);
      }
    });

    test('showing object restores visibility', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Find an ObjectGroup (not just a Group)
      const paths = Object.keys(viewer.nestedGroup.groups).filter(
        path => viewer.nestedGroup.groups[path].constructor.name === 'ObjectGroup'
      );

      if (paths.length > 0) {
        // setObject expects state as number: 1 = show, 0 = hide
        viewer.setObject(paths[0], 0, 0, false, true);
        const hiddenState = captureSceneState(viewer);

        viewer.setObject(paths[0], 1, 0, false, true);
        const shownState = captureSceneState(viewer);

        expect(shownState).not.toEqual(hiddenState);
        expect(shownState.scene.counts).toEqual(hiddenState.scene.counts);
      }
    });
  });

  describe('Camera state changes', () => {
    test('changing zoom with setCameraZoom', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setCameraZoom(2.0, false);

      const finalState = captureSceneState(viewer);

      expect(initialState.camera).not.toEqual(finalState.camera);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('preset camera changes position', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.presetCamera('front', viewer.zoom);

      const finalState = captureSceneState(viewer);

      // Preset camera changes the camera position, not the target
      expect(initialState.camera.position).not.toEqual(finalState.camera.position);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('switching ortho/perspective with setOrtho', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Toggle ortho
      viewer.setOrtho(!viewer.state.get("ortho"), false);

      const finalState = captureSceneState(viewer);

      expect(initialState.camera).not.toEqual(finalState.camera);
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });
  });

  describe('Display state changes', () => {
    test('toggling axes with setAxes', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setAxes(false);

      const finalState = captureSceneState(viewer);

      // Axes state should change (setAxes hides rather than removes)
      expect(initialState.display.axes).toBe(true);
      expect(finalState.display.axes).toBe(false);
      expect(finalState.scene.counts.helpers).toBe(initialState.scene.counts.helpers);
    });

    test('toggling grid with setGrid', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Turn grid ON first (grid starts ON in tests)
      viewer.setGrid("grid", true);
      const gridOnState = captureSceneState(viewer);

      // Then turn it OFF
      viewer.setGrid("grid", false);
      const gridOffState = captureSceneState(viewer);

      // Grid state should toggle
      expect(gridOnState.display.grid).toEqual([true, true, true]);
      expect(gridOffState.display.grid).toEqual([false, false, false]);
      expect(gridOffState.scene.totalChildren).toBe(gridOnState.scene.totalChildren);
    });

    test('toggling grid individual planes', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Turn all grids ON first
      viewer.setGrid("grid", true);
      const allOnState = captureSceneState(viewer);

      // Toggle one grid plane (xz plane = index 1)
      viewer.setGrid("grid-xz");
      const onePlaneOffState = captureSceneState(viewer);

      // Individual grid planes can be toggled
      expect(allOnState.display.grid).toEqual([true, true, true]);
      expect(onePlaneOffState.display.grid).toEqual([true, false, true]);
      expect(onePlaneOffState.scene.totalChildren).toBe(allOnState.scene.totalChildren);
    });
  });

  describe('State consistency checks', () => {
    test('multiple state changes are cumulative', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Apply multiple changes
      viewer.setMetalness(0.9);
      viewer.setRoughness(0.1);
      viewer.setCameraZoom(1.5, false);

      const finalState = captureSceneState(viewer);

      // All properties should reflect changes
      expect(finalState.scene.sampleMaterial.metalness).toBe(0.9);
      expect(finalState.scene.sampleMaterial.roughness).toBe(0.1);
      expect(finalState.camera.zoom).not.toBe(initialState.camera.zoom);

      // Scene structure unchanged
      expect(finalState.scene.counts).toEqual(initialState.scene.counts);
    });

    test('state changes are reversible', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Change and revert
      viewer.setMetalness(0.9);
      viewer.setMetalness(renderOptions.metalness);

      const revertedState = captureSceneState(viewer);

      // Should be approximately equal
      expect(revertedState.scene.sampleMaterial.metalness).toAlmostEqual(
        initialState.scene.sampleMaterial.metalness,
        1e-6
      );
    });

    test('re-rendering with clear() resets state', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data1 = await loadExample('box1');
      viewer.render(box1Data1, renderOptions, viewerOptions);
      const state1 = captureSceneState(viewer);

      // Clear and re-render
      viewer.clear();
      const box1Data2 = await loadExample('box1');
      viewer.render(box1Data2, renderOptions, viewerOptions);
      const state2 = captureSceneState(viewer);

      // States should be similar after clear+render (scene might have different object IDs)
      expect(state2.scene.counts).toEqual(state1.scene.counts);
      expect(state2.scene.sampleMaterial).toAlmostEqual(state1.scene.sampleMaterial, 1e-6);
    });
  });

  describe('Animation state', () => {
    test('animation state is captured', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const linkageData = await loadExample('linkage');
      viewer.render(linkageData, renderOptions, viewerOptions);

      const state = captureSceneState(viewer);

      expect(state.animation).toBeDefined();
      expect(state.animation.isAnimating).toBe(false);
      expect(state.animation.frameCount).toBeDefined();
    });
  });

  describe('Nested groups (assembly)', () => {
    test('changing metalness propagates to all nested materials', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setMetalness(0.9);

      const finalState = captureSceneState(viewer);

      // All CAD mesh materials should have updated metalness
      expect(finalState.cadObjects.meshMaterials.length).toBeGreaterThan(0);

      // Find materials with wrong metalness values
      const wrongMaterials = finalState.cadObjects.meshMaterials.filter(m => m.metalness !== 0.9);
      if (wrongMaterials.length > 0) {
        console.log('\n=== Materials with wrong metalness ===');
        console.log('Count:', wrongMaterials.length, '/', finalState.cadObjects.meshMaterials.length);
        console.log('Sample:', wrongMaterials.slice(0, 3).map(m => ({
          objectType: m.objectType,
          objectName: m.objectName,
          materialType: m.type,
          metalness: m.metalness,
        })));
      }

      for (const material of finalState.cadObjects.meshMaterials) {
        expect(material.metalness).toBe(0.9);
      }

      // Initial materials should NOT all be 0.9
      const initialWithNewValue = initialState.cadObjects.meshMaterials.filter(m => m.metalness === 0.9).length;
      expect(initialWithNewValue).toBe(0);
    });

    test('changing roughness propagates to all nested materials', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setRoughness(0.15);

      const finalState = captureSceneState(viewer);

      // All CAD mesh materials should have updated roughness
      expect(finalState.cadObjects.meshMaterials.length).toBeGreaterThan(0);

      for (const material of finalState.cadObjects.meshMaterials) {
        expect(material.roughness).toBe(0.15);
      }

      // Initial materials should NOT all be 0.15
      const initialWithNewValue = initialState.cadObjects.meshMaterials.filter(m => m.roughness === 0.15).length;
      expect(initialWithNewValue).toBe(0);
    });

    test('toggling black edges propagates to all edge materials', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      viewer.setBlackEdges(true);

      const finalState = captureSceneState(viewer);

      // All CAD edge materials should be black (0x000000)
      expect(finalState.cadObjects.edgeMaterials.length).toBeGreaterThan(0);

      for (const material of finalState.cadObjects.edgeMaterials) {
        expect(material.color).toBe(0x000000);
      }

      // Initial edge materials should not all be black
      const initialBlackCount = initialState.cadObjects.edgeMaterials.filter(m => m.color === 0x000000).length;
      expect(initialBlackCount).toBe(0);
    });

    test('toggling transparency propagates to all nested materials', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      const initialState = captureSceneState(viewer);

      // Toggle transparency OFF
      viewer.setTransparent(false);
      const opaqueState = captureSceneState(viewer);

      // All CAD materials should have opacity = 1.0 (or close to it)
      expect(opaqueState.cadObjects.meshMaterials.length).toBeGreaterThan(0);
      for (const material of opaqueState.cadObjects.meshMaterials) {
        expect(material.opacity).toBeGreaterThanOrEqual(0.95);
      }

      // Toggle transparency ON
      viewer.setTransparent(true);
      const transparentState = captureSceneState(viewer);

      // All CAD materials should have reduced opacity
      for (const material of transparentState.cadObjects.meshMaterials) {
        expect(material.opacity).toBeLessThan(0.9);
      }
    });
  });

  describe('Edge cases', () => {
    test('state changes without scene throw errors', async () => {
      testContext = setupViewer();
      const { viewer } = testContext;

      // Methods throw errors when called without rendering first (documenting current behavior)
      expect(() => {
        viewer.setMetalness(0.5);
      }).toThrow();

      expect(() => {
        viewer.setRoughness(0.3);
      }).toThrow();
    });

    test('extreme material values are handled', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Set extreme values
      viewer.setMetalness(1.0);
      viewer.setRoughness(0.0);

      const state = captureSceneState(viewer);

      expect(state.scene.sampleMaterial.metalness).toBe(1.0);
      expect(state.scene.sampleMaterial.roughness).toBe(0.0);
    });
  });

  describe('Material value clamping', () => {
    test('setRoughness clamps values to 0-1 range', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Test clamping above max
      viewer.setRoughness(2);
      expect(viewer.getRoughness()).toBe(1);

      // Test clamping below min
      viewer.setRoughness(-0.5);
      expect(viewer.getRoughness()).toBe(0);

      // Test value within range
      viewer.setRoughness(0.5);
      expect(viewer.getRoughness()).toBe(0.5);
    });

    test('setMetalness clamps values to 0-1 range', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Test clamping above max
      viewer.setMetalness(1.5);
      expect(viewer.getMetalness()).toBe(1);

      // Test clamping below min
      viewer.setMetalness(-1);
      expect(viewer.getMetalness()).toBe(0);

      // Test value within range
      viewer.setMetalness(0.3);
      expect(viewer.getMetalness()).toBe(0.3);
    });

    test('setAmbientLight clamps values to 0-4 range', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Test clamping above max
      viewer.setAmbientLight(5);
      expect(viewer.getAmbientLight()).toBe(4);

      // Test clamping below min
      viewer.setAmbientLight(-1);
      expect(viewer.getAmbientLight()).toBe(0);

      // Test value within range
      viewer.setAmbientLight(2.5);
      expect(viewer.getAmbientLight()).toBe(2.5);
    });

    test('setDirectLight clamps values to 0-4 range', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Test clamping above max
      viewer.setDirectLight(10);
      expect(viewer.getDirectLight()).toBe(4);

      // Test clamping below min
      viewer.setDirectLight(-2);
      expect(viewer.getDirectLight()).toBe(0);

      // Test value within range
      viewer.setDirectLight(1.5);
      expect(viewer.getDirectLight()).toBe(1.5);
    });
  });
});
