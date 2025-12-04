// =============================================================================
// IMPORTS & HELPERS
// =============================================================================

import { KeyMapper, EventListenerManager } from "./utils.js";
import { Slider } from "./slider.js";
import { Toolbar, Button, ClickButton, Ellipsis } from "./toolbar.js";
import { ToolTypes } from "./cad_tools/tools.js";
import { FilterByDropDownMenu } from "./cad_tools/ui.js";

import template from "./index.html";

function TEMPLATE(id) {
  const shift = KeyMapper.getshortcuts("shift");
  const ctrl = KeyMapper.getshortcuts("ctrl");
  const meta = KeyMapper.getshortcuts("meta");
  const alt = KeyMapper.getshortcuts("alt");
  var html = template
    .replaceAll("{{id}}", id)
    .replaceAll("{{shift}}", shift)
    .replaceAll("{{ctrl}}", ctrl)
    .replaceAll("{{meta}}", meta)
    .replaceAll("{{alt}}", alt);
  return html;
}

function px(val) {
  return `${val}px`;
}

const buttons = ["plane", "play", "pause", "stop"];

const listeners = new EventListenerManager();

// =============================================================================
// DISPLAY CLASS
// =============================================================================

class Display {
  // ---------------------------------------------------------------------------
  // Constructor & Toolbar Setup
  // ---------------------------------------------------------------------------

  /**
   * Create Display
   * @param {DOMElement} container - the DOM element, e.g. div, that should contain the Display
   * @param {} options - display options
   */
  constructor(container, options) {
    this.container = container;
    this.container.innerHTML = TEMPLATE(this.container.id);

    this.cadBody = this._getElement("tcv_cad_body");

    this.measureTools = options.measureTools;
    this.measurementDebug = options.measurementDebug;
    this.selectTool = options.selectTool;
    this.explodeTool = options.explodeTool;
    this.zscaleTool = options.zscaleTool;
    this.zScale = 1.0;

    // this.cadTool = this._getElement("tcv_cad_toolbar");
    this.cadTool = new Toolbar(
      this._getElement("tcv_cad_toolbar"),
      container.id,
      this,
    );
    this.cadView = this._getElement("tcv_cad_view");
    this.distanceMeasurementPanel = this._getElement(
      "tcv_distance_measurement_panel",
    );
    this.propertiesMeasurementPanel = this._getElement(
      "tcv_properties_measurement_panel",
    );
    this.cadTree = this._getElement("tcv_cad_tree_container");
    this.cadTreeScrollContainer = this._getElement("tcv_box_content");
    this.cadTreeToggles = this._getElement("tcv_cad_tree_toggles");
    this.cadClip = this._getElement("tcv_cad_clip_container");
    this.cadMaterial = this._getElement("tcv_cad_material_container");
    this.cadZebra = this._getElement("tcv_cad_zebra_container");
    this.tabTree = this._getElement("tcv_tab_tree");
    this.tabClip = this._getElement("tcv_tab_clip");
    this.tabMaterial = this._getElement("tcv_tab_material");
    this.tabZebra = this._getElement("tcv_tab_zebra");
    this.cadInfo = this._getElement("tcv_cad_info_container");
    this.tickValueElement = this._getElement("tcv_tick_size_value");
    this.tickInfoElement = this._getElement("tcv_tick_size");
    this.cadAnim = this._getElement("tcv_cad_animation");
    this.cadTools = this._getElement("tcv_cad_tools");
    if (!options.zebraTool) {
      this.tabZebra.style.display = "none";
    }
    this.cadHelp = this._getElement("tcv_cad_help");
    listeners.add(this.cadHelp, "contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
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
    this.cadZebra.style.display = "none";
    this.clipSliders = null;

    this.currentButton = null;

    this.lastPlaneState = false;

    const theme = options.theme;
    this.theme = theme;

    this.setButtonBackground(theme);

    this.toolbarButtons = {};

    this.toolbarButtons["axes"] = new ClickButton(
      theme,
      "axes",
      "Show axes",
      this.setAxes,
    );
    this.cadTool.addButton(this.toolbarButtons["axes"], -1);
    this.cadTool.addEllipsis(new Ellipsis(0, this.cadTool.maximize));
    this.toolbarButtons["axes0"] = new ClickButton(
      theme,
      "axes0",
      "Show axes at origin (0,0,0)",
      this.setAxes0,
    );
    this.cadTool.addButton(this.toolbarButtons["axes0"], 0);
    this.toolbarButtons["grid"] = new ClickButton(
      theme,
      "grid",
      "Show grid",
      this.setGrid,
      null,
      ["xy", "xz", "yz"],
    );
    this.cadTool.addButton(this.toolbarButtons["grid"], 0);
    this.cadTool.addSeparator();
    this.toolbarButtons["perspective"] = new ClickButton(
      theme,
      "perspective",
      "Use perspective camera",
      this.setOrtho,
    );
    this.cadTool.addButton(this.toolbarButtons["perspective"], -1);
    this.cadTool.addEllipsis(new Ellipsis(1, this.cadTool.maximize));
    this.toolbarButtons["transparent"] = new ClickButton(
      theme,
      "transparent",
      "Show transparent faces",
      this.setTransparent,
    );
    this.cadTool.addButton(this.toolbarButtons["transparent"], 1);
    this.toolbarButtons["blackedges"] = new ClickButton(
      theme,
      "blackedges",
      "Show black edges",
      this.setBlackEdges,
    );
    this.cadTool.addButton(this.toolbarButtons["blackedges"], 1);
    this.cadTool.addSeparator();

    this.toolbarButtons["reset"] = new Button(
      theme,
      "reset",
      "Reset view",
      this.reset,
    );
    this.cadTool.addButton(this.toolbarButtons["reset"], -1);
    this.cadTool.addEllipsis(new Ellipsis(2, this.cadTool.maximize));
    this.toolbarButtons["resize"] = new Button(
      theme,
      "resize",
      "Resize object",
      this.resize,
    );
    this.cadTool.addButton(this.toolbarButtons["resize"], 2);
    // this.cadTool.addSeparator();

    this.toolbarButtons["iso"] = new Button(
      theme,
      "iso",
      "Switch to iso view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["iso"], 2);
    this.toolbarButtons["front"] = new Button(
      theme,
      "front",
      "Switch to front view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["front"], 2);
    this.toolbarButtons["rear"] = new Button(
      theme,
      "rear",
      "Switch to back view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["rear"], 2);
    this.toolbarButtons["top"] = new Button(
      theme,
      "top",
      "Switch to top view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["top"], 2);
    this.toolbarButtons["bottom"] = new Button(
      theme,
      "bottom",
      "Switch to bottom view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["bottom"], 2);
    this.toolbarButtons["left"] = new Button(
      theme,
      "left",
      "Switch to left view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["left"], 2);
    this.toolbarButtons["right"] = new Button(
      theme,
      "right",
      "Switch to right view",
      this.setView,
    );
    this.cadTool.addButton(this.toolbarButtons["right"], 2);

    this.cadTool.addSeparator();

    this.toolbarButtons["explode"] = new ClickButton(
      theme,
      "explode",
      "Explode tool",
      this.setExplode,
    );
    if (this.explodeTool && !this.zscaleTool) {
      this.cadTool.addButton(this.toolbarButtons["explode"], -1);
    }

    this.toolbarButtons["zscale"] = new ClickButton(
      theme,
      "zscale",
      "Scale along the Z-axis",
      this.setZScale,
    );
    if (this.zscaleTool && !this.explodeTool) {
      this.cadTool.addButton(this.toolbarButtons["zscale"], -1);
      this.showZScale(false);
      const el = this._getElement("tcv_zscale_slider");
      listeners.add(el, "change", (e) => {
        this.zScale = parseInt(e.target.value);
        this.viewer.setZscaleValue(e.target.value);
      });
    }

    this.toolbarButtons["distance"] = new ClickButton(
      theme,
      "distance",
      "Measure distance between shapes",
      this.setTool,
    );
    this.cadTool.addButton(this.toolbarButtons["distance"], 3);
    const count =
      (this.measureTools ? 2 : 0) +
      (this.explodeTool ? 1 : 0) +
      (this.selectTool ? 1 : 0) +
      (this.zscaleTool ? 1 : 0);
    if (count > 1) {
      this.cadTool.addEllipsis(new Ellipsis(3, this.cadTool.maximize));
    }

    this.toolbarButtons["properties"] = new ClickButton(
      theme,
      "properties",
      "Show shape properties",
      this.setTool,
    );
    this.cadTool.addButton(this.toolbarButtons["properties"], 3);

    this.toolbarButtons["select"] = new ClickButton(
      theme,
      "select",
      "Copy shape IDs to clipboard",
      this.setTool,
    );
    this.cadTool.addButton(this.toolbarButtons["select"], 3);

    this.cadTool.defineGroup([
      this.toolbarButtons["explode"],
      this.toolbarButtons["distance"],
      this.toolbarButtons["properties"],
      this.toolbarButtons["select"],
    ]);

    listeners.add(document, "keydown", (e) => {
      if (e.key === "Escape" && this.help_shown) {
        e.preventDefault();
        this.showHelp(false);
      }
    });

    this.cadTool.addSeparator();

    this.toolbarButtons["pin"] = new Button(
      theme,
      "pin",
      "Pin viewer as png",
      this.pinAsPng,
    );
    this.toolbarButtons["pin"].alignRight();
    this.cadTool.addButton(this.toolbarButtons["pin"], -1);
    this.shapeFilterDropDownMenu = new FilterByDropDownMenu(this);

    this.showPinning(options.pinning);

    this.toolbarButtons["help"] = new Button(
      theme,
      "help",
      "Help",
      this.toggleHelp,
    );
    this.cadTool.addButton(this.toolbarButtons["help"], -1);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  setButtonBackground(theme) {
    for (var btn of buttons) {
      var elements = this.container.getElementsByClassName(`tcv_${btn}`);
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        el.classList.add(`tcv_button_${btn}`);
      }
    }
  }

  widthThreshold() {
    var threshold = 770;
    if (!this.state.get("pinning")) threshold -= 30;
    if (!this.state.get("selectTool")) threshold -= 30;
    if (!this.state.get("explodeTool") && !this.state.get("zscaleTool")) threshold -= 30;
    return threshold;
  }

  _setupCheckEvent(name, fn, flag) {
    const el = this._getElement(name);
    listeners.add(el, "change", fn);
    if (flag != undefined) {
      el.checked = flag;
    }
    this._events.push(["change", name, fn]);
  }

  // eslint-disable-next-line no-unused-vars
  _setupClickEvent(name, fn, flag) {
    const el = this._getElement(name);
    listeners.add(el, "click", fn);
    this._events.push(["click", name, fn]);
  }
  // eslint-disable-next-line no-unused-vars

  _setupRadioEvent(name, fn) {
    const el = this._getElement(name);
    listeners.add(el, "change", fn);
    this._events.push(["change", name, fn]);
  }

  /**
   *
   * @param {string} name Name of the DOM element
   * @returns {DOMElement}
   */
  _getElement(name) {
    return this.container.getElementsByClassName(name)[0];
  }

  // ---------------------------------------------------------------------------
  // Disposal & UI Layout
  // ---------------------------------------------------------------------------

  dispose() {
    listeners.dispose();

    this.viewer = undefined;

    this.cadTree.innerHTML = "";
    this.cadTree = undefined;

    this.cadView.removeChild(this.cadView.children[2]);

    this.container.innerHTML = "";
    this.container = null;

    this.cadTreeScrollContainer = null;
  }

  /**
   * Set the width and height of the different UI elements (tree, canvas and info box)
   * @param {DisplayOptions} options
   */
  setSizes(options) {
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
    if (!options.glass && options.treeHeight) {
      this.cadTree.parentElement.parentElement.style.height = px(options.treeHeight);
      this.cadInfo.parentElement.parentElement.style.height = px(
        options.height - options.treeHeight - 4,
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

  // ---------------------------------------------------------------------------
  // UI Setup & State Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Set up the UI
   * @param {Viewer} viewer - the viewer for this UI
   */
  setupUI(viewer) {
    this.viewer = viewer;
    this.state = viewer.state;

    // Theme
    if (this.theme === "browser") {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      listeners.add(this.mediaQuery, "change", (event) => {
        if (event.matches) {
          this.setTheme("dark");
        } else {
          this.setTheme("light");
        }
      });
    }

    this._setupClickEvent("tcv_expand_root", this.handleCollapseNodes);
    this._setupClickEvent("tcv_collapse_singles", this.handleCollapseNodes);
    this._setupClickEvent("tcv_collapse_all", this.handleCollapseNodes);
    this._setupClickEvent("tcv_expand", this.handleCollapseNodes);

    this._setupClickEvent("tcv_material_reset", this.handleMaterialReset);

    this._setupClickEvent("tcv_toggle_info", this.toggleInfo);

    this.help_shown = true;
    this.info_shown = !this.glass;

    const tabs = [
      "tcv_tab_tree",
      "tcv_tab_clip",
      "tcv_tab_material",
      "tcv_tab_zebra",
    ];
    tabs.forEach((name) => {
      this._setupClickEvent(name, this.selectTab);
    });

    this.clipSliders = [];
    for (var i = 1; i < 4; i++) {
      this.clipSliders.push(
        new Slider(`plane${i}`, 0, 100, this.container, {
          handler: this.refreshPlane,
          notifyCallback: (change, notify) =>
            this.viewer.checkChanges(change, notify),
          onSetSlider: this.refreshPlane,
        }),
      );
    }

    const viewerReadyCheck = () => this.viewer.ready;

    this.ambientlightSlider = new Slider(
      "ambientlight",
      0,
      400,
      this.container,
      {
        handler: this.viewer.setAmbientLight,
        percentage: true,
        isReadyCheck: viewerReadyCheck,
      },
    );
    this.directionallightSlider = new Slider(
      "pointlight",
      0,
      400,
      this.container,
      {
        handler: this.viewer.setDirectLight,
        percentage: true,
        isReadyCheck: viewerReadyCheck,
      },
    );
    this.metalnessSlider = new Slider("metalness", 0, 100, this.container, {
      handler: this.viewer.setMetalness,
      percentage: true,
      isReadyCheck: viewerReadyCheck,
    });
    this.roughnessSlider = new Slider("roughness", 0, 100, this.container, {
      handler: this.viewer.setRoughness,
      percentage: true,
      isReadyCheck: viewerReadyCheck,
    });

    this.zebraCountSlider = new Slider("zebra_count", 2, 50, this.container, {
      handler: this.viewer.setZebraCount,
      isReadyCheck: viewerReadyCheck,
    });
    this.zebraOpacitySlider = new Slider(
      "zebra_opacity",
      0.0,
      1.0,
      this.container,
      {
        handler: this.viewer.setZebraOpacity,
        isReadyCheck: viewerReadyCheck,
      },
    );
    this.zebraDirectionSlider = new Slider(
      "zebra_direction",
      0,
      90,
      this.container,
      {
        handler: this.viewer.setZebraDirection,
        isReadyCheck: viewerReadyCheck,
      },
    );

    this._getElement("tcv_zebra_color1").checked = true;
    this._getElement("tcv_zebra_mapping1").checked = true;

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

    [1, 2, 3].forEach((id) => {
      this._setupRadioEvent(`tcv_zebra_color${id}`, this.setZebraColorScheme);
    });

    [1, 2].forEach((id) => {
      this._setupRadioEvent(`tcv_zebra_mapping${id}`, this.setZebraMappingMode);
    });

    this._setupClickEvent("tcv_play", this.controlAnimation, false);
    this._setupClickEvent("tcv_pause", this.controlAnimation, false);
    this._setupClickEvent("tcv_stop", this.controlAnimation, false);
    this.animationSlider = this.container.getElementsByClassName(
      "tcv_animation_slider",
    )[0];
    // Initial value synced via subscription with immediate:true
    listeners.add(this.animationSlider, "input", this.animationChange);
    // Animation control starts hidden (state default is false)

    this.showHelp(false);
    this.showDistancePanel(false);
    this.showPropertiesPanel(false);

    this.showMeasureTools(this.measureTools);
    this.showSelectTool(this.selectTool);
    this.showExplodeTool(this.explodeTool);
    this.showZScaleTool(this.zscaleTool);

    // Subscribe to state changes
    this._subscribeToStateChanges();
  }

  /**
   * Subscribe to ViewerState changes to keep UI in sync
   * @private
   */
  _subscribeToStateChanges() {
    const state = this.viewer.state;

    // Subscribe to individual state keys that affect UI
    state.subscribe("axes", (change) => {
      this.toolbarButtons["axes"]?.set(change.new);
    });

    state.subscribe("axes0", (change) => {
      this.toolbarButtons["axes0"]?.set(change.new);
    });

    state.subscribe("ortho", (change) => {
      this.toolbarButtons["perspective"]?.set(!change.new);
    });

    state.subscribe("transparent", (change) => {
      this.toolbarButtons["transparent"]?.set(change.new);
    });

    state.subscribe("blackEdges", (change) => {
      this.toolbarButtons["blackedges"]?.set(change.new);
    });

    state.subscribe(
      "grid",
      (change) => {
        const gridButton = this.toolbarButtons["grid"];
        if (gridButton) {
          const grid = change.new; // [xy, xz, yz]
          // Update main button state (true if any grid is visible)
          gridButton.set(grid.some((g) => g));
          // Update individual checkboxes
          if (gridButton.checkElems) {
            gridButton.checkElems["xy"].checked = grid[0];
            gridButton.checkElems["xz"].checked = grid[1];
            gridButton.checkElems["yz"].checked = grid[2];
          }
        }
      },
      { immediate: true },
    );

    state.subscribe("tools", (change) => {
      this.showTools(change.new);
    });

    state.subscribe("glass", (change) => {
      this.glassMode(change.new);
    });

    state.subscribe("theme", (change) => {
      this.setTheme(change.new);
    });

    state.subscribe("clipIntersection", (change) => {
      this._getElement("tcv_clip_intersection").checked = change.new;
    });

    state.subscribe(
      "clipPlaneHelpers",
      (change) => {
        this.checkElement("tcv_clip_plane_helpers", change.new);
      },
      { immediate: true },
    );

    state.subscribe("clipObjectColors", (change) => {
      this._getElement("tcv_clip_caps").checked = change.new;
    });

    // Clip slider subscriptions
    state.subscribe("clipSlider0", (change) => {
      this.clipSliders[0]?.setValueFromState(change.new);
    });
    state.subscribe("clipSlider1", (change) => {
      this.clipSliders[1]?.setValueFromState(change.new);
    });
    state.subscribe("clipSlider2", (change) => {
      this.clipSliders[2]?.setValueFromState(change.new);
    });

    // Material slider subscriptions (state stores 0-1, sliders display 0-100 or 0-400)
    // Use immediate:true to sync sliders with initial state values
    state.subscribe(
      "ambientIntensity",
      (change) => {
        this.ambientlightSlider?.setValueFromState(change.new * 100);
      },
      { immediate: true },
    );
    state.subscribe(
      "directIntensity",
      (change) => {
        this.directionallightSlider?.setValueFromState(change.new * 100);
      },
      { immediate: true },
    );
    state.subscribe(
      "metalness",
      (change) => {
        this.metalnessSlider?.setValueFromState(change.new * 100);
      },
      { immediate: true },
    );
    state.subscribe(
      "roughness",
      (change) => {
        this.roughnessSlider?.setValueFromState(change.new * 100);
      },
      { immediate: true },
    );

    // Zebra slider subscriptions
    state.subscribe("zebraCount", (change) => {
      this.zebraCountSlider?.setValueFromState(change.new);
    });
    state.subscribe("zebraOpacity", (change) => {
      this.zebraOpacitySlider?.setValueFromState(change.new);
    });
    state.subscribe("zebraDirection", (change) => {
      this.zebraDirectionSlider?.setValueFromState(change.new);
    });

    // Zebra radio button subscriptions
    state.subscribe("zebraColorScheme", (change) => {
      this.setZebraColorSchemeSelect(change.new);
    });
    state.subscribe("zebraMappingMode", (change) => {
      this.setZebraMappingModeSelect(change.new);
    });

    // Animation/Explode mode subscription - controls slider visibility, label, and explode button
    state.subscribe("animationMode", (change) => {
      const mode = change.new;
      // Show/hide slider control
      this.cadAnim.style.display = mode !== "none" ? "block" : "none";
      // Set label: "A" for animation, "E" for explode
      this._getElement("tcv_animation_label").innerHTML =
        mode === "explode" ? "E" : "A";
      // Update explode button state
      this.toolbarButtons["explode"]?.set(mode === "explode");
    });
    state.subscribe(
      "animationSliderValue",
      (change) => {
        this.animationSlider.value = change.new;
      },
      { immediate: true },
    );

    // ZScale toolbar button subscription
    state.subscribe("zscaleActive", (change) => {
      this.toolbarButtons["zscale"]?.set(change.new);
    });

    // Camera button highlight subscription
    state.subscribe("highlightedButton", (change) => {
      // Clear all highlights first
      const buttons = ["front", "rear", "top", "bottom", "left", "right", "iso"];
      buttons.forEach((btn) => {
        this.toolbarButtons[btn]?.highlight(false);
      });
      // Highlight the new button if set
      if (change.new) {
        this.toolbarButtons[change.new]?.highlight(true);
      }
    });

    // Active tool subscription
    state.subscribe("activeTool", (change) => {
      // Deactivate old tool button
      if (change.old) {
        this.toolbarButtons[change.old]?.set(false);
      }
      // Activate new tool button
      if (change.new) {
        this.toolbarButtons[change.new]?.set(true);
      }
    });
  }

  /**
   * Initialize UI elements from current state.
   * Called once during initialization. Subsequent updates happen via state subscriptions.
   */
  updateUI() {
    const state = this.viewer.state;
    this.toolbarButtons["axes"].set(state.get("axes"));
    this.toolbarButtons["axes0"].set(state.get("axes0"));
    this.toolbarButtons["perspective"].set(!state.get("ortho"));
    this.toolbarButtons["transparent"].set(state.get("transparent"));
    this.toolbarButtons["blackedges"].set(state.get("blackEdges"));

    this.showTools(state.get("tools"));
    this.glassMode(state.get("glass"));
    const width = this.glass ? this.cadWidth : this.cadWidth + this.treeWidth;
    if (width < this.widthThreshold()) {
      this.cadTool.minimize();
    }

    // Initialize lastPlaneState from options (used for tab switching)
    this.lastPlaneState = state.get("clipPlaneHelpers");
  }

  // ---------------------------------------------------------------------------
  // DOM Management
  // ---------------------------------------------------------------------------

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
      canvas = this.cadView.querySelector("canvas");
    }
    listeners.add(canvas, "click", (e) => {
      if (this.help_shown) {
        this.showHelp(false);
      }
    });
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

  // ---------------------------------------------------------------------------
  // Toolbar Button Handlers: View Settings
  // ---------------------------------------------------------------------------

  /**
   * Checkbox Handler for setting the axes parameter
   * @function
   * @param {string} name - button name
   * @param {boolean} flag - to set or not
   */
  setAxes = (name, flag) => {
    this.viewer.setAxes(flag);
  };

  /**
   * Checkbox Handler for setting the grid parameter
   * @function
   * @param {string} name - grid plane name (xy, xz, yz)
   * @param {boolean} flag - to set or not
   */
  setGrid = (name, flag) => {
    this.viewer.setGrid(name, flag);
  };

  /**
   * Checkbox Handler for setting the axes0 parameter
   * @function
   * @param {string} name - button name
   * @param {boolean} flag - to set or not
   */
  setAxes0 = (name, flag) => {
    this.viewer.setAxes0(flag);
  };

  /**
   * Checkbox Handler for setting the ortho parameter
   * @function
   * @param {string} name - button name
   * @param {boolean} flag - to set or not
   */
  setOrtho = (name, flag) => {
    this.viewer.switchCamera(!flag);
  };

  /**
   * Checkbox Handler for setting the transparent parameter
   * @function
   * @param {string} name - button name
   * @param {boolean} flag - to set or not
   */
  setTransparent = (name, flag) => {
    this.viewer.setTransparent(flag);
  };

  /**
   * Checkbox Handler for setting the black edges parameter
   * @function
   * @param {string} name - button name
   * @param {boolean} flag - to set or not
   */
  setBlackEdges = (name, flag) => {
    this.viewer.setBlackEdges(flag);
  };

  // ---------------------------------------------------------------------------
  // Toolbar Button Handlers: Tools
  // ---------------------------------------------------------------------------

  /**
   * Handler for the explode button
   * @function
   * @param {string} name - button name (unused)
   * @param {boolean} flag - whether to enable or disable explode mode
   */
  setExplode = (name, flag) => {
    this.viewer.setExplode(flag);
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
   * Checkbox Handler for setting the zscale mode
   * @function
   * @param {string} name - button name
   * @param {boolean} flag - to set or not
   */
  setZScale = (name, flag) => {
    this.showZScale(flag);
    this.viewer.nestedGroup.setZScale(1);
    this.viewer.update(true);
    this._getElement("tcv_zscale_slider").value = 1;
  };

  /**
   * Show or hide the ZScale slider
   * @function
   * @param {boolean} flag - whether to show the ZScale slider
   */
  showZScale = (flag) => {
    const el = this._getElement("tcv_cad_zscale");
    el.style.display = flag ? "inline-block" : "none";
  };

  /**
   * Checkbox Handler for setting the tools mode
   * @function
   * @param {string} name - tool name
   * @param {boolean} flag - whether to start or stop measure context
   */
  setTool = (name, flag) => {
    this.viewer.toggleAnimationLoop(flag);

    if (flag) {
      this.viewer.state.set("animationMode", "none");
      if (this.viewer.hasAnimation()) {
        this.viewer.backupAnimation();
      }
      if (
        ["distance", "properties", "angle", "select"].includes(name) &&
        !["distance", "properties", "angle", "select"].includes(
          this.currentButton,
        )
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
      } else if (name == "select") {
        this.viewer.cadTools.enable(ToolTypes.SELECT);
        this.viewer.checkChanges({ activeTool: ToolTypes.SELECT });
      }
      this.currentButton = name;
    } else {
      if (this.currentButton == name || name == "explode") {
        this.viewer.toggleGroup(false);
        this.viewer.toggleTab(false);
        this.currentButton = null;
      }
      if (name == "distance") {
        this.viewer.cadTools.disable(ToolTypes.DISTANCE);
      } else if (name == "properties") {
        this.viewer.cadTools.disable(ToolTypes.PROPERTIES);
      } else if (name == "select") {
        this.viewer.cadTools.disable(ToolTypes.SELECT);
      }
      this.viewer.checkChanges({ activeTool: ToolTypes.NONE });
      this.viewer.clearSelection();
      if (this.viewer.hasAnimation()) {
        this.controlAnimationByName("stop");
        this.viewer.clearAnimation();
        this.viewer.restoreAnimation(); // This sets animationMode via initAnimation
      }
      this.viewer.setRaycastMode(flag);
    }
    this.viewer.setPickHandler(!flag);
    this.shapeFilterDropDownMenu.show(flag);
  };

  /**
   * Show or hide the CAD tools (UI update only).
   * This method only updates the visual state - it does not modify ViewerState.
   * To change the tools setting, call viewer.setTools() which will update state
   * and trigger this method via subscription.
   * @function
   * @param {boolean} flag - whether to show or hide the CAD tools
   */
  showTools = (flag) => {
    this.tools = flag;
    var tb = this._getElement("tcv_cad_toolbar");
    var cn = this._getElement("tcv_cad_navigation");
    if (flag) {
      tb.style.height = "38px";
      tb.style.display = "flex";
      cn.style.height = "38px";
      cn.style.display = "block";
    } else {
      tb.style.height = "0px";
      tb.style.display = "none";
      cn.style.height = "0px";
      cn.style.display = "none";
    }
  };

  /**
   * Show or hides measurement tools, measurement tools needs a backend to be used.
   * @param {boolean} flag
   */
  showMeasureTools = (flag) => {
    this.toolbarButtons["distance"].show(flag);
    this.toolbarButtons["properties"].show(flag);
  };

  /**
   * Show or hides select tool
   * @param {boolean} flag
   */
  showSelectTool = (flag) => {
    this.toolbarButtons["select"].show(flag);
  };

  /**
   * Show or hides explode tool
   * @param {boolean} flag
   */
  showExplodeTool = (flag) => {
    this.toolbarButtons["explode"].show(flag);
  };

  /**
   * Show or hides ZScale tool
   * @param {boolean} flag
   */
  showZScaleTool = (flag) => {
    this.toolbarButtons["zscale"].show(flag);
    if (!flag) {
      this.showZScale(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Clipping Handlers
  // ---------------------------------------------------------------------------

  /**
   * Checkbox Handler for setting the clip planes parameter
   * @function
   * @param {Event} e - a DOM click event
   */
  setClipPlaneHelpers = (e) => {
    const flag = !!e.target.checked;
    this.lastPlaneState = flag;  // Remember user's explicit choice
    this.viewer.setClipPlaneHelpers(flag);
  };

  /**
   * Checkbox Handler for setting the clip intersection parameter
   * @function
   * @param {Event} e - a DOM change event
   */
  setClipIntersection = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setClipIntersection(flag);
  };

  /**
   * Checkbox Handler for toggling the clip caps
   * @function
   * @param {Event} e - a DOM change event
   */
  setObjectColorCaps = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setClipObjectColorCaps(flag);
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

  // ---------------------------------------------------------------------------
  // View Control Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handler to reset position, zoom and up of the camera
   * @function
   */
  reset = () => {
    this.viewer.reset();
    this.viewer.state.set("highlightedButton", null);
  };

  /**
   * Handler to reset zoom of the camera
   * @function
   */
  resize = () => {
    this.viewer.resize();
  };

  /**
   * Handler to set camera to a predefined position
   * @function
   * @param {string} button - view name (front, rear, top, bottom, left, right, iso)
   * @param {boolean} focus - whether to focus on visible objects
   */
  setView = (button, focus = false) => {
    this.viewer.presetCamera(button);
    if (focus) {
      this.viewer.centerVisibleObjects();
    }
    this.viewer.state.set("highlightedButton", button);
    this.viewer.keepHighlight = true;
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

  // ---------------------------------------------------------------------------
  // Tab Navigation & Tree Control
  // ---------------------------------------------------------------------------

  /**
   * Handler to activate a UI tab (tree / clipping / material / zebra)
   * @function
   * @param {Event} e - a DOM click event
   */
  selectTab = (e) => {
    const tab = e.target.className.split(" ")[0];
    this.selectTabByName(tab.slice(8));
  };

  /**
   * Activate the UI tab given the name of the tab
   * @param {string} tab - name of the tab "tree", "clip", "material", or "zebra"
   */
  selectTabByName(tab) {
    if (!["clip", "tree", "material", "zebra"].includes(tab)) {
      return;
    }

    const _switchTab = (showTree, showClip, showMaterial, showZebra) => {
      this.cadTree.style.display = showTree ? "block" : "none";
      this.cadTreeToggles.style.display = showTree ? "block" : "none";
      this.cadClip.style.display = showClip ? "block" : "none";
      this.cadMaterial.style.display = showMaterial ? "block" : "none";
      this.cadZebra.style.display = showZebra ? "block" : "none";

      this.viewer.clipping.setVisible(showClip);
      this.viewer.setLocalClipping(showClip);
      if (!showClip) {
        // Hide plane helpers when leaving clip tab, but preserve lastPlaneState
        // (set by user's checkbox clicks) so it can be restored when returning
        this.viewer.setClipPlaneHelpers(false);
      }
      if (tab != "zebra" && this.activeTab === "zebra") {
        this.viewer.enableZebraTool(false);
      }
    };

    if (tab === "tree" && this.activeTab !== "tree") {
      _switchTab(true, false, false, false);
      this.viewer.nestedGroup.setBackVisible(false);
    } else if (tab === "clip" && this.activeTab !== "clip") {
      _switchTab(false, true, false, false);
      this.viewer.nestedGroup.setBackVisible(true);
      this.viewer.setClipIntersection(this.viewer.state.get("clipIntersection"));
      this.viewer.setClipPlaneHelpers(this.lastPlaneState);
      this.viewer.update(true, false);
    } else if (tab === "material" && this.activeTab !== "material") {
      _switchTab(false, false, true, false);
      this.viewer.nestedGroup.setBackVisible(false);
    } else if (tab === "zebra" && this.activeTab !== "zebra") {
      _switchTab(false, false, false, true);
      this.viewer.enableZebraTool(true);
    }
    this.activeTab = tab;

    [this.tabTree, this.tabClip, this.tabMaterial, this.tabZebra].forEach(
      (tab) => {
        tab.classList.add("tcv_tab-unselected");
        tab.classList.remove("tcv_tab-selected");
      },
    );

    this.viewer.checkChanges({ tab: tab });
    if (tab == "tree") {
      this.tabTree.classList.add("tcv_tab-selected");
      this.tabTree.classList.remove("tcv_tab-unselected");
    } else if (tab == "clip") {
      this.tabClip.classList.add("tcv_tab-selected");
      this.tabClip.classList.remove("tcv_tab-unselected");
    } else if (tab == "material") {
      this.tabMaterial.classList.add("tcv_tab-selected");
      this.tabMaterial.classList.remove("tcv_tab-unselected");
    } else if (tab == "zebra") {
      this.tabZebra.classList.remove("tcv_tab-unselected");
      this.tabZebra.classList.add("tcv_tab-selected");
    }
  }

  /**
   * Toggle visibility of the clipping tab
   * @function
   * @param {boolean} flag - whether to enable or disable the clipping tab
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
   * Collapse nodes handler (event handler)
   * @function
   * @param {Event} e - a DOM click event
   */
  handleCollapseNodes = (e) => {
    this.collapseNodes(e.target.value);
  };

  /**
   * Collapse or expand tree nodes
   * @param {string} value - "1": collapse leaf nodes, "R": expand root only, "C": collapse all, "E": expand all
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

  // ---------------------------------------------------------------------------
  // Material Handlers
  // ---------------------------------------------------------------------------

  /**
   * Reset material values to original values
   * @function
   * @param {Event} e - a DOM click event
   */
  // eslint-disable-next-line no-unused-vars
  handleMaterialReset = (e) => {
    this.viewer.resetMaterial();
  };

  // ---------------------------------------------------------------------------
  // Zebra Tool Handlers
  // ---------------------------------------------------------------------------

  /**
   * Set zebra stripe count in the UI
   * @function
   * @param {number} val - an int between 2 and 50
   */
  setZebraCount = (val) => {
    this.zebraCountSlider.setValue(val);
  };

  /**
   * Set zebra stripe opacity in the UI
   * @function
   * @param {number} val - a float between 0 and 1
   */
  setZebraOpacity = (val) => {
    this.zebraOpacitySlider.setValue(val);
  };

  /**
   * Set zebra stripe direction in the UI
   * @function
   * @param {number} val - an int between 0 and 90
   */
  setZebraDirection = (val) => {
    this.zebraDirectionSlider.setValue(val);
  };

  /**
   * Handler for setting the zebra color scheme
   * @function
   * @param {Event} e - a DOM change event
   */
  setZebraColorScheme = (e) => {
    const value = e.target.value;
    this.viewer.setZebraColorScheme(value);
    this.setZebraColorSchemeSelect(value);
  };

  /**
   * Set zebra color scheme radio button in the UI
   * @function
   * @param {string} value - "blackwhite", "colorful", or "grayscale"
   */
  setZebraColorSchemeSelect = (value) => {
    const el = this.container.querySelector(
      `input[name="zebra_color_group"][value="${value}"]`,
    );
    if (el) el.checked = true;
  };

  /**
   * Handler for setting the zebra mapping mode
   * @function
   * @param {Event} e - a DOM change event
   */
  setZebraMappingMode = (e) => {
    const value = e.target.value;
    this.viewer.setZebraMappingMode(value);
    this.setZebraMappingModeSelect(value);
  };

  /**
   * Set zebra mapping mode radio button in the UI
   * @function
   * @param {string} value - "reflection" or "normal"
   */
  setZebraMappingModeSelect = (value) => {
    const el = this.container.querySelector(
      `input[name="zebra_mapping_group"][value="${value}"]`,
    );
    if (el) el.checked = true;
  };

  // ---------------------------------------------------------------------------
  // Slider & Animation Control
  // ---------------------------------------------------------------------------

  /**
   * Set minimum and maximum of the clipping sliders
   * @param {number} limit - the value for both minimum and maximum value of the slider
   */
  setSliderLimits(limit) {
    for (var i = 0; i < 3; i++) {
      this.clipSliders[i].setSlider(limit);
    }
  }

  /**
   * Refresh clipping plane position
   * @function
   * @param {number} index - index of the plane: 1, 2, or 3
   * @param {number} value - distance on the clipping normal from the center
   */
  refreshPlane = (index, value) => {
    this.viewer.refreshPlane(index - 1, parseFloat(value));
  };

  /**
   * Handle animation control by button name
   * @function
   * @param {string} btn - animation control button name ("play", "pause", "stop")
   */
  controlAnimationByName(btn) {
    this.viewer.controlAnimation(btn);

    var currentTime = this.viewer.animation.getRelativeTime();
    this.viewer.state.set("animationSliderValue", 1000 * currentTime);
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
   * Handler for the animation control buttons
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
   * @param {Event} e - a DOM input event
   */
  animationChange = (e) => {
    this.viewer.animation.setRelativeTime(e.target.valueAsNumber / 1000);
    if (this.viewer.lastBbox != null) {
      this.viewer.lastBbox.needsUpdate = true;
    }
  };

  // ---------------------------------------------------------------------------
  // Help & Info Panels
  // ---------------------------------------------------------------------------

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
   * Toggle help dialog visibility
   * @function
   */
  toggleHelp = () => {
    this.showHelp(!this.help_shown);
  };

  /**
   * Replace container content with a static image
   * @param {HTMLImageElement} image - The image element to display
   */
  replaceWithImage(image) {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.container.appendChild(image);
  }

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
   * Show or hide info dialog
   * @function
   * @param {boolean} flag - whether to show or hide info dialog
   */
  showInfo = (flag) => {
    this.cadInfo.parentNode.parentNode.style.display = flag ? "block" : "none";
    this._getElement("tcv_toggle_info").innerHTML = flag ? "\u25BE" : "\u25B8";
    this.info_shown = flag;
  };

  /**
   * Toggle info dialog visibility
   * @function
   */
  toggleInfo = () => {
    this.showInfo(!this.info_shown);
  };

  // ---------------------------------------------------------------------------
  // Theme & Glass Mode
  // ---------------------------------------------------------------------------

  /**
   * Auto collapse tree nodes when cad width < 600
   * @function
   */
  autoCollapse() {
    if (this.cadWidth < 600 && this.glass) {
      console.info("Small view, collapsing tree");
      this.collapseNodes("C");
    }
  }

  /**
   * Enable/disable glass mode (UI update only).
   * This method only updates the visual state - it does not modify ViewerState.
   * To change the glass setting, call viewer.setGlass() which will update state
   * and trigger this method via subscription.
   * @function
   * @param {boolean} flag - whether to enable/disable glass mode
   */
  glassMode(flag) {
    const treeHeight = this.state?.get("treeHeight") ?? Math.round((this.height * 2) / 3);
    if (flag) {
      this._getElement("tcv_cad_tree").classList.add("tcv_cad_tree_glass");
      this._getElement("tcv_cad_tree").style["height"] = null;
      this._getElement("tcv_cad_tree").style["max-height"] = px(treeHeight - 18);

      this._getElement("tcv_cad_info").classList.add("tcv_cad_info_glass");
      this._getElement("tcv_cad_view").classList.add("tcv_cad_view_glass");

      this._getElement("tcv_toggle_info_wrapper").style.display = "block";

      this.showInfo(false);
      this.glass = true;
      this.autoCollapse();
    } else {
      this._getElement("tcv_cad_tree").classList.remove("tcv_cad_tree_glass");
      this._getElement("tcv_cad_tree").style["max-height"] = null;
      this._getElement("tcv_cad_tree").style.height = px(treeHeight);
      this._getElement("tcv_cad_info").classList.remove("tcv_cad_info_glass");
      this._getElement("tcv_cad_view").classList.remove("tcv_cad_view_glass");

      this._getElement("tcv_toggle_info_wrapper").style.display = "none";

      this.showInfo(true);
      this.glass = false;
    }
    const options = {
      cadWidth: this.cadWidth,
      glass: this.glass,
      height: this.height,
      treeHeight: treeHeight,
      tools: this.tools,
      treeWidth: flag ? 0 : this.treeWidth,
    };
    this.setSizes(options);
  }

  /**
   * Update help dialog with new key mappings
   * @param {Object} before - previous key mapping
   * @param {Object} after - new key mapping
   */
  updateHelp(before, after) {
    const help = this._getElement("tcv_cad_help_layout");
    for (var k in before) {
      if (before[k] && after[k]) {
        help.innerHTML = help.innerHTML.replaceAll(
          "&lt;" + before[k].slice(0, -3) + "&gt;",
          "&lt;_" + after[k].slice(0, -3) + "&gt;",
        );
      }
    }
    help.innerHTML = help.innerHTML.replaceAll("_shift", "shift");
    help.innerHTML = help.innerHTML.replaceAll("_ctrl", "ctrl");
    help.innerHTML = help.innerHTML.replaceAll("_alt", "alt");
    help.innerHTML = help.innerHTML.replaceAll("_meta", "meta");
  }

  /**
   * Set the UI theme
   * @param {string} theme - "dark", "light", or "browser"
   * @returns {string} - the resolved theme ("dark" or "light")
   */
  setTheme(theme) {
    if (
      theme === "dark" ||
      (theme == "browser" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      this.container.setAttribute("data-theme", "dark");
      document.body.setAttribute("data-theme", "dark");
      if (this.viewer.orientationMarker) {
        this.viewer.orientationMarker.changeTheme("dark");
      }
      if (this.viewer.gridHelper) {
        this.viewer.gridHelper.clearCache();
        this.viewer.gridHelper.update(
          this.viewer.getCameraZoom(),
          true,
          "dark",
        );
      }
      this.viewer.update(true);
      return "dark";
    } else {
      this.container.setAttribute("data-theme", "light");
      document.body.setAttribute("data-theme", "light");
      if (this.viewer.orientationMarker) {
        this.viewer.orientationMarker.changeTheme("light");
      }
      if (this.viewer.gridHelper) {
        this.viewer.gridHelper.clearCache();
        this.viewer.gridHelper.update(
          this.viewer.getCameraZoom(),
          true,
          "light",
        );
      }
      this.viewer.update(true);
      return "light";
    }
  }
}

export { Display };
