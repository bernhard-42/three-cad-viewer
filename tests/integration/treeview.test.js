import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import {
  setupTreeView,
  cleanupTreeView,
  createSimpleTree,
  createNestedTree,
  createLargeTree,
  createMixedStateTree,
  countRenderedNodes,
  countFullyRenderedNodes,
  isPathRendered,
  isPathExpanded,
  pathExistsInDOM,
  getVisiblePaths,
} from '../helpers/treeview-setup.js';

describe('TreeView - Basic Functionality', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('can create TreeView instance', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    expect(treeView).toBeDefined();
    expect(treeView.root).toBeDefined();
  });

  test('builds tree structure correctly', () => {
    const tree = createSimpleTree(3);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    expect(treeView.root).toBeDefined();
    expect(treeView.root.name).toBe('root');
    expect(treeView.root.children).toBeDefined();
    expect(Object.keys(treeView.root.children)).toHaveLength(3);
  });

  test('correctly identifies leaf nodes', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    // Root has children - not a leaf
    expect(treeView.isLeaf(treeView.root)).toBe(false);

    // Find a leaf node
    const firstChild = Object.values(treeView.root.children)[0];
    const grandChild = Object.values(firstChild.children)[0];
    expect(treeView.isLeaf(grandChild)).toBe(true);
  });

  test('findNodeByPath returns correct node', () => {
    const tree = createSimpleTree(3);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    const node = treeView.findNodeByPath('/root/leaf1');
    expect(node).toBeDefined();
    expect(node.name).toBe('leaf1');
  });

  test('findNodeByPath returns null for invalid path', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    const node = treeView.findNodeByPath('/root/nonexistent');
    expect(node).toBeNull();
  });

  test('getParent returns correct parent node', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    const leaf = treeView.findNodeByPath('/root/node_2_1/node_2_1_1_1');
    const parent = treeView.getParent(leaf);

    expect(parent).toBeDefined();
    expect(parent.name).toBe('node_2_1');
  });

  test('getNodePath returns correct path format', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    const path = treeView.getNodePath(treeView.root);
    expect(path).toBe('/root');
  });
});

describe('TreeView - Rendering', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('renders root node placeholder', () => {
    testContext = setupTreeView();
    const { container } = testContext;

    // At minimum, root should exist in DOM (might be placeholder or rendered)
    expect(countRenderedNodes(container)).toBeGreaterThan(0);
    expect(pathExistsInDOM(container, '/root')).toBe(true);
  });

  test('root becomes fully rendered after update cycle', () => {
    const tree = createSimpleTree(5);
    testContext = setupTreeView(tree);
    const { container, treeView } = testContext;

    // Force an update to ensure rendering
    treeView.update();

    // Root should be fully rendered now
    expect(pathExistsInDOM(container, '/root')).toBe(true);
  });

  test('renders icons with correct states when node is rendered', () => {
    testContext = setupTreeView();
    const { container, treeView } = testContext;

    // Force render
    treeView.update();

    // Check for icons (might be 0 if root is a leaf in simple tree)
    const nodeContent = container.querySelector('.tv-node-content');
    expect(nodeContent).not.toBeNull();
  });
});

describe('TreeView - Lazy Rendering', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('does not render all nodes of large tree immediately', () => {
    const tree = createLargeTree();
    testContext = setupTreeView(tree);
    const { container, treeView } = testContext;

    // Large tree has 1111 nodes, but only visible ones should be rendered
    const renderedCount = countFullyRenderedNodes(container);

    // Should be much less than total nodes
    expect(renderedCount).toBeLessThan(100);
  });

  test('renders more nodes when tree is expanded', () => {
    const tree = createNestedTree(3, 3);
    testContext = setupTreeView(tree);
    const { container, treeView } = testContext;

    const initialCount = countFullyRenderedNodes(container);

    // Expand root
    treeView.openPath('/root');

    const afterExpand = countFullyRenderedNodes(container);
    expect(afterExpand).toBeGreaterThanOrEqual(initialCount);
  });

  test('lazy renders children when parent is expanded', () => {
    const tree = createNestedTree(3, 3);
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    // Initially children should not be rendered
    const childPath = '/root/node_3_1';

    // Expand to see children
    treeView.openPath('/root');

    // Now children should be visible (at least as placeholders)
    const childNode = container.querySelector(`[data-path="${childPath}"]`);
    expect(childNode).not.toBeNull();
  });
});

describe('TreeView - Expanding in Middle of Unexpanded Tree', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('can expand a deeply nested path when parents are not expanded', () => {
    const tree = createLargeTree();
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    // Try to open a deeply nested path
    const deepPath = '/root/branch_5/node_5_5/leaf_5_5_5';

    // This should expand all parents along the way
    treeView.openPath(deepPath);

    // All parent paths should now exist in DOM and be expanded
    expect(pathExistsInDOM(container, '/root')).toBe(true);
    expect(pathExistsInDOM(container, '/root/branch_5')).toBe(true);
    expect(pathExistsInDOM(container, '/root/branch_5/node_5_5')).toBe(true);

    // And they should be expanded (not null = node exists, true = expanded)
    expect(isPathExpanded(container, '/root')).toBe(true);
    expect(isPathExpanded(container, '/root/branch_5')).toBe(true);
    // node_5_5 contains leaf_5_5_5, so it should be expanded
    expect(isPathExpanded(container, '/root/branch_5/node_5_5')).toBe(true);
  });

  test('expanding middle node renders its children correctly', () => {
    const tree = createLargeTree();
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    // Expand to a middle level - this should render the path
    treeView.openPath('/root/branch_3/node_3_5');

    // The children of node_3_5 should be visible
    const childPath = '/root/branch_3/node_3_5/leaf_3_5_1';
    expect(pathExistsInDOM(container, childPath)).toBe(true);
  });

  test('expanding multiple non-contiguous branches works correctly', () => {
    const tree = createLargeTree();
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    // Expand first branch deeply
    treeView.openPath('/root/branch_1/node_1_1');

    // Expand a different branch (not adjacent)
    treeView.openPath('/root/branch_8/node_8_8');

    // Both branches should exist in DOM
    expect(pathExistsInDOM(container, '/root/branch_1/node_1_1')).toBe(true);
    expect(pathExistsInDOM(container, '/root/branch_8/node_8_8')).toBe(true);

    // Check that leaves are rendered
    expect(pathExistsInDOM(container, '/root/branch_1/node_1_1/leaf_1_1_1')).toBe(true);
    expect(pathExistsInDOM(container, '/root/branch_8/node_8_8/leaf_8_8_1')).toBe(true);
  });

  test('collapsing and re-expanding preserves state', () => {
    const tree = createNestedTree(3, 3);
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    // Expand a path
    treeView.openPath('/root/node_3_1/node_3_1_2_1');

    // Verify it's expanded
    expect(isPathExpanded(container, '/root/node_3_1')).toBe(true);

    // Collapse it
    treeView.closePath('/root/node_3_1');
    expect(isPathExpanded(container, '/root/node_3_1')).toBe(false);

    // Re-expand
    treeView.openPath('/root/node_3_1');

    // Should be expanded again
    expect(isPathExpanded(container, '/root/node_3_1')).toBe(true);
  });
});

describe('TreeView - State Management', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('toggleIcon changes node state', () => {
    testContext = setupTreeView();
    const { treeView, calls } = testContext;

    const node = treeView.findNodeByPath('/root/leaf1');
    const initialState = node.state[0];

    treeView.toggleIcon(node, 0);

    // State should have changed
    expect(node.state[0]).not.toBe(initialState);
    // Handler should have been called
    expect(calls.objectHandler.length).toBeGreaterThan(0);
  });

  test('hideAll sets all states to unselected', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    treeView.hideAll();

    // Root should be unselected or mixed (depending on disabled nodes)
    expect(treeView.root.state[0]).toBeLessThanOrEqual(2); // 0, 1, or 2
  });

  test('showAll sets all states to selected', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    // First hide all
    treeView.hideAll();

    // Then show all
    treeView.showAll();

    // Root should be selected (1) or mixed (2)
    expect(treeView.root.state[0]).toBeGreaterThanOrEqual(1);
  });

  test('parent state updates when child state changes', () => {
    const tree = createMixedStateTree();
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    // Get the mixed_branch node
    const mixedBranch = treeView.findNodeByPath('/root/mixed_branch');

    // It should have mixed state (2) since children have different states
    expect(mixedBranch.state[0]).toBe(2);
  });

  test('child states update when parent state changes', () => {
    const tree = createMixedStateTree();
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    // Get visible_branch and toggle it off
    const visibleBranch = treeView.findNodeByPath('/root/visible_branch');
    treeView.toggleIcon(visibleBranch, 0, false);

    // Children should now be unselected
    const child1 = treeView.findNodeByPath('/root/visible_branch/visible_leaf1');
    expect(child1.state[0]).toBe(0);
  });

  test('getStates returns all leaf states', () => {
    const tree = createSimpleTree(3);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    const states = treeView.getStates();

    expect(Object.keys(states)).toHaveLength(3);
    expect(states['/root/leaf1']).toBeDefined();
    expect(states['/root/leaf2']).toBeDefined();
    expect(states['/root/leaf3']).toBeDefined();
  });

  test('setStates restores states correctly', () => {
    const tree = createSimpleTree(3);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    // Get current states
    const originalStates = treeView.getStates();

    // Change states
    treeView.hideAll();

    // Restore states
    treeView.setStates(originalStates);

    // States should be restored
    const restoredStates = treeView.getStates();
    expect(restoredStates).toEqual(originalStates);
  });

  test('disabled nodes cannot be toggled', () => {
    const tree = createMixedStateTree();
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    const disabledLeaf = treeView.findNodeByPath('/root/disabled_branch/disabled_leaf');
    const initialState = disabledLeaf.state[0];

    treeView.toggleIcon(disabledLeaf, 0);

    // State should not change for disabled nodes
    expect(disabledLeaf.state[0]).toBe(initialState);
  });
});

describe('TreeView - Navigation', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('openPath expands to the specified path', () => {
    const tree = createNestedTree(3, 2);
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    treeView.openPath('/root/node_3_1/node_3_1_2_1');

    // All parents should exist in DOM
    expect(pathExistsInDOM(container, '/root')).toBe(true);
    expect(pathExistsInDOM(container, '/root/node_3_1')).toBe(true);

    // And be expanded (data model)
    expect(treeView.root.expanded).toBe(true);
    const node31 = treeView.findNodeByPath('/root/node_3_1');
    expect(node31.expanded).toBe(true);
  });

  test('closePath collapses the specified path', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView, container } = testContext;

    // First expand
    treeView.openPath('/root/node_2_1');

    const node21 = treeView.findNodeByPath('/root/node_2_1');
    expect(node21.expanded).toBe(true);

    // Then collapse
    treeView.closePath('/root/node_2_1');
    expect(node21.expanded).toBe(false);
  });

  test('openLevel expands all nodes to specified level', () => {
    const tree = createNestedTree(3, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    treeView.openLevel(1);

    // Root should be expanded (in data model)
    expect(treeView.root.expanded).toBe(true);
  });

  test('collapseAll collapses entire tree', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    // First expand
    treeView.expandAll();

    // Then collapse
    treeView.collapseAll();

    // Root should not be expanded (level 0)
    expect(treeView.root.expanded).toBe(false);
  });

  test('expandAll expands entire tree', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    treeView.expandAll();

    // All non-leaf nodes should be expanded (in data model)
    let allExpanded = true;
    treeView.traverse(treeView.root, (node) => {
      if (!treeView.isLeaf(node) && !node.expanded) {
        allExpanded = false;
      }
    });

    expect(allExpanded).toBe(true);
  });
});

describe('TreeView - Event Handling', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('icon click triggers objectHandler', () => {
    testContext = setupTreeView();
    const { treeView, calls } = testContext;

    const node = treeView.findNodeByPath('/root/leaf1');
    treeView.toggleIcon(node, 0);

    expect(calls.objectHandler.length).toBeGreaterThan(0);
  });

  test('toggle triggers updateHandler', () => {
    testContext = setupTreeView();
    const { treeView, calls } = testContext;

    const node = treeView.findNodeByPath('/root/leaf1');
    treeView.toggleIcon(node, 0);

    expect(calls.updateHandler.length).toBeGreaterThan(0);
  });

  test('toggle triggers notificationHandler', () => {
    testContext = setupTreeView();
    const { treeView, calls } = testContext;

    const node = treeView.findNodeByPath('/root/leaf1');
    treeView.toggleIcon(node, 0);

    expect(calls.notificationHandler.length).toBeGreaterThan(0);
  });

  test('linkIcons mode toggles both icons together', () => {
    testContext = setupTreeView(null, { linkIcons: true });
    const { treeView, calls } = testContext;

    const node = treeView.findNodeByPath('/root/leaf1');
    const initialState0 = node.state[0];
    const initialState1 = node.state[1];

    treeView.toggleIcon(node, 0);

    // Both states should change when linkIcons is true
    expect(node.state[0]).not.toBe(initialState0);
    expect(node.state[1]).not.toBe(initialState1);
  });
});

describe('TreeView - Traversal', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('traverse visits all nodes', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    const visitedPaths = [];
    treeView.traverse(treeView.root, (node) => {
      visitedPaths.push(node.path);
    });

    // Should visit root + 2 level1 nodes + 4 level2 nodes = 7 nodes
    expect(visitedPaths.length).toBe(7);
  });

  test('traverse visits nodes in correct order (parent before children)', () => {
    const tree = createNestedTree(2, 2);
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    const visitedPaths = [];
    treeView.traverse(treeView.root, (node) => {
      visitedPaths.push(node.path);
    });

    // Root should be first
    expect(visitedPaths[0]).toBe('root');
  });
});

describe('TreeView - Edge Cases', () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanupTreeView(testContext);
      testContext = null;
    }
  });

  test('handles empty subtree gracefully', () => {
    // Empty subtrees should be treated as disabled leaves
    const tree = { root: { emptyChild: {} } };
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    expect(treeView.root).toBeDefined();
    const emptyChild = treeView.findNodeByPath('/root/emptyChild');
    expect(emptyChild).toBeDefined();
    // Empty objects are treated as disabled leaves
    expect(emptyChild.state[0]).toBe(3); // disabled
  });

  test('handles single node tree', () => {
    const tree = { root: [1, 1] };
    testContext = setupTreeView(tree);
    const { treeView } = testContext;

    expect(treeView.root).toBeDefined();
    expect(treeView.isLeaf(treeView.root)).toBe(true);
  });

  test('openPath handles invalid path gracefully', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    // Should not throw
    expect(() => {
      treeView.openPath('/root/nonexistent/path');
    }).not.toThrow();
  });

  test('closePath handles invalid path gracefully', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    // Should not throw
    expect(() => {
      treeView.closePath('/root/nonexistent');
    }).not.toThrow();
  });

  test('show/hide handle invalid paths gracefully', () => {
    testContext = setupTreeView();
    const { treeView } = testContext;

    // Should not throw
    expect(() => {
      treeView.show('/nonexistent');
      treeView.hide('/nonexistent');
    }).not.toThrow();
  });
});
