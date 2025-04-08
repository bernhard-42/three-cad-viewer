import { getIconBackground, getIconSvg } from "./icons.js";
import { KeyMapper } from "./utils.js";
import { Slider } from "./slider.js";
import { Toolbar, Button, ClickButton } from "./toolbar.js";
import { ToolTypes } from "./cad_tools/tools.js";
import { FilterByDropDownMenu } from "./cad_tools/ui.js";

import template from "./index.html";

function TEMPLATE(id) {
  const shift = KeyMapper.getshortcuts("shift");
  const ctrl = KeyMapper.getshortcuts("ctrl");
  const meta = KeyMapper.getshortcuts("meta");
  var html = template
    .replaceAll("{{id}}", id)
    .replaceAll("{{shift}}", shift)
    .replaceAll("{{ctrl}}", ctrl)
    .replaceAll("{{meta}}", meta);
  return html;
}

function px(val) {
  return `${val}px`;
}

const buttons = ["plane", "play", "pause", "stop"];

class Display {
  /**
   * Create Display
   * @param {DOMElement} container - the DOM element, e.g. div, that should contain the Display
   * @param {} options - display options
   */
  constructor(container, options) {
    this.container = container;
    this.container.innerHTML = TEMPLATE(this.container.id);
    // const fullWidth =
    //   options.cadWidth + (options.glass ? 0 : options.treeWidth);
    // this.handleMoreButton(fullWidth);

    this.cadBody = this._getElement("tcv_cad_body");

    // this.cadTool = this._getElement("tcv_cad_toolbar");
    this.cadTool = new Toolbar(
      this._getElement("tcv_cad_toolbar"),
      container.id,
    );
    this.cadView = this._getElement("tcv_cad_view");
    this.distanceMeasurementPanel = this._getElement(
      "tcv_distance_measurement_panel",
    );
    this.propertiesMeasurementPanel = this._getElement(
      "tcv_properties_measurement_panel",
    );
    this.angleMeasurementPanel = this._getElement(
      "tcv_angle_measurement_panel",
    );
    this.cadTree = this._getElement("tcv_cad_tree_container");
    this.cadTreeScrollContainer = this._getElement("tcv_box_content");
    this.cadTreeToggles = this._getElement("tcv_cad_tree_toggles");
    this.cadClip = this._getElement("tcv_cad_clip_container");
    this.cadMaterial = this._getElement("tcv_cad_material_container");
    this.tabTree = this._getElement("tcv_tab_tree");
    this.tabClip = this._getElement("tcv_tab_clip");
    this.tabMaterial = this._getElement("tcv_tab_material");
    this.cadInfo = this._getElement("tcv_cad_info_container");
    this.cadAnim = this._getElement("tcv_cad_animation");
    this.cadTools = this._getElement("tcv_cad_tools");

    this.cadHelp = this._getElement("tcv_cad_help");

    this.planeLabels = [];
    for (var i = 1; i < 4; i++) {
      this.planeLabels.push(this._getElement(`tcv_lbl_norm_plane${i}`));
    }
    this.viewer = null;
    this.glass = options.glass;
    this.tools = options.tools;
    this.cadWidth = options.cadWidth;
    this.height = options.height;
    this.treeWidth = options.treeWidth;
    this._events = [];

    this.setSizes(options);

    this.activeTab = "tree";
    this.cadTree.style.display = "block";
    this.cadClip.style.display = "none";
    this.cadMaterial.style.display = "none";
    this.clipSliders = null;
    this.explodeFlag = false;

    this.currentButton = null;

    this.lastPlaneState = false;

    var theme;
    if (
      options.theme === "dark" ||
      (options.theme == "browser" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      this.container.setAttribute("data-theme", "dark");
      theme = "dark";
    } else {
      this.container.setAttribute("data-theme", "light");
      theme = "light";
    }

    for (var btn of buttons) {
      var elements = this.container.getElementsByClassName(`tcv_${btn}`);
      for (i = 0; i < elements.length; i++) {
        var el = elements[i];
        el.setAttribute(
          "style",
          `background-image: ${getIconBackground(theme, btn)}`,
        );
      }
    }

    this.toolbarButtons = {};

    this.toolbarButtons["axes"] = new ClickButton(
      theme,
      "axes",
      "Show axes",
      this.setAxes,
    );
    this.cadTool.addButton(this.toolbarButtons["axes"]);
    this.toolbarButtons["axes0"] = new ClickButton(
      theme,
      "axes0",
      "Show axes at origin (0,0,0)",
      this.setAxes0,
    );
    this.cadTool.addButton(this.toolbarButtons["axes0"]);
    this.toolbarButtons["grid"] = new ClickButton(
      theme,
      "grid",
      "Show grid",
      this.setGrid,
      null,
      ["xy", "xz", "yz"],
    );
    this.cadTool.addButton(this.toolbarButtons["grid"]);
    this.cadTool.addSeparator();
    this.toolbarButtons["perspective"] = new ClickButton(
      theme,
      "perspective",
      "Use perspective camera",
      this.setOrtho,
    );
    this.cadTool.addButton(this.toolbarButtons["perspective"]);
    this.toolbarButtons["transparent"] = new ClickButton(
      theme,
      "transparent",
      "Show transparent faces",
      this.setTransparent,
    );
    this.cadTool.addButton(this.toolbarButtons["transparent"]);
    this.toolbarButtons["blackedges"] = new ClickButton(
      theme,
      "blackedges",
      "Show black edges",
      this.setBlackEdges,
    );
    this.cadTool.addButton(this.toolbarButtons["blackedges"]);
    this.cadTool.addSeparator();

    this.toolbarButtons["reset"] = new Button(
      theme,
      "reset",
      "Reset view",
      this.reset,
    );
    this.cadTool.addButton(this.toolbarButtons["reset"]);
    this.toolbarButtons["resize"] = new Button(
      theme,
      "resize",
      "Resize object",
      this.resize,
    );
    this.cadTool.addButton(this.toolbarButtons["resize"]);
    this.cadTool.addSeparator();

    this.toolbarButtons["iso"] = new Button(
      theme,
      "iso",
      "Switch to iso view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["iso"]);
    this.toolbarButtons["front"] = new Button(
      theme,
      "front",
      "Switch to front view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["front"]);
    this.toolbarButtons["rear"] = new Button(
      theme,
      "rear",
      "Switch to back view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["rear"]);
    this.toolbarButtons["top"] = new Button(
      theme,
      "top",
      "Switch to top view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["top"]);
    this.toolbarButtons["bottom"] = new Button(
      theme,
      "bottom",
      "Switch to bottom view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["bottom"]);
    this.toolbarButtons["left"] = new Button(
      theme,
      "left",
      "Switch to left view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["left"]);
    this.toolbarButtons["right"] = new Button(
      theme,
      "right",
      "Switch to right view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["right"]);
    this.cadTool.addSeparator();

    this.toolbarButtons["explode"] = new ClickButton(
      theme,
      "explode",
      "Explode tool",
      this.setExplode,
    );
    this.cadTool.addButton(this.toolbarButtons["explode"]);
    this.toolbarButtons["distance"] = new ClickButton(
      theme,
      "distance",
      "Measure distance between shapes",
      this.setTool,
    );
    this.cadTool.addButton(this.toolbarButtons["distance"]);
    this.toolbarButtons["properties"] = new ClickButton(
      theme,
      "properties",
      "Show shape properties",
      this.setTool,
    );
    this.cadTool.addButton(this.toolbarButtons["properties"]);
    this.toolbarButtons["angle"] = new ClickButton(
      theme,
      "angle",
      "Measure angle between shapes",
      this.setTool,
    );
    this.cadTool.addButton(this.toolbarButtons["angle"]);

    this.cadTool.defineGroup([
      this.toolbarButtons["explode"],
      this.toolbarButtons["distance"],
      this.toolbarButtons["properties"],
      this.toolbarButtons["angle"],
    ]);

    this.toolbarButtons["help"] = new Button(
      theme,
      "help",
      "Help",
      this.toggleHelp,
    );
    this.toolbarButtons["help"].alignRight();
    this.cadTool.addButton(this.toolbarButtons["help"]);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.help_shown) {
        e.preventDefault();
        this.showHelp(false);
      }
    });

    this.toolbarButtons["pin"] = new Button(
      theme,
      "pin",
      "Pin viewer as png",
      this.pinAsPng,
    );
    this.toolbarButtons["pin"].alignRight();
    this.cadTool.addButton(this.toolbarButtons["pin"]);
    this.shapeFilterDropDownMenu = new FilterByDropDownMenu(this);

    this.showPinning(options.pinning);
    // this.showMeasureTools(options.measureTools);

    this.infoIcons = {
      right: getIconSvg(theme, "nav_closed"),
      down: getIconSvg(theme, "nav_open"),
    };
  }

  _setupCheckEvent(name, fn, flag) {
    const el = this._getElement(name);
    el.addEventListener("change", fn);
    if (flag != undefined) {
      el.checked = flag;
    }
    this._events.push(["change", name, fn]);
  }

  // eslint-disable-next-line no-unused-vars
  _setupClickEvent(name, fn, flag) {
    const el = this._getElement(name);
    el.addEventListener("click", fn);
    this._events.push(["click", name, fn]);
  }

  /**
   *
   * @param {string} name Name of the DOM element
   * @returns {DOMElement}
   */
  _getElement(name) {
    return this.container.getElementsByClassName(name)[0];
  }

  dispose() {
    var type, el_name, fn;
    for (var ui_event of this._events) {
      [type, el_name, fn] = ui_event;
      const el = this._getElement(el_name);
      el.removeEventListener(type, fn);
    }
    // remove cadTree
    this.cadTree.innerHTML = "";
    // remove canvas
    this.cadView.removeChild(this.cadView.children[2]);
    // delete view
    this.container.innerHTML = "";
  }

  /**
   * Use More fropdown if overall width < 970px else just check boxes
   * @param {number} fullWidth - overall width of tree and cad view (taking glass mode into account)
   */
  // eslint-disable-next-line no-unused-vars
  handleMoreButton(fullWidth) {
    // const moreButton = this._getElement("tcv_more-btn");
    // const moreContent = this._getElement("tcv_more-wrapper");
    // if (fullWidth < 980) {
    //   moreButton.classList.remove("tcv_none");
    //   moreContent.classList.add("tcv_dropdown-content");
    //   moreContent.classList.add("tcv_more-content");
    // } else {
    //   moreButton.classList.add("tcv_none");
    //   moreContent.classList.remove("tcv_dropdown-content");
    //   moreContent.classList.remove("tcv_more-content");
    // }
  }

  /**
   * Set the width and height of the different UI elements (tree, canvas and info box)
   * @param {DisplayOptions} options
   */
  setSizes(options, ratio = 2 / 3) {
    if (options.cadWidth) {
      this.cadWidth = options.cadWidth;
      this.cadView.style.width = px(options.cadWidth);
    }
    if (options.height) {
      this.height = options.height;
      this.cadView.style.height = px(options.height);
    }
    if (options.treeWidth) {
      this.treeWidth = options.treeWidth;
      this.cadTree.parentElement.parentElement.style.width = px(
        options.treeWidth,
      );
      this.cadInfo.parentElement.parentElement.style.width = px(
        options.treeWidth,
      );
    }
    if (!options.glass) {
      const treeHeight = Math.round(options.height * ratio);
      this.cadTree.parentElement.parentElement.style.height = px(treeHeight);
      this.cadInfo.parentElement.parentElement.style.height = px(
        options.height - treeHeight - 4,
      );
    }

    if (options.tools && !options.glass) {
      this.cadTool.container.style.width = px(
        options.treeWidth + options.cadWidth + 4,
      );
      this.cadBody.style.width = px(options.treeWidth + options.cadWidth + 4);
    } else {
      this.cadTool.container.style.width = px(options.cadWidth + 2);
      this.cadBody.style.width = px(options.cadWidth + 2);
    }

    this.cadBody.style.height = px(options.height + 4);
  }

  /**
   * Set up the UI
   * @param {Viewer} viewer - the viewer for this UI
   */
  setupUI(viewer) {
    this.viewer = viewer;

    this._setupClickEvent("tcv_expand_root", this.handleCollapseNodes);
    this._setupClickEvent("tcv_collapse_singles", this.handleCollapseNodes);
    this._setupClickEvent("tcv_collapse_all", this.handleCollapseNodes);
    this._setupClickEvent("tcv_expand", this.handleCollapseNodes);

    this._setupClickEvent("tcv_material_reset", this.handleMaterialReset);

    this._setupClickEvent("tcv_toggle_info", this.toggleInfo);

    this.help_shown = true;
    this.info_shown = !this.glass;

    const tabs = ["tcv_tab_tree", "tcv_tab_clip", "tcv_tab_material"];
    tabs.forEach((name) => {
      this._setupClickEvent(name, this.selectTab);
    });

    this.clipSliders = [];
    for (var i = 1; i < 4; i++) {
      this.clipSliders.push(new Slider(`plane${i}`, 0, 100, this));
    }

    this.ambientlightSlider = new Slider("ambientlight", 0, 400, this);
    this.directionallightSlider = new Slider("pointlight", 0, 400, this);
    this.metalnessSlider = new Slider("metalness", 0, 100, this);
    this.roughnessSlider = new Slider("roughness", 0, 100, this);

    this._setupCheckEvent(
      "tcv_clip_plane_helpers",
      this.setClipPlaneHelpers,
      false,
    );
    this._setupCheckEvent(
      "tcv_clip_intersection",
      this.setClipIntersection,
      false,
    );
    this._setupCheckEvent("tcv_clip_caps", this.setObjectColorCaps, false);

    for (i = 1; i < 4; i++) {
      this._setupClickEvent(
        `tcv_btn_norm_plane${i}`,
        this.setClipNormalFromPosition,
        false,
      );
    }

    this._setupClickEvent("tcv_play", this.controlAnimation, false);
    this._setupClickEvent("tcv_pause", this.controlAnimation, false);
    this._setupClickEvent("tcv_stop", this.controlAnimation, false);
    this.animationSlider = this.container.getElementsByClassName(
      "tcv_animation_slider",
    )[0];
    this.animationSlider.value = 0;
    this.animationSlider.addEventListener("input", this.animationChange);
    this.showAnimationControl(false);

    this.showHelp(false);
    this.showDistancePanel(false);
    this.showPropertiesPanel(false);
    this.showAnglePanel(false);
  }

  /**
   * Check or uncheck a checkbox
   * @property {boolean} [axes = false] - show X-, Y-, Z-axes.
   * @property {boolean} [axes0 = false] - show axes at [0,0,0] ot at object center (target).
   * @property {boolean} [ortho = true] - use an orthographic (true) or perspective camera (false)
   * @property {boolean} [transparent = false] - show CAD object transparent.
   * @property {boolean} [blackEdges = false] - show edges in black and not in edgeColor.
   * @property {boolean} [tools = true] - show CAD tools.
   * @property {boolean} [glass = false] - use glass mode, i.e. CAD navigation as overlay.
   */
  updateUI(axes, axes0, ortho, transparent, blackEdges, tools, glass) {
    this.toolbarButtons["axes"].set(axes);
    this.toolbarButtons["axes0"].set(axes0);
    this.toolbarButtons["perspective"].set(!ortho);
    this.toolbarButtons["transparent"].set(transparent);
    this.toolbarButtons["blackedges"].set(blackEdges);

    this.showTools(tools);
    this.glassMode(glass);
  }
  // setup functions

  /**
   * Check or uncheck a checkbox
   * @param {string} name - name of the check box, see getElement
   * @param {boolean} flag - whether to check or uncheck
   */
  checkElement(name, flag) {
    this._getElement(name).checked = flag;
  }

  /**
   * Add the Cad View (the canvas for threejs)
   * @param {DOMElement} cadView - the DOM element that contains the cadView
   */
  addCadView(cadView) {
    var canvas = this.cadView.querySelector("canvas");
    if (canvas) {
      this.cadView.replaceChild(cadView, canvas);
    } else {
      this.cadView.appendChild(cadView);
    }
  }

  /**
   * Get the DOM canvas element
   */
  getCanvas() {
    return this.cadView.children[this.cadView.children.length - 1];
  }

  /**
   * Clear the Cad tree
   */
  clearCadTree() {
    this.cadTree.innerHTML = "";
  }

  /**
   * Add the Cad tree and other UI elements like Clipping
   * @param {DOMElement} cadTree - the DOM element that contains the cadTree
   */
  addCadTree(cadTree) {
    this.cadTree.appendChild(cadTree);
  }

  // handler (bound to Display instance)

  /**
   *
   * @function
   * @param {boolean} flag - to set or not
   */
  setAxes = (name, flag) => {
    this.viewer.setAxes(flag);
  };

  /**
   * Check/uncheck the axes checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the axes checkbox
   */
  setAxesCheck = (flag) => {
    this.toolbarButtons["axes"].set(flag);
  };

  /**
   * Checkbox Handler for setting the grid parameter
   * @function
   * @param {boolean} flag - to set or not
   */
  setGrid = (name, flag) => {
    this.viewer.setGrid(name, flag);
  };

  /**
   * Check/uncheck the main grid UI element
   * @function
   * @param {boolean} flag - whether to check or uncheck the main grid checkbox
   */
  setGridCheck = (flag) => {
    this.checkElement("tcv_grid", flag);
  };

  /**
   * Checkbox Handler for setting the axes0 parameter
   * @function
   * @param {boolean} flag - to set or not
   */
  setAxes0 = (name, flag) => {
    this.viewer.setAxes0(flag);
  };

  /**
   * Check/uncheck the Axes0 checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Axes0 checkbox
   */
  setAxes0Check = (flag) => {
    this.toolbarButtons["axes0"].set(flag);
  };

  /**
   * Checkbox Handler for setting the ortho parameter
   * @function
   * @param {boolean} flag - to set or not
   */
  setOrtho = (name, flag) => {
    this.viewer.switchCamera(!flag);
  };

  /**
   * Check or uncheck the Ortho checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the ortho checkbox
   */
  setOrthoCheck = (flag) => {
    this.toolbarButtons["perspective"].set(!flag);
  };

  /**
   * Checkbox Handler for setting the transparent parameter
   * @function
   * @param {boolean} flag - to set or not
   */
  setTransparent = (name, flag) => {
    this.viewer.setTransparent(flag);
  };

  /**
   * Check or uncheck the Transparent checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Transparent checkbox
   */
  setTransparentCheck = (flag) => {
    this.toolbarButtons["transparent"].set(flag);
  };

  /**
   * Checkbox Handler for setting the black edges parameter
   * @function
   * @param {boolean} flag - to set or not
   */
  setBlackEdges = (name, flag) => {
    this.viewer.setBlackEdges(flag);
  };

  /**
   * Check or uncheck the Black Edges checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Black Edges checkbox
   */
  setBlackEdgesCheck = (flag) => {
    this.toolbarButtons["blackedges"].set(flag);
  };

  /**
   * Checkbox Handler for setting the explode mode
   * @function
   * @param {boolean} flag - to set or not
   */
  setExplode = (name, flag) => {
    if (flag && this.explodeFlag) return;
    if (!flag && !this.explodeFlag) return;

    if (flag) {
      if (this.viewer.hasAnimation()) {
        this.viewer.backupAnimation();
      }
      this.viewer.explode();
      this.explodeFlag = true;
    } else {
      if (this.viewer.hasAnimation()) {
        this.controlAnimationByName("stop");
        this.viewer.clearAnimation();
        this.viewer.restoreAnimation();
      }
      this.explodeFlag = false;
    }
  };

  /**
   * Check or uncheck the Explode checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Black Edges checkbox
   */
  setExplodeCheck = (flag) => {
    this.toolbarButtons["explode"].set(flag);
  };

  /**
   * Show or hide the Explode checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Black Edges checkbox
   */
  showExplode = (flag) => {
    const el = this._getElement("tcv_explode_widget");
    el.style.display = flag ? "inline-block" : "none";
  };

  /**
   * Checkbox Handler for setting the tools mode
   * @function
   * @param {boolean} flag - whether to start or stop measure context
   */
  setTool = (name, flag) => {
    this.viewer.toggleAnimationLoop(flag);

    if (flag) {
      this.showAnimationControl(false);
      if (this.viewer.hasAnimation()) {
        this.viewer.backupAnimation();
      }
      if (
        ["distance", "properties", "angle"].includes(name) &&
        !["distance", "properties", "angle"].includes(this.currentButton)
      ) {
        this.viewer.toggleGroup(true);
        this.viewer.toggleTab(true);
      }
      this.viewer.setRaycastMode(flag);
      this.shapeFilterDropDownMenu.setRaycaster(this.viewer.raycaster);

      if (name == "distance") {
        this.viewer.cadTools.enable(ToolTypes.DISTANCE);
        this.viewer.checkChanges({ activeTool: ToolTypes.DISTANCE });
      } else if (name == "properties") {
        this.viewer.cadTools.enable(ToolTypes.PROPERTIES);
        this.viewer.checkChanges({ activeTool: ToolTypes.PROPERTIES });
      } else if (name == "angle") {
        this.viewer.cadTools.enable(ToolTypes.ANGLE);
        this.viewer.checkChanges({ activeTool: ToolTypes.ANGLE });
      }
      this.currentButton = name;
    } else {
      if (this.currentButton == name || name == "explode") {
        this.viewer.toggleGroup(false);
        this.viewer.toggleTab(false);
        this.currentButton = null;
      }
      this.viewer.checkChanges({ activeTool: ToolTypes.NONE });
      this.viewer.clearSelection();
      if (this.viewer.hasAnimation()) {
        this.controlAnimationByName("stop");
        this.viewer.clearAnimation();
        this.viewer.restoreAnimation();
        this.showAnimationControl(true);
      }
      this.viewer.setRaycastMode(flag);
    }
    this.viewer.setPickHandler(!flag);
    this.shapeFilterDropDownMenu.show(flag);
  };

  /**
   * Checkbox Handler for setting the clip planes parameter
   * @function
   * @param {Event} e - a DOM click event
   */
  setClipPlaneHelpers = (e) => {
    const flag = !!e.target.checked;
    this.setClipPlaneHelpersCheck(flag);
    this.viewer.setClipPlaneHelpers(flag);
  };

  /**
   * Check or uncheck the Plane Helpers checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Plane Helpers checkbox
   */
  setClipPlaneHelpersCheck = (flag) => {
    this.checkElement("tcv_clip_plane_helpers", flag);
    this.lastPlaneState = flag;
  };

  /**
   * Show or hide the CAD tools
   * @function
   * @param {boolean} flag - whether to show or hide the CAD tools
   */
  showTools = (flag) => {
    this.tools = flag;
    if (this.viewer) {
      // not available at first call
      this.viewer.tools = flag;
    }
    var tb = this._getElement("tcv_cad_toolbar");
    var cn = this._getElement("tcv_cad_navigation");
    for (var el of [cn, tb]) {
      if (flag) {
        el.style.height = "38px";
        el.style.display = "block";
      } else {
        el.style.height = "0px";
        el.style.display = "none";
      }
    }
  };

  /**
   * Show or hides measurement tools, measurement tools needs a backend to be used.
   * @param {boolean} flag
   */
  showMeasureTools = (flag) => {
    this.toolbarButtons["distance"].show(flag);
    this.toolbarButtons["properties"].show(flag);
    this.toolbarButtons["angle"].show(flag);
  };

  /**
   * Checkbox Handler for setting the clip intersection parameter
   * @function
   * @param {*} e
   */
  setClipIntersection = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setClipIntersection(flag);
  };

  /**
   * Check or uncheck the Intersection checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the Intersection checkbox
   */
  setClipIntersectionCheck = (flag) => {
    const el = this._getElement("tcv_clip_intersection");
    el.checked = flag;
  };

  /**
   * Checkbox Handler for toggling the clip caps
   * @function
   * @param {*} e
   */
  setObjectColorCaps = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setClipObjectColorCaps(flag);
  };

  /**
   * Check or uncheck the Intersection checkbox
   * @function
   * @param {boolean} flag - whether to check or uncheck the object colors checkbox
   */
  setClipObjectColorsCheck = (flag) => {
    const el = this._getElement("tcv_clip_caps");
    el.checked = flag;
  };

  /**
   * Handler to reset position, zoom and up of the camera
   * @function
   */
  reset = () => {
    this.viewer.reset();
    this.clearHighlights();
  };

  /**
   * Handler to reset zoom of the camera
   * @function
   */
  resize = () => {
    this.viewer.resize();
  };

  /**
   * Clear all highlights of navigation tree entries
   */
  clearHighlights() {
    const buttons = ["front", "rear", "top", "bottom", "left", "right", "iso"];
    buttons.forEach((btn) => {
      var el = this.toolbarButtons[btn];
      el.highlight(false);
    });
  }

  /**
   * Highlight the selected button
   * @param {string} name - A CAD object id (path)
   */
  highlightButton(name) {
    this.clearHighlights();
    var el = this.toolbarButtons[name];
    el.highlight(true);
    this.viewer.keepHighlight = true;
  }

  /**
   * Handler to set camera to a predefined position
   * @function
   * @param {Event} e - a DOM click event
   */
  setView = (button) => {
    this.viewer.presetCamera(button);
    this.highlightButton(button);
    this.viewer.update(true, false); // ensure update is called again
  };

  /**
   * Show/hide pinning button
   * @function
   * @param {boolean} flag - Whether to show/hide the pinning button
   */
  showPinning(flag) {
    this.toolbarButtons["pin"].show(flag);
  }

  /**
   * Pin screenshot of canvas as PNG
   * @function
   * @param {Event} e - a DOM click event
   */
  // eslint-disable-next-line no-unused-vars
  pinAsPng = (e) => {
    this.viewer.pinAsPng();
  };

  /**
   * Handler to set the label of a clipping normal widget
   * @function
   * @param {number} index - index of the normal widget
   * @param {Vector3} normal - the normal
   */
  setNormalLabel = (index, normal) => {
    this.planeLabels[index].innerHTML = `N=(${normal[0].toFixed(
      2,
    )}, ${normal[1].toFixed(2)}, ${normal[2].toFixed(2)})`;
  };

  /**
   * Set the normal at index to the current viewing direction
   * @function
   * @param {Event} e - a DOM click event
   */
  setClipNormalFromPosition = (e) => {
    const index = parseInt(e.target.classList[0].slice(-1));
    this.viewer.setClipNormalFromPosition(index - 1);
  };

  /**
   * Handler to activate a UI tab (tree / clipping)
   * @function
   * @param {Event} e - a DOM click event
   */
  selectTab = (e) => {
    const tab = e.target.className.split(" ")[0];
    this.selectTabByName(tab.slice(8));
  };

  /**
   * Set the ambient light intensity in the UI
   * @function
   * @param {number} val - a float between 0 and 4
   */
  setAmbientLight = (val) => {
    this.ambientlightSlider.setValue(val * 100);
  };

  /**
   * Set the direct light intensity in the UI
   * @function
   * @param {number} val - a float between 0 and 4
   */
  setDirectLight = (val) => {
    this.directionallightSlider.setValue(val * 100);
  };

  /**
   * Set material metalness in the UI
   * @function
   * @param {number} val - a float between 0 and 1
   */
  setMetalness = (val) => {
    this.metalnessSlider.setValue(val * 100);
  };

  /**
   * Set material roughness in the UI
   * @function
   * @param {number} val - a float between 0 and 1
   */
  setRoughness = (val) => {
    this.roughnessSlider.setValue(val * 100);
  };

  /**
   * Reset material values to original values
   * @function
   * @param {Event} e - a DOM click event
   */
  // eslint-disable-next-line no-unused-vars
  handleMaterialReset = (e) => {
    this.viewer.resetMaterial();
  };

  /**
   * Activate the UI tab given the name of the tab
   * @param {string} tab - name of the tab "tree" or "clip"
   */
  selectTabByName(tab) {
    if (!["clip", "tree", "material"].includes(tab)) {
      return;
    }

    if (tab === "tree" && this.activeTab !== "tree") {
      this.cadTree.style.display = "block";
      this.cadTreeToggles.style.display = "block";
      this.cadClip.style.display = "none";
      this.cadMaterial.style.display = "none";
      this.viewer.nestedGroup.setBackVisible(false);
      this.viewer.setLocalClipping(false);
      this.viewer.clipping.setVisible(false);
      // copy state since setClipHelpers(false) will set to false
      var lastPlaneState = this.viewer.getClipPlaneHelpers();
      this.viewer.setClipPlaneHelpers(false);
      this.lastPlaneState = lastPlaneState;
    } else if (tab === "clip" && this.activeTab !== "clip") {
      this.cadTree.style.display = "none";
      this.cadTreeToggles.style.display = "none";
      this.cadClip.style.display = "block";
      this.cadMaterial.style.display = "none";
      this.viewer.nestedGroup.setBackVisible(true);
      this.viewer.setLocalClipping(true);
      this.viewer.setClipIntersection(this.viewer.clipIntersection);
      this.viewer.setClipPlaneHelpers(this.lastPlaneState);
      this.viewer.clipping.setVisible(true);
      this.viewer.update(true, false);
    } else if (tab === "material" && this.activeTab !== "material") {
      this.cadTree.style.display = "none";
      this.cadTreeToggles.style.display = "none";
      this.cadClip.style.display = "none";
      this.cadMaterial.style.display = "block";
      this.viewer.nestedGroup.setBackVisible(false);
      this.viewer.setLocalClipping(false);
      this.viewer.setClipPlaneHelpers(false);
      this.viewer.clipping.setVisible(false);
    }
    this.activeTab = tab;

    this.viewer.checkChanges({ tab: tab });
    if (tab == "tree") {
      this.tabTree.classList.add("tcv_tab-selected");
      this.tabTree.classList.remove("tcv_tab-unselected");
      this.tabClip.classList.remove("tcv_tab-selected");
      this.tabClip.classList.add("tcv_tab-unselected");
      this.tabMaterial.classList.remove("tcv_tab-selected");
      this.tabMaterial.classList.add("tcv_tab-unselected");
    } else if (tab == "clip") {
      this.tabTree.classList.remove("tcv_tab-selected");
      this.tabTree.classList.add("tcv_tab-unselected");
      this.tabClip.classList.add("tcv_tab-selected");
      this.tabClip.classList.remove("tcv_tab-unselected");
      this.tabMaterial.classList.remove("tcv_tab-selected");
      this.tabMaterial.classList.add("tcv_tab-unselected");
    } else {
      this.tabTree.classList.add("tcv_tab-unselected");
      this.tabTree.classList.remove("tcv_tab-selected");
      this.tabClip.classList.add("tcv_tab-unselected");
      this.tabClip.classList.remove("tcv_tab-selected");
      this.tabMaterial.classList.add("tcv_tab-selected");
      this.tabMaterial.classList.remove("tcv_tab-unselected");
    }
  }

  /**
   * Toggle visibility of the clipping tab
   * @function
   */
  toggleClippingTab = (flag) => {
    if (flag) {
      this.tabClip.removeAttribute("disabled");
    } else {
      this.tabClip.setAttribute("disabled", "true");
    }
    this.tabClip.classList.toggle("tcv_tab-disabled", !flag);
  };

  /**
   * Collapse nodes handler
   * @function
   * @param {Event} e - a DOM click event
   */
  handleCollapseNodes = (e) => {
    this.collapseNodes(e.target.value);
  };

  /**
   * Collapse nodes handler
   * @param {string} value - 1: collapse all leaf nodes, "R": expand root level only, "C": collapse all nodes, "E": expand all nodes
   */
  collapseNodes(value) {
    if (value === "1") {
      this.viewer.treeview.openLevel(-1);
    } else if (value === "R") {
      this.viewer.treeview.openLevel(1);
    } else if (value === "C") {
      this.viewer.treeview.collapseAll();
    } else if (value === "E") {
      this.viewer.treeview.expandAll();
    }
  }

  /**
   * Set minimum and maximum of the sliders
   * @param {number} index - index of the plane: 0,1,2
   * @param {number} limit - the value for both minimum and maximum value of the slider
   */
  setSliderLimits(limit) {
    for (var i = 0; i < 3; i++) {
      this.clipSliders[i].setSlider(limit);
    }
  }

  /**
   * Refresh clipping plane
   * @function
   * @param {number} index - index of the plane: 0,1,2
   * @param {number} value - distance on the clipping normal from the center
   */
  refreshPlane(index, value) {
    this.viewer.refreshPlane(index - 1, parseFloat(value));
  }

  /**
   * Show or hide the Animation control widget
   * @function
   * @param {boolean} flag - whether to show or hide the Animation control widget
   */
  showAnimationControl = (flag) => {
    this.cadAnim.style.display = flag ? "block" : "none";
  };

  /**
   * Handle animation control
   * @function
   * @param {string} btn - animation control button name
   */
  controlAnimationByName(btn) {
    this.viewer.controlAnimation(btn);

    var currentTime = this.viewer.animation.getRelativeTime();
    this.animationSlider.value = 1000 * currentTime;
    if (btn == "play") {
      this.viewer.bboxNeedsUpdate = true;
    } else if (btn == "stop") {
      this.viewer.bboxNeedsUpdate = false;
      if (this.viewer.lastBbox != null) {
        this.viewer.lastBbox.needsUpdate = true;
      }
    } else {
      this.viewer.bboxNeedsUpdate = !this.viewer.bboxNeedsUpdate;
    }
  }

  /**
   * Handler for the animation control
   * @function
   * @param {Event} e - a DOM click event
   */
  controlAnimation = (e) => {
    const btn = e.target.className.split(" ")[0].slice(4);
    this.controlAnimationByName(btn);
  };

  /**
   * Handler for the animation slider
   * @function
   * @param {Event} e - a DOM click event
   */
  animationChange = (e) => {
    this.viewer.animation.setRelativeTime(e.target.valueAsNumber / 1000);
    if (this.viewer.lastBbox != null) {
      this.viewer.lastBbox.needsUpdate = true;
    }
  };

  /**
   * Set label text of animation control
   * @param {string} label - "A" for animation and "E" for Explode control
   */
  setAnimationLabel(label) {
    var el = this._getElement("tcv_animation_label");
    el.innerHTML = label;
  }

  /**
   * Reset animation slider to 0
   */
  resetAnimationSlider() {
    this.animationSlider.value = 0;
  }

  /**
   * Show or hide help dialog
   * @function
   * @param {boolean} flag - whether to show or hide help dialog
   */
  showHelp = (flag) => {
    this.cadHelp.style.display = flag ? "block" : "none";
    this.help_shown = flag;
  };

  /**
   * Show or hide the distance measurement panel
   * @param {boolean} flag
   */
  showDistancePanel = (flag) => {
    this.distanceMeasurementPanel.style.display = flag ? "block" : "none";
  };

  /**
   * Show or hide the properties measurement panel
   * @param {boolean} flag
   */
  showPropertiesPanel = (flag) => {
    this.propertiesMeasurementPanel.style.display = flag ? "block" : "none";
  };

  /**
   * Show or hide the angle measurement panel
   * @param {boolean} flag
   */
  showAnglePanel = (flag) => {
    this.angleMeasurementPanel.style.display = flag ? "block" : "none";
  };

  /**
   * Show help dialog
   * @function
   */
  toggleHelp = () => {
    this.showHelp(!this.help_shown);
  };

  /**
   * Show or hide info dialog
   * @function
   * @param {boolean} flag - whether to show or hide info dialog
   */
  showInfo = (flag) => {
    this.cadInfo.parentNode.parentNode.style.display = flag ? "block" : "none";
    // this._getElement("tcv_toggle_info").value = flag ? "\u25B2 i" : "\u25BC i";
    this._getElement("tcv_toggle_info").innerHTML = flag
      ? `${this.infoIcons["down"]}`
      : `${this.infoIcons["right"]}`;
    this.info_shown = flag;
  };

  /**
   * Show info dialog
   * @function
   */
  toggleInfo = () => {
    this.showInfo(!this.info_shown);
  };

  /**
   * Auto collapse tree nodes, when cad width < 600
   * @function
   * @param {boolean} flag - whether to enable/disable glass mode
   */
  autoCollapse() {
    if (this.cadWidth < 600 && this.glass) {
      console.info("Small view, collapsing tree");
      this.collapseNodes("C");
    }
  }

  /**
   * Enable/disable glass mode
   * @function
   * @param {boolean} flag - whether to enable/disable glass mode
   */
  glassMode(flag) {
    if (flag) {
      this._getElement("tcv_cad_tree").classList.add("tcv_cad_tree_glass");
      this._getElement("tcv_cad_tree").style["height"] = null;
      this._getElement("tcv_cad_tree").style["max-height"] = px(
        Math.round((this.height * 2) / 3) - 18,
      );

      this._getElement("tcv_cad_info").classList.add("tcv_cad_info_glass");
      this._getElement("tcv_cad_view").classList.add("tcv_cad_view_glass");

      this._getElement("tcv_toggle_info_wrapper").style.display = "block";

      this.showInfo(false);
      this.glass = true;
      this.autoCollapse();
    } else {
      this._getElement("tcv_cad_tree").classList.remove("tcv_cad_tree_glass");
      this._getElement("tcv_cad_tree").style["max-height"] = null;
      this._getElement("tcv_cad_tree").style.height = px(
        Math.round((this.height * 2) / 3),
      );
      this._getElement("tcv_cad_info").classList.remove("tcv_cad_info_glass");
      this._getElement("tcv_cad_view").classList.remove("tcv_cad_view_glass");

      this._getElement("tcv_toggle_info_wrapper").style.display = "none";

      this.showInfo(true);
      this.glass = false;
    }
    if (this.viewer) {
      // not available at first call
      this.viewer.glass = false;
    }
    const options = {
      cadWidth: this.cadWidth,
      glass: this.glass,
      height: this.height,
      tools: this.tools,
      treeWidth: flag ? 0 : this.treeWidth,
    };
    this.setSizes(options);

    // const fullWidth = this.cadWidth + (this.glass ? 0 : this.treeWidth);
    // this.handleMoreButton(fullWidth);
  }

  updateHelp(before, after) {
    const help = this._getElement("tcv_cad_help_layout");
    for (var k in before) {
      help.innerHTML = help.innerHTML.replaceAll(
        "&lt;" + before[k].slice(0, -3) + "&gt;",
        "&lt;_" + after[k].slice(0, -3) + "&gt;",
      );
    }
    help.innerHTML = help.innerHTML.replaceAll("_shift", "shift");
    help.innerHTML = help.innerHTML.replaceAll("_ctrl", "ctrl");
    help.innerHTML = help.innerHTML.replaceAll("_alt", "alt");
    help.innerHTML = help.innerHTML.replaceAll("_meta", "meta");
  }
}

export { Display };
