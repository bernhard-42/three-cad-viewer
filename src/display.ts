// =============================================================================
// IMPORTS & HELPERS
// =============================================================================

import * as THREE from "three";
import { KeyMapper, EventListenerManager } from "./utils.js";
import { Slider } from "./slider.js";
import { Toolbar, Button, ClickButton, Ellipsis } from "./toolbar.js";
import { ToolTypes } from "./cad_tools/tools.js";
import type { MeasurementPanelElements, FilterDropdownElements } from "./cad_tools/tools.js";
import { FilterByDropDownMenu } from "./cad_tools/ui.js";
import { Info } from "./info.js";
import type { Viewer } from "./viewer.js";
import type { ViewerState } from "./viewer-state.js";
import type { ActiveTab, Theme, ThemeInput, ZebraColorScheme, ZebraMappingMode } from "./types.js";

import template from "./index.html";

function TEMPLATE(id: string): string {
  const shift = KeyMapper.getshortcuts("shift");
  const ctrl = KeyMapper.getshortcuts("ctrl");
  const meta = KeyMapper.getshortcuts("meta");
  const alt = KeyMapper.getshortcuts("alt");
  const html = template
    .replaceAll("{{id}}", id)
    .replaceAll("{{shift}}", shift)
    .replaceAll("{{ctrl}}", ctrl)
    .replaceAll("{{meta}}", meta)
    .replaceAll("{{alt}}", alt);
  return html;
}

function px(val: number): string {
  return `${val}px`;
}

const buttons = ["plane", "play", "pause", "stop"];

const listeners = new EventListenerManager();

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Options for Display constructor
 */
export interface DisplayOptions {
  measureTools: boolean;
  measurementDebug: boolean;
  selectTool: boolean;
  explodeTool: boolean;
  zscaleTool: boolean;
  zebraTool: boolean;
  glass: boolean;
  tools: boolean;
  cadWidth: number;
  height: number;
  treeWidth: number;
  treeHeight?: number;
  theme: ThemeInput;
  pinning: boolean;
}

/**
 * Options for setSizes method
 */
interface SizeOptions {
  cadWidth?: number;
  height?: number;
  treeWidth?: number;
  treeHeight?: number;
  glass?: boolean;
  tools?: boolean;
}

/**
 * Options for canvas capture
 */
interface CaptureOptions {
  taskId: string;
  render: () => void;
  onComplete?: () => void;
}

/**
 * Result of canvas capture
 */
interface CaptureResult {
  task: string;
  dataUrl: string | ArrayBuffer | null;
}

/**
 * Stored event for cleanup
 */
type StoredEvent = [string, string, EventListener];

// =============================================================================
// DISPLAY CLASS
// =============================================================================

class Display {
  // DOM Elements
  container: HTMLElement;
  cadBody: HTMLElement;
  cadView: HTMLElement;
  cadTree: HTMLElement;
  cadTreeScrollContainer: HTMLElement | null;
  cadTreeToggles: HTMLElement;
  cadClip: HTMLElement;
  cadMaterial: HTMLElement;
  cadZebra: HTMLElement;
  cadInfo: HTMLElement;
  cadAnim: HTMLElement;
  cadTools: HTMLElement;
  cadHelp: HTMLElement;
  tabTree: HTMLElement;
  tabClip: HTMLElement;
  tabMaterial: HTMLElement;
  tabZebra: HTMLElement;
  tickValueElement: HTMLElement;
  tickInfoElement: HTMLElement;
  distanceMeasurementPanel: HTMLElement;
  propertiesMeasurementPanel: HTMLElement;
  planeLabels: HTMLElement[];
  animationSlider: HTMLInputElement | null;

  // Grouped UI elements for CAD tools (implements DisplayLike interface)
  measurementPanels: MeasurementPanelElements;
  filterDropdown: FilterDropdownElements;

  // Toolbar
  cadTool: Toolbar;
  toolbarButtons: Record<string, Button | ClickButton>;

  // Sliders
  clipSliders: Slider[] | null;
  ambientlightSlider: Slider | undefined;
  directionallightSlider: Slider | undefined;
  metalnessSlider: Slider | undefined;
  roughnessSlider: Slider | undefined;
  zebraCountSlider: Slider | undefined;
  zebraOpacitySlider: Slider | undefined;
  zebraDirectionSlider: Slider | undefined;

  // State
  viewer: Viewer | null | undefined;
  state: ViewerState | undefined;
  measureTools: boolean;
  measurementDebug: boolean;
  selectTool: boolean;
  explodeTool: boolean;
  zscaleTool: boolean;
  zScale: number;
  glass: boolean;
  tools: boolean;
  cadWidth: number;
  height: number;
  treeWidth: number;
  theme: ThemeInput;
  lastPlaneState: boolean;
  help_shown: boolean;
  info_shown: boolean;

  // Info panel
  _info: Info;

  // Events and subscriptions
  _events: StoredEvent[];
  _unsubscribers: (() => void)[];

  // Filter dropdown
  shapeFilterDropDownMenu: FilterByDropDownMenu;

  // Media query for theme
  mediaQuery: MediaQueryList | undefined;

  // ---------------------------------------------------------------------------
  // Constructor & Toolbar Setup
  // ---------------------------------------------------------------------------

  /**
   * Create Display
   * @param container - the DOM element that should contain the Display
   * @param options - display options
   */
  constructor(container: HTMLElement, options: DisplayOptions) {
    this.container = container;
    this.container.innerHTML = TEMPLATE(this.container.id);

    this.cadBody = this.getElement("tcv_cad_body");

    this.measureTools = options.measureTools;
    this.measurementDebug = options.measurementDebug;
    this.selectTool = options.selectTool;
    this.explodeTool = options.explodeTool;
    this.zscaleTool = options.zscaleTool;
    this.zScale = 1.0;

    this.cadTool = new Toolbar(
      this.getElement("tcv_cad_toolbar"),
      container.id,
      {
        getVisibleWidth: () =>
          this.glass ? this.cadWidth : this.cadWidth + this.treeWidth,
        getWidthThreshold: () => this._widthThreshold(),
        features: {
          measureTools: this.measureTools,
          selectTool: this.selectTool,
          explodeTool: this.explodeTool,
        },
      },
    );
    this.cadView = this.getElement("tcv_cad_view");
    this.distanceMeasurementPanel = this.getElement(
      "tcv_distance_measurement_panel",
    );
    this.propertiesMeasurementPanel = this.getElement(
      "tcv_properties_measurement_panel",
    );

    // Initialize grouped UI elements for CAD tools
    this.measurementPanels = {
      distancePanel: this.distanceMeasurementPanel,
      propertiesPanel: this.propertiesMeasurementPanel,
    };
    this.filterDropdown = {
      container: this.getElement("tcv_shape_filter"),
      dropdown: this.getElement("tcv_filter_dropdown"),
      icon: this.getElement("tcv_filter_icon"),
      value: this.getElement("tcv_filter_value"),
      content: this.getElement("tcv_filter_content"),
      options: {
        none: this.getElement("tvc_filter_none"),
        vertex: this.getElement("tvc_filter_vertex"),
        edge: this.getElement("tvc_filter_edge"),
        face: this.getElement("tvc_filter_face"),
        solid: this.getElement("tvc_filter_solid"),
      },
    };

    this.cadTree = this.getElement("tcv_cad_tree_container");
    this.cadTreeScrollContainer = this.getElement("tcv_box_content");
    this.cadTreeToggles = this.getElement("tcv_cad_tree_toggles");
    this.cadClip = this.getElement("tcv_cad_clip_container");
    this.cadMaterial = this.getElement("tcv_cad_material_container");
    this.cadZebra = this.getElement("tcv_cad_zebra_container");
    this.tabTree = this.getElement("tcv_tab_tree");
    this.tabClip = this.getElement("tcv_tab_clip");
    this.tabMaterial = this.getElement("tcv_tab_material");
    this.tabZebra = this.getElement("tcv_tab_zebra");
    this.cadInfo = this.getElement("tcv_cad_info_container");
    this._info = new Info(this.cadInfo);
    this.tickValueElement = this.getElement("tcv_tick_size_value");
    this.tickInfoElement = this.getElement("tcv_tick_size");
    this.cadAnim = this.getElement("tcv_cad_animation");
    this.cadTools = this.getElement("tcv_cad_tools");
    if (!options.zebraTool) {
      this.tabZebra.style.display = "none";
    }
    this.cadHelp = this.getElement("tcv_cad_help");
    listeners.add(this.cadHelp, "contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    });
    this.planeLabels = [];
    for (let i = 1; i < 4; i++) {
      this.planeLabels.push(this.getElement(`tcv_lbl_norm_plane${i}`));
    }
    this.viewer = null;
    this.glass = options.glass;
    this.tools = options.tools;
    this.cadWidth = options.cadWidth;
    this.height = options.height;
    this.treeWidth = options.treeWidth;
    this._events = [];
    this._unsubscribers = [];

    this.setSizes(options);

    // Note: activeTab is managed by ViewerState, not stored locally
    this.cadTree.style.display = "block";
    this.cadClip.style.display = "none";
    this.cadMaterial.style.display = "none";
    this.cadZebra.style.display = "none";
    this.clipSliders = null;

    // Note: activeTool is managed by ViewerState, not stored locally

    this.lastPlaneState = false;
    this.help_shown = true;
    this.info_shown = !this.glass;

    const theme = options.theme;
    this.theme = theme;

    this.setButtonBackground();

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
      false,
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
      const el = this.getElement("tcv_zscale_slider") as HTMLInputElement;
      listeners.add(el, "change", (e) => {
        this.zScale = parseInt((e.target as HTMLInputElement).value);
        this.viewer!.setZscaleValue(parseInt((e.target as HTMLInputElement).value));
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
      this.toolbarButtons["explode"] as ClickButton,
      this.toolbarButtons["distance"] as ClickButton,
      this.toolbarButtons["properties"] as ClickButton,
      this.toolbarButtons["select"] as ClickButton,
    ]);

    listeners.add(document, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape" && this.help_shown) {
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
    (this.toolbarButtons["pin"] as Button).alignRight();
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

    // Initialize animation slider (will be set up in setupUI)
    this.animationSlider = null;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  setButtonBackground(): void {
    for (const btn of buttons) {
      const elements = this.container.getElementsByClassName(`tcv_${btn}`);
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        el.classList.add(`tcv_button_${btn}`);
      }
    }
  }

  /**
   * Calculate the width threshold for toolbar collapse.
   * @returns The threshold width in pixels.
   */
  private _widthThreshold(): number {
    let threshold = 770;
    if (!this.state!.get("pinning")) threshold -= 30;
    if (!this.state!.get("selectTool")) threshold -= 30;
    if (!this.state!.get("explodeTool") && !this.state!.get("zscaleTool")) threshold -= 30;
    return threshold;
  }

  /**
   * Update toolbar collapse state based on available width.
   * Maximizes toolbar if width is sufficient, minimizes otherwise.
   * @param availableWidth - The available width in pixels.
   */
  updateToolbarCollapse(availableWidth: number): void {
    if (availableWidth >= this._widthThreshold()) {
      this.cadTool.maximize();
    } else {
      this.cadTool.minimize();
    }
  }

  private setupCheckEvent(name: string, fn: EventListener, flag?: boolean): void {
    const el = this.getElement(name) as HTMLInputElement;
    listeners.add(el, "change", fn);
    if (flag !== undefined) {
      el.checked = flag;
    }
    this._events.push(["change", name, fn]);
  }

  private setupClickEvent(name: string, fn: EventListener): void {
    const el = this.getElement(name);
    listeners.add(el, "click", fn);
    this._events.push(["click", name, fn]);
  }

  private setupRadioEvent(name: string, fn: EventListener): void {
    const el = this.getElement(name);
    listeners.add(el, "change", fn);
    this._events.push(["change", name, fn]);
  }

  /**
   * Get a DOM element by class name (internal use only)
   * @param name - Name of the DOM element class
   * @returns The DOM element
   */
  private getElement(name: string): HTMLElement {
    return this.container.getElementsByClassName(name)[0] as HTMLElement;
  }

  // ---------------------------------------------------------------------------
  // Disposal & UI Layout
  // ---------------------------------------------------------------------------

  dispose(): void {
    // Unsubscribe from all state subscriptions first (prevents callbacks to disposed UI)
    if (this._unsubscribers) {
      for (const unsubscribe of this._unsubscribers) {
        unsubscribe();
      }
      this._unsubscribers = [];
    }

    listeners.dispose();

    // Dispose toolbar and all its buttons/ellipses
    this.cadTool.dispose();

    // Dispose sliders
    if (this.clipSliders) {
      for (const slider of this.clipSliders) {
        slider.dispose();
      }
    }
    this.ambientlightSlider?.dispose();
    this.directionallightSlider?.dispose();
    this.metalnessSlider?.dispose();
    this.roughnessSlider?.dispose();
    this.zebraCountSlider?.dispose();
    this.zebraOpacitySlider?.dispose();
    this.zebraDirectionSlider?.dispose();

    this.viewer = undefined;

    this.cadTree.innerHTML = "";
    (this as { cadTree: HTMLElement | undefined }).cadTree = undefined;

    this.cadView.removeChild(this.cadView.children[2]);

    this.container.innerHTML = "";
    (this as { container: HTMLElement | null }).container = null;

    this.cadTreeScrollContainer = null;
  }

  // ---------------------------------------------------------------------------
  // Info Panel Methods
  // ---------------------------------------------------------------------------

  /**
   * Add HTML content to the info panel.
   * @param html - The HTML string to add.
   */
  addInfoHtml(html: string): void {
    this._info.addHtml(html);
  }

  /**
   * Display the ready message with viewer version and control mode.
   * @param version - Viewer version string.
   * @param control - Control mode name (e.g., "orbit", "trackball").
   */
  showReadyMessage(version: string, control: string): void {
    this._info.readyMsg(version, control);
  }

  /**
   * Display camera target center information.
   * @param center - The center coordinates [x, y, z].
   */
  showCenterInfo(center: [number, number, number]): void {
    this._info.centerInfo(center);
  }

  /**
   * Display bounding box information for a selected object.
   * @param path - The object's path in the tree.
   * @param name - The object's name.
   * @param bb - The bounding box to display.
   */
  showBoundingBoxInfo(path: string, name: string, bb: THREE.Box3): void {
    this._info.bbInfo(path, name, bb);
  }

  // ---------------------------------------------------------------------------
  // Canvas Capture
  // ---------------------------------------------------------------------------

  /**
   * Capture the canvas as a data URL.
   * @param options - Capture options.
   * @returns Promise resolving to task ID and data URL.
   */
  captureCanvas(options: CaptureOptions): Promise<CaptureResult> {
    const { taskId, render, onComplete } = options;
    const canvas = this.getCanvas() as HTMLCanvasElement;

    // Render the scene
    render();

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.addEventListener(
          "load",
          () => {
            resolve({ task: taskId, dataUrl: reader.result });
            if (onComplete) {
              onComplete();
            }
          },
          { once: true },
        );
        reader.readAsDataURL(blob!);
      });
    });
  }

  /**
   * Set the width and height of the different UI elements (tree, canvas and info box)
   * @param options - Size options
   */
  setSizes(options: SizeOptions): void {
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
      this.cadTree.parentElement!.parentElement!.style.width = px(
        options.treeWidth,
      );
      this.cadInfo.parentElement!.parentElement!.style.width = px(
        options.treeWidth,
      );
    }
    if (!options.glass && options.treeHeight) {
      this.cadTree.parentElement!.parentElement!.style.height = px(options.treeHeight);
      this.cadInfo.parentElement!.parentElement!.style.height = px(
        this.height - options.treeHeight - 4,
      );
    }

    if (options.tools && !options.glass) {
      this.cadTool.container.style.width = px(
        this.treeWidth + this.cadWidth + 4,
      );
      this.cadBody.style.width = px(this.treeWidth + this.cadWidth + 4);
    } else {
      this.cadTool.container.style.width = px(this.cadWidth + 2);
      this.cadBody.style.width = px(this.cadWidth + 2);
    }

    this.cadBody.style.height = px(this.height + 4);
  }

  // ---------------------------------------------------------------------------
  // UI Setup & State Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Set up the UI and attach the canvas element.
   * @param viewer - The viewer instance for this UI.
   * @param canvasElement - The Three.js renderer canvas to attach.
   */
  setupUI(viewer: Viewer, canvasElement: HTMLCanvasElement): void {
    this.viewer = viewer;
    this.state = viewer.state;

    // Attach the canvas element to the CAD view
    this.attachCanvas(canvasElement);

    // Theme
    if (this.theme === "browser") {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      listeners.add(this.mediaQuery, "change", (event) => {
        if ((event as MediaQueryListEvent).matches) {
          this.setTheme("dark");
        } else {
          this.setTheme("light");
        }
      });
    }

    this.setupClickEvent("tcv_expand_root", this.handleCollapseNodes);
    this.setupClickEvent("tcv_collapse_singles", this.handleCollapseNodes);
    this.setupClickEvent("tcv_collapse_all", this.handleCollapseNodes);
    this.setupClickEvent("tcv_expand", this.handleCollapseNodes);

    this.setupClickEvent("tcv_material_reset", this.handleMaterialReset);

    this.setupClickEvent("tcv_toggle_info", this.toggleInfo);

    this.help_shown = true;
    this.info_shown = !this.glass;

    const tabs = [
      "tcv_tab_tree",
      "tcv_tab_clip",
      "tcv_tab_material",
      "tcv_tab_zebra",
    ];
    tabs.forEach((name) => {
      this.setupClickEvent(name, this.selectTab);
    });

    this.clipSliders = [];
    for (let i = 1; i < 4; i++) {
      this.clipSliders.push(
        new Slider(`plane${i}`, 0, 100, this.container, {
          handler: this.refreshPlane,
          notifyCallback: (change, notify) =>
            this.viewer!.checkChanges(change, notify),
          onSetSlider: this.refreshPlane,
        }),
      );
    }

    const viewerReadyCheck = () => this.viewer!.ready;

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

    (this.getElement("tcv_zebra_color1") as HTMLInputElement).checked = true;
    (this.getElement("tcv_zebra_mapping1") as HTMLInputElement).checked = true;

    this.setupCheckEvent(
      "tcv_clip_plane_helpers",
      this.setClipPlaneHelpers,
      false,
    );
    this.setupCheckEvent(
      "tcv_clip_intersection",
      this.setClipIntersection,
      false,
    );
    this.setupCheckEvent("tcv_clip_caps", this.setObjectColorCaps, false);

    for (let i = 1; i < 4; i++) {
      this.setupClickEvent(
        `tcv_btn_norm_plane${i}`,
        this.setClipNormalFromPosition,
      );
    }

    [1, 2, 3].forEach((id) => {
      this.setupRadioEvent(`tcv_zebra_color${id}`, this.setZebraColorScheme);
    });

    [1, 2].forEach((id) => {
      this.setupRadioEvent(`tcv_zebra_mapping${id}`, this.setZebraMappingMode);
    });

    this.setupClickEvent("tcv_play", this.controlAnimation);
    this.setupClickEvent("tcv_pause", this.controlAnimation);
    this.setupClickEvent("tcv_stop", this.controlAnimation);
    this.animationSlider = this.container.getElementsByClassName(
      "tcv_animation_slider",
    )[0] as HTMLInputElement;
    // Initial value synced via subscription with immediate:true
    if (this.animationSlider) {
      listeners.add(this.animationSlider, "input", this.animationChange);
    }
    // Animation control starts hidden (state default is false)

    this.showHelp(false);
    this.showDistancePanel(false);
    this.showPropertiesPanel(false);

    this.showMeasureTools(this.measureTools);
    this.showSelectTool(this.selectTool);
    this.showExplodeTool(this.explodeTool);
    this.showZScaleTool(this.zscaleTool);

    // Subscribe to state changes
    this.subscribeToStateChanges();
  }

  /**
   * Subscribe to ViewerState changes to keep UI in sync.
   * Stores unsubscribe functions for cleanup in dispose().
   */
  private subscribeToStateChanges(): void {
    const state = this.viewer!.state;
    this._unsubscribers = [];

    // Helper to subscribe and track unsubscribe function
    // Using 'as keyof ...' to allow string-based subscriptions
    const sub = (key: string, callback: (change: { old: unknown; new: unknown }) => void, options?: { immediate?: boolean }) => {
      this._unsubscribers.push(state.subscribe(key as Parameters<typeof state.subscribe>[0], callback as Parameters<typeof state.subscribe>[1], options));
    };

    // Subscribe to individual state keys that affect UI
    sub("axes", (change) => {
      (this.toolbarButtons["axes"] as ClickButton)?.set(change.new as boolean);
    });

    sub("axes0", (change) => {
      (this.toolbarButtons["axes0"] as ClickButton)?.set(change.new as boolean);
    });

    sub("ortho", (change) => {
      (this.toolbarButtons["perspective"] as ClickButton)?.set(!(change.new as boolean));
    });

    sub("transparent", (change) => {
      (this.toolbarButtons["transparent"] as ClickButton)?.set(change.new as boolean);
    });

    sub("blackEdges", (change) => {
      (this.toolbarButtons["blackedges"] as ClickButton)?.set(change.new as boolean);
    });

    sub(
      "grid",
      (change) => {
        const gridButton = this.toolbarButtons["grid"] as ClickButton;
        if (gridButton) {
          const grid = change.new as boolean[];
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

    sub("tools", (change) => {
      this.showTools(change.new as boolean);
    });

    sub("glass", (change) => {
      this.glassMode(change.new as boolean);
    });

    sub("theme", (change) => {
      this.setTheme(change.new as Theme);
    });

    sub("clipIntersection", (change) => {
      (this.getElement("tcv_clip_intersection") as HTMLInputElement).checked = change.new as boolean;
    });

    sub(
      "clipPlaneHelpers",
      (change) => {
        this.checkElement("tcv_clip_plane_helpers", change.new as boolean);
      },
      { immediate: true },
    );

    sub("clipObjectColors", (change) => {
      (this.getElement("tcv_clip_caps") as HTMLInputElement).checked = change.new as boolean;
    });

    // Clip slider subscriptions
    sub("clipSlider0", (change) => {
      this.clipSliders?.[0]?.setValueFromState(change.new as number);
    });
    sub("clipSlider1", (change) => {
      this.clipSliders?.[1]?.setValueFromState(change.new as number);
    });
    sub("clipSlider2", (change) => {
      this.clipSliders?.[2]?.setValueFromState(change.new as number);
    });

    // Material slider subscriptions (state stores 0-1, sliders display 0-100 or 0-400)
    // Use immediate:true to sync sliders with initial state values
    sub(
      "ambientIntensity",
      (change) => {
        this.ambientlightSlider?.setValueFromState((change.new as number) * 100);
      },
      { immediate: true },
    );
    sub(
      "directIntensity",
      (change) => {
        this.directionallightSlider?.setValueFromState((change.new as number) * 100);
      },
      { immediate: true },
    );
    sub(
      "metalness",
      (change) => {
        this.metalnessSlider?.setValueFromState((change.new as number) * 100);
      },
      { immediate: true },
    );
    sub(
      "roughness",
      (change) => {
        this.roughnessSlider?.setValueFromState((change.new as number) * 100);
      },
      { immediate: true },
    );

    // Zebra slider subscriptions
    sub("zebraCount", (change) => {
      this.zebraCountSlider?.setValueFromState(change.new as number);
    });
    sub("zebraOpacity", (change) => {
      this.zebraOpacitySlider?.setValueFromState(change.new as number);
    });
    sub("zebraDirection", (change) => {
      this.zebraDirectionSlider?.setValueFromState(change.new as number);
    });

    // Zebra radio button subscriptions
    sub("zebraColorScheme", (change) => {
      this.setZebraColorSchemeSelect(change.new as string);
    });
    sub("zebraMappingMode", (change) => {
      this.setZebraMappingModeSelect(change.new as string);
    });

    // Animation/Explode mode subscription - controls slider visibility, label, and explode button
    sub("animationMode", (change) => {
      const mode = change.new as string;
      // Show/hide slider control
      this.cadAnim.style.display = mode !== "none" ? "block" : "none";
      // Set label: "A" for animation, "E" for explode
      this.getElement("tcv_animation_label").innerHTML =
        mode === "explode" ? "E" : "A";
      // Update explode button state
      (this.toolbarButtons["explode"] as ClickButton)?.set(mode === "explode");
    });
    sub(
      "animationSliderValue",
      (change) => {
        if (this.animationSlider) {
          this.animationSlider.value = String(change.new);
        }
      },
      { immediate: true },
    );

    // ZScale toolbar button subscription
    sub("zscaleActive", (change) => {
      (this.toolbarButtons["zscale"] as ClickButton)?.set(change.new as boolean);
    });

    // Camera button highlight subscription
    sub("highlightedButton", (change) => {
      // Clear all highlights first
      const buttonNames = ["front", "rear", "top", "bottom", "left", "right", "iso"];
      buttonNames.forEach((btn) => {
        (this.toolbarButtons[btn] as Button)?.highlight(false);
      });
      // Highlight the new button if set
      if (change.new) {
        (this.toolbarButtons[change.new as string] as Button)?.highlight(true);
      }
    });

    // Active tool subscription
    sub("activeTool", (change) => {
      // Deactivate old tool button
      if (change.old) {
        (this.toolbarButtons[change.old as string] as ClickButton)?.set(false);
      }
      // Activate new tool button
      if (change.new) {
        (this.toolbarButtons[change.new as string] as ClickButton)?.set(true);
      }
    });

    // Active tab subscription
    sub("activeTab", (change) => {
      this.switchToTab(change.new as ActiveTab, change.old as ActiveTab);
    });
  }

  /**
   * Initialize UI elements from current state.
   * Called once during initialization. Subsequent updates happen via state subscriptions.
   */
  updateUI(): void {
    const state = this.viewer!.state;
    (this.toolbarButtons["axes"] as ClickButton).set(state.get("axes") as boolean);
    (this.toolbarButtons["axes0"] as ClickButton).set(state.get("axes0") as boolean);
    (this.toolbarButtons["perspective"] as ClickButton).set(!(state.get("ortho") as boolean));
    (this.toolbarButtons["transparent"] as ClickButton).set(state.get("transparent") as boolean);
    (this.toolbarButtons["blackedges"] as ClickButton).set(state.get("blackEdges") as boolean);

    this.showTools(state.get("tools") as boolean);
    this.glassMode(state.get("glass") as boolean);
    const width = this.glass ? this.cadWidth : this.cadWidth + this.treeWidth;
    this.updateToolbarCollapse(width);

    // Initialize lastPlaneState from options (used for tab switching)
    this.lastPlaneState = state.get("clipPlaneHelpers") as boolean;
  }

  // ---------------------------------------------------------------------------
  // DOM Management
  // ---------------------------------------------------------------------------

  /**
   * Check or uncheck a checkbox
   * @param name - name of the check box, see getElement
   * @param flag - whether to check or uncheck
   */
  checkElement(name: string, flag: boolean): void {
    (this.getElement(name) as HTMLInputElement).checked = flag;
  }

  /**
   * Attach the canvas element to the CAD view container.
   * @param canvasElement - The canvas to attach.
   */
  private attachCanvas(canvasElement: HTMLCanvasElement): void {
    const existingCanvas = this.cadView.querySelector("canvas");
    if (existingCanvas) {
      this.cadView.replaceChild(canvasElement, existingCanvas);
    } else {
      this.cadView.appendChild(canvasElement);
    }
    listeners.add(canvasElement, "click", () => {
      if (this.help_shown) {
        this.showHelp(false);
      }
    });
  }

  /**
   * Get the DOM canvas element
   */
  getCanvas(): Element {
    return this.cadView.children[this.cadView.children.length - 1];
  }

  /**
   * Clear the Cad tree
   */
  clearCadTree(): void {
    this.cadTree.innerHTML = "";
  }

  /**
   * Add the Cad tree and other UI elements like Clipping
   * @param cadTree - the DOM element that contains the cadTree
   */
  addCadTree(cadTree: HTMLElement): void {
    this.cadTree.appendChild(cadTree);
  }

  // ---------------------------------------------------------------------------
  // Toolbar Button Handlers: View Settings
  // ---------------------------------------------------------------------------

  /**
   * Checkbox Handler for setting the axes parameter
   */
  setAxes = (_name: string, flag: boolean): void => {
    this.viewer!.setAxes(flag);
  };

  /**
   * Checkbox Handler for setting the grid parameter
   */
  setGrid = (name: string, flag: boolean): void => {
    this.viewer!.setGrid(name, flag);
  };

  /**
   * Checkbox Handler for setting the axes0 parameter
   */
  setAxes0 = (_name: string, flag: boolean): void => {
    this.viewer!.setAxes0(flag);
  };

  /**
   * Checkbox Handler for setting the ortho parameter
   */
  setOrtho = (_name: string, flag: boolean): void => {
    this.viewer!.switchCamera(!flag);
  };

  /**
   * Checkbox Handler for setting the transparent parameter
   */
  setTransparent = (_name: string, flag: boolean): void => {
    this.viewer!.setTransparent(flag);
  };

  /**
   * Checkbox Handler for setting the black edges parameter
   */
  setBlackEdges = (_name: string, flag: boolean): void => {
    this.viewer!.setBlackEdges(flag);
  };

  // ---------------------------------------------------------------------------
  // Toolbar Button Handlers: Tools
  // ---------------------------------------------------------------------------

  /**
   * Handler for the explode button
   */
  setExplode = (_name: string, flag: boolean): void => {
    this.viewer!.setExplode(flag);
  };

  /**
   * Show or hide the Explode checkbox
   */
  showExplode = (flag: boolean): void => {
    const el = this.getElement("tcv_explode_widget");
    el.style.display = flag ? "inline-block" : "none";
  };

  /**
   * Checkbox Handler for setting the zscale mode
   */
  setZScale = (_name: string, flag: boolean): void => {
    this.showZScale(flag);
    this.viewer!.nestedGroup!.setZScale(1);
    this.viewer!.update(true);
    (this.getElement("tcv_zscale_slider") as HTMLInputElement).value = "1";
  };

  /**
   * Show or hide the ZScale slider
   */
  showZScale = (flag: boolean): void => {
    const el = this.getElement("tcv_cad_zscale");
    el.style.display = flag ? "inline-block" : "none";
  };

  /**
   * Checkbox Handler for setting the tools mode.
   * Delegates state mutations to Viewer.activateTool() to maintain unidirectional data flow.
   */
  setTool = (name: string, flag: boolean): void => {
    this.viewer!.toggleAnimationLoop(flag);
    const currentTool = this.state!.get("activeTool") as string;

    if (flag) {
      // Delegate state mutations to Viewer
      this.viewer!.activateTool(name, true);

      if (
        ["distance", "properties", "angle", "select"].includes(name) &&
        !["distance", "properties", "angle", "select"].includes(currentTool)
      ) {
        this.viewer!.toggleGroup(true);
        this.viewer!.toggleTab(true);
      }
      this.viewer!.setRaycastMode(flag);
      this.shapeFilterDropDownMenu.setRaycaster(this.viewer!.raycaster!);

      if (name === "distance") {
        this.viewer!.cadTools.enable(ToolTypes.DISTANCE);
        this.viewer!.checkChanges({ activeTool: ToolTypes.DISTANCE });
      } else if (name === "properties") {
        this.viewer!.cadTools.enable(ToolTypes.PROPERTIES);
        this.viewer!.checkChanges({ activeTool: ToolTypes.PROPERTIES });
      } else if (name === "select") {
        this.viewer!.cadTools.enable(ToolTypes.SELECT);
        this.viewer!.checkChanges({ activeTool: ToolTypes.SELECT });
      }
    } else {
      if (currentTool === name || name === "explode") {
        this.viewer!.toggleGroup(false);
        this.viewer!.toggleTab(false);
      }
      if (name === "distance") {
        this.viewer!.cadTools.disable();
      } else if (name === "properties") {
        this.viewer!.cadTools.disable();
      } else if (name === "select") {
        this.viewer!.cadTools.disable();
      }
      this.viewer!.checkChanges({ activeTool: ToolTypes.NONE });
      this.viewer!.clearSelection();

      // Delegate state mutations to Viewer
      this.viewer!.activateTool(name, false);

      this.viewer!.setRaycastMode(flag);
    }
    this.viewer!.setPickHandler(!flag);
    this.shapeFilterDropDownMenu.show(flag);
  };

  /**
   * Show or hide the CAD tools (UI update only).
   * This method only updates the visual state - it does not modify ViewerState.
   */
  showTools = (flag: boolean): void => {
    this.tools = flag;
    const tb = this.getElement("tcv_cad_toolbar");
    const cn = this.getElement("tcv_cad_navigation");
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
   */
  showMeasureTools = (flag: boolean): void => {
    this.toolbarButtons["distance"].show(flag);
    this.toolbarButtons["properties"].show(flag);
  };

  /**
   * Show or hides select tool
   */
  showSelectTool = (flag: boolean): void => {
    this.toolbarButtons["select"].show(flag);
  };

  /**
   * Show or hides explode tool
   */
  showExplodeTool = (flag: boolean): void => {
    this.toolbarButtons["explode"].show(flag);
  };

  /**
   * Show or hides ZScale tool
   */
  showZScaleTool = (flag: boolean): void => {
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
   */
  setClipPlaneHelpers = (e: Event): void => {
    const flag = !!(e.target as HTMLInputElement).checked;
    this.lastPlaneState = flag;
    this.viewer!.setClipPlaneHelpers(flag);
  };

  /**
   * Checkbox Handler for setting the clip intersection parameter
   */
  setClipIntersection = (e: Event): void => {
    const flag = !!(e.target as HTMLInputElement).checked;
    this.viewer!.setClipIntersection(flag);
  };

  /**
   * Checkbox Handler for toggling the clip caps
   */
  setObjectColorCaps = (e: Event): void => {
    const flag = !!(e.target as HTMLInputElement).checked;
    this.viewer!.setClipObjectColorCaps(flag);
  };

  /**
   * Set the normal at index to the current viewing direction
   */
  setClipNormalFromPosition = (e: Event): void => {
    const index = parseInt((e.target as HTMLElement).classList[0].slice(-1));
    this.viewer!.setClipNormalFromPosition(index - 1);
  };

  /**
   * Handler to set the label of a clipping normal widget
   */
  setNormalLabel = (index: number, normal: [number, number, number]): void => {
    this.planeLabels[index].innerHTML = `N=(${normal[0].toFixed(
      2,
    )}, ${normal[1].toFixed(2)}, ${normal[2].toFixed(2)})`;
  };

  // ---------------------------------------------------------------------------
  // View Control Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handler to reset position, zoom and up of the camera
   */
  reset = (): void => {
    this.viewer!.reset();
    this.viewer!.state.set("highlightedButton", null);
  };

  /**
   * Handler to reset zoom of the camera
   */
  resize = (): void => {
    this.viewer!.resize();
  };

  /**
   * Handler to set camera to a predefined position
   */
  setView = (button: string, focus: boolean = false): void => {
    this.viewer!.presetCamera(button);
    if (focus) {
      this.viewer!.centerVisibleObjects();
    }
    this.viewer!.state.set("highlightedButton", button);
    this.viewer!.keepHighlight = true;
    this.viewer!.update(true, false);
  };

  /**
   * Show/hide pinning button
   */
  showPinning(flag: boolean): void {
    this.toolbarButtons["pin"].show(flag);
  }

  /**
   * Pin screenshot of canvas as PNG
   */
  pinAsPng = (_name: string, _shift: boolean): void => {
    this.viewer!.pinAsPng();
  };

  // ---------------------------------------------------------------------------
  // Tab Navigation & Tree Control
  // ---------------------------------------------------------------------------

  /**
   * Handler to activate a UI tab (tree / clipping / material / zebra)
   */
  selectTab = (e: Event): void => {
    const tab = (e.target as HTMLElement).className.split(" ")[0];
    const tabName = tab.slice(8) as ActiveTab;
    if (["clip", "tree", "material", "zebra"].includes(tabName)) {
      this.viewer!.setActiveTab(tabName);
    }
  };

  /**
   * Switch to a tab (internal, called by activeTab subscription).
   */
  private switchToTab(newTab: ActiveTab, oldTab: ActiveTab): void {
    if (!["clip", "tree", "material", "zebra"].includes(newTab)) {
      return;
    }

    const _updateVisibility = (showTree: boolean, showClip: boolean, showMaterial: boolean, showZebra: boolean) => {
      this.cadTree.style.display = showTree ? "block" : "none";
      this.cadTreeToggles.style.display = showTree ? "block" : "none";
      this.cadClip.style.display = showClip ? "block" : "none";
      this.cadMaterial.style.display = showMaterial ? "block" : "none";
      this.cadZebra.style.display = showZebra ? "block" : "none";

      this.viewer!.clipping!.setVisible(showClip);
      this.viewer!.setLocalClipping(showClip);
      if (!showClip) {
        this.viewer!.setClipPlaneHelpers(false);
      }
      if (newTab !== "zebra" && oldTab === "zebra") {
        this.viewer!.enableZebraTool(false);
      }
    };

    if (newTab === "tree") {
      _updateVisibility(true, false, false, false);
      this.viewer!.nestedGroup!.setBackVisible(false);
    } else if (newTab === "clip") {
      _updateVisibility(false, true, false, false);
      this.viewer!.nestedGroup!.setBackVisible(true);
      this.viewer!.setClipIntersection(this.viewer!.state.get("clipIntersection") as boolean);
      this.viewer!.setClipPlaneHelpers(this.lastPlaneState);
      this.viewer!.update(true, false);
    } else if (newTab === "material") {
      _updateVisibility(false, false, true, false);
      this.viewer!.nestedGroup!.setBackVisible(false);
    } else if (newTab === "zebra") {
      _updateVisibility(false, false, false, true);
      this.viewer!.enableZebraTool(true);
    }

    // Update tab styling
    [this.tabTree, this.tabClip, this.tabMaterial, this.tabZebra].forEach(
      (tabEl) => {
        tabEl.classList.add("tcv_tab-unselected");
        tabEl.classList.remove("tcv_tab-selected");
      },
    );

    this.viewer!.checkChanges({ tab: newTab });
    if (newTab === "tree") {
      this.tabTree.classList.add("tcv_tab-selected");
      this.tabTree.classList.remove("tcv_tab-unselected");
    } else if (newTab === "clip") {
      this.tabClip.classList.add("tcv_tab-selected");
      this.tabClip.classList.remove("tcv_tab-unselected");
    } else if (newTab === "material") {
      this.tabMaterial.classList.add("tcv_tab-selected");
      this.tabMaterial.classList.remove("tcv_tab-unselected");
    } else if (newTab === "zebra") {
      this.tabZebra.classList.remove("tcv_tab-unselected");
      this.tabZebra.classList.add("tcv_tab-selected");
    }
  }

  /**
   * Toggle visibility of the clipping tab
   */
  toggleClippingTab = (flag: boolean): void => {
    if (flag) {
      this.tabClip.removeAttribute("disabled");
    } else {
      this.tabClip.setAttribute("disabled", "true");
    }
    this.tabClip.classList.toggle("tcv_tab-disabled", !flag);
  };

  /**
   * Collapse nodes handler (event handler)
   */
  handleCollapseNodes = (e: Event): void => {
    this.collapseNodes((e.target as HTMLButtonElement).value);
  };

  /**
   * Collapse or expand tree nodes
   */
  collapseNodes(value: string): void {
    if (value === "1") {
      this.viewer!.treeview!.openLevel(-1);
    } else if (value === "R") {
      this.viewer!.treeview!.openLevel(1);
    } else if (value === "C") {
      this.viewer!.treeview!.collapseAll();
    } else if (value === "E") {
      this.viewer!.treeview!.expandAll();
    }
  }

  // ---------------------------------------------------------------------------
  // Material Handlers
  // ---------------------------------------------------------------------------

  /**
   * Reset material values to original values
   */
  handleMaterialReset = (_e: Event): void => {
    this.viewer!.resetMaterial();
  };

  // ---------------------------------------------------------------------------
  // Zebra Tool Handlers
  // ---------------------------------------------------------------------------

  /**
   * Set zebra stripe count in the UI
   */
  setZebraCount = (val: number): void => {
    this.zebraCountSlider!.setValue(val);
  };

  /**
   * Set zebra stripe opacity in the UI
   */
  setZebraOpacity = (val: number): void => {
    this.zebraOpacitySlider!.setValue(val);
  };

  /**
   * Set zebra stripe direction in the UI
   */
  setZebraDirection = (val: number): void => {
    this.zebraDirectionSlider!.setValue(val);
  };

  /**
   * Handler for setting the zebra color scheme
   */
  setZebraColorScheme = (e: Event): void => {
    const value = (e.target as HTMLInputElement).value as ZebraColorScheme;
    this.viewer!.setZebraColorScheme(value);
    this.setZebraColorSchemeSelect(value);
  };

  /**
   * Set zebra color scheme radio button in the UI
   */
  setZebraColorSchemeSelect = (value: string): void => {
    const el = this.container.querySelector(
      `input[name="zebra_color_group"][value="${value}"]`,
    ) as HTMLInputElement | null;
    if (el) el.checked = true;
  };

  /**
   * Handler for setting the zebra mapping mode
   */
  setZebraMappingMode = (e: Event): void => {
    const value = (e.target as HTMLInputElement).value as ZebraMappingMode;
    this.viewer!.setZebraMappingMode(value);
    this.setZebraMappingModeSelect(value);
  };

  /**
   * Set zebra mapping mode radio button in the UI
   */
  setZebraMappingModeSelect = (value: string): void => {
    const el = this.container.querySelector(
      `input[name="zebra_mapping_group"][value="${value}"]`,
    ) as HTMLInputElement | null;
    if (el) el.checked = true;
  };

  // ---------------------------------------------------------------------------
  // Slider & Animation Control
  // ---------------------------------------------------------------------------

  /**
   * Set minimum and maximum of the clipping sliders
   */
  setSliderLimits(limit: number): void {
    for (let i = 0; i < 3; i++) {
      this.clipSliders![i].setSlider(limit);
    }
  }

  /**
   * Refresh clipping plane position
   */
  refreshPlane = (index: number, value: string): void => {
    this.viewer!.refreshPlane(index - 1, parseFloat(value));
  };

  /**
   * Handle animation control by button name
   */
  controlAnimationByName(btn: string): void {
    this.viewer!.controlAnimation(btn);

    const currentTime = this.viewer!.animation.getRelativeTime();
    this.viewer!.state.set("animationSliderValue", 1000 * currentTime);
    if (btn == "play") {
      this.viewer!.bboxNeedsUpdate = true;
    } else if (btn == "stop") {
      this.viewer!.bboxNeedsUpdate = false;
      if (this.viewer!.lastBbox != null) {
        this.viewer!.lastBbox.needsUpdate = true;
      }
    } else {
      this.viewer!.bboxNeedsUpdate = !this.viewer!.bboxNeedsUpdate;
    }
  }

  /**
   * Handler for the animation control buttons
   */
  controlAnimation = (e: Event): void => {
    const btn = (e.target as HTMLElement).className.split(" ")[0].slice(4);
    this.controlAnimationByName(btn);
  };

  /**
   * Handler for the animation slider
   */
  animationChange = (e: Event): void => {
    this.viewer!.animation.setRelativeTime((e.target as HTMLInputElement).valueAsNumber / 1000);
    if (this.viewer!.lastBbox != null) {
      this.viewer!.lastBbox.needsUpdate = true;
    }
  };

  // ---------------------------------------------------------------------------
  // Help & Info Panels
  // ---------------------------------------------------------------------------

  /**
   * Show or hide help dialog
   */
  showHelp = (flag: boolean): void => {
    this.cadHelp.style.display = flag ? "block" : "none";
    this.help_shown = flag;
  };

  /**
   * Toggle help dialog visibility
   */
  toggleHelp = (): void => {
    this.showHelp(!this.help_shown);
  };

  /**
   * Replace container content with a static image
   */
  replaceWithImage(image: HTMLImageElement): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.container.appendChild(image);
  }

  /**
   * Show or hide the distance measurement panel
   */
  showDistancePanel = (flag: boolean): void => {
    this.distanceMeasurementPanel.style.display = flag ? "block" : "none";
  };

  /**
   * Show or hide the properties measurement panel
   */
  showPropertiesPanel = (flag: boolean): void => {
    this.propertiesMeasurementPanel.style.display = flag ? "block" : "none";
  };

  /**
   * Show or hide info dialog
   */
  showInfo = (flag: boolean): void => {
    (this.cadInfo.parentNode!.parentNode as HTMLElement).style.display = flag ? "block" : "none";
    this.getElement("tcv_toggle_info").innerHTML = flag ? "\u25BE" : "\u25B8";
    this.info_shown = flag;
  };

  /**
   * Toggle info dialog visibility
   */
  toggleInfo = (): void => {
    this.showInfo(!this.info_shown);
  };

  // ---------------------------------------------------------------------------
  // Theme & Glass Mode
  // ---------------------------------------------------------------------------

  /**
   * Auto collapse tree nodes when cad width < 600
   */
  autoCollapse(): void {
    if (this.cadWidth < 600 && this.glass) {
      console.info("Small view, collapsing tree");
      this.collapseNodes("C");
    }
  }

  /**
   * Enable/disable glass mode (UI update only).
   */
  glassMode(flag: boolean): void {
    const treeHeight = this.state?.get("treeHeight") as number ?? Math.round((this.height * 2) / 3);
    if (flag) {
      this.getElement("tcv_cad_tree").classList.add("tcv_cad_tree_glass");
      (this.getElement("tcv_cad_tree") as HTMLElement).style.height = "";
      (this.getElement("tcv_cad_tree") as HTMLElement).style.maxHeight = px(treeHeight - 18);

      this.getElement("tcv_cad_info").classList.add("tcv_cad_info_glass");
      this.getElement("tcv_cad_view").classList.add("tcv_cad_view_glass");

      this.getElement("tcv_toggle_info_wrapper").style.display = "block";

      this.showInfo(false);
      this.glass = true;
      this.autoCollapse();
    } else {
      this.getElement("tcv_cad_tree").classList.remove("tcv_cad_tree_glass");
      (this.getElement("tcv_cad_tree") as HTMLElement).style.maxHeight = "";
      (this.getElement("tcv_cad_tree") as HTMLElement).style.height = px(treeHeight);
      this.getElement("tcv_cad_info").classList.remove("tcv_cad_info_glass");
      this.getElement("tcv_cad_view").classList.remove("tcv_cad_view_glass");

      this.getElement("tcv_toggle_info_wrapper").style.display = "none";

      this.showInfo(true);
      this.glass = false;
    }
    const options: SizeOptions = {
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
   */
  updateHelp(before: Record<string, string>, after: Record<string, string>): void {
    const help = this.getElement("tcv_cad_help_layout");
    for (const k in before) {
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
   */
  setTheme(theme: ThemeInput): string {
    if (
      theme === "dark" ||
      (theme === "browser" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      this.container.setAttribute("data-theme", "dark");
      document.body.setAttribute("data-theme", "dark");
      if (this.viewer!.orientationMarker) {
        this.viewer!.orientationMarker.changeTheme("dark");
      }
      if (this.viewer!.gridHelper) {
        this.viewer!.gridHelper.clearCache();
        this.viewer!.gridHelper.update(
          this.viewer!.getCameraZoom(),
          true,
          "dark",
        );
      }
      this.viewer!.update(true);
      return "dark";
    } else {
      this.container.setAttribute("data-theme", "light");
      document.body.setAttribute("data-theme", "light");
      if (this.viewer!.orientationMarker) {
        this.viewer!.orientationMarker.changeTheme("light");
      }
      if (this.viewer!.gridHelper) {
        this.viewer!.gridHelper.clearCache();
        this.viewer!.gridHelper.update(
          this.viewer!.getCameraZoom(),
          true,
          "light",
        );
      }
      this.viewer!.update(true);
      return "light";
    }
  }
}

export { Display };
