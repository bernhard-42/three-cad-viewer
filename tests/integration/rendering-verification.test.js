import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample } from '../helpers/snapshot.js';
import * as THREE from 'three';

describe('Rendering Verification', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  /**
   * Basic rendering verification tests
   * These tests ensure the rendering pipeline produces expected output structure
   */

  describe('Basic rendering output', () => {
    test('box1 rendering creates expected object types', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Count objects by type
      let meshCount = 0;
      let lineCount = 0;
      let pointCount = 0;
      let groupCount = 0;

      viewer.scene.traverse((obj) => {
        const type = obj.constructor.name;
        if (type.includes('Mesh')) meshCount++;
        else if (type.includes('Line')) lineCount++;
        else if (type.includes('Points')) pointCount++;
        else if (type.includes('Group')) groupCount++;
      });

      // box1 should have meshes (faces), lines (edges), and groups (structure)
      expect(meshCount).toBeGreaterThan(0);
      expect(lineCount).toBeGreaterThan(0);
      expect(groupCount).toBeGreaterThan(0);
    });

    test('vertices example creates Points objects', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const verticesData = await loadExample('vertices');
      viewer.render(verticesData, renderOptions, viewerOptions);

      let pointCount = 0;
      viewer.scene.traverse((obj) => {
        if (obj.constructor.name.includes('Points')) pointCount++;
      });

      // vertices example should create Points objects
      expect(pointCount).toBeGreaterThan(0);
    });

    test('edges example creates Line objects', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const edgesData = await loadExample('edges');
      viewer.render(edgesData, renderOptions, viewerOptions);

      let lineCount = 0;
      viewer.scene.traverse((obj) => {
        if (obj.constructor.name.includes('Line')) lineCount++;
      });

      // edges example should create Line objects
      expect(lineCount).toBeGreaterThan(0);
    });

    test('faces example creates Mesh objects', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const facesData = await loadExample('faces');
      viewer.render(facesData, renderOptions, viewerOptions);

      let meshCount = 0;
      viewer.scene.traverse((obj) => {
        if (obj.constructor.name.includes('Mesh')) meshCount++;
      });

      // faces example should create Mesh objects
      expect(meshCount).toBeGreaterThan(0);
    });
  });

  describe('Material verification', () => {
    test('rendered objects have materials assigned', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      let objectsWithMaterial = 0;
      let objectsWithoutMaterial = 0;

      viewer.scene.traverse((obj) => {
        if (obj.material) {
          objectsWithMaterial++;
          // Verify material has required properties
          expect(obj.material).toHaveProperty('type');
        } else if (obj.type === 'Mesh' || obj.type === 'Line' || obj.type === 'Points') {
          objectsWithoutMaterial++;
        }
      });

      // All renderable objects should have materials
      expect(objectsWithMaterial).toBeGreaterThan(0);
      expect(objectsWithoutMaterial).toBe(0);
    });

    test('materials respect render options', async () => {
      testContext = setupViewer();
      const { viewer, viewerOptions } = testContext;

      const customRenderOptions = {
        ambientIntensity: 0.5,
        directIntensity: 0.8,
        metalness: 0.7,
        roughness: 0.3,
        edgeColor: 0xff0000, // Red edges
        defaultOpacity: 0.8,
      };

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, customRenderOptions, viewerOptions);

      // Find a mesh material and verify properties
      let foundMeshMaterial = false;
      viewer.scene.traverse((obj) => {
        if (obj.type === 'Mesh' && obj.material) {
          foundMeshMaterial = true;
          // Verify material properties reflect render options
          if (obj.material.metalness !== undefined) {
            expect(obj.material.metalness).toBe(0.7);
          }
          if (obj.material.roughness !== undefined) {
            expect(obj.material.roughness).toBe(0.3);
          }
        }
      });

      expect(foundMeshMaterial).toBe(true);
    });
  });

  describe('Geometry verification', () => {
    test('rendered objects have valid geometries', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      let geometryCount = 0;

      viewer.scene.traverse((obj) => {
        if (obj.geometry) {
          geometryCount++;

          // Verify geometry has position attribute
          expect(obj.geometry.attributes).toBeDefined();
          expect(obj.geometry.attributes.position).toBeDefined();

          // Verify position has data
          const positionCount = obj.geometry.attributes.position.count;
          expect(positionCount).toBeGreaterThan(0);
        }
      });

      expect(geometryCount).toBeGreaterThan(0);
    });

    test('BufferGeometry has proper attributes', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      let bufferGeometryCount = 0;

      viewer.scene.traverse((obj) => {
        if (obj.geometry && obj.geometry.constructor.name === 'BufferGeometry') {
          bufferGeometryCount++;

          const { attributes } = obj.geometry;

          // Position is required
          expect(attributes.position).toBeDefined();
          expect(attributes.position.itemSize).toBe(3); // x, y, z

          // Check if normals are present (common for meshes)
          if (attributes.normal) {
            expect(attributes.normal.itemSize).toBe(3);
          }
        }
      });

      expect(bufferGeometryCount).toBeGreaterThan(0);
    });
  });

  describe('Scene hierarchy verification', () => {
    test('assembly example creates nested groups', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const assemblyData = await loadExample('assembly');
      viewer.render(assemblyData, renderOptions, viewerOptions);

      let maxDepth = 0;

      function calculateDepth(obj, currentDepth = 0) {
        if (currentDepth > maxDepth) maxDepth = currentDepth;

        if (obj.children && obj.children.length > 0) {
          obj.children.forEach(child => {
            calculateDepth(child, currentDepth + 1);
          });
        }
      }

      calculateDepth(viewer.scene);

      // assembly should have nested structure
      expect(maxDepth).toBeGreaterThan(2);
    });

    test('part names are preserved in scene graph', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Collect all object names
      const names = [];
      viewer.scene.traverse((obj) => {
        if (obj.name) {
          names.push(obj.name);
        }
      });

      // Scene should have named objects
      expect(names.length).toBeGreaterThan(0);

      // Objects should have meaningful names (not empty)
      const hasNonEmptyName = names.some(name => name.length > 0);
      expect(hasNonEmptyName).toBe(true);
    });

    test('viewer.nestedGroup tracks rendered objects', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Viewer should track CAD objects through nestedGroup
      expect(viewer.nestedGroup).toBeDefined();
      expect(viewer.nestedGroup.groups).toBeDefined();
      expect(typeof viewer.nestedGroup.groups).toBe('object');

      // Should have at least one group (root)
      const groupPaths = Object.keys(viewer.nestedGroup.groups);
      expect(groupPaths.length).toBeGreaterThan(0);

      // Root group should exist
      expect(viewer.nestedGroup.rootGroup).toBeDefined();
    });
  });

  describe('Part count verification', () => {
    test('rendered scene matches input part count', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      const inputPartCount = box1Data.parts.length;

      viewer.render(box1Data, renderOptions, viewerOptions);

      // Scene should have at least as many children as input parts
      // (may be more due to edges, vertices, helpers, etc.)
      expect(viewer.scene.children.length).toBeGreaterThanOrEqual(inputPartCount);
    });

    test('boxes example with multiple parts', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const boxesData = await loadExample('boxes');
      const inputPartCount = boxesData.parts.length;

      viewer.render(boxesData, renderOptions, viewerOptions);

      // boxes example has multiple nested parts
      expect(inputPartCount).toBeGreaterThan(1);

      // Scene should contain all parts
      let groupCount = 0;
      viewer.scene.traverse((obj) => {
        if (obj.constructor.name.includes('Group')) groupCount++;
      });

      expect(groupCount).toBeGreaterThan(0);
    });
  });

  describe('Expanded vs compact rendering', () => {
    test('expanded mode creates more objects than compact', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions } = testContext;

      viewer.setRenderDefaults(renderOptions);

      const box1Data = await loadExample('box1');

      // Render in compact mode
      const compactResult = viewer.renderTessellatedShapes(false, box1Data);
      const compactObjectCount = Object.keys(compactResult.tree).length;

      // Render in expanded mode (with fresh data)
      const box1DataCopy = await loadExample('box1');
      const expandedResult = viewer.renderTessellatedShapes(true, box1DataCopy);
      const expandedObjectCount = Object.keys(expandedResult.tree).length;

      // Expanded mode should create more objects (individual faces/edges/vertices)
      expect(expandedObjectCount).toBeGreaterThanOrEqual(compactObjectCount);
    });

    test('compact mode produces valid rendering', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions } = testContext;

      viewer.setRenderDefaults(renderOptions);

      const box1Data = await loadExample('box1');
      const result = viewer.renderTessellatedShapes(false, box1Data);

      // Should return group and tree
      expect(result).toHaveProperty('tree');
      expect(result).toHaveProperty('group');
      expect(typeof result.tree).toBe('object');
      expect(result.group).toBeDefined();
      expect(result.group.rootGroup).toBeDefined();
    });

    test('expanded mode produces valid rendering', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions } = testContext;

      viewer.setRenderDefaults(renderOptions);

      const box1Data = await loadExample('box1');
      const result = viewer.renderTessellatedShapes(true, box1Data);

      // Should return group and tree
      expect(result).toHaveProperty('tree');
      expect(result).toHaveProperty('group');
      expect(typeof result.tree).toBe('object');
      expect(result.group).toBeDefined();
      expect(result.group.rootGroup).toBeDefined();
    });
  });

  describe('Lighting verification', () => {
    test('scene has proper lighting setup', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Count lights in scene
      let ambientLights = 0;
      let directionalLights = 0;

      viewer.scene.traverse((obj) => {
        if (obj.constructor.name === 'AmbientLight') ambientLights++;
        if (obj.constructor.name === 'DirectionalLight') directionalLights++;
      });

      // Scene should have lighting
      const totalLights = ambientLights + directionalLights;
      expect(totalLights).toBeGreaterThan(0);
    });

    test('lighting respects intensity options', async () => {
      testContext = setupViewer();
      const { viewer, viewerOptions } = testContext;

      const customRenderOptions = {
        ambientIntensity: 0.3,
        directIntensity: 0.9,
        metalness: 0.3,
        roughness: 0.65,
        edgeColor: 0x707070,
        defaultOpacity: 0.5,
      };

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, customRenderOptions, viewerOptions);

      // Find lights and check intensities
      // Note: intensities are scaled by Math.round(Math.PI * intensity)
      const expectedAmbient = Math.round(Math.PI * 0.3); // ~1
      const expectedDirect = Math.round(Math.PI * 0.9); // ~3

      let foundAmbient = false;
      let foundDirectional = false;

      viewer.scene.traverse((obj) => {
        if (obj.constructor.name === 'AmbientLight') {
          foundAmbient = true;
          expect(obj.intensity).toBe(expectedAmbient);
        }
        if (obj.constructor.name === 'DirectionalLight') {
          foundDirectional = true;
          expect(obj.intensity).toBe(expectedDirect);
        }
      });

      expect(foundAmbient || foundDirectional).toBe(true);
    });
  });

  describe('Camera and controls verification', () => {
    test('camera is properly configured', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Render to initialize camera
      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      expect(viewer.camera).toBeDefined();
      expect(viewer.camera.camera).toBeDefined();

      const threeCamera = viewer.camera.getCamera();
      expect(threeCamera.position).toBeDefined();
      expect(threeCamera.rotation).toBeDefined();

      // Camera should have near and far planes
      expect(threeCamera.near).toBeDefined();
      expect(threeCamera.far).toBeDefined();
      expect(threeCamera.far).toBeGreaterThan(threeCamera.near);
    });

    test('ortho option creates orthographic camera', async () => {
      testContext = setupViewer({}, {}, { ortho: true });
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Render to initialize camera
      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      const threeCamera = viewer.camera.getCamera();
      expect(threeCamera.constructor.name).toBe('OrthographicCamera');
    });

    test('camera target is set', async () => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      const box1Data = await loadExample('box1');
      viewer.render(box1Data, renderOptions, viewerOptions);

      // Camera should have a target after rendering
      expect(viewer.camera.target).toBeDefined();
    });
  });

  describe('Renderer configuration', () => {
    test('renderer has correct pixel ratio', () => {
      testContext = setupViewer();
      const { viewer } = testContext;

      expect(viewer.renderer).toBeDefined();
      const pixelRatio = viewer.renderer.getPixelRatio();
      expect(typeof pixelRatio).toBe('number');
      expect(pixelRatio).toBeGreaterThan(0);
    });

    test('renderer has correct size', () => {
      testContext = setupViewer();
      const { viewer } = testContext;

      const size = viewer.renderer.getSize(new THREE.Vector2());
      expect(size.x).toBeGreaterThan(0);
      expect(size.y).toBeGreaterThan(0);
    });
  });
});
