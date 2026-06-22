# Three-CAD-Viewer Design Document

This document describes the architecture, patterns, and key concepts of the three-cad-viewer library. It is intended for developers who need to understand, maintain, or extend the codebase.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Classes](#core-classes)
3. [Picking & Measurement](#picking--measurement)
4. [State Management](#state-management)
5. [Design Patterns](#design-patterns)
6. [Events](#events)
7. [UI Interaction Flows](#ui-interaction-flows)
8. [Memory Management](#memory-management)
9. [File Structure](#file-structure)
10. [Studio Rendering Pipeline](#studio-rendering-pipeline)
11. [TypeScript Configuration](#typescript-configuration)

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
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────┐ │
│  │ Picking: IdPicker + │  │ CAD Tools: Measure / │  │ Studio mode │ │
│  │ Highlight (GPU ids) │  │ Select / Zebra (mesh-│  │ env, AO,    │ │
│  │                     │  │ measure backend)     │  │ shadows     │ │
│  └─────────────────────┘  └──────────────────────┘  └─────────────┘ │
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

| Section                  | Methods                                                                                        | Purpose                       |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| **Shape Tessellation**   | `render()`, `clear()`, `dispose()`                                                             | Scene lifecycle               |
| **Animation Control**    | `initAnimation()`, `addPositionTrack()`, `addRotationTrack()`, etc.                            | Animation management          |
| **Camera Controls**      | `reset()`, `resize()`, `presetCamera()`, `centerVisibleObjects()`                              | Camera manipulation           |
| **Camera State**         | `getCameraZoom()`, `setCameraZoom()`, `getCameraPosition()`, `setCameraPosition()`, etc.       | Camera state getters/setters  |
| **Appearance**           | `setAxes()`, `setGrid()`, `setOrtho()`, `setTransparent()`, `setBlackEdges()`, `showTools()`   | Visual settings               |
| **Lighting & Materials** | `setAmbientLight()`, `setDirectLight()`, `setMetalness()`, `setRoughness()`, `resetMaterial()` | Material properties           |
| **Zebra Tool**           | `enableZebraTool()`, `setZebraCount()`, `setZebraOpacity()`, `setZebraDirection()`, etc.       | Surface analysis              |
| **Clipping Planes**      | `setClipSlider()`, `setClipNormal()`, `setClipIntersection()`, `setClipPlaneHelpers()`         | Clipping controls             |
| **Object Visibility**    | `setState()`, `getState()`, `setStates()`, `getStates()`                                       | Object visibility             |
| **Scene Mutation**       | `addPart(parentPath, partData)`, `removePart(path)`                                            | Add/remove parts after render |
| **Object Picking**       | `handlePick()` (GPU id-picking; see [Picking & Measurement](#picking--measurement))            | Hover / select / identify     |
| **Image Export**         | `getImage()`, `pinAsPng()`                                                                     | Screenshot/export             |
| **Explode Animation**    | `setExplode()`                                                                                 | Explode view                  |
| **View Layout**          | `resizeCadView()`                                                                              | Viewport sizing               |
| **UI Control Wrappers**  | See table below                                                                                | Delegate to Display           |

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
| **AxesHelper**        | `scene/axes.ts`        | XYZ axis indicators.              |
| **BoundingBox**       | `scene/bbox.ts`        | Visual bounding box display.      |
| **Info**              | `ui/info.ts`           | Object information overlay.       |
| **OrientationMarker** | `scene/orientation.ts` | 3D orientation cube in corner.    |

### CAD Tools

| Class                 | File                         | Purpose                                              |
| --------------------- | ---------------------------- | ---------------------------------------------------- |
| **Tools**             | `tools/cad_tools/tools.ts`   | Tool manager for measurement, selection, properties. |
| **DistanceLineArrow** | `tools/cad_tools/measure.ts` | Measurement visualization.                           |
| **ZebraTool**         | `tools/cad_tools/zebra.ts`   | Zebra stripe surface analysis tool.                  |
| **SelectObject**      | `tools/cad_tools/select.ts`  | Object selection tool.                               |

> Picking, highlighting and the measurement backends have their own section: [Picking & Measurement](#picking--measurement).

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
| **disposeMaterial**      | `utils/utils.ts` | Disposes material; detaches textures (TextureCache owns texture disposal). |

---

## Picking & Measurement

Since v5.0.0 the viewer resolves "what is under the cursor" entirely on the GPU, replacing the former CPU `THREE.Raycaster` and its duplicated "exploded" scene graph. The **same** path drives hover preselection, click selection, double-click identify, and measurement.

| Class                                     | File                            | Role                                                       |
| ----------------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| **ComponentRegistry**                     | `rendering/id-picking.ts`       | id ↔ `ComponentInfo` (`path` / `topo` / `solidPath`)       |
| **IdPicker**                              | `rendering/id-picking.ts`       | offscreen MRT pick pass (id + world-position attachments)  |
| **HighlightController**                   | `rendering/highlight.ts`        | shader-driven hover/select state texture                   |
| **PickingController**                     | `core/picking-controller.ts`    | hover / click / double-click orchestration                 |
| **PickedComponent** / **IdPicked**        | `rendering/picked.ts`           | the currency between the picker and the tools              |
| **MeshMeasureBackend** / **MeshGeometrySource** | `tools/cad_tools/mesh-measure.ts` | internal mesh measurements + BVH minimum distance    |

### The compact scene graph

`NestedGroup` builds **one** scene graph (no exploded duplicate). Each solid is an `ObjectGroup` holding a single merged **face mesh** (all faces in one indexed `BufferGeometry`), an instanced **edge** line, and a pick-only **vertex `Points` cloud** (the solid's B-rep corners) plus a separate visual highlight `Points`. When `assignIds` is set (the live/compact path) every primitive gets a per-component integer `componentId` vertex attribute and is registered. The helpers `applyComponentIds` / `enablePickLayer` / `setPickLayerExclusive` (in `id-picking.ts`) encapsulate the attribute + pick-layer setup; faces carry the id per triangle-vertex, edges per instanced segment, vertices per point.

### ComponentRegistry — id ↔ component

`ComponentRegistry` maps each `componentId` to a `ComponentInfo`: the canonical `path` (`/Assembly/Part/faces/faces_3` — the key the backend uses), the `topo` (`face`/`edge`/`vertex`), and the owning `solidPath` (for whole-solid selection). Ids are allocated densely during the render walk; `maxId` sizes the highlight state texture.

### IdPicker — the offscreen pick pass

`IdPicker` renders the compact graph into an offscreen **MRT** target with two attachments: an integer **id** attachment (the `componentId` per fragment) and an optional **world-position** attachment (`RGBA32F`, gated on `EXT_color_buffer_float`) that yields the exact hit point for the measurement arrow / camera pivot — `point` is `null` when the float attachment is unavailable.

`pickAt(x, y, {topoFilter, windowSize})`:

1. maps CSS px → target px. The pick target is rendered at **half device-pixel-ratio** (a memory/fill tradeoff), so a DPR-1 display picks at half resolution.
2. reads back an **N×N window** (a "touch radius" so thin edges / small vertices stay grabbable) from the id attachment.
3. resolves the winner by **priority vertex > edge > face**, nearest-to-center as tie-break, honoring `topoFilter` (the topology dropdown). Returns `{id, info, point}` or `null`.

The pick buffer is **lazy + dirty-gated**: it re-renders only when the view (camera world/projection matrix), clipping, or object visibility/transform changed — `setObject`, z-scale and running animations call `setDirty()`. A still model never re-renders on mouse-move. The camera cadence compares `number[]` matrix snapshots (a `Float32Array` would truncate float64 → a false change every frame) and diffs both the world **and** projection matrix (ortho zoom changes only the latter).

### HighlightController — shader-driven highlight

`HighlightController` holds an `R8UI` **state texture** indexed by `componentId`. Each visual material is patched (`onBeforeCompile`) to read its own component's state and tint / widen accordingly. So hover and selection flip **one texel** — never a material or geometry swap: `setHover` / `setHoverSolid` / `setSelected` / `selectSolid` / `isSelected` / `isSolidSelected` / `clear` (solid variants act on all faces of a solid).

### PickingController — pointer orchestration

`PickingController` owns all pointer-driven picking through a narrow `PickHost` interface onto the Viewer (so it stays decoupled and unit-testable):

- **Hover** (always-on, B-rep only — GDS is identify-only): each render calls `pickAt`, drives `setHover`, fills the status line, and sets `lastObject` (the component under the cursor).
- **Selection** (tool-scoped): canvas mousedown/mouseup commit `lastObject` on a left-click (click-vs-drag = camera-position delta < ε); right-click / Backspace remove the last; Escape clears. The commit toggles the component and calls `cadTools.handleSelectedObj`.
- **Double-click**: `pickAt` → the owning tree-leaf path → `handlePick` (identify / hide / isolate / recenter, by modifier — keymap-configurable).

A `pickVisible` gate drops picks of hidden components (visibility lives on the visual material, not the pick layer). The pick-only vertex cloud's visibility is kept in sync with its solid's (`ObjectGroup.setPickVertices` / `_syncPickVertices`), so a hidden solid stops contributing corner ids to the pick buffer — otherwise its corners win the vertex>face priority over a visible face behind them and the highlight flickers.

`PickedComponent` (implemented by `IdPicked`) is the currency handed to the tools: `backendId` (the `/`-path sent to the backend), `name`, `topo`, `fromSolid`, the world-space `point`, plus `highlight` / `toggleSelection` / `equals`.

### Measurement backends

A measurement sends `selectedShapeIDs` to a backend that returns refpoints/values, routed back through `viewer.handleBackendResponse`. Two backends exist, chosen by the `externalMeasurementBackend` option:

- **External Python** (`ocp_vscode`) — set `externalMeasurementBackend: true`.
- **Internal mesh** (the default) — `MeshMeasureBackend` computes area, length, volume, bounding box, centroid, min/center distance and angle directly from the tessellated mesh, so the measure tools work standalone. `MeshGeometrySource` resolves a path to that component's **world-space** geometry (it applies the node transform). `shape_type` / `geom_type` are **exact** — decoded from the tessellation's `face_types` / `edge_types` (OCCT `GeomAbs` enum tables), not heuristic.

#### BVH minimum distance

The minimum distance between two components reduces each to primitives (face/solid → triangles, edge → segments, vertex → point), builds an **AABB tree** per component (spatial-median split over an index permutation — no per-node sort or allocation), then runs a **branch-and-bound** between the two trees: descend node-pairs ordered by box-box distance, prune any pair already farther than the best found, and evaluate the primitive×primitive distance only at the leaves. Exact and sub-quadratic — large or finely-tessellated faces (spheres, helices) that took many seconds under the former brute-force O(n·m) scan now resolve in milliseconds. `minDistanceBrute` is retained as the property-test oracle and the small-input fast path.

---

## State Management

`ViewerState` (`core/viewer-state.ts`) is the single source of truth for all configuration. The design is a strictly one-way observable:

- **Viewer owns mutations.** Only `Viewer` methods call `state.set(key, value)`.
- **Display is read-only.** `Display` and the UI widgets `subscribe` to keys and read via `state.get(key)`, but never write state directly.
- **Subscriptions update the UI only.** A subscription callback repaints a button / slider / panel — it must not call back into a `Viewer` mutator, so there is no feedback loop.

```javascript
class ViewerState {
  static VIEWER_DEFAULTS = { axes: false, grid: [false, false, false], ortho: true /* … */ };

  get(key) {
    return this._state[key];
  }

  set(key, value, notify = true) {
    const oldValue = this._state[key];
    if (oldValue === value) return; // change detection — no notify on a no-op write
    this._state[key] = value;
    if (notify) this._notify(key, { old: oldValue, new: value });
  }

  // options.immediate: true → fire the listener once with the current value
  subscribe(key, listener, options = {}) {
    /* … registers the listener, returns an unsubscribe fn */
  }
}
```

**Why there are no infinite loops:** subscription handlers only touch the UI (never a `Viewer` mutator), and `set()` has change detection — identical old/new values emit no notification.

### Notifications to the embedder

State changes are also forwarded to the embedding application through the `notifyCallback`. `STATE_TO_NOTIFICATION_KEY` maps internal `ViewerState` keys to the stable external notification names:

```typescript
export const STATE_TO_NOTIFICATION_KEY: Partial<Record<StateKey, string>> = {
  axes: "axes",
  grid: "grid",
  ortho: "ortho",
  transparent: "transparent",
  blackEdges: "black_edges",
  defaultOpacity: "default_opacity",
  defaultEdgeColor: "default_edgecolor",
  // … one entry per externally-visible key (renaming camelCase → snake_case)
};
```

### Syncing UI widgets back from state

Subscriptions registered with `immediate: true` fire during `setupUI()` — before `render()` applies the model's config — and `setRenderDefaults()` writes with `notify=false`, so those subscriptions do **not** re-fire afterwards. To reconcile, `Display.updateUI()` calls explicit sync methods **after** render completes, pushing the resolved state values into the sliders / selects:

```typescript
syncMaterialSlidersFromState(): void {
  const state = this.viewer.state;
  this.ambientlightSlider?.setValueFromState(state.get("ambientIntensity") * 100);
  this.metalnessSlider?.setValueFromState(state.get("metalness") * 100);
  // … directIntensity, roughness
}
// syncZebraSlidersFromState() and syncClipSlidersFromState() follow the same shape
```

---

## Design Patterns

### 1. TreeModel/TreeView Separation

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

### 2. MaterialFactory Pattern

Materials are created through `MaterialFactory` for consistency:

```javascript
class MaterialFactory {
  constructor(options) {
    this.metalness = options.metalness ?? 0.3;
    this.roughness = options.roughness ?? 0.65;
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

### 3. deepDispose Pattern

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
  if (!material) return;

  // Detach every texture reference (MATERIAL_TEXTURE_KEYS covers all Standard +
  // Physical maps). Textures are NOT disposed here -- TextureCache is the sole
  // owner of loaded textures and is responsible for calling texture.dispose().
  // This only nulls the material's map references to break the association.
  for (const key of MATERIAL_TEXTURE_KEYS) {
    if (material[key]) material[key] = null;
  }

  gpuTracker.untrack("material", material);
  material.dispose();
}
```

> **Texture ownership:** `disposeMaterial` deliberately does not free texture GPU
> memory — that is `TextureCache`'s job (`rendering/texture-cache.ts`). Materials
> only hold borrowed references, so disposal detaches them rather than disposing.

### 4. EventListenerManager Pattern

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

## Events

Most interaction flows go through the [state subscriptions](#state-management) above; the remaining direct DOM events are pointer and keyboard input.

### Pointer input

Canvas pointer events drive picking and are owned by `PickingController` (see [Picking & Measurement](#picking--measurement)): an always-on `pointermove` for hover, tool-scoped `mousedown`/`mouseup` for the selection commit (click vs. orbit-drag is decided by the camera-position delta), and `dblclick` for identify. Camera orbit / zoom / pan is handled separately by the controls (`camera/controls/`).

### Keyboard input

Keyboard listeners are attached at the **document** level, not on the canvas/`div`. Those elements don't receive keyboard focus without a `tabindex`, so an element-level `keydown` is unreliable:

```typescript
// Unreliable — the element isn't focused
this.domElement.addEventListener("keydown", this.onKeyDown);

// Reliable
document.addEventListener("keydown", this.onKeyDown);
```

Handlers:

- `src/core/picking-controller.ts` — Escape (clear selection) / Backspace (remove last) while a selection tool is active.
- `src/tools/cad_tools/ui.ts` — the topology-filter shortcuts (`a`/`v`/`e`/`f`/`s`).

Topology selection (faces / edges / vertices / solids) is no longer a raycaster object-type filter — since v5.0.0 it is resolved on the GPU id buffer with vertex > edge > face priority, honoring the topology dropdown.

---

## UI Interaction Flows

This section documents all UI interactions and categorizes them by their data flow pattern.

### Summary

| Category               | Count | Examples                                                          | Description                             |
| ---------------------- | ----- | ----------------------------------------------------------------- | --------------------------------------- |
| **STATE SUBSCRIPTION** | 20    | axes, grid, clip settings, material sliders, zebra, animationMode | State change → subscription → UI update |
| **ACTION**             | 6     | reset, resize, pin                                                | One-time actions, no state change       |
| **TOOL**               | 5     | explode, zscale, distance, properties, select                     | Separate subsystems with own state      |
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

- **Display handler**: `animationChange(e)` → calls `this.viewer.setRelativeTime()` (which delegates to `animation.setRelativeTime`)
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


                    TOOL (5 cases)
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
  zebraTool,
  studioTool,
  externalMeasurementBackend);
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
  zoomSpeed,
  timeit);
```

#### ZEBRA_DEFAULTS (zebra tool)

```javascript
(zebraCount, zebraOpacity, zebraDirection, zebraColorScheme, zebraMappingMode);
```

#### STUDIO_MODE_DEFAULTS (studio environment)

```javascript
(studioEnvironment, // "studio" (procedural, zero-network)
  studioEnvIntensity, // 1.0
  studioBackground, // "environment"
  studioToneMapping, // "neutral" (PBR Neutral)
  studioExposure, // 1.0
  studio4kEnvMaps, // false
  studioTextureMapping, // "parametric" ("triplanar" is the auto-fallback)
  studioEnvRotation, // 0
  studioShadowIntensity, // 0.5
  studioShadowSoftness, // 0.2
  studioAOIntensity); // 0.5
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

`Display` and `Viewer` are disposed independently by the embedder (Display does
**not** call `viewer.dispose()`). `Viewer.dispose()` itself runs `clear()` first,
which is where the scene-graph objects are torn down.

```
Display.dispose()
├── _unsubscribers[]()               // detach all state subscriptions first
├── listeners.dispose()              // EventListenerManager (DOM listeners)
├── cadTool.dispose()                // Tools (toolbar + buttons)
├── clipSliders[].dispose()          // clip plane sliders
├── ambient/directional/metalness/roughness sliders.dispose()
├── zebra{Count,Opacity,Direction} sliders.dispose()
├── studio{EnvIntensity,Exposure,EnvRotation,AOIntensity} sliders.dispose()
├── _matEditorDragAbort.abort() + disposeMatEditorClones()
└── clear DOM (cadTree / canvas / container)

Viewer.dispose()
├── clear()                          // tears down the current scene:
│   ├── pickingController.reset()    // drop selection/hover state
│   ├── deepDispose(animation)       // animation mixer
│   ├── deepDispose(scene)           // all meshes, geometries, materials, studio lights
│   ├── deepDispose(gridHelper)      // grid (+ axes/bbox live under the scene graph)
│   ├── deepDispose(clipping)        // clipping planes, stencils, caps
│   ├── deepDispose(camera / controls / treeview)
│   ├── deepDispose(info)
│   └── idPicker.dispose()           // offscreen pick target + materials
├── pickingController.dispose()      // remove hover/select/dblclick listeners
├── _studioManager.dispose()         // composer, floor, env, shadows (before renderer)
├── renderer.renderLists.dispose() + renderer.dispose() + forceContextLoss()
└── deepDispose(cadTools) + flush _pendingDisposal
```

> `HighlightController` lives in the scene graph and is freed by `deepDispose(scene)`;
> there is no separate `nestedGroup.dispose()` / `axes.dispose()` / `bbox.dispose()` call.

### Key Disposal Points

1. **Geometries**: Must call `geometry.dispose()` and dispose buffer attributes
2. **Materials**: Must call `material.dispose()`; texture refs are detached, not disposed (see [disposeMaterial](#3-deepdispose-pattern))
3. **Textures**: Owned and disposed by `TextureCache` (`rendering/texture-cache.ts`), not by material disposal
4. **Event Listeners**: Must remove all DOM event listeners
5. **Animation Mixers**: Must call `mixer.stopAllAction()` and `mixer.uncacheRoot()`
6. **WebGL Renderer**: Must call `renderer.dispose()`

---

## File Structure

The source code is organized into 8 logical folders:

```
src/
├── index.ts                 # Public exports (classes and types)
│
├── core/                    # Application foundation
│   ├── viewer.ts            # Main Viewer class (public API, rendering, camera)
│   ├── picking-controller.ts # Hover/click/double-click picking orchestration
│   ├── studio-manager.ts    # Studio mode orchestration (env, shadows, floor, subscriptions)
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
│   ├── material-presets.ts  # PBR material presets (MATERIAL_PRESETS, public export)
│   ├── texture-cache.ts     # TextureCache: owns/caches loaded textures (sole texture disposer)
│   ├── triplanar.ts         # Triplanar texture-mapping shader injection
│   ├── id-picking.ts        # GPU id-pick pass + ComponentRegistry + pick-layer helpers
│   ├── highlight.ts         # HighlightController (shader-driven hover/select state texture)
│   ├── picked.ts            # PickedComponent / IdPicked (picker↔tools currency)
│   ├── tree-model.ts        # Tree data structure for visibility
│   ├── studio-composer.ts   # Postprocessing pipeline (tone mapping, shadows, AO, SMAA)
│   ├── studio-floor.ts      # ShadowMaterial ground plane for Studio mode
│   ├── environment.ts       # HDR environment map loading and background modes
│   ├── room-environment.ts  # Clean procedural studio (RoomEnvironment without boxes, with cove)
│   └── light-detection.ts   # HDR analysis for directional shadow light placement
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
│       ├── mesh-measure.ts  # Internal mesh measurement backend + BVH minimum distance
│       ├── select.ts        # Object selection
│       ├── zebra.ts         # Zebra stripe surface analysis
│       └── ui.ts            # Tool UI helpers (panels, dropdowns)
│
├── utils/                   # Utility functions
│   ├── utils.ts             # dispose, EventListenerManager, KeyMapper
│   ├── decode-instances.ts  # Decode the instanced/encoded buffer shapes format
│   ├── gpu-tracker.ts       # gpuTracker: GPU resource leak tracking
│   ├── logger.ts            # logger utility
│   ├── timer.ts             # Performance timing
│   ├── sizeof.ts            # Memory size calculation
│   └── font.ts              # Font data for 3D text
│
└── types/                   # Type declaration files
    ├── html.d.ts            # HTML element type augmentation
    ├── n8ao.d.ts            # N8AO postprocessing pass type augmentation
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
| **rendering/** | Rendering mechanics: materials, GPU id-picking, highlighting, visibility trees |
| **camera/**    | Camera management and user interaction controls                           |
| **ui/**        | DOM-based UI components: toolbar, tree view, sliders                      |
| **tools/**     | CAD-specific tools: measurement, selection, zebra analysis                |
| **utils/**     | Pure utility functions with no domain dependencies                        |
| **types/**     | Ambient TypeScript declaration files                                      |

---

## Studio Rendering Pipeline

Studio mode replaces the standard `renderer.render()` call with a postprocessing
pipeline managed by `StudioComposer`. The pipeline provides tone mapping,
screen-space ambient occlusion, directional shadow mapping with screen-space blur,
and anti-aliasing.

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Per-Frame Render Steps                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Shadow mask: objects pass (floor hidden, receiveShadow=true)│
│     → renders to _shadowMaskRT (half-res)                       │
│     → shadow map generated as side effect (4096×4096 PCF)       │
│     → KawaseBlurPass → _blurredObjectMaskRT                     │
│                                                                 │
│  2. Shadow mask: floor pass (objects hidden)                    │
│     → renders to _shadowMaskRT (reuses shadow map)              │
│     → KawaseBlurPass → _blurredFloorMaskRT                      │
│                                                                 │
│  3. Floor hidden for main render                                │
│                                                                 │
│  4. EffectComposer pipeline:                                    │
│     ┌──────────────┐                                            │
│     │  RenderPass  │  Scene (no floor, skipShadowMapUpdate)     │
│     └──────┬───────┘                                            │
│            ▼                                                    │
│     ┌──────────────┐                                            │
│     │ N8AOPostPass │  Screen-space ambient occlusion            │
│     └──────┬───────┘                                            │
│            ▼                                                    │
│     ┌──────────────────────────────────────────────┐            │
│     │ EffectPass (3 effects in one shader)         │            │
│     │  ├─ ShadowMaskEffect (depth-masked composite)│            │
│     │  ├─ ToneMappingEffect (Neutral/ACES/None)    │            │
│     │  └─ SMAAEffect (anti-aliasing)               │            │
│     └──────────────────────────────────────────────┘            │
│                                                                 │
│  5. Floor visibility restored                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Shadow System

Directional shadows are driven by HDR light detection (`light-detection.ts`),
which analyzes the environment map to find the dominant light direction.

**Shadow map generation:**

- One `DirectionalLight` at intensity 0.01 (invisible illumination — shadow map only)
- `PCFShadowMap` at 4096×4096, bias=-0.001
- Shadow frustum sized to scene bounding box (`±maxExtent × 6`)

**Two-pass screen-space blur:**

Both passes render the scene with `ShadowMaterial` as `scene.overrideMaterial`
(opaque, `NoBlending`) to a shared half-resolution render target. Each pass is
then blurred via `KawaseBlurPass` into its own output RT.

| Pass    | Visible geometry                                  | Purpose                     |
| ------- | ------------------------------------------------- | --------------------------- |
| Objects | Objects only (floor hidden), `receiveShadow=true` | Inter-object + self shadows |
| Floor   | Floor only (objects hidden)                       | Ground shadow               |

Separating the passes eliminates depth discontinuities between floor and objects,
which would otherwise cause glow halos when blurred.

**Depth-based compositing:**

The `ShadowMaskEffect` uses `EffectAttribute.DEPTH` to read the main render's
depth buffer. Since the floor is hidden during the main render, floor pixels
have depth ≈ 1.0 (far plane). The shader uses this to decide:

```glsl
float isFloorArea = step(0.9999, depth);
float shadowAmount = max(objectShadow, floorShadow * isFloorArea);
```

- At object pixels (depth < 1.0): only object shadows apply
- At floor pixels (depth ≈ 1.0): floor shadow applies

This prevents the floor shadow (which extends under objects in the floor-only
pass) from bleeding through onto objects in screen space.

**Background-protect shadow rendering:**

With solid backgrounds, the FBO is cleared transparent and alpha-blended onto a
pre-cleared canvas. At floor pixels the FBO has `rgba(0,0,0,0)` — darkening
zero produces zero. The fix: at transparent pixels, the shadow is output as
alpha `vec4(0, 0, 0, shadowAmount)`. `NormalBlending` composites this as
`bgColor × (1 - shadowAmount)`, correctly darkening the canvas background.

**User controls:**

- Shadow Intensity (0–100): controls shadow darkness. Object shadows are 75% of floor intensity.
- Shadow Softness (0–100): continuous `KawaseBlurPass.scale` on a fixed `HUGE` kernel (10 iterations).

### Tone Mapping

Tone mapping is owned by `ToneMappingEffect` (postprocessing library), not
`renderer.toneMapping`. The renderer must be set to `NoToneMapping`.

**Background protection:** Solid-color backgrounds are excluded from tone mapping
via alpha compositing — `RenderPass.ignoreBackground = true`, FBO cleared
transparent, canvas pre-cleared with the correct color, `EffectPass` alpha-blends
on top.

### Ambient Occlusion

N8AO provides screen-space ambient occlusion at half resolution with depth-aware
upsampling. It runs as a separate pass after the RenderPass and before the
EffectPass. User-controlled intensity (0–3.0, default 0.5).

### Material Editor

The Material Editor is an overlay panel in Studio mode that allows interactive
tweaking of PBR material parameters on individual objects. It is designed as a
prototyping tool — users adjust parameters visually, then copy the values back
to their Python code.

**Activation:** Click the "E" button in the Studio toolbar, or press ESC to close.
Requires an object to be selected (double-click in viewport). If no object is
selected, a hint dialog appears.

**Architecture:**

```
User double-clicks object → Viewer.handlePick() → Display.onSelectionChanged()
                                                    ↓ (if editor open)
                                              closeMatEditor() + openMatEditor(newObject)

User clicks "E" button → handleMatEditorToggle()
                           ↓
                    getSelectedObjectGroup() → openMatEditor(object, path)
                           ↓
                    Clone material (preserving triplanar mapping)
                           ↓
                    Build slider UI from MAT_EDITOR_PARAMS[]
```

**Material cloning:** On first edit, the object's `MeshPhysicalMaterial` is
cloned so changes are per-object and non-destructive. The original material is
stored in `_matEditorClones` for reset. If the original uses triplanar texture
mapping (`customProgramCacheKey() === "triplanar"`), `applyTriplanarMapping()`
is re-applied to the clone since `onBeforeCompile` is not copied by
`Material.clone()`.

**Parameter definitions:** `MAT_EDITOR_PARAMS` is a declarative array defining
all editable parameters with key, label, min/max/step, group name, and an
optional `infinity` flag (for `attenuationDistance`). Groups render as section
headers in the UI.

**Changed-value highlighting:** Labels turn red when a parameter differs from
the original material value (tolerance: half step size). This persists across
close/reopen cycles, helping users identify which values to copy to Python.

**Lifecycle:**

- Clone created on first edit, reused on reopen
- Reset ("R") restores original material, disposes clone, creates fresh clone
- Closing editor hides panel but preserves clone (edits survive close/reopen)
- Leaving Studio tab or `Display.dispose()` disposes all clones and restores originals
- Drag listeners use `AbortController` for clean removal on dispose

**Keyboard:** ESC closes the editor (takes priority over help panel).

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
  pinAsPngCallback, // optional: receives the pinned PNG (ImageResult)
  updateMarker, // optional, default true
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

### Adding and Removing Parts

After `render()`, you can dynamically add or remove parts from the scene.
`addPart(parentPath, partData)` takes an absolute parent path and part data
with relative naming. The absolute path is constructed by the viewer.

#### Adding a leaf part

For leaves, provide a `name` (no leading slash). The resulting path is
`parentPath + "/" + name`.

```javascript
// Add a single shape under "/Group"
const leafPart = {
  version: 3,
  name: "Shelf", // plain name, no slash
  shape: {
    vertices: [
      /* ... */
    ],
    triangles: [
      /* ... */
    ],
    normals: [
      /* ... */
    ],
    edges: [
      /* ... */
    ],
    obj_vertices: [
      /* ... */
    ],
    face_types: [0],
    edge_types: [0],
    triangles_per_face: [2],
    segments_per_edge: [1],
  },
  color: "#5b9bd5",
  alpha: 1.0,
  state: [1, 1],
  type: "shapes",
  subtype: "solid",
  renderback: false,
};

const addedPath = viewer.addPart("/Group", leafPart);
// addedPath === "/Group/Shelf"
```

#### Adding a subtree

For subtrees, provide slash-prefixed **relative** ids. `addPart` prefixes
every `id` in the tree with `parentPath` before rendering.

```javascript
// Add a compound group with children under "/Group"
const subtree = {
  version: 3,
  name: "Assembly",
  id: "/Assembly", // relative, slash-prefixed
  loc: [
    [0, 0, 0],
    [0, 0, 0, 1],
  ],
  parts: [
    {
      version: 3,
      name: "Bolt",
      id: "/Assembly/Bolt", // relative to the tree root
      shape: {
        /* ... */
      },
      color: "#aaaaaa",
      alpha: 1.0,
      state: [1, 1],
      type: "shapes",
      subtype: "solid",
    },
  ],
};

viewer.addPart("/Group", subtree);
// Registers: /Group/Assembly, /Group/Assembly/Bolt
```

#### Removing a part

`removePart` takes an absolute path; it removes the node and its entire
subtree.

```javascript
viewer.removePart("/Group/Shelf");
viewer.removePart("/Group/Assembly"); // removes Assembly + Bolt
```

#### Error cases

```javascript
// Throws: viewer must be rendered first
viewer.addPart("/Group", leafPart); // before render() → Error

// Throws: name already exists at that level
viewer.addPart("/Group", leafPart);
viewer.addPart("/Group", leafPart); // duplicate → Error

// Throws: parent must exist as a CompoundGroup
viewer.addPart("/NoSuchGroup", leafPart); // → Error

// Throws: path not found
viewer.removePart("/Group/NonExistent"); // → Error
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

> **Internal API.** `MaterialFactory` is not part of the public package export
> (`three-cad-viewer` exports `Viewer`, `Display`, `EnvironmentManager`, `Timer`,
> `logger`, `gpuTracker`, material presets + types). The example below is for
> understanding the internal rendering path; import it by source path if needed.

```javascript
import { MaterialFactory } from "three-cad-viewer/src/rendering/material-factory.js";

const factory = new MaterialFactory({
  metalness: 0.3,
  roughness: 0.65,
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

Key strictness options (excerpt — see `tsconfig.json` for the full block, which
also sets `target: "ES2020"`, `module: "ESNext"`, `moduleResolution: "bundler"`,
`declaration: true`, `isolatedModules: true`, etc.):

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

Explicit `any` is confined to a handful of bounded spots, each carrying an
`eslint-disable @typescript-eslint/no-explicit-any` with a rationale:

1. **`nestedgroup.ts`** - `_traverse(func: string, flag?: any)`: dynamic dispatch calling methods by name with various argument types.
2. **`slider.ts`** - `SliderHandler` type: accommodates two handler signatures (plane sliders vs value sliders).
3. **`viewer.ts`** - `shapes as any` casts in the instanced/studio buffer decode path.
4. **`display.ts`** - `(x as any)[key]` casts in the declarative material-editor parameter loop.
5. **`material-factory.ts`** - `(material as any)[mapName]` for dynamic texture-map assignment.
6. **`studio-composer.ts`** - `_n8aoPass: any` (the N8AO pass has no shipped types).

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

## Version 5.0 Migration Reference

This section documents the breaking changes when upgrading from v4.x to v5.0 — the GPU picking / measurement rewrite. (Earlier v3.x → v4.0 migration notes were dropped; see the change log for the full history.)

### Breaking Changes Summary

| Old (v4.x)                                                                  | New (v5.0)                          | Notes                                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Viewer.raycaster`, `setRaycastMode`, `handleRaycast`, `handleRaycastEvent` | removed                             | Picking is GPU id-based now; selection and measurement still flow through `handlePick` and the `checkChanges` notifications            |
| `toggleGroup`, `syncTreeStates`                                             | removed                             | The duplicated "exploded" scene graph is gone — there is one compact graph (see [Picking & Measurement](#picking--measurement))        |
| `measurementDebug: true`                                                    | `externalMeasurementBackend: true`  | Renamed **and meaning inverted**: the default is now the internal mesh backend; embedders using the Python (`ocp_vscode`) backend must set `externalMeasurementBackend: true` |
| dummy debug-measurement path                                                | internal `MeshMeasureBackend`       | Removed — real values are computed from the tessellated mesh                                                                          |
| keymap: `S` Copy-IDs · `s` Studio · `a` Axes · `A` axes-at-origin           | `I` · `S` · `A` · `0`               | Lowercase `a`/`v`/`e`/`f`/`s` now drive the always-on topology filter, so the colliding action shortcuts moved to case-distinct keys   |

---

**Document Version:** 1.5
**Last Updated:** June 20, 2026
