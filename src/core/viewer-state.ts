import * as THREE from "three";
import {
  CollapseState,
  type Theme,
  type ThemeInput,
  type ControlType,
  type UpDirection,
  type AnimationMode,
  type ActiveTab,
  type ZebraColorScheme,
  type ZebraMappingMode,
  type Keymap,
  type StateChange,
  type StateSubscriber,
  type GlobalStateSubscriber,
  type SubscribeOptions,
  type RenderOptions,
  type ViewerOptions,
} from "./types";
import { logger } from "../utils/logger.js";

/**
 * Display configuration defaults
 */
interface DisplayDefaults {
  theme: Theme;
  cadWidth: number;
  treeWidth: number;
  treeHeight: number;
  height: number;
  pinning: boolean;
  glass: boolean;
  tools: boolean;
  keymap: Keymap;
  newTreeBehavior: boolean;
  measureTools: boolean;
  selectTool: boolean;
  explodeTool: boolean;
  zscaleTool: boolean;
  zebraTool: boolean;
  measurementDebug: boolean;
}

/**
 * Render configuration defaults
 */
interface RenderDefaults {
  ambientIntensity: number;
  directIntensity: number;
  metalness: number;
  roughness: number;
  defaultOpacity: number;
  edgeColor: number;
  normalLen: number;
}

/**
 * Viewer/view configuration defaults
 */
interface ViewerDefaults {
  axes: boolean;
  axes0: boolean;
  grid: [boolean, boolean, boolean];
  ortho: boolean;
  transparent: boolean;
  blackEdges: boolean;
  collapse: CollapseState;
  clipIntersection: boolean;
  clipPlaneHelpers: boolean;
  clipObjectColors: boolean;
  clipNormal0: THREE.Vector3;
  clipNormal1: THREE.Vector3;
  clipNormal2: THREE.Vector3;
  clipSlider0: number;
  clipSlider1: number;
  clipSlider2: number;
  control: ControlType;
  holroyd: boolean;
  up: UpDirection;
  ticks: number;
  gridFontSize: number;
  centerGrid: boolean;
  position: THREE.Vector3 | null;
  quaternion: THREE.Quaternion | null;
  target: THREE.Vector3 | null;
  zoom: number;
  panSpeed: number;
  rotateSpeed: number;
  zoomSpeed: number;
  timeit: boolean;
}

/**
 * Zebra tool defaults
 */
interface ZebraDefaults {
  zebraCount: number;
  zebraOpacity: number;
  zebraDirection: number;
  zebraColorScheme: ZebraColorScheme;
  zebraMappingMode: ZebraMappingMode;
}

/**
 * Runtime state defaults
 */
interface RuntimeDefaults {
  activeTool: string | null;
  animationMode: AnimationMode;
  animationSliderValue: number;
  zscaleActive: boolean;
  highlightedButton: string | null;
  activeTab: ActiveTab;
}

/**
 * Complete state shape
 */
type StateShape = DisplayDefaults & RenderDefaults & ViewerDefaults & ZebraDefaults & RuntimeDefaults;

/**
 * Keys of the state shape
 */
type StateKey = keyof StateShape;

/**
 * Options that can be passed to ViewerState constructor.
 * Accepts StateShape properties plus an index signature for runtime validation.
 */
type ViewerStateOptions = Partial<StateShape> & { theme?: ThemeInput } & { [key: string]: unknown };

/**
 * External notification payload - single key/change pair
 */
type ExternalNotification = { key: string; change: StateChange<unknown> };

/**
 * All valid state keys for runtime validation
 */
const STATE_KEYS: ReadonlySet<string> = new Set<StateKey>([
  // Display
  "theme", "cadWidth", "treeWidth", "treeHeight", "height", "pinning", "glass", "tools",
  "keymap", "newTreeBehavior", "measureTools", "selectTool", "explodeTool", "zscaleTool",
  "zebraTool", "measurementDebug",
  // Render
  "ambientIntensity", "directIntensity", "metalness", "roughness", "defaultOpacity",
  "edgeColor", "normalLen",
  // Viewer
  "axes", "axes0", "grid", "ortho", "transparent", "blackEdges", "collapse",
  "clipIntersection", "clipPlaneHelpers", "clipObjectColors", "clipNormal0", "clipNormal1",
  "clipNormal2", "clipSlider0", "clipSlider1", "clipSlider2", "control", "holroyd", "up",
  "ticks", "gridFontSize", "centerGrid", "position", "quaternion", "target", "zoom",
  "panSpeed", "rotateSpeed", "zoomSpeed", "timeit",
  // Zebra
  "zebraCount", "zebraOpacity", "zebraDirection", "zebraColorScheme", "zebraMappingMode",
  // Runtime
  "activeTool", "animationMode", "animationSliderValue", "zscaleActive", "highlightedButton",
  "activeTab",
]);

/**
 * Type guard to check if a string is a valid state key
 */
function isStateKey(key: string): key is StateKey {
  return STATE_KEYS.has(key);
}

/**
 * Mapping from state keys to external notification keys.
 * Only keys that should trigger external notifications are included.
 * State keys not in this map won't trigger external notifications.
 */
const STATE_TO_NOTIFICATION_KEY: Partial<Record<StateKey, string>> = {
  // View settings
  axes: "axes",
  axes0: "axes0",
  grid: "grid",
  ortho: "ortho",
  transparent: "transparent",
  blackEdges: "black_edges",
  tools: "tools",
  glass: "glass",
  centerGrid: "center_grid",
  collapse: "collapse",
  activeTab: "tab",
  // Render settings
  ambientIntensity: "ambient_intensity",
  directIntensity: "direct_intensity",
  metalness: "metalness",
  roughness: "roughness",
  edgeColor: "default_edgecolor",
  defaultOpacity: "default_opacity",
  // Control settings
  zoomSpeed: "zoom_speed",
  panSpeed: "pan_speed",
  rotateSpeed: "rotate_speed",
  holroyd: "holroyd",
  // Clipping settings
  clipIntersection: "clip_intersection",
  clipObjectColors: "clip_object_colors",
  clipPlaneHelpers: "clip_planes",
  clipSlider0: "clip_slider_0",
  clipSlider1: "clip_slider_1",
  clipSlider2: "clip_slider_2",
  clipNormal0: "clip_normal_0",
  clipNormal1: "clip_normal_1",
  clipNormal2: "clip_normal_2",
  // Zebra settings
  zebraCount: "zebra_count",
  zebraOpacity: "zebra_opacity",
  zebraDirection: "zebra_direction",
  zebraColorScheme: "zebra_color_scheme",
  zebraMappingMode: "zebra_mapping_mode",
  // Animation/Explode slider (shared state, mutually exclusive modes)
  animationSliderValue: "relative_time",
};

/**
 * Transform functions for notification values.
 * Converts internal state values to external notification format.
 */
const STATE_NOTIFICATION_TRANSFORM: Partial<Record<StateKey, (v: unknown) => unknown>> = {
  // Slider stores 0-1000, but notifications should be 0-1
  animationSliderValue: (v) => (v as number) / 1000,
};

/**
 * Compare two values for equality (handles arrays)
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

/**
 * Resolve theme input to actual theme value
 */
function resolveTheme(inputTheme: ThemeInput | undefined): Theme | undefined {
  if (inputTheme === "dark") return "dark";
  if (inputTheme === "light") return "light";
  if (
    inputTheme === "browser" &&
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return undefined;
}

/**
 * Centralized state management for the viewer.
 *
 * ViewerState is the single source of truth for all viewer configuration:
 * - Display settings (theme, dimensions, tools enabled)
 * - Render settings (lighting, materials)
 * - View settings (camera, clipping, grid)
 * - Runtime state (active tool, animation)
 *
 * ## Observable Pattern
 * State changes can be observed via `subscribe()`:
 * ```typescript
 * const unsubscribe = state.subscribe("axes", (change) => {
 *   console.log(`axes changed from ${change.old} to ${change.new}`);
 * });
 * ```
 *
 * ## Key Methods
 * - `get(key)`: Get current value
 * - `set(key, value)`: Set value (triggers subscribers)
 * - `subscribe(key, callback)`: Subscribe to changes
 * - `subscribeAll(callback)`: Subscribe to all changes
 *
 * ## Default Values
 * - `DISPLAY_DEFAULTS`: Theme, dimensions, tools
 * - `RENDER_DEFAULTS`: Lighting, materials
 * - `VIEWER_DEFAULTS`: Camera, clipping, grid
 *
 * @internal - This is an internal class used by Viewer
 */
class ViewerState {
  /**
   * Default values for display configuration
   */
  static DISPLAY_DEFAULTS: DisplayDefaults = {
    theme: "light",
    cadWidth: 800,
    treeWidth: 250,
    treeHeight: 400,
    height: 600,
    pinning: false,
    glass: false,
    tools: true,
    keymap: {
      shift: "shiftKey", ctrl: "ctrlKey", meta: "metaKey", alt: "altKey",
      axes: "a", axes0: "A", grid: "g", gridxy: "G", perspective: "p", transparent: "t", blackedges: "b",
      reset: "R", resize: "r",
      iso: "5", front: "1", rear: "3", top: "8", bottom: "2", left: "4", right: "6",
      explode: "x", zscale: "L", distance: "D", properties: "P", select: "S", help: "h", play: " ", stop: "Escape",
      tree: "T", clip: "C", material: "M", zebra: "Z",
    },
    newTreeBehavior: true,
    measureTools: true,
    selectTool: true,
    explodeTool: true,
    zscaleTool: false,
    zebraTool: true,
    measurementDebug: false,
  };

  /**
   * Default values for render configuration
   */
  static RENDER_DEFAULTS: RenderDefaults = {
    ambientIntensity: 1,
    directIntensity: 1.1,
    metalness: 0.3,
    roughness: 0.65,
    defaultOpacity: 0.5,
    edgeColor: 0x707070,
    normalLen: 0,
  };

  /**
   * Default values for viewer/view configuration
   */
  static VIEWER_DEFAULTS: ViewerDefaults = {
    axes: false,
    axes0: false,
    grid: [false, false, false],
    ortho: true,
    transparent: false,
    blackEdges: false,
    collapse: CollapseState.COLLAPSED,
    clipIntersection: false,
    clipPlaneHelpers: false,
    clipObjectColors: false,
    clipNormal0: new THREE.Vector3(-1, 0, 0),
    clipNormal1: new THREE.Vector3(0, -1, 0),
    clipNormal2: new THREE.Vector3(0, 0, -1),
    clipSlider0: -1,
    clipSlider1: -1,
    clipSlider2: -1,
    control: "orbit",
    holroyd: true,
    up: "Z",
    ticks: 10,
    gridFontSize: 10,
    centerGrid: false,
    position: null,
    quaternion: null,
    target: null,
    zoom: 1,
    panSpeed: 1.0,
    rotateSpeed: 1.0,
    zoomSpeed: 1.0,
    timeit: false,
  };

  /**
   * Zebra tool settings
   */
  static ZEBRA_DEFAULTS: ZebraDefaults = {
    zebraCount: 9,
    zebraOpacity: 1.0,
    zebraDirection: 0,
    zebraColorScheme: "blackwhite",
    zebraMappingMode: "reflection",
  };

  /**
   * Runtime state (not from options, changes during execution)
   */
  static RUNTIME_DEFAULTS: RuntimeDefaults = {
    activeTool: null,
    animationMode: "none",
    animationSliderValue: 0,
    zscaleActive: false,
    highlightedButton: null,
    activeTab: "tree",
  };

  private _state: StateShape;
  private _listeners: Map<StateKey, StateSubscriber<unknown>[]>;
  private _globalListeners: GlobalStateSubscriber[];
  private _externalNotifyCallback: ((
    input: ExternalNotification | ExternalNotification[]
  ) => void) | null = null;

  /**
   * Create a ViewerState instance
   */
  constructor(options: ViewerStateOptions = {}) {
    // Start with all defaults
    this._state = {
      ...ViewerState.DISPLAY_DEFAULTS,
      ...ViewerState.RENDER_DEFAULTS,
      ...ViewerState.VIEWER_DEFAULTS,
      ...ViewerState.ZEBRA_DEFAULTS,
      ...ViewerState.RUNTIME_DEFAULTS,
    };

    // Handle special theme logic (browser theme detection)
    const resolvedTheme = resolveTheme(options.theme);
    if (resolvedTheme) {
      this._state.theme = resolvedTheme;
    }

    // Apply user options (with validation)
    this._applyOptions(options);

    this._listeners = new Map();
    this._globalListeners = [];
  }

  /**
   * Apply options to state, validating keys
   */
  private _applyOptions(options: ViewerStateOptions): void {
    for (const key of Object.keys(options)) {
      if (key === "theme") continue; // Already handled
      if (!isStateKey(key)) {
        logger.warn(`Unknown option "${key}" - ignored`);
        continue;
      }
      const value = options[key];
      if (value !== undefined) {
        // Type-safe assignment using Object.assign for the single property
        Object.assign(this._state, { [key]: value });
      }
    }
  }

  /**
   * Get a state value
   */
  get<K extends StateKey>(key: K): StateShape[K] {
    return this._state[key];
  }

  /**
   * Set a state value and notify listeners
   */
  set<K extends StateKey>(key: K, value: StateShape[K], notify: boolean = true): void {
    const oldValue = this._state[key];

    // Skip if value hasn't changed
    if (valuesEqual(oldValue, value)) return;

    this._state[key] = value;

    if (notify) {
      this._notify(key, { old: oldValue, new: value });
    }
  }

  /**
   * Update multiple state values at once
   */
  private _update(updates: Partial<StateShape>, notify: boolean = true): void {
    const changes: Array<{ key: StateKey; change: StateChange<unknown> }> = [];

    for (const key of Object.keys(updates)) {
      if (!isStateKey(key)) continue;
      const value = updates[key];
      if (value === undefined) continue;

      const oldValue = this._state[key];
      if (!valuesEqual(oldValue, value)) {
        Object.assign(this._state, { [key]: value });
        changes.push({ key, change: { old: oldValue, new: value } });
      }
    }

    if (notify) {
      for (const { key, change } of changes) {
        this._notify(key, change);
      }
    }
  }

  /**
   * Update render state from RenderOptions.
   * RenderOptions types are directly compatible with StateShape.
   */
  updateRenderState(options: RenderOptions, notify: boolean = true): void {
    this._update(options, notify);
  }

  /**
   * Update viewer state from ViewerOptions.
   * Converts Vector3Tuple/QuaternionTuple to THREE objects.
   */
  updateViewerState(options: ViewerOptions, notify: boolean = true): void {
    // Extract properties that need conversion to THREE objects
    const { clipNormal0, clipNormal1, clipNormal2, position, quaternion, target, ...rest } = options;

    const converted: Partial<StateShape> = { ...rest };

    // Convert tuple values to THREE objects
    if (clipNormal0 !== undefined) {
      converted.clipNormal0 = new THREE.Vector3(...clipNormal0);
    }
    if (clipNormal1 !== undefined) {
      converted.clipNormal1 = new THREE.Vector3(...clipNormal1);
    }
    if (clipNormal2 !== undefined) {
      converted.clipNormal2 = new THREE.Vector3(...clipNormal2);
    }
    if (position !== undefined) {
      converted.position = position ? new THREE.Vector3(...position) : null;
    }
    if (quaternion !== undefined) {
      converted.quaternion = quaternion ? new THREE.Quaternion(...quaternion) : null;
    }
    if (target !== undefined) {
      converted.target = target ? new THREE.Vector3(...target) : null;
    }

    this._update(converted, notify);
  }

  /**
   * Get all state as a plain object (for serialization)
   */
  getAll(): StateShape {
    return { ...this._state };
  }

  /**
   * Subscribe to changes for a specific state key
   */
  subscribe<K extends StateKey>(
    key: K,
    listener: StateSubscriber<StateShape[K]>,
    options: SubscribeOptions = {}
  ): () => void {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, []);
    }
    this._listeners.get(key)!.push(listener as StateSubscriber<unknown>);

    // Immediately invoke with current value if requested
    if (options.immediate) {
      const currentValue = this._state[key];
      listener({ old: undefined, new: currentValue });
    }

    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(key);
      if (listeners) {
        const index = listeners.indexOf(listener as StateSubscriber<unknown>);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Subscribe to all state changes
   */
  subscribeAll(listener: GlobalStateSubscriber): () => void {
    this._globalListeners.push(listener);

    return () => {
      const index = this._globalListeners.indexOf(listener);
      if (index > -1) {
        this._globalListeners.splice(index, 1);
      }
    };
  }

  /**
   * Set a callback for external notifications (e.g., to notify external clients).
   * The callback receives the notification key (snake_case) and the change object.
   */
  setExternalNotifyCallback(
    callback: ((input: ExternalNotification | ExternalNotification[]) => void) | null
  ): void {
    this._externalNotifyCallback = callback;
  }

  private _notify(key: StateKey, change: StateChange<unknown>): void {
    // Notify key-specific listeners (internal UI updates)
    const listeners = this._listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        listener(change);
      }
    }

    // Notify global listeners (internal)
    for (const listener of this._globalListeners) {
      listener(key, change);
    }

    // Notify external callback if registered and key has a notification mapping
    if (this._externalNotifyCallback) {
      const notificationKey = STATE_TO_NOTIFICATION_KEY[key];
      if (notificationKey) {
        // Apply transform if defined (e.g., slider 0-1000 → relative 0-1)
        const transform = STATE_NOTIFICATION_TRANSFORM[key];
        const notifyChange = transform
          ? { old: change.old != null ? transform(change.old) : null, new: transform(change.new) }
          : change;
        this._externalNotifyCallback({ key: notificationKey, change: notifyChange });
      }
    }
  }

  /**
   * Reset state to default values
   */
  reset(options: ViewerStateOptions = {}): void {
    const oldState = { ...this._state };

    // Reset to all defaults
    this._state = {
      ...ViewerState.DISPLAY_DEFAULTS,
      ...ViewerState.RENDER_DEFAULTS,
      ...ViewerState.VIEWER_DEFAULTS,
      ...ViewerState.ZEBRA_DEFAULTS,
      ...ViewerState.RUNTIME_DEFAULTS,
    };

    // Handle special theme logic
    const resolvedTheme = resolveTheme(options.theme);
    if (resolvedTheme) {
      this._state.theme = resolvedTheme;
    }

    // Apply options
    this._applyOptions(options);

    // Notify all changes
    for (const key of Object.keys(this._state)) {
      if (!isStateKey(key)) continue;
      if (!valuesEqual(oldState[key], this._state[key])) {
        this._notify(key, { old: oldState[key], new: this._state[key] });
      }
    }
  }

  /**
   * Get all default values (useful for documentation/debugging)
   */
  static getDefaults(): StateShape {
    return {
      ...ViewerState.DISPLAY_DEFAULTS,
      ...ViewerState.RENDER_DEFAULTS,
      ...ViewerState.VIEWER_DEFAULTS,
      ...ViewerState.ZEBRA_DEFAULTS,
      ...ViewerState.RUNTIME_DEFAULTS,
    };
  }

  /**
   * Dump all state values to console, organized by category
   */
  dump(): void {
    const logCategory = (name: string, defaults: Partial<StateShape>): void => {
      logger.info(`${name}:`);
      for (const key of Object.keys(defaults)) {
        logger.info(`- ${key}`, this._state[key as StateKey]);
      }
    };

    logCategory("Display", ViewerState.DISPLAY_DEFAULTS);
    logCategory("Render", ViewerState.RENDER_DEFAULTS);
    logCategory("View", ViewerState.VIEWER_DEFAULTS);
    logCategory("Zebra", ViewerState.ZEBRA_DEFAULTS);
    logCategory("Runtime", ViewerState.RUNTIME_DEFAULTS);
  }
}

export { ViewerState };
export type { StateShape, StateKey, ViewerStateOptions };
