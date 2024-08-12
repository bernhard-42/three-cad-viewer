import { getIconSvg } from "./icons.js";
import { KeyMapper } from "./utils.js";
import { Timer } from "./timer.js";

const States = {
  unselected: 0,
  selected: 1,
  mixed: 2,
  disabled: 3,
};

const StateClasses = ["unselected", "selected", "mixed", "disabled"];
var Counter = 0;

/**
 * A tree viewer component with lazy loading of large trees.
 */

class TreeView {
  /**
   * Constructs a TreeView object.
   *
   * @param {HTMLElement} container - The container element for the tree view.
   * @param {Object} tree - The tree structure data.
   * @param {boolean} [debug=false] - Indicates whether to enable debug mode.
   */
  constructor(
    tree,
    scrollContainer,
    objectHandler,
    pickHandler,
    updateHandler,
    theme,
    linkIcons,
    debug = false,
  ) {
    const svgPrefix =
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">';
    this.viewIcons = [
      [
        getIconSvg(theme, "shape_no"),
        getIconSvg(theme, "shape"),
        getIconSvg(theme, "shape_mix"),
        getIconSvg(theme, "shape_empty"),
      ],
      [
        getIconSvg(theme, "mesh_no"),
        getIconSvg(theme, "mesh"),
        getIconSvg(theme, "mesh_mix"),
        getIconSvg(theme, "mesh_empty"),
      ],
    ];

    this.navIcons = {
      right: getIconSvg(theme, "nav_closed"),
      down: getIconSvg(theme, "nav_open"),
    };

    this.tree = tree;
    this.offset = 12;
    this.scrollContainer = scrollContainer;
    this.objectHandler = objectHandler;
    this.pickHandler = pickHandler;
    this.updateHandler = updateHandler;
    this.theme = theme;
    this.linkIcons = linkIcons;
    this.debug = debug;
  }

  create() {
    this.maxLevel = 0;
    this.root = this.buildTreeStructure(this.tree);

    this.container = document.createElement("ul");
    this.container.classList.add("tcv_toplevel");

    this.scrollContainer.addEventListener("scroll", this.handleScroll);

    this.lastLabel = null;

    return this.container;
  }

  /************************************************************************************
   *  Tree creation and synching
   ************************************************************************************/

  /**
   * Builds a tree structure based on the provided data.
   *
   * @param {Object} data - The data used to build the tree structure.
   * @returns {Object} - The root node of the tree structure.
   */
  buildTreeStructure(data) {
    const build = (data, path, level) => {
      var result = [-1, -1];
      const calcState = (states) => {
        for (let s of [0, 1]) {
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

      const tree = {};

      if (this.maxLevel < level) {
        this.maxLevel = level;
      }

      var trackStates = [
        [false, false],
        [false, false],
        [false, false],
        [false, false],
      ];

      for (const key in data) {
        var currentPath = "";

        if (path == null) {
          currentPath = key;
        } else {
          currentPath = `${path}/${key}`;
        }
        let childStates;
        const value = data[key];
        if (Array.isArray(value)) {
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
        } else {
          let children;
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
        }
      }

      const newState = calcState(trackStates);

      return [tree, newState];
    };
    const root = build(data, null, 0)[0];
    return root[Object.keys(root)[0]];
  }

  /************************************************************************************
   * Visble elements handling
   ************************************************************************************/

  /**
   * Retrieves the visible elements within the container.
   * @returns {Element[]} An array of visible elements.
   */
  getVisibleElements() {
    const isElementVisible = (el, containerRect) => {
      const rect = el.getBoundingClientRect();
      const result =
        rect.height > 0 &&
        rect.top >= -this.offset &&
        rect.top <= containerRect.bottom + this.offset;
      return result;
    };

    const elements = this.container.querySelectorAll(".tv-tree-node");
    const containerRect = this.scrollContainer.getBoundingClientRect();
    const visibleElements = Array.from(elements).filter((el) =>
      isElementVisible(el, containerRect),
    );
    if (this.debug) {
      Counter++;
      console.log(
        `\n${Counter}> visible elements (${visibleElements.length}):`,
      );
      for (let i in visibleElements) {
        const el = visibleElements[i];
        const node = this.findNodeByPath(el.dataset.path);
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

    return visibleElements;
  }

  /************************************************************************************
   *  Handlers
   ************************************************************************************/

  /**
   * Handles the scroll event.
   */
  handleScroll = () => {
    if (!this.ticking) {
      window.requestAnimationFrame(() => {
        const scrollTop = this.scrollContainer.scrollTop;
        this.lastScrollTop = scrollTop;
        if (this.debug) {
          console.log("update => scroll");
        }
        this.update();

        this.ticking = false;
      });
      this.ticking = true;
    }
  };

  /**
   * Handles the click event on a navigation node.
   *
   * @param {Object} node - The node associated with the navigation marker.
   * @returns {Function} - The event handler function.
   */
  handleNavigationClick = (node) => {
    return (e) => {
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
   *
   * @param {Node} node - The node associated with the icon.
   * @param {string} s - The icon number 's'.
   * @returns {Function} - The event handler function.
   */
  handleIconClick = (node, s) => {
    return (e) => {
      e.stopPropagation();
      this.toggleIcon(node, s);
    };
  };

  /**
   * Handles the click event on a label.
   *
   * @param {Node} node - The node that was clicked.
   * @returns {void}
   */
  handleLabelClick(node, e) {
    this.pickHandler(
      this.getNodePath(this.getParent(node)),
      node.name,
      KeyMapper.get(e, "meta"),
      KeyMapper.get(e, "shift"),
      this.isLeaf(node) ? "leaf" : "node",
      true,
    );

    console.log(`Label clicked: ${this.getNodePath(node)}`);
  }

  /**
   * Updates the tree view with the given prefix.
   *
   * @param {string|null} prefix - The prefix to filter the visible elements.
   *                               If null, all elements are considered.
   */
  update = (prefix = null) => {
    const visibleElements = this.getVisibleElements().filter(
      (p) => prefix == null || p.dataset.path.startsWith(prefix),
    );
    for (var el of visibleElements) {
      const path = el.dataset.path;

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
            childrenContainer != null &&
            childrenContainer.children != null &&
            childrenContainer.children.length === 0
          ) {
            for (var key in node.children) {
              const child = node.children[key];
              this.renderPlaceholder(child, childrenContainer);
            }
            this.showChildContainer(node);
            this.update(path);
          }
        }

        // and adapt the icons the the state
        for (let s in [0, 1]) {
          const domState = el.dataset[`state${s}`];
          const state = node.state[s];
          if (domState != state) {
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
  render() {
    this.container.innerHTML = "";
    this.renderPlaceholder(this.root, this.container);
    if (this.debug) {
      console.log("update => render");
    }
    this.update();
  }

  /**
   * Renders a placeholder node in the tree view.
   *
   * @param {Object} node - The node object to render.
   * @param {HTMLElement} container - The container element to append the rendered node to.
   * @param {string|null} openPath - The path of the node to be opened, or null if no node should be opened.
   */
  renderPlaceholder(node, container, openPath = null) {
    if (this.debug) {
      console.log("renderPlaceholder", node.path, node.level);
    }
    const nodeElement = document.createElement("div");
    nodeElement.className = "tv-tree-node";
    nodeElement.dataset.path = this.getNodePath(node);
    nodeElement.dataset.openPath = openPath;
    nodeElement.dataset.state0 = node.state[0];
    nodeElement.dataset.state1 = node.state[1];

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
   *
   * @param {Object} node - The node object to render.
   * @param {HTMLElement} parentElement - The parent element to append the rendered node to.
   * @returns {HTMLElement} - The container element for the node's children, if any.
   */
  renderNode(node, parentElement) {
    if (this.debug) {
      console.log("renderNode", node.path, node.level);
    }
    const nodeContent = document.createElement("div");
    nodeContent.className = "tv-node-content";
    parentElement.removeChild(parentElement.firstChild);
    parentElement.appendChild(nodeContent);

    const navMarker = document.createElement("span");
    navMarker.className = "tv-nav-marker";
    navMarker.innerHTML = node.children
      ? node.expanded
        ? this.navIcons.down
        : this.navIcons.right
      : "";

    navMarker.onclick = this.handleNavigationClick(node);

    nodeContent.dataset.state0 = node.state[0];
    nodeContent.dataset.state1 = node.state[1];

    nodeContent.appendChild(navMarker);

    for (var s of [0, 1]) {
      const icon = document.createElement("span");
      const state = node.state[s];
      var className = `tv-icon tv-icon${s}`;
      if (state !== States.disabled) {
        className += " tv-pointer";
      }
      icon.className = className;
      icon.innerHTML = this.viewIcons[s][state];
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
    label.textContent = node.name;

    label.onmousedown = (e) => {
      e.preventDefault();
    };

    label.onclick = (e) => {
      e.stopPropagation();
      this.handleLabelClick(node, e);
    };

    nodeContent.appendChild(label);

    let childrenContainer = null;
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
   *
   * @param {string} path - The path of the DOM node to retrieve.
   * @returns {Element|null} - The DOM node with the specified path, or null if not found.
   */
  getDomNode = (path) => {
    return this.container.querySelector(`[data-path="${path}"]`);
  };

  /**
   * Shows or hides the child container of a node based on the expanded parameter.
   *
   * @param {object} node - The node object.
   */
  showChildContainer(node) {
    if (node.expanded == null) return;

    const path = this.getNodePath(node);
    const nodeElement = this.getDomNode(path);
    if (nodeElement) {
      const childrenContainer = nodeElement.querySelector(".tv-children");
      if (childrenContainer) {
        const isExpanded = childrenContainer.style.display !== "none";
        if (isExpanded !== node.expanded) {
          childrenContainer.style.display = node.expanded ? "block" : "none";
          nodeElement.querySelector(`.tv-nav-marker`).innerHTML = node.expanded
            ? this.navIcons.down
            : this.navIcons.right;
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
   *
   * @param {Node} node - The node to update the icon for.
   * @param {number} iconNumber - The icon number to update.
   */
  updateIconInDOM(node, iconNumber) {
    const nodePath = this.getNodePath(node);
    const nodeElement = this.container.querySelector(
      `[data-path="${nodePath}"]`,
    );
    if (nodeElement) {
      const icon = nodeElement.querySelector(`.tv-icon${iconNumber}`);
      if (icon) {
        icon.innerHTML = this.viewIcons[iconNumber][node.state[iconNumber]];
      }
      nodeElement.dataset[`state${iconNumber}`] = node.state[iconNumber];
    }
  }

  /**
   * Toggles the color of the label for a given node.
   * @param {Node} node - The node for which to toggle the label color.
   * @param {str} path - If node is null, the path for which to toggle the label color.
   */
  toggleLabelColor(node, path = null) {
    const nodePath = path == null ? this.getNodePath(node) : path;
    const nodeElement = this.container.querySelector(
      `[data-path="${nodePath}"]`,
    );
    if (this.lastLabel) {
      this.lastLabel.classList.remove("tv-node-label-highlight");
    }
    if (nodeElement) {
      const label = nodeElement.querySelector(`.tv-node-label`);
      if (label) {
        if (this.lastLabel === label) {
          this.lastLabel = null;
        } else {
          label.classList.toggle("tv-node-label-highlight");
          this.lastLabel = label;
        }
      }
    }
  }

  /************************************************************************************
   *  Tree handling functions
   ************************************************************************************/

  /**
   * Traverses a tree-like structure and applies a callback function to each node.
   * @param {Object} node - The root node of the tree.
   * @param {Function} callback - The callback function to be applied to each node.
   */
  traverse(node, callback) {
    callback(node);
    if (node.children) {
      for (let key of Object.keys(node.children)) {
        this.traverse(node.children[key], callback);
      }
    }
  }

  /**
   * Checks if a given node is a leaf node.
   *
   * @param {Object} node - The node to check.
   * @returns {boolean} - Returns true if the node is a leaf node, false otherwise.
   */
  isLeaf(node) {
    return node.children == null;
  }

  /**
   * Returns the path of a given node.
   *
   * @param {Node} node - The node object.
   * @returns {string} The path of the node.
   */
  getNodePath(node) {
    if (node == null) {
      return "";
    }
    return "/" + node.path;
  }

  /**
   * Finds a node in the tree by its path.
   *
   * @param {string|string[]} path - The path of the node to find. Can be either a string or an array of strings.
   * @returns {object|null} - The found node or null if the node is not found.
   */
  findNodeByPath(path) {
    var parts = Array.isArray(path) ? path : path.split("/").filter(Boolean);

    let current = this.root;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (current.children[part]) {
        current = current.children[part];
      } else {
        return null;
      }
    }
    return current;
  }

  /**
   * Retrieves the parent node of the given node.
   *
   * @param {Object} node - The node for which to find the parent.
   * @returns {Object|null} - The parent node if found, or null if the given node is the root node.
   */
  getParent(node) {
    const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));
    if (parentPath.length === 0) {
      return null;
    }
    return this.findNodeByPath(parentPath);
  }

  /**
   * Updates the object based on the provided node.
   * @param {Object} node - The node to update the object with.
   */
  updateObject = (node, iconNumber) => {
    var icons = iconNumber == 0 && this.linkIcons ? [0, 1] : [iconNumber];
    for (var i of icons) {
      this.objectHandler(
        this.getNodePath(node),
        node.state[i],
        i,
        false,
        false,
      );
    }
  };

  /**
   * Toggles the state of an icon for a given node.
   *
   * @param {Node} node - The node for which to toggle the icon state.
   * @param {number} iconNumber - The index of the icon to toggle.
   * @returns {void}
   */
  toggleIcon(node, iconNumber, force = null) {
    const currentState = node.state[iconNumber];
    if (currentState === States.disabled) {
      return;
    }
    var icons = iconNumber == 0 ? (this.linkIcons ? [0, 1] : [0]) : [1];
    for (var i of icons) {
      if (force != null) {
        node.state[i] = force ? 1 : 0;
      } else {
        node.state[i] =
          currentState === States.selected
            ? States.unselected
            : States.selected;
      }
      this.updateObject(node, iconNumber);
      this.updateParentStates(node, i);
      this.updateChildrenStates(node, i);
      this.update(null, i);
      this.updateHandler();
    }
  }

  /**
   * Hides all nodes in the tree.
   */
  hideAll() {
    this.toggleIcon(this.root, 0, false);
    if (!this.linkIcons) {
      this.toggleIcon(this.root, 1, false);
    }
  }

  /**
   * Shows all nodes in the tree.
   */
  showAll() {
    this.toggleIcon(this.root, 0, true);
    if (!this.linkIcons) {
      this.toggleIcon(this.root, 1, true);
    }
  }

  /**
   * Shows the node specified by the given path.
   *
   * @param {string} path - The path of the node to be shown.
   */
  show(path) {
    const node = this.findNodeByPath(path);
    if (node) {
      this.toggleIcon(node, 0, true);
    }
  }

  /**
   * Retrieves the states of a node specified by the given path.
   *
   * @param {string} path - The path of the node.
   * @returns {object|null} - The states of the node, or null if the node is not found.
   */
  getState(path) {
    const node = this.findNodeByPath(path);
    return node ? node.state : null;
  }

  /**
   * Retrieves the states of all leaf nodes in the tree.
   * @returns {Object} An object containing the states of all leaf nodes.
   */
  getStates() {
    const states = {};
    const getStates = (node) => {
      if (this.isLeaf(node)) {
        states[this.getNodePath(node)] = node.state;
      }
    };
    this.traverse(this.root, getStates);
    return states;
  }

  /**
   * Sets the state of a node identified by the given path.
   *
   * @param {string} path - The path of the node.
   * @param {Array} state - The new state of the node.
   */
  setState(path, state) {
    const node = this.findNodeByPath(path);
    if (node) {
      this.toggleIcon(node, 0, state[0]);
      this.toggleIcon(node, 1, state[1]);
    }
  }

  /**
   * Sets the states of the nodes based on the provided states object.
   *
   * @param {Object} states - The states object containing the node paths and their corresponding states.
   */
  setStates(states) {
    for (var path in states) {
      this.setState(path, states[path]);
    }
    this.update();
  }

  /**
   * Hides the node specified by the given path.
   *
   * @param {string} path - The path of the node to hide.
   */
  hide(path) {
    const node = this.findNodeByPath(path);
    if (node) {
      this.toggleIcon(node, 0, false);
    }
  }

  /**
   * Updates the state of parent nodes based on the state of their children.
   *
   * @param {Node} node - The node whose parent states need to be updated.
   * @param {number} iconNumber - The icon number representing the state.
   */
  updateParentStates(node, iconNumber) {
    let current = this.getParent(node);
    while (current) {
      const children = Object.values(current.children);
      const allSelected = children.every(
        (child) =>
          child.state[iconNumber] === States.selected ||
          child.state[iconNumber] === States.disabled,
      );
      const allUnselected = children.every(
        (child) =>
          child.state[iconNumber] === States.unselected ||
          child.state[iconNumber] === States.disabled,
      );
      const newState = allSelected
        ? States.selected
        : allUnselected
          ? States.unselected
          : States.mixed;
      if (current.state[iconNumber] !== newState) {
        if (current.state[iconNumber] !== States.disabled) {
          current.state[iconNumber] = newState;
          this.updateObject(current, iconNumber);
        }
      }
      current = this.getParent(current);
    }
  }

  /**
   * Updates the states of the children nodes based on the given icon number.
   *
   * @param {Object} node - The node whose children states need to be updated.
   * @param {number} iconNumber - The icon number to determine the new state of the children nodes.
   */
  updateChildrenStates(node, iconNumber) {
    const newState = node.state[iconNumber];
    const updateChildren = (current) => {
      if (current.state[iconNumber] !== newState) {
        if (current.state[iconNumber] !== States.disabled) {
          current.state[iconNumber] = newState;
          this.updateObject(current, iconNumber);
        }
      }
      if (current.children) {
        for (var child in current.children) {
          updateChildren(current.children[child]);
        }
      }
    };
    updateChildren(node);
  }

  /************************************************************************************
   *  Tree handling high level API
   ************************************************************************************/

  /**
   * Opens the specified path in the tree view.
   *
   * @param {string} path - The path to open in the tree view.
   */
  openPath(path) {
    const parts = path.split("/").filter(Boolean);
    var current = "";
    var node;
    for (var part of parts) {
      current += "/" + part;
      node = this.findNodeByPath(current);
      const el = this.getDomNode(current);
      if (el != null) {
        el.children[0].scrollIntoView({ behaviour: "smooth", block: "center" });
      }
      if (node) {
        node.expanded = true;
        this.showChildContainer(node);
        if (this.debug) {
          console.log("update => openPath");
        }
        this.update();
      } else {
        console.error(`Path not found: ${current}`);
        break;
      }
    }
    this.toggleLabelColor(node);
  }

  /**
   * Closes the specified path in the tree view.
   *
   * @param {string} path - The path to be closed.
   */
  closePath(path) {
    const node = this.findNodeByPath(path);
    if (node) {
      node.expanded = false;
      this.showChildContainer(node);
      const el = this.getDomNode(path);
      if (el != null) {
        el.scrollIntoView({ behaviour: "smooth", block: "start" });
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
   * Opens the specified level in the tree view.
   * @param {number} level - The level to open.
   */
  openLevel(level) {
    const setLevel = (node) => {
      if (this.isLeaf(node)) return;

      if (level == -1) {
        node.expanded =
          node.children != null &&
          !(
            Object.keys(node.children).length == 1 &&
            this.isLeaf(Object.values(node.children)[0])
          );
      } else {
        node.expanded = node.level < level;
      }
    };
    this.traverse(this.root, setLevel);
    const el = this.getDomNode(this.getNodePath(this.root));
    el.scrollIntoView({ behaviour: "smooth", block: "start" });
    var t = new Timer("update", true);
    for (var i = 0; i <= (level == -1 ? this.maxLevel : level); i++) {
      if (this.debug) {
        console.log("update => openLevel");
      }
      this.update();
      t.split(`round ${i}`);
    }
    t.stop();
  }

  /**
   * Collapses all nodes in the tree view.
   */
  collapseAll() {
    this.openLevel(0);
  }

  /**
   * Expands all nodes in the treeview.
   */
  expandAll() {
    this.openLevel(this.maxLevel);
  }
}

export { TreeView };
