/**
 * Tree node visibility states.
 */
const States = {
  unselected: 0,
  selected: 1,
  mixed: 2,
  disabled: 3,
} as const;

type StateValue = typeof States[keyof typeof States];

/** Icon index: 0 for shapes, 1 for edges */
type IconIndex = 0 | 1;

/**
 * Represents a node in the tree structure.
 */
interface TreeNode {
  name: string;
  state: [StateValue, StateValue];
  path: string;
  rendered: boolean;
  level: number;
  children?: Record<string, TreeNode>;
  expanded?: boolean;
}

/**
 * Raw tree data input format.
 */
interface TreeData {
  [key: string]: [StateValue, StateValue] | TreeData;
}

/**
 * Type guard to check if a tree data value is a leaf state array.
 */
function isLeafState(value: [StateValue, StateValue] | TreeData): value is [StateValue, StateValue] {
  return Array.isArray(value) && value.length === 2;
}

/**
 * Type guard to check if a tree data value is a nested TreeData object.
 */
function isTreeData(value: [StateValue, StateValue] | TreeData): value is TreeData {
  return typeof value === "object" && !Array.isArray(value);
}

/**
 * Options for configuring a TreeModel instance.
 */
interface TreeModelOptions {
  linkIcons?: boolean;
  onStateChange?: ((node: TreeNode, iconNumber: IconIndex) => void) | null;
}

/**
 * Manages tree data structure, traversal, and state for the TreeView.
 * Separates data/logic concerns from DOM rendering.
 */
class TreeModel {
  linkIcons: boolean;
  onStateChange: ((node: TreeNode, iconNumber: IconIndex) => void) | null;
  maxLevel: number;
  root: TreeNode | null;

  /**
   * Create a TreeModel instance.
   * @param treeData - The raw tree structure data.
   * @param options - Configuration options.
   */
  constructor(treeData: TreeData, options: TreeModelOptions = {}) {
    this.linkIcons = options.linkIcons !== undefined ? options.linkIcons : true;
    this.onStateChange = options.onStateChange || null;

    this.maxLevel = 0;
    this.root = this._buildTreeStructure(treeData);
  }

  /**
   * Builds the internal tree structure from raw data.
   * @param data - Raw tree data.
   * @returns The root node of the built tree.
   */
  private _buildTreeStructure(data: TreeData): TreeNode {
    const build = (
      data: TreeData,
      path: string | null,
      level: number
    ): [Record<string, TreeNode>, [StateValue, StateValue]] => {
      let result: [StateValue, StateValue] = [States.unselected, States.unselected];

      const calcState = (
        states: [[boolean, boolean], [boolean, boolean], [boolean, boolean], [boolean, boolean]]
      ): [StateValue, StateValue] => {
        for (let s of [0, 1] as const) {
          if (
            states[States.mixed][s] ||
            (states[States.selected][s] && states[States.unselected][s])
          ) {
            result[s] = States.mixed;
          } else if (states[States.selected][s]) {
            result[s] = States.selected;
          } else if (states[States.unselected][s]) {
            result[s] = States.unselected;
          } else if (states[States.disabled][s]) {
            result[s] = States.disabled;
          }
        }
        return result;
      };

      const tree: Record<string, TreeNode> = {};

      if (this.maxLevel < level) {
        this.maxLevel = level;
      }

      const trackStates: [[boolean, boolean], [boolean, boolean], [boolean, boolean], [boolean, boolean]] = [
        [false, false],
        [false, false],
        [false, false],
        [false, false],
      ];

      for (const key in data) {
        let currentPath = "";

        if (path == null) {
          currentPath = key;
        } else {
          currentPath = `${path}/${key}`;
        }

        let childStates: [StateValue, StateValue];
        const value = data[key];

        if (isLeafState(value)) {
          // Leaf node with state array
          childStates = value;
          trackStates[value[0]][0] = true;
          trackStates[value[1]][1] = true;
          tree[key] = {
            name: key,
            state: childStates,
            path: currentPath,
            rendered: false,
            level: level,
          };
        } else if (isTreeData(value) && Object.keys(value).length > 0) {
          // Non-empty object - recurse into children
          let children: Record<string, TreeNode>;
          [children, childStates] = build(value, currentPath, level + 1);
          trackStates[childStates[0]][0] = true;
          trackStates[childStates[1]][1] = true;
          tree[key] = {
            name: key,
            state: childStates,
            path: currentPath,
            rendered: false,
            level: level,
            children,
            expanded: false,
          };
        } else {
          // Empty object or unexpected value - treat as disabled leaf
          childStates = [States.disabled, States.disabled];
          trackStates[States.disabled][0] = true;
          trackStates[States.disabled][1] = true;
          tree[key] = {
            name: key,
            state: childStates,
            path: currentPath,
            rendered: false,
            level: level,
          };
        }
      }

      const newState = calcState(trackStates);
      return [tree, newState];
    };

    const root = build(data, null, 0)[0];
    return root[Object.keys(root)[0]];
  }

  // ============================================================================
  // Tree Traversal Methods
  // ============================================================================

  /**
   * Traverse the tree and call a callback for each node.
   * @param node - Starting node (usually root).
   * @param callback - Function to call for each node.
   */
  traverse(node: TreeNode, callback: (node: TreeNode) => void): void {
    callback(node);
    if (node.children) {
      for (const key of Object.keys(node.children)) {
        this.traverse(node.children[key], callback);
      }
    }
  }

  /**
   * Check if a node is a leaf (has no children).
   * @param node - The node to check.
   * @returns True if the node is a leaf.
   */
  isLeaf(node: TreeNode): boolean {
    return node.children == null;
  }

  /**
   * Get the full path of a node (with leading slash).
   * @param node - The node.
   * @returns The full path (e.g., "/root/child").
   */
  getNodePath(node: TreeNode | null): string {
    if (node == null) {
      return "";
    }
    return "/" + node.path;
  }

  /**
   * Find a node by its path.
   * @param path - Path string or array of path parts.
   * @returns The found node or null.
   */
  findNodeByPath(path: string | string[]): TreeNode | null {
    if (!this.root) return null;
    const parts = Array.isArray(path) ? path : path.split("/").filter(Boolean);

    let current: TreeNode = this.root;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (current.children && current.children[part]) {
        current = current.children[part];
      } else {
        return null;
      }
    }
    return current;
  }

  /**
   * Get the parent node of a given node.
   * @param node - The child node.
   * @returns The parent node or null if node is root.
   */
  getParent(node: TreeNode): TreeNode | null {
    const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));
    if (parentPath.length === 0) {
      return null;
    }
    return this.findNodeByPath(parentPath);
  }

  // ============================================================================
  // State Management Methods
  // ============================================================================

  /**
   * Get the state of a node by path.
   * @param path - The node path.
   * @returns The state array [icon0State, icon1State] or null.
   */
  getState(path: string): [StateValue, StateValue] | null {
    const node = this.findNodeByPath(path);
    return node ? node.state : null;
  }

  /**
   * Get all leaf node states.
   * @returns Map of path -> state array.
   */
  getStates(): Record<string, [StateValue, StateValue]> {
    const states: Record<string, [StateValue, StateValue]> = {};
    if (this.root) {
      this.traverse(this.root, (node) => {
        if (this.isLeaf(node)) {
          states[this.getNodePath(node)] = node.state;
        }
      });
    }
    return states;
  }

  /**
   * Set the state of a node by path.
   * @param path - The node path.
   * @param state - The new state [icon0State, icon1State].
   */
  setState(path: string, state: [StateValue, StateValue]): void {
    const node = this.findNodeByPath(path);
    if (node) {
      this.toggleNodeState(node, 0, state[0] === States.selected);
      this.toggleNodeState(node, 1, state[1] === States.selected);
    }
  }

  /**
   * Set multiple node states at once.
   * @param states - Map of path -> state array.
   */
  setStates(states: Record<string, [StateValue, StateValue]>): void {
    for (const path in states) {
      this.setState(path, states[path]);
    }
  }

  /**
   * Toggle the state of a node's icon.
   * @param node - The node to toggle.
   * @param iconNumber - Which icon (0 or 1).
   * @param force - Force to specific state (true=selected, false=unselected, null=toggle).
   * @returns True if state was changed.
   */
  toggleNodeState(node: TreeNode, iconNumber: IconIndex, force: boolean | null = null): boolean {
    const currentState = node.state[iconNumber];
    if (currentState === States.disabled) {
      return false;
    }

    // Determine which icons to update (linked mode affects icon 0)
    const icons: IconIndex[] = iconNumber === 0 ? (this.linkIcons ? [0, 1] : [0]) : [1];

    for (const i of icons) {
      if (node.state[i] !== States.disabled) {
        if (force !== null) {
          node.state[i] = force ? States.selected : States.unselected;
        } else {
          node.state[i] =
            currentState === States.selected
              ? States.unselected
              : States.selected;
        }

        // Notify of state change
        if (this.onStateChange) {
          this.onStateChange(node, i);
        }

        // Update parent and children states
        this._updateParentStates(node, i);
        this._updateChildrenStates(node, i);
      }
    }

    return true;
  }

  /**
   * Update parent states based on children states.
   * @param node - The node whose parents should be updated.
   * @param iconNumber - Which icon to update.
   */
  private _updateParentStates(node: TreeNode, iconNumber: IconIndex): void {
    let current = this.getParent(node);
    while (current) {
      const children = Object.values(current.children!);
      const allSelected = children.every(
        (child) =>
          child.state[iconNumber] === States.selected ||
          child.state[iconNumber] === States.disabled
      );
      const allUnselected = children.every(
        (child) =>
          child.state[iconNumber] === States.unselected ||
          child.state[iconNumber] === States.disabled
      );

      const newState: StateValue = allSelected
        ? States.selected
        : allUnselected
          ? States.unselected
          : States.mixed;

      if (current.state[iconNumber] !== newState) {
        if (current.state[iconNumber] !== States.disabled) {
          current.state[iconNumber] = newState;
          if (this.onStateChange) {
            this.onStateChange(current, iconNumber);
          }
        }
      }
      current = this.getParent(current);
    }
  }

  /**
   * Update children states to match parent state.
   * @param node - The parent node.
   * @param iconNumber - Which icon to update.
   */
  private _updateChildrenStates(node: TreeNode, iconNumber: IconIndex): void {
    const newState = node.state[iconNumber];

    const updateChildren = (current: TreeNode): void => {
      if (current.state[iconNumber] !== newState) {
        if (current.state[iconNumber] !== States.disabled) {
          current.state[iconNumber] = newState;
          if (this.onStateChange) {
            this.onStateChange(current, iconNumber);
          }
        }
      }
      if (current.children) {
        for (const child in current.children) {
          updateChildren(current.children[child]);
        }
      }
    };

    updateChildren(node);
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Hide all nodes (set state to unselected).
   */
  hideAll(): void {
    if (!this.root) return;
    this.toggleNodeState(this.root, 0, false);
    // Also handle case when all objects are edges and state[0] is disabled
    if (!this.linkIcons || this.root.state[0] === States.disabled) {
      this.toggleNodeState(this.root, 1, false);
    }
  }

  /**
   * Show all nodes (set state to selected).
   */
  showAll(): void {
    if (!this.root) return;
    this.toggleNodeState(this.root, 0, true);
    if (!this.linkIcons) {
      this.toggleNodeState(this.root, 1, true);
    }
  }

  /**
   * Show a specific node by path.
   * @param path - The node path.
   */
  show(path: string): void {
    const node = this.findNodeByPath(path);
    if (node) {
      this.toggleNodeState(node, 0, true);
    }
  }

  /**
   * Hide a specific node by path.
   * @param path - The node path.
   */
  hide(path: string): void {
    const node = this.findNodeByPath(path);
    if (node) {
      this.toggleNodeState(node, 0, false);
    }
  }

  /**
   * Set expanded state for all nodes up to a certain level.
   * @param level - The level to expand to (-1 for smart expand).
   */
  setExpandedLevel(level: number): void {
    if (!this.root) return;
    this.traverse(this.root, (node) => {
      if (this.isLeaf(node)) return;

      if (level === -1) {
        // Smart expand: expand unless single leaf child
        node.expanded =
          node.children != null &&
          !(
            Object.keys(node.children).length === 1 &&
            this.isLeaf(Object.values(node.children)[0])
          );
      } else {
        node.expanded = node.level < level;
      }
    });
  }

  /**
   * Expand all nodes along a path.
   * @param path - The path to expand to.
   * @returns The final node in the path, or null if not found.
   */
  expandPath(path: string): TreeNode | null {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    let node: TreeNode | null = null;

    for (const part of parts) {
      current += "/" + part;
      node = this.findNodeByPath(current);

      if (node) {
        if (node.children) {
          node.expanded = true;
        }
      } else {
        return null;
      }
    }

    return node;
  }

  /**
   * Collapse a node by path.
   * @param path - The path to collapse.
   * @returns The collapsed node, or null if not found.
   */
  collapsePath(path: string): TreeNode | null {
    const node = this.findNodeByPath(path);
    if (node) {
      node.expanded = false;
    }
    return node;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.root = null;
    this.onStateChange = null;
  }
}

export { TreeModel, States };
export type { TreeNode, TreeData, StateValue, IconIndex };
