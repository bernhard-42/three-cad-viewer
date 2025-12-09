import { TreeView } from '../../src/ui/treeview.js';

/**
 * Create a mock scroll container for TreeView testing
 */
export function createScrollContainer() {
  const container = document.createElement('div');
  container.id = 'tree-scroll-container';
  container.style.width = '250px';
  container.style.height = '400px';
  container.style.overflow = 'auto';
  container.style.position = 'relative';
  document.body.appendChild(container);
  return container;
}

/**
 * Create a simple tree structure for testing
 * Returns a flat tree with specified number of leaf nodes
 */
export function createSimpleTree(numLeaves = 5) {
  const tree = { root: {} };
  for (let i = 1; i <= numLeaves; i++) {
    tree.root[`leaf${i}`] = [1, 1]; // [shapeState, edgeState] - both visible
  }
  return tree;
}

/**
 * Create a nested tree structure for testing lazy rendering
 * @param {number} depth - How deep the tree should be
 * @param {number} breadth - How many children per node
 */
export function createNestedTree(depth = 3, breadth = 3) {
  const buildLevel = (currentDepth, prefix = 'node') => {
    if (currentDepth === 0) {
      // Leaf level
      return [1, 1]; // visible state
    }

    const children = {};
    for (let i = 1; i <= breadth; i++) {
      const name = `${prefix}_${currentDepth}_${i}`;
      children[name] = buildLevel(currentDepth - 1, name);
    }
    return children;
  };

  return { root: buildLevel(depth) };
}

/**
 * Create a large tree for testing performance and lazy loading
 * Structure: root -> level1 (10 nodes) -> level2 (10 nodes each) -> leaves (10 each)
 * Total: 1 + 10 + 100 + 1000 = 1111 nodes
 */
export function createLargeTree() {
  const tree = { root: {} };

  for (let i = 1; i <= 10; i++) {
    const level1 = {};
    for (let j = 1; j <= 10; j++) {
      const level2 = {};
      for (let k = 1; k <= 10; k++) {
        level2[`leaf_${i}_${j}_${k}`] = [1, 1];
      }
      level1[`node_${i}_${j}`] = level2;
    }
    tree.root[`branch_${i}`] = level1;
  }

  return tree;
}

/**
 * Create a tree with mixed states for testing state propagation
 */
export function createMixedStateTree() {
  return {
    root: {
      visible_branch: {
        visible_leaf1: [1, 1],
        visible_leaf2: [1, 1],
      },
      hidden_branch: {
        hidden_leaf1: [0, 0],
        hidden_leaf2: [0, 0],
      },
      mixed_branch: {
        visible_leaf: [1, 1],
        hidden_leaf: [0, 0],
      },
      disabled_branch: {
        disabled_leaf: [3, 3], // disabled state
      },
    },
  };
}

/**
 * Create mock handlers for TreeView
 */
export function createMockHandlers() {
  const calls = {
    objectHandler: [],
    pickHandler: [],
    updateHandler: [],
    notificationHandler: [],
    colorGetter: [],
  };

  return {
    calls,
    objectHandler: (path, state, iconNumber, flag1, flag2) => {
      calls.objectHandler.push({ path, state, iconNumber, flag1, flag2 });
    },
    pickHandler: (parentPath, name, meta, shift, alt, extra, type, flag) => {
      calls.pickHandler.push({ parentPath, name, meta, shift, alt, extra, type, flag });
    },
    updateHandler: (flag) => {
      calls.updateHandler.push({ flag });
    },
    notificationHandler: () => {
      calls.notificationHandler.push({});
    },
    colorGetter: (path) => {
      calls.colorGetter.push({ path });
      return null; // No color by default
    },
  };
}

/**
 * Setup a TreeView instance for testing
 * @param {Object} tree - Tree data structure
 * @param {Object} options - Additional options
 */
export function setupTreeView(tree = null, options = {}) {
  const scrollContainer = createScrollContainer();
  const handlers = createMockHandlers();
  const treeData = tree || createSimpleTree();

  const treeView = new TreeView(
    treeData,
    scrollContainer,
    handlers.objectHandler,
    handlers.pickHandler,
    handlers.updateHandler,
    handlers.notificationHandler,
    handlers.colorGetter,
    options.theme || 'light',
    options.linkIcons !== undefined ? options.linkIcons : true,
    options.debug || false,
  );

  // Create the tree structure and render
  const container = treeView.create();
  scrollContainer.appendChild(container);
  treeView.render();

  return {
    treeView,
    scrollContainer,
    container,
    handlers,
    calls: handlers.calls,
  };
}

/**
 * Cleanup TreeView test context
 */
export function cleanupTreeView({ treeView, scrollContainer }) {
  if (treeView) {
    treeView.dispose();
  }
  if (scrollContainer && scrollContainer.parentNode) {
    scrollContainer.parentNode.removeChild(scrollContainer);
  }
}

/**
 * Helper to count rendered nodes in the DOM
 */
export function countRenderedNodes(container) {
  return container.querySelectorAll('.tv-tree-node').length;
}

/**
 * Helper to count fully rendered nodes (not just placeholders)
 */
export function countFullyRenderedNodes(container) {
  return container.querySelectorAll('.tv-node-label').length;
}

/**
 * Helper to check if a specific path is rendered (has actual content, not just placeholder)
 */
export function isPathRendered(container, path) {
  const node = container.querySelector(`[data-path="${path}"]`);
  if (!node) return false;
  // Check if it has actual content (label) vs just being a placeholder
  const label = node.querySelector('.tv-node-label');
  return label !== null;
}

/**
 * Helper to check if a specific path exists in DOM (even as placeholder)
 */
export function pathExistsInDOM(container, path) {
  return container.querySelector(`[data-path="${path}"]`) !== null;
}

/**
 * Helper to check if a specific path is expanded
 */
export function isPathExpanded(container, path) {
  const node = container.querySelector(`[data-path="${path}"]`);
  if (!node) return null; // Return null if node doesn't exist (vs false for not expanded)
  const children = node.querySelector('.tv-children');
  if (!children) return false; // No children container means it's a leaf or not rendered
  return children.style.display !== 'none';
}

/**
 * Helper to simulate scroll to make nodes visible
 */
export function scrollToTop(scrollContainer) {
  scrollContainer.scrollTop = 0;
  // Trigger scroll event
  scrollContainer.dispatchEvent(new Event('scroll'));
}

/**
 * Helper to simulate scroll to bottom
 */
export function scrollToBottom(scrollContainer) {
  scrollContainer.scrollTop = scrollContainer.scrollHeight;
  scrollContainer.dispatchEvent(new Event('scroll'));
}

/**
 * Helper to get all visible paths in the DOM
 */
export function getVisiblePaths(container) {
  const nodes = container.querySelectorAll('.tv-tree-node');
  return Array.from(nodes).map(node => node.dataset.path);
}
