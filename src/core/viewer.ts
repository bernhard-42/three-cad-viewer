// =============================================================================
// IMPORTS
// =============================================================================

import * as THREE from "three";

// Extend window to include THREE for debugging/external access
declare global {
  interface Window {
    THREE?: typeof THREE;
  }
}

import { NestedGroup, ObjectGroup, isObjectGroup, isCompoundGroup } from "../scene/nestedgroup.js";
import { Grid } from "../scene/grid.js";
import { AxesHelper } from "../scene/axes.js";
import { OrientationMarker } from "../scene/orientation.js";
import { TreeView } from "../ui/treeview.js";
// TreeData and StateValue available if needed for tree manipulation
import { Timer } from "../utils/timer.js";
import { Clipping } from "../scene/clipping.js";
import { Animation } from "../scene/animation.js";
import {
  isEqual,
  KeyMapper,
  scaleLight,
  deepDispose,
  isOrthographicCamera,
  isLineSegments2,
  toVector3Tuple,
  toQuaternionTuple,
} from "../utils/utils.js";
import type { DisposableTree } from "../utils/utils.js";
import { ShapeRenderer } from "../scene/render-shape.js";
import type { ShapeTreeData, RenderResult } from "../scene/render-shape.js";
import type { KeyMappingConfig } from "../utils/utils.js";
import { Controls } from "../camera/controls.js";
import { Camera, type CameraDirection } from "../camera/camera.js";
import { BoundingBox, BoxHelper } from "../scene/bbox.js";
import { Tools, type ToolResponse } from "../tools/cad_tools/tools.js";
import { version } from "../_version.js";
import { PickedObject, Raycaster, TopoFilter } from "../rendering/raycast.js";
import { ViewerState } from "./viewer-state.js";
import { logger } from "../utils/logger.js";
import type { Display } from "../ui/display.js";
import type { Vector3Tuple, QuaternionTuple } from "three";
import {
  CollapseState,
  type ZebraColorScheme,
  type ZebraMappingMode,
  type NotificationCallback,
  type RenderOptions,
  type ViewerOptions,
  type Shapes,
  type VisibilityState,
  type StateChange,
  type ActiveTab,
  type Axis,
  type ClipIndex,
  type ThemeInput,
  type BoundingBoxFlat,
  type Keymap,
} from "./types.js";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Material settings for the viewer.
 */
interface MaterialSettings {
  ambientIntensity: number;
  directIntensity: number;
  metalness: number;
  roughness: number;
}

/**
 * Bounding box tracking for the last selected object.
 */
interface LastBboxInfo {
  id: string;
  bbox: BoxHelper;
  needsUpdate: boolean;
}

/**
 * Camera location settings.
 */
interface CameraLocationSettings {
  position: number[];
  quaternion: number[];
  target: number[];
  zoom: number;
}

/**
 * Reset location settings from controls.
 */
interface ResetLocation {
  target0: THREE.Vector3;
  position0: THREE.Vector3;
  quaternion0: THREE.Quaternion;
  zoom0: number;
}

/**
 * Type guard to check if a tree node is a leaf (VisibilityState)
 */
function isVisibilityState(
  node: ShapeTreeData | VisibilityState,
): node is VisibilityState {
  return Array.isArray(node);
}

/**
 * Type guard to check if a tree node is a branch (ShapeTreeData)
 */
function isShapeTreeData(node: ShapeTreeData | VisibilityState): node is ShapeTreeData {
  return !Array.isArray(node);
}

/**
 * Keymap configuration - re-export from utils for API compatibility.
 */
type KeymapConfig = Partial<KeyMappingConfig>;

/**
 * Mesh with an index property (used for clipping plane meshes).
 */
interface IndexedMesh extends THREE.Mesh {
  index: ClipIndex;
}

/**
 * Type guard to check if an Object3D is an IndexedMesh.
 */
function isIndexedMesh(obj: THREE.Object3D): obj is IndexedMesh {
  return (
    "isMesh" in obj &&
    obj.isMesh === true &&
    "index" in obj &&
    typeof (obj as IndexedMesh).index === "number"
  );
}

/**
 * Material with clippingPlanes property.
 */
interface ClippableMaterial extends THREE.Material {
  clippingPlanes: THREE.Plane[];
}

/**
 * Type guard to check if a material has clippingPlanes.
 */
function isClippableMaterial(mat: THREE.Material | THREE.Material[]): mat is ClippableMaterial {
  return !Array.isArray(mat) && "clippingPlanes" in mat;
}

/**
 * Image capture result.
 */
interface ImageResult {
  task: string;
  dataUrl: string | ArrayBuffer | null;
}

/**
 * Raycast event from keyboard or mouse.
 */
interface RaycastEvent {
  key?: string;
  mouse?: "left" | "right";
  shift?: boolean;
}

/**
 * Backend response structure.
 */
interface BackendResponse {
  subtype: string;
  [key: string]: unknown;
}

/**
 * Type guard to check if a BackendResponse is a ToolResponse.
 */
function isToolResponse(
  response: BackendResponse,
): response is BackendResponse & ToolResponse {
  return response.subtype === "tool_response" && "tool_type" in response;
}

/**
 * Display options for viewer construction.
 */
interface DisplayOptionsInternal {
  measureTools?: boolean;
  measurementDebug?: boolean;
  selectTool?: boolean;
  explodeTool?: boolean;
  zscaleTool?: boolean;
  zebraTool?: boolean;
  glass?: boolean;
  tools?: boolean;
  keymap?: KeymapConfig;
  [key: string]: unknown;
}

/**
 * State that exists only after render() and before clear().
 * Groups all resources that are created together during rendering.
 */
interface RenderedState {
  // Core THREE.js objects
  scene: THREE.Scene;
  ambientLight: THREE.AmbientLight;
  directLight: THREE.DirectionalLight;

  // Camera and controls
  camera: Camera;
  controls: Controls;

  // Helpers
  gridHelper: Grid;
  axesHelper: AxesHelper;
  clipping: Clipping;
  orientationMarker: OrientationMarker;

  // These can change during lifetime (via toggleGroup)
  nestedGroup: NestedGroup;
  treeview: TreeView;
}

// =============================================================================
// VIEWER CLASS
// =============================================================================

/**
 * Main CAD viewer class that manages the 3D scene, rendering, and user interaction.
 *
 * The Viewer is created by Display and handles:
 * - WebGL rendering with Three.js
 * - Camera management (orthographic/perspective)
 * - Scene graph with CAD objects (NestedGroup/ObjectGroup)
 * - Clipping planes
 * - Material settings
 * - Animation playback
 * - Object picking and selection
 *
 * ## Lifecycle
 * 1. Created by Display constructor
 * 2. `render()` called to display CAD shapes
 * 3. User interacts via UI (calls setter methods)
 * 4. `clear()` to remove shapes (optional)
 * 5. `dispose()` for cleanup
 *
 * ## State Management
 * All state is centralized in `ViewerState`. Use getter/setter methods
 * rather than accessing state directly.
 *
 * @example
 * ```typescript
 * // Access via Display
 * const display = new Display(container, options);
 * display.render(shapes, states, options);
 *
 * // Access viewer methods
 * display.viewer.setAxes(true);
 * display.viewer.switchCamera(false); // perspective
 * ```
 *
 * @public
 */
class Viewer {
  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  // State management
  state: ViewerState;
  notifyCallback: NotificationCallback | null;
  pinAsPngCallback: ((data: ImageResult) => void) | null;
  updateMarker: boolean;
  ready: boolean;

  // Always available (set in constructor)
  display!: Display;
  renderer!: THREE.WebGLRenderer;
  mouse!: THREE.Vector2;
  cadTools!: Tools;
  animation!: Animation;
  clipNormals!: [THREE.Vector3, THREE.Vector3, THREE.Vector3];

  // Render-time state: created in render(), cleared in clear()
  private _rendered: RenderedState | null;

  /**
   * Get rendered state, throwing if not yet rendered.
   */
  get rendered(): RenderedState {
    if (!this._rendered) {
      throw new Error("Viewer.render() must be called before this operation");
    }
    return this._rendered;
  }

  // Data objects (set in render, cleared in clear)
  tree: ShapeTreeData | null;
  bbox: BoundingBox | null;
  bb_max: number;
  bb_radius!: number;
  private _stencilCSize: number;
  private _treeNeedsRebuild: boolean;
  private _pendingDisposal: THREE.Object3D[];
  shapes: Shapes | null;
  gridSize!: number;

  // Animation
  hasAnimationLoop: boolean;
  mixer: THREE.AnimationMixer | null;
  continueAnimation: boolean;
  clipAction: THREE.AnimationAction | null;

  // Shape rendering
  shapeRenderer: ShapeRenderer | null;

  // Camera
  camera_distance: number;

  // Material settings
  materialSettings: MaterialSettings | null;
  renderOptions: RenderOptions | null;

  // Selection tracking
  lastNotification: Record<string, unknown>;
  lastBbox: LastBboxInfo | null;
  lastObject: PickedObject | null;
  lastSelection: PickedObject | null;
  lastPosition: THREE.Vector3 | null;
  bboxNeedsUpdate: boolean;
  keepHighlight: boolean;

  // Tree structures for expanded/compact views
  expandedTree: ShapeTreeData | null;
  compactTree: ShapeTreeData | null;
  expandedNestedGroup: NestedGroup | null;
  compactNestedGroup: NestedGroup | null;

  // Raycaster
  raycaster: Raycaster | null;

  // Z-scale
  zScale!: number;

  // Deprecated properties (kept for compatibility)
  clipNormal0: Vector3Tuple | null;
  clipNormal1: Vector3Tuple | null;
  clipNormal2: Vector3Tuple | null;
  keymap: KeymapConfig | null;
  info: DisposableTree | null;

  // ---------------------------------------------------------------------------
  // Constructor & Initialization
  // ---------------------------------------------------------------------------

  /**
   * Create Viewer.
   * @param display - The Display object.
   * @param options - configuration parameters.
   * @param notifyCallback - The callback to receive changes of viewer parameters.
   * @param pinAsPngCallback - Optional callback for PNG pinning.
   * @param updateMarker - enforce to redraw orientation marker after every ui activity
   */
  constructor(
    display: Display,
    options: DisplayOptionsInternal,
    notifyCallback: NotificationCallback | null,
    pinAsPngCallback: ((data: ImageResult) => void) | null = null,
    updateMarker: boolean = true,
  ) {
    // Create centralized state from options (single source of truth)
    this.state = new ViewerState(options);

    // Register callback for external notifications from state changes during runtime
    // Initial config sync is handled explicitly in render() via notifyCallback
    this.state.setExternalNotifyCallback((input) => {
      const notifications = Array.isArray(input) ? input : [input];
      const changes: Record<string, unknown> = {};
      for (const { key, change } of notifications) {
        // Convert THREE.Vector3 to array for external notification
        const value = change.new instanceof THREE.Vector3
          ? change.new.toArray()
          : change.new;
        changes[key] = value;
      }
      this.checkChanges(changes, true);
    });

    this.notifyCallback = notifyCallback;
    this.pinAsPngCallback = pinAsPngCallback;
    this.updateMarker = updateMarker;

    this.hasAnimationLoop = false;

    this.display = display;

    if (options.keymap) {
      this.setKeyMap({ ...ViewerState.DISPLAY_DEFAULTS.keymap, ...options.keymap });
    } else {
      this.setKeyMap(ViewerState.DISPLAY_DEFAULTS.keymap);
    }

    window.THREE = THREE;

    // Render-time state starts as null
    this._rendered = null;

    this.tree = null;
    this.bbox = null;
    this.bb_max = 0;
    this._stencilCSize = 0;
    this._treeNeedsRebuild = false;
    this._pendingDisposal = [];
    this.cadTools = new Tools(this, options.measurementDebug ?? false);

    this.ready = false;
    this.mixer = null;
    this.clipAction = null;
    this.animation = new Animation("|");
    this.continueAnimation = true;
    this.shapeRenderer = null;
    this.materialSettings = null;
    this.renderOptions = null;

    this.clipNormals = [
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
    ];

    this.camera_distance = 0;

    this.mouse = new THREE.Vector2();

    // setup renderer
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      stencil: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.state.get("cadWidth"), this.state.get("height"));
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.autoClear = false;

    this.lastNotification = {};
    this.lastBbox = null;

    // measure supporting exploded shapes and compact shapes
    this.expandedTree = null;
    this.compactTree = null;
    this.expandedNestedGroup = null;
    this.compactNestedGroup = null;

    // If fromSolid is true, this means the selected object is from the solid
    // This is the obj that has been picked but the actual selected obj is the solid
    // Since we cannot directly pick a solid this is the solution
    this.lastObject = null;
    this.lastSelection = null;
    this.lastPosition = null;
    this.bboxNeedsUpdate = false;

    this.keepHighlight = false;

    this.shapes = null;
    this.raycaster = null;

    // Deprecated properties
    this.clipNormal0 = null;
    this.clipNormal1 = null;
    this.clipNormal2 = null;
    this.keymap = null;
    this.info = null;

    this.setPickHandler(true);

    this.renderer.domElement.addEventListener("contextmenu", (e: Event) =>
      e.stopPropagation(),
    );

    this.display.setupUI(this, this.renderer.domElement);

    console.debug("three-cad-viewer: WebGL Renderer created");
  }

  /**
   * Return three-cad-viewer version as semver string.
   * @returns semver version
   * @public
   */
  version(): string {
    return version;
  }

  /**
   * Apply render options and build materialSettings object.
   * Called by render() after state is populated with render options.
   * @param options - The provided options object for rendering.
   */
  setRenderDefaults(options: RenderOptions): void {
    // Update state with any render-specific options
    this.state.updateRenderState(options, true);

    // Build materialSettings from current state
    this.materialSettings = {
      ambientIntensity: this.state.get("ambientIntensity"),
      directIntensity: this.state.get("directIntensity"),
      metalness: this.state.get("metalness"),
      roughness: this.state.get("roughness"),
    };
  }

  /**
   * Apply view options to state.
   * Called by render() after state is populated.
   * @param options - The provided options object for the view.
   */
  setViewerDefaults(options: ViewerOptions): void {
    // Update state with view-specific options
    // updateViewerState handles conversion from Vector3Tuple to THREE.Vector3
    this.state.updateViewerState(options);
  }

  /**
   * @deprecated Use state properties directly. Kept for backwards compatibility.
   */
  setDisplayDefaults(): void {
    // No-op: ViewerState now handles all defaults in its constructor
    // This method is kept only for API compatibility
  }

  dumpOptions(): void {
    this.state.dump();
  }

  // ---------------------------------------------------------------------------
  // Shape Tessellation & Decomposition
  // ---------------------------------------------------------------------------

  /**
   * Get or create the ShapeRenderer instance with current configuration.
   */
  private getShapeRenderer(): ShapeRenderer {
    const config = {
      cadWidth: this.state.get("cadWidth"),
      height: this.state.get("height"),
      edgeColor: this.state.get("edgeColor"),
      transparent: this.state.get("transparent"),
      defaultOpacity: this.state.get("defaultOpacity"),
      metalness: this.state.get("metalness"),
      roughness: this.state.get("roughness"),
      normalLen: this.state.get("normalLen"),
    };

    if (!this.shapeRenderer) {
      this.shapeRenderer = new ShapeRenderer(config);
    } else {
      this.shapeRenderer.updateConfig(config);
    }

    return this.shapeRenderer;
  }

  /**
   * Render the shapes of the CAD object.
   * @param exploded - Whether to render the compact or exploded version
   * @param shapes - The Shapes object.
   * @returns A nested THREE.Group object and navigation tree.
   */
  renderTessellatedShapes(exploded: boolean, shapes: Shapes): RenderResult {
    const renderer = this.getShapeRenderer();
    const result = renderer.render(exploded, shapes);

    // Update bbox if the renderer computed one
    if (renderer.bbox) {
      this.bbox = renderer.bbox;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Animation Control
  // ---------------------------------------------------------------------------

  /**
   * Add a position animation track (full 3D translation).
   * @param selector - path/id of group to be animated.
   * @param times - array of keyframe times.
   * @param positions - array of [x, y, z] position offsets.
   */
  addPositionTrack(
    selector: string,
    times: number[],
    positions: number[][],
  ): void {
    this.animation.addPositionTrack(
      selector,
      this.rendered.nestedGroup.groups[selector],
      times,
      positions,
    );
  }

  /**
   * Add a single-axis translation animation track.
   * @param selector - path/id of group to be animated.
   * @param axis - which axis to translate along ("x", "y", or "z").
   * @param times - array of keyframe times.
   * @param values - array of translation values along the axis.
   */
  addTranslationTrack(
    selector: string,
    axis: Axis,
    times: number[],
    values: number[],
  ): void {
    this.animation.addTranslationTrack(
      selector,
      this.rendered.nestedGroup.groups[selector],
      axis,
      times,
      values,
    );
  }

  /**
   * Add a quaternion rotation animation track.
   * @param selector - path/id of group to be animated.
   * @param times - array of keyframe times.
   * @param quaternions - array of [x, y, z, w] quaternion values.
   */
  addQuaternionTrack(
    selector: string,
    times: number[],
    quaternions: number[][],
  ): void {
    this.animation.addQuaternionTrack(
      selector,
      this.rendered.nestedGroup.groups[selector],
      times,
      quaternions,
    );
  }

  /**
   * Add a single-axis rotation animation track.
   * @param selector - path/id of group to be animated.
   * @param axis - which axis to rotate around ("x", "y", or "z").
   * @param times - array of keyframe times.
   * @param angles - array of rotation angles in degrees.
   */
  addRotationTrack(
    selector: string,
    axis: Axis,
    times: number[],
    angles: number[],
  ): void {
    this.animation.addRotationTrack(
      selector,
      this.rendered.nestedGroup.groups[selector],
      axis,
      times,
      angles,
    );
  }

  /**
   * Initialize the animation.
   * @param duration - overall duration of the animation.
   * @param speed - speed of the animation.
   * @param label - animation label.
   * @param repeat - whether to repeat the animation.
   */
  initAnimation(
    duration: number,
    speed: number,
    label: string = "A",
    repeat: boolean = true,
  ): void {
    if (this.animation == null || this.animation.tracks.length === 0) {
      logger.error("Animation does not have tracks");
      return;
    }
    logger.debug("Animation initialized");
    if (!this.hasAnimationLoop) {
      this.toggleAnimationLoop(true);
    }

    this.state.set("animationMode", label === "E" ? "explode" : "animation");
    this.clipAction = this.animation.animate(
      this.rendered.nestedGroup.rootGroup!,
      duration,
      speed,
      repeat,
    );
    // Reset animation slider to start
    this.state.set("animationSliderValue", 0);
  }

  /**
   * Check whether animation object exists
   */
  hasAnimation(): boolean {
    return !!this.animation.clipAction;
  }

  /**
   * Clear the animation object and dispose dependent objects
   */
  clearAnimation(): void {
    if (this.animation) {
      deepDispose(this.animation);
    }
    this.state.set("animationMode", "none");
    this.toggleAnimationLoop(false);
  }

  /**
   * Set the animation to a specific relative time (0-1).
   * Pauses the animation at that point.
   * @param fraction - relative time between 0 and 1.
   */
  setRelativeTime(fraction: number): void {
    this.animation.setRelativeTime(fraction);
    this.state.set("animationSliderValue", fraction * 1000);
  }

  /**
   * Get the current relative animation time (0-1).
   * @returns relative time between 0 and 1.
   */
  getRelativeTime(): number {
    return this.animation.getRelativeTime();
  }

  // ---------------------------------------------------------------------------
  // Render Loop & Scene Updates
  // ---------------------------------------------------------------------------

  /**
   * Creates ChangeNotification object if new value != old value and sends change notifications via viewer.notifyCallback.
   * @param changes - change information.
   * @param notify - whether to send notification or not.
   */
  checkChanges = (
    changes: Record<string, unknown>,
    notify: boolean = true,
  ): void => {
    const changed: Record<string, StateChange<unknown>> = {};
    Object.keys(changes).forEach((key) => {
      if (!isEqual(this.lastNotification[key], changes[key])) {
        const change = structuredClone(changes[key]);
        changed[key] = {
          new: change,
          // map undefined in lastNotification to null to enable JSON exchange
          old:
            this.lastNotification[key] == null
              ? null
              : structuredClone(this.lastNotification[key]),
        };
        this.lastNotification[key] = change;
      }
    });

    if (Object.keys(changed).includes("position")) {
      if (this.keepHighlight) {
        this.keepHighlight = false;
      } else {
        this.state.set("highlightedButton", null);
      }
    }

    if (notify && this.notifyCallback && Object.keys(changed).length) {
      this.notifyCallback(changed);
    }
  };

  /**
   * Notifies the states by checking for changes and passing the states to the checkChanges method.
   */
  notifyStates = (): void => {
    this.checkChanges({ states: this.getStates() }, true);
  };

  /**
   * Render scene and update orientation marker
   * If no animation loop exists, this needs to be called manually after every camera/scene change
   * @param updateMarker - whether to update the orientation marker
   * @param notify - whether to send notification or not.
   */
  update = (updateMarker: boolean, notify: boolean = true): void => {
    if (!this.ready) return;

    this.renderer.clear();

    if (
      this.raycaster &&
      this.raycaster.raycastMode &&
      !this.rendered.controls.isInteracting()
    ) {
      this.handleRaycast();
    }

    this.rendered.gridHelper.update(this.rendered.camera.getZoom());

    this.renderer.setViewport(
      0,
      0,
      this.state.get("cadWidth"),
      this.state.get("height"),
    );
    this.renderer.render(this.rendered.scene, this.rendered.camera.getCamera());
    this.cadTools.update();

    this.rendered.directLight.position.copy(this.rendered.camera.getCamera().position);

    if (
      this.lastBbox != null &&
      (this.lastBbox.needsUpdate || this.bboxNeedsUpdate)
    ) {
      console.debug("updated bbox");
      this.lastBbox.bbox.update();
      this.lastBbox.needsUpdate = false;
    }

    if (updateMarker) {
      this.renderer.clearDepth(); // ensure orientation Marker is at the top

      this.rendered.orientationMarker.update(
        this.rendered.camera.getPosition().clone().sub(this.rendered.controls.getTarget()),
        this.rendered.camera.getQuaternion(),
      );
      this.rendered.orientationMarker.render(this.renderer);
    }

    if (this.animation) {
      this.animation.update();
    }

    this.checkChanges(
      {
        zoom: this.rendered.camera.getZoom(),
        position: this.rendered.camera.getPosition().toArray(),
        quaternion: this.rendered.camera.getQuaternion().toArray(),
        target: this.rendered.controls.getTarget().toArray(),
      },
      notify,
    );
  };

  /**
   * Start the animation loop
   */
  animate = (): void => {
    if (this.continueAnimation) {
      requestAnimationFrame(this.animate);
      this.rendered.controls.update();
      this.update(true, true);
    } else {
      console.debug("three-cad-viewer: Animation loop stopped");
    }
  };

  toggleAnimationLoop(flag: boolean): void {
    if (flag) {
      this.continueAnimation = true;
      this.hasAnimationLoop = true;
      this.rendered.controls.removeChangeListener();
      console.debug("three-cad-viewer: Change listener removed");
      this.animate();
      console.debug("three-cad-viewer: Animation loop started");
    } else {
      if (this.hasAnimationLoop) {
        console.debug("three-cad-viewer: Turning animation loop off");
      }
      this.continueAnimation = false;
      this.hasAnimationLoop = false;
      this.rendered.controls.addChangeListener(() => this.update(true, true));
      console.debug("three-cad-viewer: Change listener registered");

      // ensure last animation cycle has finished
      setTimeout(() => this.update(true, true), 50);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup & Disposal
  // ---------------------------------------------------------------------------

  /**
   * Remove all assets and event handlers. Call when done with the viewer.
   *
   * This disposes:
   * - WebGL renderer and context
   * - All Three.js objects (geometries, materials, textures)
   * - Event listeners
   * - CAD tools and raycaster
   *
   * After calling dispose(), the viewer instance should not be used.
   *
   * @public
   */
  dispose(): void {
    this.clear();

    // dispose renderer
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    // forceContextLoss may not exist in test mocks
    if (typeof this.renderer.forceContextLoss === "function") {
      this.renderer.forceContextLoss();
    }
    console.debug("three-cad-viewer: WebGL context disposed");

    this.materialSettings = null;
    this.compactTree = null;
    deepDispose(this.cadTools);
    this.clipAction = null;
    this.lastNotification = {};
    this.clipNormal0 = null;
    this.clipNormal1 = null;
    this.clipNormal2 = null;
    this.renderOptions = null;
    this.tree = null;
    // Info is owned by Display
    this.bbox = null;
    this._stencilCSize = 0;
    this._treeNeedsRebuild = false;

    // Flush any pending deferred disposals
    for (const obj of this._pendingDisposal) {
      deepDispose(obj);
    }
    this._pendingDisposal = [];

    this.keymap = null;
    if (this.raycaster) {
      this.raycaster.dispose();
      this.raycaster = null;
    }
  }

  /**
   * Clear the current CAD view without disposing the renderer.
   *
   * Use this to remove shapes before rendering new ones.
   * The viewer remains usable after clear().
   *
   * @public
   */
  clear(): void {
    if (this._rendered) {
      // stop animation
      this.hasAnimationLoop = false;
      this.continueAnimation = false;

      // remove change listener if exists
      this._rendered.controls.removeChangeListener();
      console.debug("three-cad-viewer: Change listener removed");

      this.hasAnimationLoop = false;
      this.state.set("animationMode", "none");

      if (this.animation != null) {
        deepDispose(this.animation);
      }

      // Reset zscale state
      if (this.shapes?.format === "GDS") {
        this.state.set("zscaleActive", false);
      }

      // Reset to tree tab for next render
      this.state.set("activeTab", "tree");

      // clear render canvas
      this.renderer.clear();

      // deselect measurement tools
      if (this.cadTools) {
        this.cadTools.disable();
        const currentTool = this.state.get("activeTool");
        if (currentTool != null) {
          this.state.set("activeTool", null);
          this.display.setTool(currentTool, false);
        }
      }

      // dispose all rendered state objects
      deepDispose(this._rendered.scene);
      deepDispose(this._rendered.gridHelper);
      deepDispose(this._rendered.clipping);
      deepDispose(this._rendered.camera);
      deepDispose(this._rendered.controls);
      deepDispose(this._rendered.treeview);

      // clear tree view
      this.display.clearCadTree();

      // clear info
      deepDispose(this.info);

      this._rendered = null;
      this.ready = false;
    }

    if (this.shapes != null) {
      // Shapes is data (not THREE.js objects), setting to null allows GC
      this.shapes = null;
    }

    if (this.expandedNestedGroup != null) {
      deepDispose(this.expandedNestedGroup);
      this.expandedNestedGroup = null;
    }
    if (this.compactNestedGroup != null) {
      deepDispose(this.compactNestedGroup);
      this.compactNestedGroup = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Scene Rendering & Tree Management
  // ---------------------------------------------------------------------------

  /**
   * Synchronizes the states of two tree structures recursively.
   *
   * @param compactTree - The compact tree structure.
   * @param expandedTree - The expanded tree structure.
   * @param exploded - Whether rendering in exploded mode.
   * @param path - The current path in the tree structure.
   */
  syncTreeStates = (
    compactTree: ShapeTreeData | VisibilityState,
    expandedTree: ShapeTreeData | VisibilityState,
    exploded: boolean,
    path: string,
  ): void => {
    // Leaf case: compactTree is a VisibilityState, expandedTree has type/label structure
    if (isVisibilityState(compactTree)) {
      // expandedTree must be ShapeTreeData at this point (type level: shapes/edges/vertices)
      if (!isShapeTreeData(expandedTree)) return;
      const expandedData = expandedTree;

      if (exploded) {
        // Apply compact state to all expanded children
        for (const typeKey in expandedData) {
          const typeNode = expandedData[typeKey];
          if (!isShapeTreeData(typeNode)) continue;

          for (const labelKey in typeNode) {
            const leafState = typeNode[labelKey];
            if (!isVisibilityState(leafState)) continue;

            const id = `${path}/${typeKey}/${labelKey}`;
            const objectGroup = this.expandedNestedGroup!.groups[id];
            if (!isObjectGroup(objectGroup)) continue;

            objectGroup.setShapeVisible(compactTree[0] === 1);
            objectGroup.setEdgesVisible(compactTree[1] === 1);

            // Sync state (unless disabled = 3)
            if (leafState[0] !== 3) leafState[0] = compactTree[0];
            if (leafState[1] !== 3) leafState[1] = compactTree[1];
          }
        }
      } else {
        // Compute visibility from expanded children
        const objectGroup = this.compactNestedGroup!.groups[path];
        if (!isObjectGroup(objectGroup)) return;

        let shapeVisible = false;
        let edgeVisible = false;

        for (const typeKey in expandedData) {
          const typeNode = expandedData[typeKey];
          if (!isShapeTreeData(typeNode)) continue;

          for (const labelKey in typeNode) {
            const leafState = typeNode[labelKey];
            if (!isVisibilityState(leafState)) continue;

            if (leafState[0] === 1) shapeVisible = true;
            if (leafState[1] === 1) edgeVisible = true;
          }
        }

        objectGroup.setShapeVisible(shapeVisible);
        objectGroup.setEdgesVisible(edgeVisible);

        // Sync compact state (unless disabled = 3)
        if (compactTree[0] !== 3) compactTree[0] = shapeVisible ? 1 : 0;
        if (compactTree[1] !== 3) compactTree[1] = edgeVisible ? 1 : 0;
      }
    } else {
      // Branch case: recurse into children
      if (!isShapeTreeData(expandedTree)) return;
      const expandedData = expandedTree;
      for (const key in compactTree) {
        const id = `${path}/${key}`;
        this.syncTreeStates(compactTree[key], expandedData[key], exploded, id);
      }
    }
  };

  /**
   * Get the color of a node from its path
   * @param path - path of the CAD object
   */
  getNodeColor = (path: string): string | null => {
    // Use _rendered directly since this may be called during initial render
    // before _rendered is fully set up
    if (!this._rendered) {
      return null;
    }
    const group = this._rendered.nestedGroup.groups["/" + path];
    if (group instanceof ObjectGroup) {
      if (group.front) {
        return "#" + group.front.material.color.getHexString();
      }
    }
    return null;
  };

  /**
   * Build nestedGroup and treeview for initial render.
   * @param scene - The scene to add the group to
   * @param expanded - whether to render the exploded or compact version
   * @returns The nestedGroup and treeview
   */
  private buildInitialGroup(
    scene: THREE.Scene,
    expanded: boolean,
  ): { nestedGroup: NestedGroup; treeview: TreeView } {
    const timer = new Timer("buildInitialGroup", this.state.get("timeit"));

    this.setRenderDefaults(this.renderOptions!);
    const result = this.renderTessellatedShapes(expanded, this.shapes!);
    const nestedGroup = result.group;

    if (expanded) {
      this.expandedNestedGroup = result.group;
      this.expandedTree = result.tree;
    } else {
      this.compactNestedGroup = result.group;
      this.compactTree = result.tree;
    }

    // Configure the nested group
    nestedGroup.setTransparent(this.state.get("transparent"));
    nestedGroup.setBlackEdges(this.state.get("blackEdges"));
    nestedGroup.setMetalness(this.state.get("metalness"));
    nestedGroup.setRoughness(this.state.get("roughness"));
    nestedGroup.setPolygonOffset(2);

    timer.split(`rendered${expanded ? " exploded" : " compact"} shapes`);

    this.tree = expanded ? this.expandedTree : this.compactTree;
    scene.children[0] = nestedGroup.rootGroup!;
    timer.split("added shapes to scene");

    if (!this.tree) {
      throw new Error("Tree not initialized");
    }
    const treeview = new TreeView(
      this.tree,
      this.display.cadTreeScrollContainer,
      this.setObject,
      this.handlePick,
      this.update,
      this.notifyStates,
      this.getNodeColor,
      this.state.get("theme"),
      this.state.get("newTreeBehavior"),
      false,
    );

    this.display.clearCadTree();
    const t = treeview.create();
    timer.split("created tree");

    this.display.addCadTree(t);
    treeview.render();
    timer.split("rendered tree");
    timer.stop();

    return { nestedGroup, treeview };
  }

  /**
   * Toggle the two version of the NestedGroup.
   * Must only be called after render() has completed.
   * @param expanded - whether to render the exploded or compact version
   */
  toggleGroup(expanded: boolean): void {
    if (!this.rendered) {
      throw new Error("toggleGroup called before render()");
    }

    const timer = new Timer("toggleGroup", this.state.get("timeit"));

    const _config = (group: NestedGroup): void => {
      group.setTransparent(this.state.get("transparent"));
      group.setBlackEdges(this.state.get("blackEdges"));
      group.setMetalness(this.state.get("metalness"));
      group.setRoughness(this.state.get("roughness"));
      group.setPolygonOffset(2);
    };

    let nestedGroup: NestedGroup;

    if (
      (this.compactNestedGroup == null && !expanded) ||
      (this.expandedNestedGroup == null && expanded)
    ) {
      this.setRenderDefaults(this.renderOptions!);
      const result = this.renderTessellatedShapes(expanded, this.shapes!);
      nestedGroup = result.group;

      if (expanded) {
        this.expandedNestedGroup = result.group;
        this.expandedTree = result.tree;
      } else {
        this.compactNestedGroup = result.group;
        this.compactTree = result.tree;
      }
      _config(nestedGroup);
      timer.split(`rendered${expanded ? " exploded" : " compact"} shapes`);
    } else {
      nestedGroup = expanded
        ? this.expandedNestedGroup!
        : this.compactNestedGroup!;
      _config(nestedGroup);
    }

    // only sync if both trees exist
    if (this.expandedTree) {
      this.syncTreeStates(this.compactTree!, this.expandedTree, expanded, "");
    }
    timer.split("synched tree states");

    this.tree = expanded ? this.expandedTree : this.compactTree;
    this.rendered.scene.children[0] = nestedGroup.rootGroup!;
    this.rendered.nestedGroup = nestedGroup;
    timer.split("added shapes to scene");

    deepDispose(this.rendered.treeview);
    if (!this.tree) {
      throw new Error("Tree not initialized");
    }
    const treeview = new TreeView(
      this.tree,
      this.display.cadTreeScrollContainer,
      this.setObject,
      this.handlePick,
      this.update,
      this.notifyStates,
      this.getNodeColor,
      this.state.get("theme"),
      this.state.get("newTreeBehavior"),
      false,
    );
    this.rendered.treeview = treeview;

    this.display.clearCadTree();
    const t = treeview.create();
    timer.split("created tree");

    this.display.addCadTree(t);
    treeview.render();
    timer.split("rendered tree");
    timer.stop();
  }

  /**
   * Set the active sidebar tab.
   * @param tabName - Tab name: "tree", "clip", "material", or "zebra"
   * @param notify - whether to send notification or not.
   */
  setActiveTab(tabName: ActiveTab, notify: boolean = true): void {
    this.state.set("activeTab", tabName, notify);
  }

  toggleTab(disable: boolean): void {
    const timer = new Timer("toggleTab", this.state.get("timeit"));
    this.setActiveTab("tree", false);
    timer.split("collapse tree");
    switch (this.state.get("collapse")) {
      case CollapseState.COLLAPSED:
        this.rendered.treeview.collapseAll();
        break;
      case CollapseState.ROOT:
        this.rendered.treeview.openLevel(1);
        break;
      case CollapseState.EXPANDED:
        this.rendered.treeview.expandAll();
        break;
      case CollapseState.LEAVES:
        this.rendered.treeview.openLevel(-1);
        break;
      default:
        break;
    }
    this.checkChanges({ states: this.getStates() }, true);
    timer.split("notify state changes");
    timer.stop();
    this.display.toggleClippingTab(!disable);
  }

  /**
   * Render a CAD object and build the navigation tree.
   *
   * This is the main entry point for displaying CAD geometry. It:
   * - Creates the Three.js scene with lights, camera, and controls
   * - Tessellates and renders the shape geometry
   * - Builds the navigation tree UI
   * - Sets up clipping planes and helpers
   *
   * @param shapes - the Shapes object representing the tessellated CAD object
   * @param renderOptions - the render options (edge color, opacity, etc.)
   * @param viewerOptions - the viewer options (camera position, clipping, etc.)
   * @public
   */
  render(
    shapes: Shapes,
    renderOptions: RenderOptions,
    viewerOptions: ViewerOptions,
  ): void {
    this.shapes = shapes;
    this.renderOptions = renderOptions;
    this.setViewerDefaults(viewerOptions);

    this.animation.cleanBackup();

    const timer = new Timer("viewer", this.state.get("timeit"));

    const scene = new THREE.Scene();

    //
    // add shapes and cad tree
    //

    const { nestedGroup, treeview } = this.buildInitialGroup(scene, false);
    timer.split("scene and tree done");

    if (!this.bbox) {
      this.bbox = nestedGroup.boundingBox();
    }
    const center = new THREE.Vector3();
    this.bbox.getCenter(center);
    this.bb_max = this.bbox.max_dist_from_center();
    this.bb_radius = Math.max(
      this.bbox.boundingSphere().radius,
      center.length(),
    );
    timer.split("bounding box");

    //
    // create cameras
    //
    const camera = new Camera(
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.bb_radius,
      viewerOptions.target ?? this.bbox.center(),
      this.state.get("ortho"),
      viewerOptions.up ?? this.state.get("up"),
    );

    //
    // build mouse/touch controls
    //
    const controls = new Controls(
      this.state.get("control"),
      camera.getCamera(),
      new THREE.Vector3(...(viewerOptions.target ?? this.bbox.center())),
      this.renderer.domElement,
      this.state.get("rotateSpeed"),
      this.state.get("zoomSpeed"),
      this.state.get("panSpeed"),
      this.state.get("holroyd"),
    );
    // Disable keyboard controls (these properties exist on THREE.js controls internally)
    controls.controls.enableKeys = false;

    // ensure panning works for screen coordinates (only exists on OrbitControls)
    if ("screenSpacePanning" in controls.controls) {
      controls.controls.screenSpacePanning = true;
    }

    //
    // add lights
    //

    const ambientLight = new THREE.AmbientLight(
      0xffffff,
      scaleLight(this.state.get("ambientIntensity")),
    );
    scene.add(ambientLight);

    const directLight = new THREE.DirectionalLight(
      0xffffff,
      scaleLight(this.state.get("directIntensity")),
    );
    scene.add(directLight);

    //
    // add grid helpers
    //

    const gridHelper = new Grid({
      bbox: this.bbox,
      ticks: this.state.get("ticks"),
      gridFontSize: this.state.get("gridFontSize"),
      centerGrid: this.state.get("centerGrid"),
      axes0: this.state.get("axes0"),
      grid: [...this.state.get("grid")],
      flipY: viewerOptions.up === "Z",
      theme: this.state.get("theme"),
      cadWidth: this.state.get("cadWidth"),
      height: this.state.get("height"),
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      tickValueElement: this.display.tickValueElement,
      tickInfoElement: this.display.tickInfoElement,
      getCamera: () => this._rendered?.camera.getCamera() ?? null,
      getAxes0: () => this.state?.get("axes0") ?? false,
    });
    gridHelper.computeGrid();

    scene.add(gridHelper);

    this.gridSize = gridHelper.size;

    //
    // add axes helper
    //

    const axesHelper = new AxesHelper(
      this.bbox.center(),
      this.gridSize / 2,
      2,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.state.get("axes0"),
      this.state.get("axes"),
      this.state.get("theme"),
    );
    scene.add(axesHelper);

    //
    // set up clipping planes and helpers
    //
    const cSize =
      1.1 *
      Math.max(
        Math.abs(this.bbox.min.length()),
        Math.abs(this.bbox.max.length()),
      );
    this._stencilCSize = cSize;
    const clipping = new Clipping(
      this.bbox.center(),
      2 * cSize,
      nestedGroup,
      {
        onNormalChange: (index, normalArray) =>
          this.display.setNormalLabel(index, normalArray),
      },
      this.state.get("theme"),
    );

    scene.add(clipping);

    // Theme is already resolved ("light" or "dark") by ViewerState constructor
    const theme = this.state.get("theme");

    //
    // set up the orientation marker
    //

    const orientationMarker = new OrientationMarker(
      80,
      80,
      camera.getCamera(),
      theme,
    );
    orientationMarker.create();

    //
    // Assemble rendered state
    //
    this._rendered = {
      scene,
      camera,
      controls,
      nestedGroup,
      gridHelper,
      axesHelper,
      clipping,
      treeview,
      orientationMarker,
      ambientLight,
      directLight,
    };

    // Now that rendered state exists, configure camera position
    if (viewerOptions.position == null && viewerOptions.quaternion == null) {
      this.presetCamera("iso", this.state.get("zoom"));
      this.state.set("highlightedButton", "iso");
    } else if (viewerOptions.position != null) {
      this.setCamera(
        false,
        new THREE.Vector3(...viewerOptions.position),
        viewerOptions.quaternion
          ? new THREE.Quaternion(...viewerOptions.quaternion)
          : null,
        this.state.get("zoom"),
      );
      if (viewerOptions.quaternion == null) {
        camera.lookAtTarget();
      }
    } else {
      this.display.addInfoHtml(
        "<b>quaternion needs position to be provided, falling back to ISO view</b>",
      );
      this.presetCamera("iso", this.state.get("zoom"));
    }
    controls.update();

    // Save the new state again
    controls.saveState();

    this.setAmbientLight(this.state.get("ambientIntensity"));
    this.setDirectLight(this.state.get("directIntensity"));

    this.display.setSliderLimits(this.gridSize / 2);
    this.display.syncClipSlidersFromState();

    // Compute clip slider values (used later after ready=true)
    const clipSlider0 =
      viewerOptions.clipSlider0 != null
        ? viewerOptions.clipSlider0
        : this.gridSize / 2;
    const clipSlider1 =
      viewerOptions.clipSlider1 != null
        ? viewerOptions.clipSlider1
        : this.gridSize / 2;
    const clipSlider2 =
      viewerOptions.clipSlider2 != null
        ? viewerOptions.clipSlider2
        : this.gridSize / 2;

    nestedGroup.setClipPlanes(clipping.clipPlanes);

    this.setLocalClipping(false); // only allow clipping when Clipping tab is selected

    clipping.setVisible(false);

    this.toggleTab(false);

    //
    // update UI elements
    //

    this.display.updateUI();
    timer.split("ui updated");
    this.display.autoCollapse();

    timer.split("stencil done");
    //
    // show the rendering
    //

    this.toggleAnimationLoop(this.hasAnimationLoop);

    this.ready = true;

    // Apply clip settings AFTER ready=true (clip setters check this.ready)
    // Set normals first (if provided), passing slider values to avoid reset to gridSize/2
    this.setClipNormal(0, viewerOptions.clipNormal0 ?? null, clipSlider0, true);
    this.setClipNormal(1, viewerOptions.clipNormal1 ?? null, clipSlider1, true);
    this.setClipNormal(2, viewerOptions.clipNormal2 ?? null, clipSlider2, true);
    // Set sliders for any planes without custom normals (setClipNormal returns early if normal is null)
    this.setClipSlider(0, clipSlider0, true);
    this.setClipSlider(1, clipSlider1, true);
    this.setClipSlider(2, clipSlider2, true);
    this.setClipIntersection(viewerOptions.clipIntersection ?? false, true);
    this.setClipObjectColorCaps(viewerOptions.clipObjectColors ?? false, true);
    this.setClipPlaneHelpers(viewerOptions.clipPlaneHelpers ?? false, true);

    this.display.showReadyMessage(version, this.state.get("control"));
    timer.split("show done");

    // Notify computed values and all config defaults
    if (this.notifyCallback) {
      this.notifyCallback({
        // Computed values from controls/camera
        target: { old: null, new: toVector3Tuple(controls.target.toArray()) },
        target0: { old: null, new: toVector3Tuple(controls.target0.toArray()) },
        position: { old: null, new: this.rendered.camera.getPosition().toArray() },
        quaternion: { old: null, new: this.rendered.camera.getQuaternion().toArray() },
        zoom: { old: null, new: this.rendered.camera.getZoom() },
        // All config values from state
        ...this.state.getAllNotifiable(),
      });
    }
    timer.split("notification done");

    this.update(true, false);
    treeview.update();
    this.display.setTheme(this.state.get("theme"));

    this.setZebraCount(this.state.get("zebraCount"));
    this.setZebraDirection(this.state.get("zebraDirection"));
    this.setZebraOpacity(this.state.get("zebraOpacity"));
    this.setZebraColorScheme(this.state.get("zebraColorScheme"));
    this.setZebraMappingMode(this.state.get("zebraMappingMode"));

    timer.split("update done");
    timer.stop();
  }

  // ---------------------------------------------------------------------------
  // Camera Controls
  // ---------------------------------------------------------------------------

  /**
   * Move the camera to a given location.
   * @param relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param position - the camera position as THREE.Vector3
   * @param quaternion - the camera rotation expressed by a quaternion.
   * @param zoom - zoom value.
   * @param notify - whether to send notification or not.
   * @public
   */
  setCamera = (
    relative: boolean,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion | null = null,
    zoom: number | null = null,
    notify: boolean = true,
  ): void => {
    this.rendered.camera.setupCamera(relative, position, quaternion, zoom);
    this.update(true, notify);
  };

  /**
   * Move the camera to one of the preset locations.
   * @param dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   * @param zoom - zoom value
   * @param notify - whether to send notification or not.
   * @public
   */
  presetCamera = (
    dir: CameraDirection,
    zoom: number | null = null,
    notify: boolean = true,
  ): void => {
    this.rendered.camera.target = new THREE.Vector3(...this.bbox!.center());
    this.rendered.camera.presetCamera(dir, zoom);
    this.rendered.controls.setTarget(this.rendered.camera.target);
    this.update(true, notify);
  };

  /**
   * Get reset location value.
   * @returns target, position, quaternion, zoom as object.
   */
  getResetLocation = (): ResetLocation => {
    return this.rendered.controls.getResetLocation();
  };

  /**
   * Set reset location value.
   * @param target - camera target as 3 dim Array [x,y,z].
   * @param position - camera position as 3 dim Array [x,y,z].
   * @param quaternion - camera rotation as 4 dim quaternion array [x,y,z,w].
   * @param zoom - camera zoom value.
   * @param notify - whether to send notification or not.
   */
  setResetLocation = (
    target: Vector3Tuple,
    position: Vector3Tuple,
    quaternion: QuaternionTuple,
    zoom: number,
    notify: boolean = true,
  ): void => {
    const location = this.getResetLocation();
    this.rendered.controls.setResetLocation(
      new THREE.Vector3(...target),
      new THREE.Vector3(...position),
      new THREE.Quaternion(...quaternion),
      zoom,
    );
    if (notify && this.notifyCallback) {
      this.notifyCallback({
        target0: {
          old: toVector3Tuple(location.target0.toArray()),
          new: target,
        },
        position0: {
          old: toVector3Tuple(location.position0.toArray()),
          new: position,
        },
        quaternion0: {
          old: toQuaternionTuple(location.quaternion0.toArray()),
          new: quaternion,
        },
        zoom0: { old: location.zoom0, new: zoom },
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Camera Type & Projection
  // ---------------------------------------------------------------------------

  /**
   * Get camera type.
   * @returns "ortho" or "perspective".
   */
  getCameraType(): string {
    return this.rendered.camera.ortho ? "ortho" : "perspective";
  }

  /**
   * Set camera mode to OrthographicCamera or PerspectiveCamera.
   * @param flag - true for orthographic, false for perspective
   * @param notify - whether to send notification or not.
   * @public
   */
  switchCamera(flag: boolean, notify: boolean = true): void {
    this.state.set("ortho", flag, notify);
    this.rendered.camera.switchCamera(flag);
    this.rendered.controls.setCamera(this.rendered.camera.getCamera());

    this.rendered.gridHelper.scaleLabels();
    this.rendered.gridHelper.update(this.rendered.camera.getZoom(), true);

    this.update(true);
  }

  /**
   * Recenter camera on the bounding box center of all objects.
   * @param notify - whether to send notification or not.
   */
  recenterCamera(notify: boolean = true): void {
    const target = new THREE.Vector3(...this.bbox!.center());
    this.setCameraTarget(target);
    this.update(true, notify);
  }

  /**
   * Centers the camera view on all visible objects in the scene.
   * Calculates a bounding box that encompasses all visible ObjectGroup instances
   * and sets the camera target to the center of that bounding box.
   *
   * @param notify - Whether to notify listeners of the camera update
   */
  centerVisibleObjects(notify: boolean = true): void {
    const groups = this.rendered.nestedGroup.groups;

    const bbox = new BoundingBox();
    for (const path in groups) {
      const obj = groups[path];
      if (obj instanceof ObjectGroup) {
        if (obj.getVisibility()) {
          bbox.expandByObject(obj);
        }
      }
    }
    const target = new THREE.Vector3(...bbox.center());
    this.setCameraTarget(target);
    this.update(true, notify);
  }

  /**
   * Reset zoom to 1.0.
   * @public
   */
  resize = (): void => {
    this.rendered.camera.changeDimensions(
      this.bb_radius,
      this.state.get("cadWidth"),
      this.state.get("height"),
    );
    this.rendered.camera.setZoom(1.0);
    this.rendered.camera.updateProjectionMatrix();
    this.update(true);
  };

  /**
   * Reset the view to the initial camera and controls settings.
   * @public
   */
  reset = (): void => {
    this.rendered.camera.changeDimensions(
      this.bb_radius,
      this.state.get("cadWidth"),
      this.state.get("height"),
    );
    this.rendered.controls.reset();
    this.update(true);
  };

  /**
   * Enable/disable local clipping
   * @param flag - whether to enable local clipping
   */
  setLocalClipping(flag: boolean): void {
    this.renderer.localClippingEnabled = flag;
    this.update(this.updateMarker);
  }

  // ---------------------------------------------------------------------------
  // Object Visibility & Bounding Box
  // ---------------------------------------------------------------------------

  /**
   * Sets the visibility state of an object in the viewer.
   *
   * @param path - The path of the object.
   * @param state - The visibility state (0 or 1).
   * @param iconNumber - The icon number.
   * @param notify - Whether to notify the changes.
   * @param update - Whether to update the view.
   */
  setObject = (
    path: string,
    state: number,
    iconNumber: number,
    notify: boolean = true,
    update: boolean = true,
  ): void => {
    const objectGroup = this.rendered.nestedGroup.groups[path];
    if (objectGroup != null && objectGroup instanceof ObjectGroup) {
      if (iconNumber === 0) {
        objectGroup.setShapeVisible(state === 1);
      } else {
        objectGroup.setEdgesVisible(state === 1);
      }
      if (notify) {
        const stateObj: Record<string, VisibilityState> = {};
        const state_ = this.getState(path);
        if (state_) stateObj[path] = state_;
      }
      if (update) {
        this.update(this.updateMarker);
      }
    }
  };

  /**
   * Sets the bounding box for a given ID.
   * @param id - The ID of the group.
   */
  setBoundingBox = (id: string): void => {
    const group = this.rendered.nestedGroup.groups[id];
    if (group != null) {
      if (this.lastBbox != null) {
        this.rendered.scene.remove(this.lastBbox.bbox);
        this.lastBbox.bbox.geometry.dispose();
        const mat = this.lastBbox.bbox.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
      if (
        this.lastBbox == null ||
        (this.lastBbox != null && id !== this.lastBbox.id)
      ) {
        this.lastBbox = {
          id: id,
          bbox: new BoxHelper(group, 0xff00ff),
          needsUpdate: false,
        };
        this.rendered.scene.add(this.lastBbox.bbox);
      } else {
        this.lastBbox = null;
      }

      this.update(false, false);
    }
  };

  /**
   * Refresh clipping plane
   * @param index - index of the plane: 0,1,2
   * @param value - distance on the clipping normal from the center
   */
  refreshPlane = (index: ClipIndex, value: number): void => {
    if (!this.ready) return;
    const sliderKeys = ["clipSlider0", "clipSlider1", "clipSlider2"] as const;
    this.state.set(sliderKeys[index], value);
    this.rendered.clipping.setConstant(index, value);
    this.update(this.updateMarker);
  };

  /**
   * Backup animation (for switch to explode animation)
   */
  backupAnimation(): void {
    if (this.animation.hasTracks()) {
      this.animation.backup();
    }
  }

  /**
   * Restore animation (for switch back from explode animation)
   */
  restoreAnimation(): void {
    if (this.animation.hasBackup()) {
      const params = this.animation.restore();
      this.initAnimation(params.duration!, params.speed!, "A", params.repeat!);
    }
  }

  /**
   * Handler for the animation control
   * @param btn - the pressed button as string: "play", "pause", "stop"
   */
  controlAnimation = (btn: string): void => {
    if (!this.clipAction) return;
    switch (btn) {
      case "play":
        if (this.clipAction.paused) {
          this.clipAction.paused = false;
        }
        this.clipAction.play();
        break;
      case "pause":
        this.clipAction.paused = !this.clipAction.paused;
        break;
      case "stop":
        this.clipAction.stop();
        break;
    }
  };

  /**
   * Set state of one entry of a treeview leaf given by an id
   * @param id - object id
   * @param state - 2 dim array [mesh, edges] = [0/1, 0/1]
   * @param _nodeType - node type (unused)
   * @param notify - whether to send notification or not.
   */
  setState = (
    id: string,
    state: VisibilityState,
    _nodeType: string = "leaf",
    notify: boolean = true,
  ): void => {
    this.rendered.treeview.setState(id, state);
    this.update(this.updateMarker, notify);
  };

  removeLastBbox(): void {
    if (this.lastBbox != null) {
      this.rendered.scene.remove(this.lastBbox.bbox);
      this.lastBbox.bbox.dispose();
      this.lastBbox = null;
    }
  }

  /**
   * Handle bounding box and notifications for picked elements
   * @param path - path of object
   * @param name - name of object (id = path/name)
   * @param meta - meta key pressed
   * @param shift - shift key pressed
   * @param alt - alt key pressed
   * @param point - picked point
   * @param nodeType - node type
   * @param tree - whether from tree
   */
  handlePick = (
    path: string,
    name: string,
    meta: boolean,
    shift: boolean,
    _alt: boolean,
    point: THREE.Vector3 | null,
    nodeType: string | null = "leaf",
    tree: boolean = false,
  ): void => {
    const id = `${path}/${name}`;
    const object = this.rendered.nestedGroup.groups[id];
    if (object == null) {
      return;
    }
    let boundingBox: BoundingBox;
    if (object.parent != null) {
      boundingBox = new BoundingBox().setFromObject(object, true);
    } else {
      // ignore PlaneMesh group
      boundingBox = new BoundingBox();
      for (let i = 0; i < object.children.length - 1; i++) {
        boundingBox = boundingBox.expandByObject(object.children[i]);
      }
    }

    if (this.lastBbox != null && this.lastBbox.id === id && !meta && !shift) {
      this.removeLastBbox();
      this.rendered.treeview.toggleLabelColor(null, id);
    } else {
      this.checkChanges({
        lastPick: {
          path: path,
          name: name,
          boundingBox: boundingBox,
          boundingSphere: boundingBox.boundingSphere(),
        },
      });

      if (this.animation.clipAction?.isRunning()) {
        this.bboxNeedsUpdate = true;
      }

      if (shift && meta) {
        this.removeLastBbox();
        if (tree) {
          this.rendered.treeview.hideAll();
          this.setState(id, [1, 1], nodeType ?? "leaf");
        } else {
          const center = boundingBox.center();
          this.setCameraTarget(point ?? new THREE.Vector3(...center));
          this.display.showCenterInfo(center);
        }
      } else if (shift) {
        this.removeLastBbox();
        this.rendered.treeview.hideAll();
        this.setState(id, [1, 1], nodeType ?? "leaf");
        const center = boundingBox.center();
        this.setCameraTarget(new THREE.Vector3(...center));
        this.display.showCenterInfo(center);
      } else if (meta) {
        this.setState(id, [0, 0], nodeType ?? "leaf");
      } else {
        this.display.showBoundingBoxInfo(path, name, boundingBox);
        this.setBoundingBox(id);
        this.rendered.treeview.openPath(id);
      }
    }
    this.update(true);
  };

  // ---------------------------------------------------------------------------
  // Object Picking & Selection
  // ---------------------------------------------------------------------------

  setPickHandler(flag: boolean): void {
    if (flag) {
      this.renderer.domElement.addEventListener("dblclick", this.pick, false);
    } else {
      this.renderer.domElement.removeEventListener(
        "dblclick",
        this.pick,
        false,
      );
    }
  }

  /**
   * Find the shape that was double clicked and send notification
   * @param e - a DOM PointerEvent or MouseEvent
   */
  pick = (e: PointerEvent | MouseEvent): void => {
    const raycaster = new Raycaster(
      this.rendered.camera,
      this.renderer.domElement,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.bb_max / 30,
      this.rendered.scene.children[0],
      () => {},
    );
    raycaster.init();
    raycaster.onPointerMove(e);

    const validObjs = raycaster.getIntersectedObjs();
    if (validObjs.length === 0) {
      return;
    }

    // Find first mesh intersection
    let nearestMesh: THREE.Mesh | null = null;
    let nearestIntersection: THREE.Intersection | null = null;
    for (const obj of validObjs) {
      if (obj.object instanceof THREE.Mesh) {
        nearestMesh = obj.object;
        nearestIntersection = obj;
        break;
      }
    }
    if (nearestMesh == null || nearestIntersection == null) {
      return;
    }

    const point = nearestIntersection.point;
    const shapesFormat = this.shapes?.format;
    const grandparent = nearestMesh.parent?.parent;
    const nearest = {
      path: grandparent ? grandparent.name.replaceAll("|", "/") : "",
      name: nearestMesh.name,
      boundingBox:
        shapesFormat === "GDS"
          ? new THREE.Box3(
              point.clone().subScalar(10),
              point.clone().addScalar(10),
            )
          : nearestMesh.geometry.boundingBox,
      boundingSphere:
        shapesFormat === "GDS"
          ? new THREE.Sphere(point, 1)
          : nearestMesh.geometry.boundingSphere,
      objectGroup: nearestMesh.parent,
    };
    this.handlePick(
      nearest.path,
      nearest.name,
      KeyMapper.get(e, "meta"),
      KeyMapper.get(e, "shift"),
      KeyMapper.get(e, "alt"),
      nearestIntersection.point,
      null,
      false,
    );
    raycaster.dispose();
  };

  // ---------------------------------------------------------------------------
  // CAD Tools & Raycasting
  // ---------------------------------------------------------------------------

  clearSelection = (): void => {
    this.rendered.nestedGroup.clearSelection();
    this.cadTools.handleResetSelection();
  };

  _releaseLastSelected = (): void => {
    if (this.lastObject != null) {
      const objs = this.lastObject.objs();
      for (const obj of objs) {
        obj.unhighlight(true);
      }
    }
  };

  _removeLastSelected = (): void => {
    if (this.lastSelection != null) {
      const objs = this.lastSelection.objs();
      for (const obj of objs) {
        obj.unhighlight(false);
        this.rendered.treeview.toggleLabelColor(
          null,
          obj.name.replaceAll(this.rendered.nestedGroup.delim, "/"),
        );
      }
      this.lastSelection = null;
      this.lastObject = null;
    }
    this.cadTools.handleRemoveLastSelection(true);
  };

  /**
   * Set raycast mode
   * @param flag - turn raycast mode on or off
   */
  setRaycastMode(flag: boolean): void {
    if (flag) {
      // initiate raycasting
      this.raycaster = new Raycaster(
        this.rendered.camera,
        this.renderer.domElement,
        this.state.get("cadWidth"),
        this.state.get("height"),
        this.bb_max / 30,
        this.rendered.scene.children[0],
        this.handleRaycastEvent,
      );
      this.raycaster.init();
    } else {
      if (this.raycaster) {
        this.raycaster.dispose();
      }
      this.raycaster = null;
    }
  }

  handleRaycast = (): void => {
    const objects = this.raycaster!.getValidIntersectedObjs();
    if (objects.length > 0) {
      // highlight hovered object(s)
      for (const object of objects) {
        {
          const objectGroup = object.object.parent;
          if (!isObjectGroup(objectGroup)) break;
          const name = objectGroup.name;
          const last_name = this.lastObject ? this.lastObject.obj.name : null;
          if (name !== last_name) {
            this._releaseLastSelected();
            const fromSolid = this.raycaster!.filters.topoFilter.includes(
              TopoFilter.solid,
            );

            // one object for a selected vertex, edge and face and multiple faces for a solid
            const pickedObj = new PickedObject(objectGroup, fromSolid);
            for (const obj of pickedObj.objs()) {
              obj.highlight(true);
            }
            // this object will be handled in handleRaycastEvent after a mouse event
            this.lastObject = pickedObj;
          }
          break;
        }
      }
    } else {
      // unhighlight hovered object(s)
      if (this.lastObject != null) {
        this._releaseLastSelected();
        this.lastObject = null;
      }
    }
  };

  handleRaycastEvent = (event: RaycastEvent): void => {
    if (event.key) {
      switch (event.key) {
        case "Escape":
          this.clearSelection();
          break;
        case "Backspace":
          this._removeLastSelected();
          break;
        default:
          break;
      }
    } else {
      switch (event.mouse) {
        case "left":
          if (this.lastObject != null) {
            const objs = this.lastObject.objs();
            // one object for a selected vertex, edge and face and multiple faces for a solid
            for (const obj of objs) {
              obj.toggleSelection();
            }
            this.cadTools.handleSelectedObj(
              this.lastObject,
              this.lastSelection?.obj.name !== this.lastObject.obj.name,
              event.shift ?? false,
            );
            this.lastSelection = this.lastObject;
          }
          break;
        case "right":
          this._removeLastSelected();
          break;
        default:
          break;
      }
    }
  };

  /**
   * Handle a backend response sent by the backend
   * The response is a JSON object sent by the Python backend through VSCode
   * @param response
   */
  handleBackendResponse = (response: BackendResponse): void => {
    if (isToolResponse(response)) {
      this.cadTools.handleResponse(response);
    }
  };

  // ---------------------------------------------------------------------------
  // Appearance (Axes, Grid, Visual Settings)
  // ---------------------------------------------------------------------------

  /**
   * Get whether axes helpers are visible.
   * @returns true if axes are shown
   * @public
   */
  getAxes(): boolean {
    return this.state.get("axes");
  }

  /**
   * Show or hide the axes helper (X/Y/Z indicators).
   * @param flag - true to show axes, false to hide
   * @param notify - whether to send notification to callback
   * @public
   */
  setAxes = (flag: boolean, notify: boolean = true): void => {
    if (!this.ready) return;
    this.state.set("axes", flag, notify);
    this.rendered.axesHelper.setVisible(flag);
    this.update(this.updateMarker);
  };

  /**
   * Show/hide grids
   * @param action - one of "grid" (all grids), "grid-xy","grid-xz", "grid-yz"
   * @param flag - visibility flag
   * @param notify - whether to send notification or not.
   */
  setGrid = (action: string, flag: boolean, notify: boolean = true): void => {
    this.rendered.gridHelper.setGrid(action, flag);
    // Copy array to avoid reference comparison issues in state.set
    const [a, b, c] = this.rendered.gridHelper.grid;
    this.state.set("grid", [a, b, c], notify);
    this.update(this.updateMarker);
  };

  /**
   * Get visibility of grids.
   * @returns grids value.
   */
  getGrids(): [boolean, boolean, boolean] {
    return this.state.get("grid");
  }

  /**
   * Toggle grid visibility
   * @param grids - 3 dim grid visibility (xy, xz, yz)
   * @param notify - whether to send notification or not.
   */
  setGrids = (
    grids: [boolean, boolean, boolean],
    notify: boolean = true,
  ): void => {
    this.rendered.gridHelper.setGrids(...grids);
    // Copy array to avoid reference comparison issues in state.set
    const [a, b, c] = this.rendered.gridHelper.grid;
    this.state.set("grid", [a, b, c], notify);
    this.update(this.updateMarker);
  };

  /**
   * Set grid center
   * @param center - true for centering grid at (0,0,0)
   * @param notify - whether to send notification or not.
   */
  setGridCenter = (center: boolean, notify: boolean = true): void => {
    this.state.set("centerGrid", center, notify);
    this.rendered.gridHelper.centerGrid = center;
    this.rendered.gridHelper.setCenter(
      this.state.get("axes0"),
      this.state.get("up") === "Z",
    );
    this.update(this.updateMarker);
  };

  /**
   * Get location of axes.
   * @returns axes0 value, true means at origin (0,0,0)
   */
  getAxes0(): boolean {
    return this.state.get("axes0");
  }

  /**
   * Set whether grids and axes center at the origin or the object's boundary box center
   * @param flag - whether grids and axes center at the origin (0,0,0)
   * @param notify - whether to send notification or not.
   */
  setAxes0 = (flag: boolean, notify: boolean = true): void => {
    if (!this.ready) return;
    this.state.set("axes0", flag, notify);
    this.rendered.gridHelper.setCenter(flag, this.state.get("up") === "Z");
    this.rendered.axesHelper.setCenter(flag);
    this.update(this.updateMarker);
  };

  /**
   * Get transparency state of CAD objects.
   * @returns transparent value.
   */
  getTransparent(): boolean {
    return this.state.get("transparent");
  }

  /**
   * Set CAD objects transparency.
   * @param flag - whether to show the CAD object in transparent mode
   * @param notify - whether to send notification or not.
   * @public
   */
  setTransparent = (flag: boolean, notify: boolean = true): void => {
    this.state.set("transparent", flag, notify);
    this.rendered.nestedGroup.setTransparent(flag);
    this.update(this.updateMarker);
  };

  /**
   * Get blackEdges value.
   * @returns blackEdges value.
   */
  getBlackEdges(): boolean {
    return this.state.get("blackEdges");
  }

  /**
   * Show edges in black or the default edge color.
   * @param flag - whether to show edges in black
   * @param notify - whether to send notification or not.
   * @public
   */
  setBlackEdges = (flag: boolean, notify: boolean = true): void => {
    this.state.set("blackEdges", flag, notify);
    this.rendered.nestedGroup.setBlackEdges(flag);
    this.update(this.updateMarker);
  };

  /**
   * Show or hide the CAD tools panel
   * @param flag - whether to show tools
   * @param notify - whether to send notification or not.
   */
  setTools = (flag: boolean, notify: boolean = true): void => {
    this.state.set("tools", flag, notify);
  };

  /**
   * Enable or disable glass mode (overlay navigation)
   * @param flag - whether to enable glass mode
   * @param notify - whether to send notification or not.
   */
  setGlass = (flag: boolean, notify: boolean = true): void => {
    this.state.set("glass", flag, notify);
  };

  /**
   * Get default color of the edges.
   * @returns edgeColor value.
   */
  getEdgeColor(): number {
    return this.state.get("edgeColor");
  }

  /**
   * Set the default edge color
   * @param color - edge color (0xrrggbb)
   * @param notify - whether to send notification or not.
   */
  setEdgeColor = (color: number, notify: boolean = true): void => {
    this.state.set("edgeColor", color, notify);
    this.rendered.nestedGroup.setEdgeColor(color);
    this.update(this.updateMarker);
  };

  /**
   * Get default opacity.
   * @returns opacity value.
   */
  getOpacity(): number {
    return this.state.get("defaultOpacity");
  }

  /**
   * Set the default opacity
   * @param opacity - opacity (between 0.0 and 1.0)
   * @param notify - whether to send notification or not.
   */
  setOpacity = (opacity: number, notify: boolean = true): void => {
    this.state.set("defaultOpacity", opacity, notify);
    this.rendered.nestedGroup.setOpacity(opacity);
    this.update(this.updateMarker);
  };

  /**
   * Get whether tools are shown/hidden.
   * @returns tools value.
   */
  getTools(): boolean {
    return this.state.get("tools");
  }

  /**
   * Show/hide the CAD tools
   * @param flag - visibility flag
   * @param notify - whether to send notification or not.
   */
  showTools = (flag: boolean, notify: boolean = true): void => {
    this.state.set("tools", flag, notify);
    this.update(this.updateMarker);
  };

  // ---------------------------------------------------------------------------
  // Getters & Setters: Lighting & Materials
  // ---------------------------------------------------------------------------

  /**
   * Get intensity of ambient light.
   * @returns ambientLight value.
   */
  getAmbientLight(): number {
    return this.state.get("ambientIntensity");
  }

  /**
   * Set the intensity of ambient light.
   * @param val - the new ambient light intensity (0-4)
   * @param notify - whether to send notification or not.
   * @public
   */
  setAmbientLight = (val: number, notify: boolean = true): void => {
    if (!this.ready) return;
    val = Math.max(0, Math.min(4, val));
    this.state.set("ambientIntensity", val, notify);
    this.rendered.ambientLight.intensity = scaleLight(val);
    this.update(this.updateMarker);
  };

  /**
   * Get intensity of direct light.
   * @returns directLight value.
   */
  getDirectLight(): number {
    return this.state.get("directIntensity");
  }

  /**
   * Set the intensity of directional light.
   * @param val - the new direct light intensity (0-4)
   * @param notify - whether to send notification or not.
   * @public
   */
  setDirectLight = (val: number, notify: boolean = true): void => {
    if (!this.ready) return;
    val = Math.max(0, Math.min(4, val));
    this.state.set("directIntensity", val, notify);
    this.rendered.directLight.intensity = scaleLight(val);
    this.update(this.updateMarker);
  };

  /**
   * Retrieves the metalness value.
   *
   * @returns The current metalness value.
   */
  getMetalness = (): number => {
    return this.state.get("metalness");
  };

  /**
   * Sets the metalness value for the viewer and updates related properties.
   *
   * @param value - The metalness value to set (0-1).
   * @param notify - Whether to notify about the changes.
   * @public
   */
  setMetalness = (value: number, notify: boolean = true): void => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("metalness", value, notify);
    this.rendered.nestedGroup.setMetalness(value);
    this.update(this.updateMarker);
  };

  /**
   * Retrieves the roughness value.
   *
   * @returns The current roughness value.
   */
  getRoughness = (): number => {
    return this.state.get("roughness");
  };

  /**
   * Sets the roughness value for the viewer and updates related components.
   *
   * @param value - The roughness value to set (0-1).
   * @param notify - Whether to notify about the changes.
   * @public
   */
  setRoughness = (value: number, notify: boolean = true): void => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("roughness", value, notify);
    this.rendered.nestedGroup.setRoughness(value);
    this.update(this.updateMarker);
  };

  /**
   * Resets the material settings of the viewer to their default values.
   * Updates the metalness, roughness, ambient light intensity, and direct light intensity
   * based on the current material settings.
   */
  resetMaterial = (): void => {
    if (!this.materialSettings) return;
    this.setMetalness(this.materialSettings.metalness, true);
    this.setRoughness(this.materialSettings.roughness, true);
    this.setAmbientLight(this.materialSettings.ambientIntensity, true);
    this.setDirectLight(this.materialSettings.directIntensity, true);
  };

  // ---------------------------------------------------------------------------
  // Getters & Setters: Zebra Tool
  // ---------------------------------------------------------------------------

  enableZebraTool = (flag: boolean): void => {
    this.rendered.nestedGroup.setZebra(flag);
    this.update(true, true);
    this.rendered.treeview.update();
  };

  /**
   * Sets the stripe count value for the viewer and updates related components.
   * @param value - The stripe count value to set.
   */
  setZebraCount = (value: number): void => {
    value = Math.max(2, Math.min(50, value));
    this.state.set("zebraCount", value);
    this.rendered.nestedGroup.setZebraCount(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe opacity value for the viewer and updates related components.
   * @param value - The stripe opacity value to set.
   */
  setZebraOpacity = (value: number): void => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("zebraOpacity", value);
    this.rendered.nestedGroup.setZebraOpacity(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe direction value for the viewer and updates related components.
   * @param value - The stripe direction value to set.
   */
  setZebraDirection = (value: number): void => {
    value = Math.max(0, Math.min(90, value));
    this.state.set("zebraDirection", value);
    this.rendered.nestedGroup.setZebraDirection(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe color scheme for the viewer and updates related components.
   * @param value - The color scheme ("blackwhite", "colorful", "grayscale").
   */
  setZebraColorScheme = (value: ZebraColorScheme): void => {
    this.state.set("zebraColorScheme", value);
    this.rendered.nestedGroup.setZebraColorScheme(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe mapping mode for the viewer and updates related components.
   * @param value - The mapping mode ("reflection", "normal").
   */
  setZebraMappingMode = (value: ZebraMappingMode): void => {
    this.state.set("zebraMappingMode", value);
    this.rendered.nestedGroup.setZebraMappingMode(value);
    this.update(this.updateMarker);
  };

  /**
   * Gets the current stripe count value.
   * @returns The stripe count (2-50).
   */
  getZebraCount = (): number => {
    return this.state.get("zebraCount");
  };

  /**
   * Gets the current stripe opacity value.
   * @returns The stripe opacity (0-1).
   */
  getZebraOpacity = (): number => {
    return this.state.get("zebraOpacity");
  };

  /**
   * Gets the current stripe direction value.
   * @returns The stripe direction in degrees (0-90).
   */
  getZebraDirection = (): number => {
    return this.state.get("zebraDirection");
  };

  /**
   * Gets the current stripe color scheme.
   * @returns The color scheme ("blackwhite", "colorful", "grayscale").
   */
  getZebraColorScheme = (): ZebraColorScheme => {
    return this.state.get("zebraColorScheme");
  };

  /**
   * Gets the current stripe mapping mode.
   * @returns The mapping mode ("reflection", "normal").
   */
  getZebraMappingMode = (): ZebraMappingMode => {
    return this.state.get("zebraMappingMode");
  };

  // ---------------------------------------------------------------------------
  // Camera State Getters & Setters
  // ---------------------------------------------------------------------------

  /**
   * Get ortho value as property (for ViewerLike interface compatibility).
   */
  get ortho(): boolean {
    return this._rendered?.camera.ortho ?? true;
  }

  /**
   * Get camera property. Throws if not rendered.
   */
  get camera(): Camera {
    return this.rendered.camera;
  }

  /**
   * Get nestedGroup property. Throws if not rendered.
   */
  get nestedGroup(): NestedGroup {
    return this.rendered.nestedGroup;
  }

  /**
   * Get clipping property. Throws if not rendered.
   */
  get clipping(): Clipping {
    return this.rendered.clipping;
  }

  /**
   * Get treeview property. Returns null if not rendered.
   */
  get treeview(): TreeView | null {
    return this._rendered?.treeview ?? null;
  }

  /**
   * Get orientationMarker property. Throws if not rendered.
   */
  get orientationMarker(): OrientationMarker {
    return this.rendered.orientationMarker;
  }

  /**
   * Get gridHelper property. Throws if not rendered.
   */
  get gridHelper(): Grid {
    return this.rendered.gridHelper;
  }

  /**
   * Get axesHelper property. Throws if not rendered.
   */
  get axesHelper(): AxesHelper {
    return this.rendered.axesHelper;
  }

  /**
   * Get scene property. Throws if not rendered.
   */
  get scene(): THREE.Scene {
    return this.rendered.scene;
  }

  /**
   * Get controls property. Throws if not rendered.
   */
  get controls(): Controls {
    return this.rendered.controls;
  }

  /**
   * Get ambientLight property. Throws if not rendered.
   */
  get ambientLight(): THREE.AmbientLight {
    return this.rendered.ambientLight;
  }

  /**
   * Get directLight property. Throws if not rendered.
   */
  get directLight(): THREE.DirectionalLight {
    return this.rendered.directLight;
  }

  /**
   * Get ortho value.
   * @returns ortho value.
   */
  getOrtho(): boolean {
    return this.rendered.camera.ortho;
  }

  /**
   * Set/unset camera's orthographic mode.
   * @param flag - whether to set orthographic mode or not.
   * @param notify - whether to send notification or not.
   */
  setOrtho(flag: boolean, notify: boolean = true): void {
    this.switchCamera(flag, notify);
  }

  /**
   * Set zscaling value.
   * @param value - scale factor.
   */
  setZscaleValue(value: number): void {
    this.rendered.nestedGroup.setZScale(value);
    this.zScale = value;
    this.update(true);
  }

  /**
   * Get zoom value.
   * @returns zoom value.
   * @public
   */
  getCameraZoom(): number {
    return this.rendered.camera.getZoom();
  }

  /**
   * Set zoom value.
   * @param val - float zoom value.
   * @param notify - whether to send notification or not.
   * @public
   */
  setCameraZoom(val: number, notify: boolean = true): void {
    this.rendered.camera.setZoom(val);
    this.rendered.controls.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera position.
   * @returns camera position as 3 dim array [x,y,z].
   * @public
   */
  getCameraPosition(): number[] {
    return this.rendered.camera.getPosition().toArray();
  }

  /**
   * Set camera position.
   * @param position - camera position as 3 dim Array [x,y,z].
   * @param relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param notify - whether to send notification or not.
   * @public
   */
  setCameraPosition(
    position: Vector3Tuple,
    relative: boolean = false,
    notify: boolean = true,
  ): void {
    this.rendered.camera.setPosition(position, relative);
    this.rendered.controls.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera rotation as quaternion.
   * @returns camera rotation as 4 dim quaternion array [x,y,z,w].
   * @public
   */
  getCameraQuaternion(): QuaternionTuple {
    return toQuaternionTuple(this.rendered.camera.getQuaternion().toArray());
  }

  /**
   * Set camera rotation via quaternion.
   * @param quaternion - camera rotation as 4 dim quaternion array [x,y,z,w].
   * @param notify - whether to send notification or not.
   * @public
   */
  setCameraQuaternion(
    quaternion: QuaternionTuple,
    notify: boolean = true,
  ): void {
    this.rendered.camera.setQuaternion(quaternion);
    this.rendered.controls.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera target.
   * @returns camera target as 3 dim array array [x,y,z].
   * @public
   */
  getCameraTarget(): Vector3Tuple {
    return toVector3Tuple(this.rendered.controls.getTarget().toArray());
  }

  /**
   * Set camera target.
   * @param target - camera target as THREE.Vector3 or [x, y, z] tuple.
   * @param notify - whether to send notification or not.
   * @public
   */
  setCameraTarget(target: THREE.Vector3 | Vector3Tuple, notify: boolean = true): void {
    // Convert tuple to Vector3 if needed
    const targetVec = Array.isArray(target)
      ? new THREE.Vector3(...target)
      : target;

    // Store current state
    const camera = this.rendered.camera.getCamera();
    const zoom = camera.zoom; // For orthographic cameras

    const offset = camera.position.clone().sub(this.rendered.controls.getTarget());

    // Update position and target
    camera.position.copy(targetVec.clone().add(offset));
    camera.updateWorldMatrix(true, false);
    this.rendered.controls.getTarget().copy(targetVec);

    // Preserve zoom for orthographic cameras
    if (isOrthographicCamera(camera)) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }

    // Update controls
    this.rendered.controls.update();
    this.update(true, notify);
  }

  getCameraLocationSettings(): CameraLocationSettings {
    return {
      position: this.getCameraPosition(),
      quaternion: this.getCameraQuaternion(),
      target: this.getCameraTarget(),
      zoom: this.getCameraZoom(),
    };
  }

  setCameraLocationSettings(
    position: Vector3Tuple | null = null,
    quaternion: QuaternionTuple | null = null,
    target: Vector3Tuple | null = null,
    zoom: number | null = null,
    notify: boolean = true,
  ): void {
    if (position != null) {
      this.rendered.camera.setPosition(position, false);
    }
    if (quaternion != null && this.state.get("control") === "trackball") {
      this.rendered.camera.setQuaternion(quaternion);
    }
    if (target != null) {
      this.rendered.controls.setTarget(new THREE.Vector3(...target));
    }
    if (zoom != null) {
      this.rendered.camera.setZoom(zoom);
    }
    this.rendered.controls.update();
    this.update(true, notify);
  }

  // ---------------------------------------------------------------------------
  // Tree State Management
  // ---------------------------------------------------------------------------

  /**
   * Get states of all treeview leaves.
   * @returns object mapping paths to visibility states.
   * @public
   */
  getStates(): Record<string, VisibilityState> {
    if (!this._rendered) return {};
    return this._rendered.treeview.getStates();
  }

  /**
   * Get state of a treeview leaf for a path.
   * separator can be / or |
   * @param path - path of the object
   * @returns state value in the form of [mesh, edges] = [0/1, 0/1]
   * @public
   */
  getState(path: string): VisibilityState | null {
    if (!this._rendered) return null;
    const p = path.replaceAll("|", "/");
    return this._rendered.treeview.getState(p);
  }

  /**
   * Set states of treeview leaves.
   * @param states - states object mapping paths to visibility states.
   * @public
   */
  setStates = (states: Record<string, VisibilityState>): void => {
    if (!this._rendered) return;
    this._rendered.treeview.setStates(states);
  };

  // ---------------------------------------------------------------------------
  // Dynamic Part Management
  // ---------------------------------------------------------------------------

  /**
   * Build tree data from a Shapes object.
   * Mirrors ShapeRenderer._getTree() logic.
   */
  private _buildTreeData(shapes: Shapes): ShapeTreeData {
    const build = (parts: Shapes[]): ShapeTreeData => {
      const result: ShapeTreeData = {};
      for (const part of parts) {
        if (part.parts != null) {
          result[part.name] = build(part.parts);
        } else {
          result[part.name] = part.state as VisibilityState;
        }
      }
      return result;
    };
    const tree: ShapeTreeData = {};
    tree[shapes.name] = build(shapes.parts ?? []);
    return tree;
  }

  /**
   * Find the parent Shapes node and the parent's parts array for a given path.
   * @param path - Absolute path like "/root/group/part"
   * @returns The parent Shapes node, or null if not found.
   */
  private _findShapesParent(path: string): Shapes | null {
    if (!this.shapes) return null;
    const parts = path.split("/").filter(Boolean);
    // parts[0] is the root name, parent is everything except the last segment
    if (parts.length < 2) return null;
    const parentParts = parts.slice(0, -1);

    let current: Shapes = this.shapes;
    // The first segment should match the root
    if (current.name !== parentParts[0]) return null;

    for (let i = 1; i < parentParts.length; i++) {
      if (!current.parts) return null;
      const child = current.parts.find((p) => p.name === parentParts[i]);
      if (!child) return null;
      current = child;
    }
    return current;
  }

  /**
   * Rebuild the treeview from the current shapes data.
   * Preserves visibility states across the rebuild.
   */
  private _rebuildTreeView(): void {
    // Save visibility states before disposing the old tree
    const savedStates = this.rendered.treeview.getStates();

    // Rebuild tree data from this.shapes
    this.compactTree = this._buildTreeData(this.shapes!);
    this.tree = this.compactTree;

    // Dispose old treeview and create new one
    deepDispose(this.rendered.treeview);

    const treeview = new TreeView(
      this.tree,
      this.display.cadTreeScrollContainer,
      this.setObject,
      this.handlePick,
      this.update,
      this.notifyStates,
      this.getNodeColor,
      this.state.get("theme"),
      this.state.get("newTreeBehavior"),
      false,
    );
    this.rendered.treeview = treeview;

    this.display.clearCadTree();
    const t = treeview.create();
    this.display.addCadTree(t);
    treeview.render();

    // Restore visibility states (updates both tree model and 3D objects)
    this.rendered.treeview.setStates(savedStates);

    // Re-apply the current collapse state to the new tree
    const collapse = this.state.get("collapse") as CollapseState;
    if (collapse != null) {
      this.collapseNodes(collapse, false);
    }
  }

  /**
   * Apply current material/rendering settings to new objects in the group.
   * @param paths - The paths of the newly added objects.
   */
  private _applyCurrentSettings(paths: string[]): void {
    const nestedGroup = this.rendered.nestedGroup;
    for (const path of paths) {
      const obj = nestedGroup.groups[path];
      if (obj instanceof ObjectGroup) {
        obj.setTransparent(this.state.get("transparent"));
        obj.setBlackEdges(this.state.get("blackEdges"));
        obj.setMetalness(this.state.get("metalness"));
        obj.setRoughness(this.state.get("roughness"));
        obj.setPolygonOffset(2);
        if (nestedGroup.clipPlanes) {
          obj.setClipPlanes(nestedGroup.clipPlanes);
        }
      }
    }
  }

  /**
   * Add a part (leaf or subtree) to the scene under an existing parent.
   *
   * For a **leaf**, pass a Shapes object with `shape` set and `name`
   * as a plain name (no leading slash).  The absolute path is built as
   * `parentPath + "/" + partData.name`.
   *
   * For a **subtree**, pass a Shapes object with `parts` set and `id`
   * as a slash-prefixed relative tree (e.g. `"/shelf"`).  All `id`
   * fields in the tree are prefixed with `parentPath` before rendering.
   *
   * When adding many parts in a batch, pass `{ skipBounds: true }` to
   * defer the expensive bounds/clipping/treeview recomputation, then call
   * `updateBounds()` once after the loop.
   *
   * @param parentPath - Absolute path of the parent group
   *   (e.g. "/assembly").  Must already exist as a CompoundGroup.
   * @param partData - A Shapes object describing the part to add.
   * @param options - Optional settings.
   * @param options.skipBounds - When true, skip bounds/clipping/treeview
   *   update and re-render.  Caller must call `updateBounds()` afterwards.
   * @returns The absolute path of the added root element.
   * @throws If the viewer is not rendered, the parent doesn't exist,
   *   or the name/id already exists at that level.
   * @public
   */
  addPart(
    parentPath: string,
    partData: Shapes,
    options: { skipBounds?: boolean } = {},
  ): string {
    if (!this._rendered) {
      throw new Error("Viewer.render() must be called before addPart()");
    }

    const nestedGroup = this.rendered.nestedGroup;

    // Validate parent exists and is a CompoundGroup
    const parentGroup = nestedGroup.groups[parentPath];
    if (!parentGroup || !isCompoundGroup(parentGroup)) {
      throw new Error(
        `Parent group not found or not a CompoundGroup: ${parentPath}`,
      );
    }

    const isTree = partData.parts != null && Array.isArray(partData.parts);

    // Build the absolute root path
    const path = isTree
      ? parentPath + partData.id // "/group1/group2" + "/shelf" → "/group1/group2/shelf"
      : parentPath + "/" + partData.name; // "/group1/group2" + "/" + "obj1"

    // Validate root doesn't already exist at this level
    if (nestedGroup.groups[path] != null) {
      throw new Error(`Part already exists: ${path}`);
    }

    // Rewrite ids to absolute paths
    if (isTree) {
      this._prefixIds(partData, parentPath);
    } else {
      partData.id = path;
    }

    // Update this.shapes tree
    const parentShapes = this._findShapesParent(path);
    if (!parentShapes) {
      throw new Error(`Parent not found in shapes data: ${parentPath}`);
    }
    if (!parentShapes.parts) {
      parentShapes.parts = [];
    }
    parentShapes.parts.push(partData);

    // Render the new part using existing NestedGroup methods
    if (isTree) {
      // Subtree with children - renderLoop handles it directly
      const newGroup = nestedGroup.renderLoop(partData);
      parentGroup.add(newGroup);
    } else {
      // Single leaf shape - wrap in temporary tree for renderLoop
      const wrapperId = `${path}/__addPart_tmp__`;
      const wrapper: Shapes = {
        version: partData.version,
        id: wrapperId,
        name: "__addPart_tmp__",
        loc: [[0, 0, 0], [0, 0, 0, 1]],
        parts: [partData],
      };
      const wrapperGroup = nestedGroup.renderLoop(wrapper);
      // Move the rendered leaf from wrapper to actual parent
      const leafGroup = nestedGroup.groups[path]!;
      wrapperGroup.remove(leafGroup);
      parentGroup.add(leafGroup);
      // Clean up temporary wrapper
      delete nestedGroup.groups[wrapperId];
    }

    // Collect all new paths for settings application
    const newPaths = Object.keys(nestedGroup.groups).filter(
      (p) => p === path || p.startsWith(path + "/"),
    );
    this._applyCurrentSettings(newPaths);

    // Invalidate explode cache
    if (this.expandedNestedGroup != null) {
      deepDispose(this.expandedNestedGroup);
      this.expandedNestedGroup = null;
      this.expandedTree = null;
    }

    if (options.skipBounds) {
      this._treeNeedsRebuild = true;
      return path;
    }

    this._treeNeedsRebuild = true;
    this.updateBounds();

    return path;
  }

  /**
   * Recursively prefix all `id` fields in a Shapes tree.
   */
  private _prefixIds(shapes: Shapes, prefix: string): void {
    shapes.id = prefix + shapes.id;
    if (shapes.parts) {
      for (const part of shapes.parts) {
        this._prefixIds(part, prefix);
      }
    }
  }

  /**
   * Remove a part (leaf or subtree) from the scene by path.
   *
   * When removing many parts in a batch, pass `{ skipBounds: true }` to
   * defer the expensive bounds/clipping/treeview recomputation, then call
   * `updateBounds()` once after the loop.
   *
   * @param path - The absolute path of the part to remove
   *   (e.g., "/assembly/shelf_5").
   * @param options - Optional settings.
   * @param options.skipBounds - When true, skip bounds/clipping/treeview
   *   update and re-render.  Caller must call `updateBounds()` afterwards.
   * @throws If the viewer is not rendered or the path doesn't exist.
   * @public
   */
  removePart(path: string, options: { skipBounds?: boolean } = {}): void {
    if (!this._rendered) {
      throw new Error("Viewer.render() must be called before removePart()");
    }

    const nestedGroup = this.rendered.nestedGroup;
    const group = nestedGroup.groups[path];
    if (!group) {
      throw new Error(`Part not found: ${path}`);
    }

    // Remove from Three.js scene graph
    if (group.parent) {
      group.parent.remove(group);
    }

    // Collect all paths in this subtree and remove from groups map
    const pathsToRemove = Object.keys(nestedGroup.groups).filter(
      (p) => p === path || p.startsWith(path + "/"),
    );
    for (const p of pathsToRemove) {
      delete nestedGroup.groups[p];
    }

    // Remove from this.shapes tree
    const parentShapes = this._findShapesParent(path);
    if (parentShapes && parentShapes.parts) {
      const name = path.substring(path.lastIndexOf("/") + 1);
      parentShapes.parts = parentShapes.parts.filter((p) => p.name !== name);
    }

    // Invalidate explode cache
    if (this.expandedNestedGroup != null) {
      deepDispose(this.expandedNestedGroup);
      this.expandedNestedGroup = null;
      this.expandedTree = null;
    }

    if (options.skipBounds) {
      // Defer disposal: keep materials alive so WebGL shader programs stay
      // cached.  Programs are reference-counted; disposing all materials of a
      // type deletes the compiled program, causing expensive recompilation
      // when addPart creates new materials.  Deferred groups are disposed in
      // updateBounds() after the render pass, when new materials already
      // share the programs.
      this._pendingDisposal.push(group);
      this._treeNeedsRebuild = true;
      return;
    }

    // Dispose the removed Three.js objects
    deepDispose(group);

    this._treeNeedsRebuild = true;
    this.updateBounds();
  }

  /**
   * Update an existing part's geometry.
   *
   * When the mesh topology is unchanged (same number of vertices, triangles,
   * and edge segments), buffers are updated in-place — no Three.js objects
   * are disposed or recreated.  When topology differs the method
   * automatically falls back to a batched `removePart` + `addPart`.
   *
   * Only leaf parts (ObjectGroups with `shapeGeometry`) are supported.
   * The part must already exist in the scene.
   *
   * When updating many parts in a batch, pass `{ skipBounds: true }` to
   * defer the expensive bounds/clipping recomputation, then call
   * `updateBounds()` once after the loop:
   *
   * ```ts
   * for (const p of parts) {
   *   viewer.updatePart(path, data, { skipBounds: true });
   * }
   * viewer.updateBounds();
   * ```
   *
   * @param path - The absolute path of the part to update
   *   (e.g., "/assembly/part").
   * @param partData - A Shapes object with the new `shape` data.
   *   The `shape.vertices`, `shape.normals`, `shape.triangles`, and
   *   `shape.edges` fields are used to update the geometry.
   *   Optionally `color`, `alpha`, and `loc` are synced into `this.shapes`.
   * @param options - Optional settings.
   * @param options.skipBounds - When true, skip bounds/clipping/explode-cache
   *   update and re-render.  Caller must call `updateBounds()` afterwards.
   * @throws If the viewer is not rendered, the path doesn't exist,
   *   or the target is not a leaf ObjectGroup with shape geometry.
   * @public
   */
  updatePart(
    path: string,
    partData: Shapes,
    options: { skipBounds?: boolean } = {},
  ): void {
    if (!this._rendered) {
      throw new Error("Viewer.render() must be called before updatePart()");
    }

    const nestedGroup = this.rendered.nestedGroup;
    const group = nestedGroup.groups[path];
    if (!group) {
      throw new Error(`Part not found: ${path}`);
    }
    if (!isObjectGroup(group)) {
      throw new Error(`Part is not a leaf ObjectGroup: ${path}`);
    }
    if (!group.shapeGeometry) {
      throw new Error(
        `Part has no shape geometry (may be edges/vertices only): ${path}`,
      );
    }
    if (!partData.shape) {
      throw new Error("partData.shape is required for updatePart");
    }

    const shape = partData.shape;
    const geom = group.shapeGeometry;

    // --- Check whether topology is unchanged ---
    const flatLen = (
      data: number[] | number[][] | Float32Array | Uint32Array | undefined,
    ): number => {
      if (!data) return 0;
      if (data instanceof Float32Array || data instanceof Uint32Array)
        return data.length;
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]))
        return (data as number[][]).reduce((s, a) => s + a.length, 0);
      return (data as number[]).length;
    };

    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
    const oldIndex = geom.getIndex();

    const sameVertices = posAttr.count === flatLen(shape.vertices) / 3;
    const sameTriangles =
      oldIndex != null && oldIndex.count === flatLen(shape.triangles);

    let sameEdges = true;
    if (group.edges && shape.edges) {
      if (isLineSegments2(group.edges)) {
        const edgeGeom = group.edges.geometry;
        const instanceCount =
          edgeGeom.getAttribute("instanceStart")?.count ?? 0;
        // LineSegmentsGeometry stores 1 instance per segment (2 points)
        sameEdges = instanceCount === flatLen(shape.edges) / 6;
      } else {
        const edgePosAttr = group.edges.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute | null;
        sameEdges =
          edgePosAttr != null &&
          edgePosAttr.count === flatLen(shape.edges) / 3;
      }
    }

    if (!sameVertices || !sameTriangles || !sameEdges) {
      // Topology changed — fall back to remove + add.
      // Visibility states are preserved by _rebuildTreeView() which is
      // triggered via updateBounds() (or the caller's updateBounds call
      // when skipBounds is true).
      const parentPath = path.substring(0, path.lastIndexOf("/"));
      this.removePart(path, { skipBounds: true });
      this.addPart(parentPath, partData, { skipBounds: true });
      if (!options.skipBounds) {
        this.updateBounds();
      }
      return;
    }

    // --- Topology matches — fast in-place buffer update ---

    // Helper: convert to typed arrays
    const toF32 = (
      data: number[] | number[][] | Float32Array,
    ): Float32Array => {
      if (data instanceof Float32Array) return data;
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
        return new Float32Array((data as number[][]).flat());
      }
      return new Float32Array(data as number[]);
    };
    const toU32 = (
      data: number[] | number[][] | Uint32Array,
    ): Uint32Array => {
      if (data instanceof Uint32Array) return data;
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
        return new Uint32Array((data as number[][]).flat());
      }
      return new Uint32Array(data as number[]);
    };

    // Step 1: Update face geometry buffers (in-place, counts match)
    const newPositions = toF32(shape.vertices);
    const newNormals = toF32(shape.normals);
    const newTriangles = toU32(shape.triangles);

    (posAttr.array as Float32Array).set(newPositions);
    posAttr.needsUpdate = true;
    const normAttr = geom.getAttribute("normal") as THREE.BufferAttribute;
    (normAttr.array as Float32Array).set(newNormals);
    normAttr.needsUpdate = true;
    (oldIndex!.array as Uint32Array).set(newTriangles);
    oldIndex!.needsUpdate = true;

    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    // Step 2: Update edge geometry (in-place, counts match)
    if (group.edges && shape.edges && shape.edges.length > 0) {
      const newEdgePositions = toF32(shape.edges);
      if (isLineSegments2(group.edges)) {
        const startAttr = group.edges.geometry.getAttribute("instanceStart");
        if (startAttr && "data" in startAttr) {
          const buffer = (startAttr as THREE.InterleavedBufferAttribute).data;
          (buffer.array as Float32Array).set(newEdgePositions);
          buffer.needsUpdate = true;
        } else {
          group.edges.geometry.setPositions(newEdgePositions);
        }
        group.edges.geometry.computeBoundingBox();
        group.edges.geometry.computeBoundingSphere();
      } else {
        const edgeGeom = group.edges.geometry;
        const edgePosAttr = edgeGeom.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        (edgePosAttr.array as Float32Array).set(newEdgePositions);
        edgePosAttr.needsUpdate = true;
        edgeGeom.computeBoundingBox();
        edgeGeom.computeBoundingSphere();
      }
    }

    // Step 3: Sync this.shapes data
    const parentShapes = this._findShapesParent(path);
    if (parentShapes && parentShapes.parts) {
      const name = path.substring(path.lastIndexOf("/") + 1);
      const entry = parentShapes.parts.find((p) => p.name === name);
      if (entry) {
        entry.shape = shape;
        if (partData.color !== undefined) entry.color = partData.color;
        if (partData.alpha !== undefined) entry.alpha = partData.alpha;
        if (partData.loc !== undefined) entry.loc = partData.loc;
      }
    }

    // Step 4: Update bounds or defer
    if (options.skipBounds) {
      return;
    }

    this.updateBounds();
  }

  /**
   * Recompute scene bounds, camera far plane, clipping stencils, and
   * re-render.  Call this once after a batch of
   * `addPart`, `removePart`, or `updatePart` calls that used
   * `{ skipBounds: true }`.
   *
   * If parts were added or removed in the batch, the navigation treeview
   * is also rebuilt automatically.
   *
   * @public
   */
  updateBounds(): void {
    if (!this._rendered) {
      throw new Error("Viewer.render() must be called before updateBounds()");
    }

    const nestedGroup = this.rendered.nestedGroup;

    // Recompute bounding box from current geometry
    nestedGroup.bbox = null;
    this.bbox = nestedGroup.boundingBox();

    const center = new THREE.Vector3();
    this.bbox.getCenter(center);
    this.bb_max = this.bbox.max_dist_from_center();
    this.bb_radius = Math.max(
      this.bbox.boundingSphere().radius,
      center.length(),
    );

    // Always update camera far plane and distance (cheap)
    this.rendered.camera.updateFarPlane(this.bb_radius);
    this.rendered.camera.updateCameraDistance(this.bb_radius);

    // Update controls reset location to current bbox center so that
    // reset() frames the updated geometry, not the original.
    // Shift both target and position by the same offset to preserve
    // the viewing direction and distance.
    const loc = this.rendered.controls.getResetLocation();
    const offset = loc.position0.clone().sub(loc.target0);
    loc.target0.set(...this.bbox.center());
    loc.position0.copy(loc.target0).add(offset);
    this.rendered.controls.setResetLocation(
      loc.target0,
      loc.position0,
      loc.quaternion0,
      loc.zoom0,
    );

    // Only rebuild stencils if geometry grew beyond the region that stencils
    // were last built for.  Shrinking geometry still fits within existing
    // stencils, so skip the expensive rebuild in that case.
    const newCSize = 1.1 * Math.max(
      Math.abs(this.bbox.min.length()),
      Math.abs(this.bbox.max.length()),
    );
    if (newCSize > this._stencilCSize + 1e-6) {
      this._stencilCSize = newCSize;
      const clipping = this.rendered.clipping;
      clipping.rebuildStencils(this.bbox.center(), 2 * newCSize);
      nestedGroup.setClipPlanes(clipping.clipPlanes);
      this.display.setSliderLimits(newCSize);
    }

    // Invalidate explode cache
    if (this.expandedNestedGroup != null) {
      deepDispose(this.expandedNestedGroup);
      this.expandedNestedGroup = null;
      this.expandedTree = null;
    }

    // Rebuild treeview if parts were added or removed in this batch
    if (this._treeNeedsRebuild) {
      this._treeNeedsRebuild = false;
      this._rebuildTreeView();
    }

    // Re-render
    this.update(this.updateMarker);

    // Flush deferred disposal: now that new materials have been rendered
    // (and share compiled shader programs), dispose the old objects safely.
    if (this._pendingDisposal.length > 0) {
      for (const obj of this._pendingDisposal) {
        deepDispose(obj);
      }
      this._pendingDisposal = [];
    }
  }

  /**
   * Pre-size the clipping stencil region so that all future `updatePart` /
   * `updateBounds` calls whose geometry stays within `bb` will never trigger
   * an expensive `rebuildStencils`.
   *
   * Call this once before a series of updates when the maximum extent of the
   * geometry is known upfront (e.g. the parameter range of a slider).
   *
   * @param bb - The maximum bounding box that geometry will ever occupy.
   */
  ensureStencilSize(bb: BoundingBoxFlat): void {
    if (!this._rendered) {
      throw new Error(
        "Viewer.render() must be called before ensureStencilSize()",
      );
    }

    const min = new THREE.Vector3(bb.xmin, bb.ymin, bb.zmin);
    const max = new THREE.Vector3(bb.xmax, bb.ymax, bb.zmax);
    const center = new THREE.Vector3()
      .addVectors(min, max)
      .multiplyScalar(0.5);

    const requiredCSize =
      1.1 * Math.max(Math.abs(min.length()), Math.abs(max.length()));

    if (requiredCSize > this._stencilCSize + 1e-6) {
      this._stencilCSize = requiredCSize;
      const clipping = this.rendered.clipping;
      const nestedGroup = this.rendered.nestedGroup;
      clipping.rebuildStencils(
        [center.x, center.y, center.z] as [number, number, number],
        2 * requiredCSize,
      );
      nestedGroup.setClipPlanes(clipping.clipPlanes);
      this.display.setSliderLimits(requiredCSize);
    }
  }

  // ---------------------------------------------------------------------------
  // UI sensitivity
  // ---------------------------------------------------------------------------

  /**
   * Get zoom speed.
   * @returns zoomSpeed value.
   */
  getZoomSpeed(): number {
    return this.state.get("zoomSpeed");
  }

  /**
   * Set zoom speed.
   * @param val - the new zoom speed
   * @param notify - whether to send notification or not.
   */
  setZoomSpeed = (val: number, notify: boolean = true): void => {
    this.state.set("zoomSpeed", val, notify);
    this.rendered.controls.setZoomSpeed(val);
  };

  /**
   * Get panning speed.
   * @returns pan speed value.
   */
  getPanSpeed(): number {
    return this.state.get("panSpeed");
  }

  /**
   * Set pan speed.
   * @param val - the new pan speed
   * @param notify - whether to send notification or not.
   */
  setPanSpeed = (val: number, notify: boolean = true): void => {
    this.state.set("panSpeed", val, notify);
    this.rendered.controls.setPanSpeed(val);
  };

  /**
   * Get rotation speed.
   * @returns rotation speed value.
   */
  getRotateSpeed(): number {
    return this.state.get("rotateSpeed");
  }

  /**
   * Set rotation speed.
   * @param val - the new rotation speed.
   * @param notify - whether to send notification or not.
   */
  setRotateSpeed = (val: number, notify: boolean = true): void => {
    this.state.set("rotateSpeed", val, notify);
    this.rendered.controls.setRotateSpeed(val);
  };

  /**
   * Get holroyd (non-tumbling) trackball mode.
   * @returns holroyd flag.
   */
  getHolroyd(): boolean {
    return this.state.get("holroyd");
  }

  /**
   * Set holroyd (non-tumbling) trackball mode.
   * When false, uses standard Three.js TrackballControls behavior.
   * @param flag - whether to enable holroyd mode.
   * @param notify - whether to send notification or not.
   */
  setHolroyd = (flag: boolean, notify: boolean = true): void => {
    this.state.set("holroyd", flag, notify);
    this.rendered.controls.setHolroydTrackball(flag);
  };

  // ---------------------------------------------------------------------------
  // Clipping Planes
  // ---------------------------------------------------------------------------

  /**
   * Get intersection mode.
   * @returns clip intersection value.
   */
  getClipIntersection(): boolean {
    return this.state.get("clipIntersection");
  }

  /**
   * Set the clipping mode to intersection mode
   * @param flag - whether to use intersection mode
   * @param notify - whether to send notification or not.
   */
  setClipIntersection = (flag: boolean, notify: boolean = true): void => {
    if (flag == null || !this.ready) return;

    this.state.set("clipIntersection", flag, notify);
    this.rendered.nestedGroup.setClipIntersection(flag);

    const clipPlanes = flag
      ? this.rendered.clipping.reverseClipPlanes
      : this.rendered.clipping.clipPlanes;

    for (const child of this.rendered.nestedGroup.rootGroup!.children) {
      if (child.name === "PlaneMeshes") {
        for (const capPlane of child.children) {
          if (!isIndexedMesh(capPlane)) continue;
          if (!isClippableMaterial(capPlane.material)) continue;
          capPlane.material.clippingPlanes = clipPlanes!.filter(
            (_: THREE.Plane, j: number) => j !== capPlane.index,
          );
        }
      }
    }

    for (const child of this.rendered.scene.children) {
      if (child.name === "PlaneHelpers") {
        for (const helper of child.children[0].children) {
          if (!isIndexedMesh(helper)) continue;
          if (!isClippableMaterial(helper.material)) continue;
          helper.material.clippingPlanes = clipPlanes!.filter(
            (_: THREE.Plane, j: number) => j !== helper.index,
          );
        }
      }
    }

    this.update(this.updateMarker);
  };

  /**
   * Get whether the clipping caps color status
   * @returns color caps value (object color (true) or RGB (false)).
   */
  getObjectColorCaps = (): boolean => {
    return this._rendered?.clipping.getObjectColorCaps() ?? false;
  };

  /**
   * Toggle the clipping caps color between object color and RGB
   * @param flag - whether to use intersection mode
   * @param notify - whether to send notification or not.
   */
  setClipObjectColorCaps = (flag: boolean, notify: boolean = true): void => {
    if (flag == null || !this.ready) return;
    this.state.set("clipObjectColors", flag, notify);
    this.rendered.clipping.setObjectColorCaps(flag);
    this.update(this.updateMarker);
  };

  /**
   * Get clipping plane state.
   * @returns clip plane visibility value.
   */
  getClipPlaneHelpers(): boolean {
    return this.state.get("clipPlaneHelpers");
  }

  /**
   * Show/hide clip plane helpers
   * @param flag - whether to show clip plane helpers
   * @param notify - whether to send notification or not.
   */
  setClipPlaneHelpers = (flag: boolean, notify: boolean = true): void => {
    if (flag == null || !this.ready) return;

    this.state.set("clipPlaneHelpers", flag, notify);
    // Only show plane helpers if flag is true AND clip tab is active
    const isClipTabActive = this.state.get("activeTab") === "clip";
    this.rendered.clipping.planeHelpers!.visible = flag && isClipTabActive;

    this.update(this.updateMarker);
  };

  /**
   * Get clipping plane state.
   * @param index - index of the normal: 0, 1 ,2
   * @returns clip plane visibility value.
   */
  getClipNormal(index: ClipIndex): Vector3Tuple {
    return toVector3Tuple(this.clipNormals[index].toArray());
  }

  /**
   * Set the normal at index to a given normal
   * @param index - index of the normal: 0, 1 ,2
   * @param normal - 3 dim array representing the normal
   * @param value - value of the slider, if given
   * @param notify - whether to send notification or not.
   */
  setClipNormal(
    index: ClipIndex,
    normal: Vector3Tuple | null,
    value: number | null = null,
    notify: boolean = true,
  ): void {
    if (normal == null || !this.ready) return;
    const normal1 = new THREE.Vector3(...normal).normalize();
    this.clipNormals[index] = normal1;

    // Update state (triggers auto-notification for clipNormal)
    const normalKeys = ["clipNormal0", "clipNormal1", "clipNormal2"] as const;
    this.state.set(normalKeys[index], normal1, notify);

    this.rendered.clipping.setNormal(index, normal1);
    this.rendered.clipping.setConstant(index, this.gridSize / 2);
    if (value == null) value = this.gridSize / 2;
    // setClipSlider will handle its own state update and notification
    this.setClipSlider(index, value, notify);

    this.rendered.nestedGroup.setClipPlanes(this.rendered.clipping.clipPlanes);

    this.update(this.updateMarker);
  }

  /**
   * Set the normal at index to the current viewing direction
   * @param index - index of the normal: 0, 1 ,2
   * @param notify - whether to send notification or not.
   */
  setClipNormalFromPosition = (index: ClipIndex, notify: boolean = true): void => {
    if (!this.ready) return;
    const cameraPosition = this.rendered.camera.getPosition().clone();
    const normal = toVector3Tuple(
      cameraPosition
        .sub(this.rendered.controls.getTarget())
        .normalize()
        .negate()
        .toArray()
    );
    this.setClipNormal(index, normal, null, notify);
  };

  /**
   * Get clipping slider value.
   * @param index - index of the normal: 0, 1 ,2
   * @returns clip slider value.
   */
  getClipSlider = (index: 0 | 1 | 2): number => {
    const keys = ["clipSlider0", "clipSlider1", "clipSlider2"] as const;
    return this.state.get(keys[index]);
  };

  /**
   * Set clipping slider value and update the clipping plane.
   * @param index - index of the normal: 0, 1 ,2
   * @param value - value for the clipping slider
   * @param notify - whether to send notification or not.
   */
  setClipSlider = (
    index: 0 | 1 | 2,
    value: number,
    notify: boolean = true,
  ): void => {
    if (value === -1 || value == null) return;

    const keys = ["clipSlider0", "clipSlider1", "clipSlider2"] as const;
    this.state.set(keys[index], value, notify);

    // Also update the 3D clipping plane (consistent with other setters)
    if (this.ready) {
      this.rendered.clipping.setConstant(index, value);
      this.update(this.updateMarker);
    }
  };

  // ---------------------------------------------------------------------------
  // Image Export
  // ---------------------------------------------------------------------------

  /**
   * Replace CadView with an inline png image of the canvas.
   *
   * Note: Only the canvas will be shown, no tools and orientation marker
   */
  pinAsPng = (): void => {
    const screenshot = this.getImage("screenshot");
    screenshot.then((data: ImageResult) => {
      if (typeof data.dataUrl !== "string") {
        logger.error("Screenshot dataUrl is not a string");
        return;
      }
      const image = document.createElement("img");
      image.width = this.state.get("cadWidth");
      image.height = this.state.get("height");
      image.src = data.dataUrl;
      if (this.pinAsPngCallback == null) {
        // default, replace the viewer with the image
        this.display.replaceWithImage(image);
      }
    });
  };

  /**
   * Get the current canvas as png data.
   * @param taskId - an id to identify the screenshot
   * @returns Promise resolving to task ID and data URL
   * Note: Only the canvas will be shown, no tools and orientation marker
   * @public
   */
  getImage = (taskId: string): Promise<ImageResult> => {
    if (!this.ready) {
      return Promise.resolve({ task: taskId, dataUrl: null });
    }
    // canvas.toBlob can be very slow when animation loop is off!
    const animationLoop = this.hasAnimationLoop;
    if (!animationLoop) {
      this.toggleAnimationLoop(true);
    }
    this.rendered.orientationMarker.setVisible(false);
    this.update(true);

    return this.display.captureCanvas({
      taskId,
      render: () => {
        this.renderer.setViewport(
          0,
          0,
          this.state.get("cadWidth"),
          this.state.get("height"),
        );
        this.renderer.render(this.rendered.scene, this.rendered.camera.getCamera());
      },
      onComplete: () => {
        // Restore animation loop to original state
        if (!animationLoop) {
          this.toggleAnimationLoop(false);
        }
        this.rendered.orientationMarker.setVisible(true);
        this.update(true);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Explode Animation
  // ---------------------------------------------------------------------------

  /**
   * Calculate explode trajectories and initiate the animation.
   *
   * @param duration - duration of animation.
   * @param speed - speed of animation.
   * @param multiplier - multiplier for length of trajectories.
   * @public
   */
  explode(
    duration: number = 2,
    speed: number = 1,
    multiplier: number = 2.5,
  ): void {
    this.clearAnimation();

    const use_origin = this.getAxes0();

    const worldCenterOrOrigin = new THREE.Vector3();
    const worldObjectCenter = new THREE.Vector3();

    let worldDirection: THREE.Vector3 | null = null;
    let localDirection: THREE.Vector3 | null = null;
    let scaledLocalDirection: THREE.Vector3 | null = null;

    if (!use_origin) {
      const bb = new THREE.Box3().setFromObject(this.rendered.nestedGroup.rootGroup!);
      bb.getCenter(worldCenterOrOrigin);
    }
    for (const id in this.rendered.nestedGroup.groups) {
      // Loop over all Group elements
      const group = this.rendered.nestedGroup.groups[id];

      const b = new THREE.Box3();
      if (group instanceof ObjectGroup) {
        b.expandByObject(group);
      }
      if (b.isEmpty()) {
        continue;
      }
      b.getCenter(worldObjectCenter);
      // Explode around global center or origin
      worldDirection = worldObjectCenter.sub(worldCenterOrOrigin);
      localDirection = group.parent!.worldToLocal(worldDirection.clone());

      // Use the parent to calculate the local directions
      scaledLocalDirection = group.parent!.worldToLocal(
        worldDirection.clone().multiplyScalar(multiplier),
      );
      // and ensure to shift objects at its center and not at its position
      scaledLocalDirection.sub(localDirection);

      // build an animation track for the group with this direction
      this.addPositionTrack(
        id,
        [0, duration],
        [[0, 0, 0], scaledLocalDirection.toArray()],
      );
    }
    this.initAnimation(duration, speed, "E", false);
  }

  /**
   * Toggle explode mode on/off.
   * @param flag - whether to enable or disable explode mode
   * @param notify - whether to send notification or not.
   * @public
   */
  setExplode(flag: boolean, notify: boolean = true): void {
    const isExplodeActive = this.state.get("animationMode") === "explode";
    if (flag === isExplodeActive) return;

    if (flag) {
      if (this.hasAnimation()) {
        this.backupAnimation();
      }
      this.explode(); // This sets animationMode to "explode" via initAnimation
    } else {
      if (this.hasAnimation()) {
        this.controlAnimation("stop");
        this.clearAnimation(); // This sets animationMode to "none"
        this.restoreAnimation();
      } else {
        this.state.set("animationMode", "none");
      }
    }

    // Send explode notification (client expects boolean, not animationMode)
    this.checkChanges({ explode: flag }, notify);
  }

  /**
   * Activate or deactivate a measurement/selection tool.
   * This is the single entry point for tool state changes - Display should call this
   * rather than mutating state directly.
   * @param name - Tool name ("distance", "properties", "select")
   * @param flag - Whether to activate (true) or deactivate (false) the tool
   */
  activateTool(name: string, flag: boolean): void {
    const currentTool = this.state.get("activeTool");

    if (flag) {
      // Activating a tool
      this.state.set("animationMode", "none");
      if (this.hasAnimation()) {
        this.backupAnimation();
      }
      this.state.set("activeTool", name);
    } else {
      // Deactivating a tool
      if (currentTool === name || name === "explode") {
        this.state.set("activeTool", null);
      }
      if (this.hasAnimation()) {
        this.controlAnimation("stop");
        this.clearAnimation();
        this.restoreAnimation();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard Configuration
  // ---------------------------------------------------------------------------

  /**
   * Set modifiers and action shortcuts for keymap
   *
   * @param config - keymap e.g. {"shift": "shiftKey", "ctrl": "ctrlKey", "meta": "altKey", "axes": "a", ...}
   */
  setKeyMap(config: Keymap): void {
    const modifierKeys = new Set(["shift", "ctrl", "meta", "alt"]);
    const modifiers: Partial<KeyMappingConfig> = {};
    const actions: Record<string, string> = {};

    for (const [key, value] of Object.entries(config)) {
      if (value === undefined) continue;
      if (modifierKeys.has(key)) {
        modifiers[key as keyof KeyMappingConfig] = value as KeyMappingConfig[keyof KeyMappingConfig];
      } else {
        actions[key] = value;
      }
    }

    if (Object.keys(modifiers).length > 0) {
      const before = KeyMapper.get_config();
      KeyMapper.set(modifiers);
      this.display.updateHelp(before, modifiers);
    }

    KeyMapper.setActionShortcuts(actions);
    this.display.updateTooltips();
  }

  // ---------------------------------------------------------------------------
  // View Layout
  // ---------------------------------------------------------------------------

  /**
   * Get the current CAD view width.
   * @public
   */
  get cadWidth(): number {
    return this.state.get("cadWidth");
  }

  /**
   * Get the current tree width.
   * @public
   */
  get treeWidth(): number {
    return this.state.get("treeWidth");
  }

  /**
   * Get the current view height.
   * @public
   */
  get height(): number {
    return this.state.get("height");
  }

  /**
   * Get the current glass mode state.
   * @public
   */
  get glass(): boolean {
    return this.state.get("glass");
  }

  /**
   * Resize UI and renderer.
   *
   * @param cadWidth - new width of CAD View
   * @param treeWidth - new width of navigation tree
   * @param height - new height of CAD View
   * @param glass - Whether to use glass mode or not
   * @public
   */
  resizeCadView(
    cadWidth: number,
    treeWidth: number,
    height: number,
    glass: boolean = false,
  ): void {
    this.state.set("cadWidth", cadWidth);
    this.state.set("height", height);

    // Adapt renderer dimensions
    this.renderer.setSize(cadWidth, height);

    // Adapt display dimensions
    this.display.setSizes({
      treeWidth: treeWidth,
      treeHeight: this.state.get("treeHeight"),
      cadWidth: cadWidth,
      height: height,
    });
    // Set glass state - subscription will update UI
    this.state.set("glass", glass);

    const fullWidth = cadWidth + (glass ? 0 : treeWidth);
    this.display.updateToolbarCollapse(fullWidth);

    // Adapt camera to new dimensions
    this.rendered.camera.changeDimensions(this.bb_radius, cadWidth, height);

    // update the this
    this.update(true);

    // update the raycaster
    if (this.raycaster) {
      this.raycaster.width = cadWidth;
      this.raycaster.height = height;
    }
  }

  // ---------------------------------------------------------------------------
  // UI Control Wrappers (delegate to display)
  // ---------------------------------------------------------------------------

  /**
   * Set camera to a predefined view direction.
   * @param direction - "iso", "front", "rear", "left", "right", "top", or "bottom"
   * @param focus - whether to focus/center on visible objects
   * @public
   */
  setView = (direction: string, focus: boolean = false): void => {
    this.display.setView(direction, focus);
  };

  /**
   * Enable/disable glass mode (transparent overlay UI).
   * @param flag - whether to enable glass mode
   * @param notify - whether to send notification or not.
   * @public
   */
  glassMode = (flag: boolean, notify: boolean = true): void => {
    this.state.set("glass", flag, notify);
    this.display.glassMode(flag);
  };

  /**
   * Collapse or expand tree nodes.
   * @param value - CollapseState enum value
   * @param notify - whether to send notification or not.
   * @public
   */
  collapseNodes = (value: CollapseState, notify: boolean = true): void => {
    this.state.set("collapse", value, notify);
    if (!this.treeview) return;
    // Translate CollapseState to treeview operations
    switch (value) {
      case CollapseState.COLLAPSED:
        this.treeview.collapseAll();
        break;
      case CollapseState.ROOT:
        this.treeview.openLevel(1);
        break;
      case CollapseState.LEAVES:
        this.treeview.openLevel(-1);
        break;
      case CollapseState.EXPANDED:
        this.treeview.expandAll();
        break;
    }
  };

  /**
   * Set the UI theme.
   * @param theme - "light", "dark", or "browser" for auto-detection
   * @returns The resolved theme ("light" or "dark")
   * @public
   */
  setTheme = (theme: ThemeInput): string => {
    return this.display.setTheme(theme);
  };

  /**
   * Show/hide the help dialog.
   * @param flag - whether to show the help dialog
   * @public
   */
  showHelp = (flag: boolean): void => {
    this.display.showHelp(flag);
  };

  /**
   * Show/hide the info panel.
   * @param flag - whether to show the info panel
   * @public
   */
  showInfo = (flag: boolean): void => {
    this.display.showInfo(flag);
  };

  /**
   * Show/hide the pinning button.
   * @param flag - whether to show the pinning button
   * @public
   */
  showPinning = (flag: boolean): void => {
    this.display.showPinning(flag);
  };

  /**
   * Show/hide the measure tools.
   * @param flag - whether to show the measure tools
   * @public
   */
  showMeasureTools = (flag: boolean): void => {
    this.display.showMeasureTools(flag);
  };

  /**
   * Show/hide the select tool.
   * @param flag - whether to show the select tool
   * @public
   */
  showSelectTool = (flag: boolean): void => {
    this.display.showSelectTool(flag);
  };

  /**
   * Show/hide the explode tool.
   * @param flag - whether to show the explode tool
   * @public
   */
  showExplodeTool = (flag: boolean): void => {
    this.display.showExplodeTool(flag);
  };

  /**
   * Show/hide the z-scale tool.
   * @param flag - whether to show the z-scale tool
   * @public
   */
  showZScaleTool = (flag: boolean): void => {
    this.display.showZScaleTool(flag);
  };

  /**
   * Get the canvas DOM element.
   * @returns The canvas element
   * @public
   */
  getCanvas = (): Element => {
    return this.display.getCanvas();
  };

  // ---------------------------------------------------------------------------
  // THREE.js Helper Factories
  // ---------------------------------------------------------------------------

  vector3(x: number = 0, y: number = 0, z: number = 0): THREE.Vector3 {
    return new THREE.Vector3(x, y, z);
  }

  quaternion(
    x: number = 0,
    y: number = 0,
    z: number = 0,
    w: number = 1,
  ): THREE.Quaternion {
    return new THREE.Quaternion(x, y, z, w);
  }
}

export { Viewer };
