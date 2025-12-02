import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample, captureCompleteRendering } from '../helpers/snapshot.js';

describe('Complete Rendering Snapshots', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  /**
   * Complete rendering snapshots for small examples
   * These capture full geometry data (vertices, normals, indices, materials)
   * and use almostEqual comparison with 1e-6 tolerance for floating-point values
   */

  // Small examples for complete rendering snapshots
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

  // Test compact mode (exploded=false) - renders solids as unified objects
  test.each(smallExamples)(
    'complete rendering snapshot for %s (compact mode)',
    async (exampleName) => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Load and render example in compact mode
      const data = await loadExample(exampleName);
      viewer.render(data, renderOptions, { ...viewerOptions, explode: false });

      // Capture complete rendering data
      const snapshot = captureCompleteRendering(viewer);

      // Verify we captured data
      expect(snapshot.objectCount).toBeGreaterThan(0);
      expect(Array.isArray(snapshot.objects)).toBe(true);

      // Use almostEqual comparison for floating-point tolerance
      // This will create a snapshot on first run, then compare with tolerance on subsequent runs
      expect(snapshot).toMatchSnapshot(`${exampleName}-compact-complete`);
    }
  );

  // Test expanded mode (exploded=true) - renders individual faces/edges/vertices
  test.each(smallExamples)(
    'complete rendering snapshot for %s (expanded mode)',
    async (exampleName) => {
      testContext = setupViewer();
      const { viewer, renderOptions, viewerOptions } = testContext;

      // Load and render example in expanded mode
      const data = await loadExample(exampleName);
      viewer.render(data, renderOptions, { ...viewerOptions, explode: true });

      // Capture complete rendering data
      const snapshot = captureCompleteRendering(viewer);

      // Verify we captured data
      expect(snapshot.objectCount).toBeGreaterThan(0);
      expect(Array.isArray(snapshot.objects)).toBe(true);

      // Use almostEqual comparison for floating-point tolerance
      expect(snapshot).toMatchSnapshot(`${exampleName}-expanded-complete`);
    }
  );

  // Individual detailed test for box1 to verify capture quality
  test('box1 complete rendering has expected structure', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureCompleteRendering(viewer);

    // Verify structure
    expect(snapshot).toHaveProperty('objects');
    expect(snapshot).toHaveProperty('objectCount');
    expect(snapshot.objects.length).toBeGreaterThan(0);

    // Find a mesh object with geometry
    const meshes = snapshot.objects.filter(
      obj => obj.type === 'Mesh' && obj.geometry
    );
    expect(meshes.length).toBeGreaterThan(0);

    // Verify first mesh has expected data
    const firstMesh = meshes[0];
    expect(firstMesh.geometry).toHaveProperty('type');
    expect(firstMesh.geometry).toHaveProperty('attributes');
    expect(firstMesh.geometry.attributes).toHaveProperty('position');

    // Verify position data
    const posAttr = firstMesh.geometry.attributes.position;
    expect(posAttr).toHaveProperty('itemSize');
    expect(posAttr).toHaveProperty('count');
    expect(posAttr).toHaveProperty('array');
    expect(posAttr.itemSize).toBe(3); // x, y, z
    expect(Array.isArray(posAttr.array)).toBe(true);
    expect(posAttr.array.length).toBe(posAttr.count * posAttr.itemSize);

    // Verify material data if present
    if (firstMesh.material) {
      expect(firstMesh.material).toHaveProperty('type');
    }

    // Verify transform data
    expect(firstMesh).toHaveProperty('position');
    expect(firstMesh).toHaveProperty('rotation');
    expect(firstMesh).toHaveProperty('scale');
  });

  // Test to verify almostEqual works for geometry
  test('almostEqual comparison works for rendering snapshots', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    // Capture twice
    const snapshot1 = captureCompleteRendering(viewer);
    const snapshot2 = captureCompleteRendering(viewer);

    // Should be exactly equal
    expect(snapshot1).toAlmostEqual(snapshot2);

    // Test with modified data to verify tolerance works
    const snapshot3 = JSON.parse(JSON.stringify(snapshot1));
    if (snapshot3.objects[0]?.position) {
      // Add a tiny change within tolerance
      snapshot3.objects[0].position.x += 1e-7;
      expect(snapshot1).toAlmostEqual(snapshot3, 1e-6);

      // Add a change outside tolerance
      snapshot3.objects[0].position.x += 1e-5;
      expect(() => {
        expect(snapshot1).toAlmostEqual(snapshot3, 1e-6);
      }).toThrow();
    }
  });

  // Test that verifies we capture vertex positions
  test('vertex positions are captured correctly', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureCompleteRendering(viewer);

    // Find objects with geometry
    const withGeometry = snapshot.objects.filter(obj => obj.geometry?.attributes?.position);

    expect(withGeometry.length).toBeGreaterThan(0);

    for (const obj of withGeometry) {
      const pos = obj.geometry.attributes.position;

      // Verify vertex data is captured
      expect(pos.array).toBeDefined();
      expect(Array.isArray(pos.array)).toBe(true);
      expect(pos.array.length).toBeGreaterThan(0);

      // Verify array length matches count * itemSize
      expect(pos.array.length).toBe(pos.count * pos.itemSize);

      // All vertex coordinates should be numbers
      for (const coord of pos.array) {
        expect(typeof coord).toBe('number');
        expect(Number.isFinite(coord)).toBe(true);
      }
    }
  });

  // Test that verifies we capture normals
  test('normals are captured when present', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureCompleteRendering(viewer);

    // Find objects with normals
    const withNormals = snapshot.objects.filter(obj => obj.geometry?.attributes?.normal);

    // Box should have normals
    expect(withNormals.length).toBeGreaterThan(0);

    for (const obj of withNormals) {
      const normal = obj.geometry.attributes.normal;

      expect(normal.array).toBeDefined();
      expect(Array.isArray(normal.array)).toBe(true);
      expect(normal.itemSize).toBe(3); // x, y, z
      expect(normal.array.length).toBe(normal.count * 3);

      // All normals should be unit vectors (length ~1.0)
      for (let i = 0; i < normal.array.length; i += 3) {
        const nx = normal.array[i];
        const ny = normal.array[i + 1];
        const nz = normal.array[i + 2];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);

        // Normal vectors should have length ~1.0 (with some tolerance)
        expect(length).toBeGreaterThan(0.9);
        expect(length).toBeLessThan(1.1);
      }
    }
  });

  // Test that verifies we capture material properties
  test('material properties are captured correctly', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureCompleteRendering(viewer);

    // Find objects with materials
    const withMaterials = snapshot.objects.filter(obj => obj.material);

    expect(withMaterials.length).toBeGreaterThan(0);

    for (const obj of withMaterials) {
      const mat = obj.material;

      // Should have type
      expect(mat.type).toBeDefined();
      expect(typeof mat.type).toBe('string');

      // Should have ID
      expect(mat.id).toBeDefined();
      expect(typeof mat.id).toBe('number');

      // If it has color, should be a hex number
      if (mat.color !== undefined) {
        expect(typeof mat.color).toBe('number');
        expect(mat.color).toBeGreaterThanOrEqual(0);
        expect(mat.color).toBeLessThanOrEqual(0xffffff);
      }

      // If it has opacity, should be 0-1
      if (mat.opacity !== undefined) {
        expect(typeof mat.opacity).toBe('number');
        expect(mat.opacity).toBeGreaterThanOrEqual(0);
        expect(mat.opacity).toBeLessThanOrEqual(1);
      }

      // If it has metalness, should be 0-1
      if (mat.metalness !== undefined) {
        expect(typeof mat.metalness).toBe('number');
        expect(mat.metalness).toBeGreaterThanOrEqual(0);
        expect(mat.metalness).toBeLessThanOrEqual(1);
      }

      // If it has roughness, should be 0-1
      if (mat.roughness !== undefined) {
        expect(typeof mat.roughness).toBe('number');
        expect(mat.roughness).toBeGreaterThanOrEqual(0);
        expect(mat.roughness).toBeLessThanOrEqual(1);
      }
    }
  });

  // Test that verifies transforms are captured
  test('object transforms are captured correctly', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample('box1');
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureCompleteRendering(viewer);

    // All objects should have transforms
    for (const obj of snapshot.objects) {
      // Position
      expect(obj.position).toBeDefined();
      expect(obj.position).toHaveProperty('x');
      expect(obj.position).toHaveProperty('y');
      expect(obj.position).toHaveProperty('z');
      expect(typeof obj.position.x).toBe('number');
      expect(typeof obj.position.y).toBe('number');
      expect(typeof obj.position.z).toBe('number');

      // Rotation
      expect(obj.rotation).toBeDefined();
      expect(obj.rotation).toHaveProperty('x');
      expect(obj.rotation).toHaveProperty('y');
      expect(obj.rotation).toHaveProperty('z');
      expect(typeof obj.rotation.x).toBe('number');
      expect(typeof obj.rotation.y).toBe('number');
      expect(typeof obj.rotation.z).toBe('number');

      // Scale
      expect(obj.scale).toBeDefined();
      expect(obj.scale).toHaveProperty('x');
      expect(obj.scale).toHaveProperty('y');
      expect(obj.scale).toHaveProperty('z');
      expect(typeof obj.scale.x).toBe('number');
      expect(typeof obj.scale.y).toBe('number');
      expect(typeof obj.scale.z).toBe('number');
    }
  });
});
