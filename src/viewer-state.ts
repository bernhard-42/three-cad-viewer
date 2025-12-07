import type {
  Theme,
  ThemeInput,
  ControlType,
  UpDirection,
  AnimationMode,
  ActiveTab,
  ZebraColorScheme,
  ZebraMappingMode,
  Vector3,
  Quaternion,
  StateChange,
  StateSubscriber,
  GlobalStateSubscriber,
  SubscribeOptions,
} from "./types";

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
  keymap: { shift: string; ctrl: string; meta: string };
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
  collapse: number;
  clipIntersection: boolean;
  clipPlaneHelpers: boolean;
  clipObjectColors: boolean;
  clipNormal0: Vector3;
  clipNormal1: Vector3;
  clipNormal2: Vector3;
  clipSlider0: number;
  clipSlider1: number;
  clipSlider2: number;
  control: ControlType;
  holroyd: boolean;
  up: UpDirection;
  ticks: number;
  gridFontSize: number;
  centerGrid: boolean;
  position: Vector3 | null;
  quaternion: Quaternion | null;
  target: Vector3 | null;
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
 * Options that can be passed to ViewerState constructor
 */
type ViewerStateOptions = Partial<StateShape> & { theme?: ThemeInput };

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
 * Provides a single source of truth with observable pattern for state changes.
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
    keymap: { shift: "shiftKey", ctrl: "ctrlKey", meta: "metaKey" },
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
    ambientIntensity: 0.5,
    directIntensity: 0.6,
    metalness: 0.7,
    roughness: 0.7,
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
    collapse: 0,
    clipIntersection: false,
    clipPlaneHelpers: false,
    clipObjectColors: false,
    clipNormal0: [-1, 0, 0],
    clipNormal1: [0, -1, 0],
    clipNormal2: [0, 0, -1],
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
        console.warn(`ViewerState: Unknown option "${key}" - ignored`);
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
  update(updates: Partial<StateShape>, notify: boolean = true): void {
    const changes: Array<{ key: StateKey; change: StateChange<unknown> }> = [];

    for (const key of Object.keys(updates) as StateKey[]) {
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
   * Notify listeners of a state change
   */
  private _notify(key: StateKey, change: StateChange<unknown>): void {
    // Notify key-specific listeners
    const listeners = this._listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        listener(change);
      }
    }

    // Notify global listeners
    for (const listener of this._globalListeners) {
      listener(key, change);
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
    for (const key of Object.keys(this._state) as StateKey[]) {
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
    console.log("Display:");
    for (const key of Object.keys(ViewerState.DISPLAY_DEFAULTS) as (keyof DisplayDefaults)[]) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("Render:");
    for (const key of Object.keys(ViewerState.RENDER_DEFAULTS) as (keyof RenderDefaults)[]) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("View:");
    for (const key of Object.keys(ViewerState.VIEWER_DEFAULTS) as (keyof ViewerDefaults)[]) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("Zebra:");
    for (const key of Object.keys(ViewerState.ZEBRA_DEFAULTS) as (keyof ZebraDefaults)[]) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("Runtime:");
    for (const key of Object.keys(ViewerState.RUNTIME_DEFAULTS) as (keyof RuntimeDefaults)[]) {
      console.log(`- ${key}`, this._state[key]);
    }
  }
}

export { ViewerState };
export type { StateShape, StateKey, ViewerStateOptions };
