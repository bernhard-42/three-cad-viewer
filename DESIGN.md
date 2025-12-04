# Three-CAD-Viewer Design Document

This document describes the architecture, patterns, and key concepts of the three-cad-viewer library. It is intended for developers who need to understand, maintain, or extend the codebase.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Classes](#core-classes)
3. [Design Patterns](#design-patterns)
4. [UI Interaction Flows](#ui-interaction-flows)
5. [Memory Management](#memory-management)
6. [File Structure](#file-structure)

---

## Architecture Overview

Three-cad-viewer is a WebGL-based CAD viewer built on Three.js. The architecture follows these principles:

- **Unidirectional data flow**: State changes flow from user actions through Viewer to ViewerState, then notify Display via subscriptions
- **Separation of concerns**: Model (state) and View (DOM/rendering) are decoupled
- **Factory patterns**: Materials and specialized objects are created through factories
- **Consistent disposal**: All components implement proper cleanup to prevent memory leaks

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Display                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ Toolbar  │  │ TreeView │  │ Sliders  │  │ Tabs (clip/material) │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘ │
└───────┼─────────────┼────────────┼────────────────────┼─────────────┘
        │             │            │                    │
        │  User actions call Viewer methods             │
        ▼             ▼            ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              Viewer                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐  │
│  │  Camera  │  │ Controls │  │ Clipping │  │ Scene (NestedGroup) │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────────────┘  │
│                       │                                             │
│                       ▼                                             │
│              ┌─────────────────┐                                    │
│              │   ViewerState   │ ◄──── Single source of truth       │
│              └────────┬────────┘                                    │
└───────────────────────┼─────────────────────────────────────────────┘
                        │
         Subscriptions notify Display of state changes
                        │
                        ▼
              ┌─────────────────┐
              │  UI Updates     │
              │  (via Display)  │
              └─────────────────┘
```

---

## Core Classes

### Entry Points

| Class | File | Purpose |
|-------|------|---------|
| **Display** | `display.js` | Main entry point. Creates DOM structure, toolbar, sliders, and subscribes to ViewerState. |
| **Viewer** | `viewer.js` | WebGL renderer, scene management, and state mutations. All state changes go through Viewer. |

### State Management

| Class | File | Purpose |
|-------|------|---------|
| **ViewerState** | `viewer-state.js` | Centralized state with observable pattern. Stores all configuration and runtime state. |

### Scene Components

| Class | File | Purpose |
|-------|------|---------|
| **NestedGroup** | `nestedgroup.js` | Manages hierarchical CAD object scene graph. Coordinates ObjectGroups. |
| **ObjectGroup** | `objectgroup.js` | THREE.Group subclass for individual CAD shapes (faces, edges, vertices). |
| **MaterialFactory** | `material-factory.js` | Factory for creating Three.js materials with consistent CAD settings. |

### Clipping System

| Class | File | Purpose |
|-------|------|---------|
| **Clipping** | `clipping.js` | Manages 3 clipping planes, stencil rendering, and visual helpers. |
| **ClippingMaterials** | `clipping.js` | Static factory for clipping-related materials (stencil, plane helpers). |
| **CenteredPlane** | `clipping.js` | THREE.Plane subclass with center-relative constant. |
| **PlaneMesh** | `clipping.js` | Visual representation of clipping plane. |

### Tree Navigation

| Class | File | Purpose |
|-------|------|---------|
| **TreeView** | `treeview.js` | DOM rendering, event handling, lazy rendering for object tree. |
| **TreeModel** | `tree-model.js` | Tree data structure, traversal, state management (decoupled from DOM). |

### Camera and Controls

| Class | File | Purpose |
|-------|------|---------|
| **Camera** | `camera.js` | Manages orthographic and perspective cameras. |
| **Controls** | `controls.js` | Wraps OrbitControls and TrackballControls for camera manipulation. |
| **CameraControls** | `controls/CameraControls.js` | Low-level control implementation. |

### UI Components

| Class | File | Purpose |
|-------|------|---------|
| **Toolbar** | `toolbar.js` | Button bar with collapsible groups. |
| **BaseButton** | `toolbar.js` | Base class for toolbar buttons. |
| **Ellipsis** | `toolbar.js` | Overflow indicator for collapsed toolbar groups. |
| **Slider** | `slider.js` | Reusable slider component for numeric values. |

### Visualization Helpers

| Class | File | Purpose |
|-------|------|---------|
| **Grid** | `grid.js` | XY/XZ/YZ grid planes with labels. |
| **Axes** | `axes.js` | XYZ axis indicators. |
| **BoundingBox** | `bbox.js` | Visual bounding box display. |
| **Info** | `info.js` | Object information overlay. |
| **OrientationMarker** | `orientation.js` | 3D orientation cube in corner. |

### CAD Tools

| Class | File | Purpose |
|-------|------|---------|
| **CadTool** | `cad_tools/tools.js` | Tool manager for measurement, selection, properties. |
| **Raycaster** | `raycast.js` | Mouse-based object picking with topology filtering. |
| **PickedObject** | `raycast.js` | Represents a picked object (shape or solid). |
| **DistanceLineArrow** | `cad_tools/measure.js` | Measurement visualization. |
| **Zebra** | `cad_tools/zebra.js` | Zebra stripe surface analysis tool. |
| **Select** | `cad_tools/select.js` | Object selection tool. |

### Animation

| Class | File | Purpose |
|-------|------|---------|
| **Animation** | `animation.js` | THREE.js AnimationMixer integration for CAD animations. |

### Utilities

| Class/Function | File | Purpose |
|----------------|------|---------|
| **EventListenerManager** | `utils.js` | Tracks DOM event listeners for proper cleanup. |
| **KeyMapper** | `utils.js` | Maps keyboard modifiers to actions. |
| **deepDispose** | `utils.js` | Recursively disposes Three.js objects. |
| **disposeGeometry** | `utils.js` | Disposes geometry and its attributes. |
| **disposeMaterial** | `utils.js` | Disposes material and its textures. |

---

## Design Patterns

### 1. ViewerState Observable Pattern

ViewerState is the single source of truth for all configuration. It uses an observable pattern where:

1. **Viewer owns mutations**: Only Viewer methods call `state.set()`
2. **Display is read-only**: Display subscribes to state and reads via `state.get()`, but never writes directly
3. **Subscriptions update UI only**: Callbacks update visual state, never trigger new state changes

```javascript
// ViewerState usage
class ViewerState {
  static VIEWER_DEFAULTS = {
    axes: false,
    grid: [false, false, false],
    ortho: true,
    // ... more defaults
  };

  constructor(options = {}) {
    this._state = { ...ViewerState.VIEWER_DEFAULTS };
    this._listeners = new Map();
  }

  get(key) {
    return this._state[key];
  }

  set(key, value, notify = true) {
    const oldValue = this._state[key];
    if (oldValue === value) return; // Change detection prevents infinite loops
    this._state[key] = value;
    if (notify) this._notify(key, { old: oldValue, new: value });
  }

  subscribe(key, listener, options = {}) {
    // ... adds listener, returns unsubscribe function
    // options.immediate: true fires immediately with current value
  }
}
```

**Why no infinite loops?**

1. Subscription handlers only update UI - they don't call Viewer methods
2. `ViewerState.set()` has change detection: if `oldValue === newValue`, no notification

### 2. TreeModel/TreeView Separation

The tree navigation is split into two classes:

- **TreeModel**: Pure data/logic (no DOM)
  - Tree structure and traversal
  - State management (selected/unselected/mixed)
  - Parent/child state propagation

- **TreeView**: DOM and events
  - Lazy rendering (only renders visible nodes)
  - Event handlers
  - Delegates to TreeModel for state operations

```javascript
// TreeModel handles state, notifies via callback
const model = new TreeModel(treeData, {
  onStateChange: (node, iconNumber) => {
    // TreeView updates DOM for this node
  }
});

// TreeView delegates state changes to model
handleIconClick(node, iconNumber) {
  this.model.toggleNodeState(node, iconNumber);
  // Model's onStateChange callback updates the DOM
}
```

### 3. MaterialFactory Pattern

Materials are created through `MaterialFactory` for consistency:

```javascript
class MaterialFactory {
  constructor(options) {
    this.metalness = options.metalness ?? 0.7;
    this.roughness = options.roughness ?? 0.7;
    // ...
  }

  createFrontFaceMaterial({ color, alpha, visible = true }) {
    return new THREE.MeshStandardMaterial({
      ...this._createBaseProps(alpha),
      color, metalness: this.metalness, roughness: this.roughness,
      side: THREE.FrontSide, visible
    });
  }

  createEdgeMaterial({ lineWidth, color, resolution }) { /* ... */ }
  createVertexMaterial({ size, color }) { /* ... */ }
}
```

Similarly, `ClippingMaterials` provides static methods for stencil-related materials.

### 4. deepDispose Pattern

Three.js requires explicit cleanup of geometries, materials, and textures. The `deepDispose` function handles this recursively:

```javascript
function deepDispose(tree) {
  if (!tree) return;

  // Recurse into children first
  if (Array.isArray(tree.children)) {
    tree.children.forEach(deepDispose);
  }

  // Handle different object types
  if (tree.dispose) {
    tree.dispose();
  } else if (Array.isArray(tree)) {
    tree.forEach(deepDispose);
  } else if (tree.isMesh || tree.isLine || tree.isPoints) {
    disposeMesh(tree);
  }
}

function disposeMesh(mesh) {
  if (mesh.geometry) disposeGeometry(mesh.geometry);
  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(mesh.material);
    }
  }
}

function disposeMaterial(material) {
  // Dispose all texture properties
  const textureProps = ['map', 'normalMap', 'roughnessMap', /* ... */];
  for (const prop of textureProps) {
    if (material[prop]) material[prop].dispose();
  }
  material.dispose();
}
```

### 5. EventListenerManager Pattern

DOM event listeners must be tracked for proper cleanup. `EventListenerManager` centralizes this:

```javascript
class EventListenerManager {
  constructor() {
    this.listeners = [];
  }

  add(target, event, handler, options = false) {
    target.addEventListener(event, handler, options);
    this.listeners.push({ target, event, handler, options });
  }

  dispose() {
    this.listeners.forEach(({ target, event, handler, options }) => {
      target.removeEventListener(event, handler, options);
    });
    this.listeners = [];
  }
}

// Usage in Display
const listeners = new EventListenerManager();
listeners.add(element, 'click', this.handleClick);
listeners.add(window, 'resize', this.handleResize);

// In dispose()
listeners.dispose();
```

UI components (Toolbar, Slider, Button) also implement `dispose()` methods that remove their event listeners.

---

## UI Interaction Flows

This section documents all UI interactions and categorizes them by their data flow pattern.

### Summary

| Category | Count | Examples | Description |
|----------|-------|----------|-------------|
| **STATE SUBSCRIPTION** | 20 | axes, grid, clip settings, material sliders, zebra, animationMode | State change → subscription → UI update |
| **ACTION** | 6 | reset, resize, pin | One-time actions, no state change |
| **TOOL** | 4 | measure, zscale | Separate subsystems with own state |
| **TRANSIENT** | 3 | view buttons, help | Derived/temporary visual indicators |

### Data Flow Patterns

**STATE SUBSCRIPTION** (configuration state):
```
User Action → Display → Viewer method → state.set() → Subscription → UI update
```

**ACTION** (no state change):
```
User Action → Display → Viewer method → performs action (no state)
```

### STATE SUBSCRIPTION (Configuration State)

These follow the preferred pattern with subscription-based UI updates.

#### 1. Axes Button
- **Display handler**: `setAxes(name, flag)` → calls `this.viewer.setAxes(flag)`
- **Viewer method**: `setAxes()` → `this.state.set("axes", flag)`
- **Subscription**: `state.subscribe("axes", ...)` → updates button

#### 2. Axes0 Button
- **Display handler**: `setAxes0(name, flag)` → calls `this.viewer.setAxes0(flag)`
- **Viewer method**: `setAxes0()` → `this.state.set("axes0", flag)`
- **Subscription**: `state.subscribe("axes0", ...)` → updates button

#### 3. Grid Button
- **Display handler**: `setGrid(name, flag)` → calls `this.viewer.setGrid(name, flag)`
- **Viewer method**: `setGrid()` → `this.state.set("grid", [...gridHelper.grid])`
- **Subscription**: `state.subscribe("grid", ..., { immediate: true })` → updates button and checkboxes
- **Note**: Arrays are copied to avoid reference issues

#### 4. Perspective Button
- **Display handler**: `setOrtho(name, flag)` → calls `this.viewer.switchCamera(!flag)`
- **Viewer method**: `switchCamera()` → `this.state.set("ortho", flag)`
- **Subscription**: `state.subscribe("ortho", ...)` → updates button

#### 5. Transparent Button
- **Display handler**: `setTransparent(name, flag)` → calls `this.viewer.setTransparent(flag)`
- **Viewer method**: `setTransparent()` → `this.state.set("transparent", flag)`
- **Subscription**: `state.subscribe("transparent", ...)` → updates button

#### 6. Black Edges Button
- **Display handler**: `setBlackEdges(name, flag)` → calls `this.viewer.setBlackEdges(flag)`
- **Viewer method**: `setBlackEdges()` → `this.state.set("blackEdges", flag)`
- **Subscription**: `state.subscribe("blackEdges", ...)` → updates button

#### 7. Tools (toolbar visibility)
- **Viewer method**: `setTools()` → `this.state.set("tools", flag)`
- **Subscription**: `state.subscribe("tools", ...)` → calls `showTools()`

#### 8. Glass Mode
- **Viewer method**: `setGlass()` → `this.state.set("glass", flag)`
- **Subscription**: `state.subscribe("glass", ...)` → calls `glassMode()`

#### 9. Theme
- **Subscription**: `state.subscribe("theme", ...)` → calls `setTheme()`

#### 10. Clip Plane Helpers Checkbox
- **Display handler**: `setClipPlaneHelpers(flag)` → calls `this.viewer.setClipPlaneHelpers(flag)`
- **Viewer method**: `setClipPlaneHelpers()` → `this.state.set("clipPlaneHelpers", flag)`
- **Subscription**: `state.subscribe("clipPlaneHelpers", ..., { immediate: true })` → updates checkbox

#### 11. Clip Intersection Checkbox
- **Display handler**: `setClipIntersection(flag)` → calls `this.viewer.setClipIntersection(flag)`
- **Viewer method**: `setClipIntersection()` → `this.state.set("clipIntersection", flag)`
- **Subscription**: `state.subscribe("clipIntersection", ...)` → updates checkbox

#### 12. Clip Object Color Caps Checkbox
- **Display handler**: `setObjectColorCaps(flag)` → calls `this.viewer.setClipObjectColorCaps(flag)`
- **Viewer method**: `setClipObjectColorCaps()` → `this.state.set("clipObjectColors", flag)`
- **Subscription**: `state.subscribe("clipObjectColors", ...)` → updates checkbox

#### 13. Clip Plane Sliders (1, 2, 3)
- **Display handler**: `refreshPlane(index, value)` → calls `this.viewer.refreshPlane(index, value)`
- **Viewer method**: `setClipSlider()` → `this.state.set("clipSlider{index}", value)`
- **Subscription**: `state.subscribe("clipSlider{0,1,2}", ...)` → updates slider via `setValueFromState()`

#### 14. Material Sliders (ambient, direct, metalness, roughness)
- **Display handler**: Uses `Slider` class with `handler` pointing to viewer methods
- **Viewer methods**: `setAmbientLight()`, `setDirectLight()`, `setMetalness()`, `setRoughness()`
- **State**: All call `state.set()` for their respective keys
- **Subscription**: `state.subscribe("{key}", ..., { immediate: true })` → updates slider

#### 15. Zebra Count Slider
- **Display handler**: Uses `Slider` class with `handler` pointing to `viewer.setZebraCount`
- **Viewer method**: `setZebraCount()` → `this.state.set("zebraCount", value)`
- **Subscription**: `state.subscribe("zebraCount", ...)` → updates slider via `setValueFromState()`

#### 16. Zebra Opacity Slider
- **Display handler**: Uses `Slider` class with `handler` pointing to `viewer.setZebraOpacity`
- **Viewer method**: `setZebraOpacity()` → `this.state.set("zebraOpacity", value)`
- **Subscription**: `state.subscribe("zebraOpacity", ...)` → updates slider via `setValueFromState()`

#### 17. Zebra Direction Slider
- **Display handler**: Uses `Slider` class with `handler` pointing to `viewer.setZebraDirection`
- **Viewer method**: `setZebraDirection()` → `this.state.set("zebraDirection", value)`
- **Subscription**: `state.subscribe("zebraDirection", ...)` → updates slider via `setValueFromState()`

#### 18. Zebra Color Scheme Radio Buttons
- **Display handler**: `setZebraColorScheme()` → calls `this.viewer.setZebraColorScheme(value)`
- **Viewer method**: `setZebraColorScheme()` → `this.state.set("zebraColorScheme", value)`
- **Subscription**: `state.subscribe("zebraColorScheme", ...)` → updates radio button

#### 19. Zebra Mapping Mode Radio Buttons
- **Display handler**: `setZebraMappingMode()` → calls `this.viewer.setZebraMappingMode(value)`
- **Viewer method**: `setZebraMappingMode()` → `this.state.set("zebraMappingMode", value)`
- **Subscription**: `state.subscribe("zebraMappingMode", ...)` → updates radio button

#### 20. Animation/Explode Mode (Unified)
- **State**: `animationMode: "none" | "animation" | "explode"`
- **Viewer methods**:
  - `initAnimation()` → `state.set("animationMode", label === "E" ? "explode" : "animation")`
  - `clearAnimation()` → `state.set("animationMode", "none")`
  - `setExplode(flag)` → triggers explode animation or clears it
- **Subscription**: Single `animationMode` subscription handles:
  - Slider visibility: `mode !== "none"`
  - Label text: `mode === "explode" ? "E" : "A"`
  - Explode button state: `mode === "explode"`
- **Related state**: `animationSliderValue` (0-1000 slider position)

### ACTION (No State Change)

These buttons trigger one-time actions. No state is stored or updated.

#### 21. Reset Button
- **Display handler**: `reset()` → calls `this.viewer.reset()`
- **Purpose**: Resets view to initial state

#### 22. Resize Button
- **Display handler**: `resize()` → calls `this.viewer.resize()`
- **Purpose**: Fits object to viewport

#### 23. Pin Button
- **Display handler**: `pinAsPng()` → calls `this.viewer.pinAsPng()`
- **Purpose**: Exports current view as PNG
- **Note**: Uses `display.replaceWithImage()` for encapsulation

#### 24. Material Reset Button
- **Display handler**: `handleMaterialReset()` → calls `this.viewer.resetMaterial()`
- **Purpose**: Resets material to defaults

#### 25. Collapse Node Buttons
- **Display handler**: `handleCollapseNodes()` → calls treeview methods
- **Purpose**: Expand/collapse tree nodes

#### 26. Toggle Info Button
- **Display handler**: `toggleInfo()` → toggles info panel
- **Purpose**: Show/hide info panel

### TRANSIENT (Derived Visual Indicators)

These show temporary visual feedback derived from current state, not stored state.

#### 27. View Buttons (iso, front, rear, top, bottom, left, right)
- **Display handler**: `setView(button)` → calls `this.viewer.presetCamera(button)`
- **State**: `highlightedButton` tracks which button is highlighted
- **Subscription**: `state.subscribe("highlightedButton", ...)` → updates button highlight
- **Note**: Highlight cleared when camera rotates manually

#### 28. Help Button
- **Display handler**: `showHelp(flag)` → toggles help overlay
- **Visual**: Local UI toggle, not viewer state

#### 29. Tab Selection
- **Display handler**: `selectTab(tab)` → switches active tab
- **Note**: Notifies via checkChanges for external consumers

### TOOL (Separate State Management)

These tools have their own state management via `activeTool` and specialized subsystems.

#### 30. Explode Button
- **Display handler**: `setExplode(name, flag)` → calls `this.viewer.setExplode(flag)`
- **Viewer method**: `setExplode()` → manages animation backup/restore, sets `animationMode`
- **State**: Uses unified `animationMode` state
- **Note**: No longer has separate `Display.explodeFlag`

#### 31. ZScale Button
- **Display handler**: `setZScale(name, flag)` → toggles z-scale slider
- **State**: `zscaleActive` in ViewerState
- **Subscription**: `state.subscribe("zscaleActive", ...)` → updates button
- **Slider**: `viewer.setZscaleValue(value)` → runtime transform

#### 32. Distance Tool
- **Display handler**: `setTool("distance", flag)` → enables measurement
- **State**: `activeTool` tracks current tool
- **Subscription**: `state.subscribe("activeTool", ...)` → updates tool buttons

#### 33. Properties Tool
- **Display handler**: `setTool("properties", flag)` → enables property display
- **State**: `activeTool` tracks current tool

#### 34. Select Tool
- **Display handler**: `setTool("select", flag)` → enables selection
- **State**: `activeTool` tracks current tool

### Animation Subsystem

#### 35. Animation Controls (play, pause, stop)
- **Display handler**: `controlAnimation(btn)` → calls `this.viewer.controlAnimation(btn)`
- **Note**: Animation has its own playback state management

#### 36. Animation Slider
- **Display handler**: `animationChange(e)` → calls `this.viewer.animation.setRelativeTime()`
- **State**: `animationSliderValue` synced via subscription
- **Subscription**: `state.subscribe("animationSliderValue", ..., { immediate: true })`

### Data Flow Diagrams

```
                    STATE SUBSCRIPTION (20 cases)
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌──────────────┐
│ Button  │────▶│ Display │────▶│   Viewer    │────▶│ ViewerState  │
│  Click  │     │ handler │     │   method    │     │  state.set() │
└─────────┘     └─────────┘     └─────────────┘     └──────┬───────┘
                                                          │
                    ┌─────────────────────────────────────┘
                    │ subscription notifies Display
                    ▼
              ┌─────────────┐
              │   Display   │
              │  UI update  │
              └─────────────┘


                    ACTION (6 cases)
┌─────────┐     ┌─────────┐     ┌─────────────┐
│ Button  │────▶│ Display │────▶│   Viewer    │────▶ performs action
│  Click  │     │ handler │     │   method    │     (no state change)
└─────────┘     └─────────┘     └─────────────┘


                    TOOL (4 cases)
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌──────────────┐
│ Button  │────▶│ Display │────▶│   Viewer    │────▶│  activeTool  │
│  Click  │     │ handler │     │  setTool()  │     │    state     │
└─────────┘     └─────────┘     └─────────────┘     └──────────────┘
```

### ViewerState Summary

#### DISPLAY_DEFAULTS (UI configuration)
```javascript
theme, cadWidth, treeWidth, treeHeight, height, pinning, glass, tools,
keymap, newTreeBehavior, measureTools, selectTool, explodeTool, zscaleTool, zebraTool
```

#### RENDER_DEFAULTS (material settings)
```javascript
ambientIntensity, directIntensity, metalness, roughness, defaultOpacity, edgeColor, normalLen
```

#### VIEWER_DEFAULTS (view configuration)
```javascript
axes, axes0, grid, ortho, transparent, blackEdges, collapse,
clipIntersection, clipPlaneHelpers, clipObjectColors,
clipNormal0/1/2, clipSlider0/1/2,
control, up, ticks, gridFontSize, centerGrid,
position, quaternion, target, zoom, panSpeed, rotateSpeed, zoomSpeed
```

#### ZEBRA_DEFAULTS (zebra tool)
```javascript
zebraCount, zebraOpacity, zebraDirection, zebraColorScheme, zebraMappingMode
```

#### RUNTIME_DEFAULTS (current session state)
```javascript
activeTool,              // Current measurement tool
animationMode,           // "none" | "animation" | "explode"
animationSliderValue,    // Slider position (0-1000)
zscaleActive,            // ZScale tool active
highlightedButton,       // Camera button highlight
activeTab                // "tree" | "clip" | "material" | "zebra"
```

#### Subscription Options
```javascript
// Standard subscription (fires on change only)
state.subscribe("key", (change) => { ... });

// Immediate subscription (fires immediately with current value, then on changes)
state.subscribe("key", (change) => { ... }, { immediate: true });
```

Use `immediate: true` for UI elements that need initial value sync (sliders, checkboxes).

---

## Memory Management

### Disposal Chain

```
Display.dispose()
├── listeners.dispose()              // EventListenerManager
├── cadTool.dispose()                // CadTool (raycaster, measurement)
├── clipSliders[].dispose()          // Slider instances
├── ambientlightSlider.dispose()     // Material sliders
├── treeView.dispose()               // TreeView (DOM, TreeModel)
└── viewer.dispose()                 // Viewer
    ├── controls.dispose()           // Camera controls
    ├── axes.dispose()               // Axes helper
    ├── grid.dispose()               // Grid helper
    ├── bbox?.dispose()              // Bounding box
    ├── info?.dispose()              // Info overlay
    ├── animation?.dispose()         // Animation mixer
    ├── nestedGroup.dispose()        // Scene graph
    │   └── deepDispose(rootGroup)   // All meshes, geometries, materials
    ├── clipping?.dispose()          // Clipping planes
    └── renderer.dispose()           // WebGL context
```

### Key Disposal Points

1. **Geometries**: Must call `geometry.dispose()` and dispose buffer attributes
2. **Materials**: Must call `material.dispose()` and dispose all textures
3. **Textures**: Must call `texture.dispose()`
4. **Event Listeners**: Must remove all DOM event listeners
5. **Animation Mixers**: Must call `mixer.stopAllAction()` and `mixer.uncacheRoot()`
6. **WebGL Renderer**: Must call `renderer.dispose()`

---

## File Structure

```
src/
├── index.js                 # Public exports
├── viewer.js                # Main Viewer class
├── display.js               # Display (UI container)
├── viewer-state.js          # ViewerState (centralized state)
│
├── nestedgroup.js           # Scene hierarchy
├── objectgroup.js           # Individual CAD objects
├── material-factory.js      # Material creation
│
├── clipping.js              # Clipping system
├── camera.js                # Camera management
├── controls.js              # Camera controls wrapper
├── controls/
│   └── CameraControls.js    # Control implementation
│
├── treeview.js              # Tree DOM/events
├── tree-model.js            # Tree data/state
│
├── toolbar.js               # Toolbar UI
├── slider.js                # Slider UI
│
├── grid.js                  # Grid helper
├── axes.js                  # Axes helper
├── bbox.js                  # Bounding box
├── info.js                  # Info overlay
├── orientation.js           # Orientation marker
│
├── animation.js             # Animation system
├── raycast.js               # Object picking
│
├── cad_tools/
│   ├── tools.js             # Tool manager
│   ├── measure.js           # Measurement tool
│   ├── select.js            # Selection tool
│   ├── zebra.js             # Zebra analysis
│   └── ui.js                # Tool UI helpers
│
├── utils.js                 # Utilities (dispose, EventListenerManager)
├── types.js                 # Type definitions
├── patches.js               # Three.js patches
├── sizeof.js                # Memory size calculation
├── timer.js                 # Performance timing
├── font.js                  # Font loading
└── _version.js              # Version info

tests/
├── integration/
│   └── clipping.test.js     # Clipping tests (36 tests)
├── helpers/
│   └── clipping-setup.js    # Test utilities
├── tree-model.test.js       # TreeModel tests
└── ...                      # Golden master and UI tests
```

---

## Quick Reference

### Creating a Viewer

```javascript
import { Display, Viewer } from "three-cad-viewer";

const display = new Display(container, options);
display.render(shapesData, states);
```

### Subscribing to State

```javascript
// In Display or external code
viewer.state.subscribe("axes", (change) => {
  console.log(`Axes changed from ${change.old} to ${change.new}`);
});

// With immediate callback
viewer.state.subscribe("grid", (change) => {
  updateGridUI(change.new);
}, { immediate: true });
```

### Adding Materials

```javascript
const factory = new MaterialFactory({
  metalness: 0.7,
  roughness: 0.7,
  transparent: false
});

const faceMaterial = factory.createFrontFaceMaterial({
  color: 0xff0000,
  alpha: 1.0
});
```

### Proper Cleanup

```javascript
// Always call dispose when done
display.dispose();

// Or if only using Viewer
viewer.dispose();
```

---

**Document Version:** 1.0
**Last Updated:** December 4, 2025
