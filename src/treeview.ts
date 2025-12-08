import { KeyMapper } from "./utils.js";
import { TreeModel, States } from "./tree-model.js";
import type { TreeNode, TreeData, StateValue, IconIndex } from "./tree-model.js";

/** Navigation icons for expand/collapse */
const NAV_ICONS = {
  expanded: "\u25BE",
  collapsed: "\u25B8",
};

/** Icon class names for each state [unselected, selected, mixed, disabled] */
const VIEW_ICONS = [
  ["shape_no", "shape", "shape_mix", "shape_empty"],
  ["mesh_no", "mesh", "mesh_mix", "mesh_empty"],
];

/** Offset for visibility calculations */
const SCROLL_OFFSET = 12;

/** Icon indices for iteration (typed tuple for state access) */
const ICON_INDICES = [0, 1] as const;

/**
 * Callback types for TreeView.
 */
type ObjectHandler = (
  path: string,
  state: StateValue,
  iconNumber: number,
  propagate: boolean,
  notify: boolean
) => void;

type PickHandler = (
  parentPath: string,
  name: string,
  meta: boolean,
  shift: boolean,
  alt: boolean,
  extra: null,
  nodeType: "leaf" | "node",
  fromTree: boolean
) => void;

type UpdateHandler = (flag: boolean) => void;
type NotificationHandler = () => void;
type ColorGetter = (path: string) => string | null;

/**
 * A tree viewer component with lazy loading of large trees.
 * Uses TreeModel for data management and handles DOM rendering/events.
 */
class TreeView {
  tree: TreeData | null;
  scrollContainer: HTMLElement;
  objectHandler: ObjectHandler;
  pickHandler: PickHandler;
  updateHandler: UpdateHandler;
  notificationHandler: NotificationHandler;
  colorGetter: ColorGetter;
  theme: string;
  linkIcons: boolean;
  debug: boolean;
  model: TreeModel | null;
  container: HTMLUListElement | null;
  lastLabel: HTMLElement | null;
  lastScrollTop: number;

  /**
   * Constructs a TreeView object.
   * @param tree - The tree structure data.
   * @param scrollContainer - The scrollable container element.
   * @param objectHandler - Callback for object visibility changes.
   * @param pickHandler - Callback for node selection/picking.
   * @param updateHandler - Callback for tree updates.
   * @param notificationHandler - Callback for notifications.
   * @param colorGetter - Function to get color for a path.
   * @param theme - The UI theme ('light' or 'dark').
   * @param linkIcons - Whether icon 0 and 1 are linked.
   * @param debug - Enable debug logging.
   */
  constructor(
    tree: TreeData,
    scrollContainer: HTMLElement,
    objectHandler: ObjectHandler,
    pickHandler: PickHandler,
    updateHandler: UpdateHandler,
    notificationHandler: NotificationHandler,
    colorGetter: ColorGetter,
    theme: string,
    linkIcons: boolean,
    debug: boolean = false,
  ) {
    this.tree = tree;
    this.scrollContainer = scrollContainer;
    this.objectHandler = objectHandler;
    this.pickHandler = pickHandler;
    this.updateHandler = updateHandler;
    this.notificationHandler = notificationHandler;
    this.colorGetter = colorGetter;
    this.theme = theme;
    this.linkIcons = linkIcons;
    this.debug = debug;

    this.model = null;
    this.container = null;
    this.lastLabel = null;
    this.lastScrollTop = 0;
  }

  /**
   * Initialize the tree view - creates the model and DOM container.
   * @returns The container element.
   */
  create(): HTMLUListElement {
    // Create the data model
    this.model = new TreeModel(this.tree, {
      linkIcons: this.linkIcons,
      onStateChange: (node, iconNumber) => this._handleStateChange(node, iconNumber),
    });

    // Create DOM container
    this.container = document.createElement("ul");
    this.container.classList.add("tcv_toplevel");

    this.scrollContainer.addEventListener("scroll", this.handleScroll);

    return this.container;
  }

  /**
   * Handle state changes from the model.
   * @param node - The node whose state changed.
   * @param iconNumber - Which icon changed (0 or 1).
   */
  private _handleStateChange(node: TreeNode, iconNumber: IconIndex): void {
    const icons: IconIndex[] = iconNumber === 0 && this.linkIcons ? [0, 1] : [iconNumber];
    for (const i of icons) {
      this.objectHandler(this.getNodePath(node), node.state[i], i, true, false);
    }
  }

  // ============================================================================
  // Delegated Properties (for backward compatibility)
  // ============================================================================

  /** @returns The root node of the tree. */
  get root(): TreeNode | null {
    return this.model ? this.model.root : null;
  }

  /** @returns The maximum depth level of the tree. */
  get maxLevel(): number {
    return this.model ? this.model.maxLevel : 0;
  }

  // ============================================================================
  // Visible Elements Handling
  // ============================================================================

  /**
   * Retrieves the visible elements within the container.
   * @returns An array of visible elements.
   */
  getVisibleElements(): Element[] {
    if (!this.container) return [];

    const isElementVisible = (el: Element, containerRect: DOMRect): boolean => {
      const rect = el.getBoundingClientRect();
      return (
        rect.height > 0 &&
        rect.top >= -SCROLL_OFFSET &&
        rect.top <= containerRect.bottom + SCROLL_OFFSET
      );
    };

    const elements = this.container.querySelectorAll(".tv-tree-node");
    const containerRect = this.scrollContainer.getBoundingClientRect();
    const visibleElements = Array.from(elements).filter((el) =>
      isElementVisible(el, containerRect),
    );

    if (this.debug) {
      this._logVisibleElements(visibleElements);
    }

    return visibleElements;
  }

  /**
   * Debug logging for visible elements.
   * @param elements - The visible elements.
   */
  private _logVisibleElements(elements: Element[]): void {
    console.log(`\nVisible elements (${elements.length}):`);
    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue;
      const node = this.findNodeByPath(el.dataset.path || "");
      if (node) {
        console.log(
          node.path,
          node.state[0],
          node.state[1],
          " => ",
          el.dataset.state0,
          el.dataset.state1,
        );
      }
    }
  }

  /************************************************************************************
   *  Handlers
   ************************************************************************************/

  /**
   * Handles the scroll event.
   */
  handleScroll = (): void => {
    if (!this.scrollContainer) {
      return;
    }

    this.lastScrollTop = this.scrollContainer.scrollTop;
    if (this.debug) {
      console.log("update => scroll");
    }
    this.update();
  };

  /**
   * Handles the click event on a navigation node.
   * @param node - The node associated with the navigation marker.
   * @returns The event handler function.
   */
  handleNavigationClick = (node: TreeNode): ((e: Event) => void) => {
    return (e: Event) => {
      e.stopPropagation();
      node.expanded = !node.expanded;
      this.showChildContainer(node);
      if (this.debug) {
        console.log("update => navClick");
      }
      this.update();
    };
  };

  /**
   * Handles the click event on an icon.
   * @param node - The node associated with the icon.
   * @param s - The icon index (0 for shapes, 1 for edges).
   * @returns The event handler function.
   */
  handleIconClick = (node: TreeNode, s: IconIndex): ((e: Event) => void) => {
    return (e: Event) => {
      e.stopPropagation();
      this.toggleIcon(node, s);
    };
  };

  /**
   * Handles the click event on a label.
   * @param node - The node that was clicked.
   * @param e - The event.
   */
  handleLabelClick(node: TreeNode, e: Event): void {
    const isMouse = e instanceof MouseEvent;
    this.pickHandler(
      this.getNodePath(this.getParent(node)),
      node.name,
      isMouse ? KeyMapper.get(e, "meta") : false,
      isMouse ? KeyMapper.get(e, "shift") : false,
      isMouse ? KeyMapper.get(e, "alt") : false,
      null,
      this.isLeaf(node) ? "leaf" : "node",
      true,
    );

    console.log(`Label clicked: ${this.getNodePath(node)}`);
  }

  /**
   * Updates the tree view with the given prefix.
   * @param prefix - The prefix to filter the visible elements.
   */
  update = (prefix: string | null = null): void => {
    if (!this.container || !this.model) return;

    const visibleElements = this.getVisibleElements().filter((p): p is HTMLElement =>
      p instanceof HTMLElement && (prefix == null || (p.dataset.path || "").startsWith(prefix)),
    );
    for (const el of visibleElements) {
      const path = el.dataset.path || "";

      const node = this.findNodeByPath(path);
      if (node != null) {
        // render the actual node
        if (!node.rendered) {
          this.renderNode(node, el);
          node.rendered = true;
        }
        // render placeholders for all children
        if (node.expanded) {
          const childrenContainer = el.querySelector(".tv-children");
          if (
            childrenContainer instanceof HTMLElement &&
            childrenContainer.children.length === 0
          ) {
            for (const key in node.children) {
              const child = node.children[key];
              this.renderPlaceholder(child, childrenContainer);
            }
            this.showChildContainer(node);
            this.update(path);
          }
        }

        // and adapt the icons the the state
        for (const s of ICON_INDICES) {
          const domState = el.dataset[`state${s}`];
          const state = node.state[s];
          if (domState != String(state)) {
            this.updateIconInDOM(node, s);
          }
        }
        this.showChildContainer(node);
      } else {
        console.error(`Node not found: ${path}`);
      }
    }
  };

  /************************************************************************************
   *  Rendering routines
   ************************************************************************************/

  /**
   * Renders the tree view by clearing the container, rendering the placeholder,
   * and updating the tree.
   */
  render(): void {
    if (!this.container || !this.root) return;

    this.container.innerHTML = "";
    this.renderPlaceholder(this.root, this.container);
    if (this.debug) {
      console.log("update => render");
    }
    this.update();
  }

  /**
   * Renders a placeholder node in the tree view.
   * @param node - The node object to render.
   * @param container - The container element to append the rendered node to.
   * @param openPath - The path of the node to be opened, or null if no node should be opened.
   */
  renderPlaceholder(node: TreeNode, container: HTMLElement, openPath: string | null = null): void {
    if (this.debug) {
      console.log("renderPlaceholder", node.path, node.level);
    }
    const nodeElement = document.createElement("div");
    nodeElement.className = "tv-tree-node";
    nodeElement.dataset.path = this.getNodePath(node);
    nodeElement.dataset.openPath = openPath || "";
    nodeElement.dataset.state0 = String(node.state[0]);
    nodeElement.dataset.state1 = String(node.state[1]);

    const nodeContent = document.createElement("div");
    nodeContent.className = "tv-node-content";
    if (this.debug) {
      nodeContent.innerText = node.path;
    }
    nodeElement.appendChild(nodeContent);
    container.appendChild(nodeElement);
  }

  /**
   * Renders a node in the tree view to replace the placeholder.
   * @param node - The node object to render.
   * @param parentElement - The parent element to append the rendered node to.
   * @returns The container element for the node's children, if any.
   */
  renderNode(node: TreeNode, parentElement: HTMLElement): HTMLDivElement | null {
    if (this.debug) {
      console.log("renderNode", node.path, node.level);
    }
    const nodeContent = document.createElement("div");
    nodeContent.className = "tv-node-content";
    parentElement.removeChild(parentElement.firstChild!);
    parentElement.appendChild(nodeContent);

    const navMarker = document.createElement("span");
    navMarker.className = "tv-nav-marker";
    navMarker.innerHTML = node.children
      ? node.expanded
        ? NAV_ICONS.expanded
        : NAV_ICONS.collapsed
      : "";

    navMarker.onclick = this.handleNavigationClick(node);

    nodeContent.dataset.state0 = String(node.state[0]);
    nodeContent.dataset.state1 = String(node.state[1]);

    nodeContent.appendChild(navMarker);

    for (const s of ICON_INDICES) {
      const icon = document.createElement("span");
      const state = node.state[s];
      let className = `tv-icon tv-icon${s}`;
      if (state !== States.disabled) {
        className += " tv-pointer";
      }
      icon.className = className;
      icon.classList.add("tcv_tree_button");
      icon.classList.add(`tcv_button_${VIEW_ICONS[s][state]}`);
      if (state !== States.disabled) {
        icon.onmousedown = (e) => {
          e.preventDefault();
        };
        icon.onclick = this.handleIconClick(node, s);
      }
      nodeContent.appendChild(icon);
    }

    const label = document.createElement("span");
    label.className = "tv-node-label";
    label.innerHTML = node.name;
    const color = this.colorGetter(node.path);
    if (color != null) {
      label.innerHTML += `<span style="color:${color}"> ⚈</span>`;
    }
    label.onmousedown = (e) => {
      e.preventDefault();
    };
    label.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleLabelClick(node, e);
    };
    label.onclick = (e) => {
      e.stopPropagation();
      this.handleLabelClick(node, e);
    };

    nodeContent.appendChild(label);

    let childrenContainer: HTMLDivElement | null = null;
    if (node.children) {
      childrenContainer = document.createElement("div");
      childrenContainer.className = "tv-children";
      childrenContainer.style.display = "none";
      parentElement.appendChild(childrenContainer);
    }
    return childrenContainer;
  }

  /************************************************************************************
   *  DOM functions
   ************************************************************************************/

  /**
   * Retrieves the DOM node with the specified path.
   * @param path - The path of the DOM node to retrieve.
   * @returns The DOM node with the specified path, or null if not found.
   */
  getDomNode = (path: string): HTMLElement | null => {
    if (!this.container) return null;
    const el = this.container.querySelector(`[data-path="${path}"]`);
    return el instanceof HTMLElement ? el : null;
  };

  /**
   * Shows or hides the child container of a node based on the expanded parameter.
   * @param node - The node object.
   */
  showChildContainer(node: TreeNode): void {
    if (node.expanded == null) return;

    const path = this.getNodePath(node);
    const nodeElement = this.getDomNode(path);
    if (nodeElement) {
      const childrenContainer = nodeElement.querySelector(".tv-children");
      if (childrenContainer instanceof HTMLElement) {
        const isExpanded = childrenContainer.style.display !== "none";
        if (isExpanded !== node.expanded) {
          childrenContainer.style.display = node.expanded ? "block" : "none";
          const navMarker = nodeElement.querySelector(".tv-nav-marker");
          if (navMarker) {
            navMarker.innerHTML = node.expanded
              ? NAV_ICONS.expanded
              : NAV_ICONS.collapsed;
          }
          if (!node.expanded) {
            if (this.debug) {
              console.log("update => showChildContainer");
            }
            this.update();
          }
        }
      }
    } else {
      console.error(`Element not found: ${path}`);
    }
  }

  /**
   * Updates the icon in the DOM for a given node.
   * @param node - The node to update the icon for.
   * @param iconNumber - The icon number to update.
   */
  updateIconInDOM(node: TreeNode, iconNumber: IconIndex): void {
    if (!this.container) return;

    const nodePath = this.getNodePath(node);
    const nodeElement = this.container.querySelector(`[data-path="${nodePath}"]`);
    if (nodeElement instanceof HTMLElement) {
      const icon = nodeElement.querySelector(`.tv-icon${iconNumber}`);
      if (icon) {
        for (const b of VIEW_ICONS[iconNumber]) {
          icon.classList.remove(`tcv_button_${b}`);
        }
        icon.classList.add(`tcv_button_${VIEW_ICONS[iconNumber][node.state[iconNumber]]}`);
      }
      nodeElement.dataset[`state${iconNumber}`] = String(node.state[iconNumber]);
    }
  }

  /**
   * Toggles the color of the label for a given node.
   * @param node - The node for which to toggle the label color.
   * @param path - If node is null, the path for which to toggle the label color.
   */
  toggleLabelColor(node: TreeNode | null, path: string | null = null): void {
    if (!this.container) return;

    const nodePath = path == null && node ? this.getNodePath(node) : path;
    if (!nodePath) return;

    const nodeElement = this.container.querySelector(`[data-path="${nodePath}"]`);
    if (this.lastLabel) {
      this.lastLabel.classList.remove("tv-node-label-highlight");
    }
    if (nodeElement) {
      const label = nodeElement.querySelector(".tv-node-label");
      if (label instanceof HTMLElement) {
        if (this.lastLabel === label) {
          this.lastLabel = null;
        } else {
          label.classList.toggle("tv-node-label-highlight");
          this.lastLabel = label;
        }
      }
    }
  }

  // ============================================================================
  // Tree Handling - Delegated to TreeModel
  // ============================================================================

  /**
   * Traverse the tree and call a callback for each node.
   * @param node - Starting node.
   * @param callback - Function to call for each node.
   */
  traverse(node: TreeNode, callback: (node: TreeNode) => void): void {
    if (this.model) {
      this.model.traverse(node, callback);
    }
  }

  /**
   * Check if a node is a leaf (has no children).
   * @param node - The node to check.
   * @returns True if the node is a leaf.
   */
  isLeaf(node: TreeNode): boolean {
    return this.model ? this.model.isLeaf(node) : true;
  }

  /**
   * Get the full path of a node.
   * @param node - The node.
   * @returns The full path.
   */
  getNodePath(node: TreeNode | null): string {
    return this.model ? this.model.getNodePath(node) : "";
  }

  /**
   * Find a node by its path.
   * @param path - The path to find.
   * @returns The found node or null.
   */
  findNodeByPath(path: string): TreeNode | null {
    return this.model ? this.model.findNodeByPath(path) : null;
  }

  /**
   * Get the parent node of a given node.
   * @param node - The child node.
   * @returns The parent node or null.
   */
  getParent(node: TreeNode): TreeNode | null {
    return this.model ? this.model.getParent(node) : null;
  }

  // ============================================================================
  // State Management - Uses TreeModel, handles UI updates
  // ============================================================================

  /**
   * Toggle the state of a node's icon.
   * @param node - The node to toggle.
   * @param iconNumber - Which icon (0 or 1).
   * @param force - Force state (true=selected, false=unselected, null=toggle).
   */
  toggleIcon(node: TreeNode, iconNumber: IconIndex, force: boolean | null = null): void {
    if (!this.model) return;

    const changed = this.model.toggleNodeState(node, iconNumber, force);
    if (changed) {
      this.update();
      this.updateHandler(true);
      this.notificationHandler();
    }
  }

  /**
   * Hide all nodes in the tree.
   */
  hideAll(): void {
    if (!this.model) return;

    this.model.hideAll();
    this.update();
    this.updateHandler(true);
    this.notificationHandler();
  }

  /**
   * Show all nodes in the tree.
   */
  showAll(): void {
    if (!this.model) return;

    this.model.showAll();
    this.update();
    this.updateHandler(true);
    this.notificationHandler();
  }

  /**
   * Show a specific node by path.
   * @param path - The node path.
   */
  show(path: string): void {
    if (!this.model) return;

    this.model.show(path);
    this.update();
    this.updateHandler(true);
    this.notificationHandler();
  }

  /**
   * Hide a specific node by path.
   * @param path - The node path.
   */
  hide(path: string): void {
    if (!this.model) return;

    this.model.hide(path);
    this.update();
    this.updateHandler(true);
    this.notificationHandler();
  }

  /**
   * Get the state of a node by path.
   * @param path - The node path.
   * @returns The state array or null.
   */
  getState(path: string): [StateValue, StateValue] | null {
    return this.model ? this.model.getState(path) : null;
  }

  /**
   * Get all leaf node states.
   * @returns Map of path -> state array.
   */
  getStates(): Record<string, [StateValue, StateValue]> {
    return this.model ? this.model.getStates() : {};
  }

  /**
   * Set the state of a node by path.
   * @param path - The node path.
   * @param state - The new state.
   */
  setState(path: string, state: [StateValue, StateValue]): void {
    if (!this.model) return;

    this.model.setState(path, state);
    this.update();
    this.updateHandler(true);
    this.notificationHandler();
  }

  /**
   * Set multiple node states at once.
   * @param states - Map of path -> state array.
   */
  setStates(states: Record<string, [StateValue, StateValue]>): void {
    if (!this.model) return;

    this.model.setStates(states);
    this.update();
    this.updateHandler(true);
    this.notificationHandler();
  }

  /************************************************************************************
   *  Tree handling high level API
   ************************************************************************************/

  /**
   * Scrolls the parent container to center the specified element within the visible area.
   * @param element - The DOM element to center within the scroll container.
   */
  scrollCentered(element: HTMLElement | null): void {
    if (element != null) {
      const parent = this.scrollContainer;

      // Calculate the center position of the element relative to the parent
      const elementHeight = element.offsetHeight;
      const parentHeight = parent.clientHeight;

      // Calculate scroll position that would center the element
      const elementOffset = element.offsetTop - parent.offsetTop;
      const scrollTop = elementOffset - parentHeight / 2 + elementHeight / 2;

      // Ensure we don't scroll beyond the parent's scrollable area
      const maxScroll = parent.scrollHeight - parentHeight;
      const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScroll));

      // Perform the scroll
      parent.scrollTo({ top: clampedScrollTop, behavior: "smooth" });
    }
  }

  /**
   * Ensures a node and its children are rendered in the DOM.
   * @param node - The node to render.
   */
  private _ensureNodeRendered(node: TreeNode): HTMLElement | null {
    const path = this.getNodePath(node);
    let el = this.getDomNode(path);

    // If element doesn't exist, we need to ensure parent renders it
    if (!el) {
      const parent = this.getParent(node);
      if (parent) {
        this._ensureNodeRendered(parent);
        // After parent is rendered, check if our element exists now
        el = this.getDomNode(path);
      }
    }

    if (!el) {
      // Element still doesn't exist - create placeholder in parent's children container
      const parent = this.getParent(node);
      if (parent) {
        const parentEl = this.getDomNode(this.getNodePath(parent));
        if (parentEl) {
          let childrenContainer = parentEl.querySelector(".tv-children");
          if (!childrenContainer && parent.children) {
            // Need to render the parent node first to create children container
            if (!parent.rendered) {
              this.renderNode(parent, parentEl);
              parent.rendered = true;
            }
            childrenContainer = parentEl.querySelector(".tv-children");
          }
          if (childrenContainer instanceof HTMLElement) {
            this.renderPlaceholder(node, childrenContainer);
            el = this.getDomNode(path);
          }
        }
      }
    }

    // Now render the actual node content if it's just a placeholder
    if (el && !node.rendered) {
      this.renderNode(node, el);
      node.rendered = true;
    }

    // If node is expanded, ensure children containers are created
    if (el && node.expanded && node.children) {
      const childrenContainer = el.querySelector(".tv-children");
      if (childrenContainer instanceof HTMLElement) {
        if (childrenContainer.children.length === 0) {
          for (const key in node.children) {
            this.renderPlaceholder(node.children[key], childrenContainer);
          }
        }
        childrenContainer.style.display = "block";
      }
    }

    return el;
  }

  /**
   * Opens the specified path in the tree view.
   * @param path - The path to open in the tree view.
   */
  openPath(path: string): void {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    let node: TreeNode | null = null;
    let el: HTMLElement | null = null;

    for (const part of parts) {
      current += "/" + part;
      node = this.findNodeByPath(current);

      if (node) {
        // Mark as expanded
        if (node.children) {
          node.expanded = true;
        }

        // Ensure this node is rendered (bypassing lazy loading)
        el = this._ensureNodeRendered(node);

        // Update nav marker if element exists
        if (el) {
          const navMarker = el.querySelector(".tv-nav-marker");
          if (navMarker && node.children) {
            navMarker.innerHTML = NAV_ICONS.expanded;
          }
        }

        if (this.debug) {
          console.log("update => openPath", current);
        }
      } else {
        console.error(`Path not found: ${current}`);
        break;
      }
    }

    // Final update to sync any remaining state
    this.update();

    // Scroll to and highlight the target
    this.scrollCentered(el);
    if (node) {
      this.toggleLabelColor(node);
    }
  }

  /**
   * Closes the specified path in the tree view.
   * @param path - The path to be closed.
   */
  closePath(path: string): void {
    const node = this.findNodeByPath(path);
    if (node) {
      node.expanded = false;
      this.showChildContainer(node);
      const el = this.getDomNode(path);
      if (el != null) {
        this.scrollContainer.scrollTop = el.offsetTop - this.scrollContainer.offsetTop;
      }
      if (this.debug) {
        console.log("update => collapsePath");
      }
      this.update();
    } else {
      console.error(`Path not found: ${path}`);
    }
  }

  /**
   * Open all nodes to a specified level.
   * @param level - The level to open (-1 for smart expand).
   */
  openLevel(level: number): void {
    if (!this.model || !this.root) return;

    this.model.setExpandedLevel(level);

    const el = this.getDomNode(this.getNodePath(this.root));
    if (el != null) {
      this.scrollContainer.scrollTop = el.offsetTop - this.scrollContainer.offsetTop;
    }

    // Multiple updates to ensure all levels are rendered
    const maxIterations = level === -1 ? this.maxLevel : level;
    for (let i = 0; i <= maxIterations; i++) {
      if (this.debug) {
        console.log("update => openLevel", i);
      }
      this.update();
    }
  }

  /**
   * Collapse all nodes in the tree view.
   */
  collapseAll(): void {
    this.openLevel(0);
  }

  /**
   * Expand all nodes in the tree view.
   */
  expandAll(): void {
    this.openLevel(this.maxLevel);
  }

  /**
   * Dispose of resources and clean up.
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.tree = null;
    this.container = null;
    this.lastLabel = null;
    this.scrollContainer.removeEventListener("scroll", this.handleScroll);
  }
}

export { TreeView, States };
