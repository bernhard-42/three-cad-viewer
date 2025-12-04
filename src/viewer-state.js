/**
 * Centralized state management for the viewer.
 * Provides a single source of truth with observable pattern for state changes.
 *
 * ## Architecture
 *
 * ViewerState is the central configuration owner - all defaults are defined here
 * and both Viewer and Display read from this single source.
 *
 * **Data Flow (unidirectional):**
 * ```
 * User Action → Display → Viewer method → state.set() → Subscription → UI update
 * ```
 *
 * **Key Principles:**
 * - **Viewer owns mutations**: Only Viewer methods should call state.set()
 * - **Display is read-only**: Display subscribes to state and reads via state.get(),
 *   but never writes state directly. UI actions call Viewer methods instead.
 * - **Subscriptions update UI only**: Subscription handlers update visual state
 *   (button checked, element visibility), they never trigger new state changes.
 *
 * ## Why No Infinite Loops?
 *
 * Subscriptions cannot cause cycles because:
 * 1. Subscription handlers only update UI - they don't call Viewer methods
 * 2. ViewerState.set() has change detection: if oldValue === newValue, no notification
 *
 * Example flow for tools button:
 * ```
 * User clicks "Tools" → Display calls viewer.setTools(true)
 *                              ↓
 *                       Viewer: state.set("tools", true)
 *                              ↓
 *                       State notifies subscribers
 *                              ↓
 *                       Display subscription: showTools(true) [UI only]
 *                              ↓
 *                       STOP - no action triggered
 * ```
 *
 * Even if showTools() somehow tried state.set("tools", true) again,
 * the oldValue === newValue check would prevent notification.
 */
class ViewerState {
  /**
   * Default values for display configuration
   * @static
   */
  static DISPLAY_DEFAULTS = {
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
   * @static
   */
  static RENDER_DEFAULTS = {
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
   * @static
   */
  static VIEWER_DEFAULTS = {
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
    up: "Z",
    ticks: 10,
    gridFontSize: 10,
    centerGrid: false,
    position: null,
    quaternion: null,
    target: null,
    zoom: 1,
    panSpeed: 0.5,
    rotateSpeed: 1.0,
    zoomSpeed: 0.5,
    timeit: false,
  };

  /**
   * Zebra tool settings
   * @static
   */
  static ZEBRA_DEFAULTS = {
    zebraCount: 9,
    zebraOpacity: 1.0,
    zebraDirection: 0,
    zebraColorScheme: "blackwhite",
    zebraMappingMode: "reflection",
  };

  /**
   * Runtime state (not from options, changes during execution)
   * @static
   */
  static RUNTIME_DEFAULTS = {
    activeTool: null,
    // Animation/Explode slider control: "none" | "animation" | "explode"
    animationMode: "none",
    animationSliderValue: 0,
    // ZScale toolbar state
    zscaleActive: false,
    // Camera button highlight
    highlightedButton: null,
    // Active sidebar tab: "tree" | "clip" | "material" | "zebra"
    activeTab: "tree",
  };

  /**
   * Create a ViewerState instance
   * @param {Object} [options={}] - User-provided options that override defaults
   */
  constructor(options = {}) {
    // Start with all defaults
    this._state = {
      ...ViewerState.DISPLAY_DEFAULTS,
      ...ViewerState.RENDER_DEFAULTS,
      ...ViewerState.VIEWER_DEFAULTS,
      ...ViewerState.ZEBRA_DEFAULTS,
      ...ViewerState.RUNTIME_DEFAULTS,
    };

    // Handle special theme logic (browser theme detection)
    if (
      options.theme === "dark" ||
      (options.theme === "browser" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      this._state.theme = "dark";
    } else if (options.theme === "light") {
      this._state.theme = "light";
    }
    // Remove theme from options so it doesn't override the processed value
    // eslint-disable-next-line no-unused-vars
    const { theme, ...restOptions } = options;

    // Apply user options (with validation)
    for (const [key, value] of Object.entries(restOptions)) {
      if (this._state[key] === undefined) {
        console.warn(`ViewerState: Unknown option "${key}" - ignored`);
      } else {
        this._state[key] = value;
      }
    }

    this._listeners = new Map();
    this._globalListeners = [];
  }

  /**
   * Get a state value
   * @param {string} key - State key
   * @returns {*} The state value
   */
  get(key) {
    return this._state[key];
  }

  /**
   * Set a state value and notify listeners
   * @param {string} key - State key
   * @param {*} value - New value
   * @param {boolean} [notify=true] - Whether to notify listeners
   */
  set(key, value, notify = true) {
    const oldValue = this._state[key];

    // Skip if value hasn't changed (shallow comparison)
    if (oldValue === value) return;

    // For arrays, do deep comparison
    if (Array.isArray(oldValue) && Array.isArray(value)) {
      if (
        oldValue.length === value.length &&
        oldValue.every((v, i) => v === value[i])
      ) {
        return;
      }
    }

    this._state[key] = value;

    if (notify) {
      this._notify(key, { old: oldValue, new: value });
    }
  }

  /**
   * Update multiple state values at once
   * @param {Object} updates - Object with key-value pairs to update
   * @param {boolean} [notify=true] - Whether to notify listeners
   */
  update(updates, notify = true) {
    const changes = {};

    for (const [key, value] of Object.entries(updates)) {
      const oldValue = this._state[key];
      if (oldValue !== value) {
        this._state[key] = value;
        changes[key] = { old: oldValue, new: value };
      }
    }

    if (notify && Object.keys(changes).length > 0) {
      for (const [key, change] of Object.entries(changes)) {
        this._notify(key, change);
      }
    }
  }

  /**
   * Get all state as a plain object (for serialization)
   * @returns {Object} Copy of current state
   */
  getAll() {
    return { ...this._state };
  }

  /**
   * Subscribe to changes for a specific state key
   * @param {string} key - State key to watch
   * @param {Function} listener - Callback function(change) where change = {old, new}
   * @param {Object} [options={}] - Subscription options
   * @param {boolean} [options.immediate=false] - If true, immediately invoke listener with current value
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, listener, options = {}) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, []);
    }
    this._listeners.get(key).push(listener);

    // Immediately invoke with current value if requested
    if (options.immediate) {
      const currentValue = this._state[key];
      listener({ old: undefined, new: currentValue });
    }

    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(key);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to all state changes
   * @param {Function} listener - Callback function(key, change)
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(listener) {
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
   * @private
   * @param {string} key - State key that changed
   * @param {Object} change - Change object {old, new}
   */
  _notify(key, change) {
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
   * @param {Object} [options={}] - Options to apply after reset (same as constructor)
   */
  reset(options = {}) {
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
    if (
      options.theme === "dark" ||
      (options.theme === "browser" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      this._state.theme = "dark";
    } else if (options.theme === "light") {
      this._state.theme = "light";
    }
    // eslint-disable-next-line no-unused-vars
    const { theme: _theme, ...restOptions } = options;

    // Apply options
    for (const [key, value] of Object.entries(restOptions)) {
      if (this._state[key] !== undefined) {
        this._state[key] = value;
      }
    }

    // Notify all changes
    for (const key of Object.keys(this._state)) {
      if (oldState[key] !== this._state[key]) {
        this._notify(key, { old: oldState[key], new: this._state[key] });
      }
    }
  }

  /**
   * Get all default values (useful for documentation/debugging)
   * @returns {Object} All default values
   */
  static getDefaults() {
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
  dump() {
    console.log("Display:");
    for (const key of Object.keys(ViewerState.DISPLAY_DEFAULTS)) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("Render:");
    for (const key of Object.keys(ViewerState.RENDER_DEFAULTS)) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("View:");
    for (const key of Object.keys(ViewerState.VIEWER_DEFAULTS)) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("Zebra:");
    for (const key of Object.keys(ViewerState.ZEBRA_DEFAULTS)) {
      console.log(`- ${key}`, this._state[key]);
    }

    console.log("Runtime:");
    for (const key of Object.keys(ViewerState.RUNTIME_DEFAULTS)) {
      console.log(`- ${key}`, this._state[key]);
    }
  }
}

export { ViewerState };
