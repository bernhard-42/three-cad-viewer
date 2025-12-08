import * as THREE from 'three';
import { Clipping } from '../../src/clipping.js';
import { ObjectGroup } from '../../src/objectgroup.js';

/**
 * Create a mock ObjectGroup with shape geometry for clipping tests.
 * @param {string} path - The path identifier.
 * @param {string} subtype - The subtype ('solid', 'edges', etc.).
 * @returns {ObjectGroup} A mock ObjectGroup.
 */
export function createMockObjectGroup(path, subtype = 'solid') {
  const group = new ObjectGroup(1.0, 1.0, 0x707070, {}, subtype, false);
  group.name = path;

  if (subtype === 'solid') {
    // Create a simple box geometry for stencil testing
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    group.shapeGeometry = geometry;

    // Create front and back meshes
    const frontMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const backMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const frontMesh = new THREE.Mesh(geometry, frontMaterial);
    frontMesh.name = 'front';
    const backMesh = new THREE.Mesh(geometry, backMaterial);
    backMesh.name = 'back';

    group.setFront(frontMesh);
    group.setBack(backMesh);
  }

  return group;
}

/**
 * Create a mock NestedGroup structure for clipping tests.
 * @param {number} numSolids - Number of solid objects to create.
 * @returns {Object} Mock nestedGroup with groups and rootGroup.
 */
export function createMockNestedGroup(numSolids = 2) {
  const groups = {};
  const rootGroup = new THREE.Group();
  rootGroup.name = 'rootGroup';

  // Create solid object groups
  for (let i = 0; i < numSolids; i++) {
    const path = `/root/solid_${i}`;
    const objectGroup = createMockObjectGroup(path, 'solid');
    groups[path] = objectGroup;
    rootGroup.add(objectGroup);
  }

  // Create an edge-only group (should be skipped by clipping)
  const edgePath = '/root/edges_only';
  const edgeGroup = createMockObjectGroup(edgePath, 'edges');
  groups[edgePath] = edgeGroup;
  rootGroup.add(edgeGroup);

  return {
    groups,
    rootGroup,
  };
}

/**
 * Create a mock Display object for clipping tests.
 * @returns {Object} Mock display with tracking arrays.
 */
export function createMockDisplay() {
  const calls = {
    setNormalLabel: [],
  };

  return {
    calls,
    setNormalLabel: (index, normal) => {
      calls.setNormalLabel.push({ index, normal });
    },
  };
}

/**
 * Setup a Clipping instance for testing.
 * @param {Object} options - Setup options.
 * @param {THREE.Vector3} [options.center] - Center point.
 * @param {number} [options.size] - Size of clipping region.
 * @param {number} [options.numSolids] - Number of solid objects.
 * @param {string} [options.theme] - Theme ('light' or 'dark').
 * @returns {Object} Test context with clipping, nestedGroup, display, etc.
 */
export function setupClipping(options = {}) {
  const center = options.center || new THREE.Vector3(0, 0, 0);
  const size = options.size || 10;
  const numSolids = options.numSolids !== undefined ? options.numSolids : 2;
  const theme = options.theme || 'light';

  const nestedGroup = createMockNestedGroup(numSolids);
  const display = createMockDisplay();

  const clipping = new Clipping(
    center.toArray(),
    size,
    nestedGroup,
    {
      onNormalChange: (index, normal) => display.setNormalLabel(index, normal),
    },
    theme,
  );

  return {
    clipping,
    nestedGroup,
    display,
    center,
    size,
    theme,
    calls: display.calls,
  };
}

/**
 * Cleanup Clipping test context.
 * @param {Object} context - The test context from setupClipping.
 */
export function cleanupClipping(context) {
  if (context.clipping) {
    context.clipping.dispose();
  }
}

/**
 * Get all PlaneMesh objects from the clipping setup.
 * @param {Object} nestedGroup - The nested group.
 * @returns {THREE.Mesh[]} Array of PlaneMesh objects.
 */
export function getPlaneMeshes(nestedGroup) {
  for (const child of nestedGroup.rootGroup.children) {
    if (child.name === 'PlaneMeshes') {
      return child.children;
    }
  }
  return [];
}

/**
 * Get plane helpers from clipping instance.
 * @param {Clipping} clipping - The clipping instance.
 * @returns {THREE.Mesh[]} Array of plane helper meshes.
 */
export function getPlaneHelpers(clipping) {
  return clipping.planeHelpers.children;
}

/**
 * Count stencil groups added to object groups.
 * @param {Object} nestedGroup - The nested group.
 * @returns {number} Count of clipping groups.
 */
export function countStencilGroups(nestedGroup) {
  let count = 0;
  for (const path in nestedGroup.groups) {
    const group = nestedGroup.groups[path];
    if (group.clipping) {
      count += group.clipping.size;
    }
  }
  return count;
}

/**
 * Get the constant value of a clip plane.
 * @param {Clipping} clipping - The clipping instance.
 * @param {number} index - Plane index (0, 1, or 2).
 * @returns {number} The centered constant value.
 */
export function getPlaneConstant(clipping, index) {
  return clipping.clipPlanes[index].centeredConstant;
}

/**
 * Get the normal vector of a clip plane.
 * @param {Clipping} clipping - The clipping instance.
 * @param {number} index - Plane index (0, 1, or 2).
 * @returns {THREE.Vector3} The normal vector.
 */
export function getPlaneNormal(clipping, index) {
  return clipping.clipPlanes[index].normal.clone();
}
