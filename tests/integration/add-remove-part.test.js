/**
 * Integration tests for Viewer.addPart() and Viewer.removePart()
 */

import { describe, test, expect, afterEach } from 'vitest';
import { setupViewer, cleanup } from '../helpers/setup.js';
import { loadExample } from '../helpers/snapshot.js';

// A minimal solid part (leaf) — no id field; addPart derives it from name.
function createTestPart(name, offset = 2) {
  return {
    version: 3,
    type: 'shapes',
    subtype: 'solid',
    name,
    shape: {
      vertices: [
        offset, -0.5, -0.5, offset, -0.5, 0.5, offset, 0.5, -0.5, offset, 0.5, 0.5,
        offset + 1, -0.5, -0.5, offset + 1, -0.5, 0.5, offset + 1, 0.5, -0.5, offset + 1, 0.5, 0.5,
        offset, -0.5, -0.5, offset + 1, -0.5, -0.5, offset, -0.5, 0.5, offset + 1, -0.5, 0.5,
        offset, 0.5, -0.5, offset + 1, 0.5, -0.5, offset, 0.5, 0.5, offset + 1, 0.5, 0.5,
        offset, -0.5, -0.5, offset + 1, -0.5, -0.5, offset, -0.5, 0.5, offset + 1, -0.5, 0.5,
        offset, 0.5, -0.5, offset + 1, 0.5, -0.5, offset, 0.5, 0.5, offset + 1, 0.5, 0.5,
      ],
      triangles: [
        1, 2, 0, 1, 3, 2, 5, 4, 6, 5, 6, 7, 11, 8, 9, 11, 10, 8,
        15, 13, 12, 15, 12, 14, 19, 16, 17, 19, 18, 16, 23, 21, 20, 23, 20, 22,
      ],
      normals: [
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
      ],
      edges: [
        offset, -0.5, -0.5, offset, -0.5, 0.5,
        offset, -0.5, 0.5, offset, 0.5, 0.5,
        offset, 0.5, -0.5, offset, 0.5, 0.5,
        offset, -0.5, -0.5, offset, 0.5, -0.5,
      ],
    },
    state: [1, 1],
    color: '#ff0000',
    alpha: 1.0,
    texture: null,
    loc: [[0, 0, 0], [0, 0, 0, 1]],
    renderback: false,
    accuracy: null,
    bb: null,
  };
}

// A subtree with slash-prefixed relative ids.
// _prefixIds will prepend the parentPath to every id.
function createTestSubtree() {
  const left = createTestPart('Left', 3);
  left.id = '/Shelf/Left';
  const right = createTestPart('Right', 5);
  right.id = '/Shelf/Right';
  return {
    version: 3,
    id: '/Shelf',
    name: 'Shelf',
    loc: [[0, 0, 0], [0, 0, 0, 1]],
    parts: [left, right],
  };
}

describe('Viewer - addPart', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('adds a leaf part to an existing group', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    const statesBefore = viewer.getStates();
    const partCount = Object.keys(statesBefore).length;

    const path = viewer.addPart('/Group', createTestPart('NewBox'));

    expect(path).toBe('/Group/NewBox');

    const statesAfter = viewer.getStates();
    expect(Object.keys(statesAfter).length).toBeGreaterThan(partCount);
    expect(statesAfter['/Group/NewBox']).toBeDefined();
  });

  test('new part is visible in the scene graph', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('NewBox'));

    const group = viewer.rendered.nestedGroup.groups['/Group/NewBox'];
    expect(group).toBeDefined();
  });

  test('returns the absolute path of the added part', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    const result = viewer.addPart('/Group', createTestPart('TestPart'));
    expect(result).toBe('/Group/TestPart');
  });

  test('throws if part already exists at that level', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('Dup'));

    expect(() => viewer.addPart('/Group', createTestPart('Dup'))).toThrow(
      'Part already exists',
    );
  });

  test('throws if parent group does not exist', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    expect(() => viewer.addPart('/NonExistent', createTestPart('Orphan'))).toThrow(
      'Parent group not found',
    );
  });

  test('throws if viewer is not rendered', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    expect(() => viewer.addPart('/Group', createTestPart('Fail'))).toThrow(
      'Viewer.render() must be called',
    );
  });

  test('updates bounding box after adding a part', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    const bbMaxBefore = viewer.bb_max;

    // Add a part at offset=10, well outside original bbox
    viewer.addPart('/Group', createTestPart('FarBox', 10));

    expect(viewer.bb_max).toBeGreaterThan(bbMaxBefore);
  });

  test('adds a subtree with multiple children', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestSubtree());

    const groups = viewer.rendered.nestedGroup.groups;
    expect(groups['/Group/Shelf']).toBeDefined();
    expect(groups['/Group/Shelf/Left']).toBeDefined();
    expect(groups['/Group/Shelf/Right']).toBeDefined();
  });

  test('subtree ids are prefixed with parent path', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    const subtree = createTestSubtree();
    viewer.addPart('/Group', subtree);

    // After addPart, the ids in partData should be rewritten to absolute paths
    expect(subtree.id).toBe('/Group/Shelf');
    expect(subtree.parts[0].id).toBe('/Group/Shelf/Left');
    expect(subtree.parts[1].id).toBe('/Group/Shelf/Right');
  });

  test('invalidates explode cache after adding', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    // Access expandedNestedGroup to populate it (may be null by default)
    // After addPart it should be null regardless
    viewer.addPart('/Group', createTestPart('NewBox'));

    expect(viewer.expandedNestedGroup).toBeNull();
    expect(viewer.expandedTree).toBeNull();
  });
});

describe('Viewer - removePart', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('removes a leaf part by path', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    // Add and then remove
    viewer.addPart('/Group', createTestPart('Temp'));
    expect(viewer.rendered.nestedGroup.groups['/Group/Temp']).toBeDefined();

    viewer.removePart('/Group/Temp');
    expect(viewer.rendered.nestedGroup.groups['/Group/Temp']).toBeUndefined();
  });

  test('removes part from treeview states', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('Temp'));
    expect(viewer.getStates()['/Group/Temp']).toBeDefined();

    viewer.removePart('/Group/Temp');
    expect(viewer.getStates()['/Group/Temp']).toBeUndefined();
  });

  test('throws if path does not exist', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    expect(() => viewer.removePart('/Group/NoSuchPart')).toThrow(
      'Part not found',
    );
  });

  test('throws if viewer is not rendered', () => {
    testContext = setupViewer();
    const { viewer } = testContext;

    expect(() => viewer.removePart('/Group/Anything')).toThrow(
      'Viewer.render() must be called',
    );
  });

  test('removes a subtree and all its children', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestSubtree());

    expect(viewer.rendered.nestedGroup.groups['/Group/Shelf']).toBeDefined();
    expect(viewer.rendered.nestedGroup.groups['/Group/Shelf/Left']).toBeDefined();

    viewer.removePart('/Group/Shelf');

    expect(viewer.rendered.nestedGroup.groups['/Group/Shelf']).toBeUndefined();
    expect(viewer.rendered.nestedGroup.groups['/Group/Shelf/Left']).toBeUndefined();
    expect(viewer.rendered.nestedGroup.groups['/Group/Shelf/Right']).toBeUndefined();
  });

  test('updates bounding box after removing a far part', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('FarBox', 10));
    const bbMaxWithFar = viewer.bb_max;

    viewer.removePart('/Group/FarBox');

    expect(viewer.bb_max).toBeLessThan(bbMaxWithFar);
  });

  test('invalidates explode cache after removing', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('Temp'));
    viewer.removePart('/Group/Temp');

    expect(viewer.expandedNestedGroup).toBeNull();
    expect(viewer.expandedTree).toBeNull();
  });
});

describe('Viewer - addPart/removePart round-trip', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test('scene returns to original state after add then remove', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    const statesBefore = viewer.getStates();
    const groupCountBefore = Object.keys(viewer.rendered.nestedGroup.groups).length;

    viewer.addPart('/Group', createTestPart('Temp'));
    viewer.removePart('/Group/Temp');

    const statesAfter = viewer.getStates();
    const groupCountAfter = Object.keys(viewer.rendered.nestedGroup.groups).length;

    expect(groupCountAfter).toBe(groupCountBefore);
    expect(Object.keys(statesAfter)).toEqual(Object.keys(statesBefore));
  });

  test('can add multiple parts sequentially', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('Box1', 2));
    viewer.addPart('/Group', createTestPart('Box2', 4));
    viewer.addPart('/Group', createTestPart('Box3', 6));

    const groups = viewer.rendered.nestedGroup.groups;
    expect(groups['/Group/Box1']).toBeDefined();
    expect(groups['/Group/Box2']).toBeDefined();
    expect(groups['/Group/Box3']).toBeDefined();
  });

  test('can remove parts in any order', async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;
    const data = await loadExample('box1');
    viewer.render(data, renderOptions, viewerOptions);

    viewer.addPart('/Group', createTestPart('A', 2));
    viewer.addPart('/Group', createTestPart('B', 4));
    viewer.addPart('/Group', createTestPart('C', 6));

    // Remove middle one first
    viewer.removePart('/Group/B');
    expect(viewer.rendered.nestedGroup.groups['/Group/B']).toBeUndefined();
    expect(viewer.rendered.nestedGroup.groups['/Group/A']).toBeDefined();
    expect(viewer.rendered.nestedGroup.groups['/Group/C']).toBeDefined();

    // Remove remaining
    viewer.removePart('/Group/C');
    viewer.removePart('/Group/A');
    expect(viewer.rendered.nestedGroup.groups['/Group/A']).toBeUndefined();
    expect(viewer.rendered.nestedGroup.groups['/Group/C']).toBeUndefined();
  });
});
