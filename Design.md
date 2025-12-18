# Three-CAD-Viewer Design Document

This document describes the architecture, patterns, and key concepts of the three-cad-viewer library. It is intended for developers who need to understand, maintain, or extend the codebase.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Classes](#core-classes)
3. [Design Patterns](#design-patterns)
4. [UI Interaction Flows](#ui-interaction-flows)
5. [Memory Management](#memory-management)
6. [File Structure](#file-structure)
7. [TypeScript Configuration](#typescript-configuration)

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
└───────┼─────────────┼─────────────┼───────────────────┼─────────────┘
        │             │             │                   │
        │  User actions call  Viewer methods            │
        ▼             ▼             ▼                   ▼
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

| Class       | File             | Purpose                                                                                     |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------- |
| **Display** | `ui/display.ts`  | Creates DOM structure, toolbar, sliders, and subscribes to ViewerState. Internal use only.  |
| **Viewer**  | `core/viewer.ts` | **Public API**. WebGL renderer, scene management, state mutations, and UI control wrappers. |

**Important**: The public API is exposed through `Viewer`. External code should call `viewer.xxx()` methods rather than accessing `viewer.display.xxx()` directly. Display is an internal implementation detail.

### Viewer Public API

The Viewer class organizes its methods into logical sections:

| Section                  | Methods                                                                                        | Purpose                      |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| **Shape Tessellation**   | `render()`, `clear()`, `dispose()`                                                             | Scene lifecycle              |
| **Animation Control**    | `initAnimation()`, `addPositionTrack()`, `addRotationTrack()`, etc.                            | Animation management         |
| **Camera Controls**      | `reset()`, `resize()`, `presetCamera()`, `centerVisibleObjects()`                              | Camera manipulation          |
| **Camera State**         | `getCameraZoom()`, `setCameraZoom()`, `getCameraPosition()`, `setCameraPosition()`, etc.       | Camera state getters/setters |
| **Appearance**           | `setAxes()`, `setGrid()`, `setOrtho()`, `setTransparent()`, `setBlackEdges()`, `showTools()`   | Visual settings              |
| **Lighting & Materials** | `setAmbientLight()`, `setDirectLight()`, `setMetalness()`, `setRoughness()`, `resetMaterial()` | Material properties          |
| **Zebra Tool**           | `enableZebraTool()`, `setZebraCount()`, `setZebraOpacity()`, `setZebraDirection()`, etc.       | Surface analysis             |
| **Clipping Planes**      | `setClipSlider()`, `setClipNormal()`, `setClipIntersection()`, `setClipPlaneHelpers()`         | Clipping controls            |
| **Object Visibility**    | `setState()`, `setVisible()`, `getState()`                                                     | Object visibility            |
| **Object Picking**       | `pick()`, `getPickInfo()`                                                                      | Mouse-based selection        |
| **Image Export**         | `getImage()`, `pinAsPng()`                                                                     | Screenshot/export            |
| **Explode Animation**    | `setExplode()`                                                                                 | Explode view                 |
| **View Layout**          | `resizeCadView()`                                                                              | Viewport sizing              |
| **UI Control Wrappers**  | See table below                                                                                | Delegate to Display          |

#### UI Control Wrappers

These methods provide a clean public API by delegating to Display:

| Method                       | Purpose                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `setView(direction, focus?)` | Set camera to predefined view (iso, front, rear, top, bottom, left, right) |
| `glassMode(flag)`            | Enable/disable glass mode (transparent overlay UI)                         |
| `collapseNodes(value)`       | Collapse/expand tree nodes ("1", "R", "C", "E")                            |
| `setTheme(theme)`            | Set UI theme ("light", "dark", "browser")                                  |
| `showHelp(flag)`             | Show/hide help dialog                                                      |
| `showInfo(flag)`             | Show/hide info panel                                                       |
| `showPinning(flag)`          | Show/hide pinning button                                                   |
| `showMeasureTools(flag)`     | Show/hide measure tools                                                    |
| `showSelectTool(flag)`       | Show/hide select tool                                                      |
| `showExplodeTool(flag)`      | Show/hide explode tool                                                     |
| `showZScaleTool(flag)`       | Show/hide z-scale tool                                                     |
| `getCanvas()`                | Get canvas DOM element                                                     |

### State Management

| Class           | File                   | Purpose                                                                                |
| --------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| **ViewerState** | `core/viewer-state.ts` | Centralized state with observable pattern. Stores all configuration and runtime state. |

### Scene Components

| Class               | File                            | Purpose                                                                  |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| **NestedGroup**     | `scene/nestedgroup.ts`          | Manages hierarchical CAD object scene graph. Coordinates ObjectGroups.   |
| **ObjectGroup**     | `scene/objectgroup.ts`          | THREE.Group subclass for individual CAD shapes (faces, edges, vertices). |
| **MaterialFactory** | `rendering/material-factory.ts` | Factory for creating Three.js materials with consistent CAD settings.    |

### Clipping System

| Class                 | File                | Purpose                                                                 |
| --------------------- | ------------------- | ----------------------------------------------------------------------- |
| **Clipping**          | `scene/clipping.ts` | Manages 3 clipping planes, stencil rendering, and visual helpers.       |
| **ClippingMaterials** | `scene/clipping.ts` | Static factory for clipping-related materials (stencil, plane helpers). |
| **CenteredPlane**     | `scene/clipping.ts` | THREE.Plane subclass with center-relative constant.                     |
| **PlaneMesh**         | `scene/clipping.ts` | Visual representation of clipping plane.                                |

### Tree Navigation

| Class         | File                      | Purpose                                                                |
| ------------- | ------------------------- | ---------------------------------------------------------------------- |
| **TreeView**  | `ui/treeview.ts`          | DOM rendering, event handling, lazy rendering for object tree.         |
| **TreeModel** | `rendering/tree-model.ts` | Tree data structure, traversal, state management (decoupled from DOM). |

### Camera and Controls

| Class                    | File                                      | Purpose                                                                  |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| **Camera**               | `camera/camera.ts`                        | Manages orthographic and perspective cameras.                            |
| **Controls**             | `camera/controls.ts`                      | Wraps CADOrbitControls and CADTrackballControls for camera manipulation. |
| **CADTrackballControls** | `camera/controls/CADTrackballControls.ts` | Trackball with Holroyd non-tumbling rotation (default).                  |
| **CADOrbitControls**     | `camera/controls/CADOrbitControls.ts`     | Orbit controls for constrained rotation.                                 |

#### Control Modes

The viewer supports two control modes:

1. **Trackball with Holroyd** (default): Non-tumbling trackball rotation where dragging in a circle returns to the original orientation. Provides intuitive "grab and rotate" behavior where the rotation axis depends on where you grab. Set `holroyd: false` to use standard Three.js TrackballControls behavior (useful for debugging).

2. **Orbit**: Constrained rotation around vertical/horizontal axes. Camera always stays upright.

#### Features (from Three.js base classes)

Both control modes benefit from Three.js's modern control implementations:

- **Unified pointer events**: Works with mouse, touch, pen, and trackpad
- **Multi-touch support**: Pinch-to-zoom, two-finger pan
- **Pointer capture**: Smooth dragging even when cursor leaves the element
- **Zoom constraints**: `minDistance`, `maxDistance`, `minZoom`, `maxZoom`
- **Configurable speeds**: `rotateSpeed`, `panSpeed`, `zoomSpeed` (normalized to 1.0 = default)

#### Modifier Key Rotation Restrictions

Both modes support modifier keys to restrict rotation to a single axis (uses KeyMapper for customization):

| Modifier         | Effect                                |
| ---------------- | ------------------------------------- |
| **Ctrl + drag**  | Vertical rotation only (up/down)      |
| **Meta + drag**  | Horizontal rotation only (left/right) |
| **Shift + drag** | Pan (both modes)                      |

These work with all pointer types including touchscreens (e.g., laptop with touchscreen + keyboard).

### UI Components

| Class          | File            | Purpose                                          |
| -------------- | --------------- | ------------------------------------------------ |
| **Toolbar**    | `ui/toolbar.ts` | Button bar with collapsible groups.              |
| **BaseButton** | `ui/toolbar.ts` | Base class for toolbar buttons.                  |
| **Ellipsis**   | `ui/toolbar.ts` | Overflow indicator for collapsed toolbar groups. |
| **Slider**     | `ui/slider.ts`  | Reusable slider component for numeric values.    |

### Visualization Helpers

| Class                 | File                   | Purpose                           |
| --------------------- | ---------------------- | --------------------------------- |
| **Grid**              | `scene/grid.ts`        | XY/XZ/YZ grid planes with labels. |
| **Axes**              | `scene/axes.ts`        | XYZ axis indicators.              |
| **BoundingBox**       | `scene/bbox.ts`        | Visual bounding box display.      |
| **Info**              | `ui/info.ts`           | Object information overlay.       |
| **OrientationMarker** | `scene/orientation.ts` | 3D orientation cube in corner.    |

### CAD Tools

| Class                 | File                         | Purpose                                              |
| --------------------- | ---------------------------- | ---------------------------------------------------- |
| **CadTool**           | `tools/cad_tools/tools.ts`   | Tool manager for measurement, selection, properties. |
| **Raycaster**         | `rendering/raycast.ts`       | Mouse-based object picking with topology filtering.  |
| **PickedObject**      | `rendering/raycast.ts`       | Represents a picked object (shape or solid).         |
| **DistanceLineArrow** | `tools/cad_tools/measure.ts` | Measurement visualization.                           |
| **Zebra**             | `tools/cad_tools/zebra.ts`   | Zebra stripe surface analysis tool.                  |
| **Select**            | `tools/cad_tools/select.ts`  | Object selection tool.                               |

### Animation

| Class         | File                 | Purpose                                                 |
| ------------- | -------------------- | ------------------------------------------------------- |
| **Animation** | `scene/animation.ts` | THREE.js AnimationMixer integration for CAD animations. |

### Utilities

| Class/Function           | File             | Purpose                                        |
| ------------------------ | ---------------- | ---------------------------------------------- |
| **EventListenerManager** | `utils/utils.ts` | Tracks DOM event listeners for proper cleanup. |
| **KeyMapper**            | `utils/utils.ts` | Maps keyboard modifiers to actions.            |
| **deepDispose**          | `utils/utils.ts` | Recursively disposes Three.js objects.         |
| **disposeGeometry**      | `utils/utils.ts` | Disposes geometry and its attributes.          |
| **disposeMaterial**      | `utils/utils.ts` | Disposes material and its textures.            |

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
      color,
      metalness: this.metalness,
      roughness: this.roughness,
      side: THREE.FrontSide,
      visible,
    });
  }

  createEdgeMaterial({ lineWidth, color, resolution }) {
    /* ... */
  }
  createVertexMaterial({ size, color }) {
    /* ... */
  }
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
  const textureProps = ["map", "normalMap", "roughnessMap" /* ... */];
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
listeners.add(element, "click", this.handleClick);
listeners.add(window, "resize", this.handleResize);

// In dispose()
listeners.dispose();
```

UI components (Toolbar, Slider, Button) also implement `dispose()` methods that remove their event listeners.

---

## UI Interaction Flows

This section documents all UI interactions and categorizes them by their data flow pattern.

### Summary

| Category               | Count | Examples                                                          | Description                             |
| ---------------------- | ----- | ----------------------------------------------------------------- | --------------------------------------- |
| **STATE SUBSCRIPTION** | 20    | axes, grid, clip settings, material sliders, zebra, animationMode | State change → subscription → UI update |
| **ACTION**             | 6     | reset, resize, pin                                                | One-time actions, no state change       |
| **TOOL**               | 4     | measure, zscale                                                   | Separate subsystems with own state      |
| **TRANSIENT**          | 3     | view buttons, help                                                | Derived/temporary visual indicators     |

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
- **Viewer method**: `setClipSlider()` → `this.state.set()` + `clipping.setConstant()` + `update()`
- **Subscription**: `state.subscribe("clipSlider{0,1,2}", ...)` → updates slider via `setValueFromState()`
- **Note**: Both `setClipSlider()` and `refreshPlane()` update state AND the 3D scene (consistent with other setters)

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
(theme,
  cadWidth,
  treeWidth,
  treeHeight,
  height,
  pinning,
  glass,
  tools,
  keymap,
  newTreeBehavior,
  measureTools,
  selectTool,
  explodeTool,
  zscaleTool,
  zebraTool);
```

#### RENDER_DEFAULTS (material settings)

```javascript
(ambientIntensity,
  directIntensity,
  metalness,
  roughness,
  defaultOpacity,
  edgeColor,
  normalLen);
```

#### VIEWER_DEFAULTS (view configuration)

```javascript
(axes,
  axes0,
  grid,
  ortho,
  transparent,
  blackEdges,
  collapse,
  clipIntersection,
  clipPlaneHelpers,
  clipObjectColors,
  clipNormal0 / 1 / 2,
  clipSlider0 / 1 / 2,
  control,
  holroyd,
  up,
  ticks,
  gridFontSize,
  centerGrid,
  position,
  quaternion,
  target,
  zoom,
  panSpeed,
  rotateSpeed,
  zoomSpeed);
```

#### ZEBRA_DEFAULTS (zebra tool)

```javascript
(zebraCount, zebraOpacity, zebraDirection, zebraColorScheme, zebraMappingMode);
```

#### RUNTIME_DEFAULTS (current session state)

```javascript
(activeTool, // Current measurement tool
  animationMode, // "none" | "animation" | "explode"
  animationSliderValue, // Slider position (0-1000)
  zscaleActive, // ZScale tool active
  highlightedButton, // Camera button highlight
  activeTab); // "tree" | "clip" | "material" | "zebra"
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

The source code is organized into 7 logical folders:

```
src/
├── index.ts                 # Public exports (classes and types)
│
├── core/                    # Application foundation
│   ├── viewer.ts            # Main Viewer class
│   ├── viewer-state.ts      # ViewerState (centralized state)
│   ├── types.ts             # Shared type definitions
│   ├── patches.ts           # Three.js patches
│   └── _version.ts          # Version info
│
├── scene/                   # 3D scene management
│   ├── nestedgroup.ts       # Scene hierarchy, ObjectGroup management
│   ├── objectgroup.ts       # Individual CAD objects (THREE.Group subclass)
│   ├── bbox.ts              # Bounding box calculations
│   ├── grid.ts              # XY/XZ/YZ grid planes with labels
│   ├── axes.ts              # XYZ axis indicators
│   ├── orientation.ts       # 3D orientation cube in corner
│   ├── animation.ts         # Animation system (AnimationMixer)
│   ├── clipping.ts          # Clipping planes with stencil rendering
│   └── render-shape.ts      # Shape tessellation for rendering
│
├── rendering/               # Rendering pipeline
│   ├── material-factory.ts  # Factory for Three.js materials
│   ├── raycast.ts           # Mouse-based object picking
│   └── tree-model.ts        # Tree data structure for visibility
│
├── camera/                  # Camera & interaction
│   ├── camera.ts            # Orthographic/perspective camera management
│   ├── controls.ts          # Controls wrapper (orbit/trackball)
│   └── controls/
│       ├── CADTrackballControls.ts  # Trackball with Holroyd rotation
│       └── CADOrbitControls.ts      # Orbit controls
│
├── ui/                      # User interface components
│   ├── display.ts           # Main UI container, toolbar, sliders
│   ├── toolbar.ts           # Button bar with collapsible groups
│   ├── treeview.ts          # Object tree DOM/events
│   ├── slider.ts            # Reusable slider component
│   ├── info.ts              # Object information overlay
│   └── index.html           # HTML template
│
├── tools/                   # CAD-specific tools
│   └── cad_tools/
│       ├── tools.ts         # Tool manager
│       ├── measure.ts       # Distance/properties measurement
│       ├── select.ts        # Object selection
│       ├── zebra.ts         # Zebra stripe surface analysis
│       └── ui.ts            # Tool UI helpers (panels, dropdowns)
│
├── utils/                   # Utility functions
│   ├── utils.ts             # dispose, EventListenerManager, KeyMapper
│   ├── timer.ts             # Performance timing
│   ├── sizeof.ts            # Memory size calculation
│   └── font.ts              # Font data for 3D text
│
└── types/                   # Type declaration files
    ├── html.d.ts            # HTML element type augmentation
    └── three-augmentation.d.ts  # THREE.js type augmentation

tests/
├── integration/             # Integration tests
│   ├── clipping.test.js     # Clipping tests
│   ├── viewer-methods.test.js
│   └── ...
├── unit/                    # Unit tests
│   ├── viewer-state.test.js
│   ├── tree-model.test.js
│   └── ...
└── helpers/                 # Test utilities
    └── clipping-setup.js
```

### Folder Responsibilities

| Folder         | Purpose                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| **core/**      | Application foundation: main Viewer class, state management, shared types |
| **scene/**     | 3D scene graph management: object groups, helpers, clipping, animation    |
| **rendering/** | Rendering mechanics: materials, raycasting, visibility trees              |
| **camera/**    | Camera management and user interaction controls                           |
| **ui/**        | DOM-based UI components: toolbar, tree view, sliders                      |
| **tools/**     | CAD-specific tools: measurement, selection, zebra analysis                |
| **utils/**     | Pure utility functions with no domain dependencies                        |
| **types/**     | Ambient TypeScript declaration files                                      |

---

## Quick Reference

### Creating a Viewer

```javascript
import { Display, Viewer } from "three-cad-viewer";

const display = new Display(container, displayOptions);
const viewer = new Viewer(
  display,
  viewerOptions,
  notifyCallback,
  backendCallback,
);
viewer.render(shapesData, renderOptions, viewerOptions);
```

### Using the Public API

```javascript
// All public methods are on viewer, not viewer.display
viewer.setView("iso");
viewer.glassMode(true);
viewer.setTheme("dark");
viewer.setAmbientLight(1.5);
viewer.setMetalness(0.5);
viewer.showTools(false);
viewer.setExplode(true);
```

### Subscribing to State

```javascript
// In Display or external code
viewer.state.subscribe("axes", (change) => {
  console.log(`Axes changed from ${change.old} to ${change.new}`);
});

// With immediate callback
viewer.state.subscribe(
  "grid",
  (change) => {
    updateGridUI(change.new);
  },
  { immediate: true },
);
```

### Adding Materials

```javascript
const factory = new MaterialFactory({
  metalness: 0.7,
  roughness: 0.7,
  transparent: false,
});

const faceMaterial = factory.createFrontFaceMaterial({
  color: 0xff0000,
  alpha: 1.0,
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

## TypeScript Configuration

The codebase is fully migrated to TypeScript with strict type checking enabled.

### Compiler Options

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### What `strict: true` Enables

| Option                         | Description                                                |
| ------------------------------ | ---------------------------------------------------------- |
| `strictNullChecks`             | Variables cannot be null/undefined unless explicitly typed |
| `strictFunctionTypes`          | Function parameter types are checked contravariantly       |
| `strictBindCallApply`          | Correct types for bind, call, apply                        |
| `strictPropertyInitialization` | Class properties must be initialized                       |
| `noImplicitAny`                | Variables must have explicit types (no implicit any)       |
| `noImplicitThis`               | `this` must have explicit type                             |
| `alwaysStrict`                 | Emit "use strict" in all files                             |

### Additional Strict Options

| Option                       | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `exactOptionalPropertyTypes` | Distinguishes between `undefined` and missing properties |
| `noUnusedLocals`             | Error on unused local variables                          |
| `noUnusedParameters`         | Error on unused function parameters                      |

### Options Considered But Not Enabled

| Option                     | Reason                                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| `noUncheckedIndexedAccess` | Too invasive (378 errors). Would require null checks on every array access. |

### Explicit `any` Usage

The codebase has only 2 explicit `any` usages, both documented:

1. **`nestedgroup.ts:734`** - `_traverse(func: string, flag?: any)`: Dynamic dispatch pattern for calling methods by name with various argument types.

2. **`slider.ts:11`** - `SliderHandler` type: Accommodates two different handler signatures (plane sliders vs value sliders).

### Public API Types

All public types are exported from `src/index.ts` for library consumers:

```typescript
import {
  Viewer,
  Display,
  Timer,
  type ViewerOptions,
  type DisplayOptions,
  type Shapes,
  type PickInfo,
} from "three-cad-viewer";
```

Type declarations are generated to `dist/index.d.ts` during build.

---

## Version 4.0 Migration Reference

This section documents breaking changes and migration patterns for upgrading from v3.x to v4.0.

### Breaking Changes Summary

| Old (v3.x)                               | New (v4.0)                              | Notes                                                         |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `viewer.collapse = 0/1/2/-1`             | `viewer.collapseNodes(CollapseState.*)` | Use `CollapseState` enum                                      |
| `display.collapseNodes("R"/"C"/"E"/"1")` | `viewer.collapseNodes(CollapseState.*)` | Method moved to Viewer                                        |
| Direct property access                   | State-based getters/setters             | e.g., `viewer.axes` → `viewer.getAxes()` / `viewer.setAxes()` |
| `viewer.ambientIntensity`                | `viewer.state.get("ambientIntensity")`  | Properties moved to ViewerState                               |
| `viewer.cadWidth` property               | `viewer.getCadWidth()` getter           | Use dimension getters                                         |
| `edge_color` notification                | `default_edgecolor` notification        | Key renamed for consistency                                   |

### CollapseState Enum

Replaced magic numbers with named constants:

```typescript
export enum CollapseState {
  LEAVES = -1, // Show only leaf nodes
  COLLAPSED = 0, // All nodes collapsed
  ROOT = 1, // Only root expanded
  EXPANDED = 2, // All nodes expanded
}

// Usage
import { CollapseState } from "three-cad-viewer";
viewer.collapseNodes(CollapseState.EXPANDED);
```

### STATE_TO_NOTIFICATION_KEY Mapping

Centralized mapping from ViewerState keys to notification callback keys:

```typescript
export const STATE_TO_NOTIFICATION_KEY: Partial<Record<StateKey, string>> = {
  axes: "axes",
  grid: "grid",
  ortho: "ortho",
  transparent: "transparent",
  blackEdges: "black_edges",
  defaultOpacity: "default_opacity",
  defaultEdgeColor: "default_edgecolor",
  ambientIntensity: "ambient_intensity",
  directIntensity: "direct_intensity",
  metalness: "metalness",
  roughness: "roughness",
  tools: "tools",
  measureTools: "measureTools",
  clipIntersection: "clip_intersection",
  clipPlaneHelpers: "clip_plane_helpers",
  clipObjectColors: "clip_object_colors",
  clipNormal0: "clip_normal_0",
  // ... additional mappings
};
```

### UI Slider Synchronization Pattern

Three sync methods ensure UI sliders reflect state values after `render()` applies config:

```typescript
// Called from Display.updateUI() after render completes
syncMaterialSlidersFromState(): void {
  const state = this.viewer.state;
  this.ambientlightSlider?.setValueFromState(state.get("ambientIntensity") * 100);
  this.directionallightSlider?.setValueFromState(state.get("directIntensity") * 100);
  this.metalnessSlider?.setValueFromState(state.get("metalness") * 100);
  this.roughnessSlider?.setValueFromState(state.get("roughness") * 100);
}

syncZebraSlidersFromState(): void {
  const state = this.viewer.state;
  this.zebraCountSlider?.setValueFromState(state.get("zebraCount"));
  this.zebraOpacitySlider?.setValueFromState(state.get("zebraOpacity"));
  this.zebraDirectionSlider?.setValueFromState(state.get("zebraDirection"));
  this.setZebraColorSchemeSelect(state.get("zebraColorScheme"));
  this.setZebraMappingModeSelect(state.get("zebraMappingMode"));
}

syncClipSlidersFromState(): void {
  // Similar pattern for clipping sliders
}
```

**Why this pattern exists:** State subscriptions with `immediate: true` fire during `setupUI()` before `render()` applies config values. Since `setRenderDefaults()` uses `notify=false`, subscriptions don't re-fire. These sync methods are called from `updateUI()` after render completes.

### Event Listener Changes

Keyboard event listeners moved from element-level to document-level:

**Problem:** Canvas and div elements don't receive keyboard focus by default. Attaching `keydown` listeners to these elements requires `tabindex` attribute.

**Solution:** Use document-level listeners for keyboard events:

```typescript
// Before (v3.x) - broken without tabindex
this.domElement.addEventListener("keydown", this.onKeyDown);

// After (v4.0) - works reliably
document.addEventListener("keydown", this.onKeyDown);
```

Affected files:

- `src/rendering/raycast.ts` - ESC/Backspace handling
- `src/tools/cad_tools/ui.ts` - Filter keyboard shortcuts (v/e/f/s)

### Raycaster Object Type Support

Extended raycaster to support all topology types:

```typescript
// Before (v3.x) - only meshes
if (isMesh(object) && object.material.visible) {
  validObjs.push(obj);
}

// After (v4.0) - meshes, points, and lines
const isValidType = isMesh(object) || isPoints(object) || isLine(object);
if (isValidType && !Array.isArray(object.material) && object.material.visible) {
  validObjs.push(obj);
}
```

---

**Document Version:** 1.3
**Last Updated:** December 18, 2025
