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

import { NestedGroup, ObjectGroup, isObjectGroup } from "./nestedgroup.js";
import { Grid } from "./grid.js";
import { AxesHelper } from "./axes.js";
import { OrientationMarker } from "./orientation.js";
import { TreeView } from "./treeview.js";
// TreeData and StateValue available if needed for tree manipulation
import { Timer } from "./timer.js";
import { Clipping } from "./clipping.js";
import { Animation } from "./animation.js";
import {
  isEqual,
  KeyMapper,
  scaleLight,
  deepDispose,
  isOrthographicCamera,
  toVector3Tuple,
  toQuaternionTuple,
} from "./utils.js";
import type { DisposableTree } from "./utils.js";
import { ShapeRenderer } from "./render-shape.js";
import type { ShapeTreeData, RenderResult } from "./render-shape.js";
import type { KeyMappingConfig } from "./utils.js";
import { Controls } from "./controls.js";
import { Camera, type CameraDirection } from "./camera.js";
import { BoundingBox, BoxHelper } from "./bbox.js";
import { Tools, type ToolResponse } from "./cad_tools/tools.js";
import { version } from "./_version.js";
import { PickedObject, Raycaster, TopoFilter } from "./raycast.js";
import { ViewerState } from "./viewer-state.js";
import type { Display } from "./display.js";
import type { Vector3Tuple, QuaternionTuple } from "three";
import type {
  ZebraColorScheme,
  ZebraMappingMode,
  NotificationCallback,
  RenderOptions,
  ViewerOptions,
  Shapes,
  VisibilityState,
  StateChange,
  ActiveTab,
  Axis,
  ClipIndex,
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

// =============================================================================
// VIEWER CLASS
// =============================================================================

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

  // Display reference
  display: Display | null;

  // THREE.js core objects
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  ambientLight: THREE.AmbientLight | null;
  directLight: THREE.DirectionalLight | null;
  mouse: THREE.Vector2 | null;

  // CAD objects
  nestedGroup: NestedGroup | null;
  tree: ShapeTreeData | null;
  bbox: BoundingBox | null;
  bb_max: number;
  bb_radius!: number;
  shapes: Shapes | null;

  // Helpers
  camera: Camera | null;
  gridHelper: Grid | null;
  axesHelper: AxesHelper | null;
  controls: Controls | null;
  orientationMarker: OrientationMarker | null;
  treeview: TreeView | null;

  // Tools
  cadTools: Tools | null;

  // Clipping
  clipping: Clipping | null;
  clipNormals: [THREE.Vector3, THREE.Vector3, THREE.Vector3] | null;
  gridSize!: number;

  // Animation
  hasAnimationLoop: boolean;
  mixer: THREE.AnimationMixer | null;
  animation: Animation | null;
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

    this.notifyCallback = notifyCallback;
    this.pinAsPngCallback = pinAsPngCallback;
    this.updateMarker = updateMarker;

    this.hasAnimationLoop = false;

    this.display = display;

    if (options.keymap) {
      this.setKeyMap(options.keymap);
    }

    window.THREE = THREE;

    this.nestedGroup = null;
    this.tree = null;
    this.bbox = null;
    this.bb_max = 0;
    this.scene = null;
    this.camera = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.controls = null;
    this.orientationMarker = null;
    this.treeview = null;
    this.cadTools = new Tools(this, options.measurementDebug ?? false);

    this.ready = false;
    this.mixer = null;
    this.animation = new Animation("|");
    this.continueAnimation = true;
    this.shapeRenderer = null;

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
    this.clipping = null;
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
   * Return three-cad-viewer version as semver string
   * @returns semver version
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
    this.state.updateRenderState(options, false);

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
      this.nestedGroup!.groups[selector],
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
      this.nestedGroup!.groups[selector],
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
      this.nestedGroup!.groups[selector],
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
      this.nestedGroup!.groups[selector],
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
      console.error("Animation does not have tracks");
      return;
    }
    console.debug("three-cad-viewer: Animation initialized");
    if (!this.hasAnimationLoop) {
      this.toggleAnimationLoop(true);
    }

    this.state.set("animationMode", label === "E" ? "explode" : "animation");
    this.clipAction = this.animation.animate(
      this.nestedGroup!.rootGroup,
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
    if (this.ready) {
      this.renderer!.clear();

      if (this.raycaster && this.raycaster.raycastMode) {
        this.handleRaycast();
      }

      this.gridHelper!.update(this.camera!.getZoom());

      this.renderer!.setViewport(
        0,
        0,
        this.state.get("cadWidth"),
        this.state.get("height"),
      );
      this.renderer!.render(this.scene!, this.camera!.getCamera());
      this.cadTools.update();

      this.directLight.position.copy(this.camera!.getCamera().position);

      if (
        this.lastBbox != null &&
        (this.lastBbox.needsUpdate || this.bboxNeedsUpdate)
      ) {
        console.debug("updated bbox");
        this.lastBbox.bbox.update();
        this.lastBbox.needsUpdate = false;
      }

      if (updateMarker) {
        this.renderer!.clearDepth(); // ensure orientation Marker is at the top

        this.orientationMarker!.update(
          this.camera!.getPosition().clone().sub(this.controls!.getTarget()),
          this.camera!.getQuaternion(),
        );
        this.orientationMarker!.render(this.renderer!);
      }

      if (this.animation) {
        this.animation.update();
      }

      this.checkChanges(
        {
          zoom: this.camera!.getZoom(),
          position: this.camera!.getPosition().toArray(),
          quaternion: this.camera!.getQuaternion().toArray(),
          target: this.controls!.getTarget().toArray(),
        },
        notify,
      );
    }
  };

  /**
   * Start the animation loop
   */
  animate = (): void => {
    if (this.continueAnimation) {
      requestAnimationFrame(this.animate);
      this.controls!.update();
      this.update(true, true);
    } else {
      console.debug("three-cad-viewer: Animation loop stopped");
    }
  };

  toggleAnimationLoop(flag: boolean): void {
    if (flag) {
      this.continueAnimation = true;
      this.hasAnimationLoop = true;
      this.controls!.removeChangeListener();
      console.debug("three-cad-viewer: Change listener removed");
      this.animate();
      console.debug("three-cad-viewer: Animation loop started");
    } else {
      if (this.hasAnimationLoop) {
        console.debug("three-cad-viewer: Turning animation loop off");
      }
      this.continueAnimation = false;
      this.hasAnimationLoop = false;
      this.controls!.addChangeListener(() => this.update(true, true));
      console.debug("three-cad-viewer: Change listener registered");

      // ensure last animation cycle has finished
      setTimeout(() => this.update(true, true), 50);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup & Disposal
  // ---------------------------------------------------------------------------

  /**
   * Remove assets and event handlers.
   */
  dispose(): void {
    this.clear();

    // dispose the orientation marker
    if (this.orientationMarker != null) {
      this.orientationMarker.dispose();
    }

    // dispose renderer
    if (this.renderer != null) {
      this.renderer.renderLists.dispose();
      this.renderer.dispose();
      // forceContextLoss may not exist in test mocks
      if (typeof this.renderer.forceContextLoss === "function") {
        this.renderer.forceContextLoss();
      }
      console.debug("three-cad-viewer: WebGL context disposed");
      this.renderer = null;
    }

    if (this.ambientLight) {
      this.ambientLight.dispose();
      this.ambientLight = null;
    }
    if (this.directLight) {
      this.directLight.dispose();
      this.directLight = null;
    }
    this.materialSettings = null;
    this.clipping = null;
    this.camera = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.controls = null;
    this.orientationMarker = null;
    this.compactTree = null;
    deepDispose(this.cadTools);
    this.cadTools = null;
    this.clipAction = null;
    if (this.treeview) {
      this.treeview.dispose();
      this.treeview = null;
    }
    this.animation = null;
    this.clipNormals = null;
    this.lastNotification = {};
    this.clipNormal0 = null;
    this.clipNormal1 = null;
    this.clipNormal2 = null;
    this.display = null;
    this.renderOptions = null;
    this.mouse = null;
    this.tree = null;
    // Info is owned by Display
    this.bbox = null;
    this.keymap = null;
    if (this.raycaster) {
      this.raycaster.dispose();
      this.raycaster = null;
    }
  }

  /**
   * Clear CAD view and remove event handler.
   */
  clear(): void {
    if (this.scene != null) {
      // stop animation
      this.hasAnimationLoop = false;
      this.continueAnimation = false;

      // remove change listener if exists
      if (!this.hasAnimationLoop) {
        this.controls!.removeChangeListener();
        console.debug("three-cad-viewer: Change listener removed");
      }
      this.hasAnimationLoop = false;
      this.state.set("animationMode", "none");

      if (this.animation != null) {
        deepDispose(this.animation);
      }

      // Reset zscale state
      if (this.shapes?.format === "GDS") {
        this.state.set("zscaleActive", false);
      }
      // clear render canvas
      this.renderer!.clear();

      // deselect measurement tools
      if (this.cadTools) {
        this.cadTools.disable();
        const currentTool = this.state.get("activeTool");
        if (currentTool != null) {
          this.state.set("activeTool", null);
          this.display.setTool(currentTool, false);
        }
      }

      // dispose scene
      deepDispose(this.scene);

      deepDispose(this.gridHelper);
      this.gridHelper = null;

      deepDispose(this.clipping);
      this.clipping = null;

      // clear tree view
      this.display.clearCadTree();

      // clear info
      deepDispose(this.info);

      // dispose camera and controls
      deepDispose(this.camera);
      deepDispose(this.controls);

      // dispose scene
      this.scene = null;
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
    if (this.nestedGroup != null) {
      deepDispose(this.nestedGroup);
      this.nestedGroup = null;
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
    const group = this.nestedGroup!.groups["/" + path];
    if (group instanceof ObjectGroup) {
      if (group.front) {
        return "#" + group.front.material.color.getHexString();
      }
    }
    return null;
  };

  /**
   * Toggle the two version of the NestedGroup
   * @param expanded - whether to render the exploded or compact version
   */
  toggleGroup(expanded: boolean): void {
    const timer = new Timer("toggleGroup", this.state.get("timeit"));
    const _config = (): void => {
      this.nestedGroup!.setTransparent(this.state.get("transparent"));
      this.nestedGroup!.setBlackEdges(this.state.get("blackEdges"));
      this.nestedGroup!.setMetalness(this.state.get("metalness"));
      this.nestedGroup!.setRoughness(this.state.get("roughness"));
      this.nestedGroup!.setPolygonOffset(2);
    };

    if (
      (this.compactNestedGroup == null && !expanded) ||
      (this.expandedNestedGroup == null && expanded)
    ) {
      this.setRenderDefaults(this.renderOptions);
      let result: RenderResult;
      if (expanded) {
        if (this.expandedNestedGroup == null) {
          result = this.renderTessellatedShapes(expanded, this.shapes!);
          this.nestedGroup = result.group;
          this.expandedNestedGroup = result.group;
          _config();
          this.expandedTree = result.tree;
        }
      } else {
        if (this.compactNestedGroup == null) {
          result = this.renderTessellatedShapes(expanded, this.shapes!);
          this.nestedGroup = result.group;
          this.compactNestedGroup = result.group;
          _config();
          this.compactTree = result.tree;
        }
      }
      timer.split(`rendered${expanded ? " exploded" : " compact"} shapes`);
    } else {
      this.nestedGroup = expanded
        ? this.expandedNestedGroup
        : this.compactNestedGroup;
      _config();
    }

    // only sync if both trees exist
    if (this.expandedTree) {
      this.syncTreeStates(this.compactTree!, this.expandedTree, expanded, "");
    }
    timer.split("synched tree states");

    this.tree = expanded ? this.expandedTree : this.compactTree;
    this.scene!.children[0] = this.nestedGroup!.rootGroup;
    timer.split("added shapes to scene");

    deepDispose(this.treeview);
    if (!this.tree) {
      throw new Error("Tree not initialized");
    }
    this.treeview = new TreeView(
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
    const t = this.treeview.create();
    timer.split("created tree");

    this.display.addCadTree(t);
    this.treeview.render();
    timer.split("rendered tree");
    timer.stop();
  }

  /**
   * Set the active sidebar tab.
   * @param tabName - Tab name: "tree", "clip", "material", or "zebra"
   */
  setActiveTab(tabName: ActiveTab): void {
    this.state.set("activeTab", tabName);
  }

  toggleTab(disable: boolean): void {
    const timer = new Timer("toggleTab", this.state.get("timeit"));
    this.setActiveTab("tree");
    timer.split("collapse tree");
    switch (this.state.get("collapse")) {
      case 0:
        this.treeview!.expandAll();
        break;
      case 1:
        this.treeview!.openLevel(-1);
        break;
      case 2:
        this.treeview!.collapseAll();
        break;

      case 3:
        this.treeview!.openLevel(1);
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
   * Render a CAD object and build the navigation tree
   * @param shapes - the Shapes object representing the tessellated CAD object
   * @param renderOptions - the render options
   * @param viewerOptions - the viewer options
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

    this.scene = new THREE.Scene();

    //
    // add shapes and cad tree
    //

    this.toggleGroup(false);
    timer.split("scene and tree done");

    if (!this.bbox) {
      this.bbox = this.nestedGroup!.boundingBox();
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
    this.camera = new Camera(
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
    this.controls = new Controls(
      this.state.get("control"),
      this.camera.getCamera(),
      new THREE.Vector3(...(viewerOptions.target ?? this.bbox.center())),
      this.renderer!.domElement,
      this.state.get("rotateSpeed"),
      this.state.get("zoomSpeed"),
      this.state.get("panSpeed"),
      this.state.get("holroyd"),
    );
    // Disable keyboard controls (these properties exist on THREE.js controls internally)
    this.controls.controls.enableKeys = false;

    // ensure panning works for screen coordinates (only exists on OrbitControls)
    if ("screenSpacePanning" in this.controls.controls) {
      this.controls.controls.screenSpacePanning = true;
    }

    // this needs to happen after the controls have been established
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
        this.camera.lookAtTarget();
      }
    } else {
      this.display.addInfoHtml(
        "<b>quaternion needs position to be provided, falling back to ISO view</b>",
      );
      this.presetCamera("iso", this.state.get("zoom"));
    }
    this.controls.update();

    // Save the new state again
    this.controls.saveState();

    //
    // add lights
    //

    this.ambientLight = new THREE.AmbientLight(
      0xffffff,
      scaleLight(this.state.get("ambientIntensity")),
    );
    this.scene.add(this.ambientLight);

    this.directLight = new THREE.DirectionalLight(
      0xffffff,
      scaleLight(this.state.get("directIntensity")),
    );
    this.scene.add(this.directLight);

    this.setAmbientLight(this.state.get("ambientIntensity"));
    this.setDirectLight(this.state.get("directIntensity"));

    //
    // add grid helpers
    //

    this.gridHelper = new Grid({
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
      maxAnisotropy: this.renderer!.capabilities.getMaxAnisotropy(),
      tickValueElement: this.display.tickValueElement,
      tickInfoElement: this.display.tickInfoElement,
      getCamera: () => this.camera?.getCamera() ?? null,
      getAxes0: () => this.state?.get("axes0") ?? false,
    });
    this.gridHelper.computeGrid();

    this.scene.add(this.gridHelper);

    this.gridSize = this.gridHelper.size;

    //
    // add axes helper
    //

    this.axesHelper = new AxesHelper(
      this.bbox.center(),
      this.gridSize / 2,
      2,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.state.get("axes0"),
      this.state.get("axes"),
      this.state.get("theme"),
    );
    this.scene.add(this.axesHelper);

    //
    // set up clipping planes and helpers
    //
    const cSize =
      1.1 *
      Math.max(
        Math.abs(this.bbox.min.length()),
        Math.abs(this.bbox.max.length()),
      );
    this.clipping = new Clipping(
      this.bbox.center(),
      2 * cSize,
      this.nestedGroup!,
      {
        onNormalChange: (index, normalArray) =>
          this.display.setNormalLabel(index, normalArray),
      },
      this.state.get("theme"),
    );

    this.display.setSliderLimits(this.gridSize / 2);

    this.setClipNormal(0, viewerOptions.clipNormal0 ?? null, null, true);
    this.setClipNormal(1, viewerOptions.clipNormal1 ?? null, null, true);
    this.setClipNormal(2, viewerOptions.clipNormal2 ?? null, null, true);

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

    this.setClipSlider(0, clipSlider0, true);
    this.setClipSlider(1, clipSlider1, true);
    this.setClipSlider(2, clipSlider2, true);

    this.setClipIntersection(viewerOptions.clipIntersection ?? false, true);
    this.setClipObjectColorCaps(viewerOptions.clipObjectColors ?? false, true);

    this.scene.add(this.clipping);
    this.nestedGroup!.setClipPlanes(this.clipping.clipPlanes);

    this.setLocalClipping(false); // only allow clipping when Clipping tab is selected

    this.clipping.setVisible(false);

    this.toggleTab(false);

    // Theme is already resolved ("light" or "dark") by ViewerState constructor
    const theme = this.state.get("theme");

    //
    // set up the orientation marker
    //

    this.orientationMarker = new OrientationMarker(
      80,
      80,
      this.camera.getCamera(),
      theme,
    );
    this.orientationMarker.create();

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
    this.display.showReadyMessage(version, this.state.get("control"));

    //
    // notify calculated results
    //
    timer.split("show done");
    if (this.notifyCallback) {
      this.notifyCallback({
        tab: { old: null, new: this.state.get("activeTab") },
        target: {
          old: null,
          new: toVector3Tuple(this.controls.target.toArray()),
        },
        target0: {
          old: null,
          new: toVector3Tuple(this.controls.target0.toArray()),
        },
        clip_normal_0: { old: null, new: this.clipNormal0 },
        clip_normal_1: { old: null, new: this.clipNormal1 },
        clip_normal_2: { old: null, new: this.clipNormal2 },
      });
    }
    timer.split("notification done");

    this.update(true, false);
    this.treeview!.update();
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
   * Move the camera to a given locations
   * @param relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param position - the camera position as 3 dim array [x,y,z]
   * @param quaternion - the camera rotation expressed by a quaternion array [x,y,z,w].
   * @param zoom - zoom value.
   * @param notify - whether to send notification or not.
   */
  setCamera = (
    relative: boolean,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion | null = null,
    zoom: number | null = null,
    notify: boolean = true,
  ): void => {
    this.camera!.setupCamera(relative, position, quaternion, zoom);
    this.update(true, notify);
  };

  /**
   * Move the camera to one of the preset locations
   * @param dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   * @param zoom - zoom value
   * @param notify - whether to send notification or not.
   */
  presetCamera = (
    dir: CameraDirection,
    zoom: number | null = null,
    notify: boolean = true,
  ): void => {
    this.camera!.target = new THREE.Vector3(...this.bbox!.center());
    this.camera!.presetCamera(dir, zoom);
    this.controls!.setTarget(this.camera!.target);
    this.update(true, notify);
  };

  /**
   * Get reset location value.
   * @returns target, position, quaternion, zoom as object.
   */
  getResetLocation = (): ResetLocation => {
    return this.controls!.getResetLocation();
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
    this.controls!.setResetLocation(
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
    return this.camera!.ortho ? "ortho" : "perspective";
  }

  /**
   * Set camera mode to OrthographicCamera or PerspectiveCamera (see also setOrtho)
   * @param flag - whether the camera should be orthographic or perspective
   * @param notify - whether to send notification or not.
   */
  switchCamera(flag: boolean, notify: boolean = true): void {
    this.state.set("ortho", flag);
    this.camera!.switchCamera(flag);
    this.controls!.setCamera(this.camera!.getCamera());

    this.checkChanges({ ortho: flag }, notify);

    this.gridHelper!.scaleLabels();
    this.gridHelper!.update(this.camera!.getZoom(), true);

    this.update(true, notify);
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
    const groups = this.nestedGroup!.groups;

    let bbox = new BoundingBox();
    for (const path in groups) {
      const obj = groups[path];
      if (obj instanceof ObjectGroup) {
        if (obj.getVisibility()) {
          console.log(path);
          bbox.expandByObject(obj);
        }
      }
    }
    const target = new THREE.Vector3(...bbox.center());
    this.setCameraTarget(target);
    this.update(true, notify);
  }

  /**
   * Reset zoom to 1.0
   */
  resize = (): void => {
    this.camera!.setZoom(1.0);
    this.camera!.updateProjectionMatrix();
    this.update(true);
  };

  /**
   * Reset the view to the initial camera and controls settings
   */
  reset = (): void => {
    this.controls!.reset();
    this.update(true);
  };

  /**
   * Enable/disable local clipping
   * @param flag - whether to enable local clipping
   */
  setLocalClipping(flag: boolean): void {
    this.renderer!.localClippingEnabled = flag;
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
    const objectGroup = this.nestedGroup!.groups[path];
    if (objectGroup != null && objectGroup instanceof ObjectGroup) {
      if (iconNumber === 0) {
        objectGroup.setShapeVisible(state === 1);
      } else {
        objectGroup.setEdgesVisible(state === 1);
      }
      if (notify) {
        const stateObj: Record<string, VisibilityState> = {};
        stateObj[path] = this.getState(path);
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
    const group = this.nestedGroup!.groups[id];
    if (group != null) {
      if (this.lastBbox != null) {
        this.scene!.remove(this.lastBbox.bbox);
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
        this.scene!.add(this.lastBbox.bbox);
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
    const sliderKeys = ["clipSlider0", "clipSlider1", "clipSlider2"] as const;
    this.state.set(sliderKeys[index], value);
    this.clipping!.setConstant(index, value);
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
      this.initAnimation(params.duration, params.speed, "A", params.repeat);
    }
  }

  /**
   * Handler for the animation control
   * @param btn - the pressed button as string: "play", "pause", "stop"
   */
  controlAnimation = (btn: string): void => {
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
    this.treeview!.setState(id, state);
    this.update(this.updateMarker, notify);
  };

  removeLastBbox(): void {
    if (this.lastBbox != null) {
      this.scene!.remove(this.lastBbox.bbox);
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
    point: THREE.Vector3,
    nodeType: string | null = "leaf",
    tree: boolean = false,
  ): void => {
    const id = `${path}/${name}`;
    const object = this.nestedGroup!.groups[id];
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
      this.treeview!.toggleLabelColor(null, id);
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
          this.treeview!.hideAll();
          this.setState(id, [1, 1], nodeType ?? "leaf");
        } else {
          const center = boundingBox.center();
          this.setCameraTarget(point);
          this.display.showCenterInfo(center);
        }
      } else if (shift) {
        this.removeLastBbox();
        this.treeview!.hideAll();
        this.setState(id, [1, 1], nodeType ?? "leaf");
        const center = boundingBox.center();
        this.setCameraTarget(new THREE.Vector3(...center));
        this.display.showCenterInfo(center);
      } else if (meta) {
        this.setState(id, [0, 0], nodeType ?? "leaf");
      } else {
        this.display.showBoundingBoxInfo(path, name, boundingBox);
        this.setBoundingBox(id);
        this.treeview!.openPath(id);
      }
    }
    this.update(true);
  };

  // ---------------------------------------------------------------------------
  // Object Picking & Selection
  // ---------------------------------------------------------------------------

  setPickHandler(flag: boolean): void {
    if (flag) {
      this.renderer!.domElement.addEventListener("dblclick", this.pick, false);
    } else {
      this.renderer!.domElement.removeEventListener(
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
      this.camera!,
      this.renderer!.domElement,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.bb_max / 30,
      this.scene!.children[0],
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
    this.nestedGroup!.clearSelection();
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
        this.treeview!.toggleLabelColor(
          null,
          obj.name.replaceAll(this.nestedGroup!.delim, "/"),
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
        this.camera!,
        this.renderer!.domElement,
        this.state.get("cadWidth"),
        this.state.get("height"),
        this.bb_max / 30,
        this.scene!.children[0],
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
   * Get whether axes helpers are shown/hidden.
   * @returns axes value.
   */
  getAxes(): boolean {
    return this.state.get("axes");
  }

  /**
   * Show/hide axes helper
   * @param flag - whether to show the axes
   * @param notify - whether to send notification or not.
   */
  setAxes = (flag: boolean, notify: boolean = true): void => {
    this.state.set("axes", flag);
    this.axesHelper!.setVisible(flag);

    this.checkChanges({ axes: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Show/hide grids
   * @param action - one of "grid" (all grids), "grid-xy","grid-xz", "grid-yz"
   * @param flag - visibility flag
   * @param notify - whether to send notification or not.
   */
  setGrid = (action: string, flag: boolean, notify: boolean = true): void => {
    this.gridHelper!.setGrid(action, flag);
    // Copy array to avoid reference comparison issues in state.set
    const [a, b, c] = this.gridHelper!.grid;
    this.state.set("grid", [a, b, c]);

    this.checkChanges({ grid: this.gridHelper!.grid }, notify);

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
    this.gridHelper!.setGrids(...grids);
    // Copy array to avoid reference comparison issues in state.set
    const [a, b, c] = this.gridHelper!.grid;
    this.state.set("grid", [a, b, c]);

    this.checkChanges({ grid: this.gridHelper!.grid }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Set grid center
   * @param center - true for centering grid at (0,0,0)
   * @param notify - whether to send notification or not.
   */
  setGridCenter = (center: boolean, notify: boolean = true): void => {
    this.gridHelper!.centerGrid = center;
    this.gridHelper!.setCenter(
      this.state.get("axes0"),
      this.state.get("up") === "Z",
    );

    this.checkChanges({ center_grid: this.gridHelper!.centerGrid }, notify);

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
    this.state.set("axes0", flag);
    this.gridHelper!.setCenter(flag, this.state.get("up") === "Z");
    this.axesHelper!.setCenter(flag);

    this.checkChanges({ axes0: flag }, notify);

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
   * Set CAD objects transparency
   * @param flag - whether to show the CAD object in transparent mode
   * @param notify - whether to send notification or not.
   */
  setTransparent = (flag: boolean, notify: boolean = true): void => {
    this.state.set("transparent", flag);
    this.nestedGroup!.setTransparent(flag);

    this.checkChanges({ transparent: flag }, notify);

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
   * Show edges in black or the default edge color
   * @param flag - whether to show edges in black
   * @param notify - whether to send notification or not.
   */
  setBlackEdges = (flag: boolean, notify: boolean = true): void => {
    this.state.set("blackEdges", flag);
    this.nestedGroup!.setBlackEdges(flag);

    this.checkChanges({ black_edges: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Show or hide the CAD tools panel
   * @param flag - whether to show tools
   * @param notify - whether to send notification or not.
   */
  setTools = (flag: boolean, notify: boolean = true): void => {
    this.state.set("tools", flag);
    this.checkChanges({ tools: flag }, notify);
  };

  /**
   * Enable or disable glass mode (overlay navigation)
   * @param flag - whether to enable glass mode
   * @param notify - whether to send notification or not.
   */
  setGlass = (flag: boolean, notify: boolean = true): void => {
    this.state.set("glass", flag);
    this.checkChanges({ glass: flag }, notify);
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
    this.state.set("edgeColor", color);
    this.nestedGroup!.setEdgeColor(color);
    this.update(this.updateMarker, notify);
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
    this.state.set("defaultOpacity", opacity);
    this.nestedGroup!.setOpacity(opacity);
    this.update(this.updateMarker, notify);
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
    this.state.set("tools", flag);
    this.update(this.updateMarker, notify);
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
   * Set the intensity of ambient light
   * @param val - the new ambient light intensity
   * @param notify - whether to send notification or not.
   */
  setAmbientLight = (val: number, notify: boolean = true): void => {
    val = Math.max(0, Math.min(4, val));
    this.state.set("ambientIntensity", val);
    this.ambientLight.intensity = scaleLight(val);
    this.checkChanges({ ambient_intensity: val }, notify);
    this.update(this.updateMarker, notify);
  };

  /**
   * Get intensity of direct light.
   * @returns directLight value.
   */
  getDirectLight(): number {
    return this.state.get("directIntensity");
  }

  /**
   * Set the intensity of directional light
   * @param val - the new direct light intensity
   * @param notify - whether to send notification or not.
   */
  setDirectLight = (val: number, notify: boolean = true): void => {
    val = Math.max(0, Math.min(4, val));
    this.state.set("directIntensity", val);
    this.directLight.intensity = scaleLight(val);
    this.checkChanges({ direct_intensity: val }, notify);
    this.update(this.updateMarker, notify);
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
   * @param value - The metalness value to set.
   * @param notify - Whether to notify about the changes.
   */
  setMetalness = (value: number, notify: boolean = true): void => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("metalness", value);
    this.nestedGroup!.setMetalness(value);
    this.checkChanges({ metalness: value }, notify);
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
   * @param value - The roughness value to set.
   * @param notify - Whether to notify about the changes.
   */
  setRoughness = (value: number, notify: boolean = true): void => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("roughness", value);
    this.nestedGroup!.setRoughness(value);
    this.checkChanges({ roughness: value }, notify);
    this.update(this.updateMarker);
  };

  /**
   * Resets the material settings of the viewer to their default values.
   * Updates the metalness, roughness, ambient light intensity, and direct light intensity
   * based on the current material settings.
   */
  resetMaterial = (): void => {
    this.setMetalness(this.materialSettings.metalness, true);
    this.setRoughness(this.materialSettings.roughness, true);
    this.setAmbientLight(this.materialSettings.ambientIntensity, true);
    this.setDirectLight(this.materialSettings.directIntensity, true);
  };

  // ---------------------------------------------------------------------------
  // Getters & Setters: Zebra Tool
  // ---------------------------------------------------------------------------

  enableZebraTool = (flag: boolean): void => {
    this.nestedGroup!.setZebra(flag);
    this.update(true, true);
    this.treeview!.update();
  };

  /**
   * Sets the stripe count value for the viewer and updates related components.
   * @param value - The stripe count value to set.
   */
  setZebraCount = (value: number): void => {
    value = Math.max(2, Math.min(50, value));
    this.state.set("zebraCount", value);
    this.nestedGroup!.setZebraCount(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe opacity value for the viewer and updates related components.
   * @param value - The stripe opacity value to set.
   */
  setZebraOpacity = (value: number): void => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("zebraOpacity", value);
    this.nestedGroup!.setZebraOpacity(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe direction value for the viewer and updates related components.
   * @param value - The stripe direction value to set.
   */
  setZebraDirection = (value: number): void => {
    value = Math.max(0, Math.min(90, value));
    this.state.set("zebraDirection", value);
    this.nestedGroup!.setZebraDirection(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe color scheme for the viewer and updates related components.
   * @param value - The color scheme ("blackwhite", "colorful", "grayscale").
   */
  setZebraColorScheme = (value: ZebraColorScheme): void => {
    this.state.set("zebraColorScheme", value);
    this.nestedGroup!.setZebraColorScheme(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe mapping mode for the viewer and updates related components.
   * @param value - The mapping mode ("reflection", "normal").
   */
  setZebraMappingMode = (value: ZebraMappingMode): void => {
    this.state.set("zebraMappingMode", value);
    this.nestedGroup!.setZebraMappingMode(value);
    this.update(this.updateMarker);
  };

  // ---------------------------------------------------------------------------
  // Camera State Getters & Setters
  // ---------------------------------------------------------------------------

  /**
   * Get ortho value as property (for ViewerLike interface compatibility).
   */
  get ortho(): boolean {
    return this.camera?.ortho ?? true;
  }

  /**
   * Get ortho value.
   * @returns ortho value.
   */
  getOrtho(): boolean {
    return this.camera!.ortho;
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
    this.nestedGroup!.setZScale(value);
    this.zScale = value;
    this.update(true);
  }

  /**
   * Get zoom value.
   * @returns zoom value.
   */
  getCameraZoom(): number {
    return this.camera!.getZoom();
  }

  /**
   * Set zoom value.
   * @param val - float zoom value.
   * @param notify - whether to send notification or not.
   */
  setCameraZoom(val: number, notify: boolean = true): void {
    this.camera!.setZoom(val);
    this.controls!.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera position.
   * @returns camera position as 3 dim array [x,y,z].
   */
  getCameraPosition(): number[] {
    return this.camera!.getPosition().toArray();
  }

  /**
   * Set camera position.
   * @param position - camera position as 3 dim Array [x,y,z].
   * @param relative - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param notify - whether to send notification or not.
   */
  setCameraPosition(
    position: Vector3Tuple,
    relative: boolean = false,
    notify: boolean = true,
  ): void {
    this.camera!.setPosition(position, relative);
    this.controls!.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera rotation as quaternion.
   * @returns camera rotation as 4 dim quaternion array [x,y,z,w].
   */
  getCameraQuaternion(): QuaternionTuple {
    return toQuaternionTuple(this.camera!.getQuaternion().toArray());
  }

  /**
   * Set camera rotation via quaternion.
   * @param quaternion - camera rotation as 4 dim quaternion array [x,y,z,w].
   * @param notify - whether to send notification or not.
   */
  setCameraQuaternion(
    quaternion: QuaternionTuple,
    notify: boolean = true,
  ): void {
    this.camera!.setQuaternion(quaternion);
    this.controls!.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera target.
   * @returns camera target as 3 dim array array [x,y,z].
   */
  getCameraTarget(): Vector3Tuple {
    return toVector3Tuple(this.controls!.getTarget().toArray());
  }

  /**
   * Set camera target.
   * @param target - camera target as 3 dim array [x,y,z].
   * @param notify - whether to send notification or not.
   */
  setCameraTarget(target: THREE.Vector3, notify: boolean = true): void {
    // Store current state
    const camera = this.camera!.getCamera();
    const zoom = camera.zoom; // For orthographic cameras

    const offset = camera.position.clone().sub(this.controls!.getTarget());

    // Update position and target
    camera.position.copy(target.clone().add(offset));
    camera.updateWorldMatrix(true, false);
    this.controls!.getTarget().copy(target);

    // Preserve zoom for orthographic cameras
    if (isOrthographicCamera(camera)) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }

    // Update controls
    this.controls!.update();
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
      this.camera!.setPosition(position, false);
    }
    if (quaternion != null && this.state.get("control") === "trackball") {
      this.camera!.setQuaternion(quaternion);
    }
    if (target != null) {
      this.controls!.setTarget(new THREE.Vector3(...target));
    }
    if (zoom != null) {
      this.camera!.setZoom(zoom);
    }
    this.controls!.update();
    this.update(true, notify);
  }

  // ---------------------------------------------------------------------------
  // Tree State Management
  // ---------------------------------------------------------------------------

  /**
   * Get states of a treeview leafs.
   */
  getStates(): Record<string, VisibilityState> {
    return this.treeview!.getStates();
  }

  /**
   * Get state of a treeview leafs for a path.
   * separator can be / or |
   * @param path - path of the object
   * @returns state value in the form of [mesh, edges] = [0/1, 0/1]
   */
  getState(path: string): VisibilityState {
    const p = path.replaceAll("|", "/");
    return this.treeview!.getState(p);
  }

  /**
   * Set states of a treeview leafs
   * @param states - states object
   */
  setStates = (states: Record<string, VisibilityState>): void => {
    this.treeview!.setStates(states);
  };

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
    this.state.set("zoomSpeed", val);
    this.controls!.setZoomSpeed(val);
    this.checkChanges({ grid: this.gridHelper!.grid }, notify);
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
    this.state.set("panSpeed", val);
    this.controls!.setPanSpeed(val);
    this.checkChanges({ grid: this.gridHelper!.grid }, notify);
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
    this.state.set("rotateSpeed", val);
    this.controls!.setRotateSpeed(val);
    this.checkChanges({ grid: this.gridHelper!.grid }, notify);
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
    this.state.set("holroyd", flag);
    this.controls!.setHolroydTrackball(flag);
    this.checkChanges({ grid: this.gridHelper!.grid }, notify);
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
    if (flag == null) return;

    this.state.set("clipIntersection", flag);
    this.nestedGroup!.setClipIntersection(flag);

    const clipPlanes = flag
      ? this.clipping!.reverseClipPlanes
      : this.clipping!.clipPlanes;

    for (const child of this.nestedGroup!.rootGroup.children) {
      if (child.name === "PlaneMeshes") {
        for (const capPlane of child.children) {
          if (!isIndexedMesh(capPlane)) continue;
          if (!isClippableMaterial(capPlane.material)) continue;
          capPlane.material.clippingPlanes = clipPlanes.filter(
            (_, j) => j !== capPlane.index,
          );
        }
      }
    }

    for (const child of this.scene!.children) {
      if (child.name === "PlaneHelpers") {
        for (const helper of child.children[0].children) {
          if (!isIndexedMesh(helper)) continue;
          if (!isClippableMaterial(helper.material)) continue;
          helper.material.clippingPlanes = clipPlanes.filter(
            (_, j) => j !== helper.index,
          );
        }
      }
    }

    this.checkChanges({ clip_intersection: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Get whether the clipping caps color status
   * @returns color caps value (object color (true) or RGB (false)).
   */
  getObjectColorCaps = (): boolean => {
    return this.clipping!.getObjectColorCaps();
  };

  /**
   * Toggle the clipping caps color between object color and RGB
   * @param flag - whether to use intersection mode
   * @param notify - whether to send notification or not.
   */
  setClipObjectColorCaps = (flag: boolean, notify: boolean = true): void => {
    if (flag == null) return;
    this.state.set("clipObjectColors", flag);
    this.clipping!.setObjectColorCaps(flag);
    this.checkChanges({ clip_object_colors: flag }, notify);
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
    if (flag == null) return;

    this.state.set("clipPlaneHelpers", flag);
    this.clipping!.planeHelpers.visible = flag;

    this.checkChanges({ clip_planes: flag }, notify);

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
    if (normal == null) return;
    const normal1 = new THREE.Vector3(...normal).normalize();
    this.clipNormals[index] = normal1;

    this.clipping!.setNormal(index, normal1);
    this.clipping!.setConstant(index, this.gridSize / 2);
    if (value == null) value = this.gridSize / 2;
    this.setClipSlider(index, value);

    const notifyObject: Record<string, unknown> = {};
    notifyObject[`clip_normal_${index}`] = normal1.toArray();
    notifyObject[`clip_slider_${index}`] = value;
    this.checkChanges(notifyObject, notify);

    this.nestedGroup!.setClipPlanes(this.clipping!.clipPlanes);

    this.update(this.updateMarker);
  }

  /**
   * Set the normal at index to the current viewing direction
   * @param index - index of the normal: 0, 1 ,2
   * @param notify - whether to send notification or not.
   */
  setClipNormalFromPosition = (index: ClipIndex, notify: boolean = true): void => {
    const cameraPosition = this.camera!.getPosition().clone();
    const normal = toVector3Tuple(
      cameraPosition
        .sub(this.controls!.getTarget())
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
   * Set clipping slider value.
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
        console.error("Screenshot dataUrl is not a string");
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
   * Note: Only the canvas will be shown, no tools and orientation marker
   */
  getImage = (taskId: string): Promise<ImageResult> => {
    // canvas.toBlob can be very slow when animation loop is off!
    const animationLoop = this.hasAnimationLoop;
    if (!animationLoop) {
      this.toggleAnimationLoop(true);
    }
    this.orientationMarker!.setVisible(false);
    this.update(true);

    return this.display.captureCanvas({
      taskId,
      render: () => {
        this.renderer!.setViewport(
          0,
          0,
          this.state.get("cadWidth"),
          this.state.get("height"),
        );
        this.renderer!.render(this.scene!, this.camera!.getCamera());
      },
      onComplete: () => {
        // Restore animation loop to original state
        if (!animationLoop) {
          this.toggleAnimationLoop(false);
        }
        this.orientationMarker!.setVisible(true);
        this.update(true);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Explode Animation
  // ---------------------------------------------------------------------------

  /**
   * Calculate explode trajectories and initiate the animation
   *
   * @param duration - duration of animation.
   * @param speed - speed of animation.
   * @param multiplier - multiplier for length of trajectories.
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
      const bb = new THREE.Box3().setFromObject(this.nestedGroup!.rootGroup);
      bb.getCenter(worldCenterOrOrigin);
    }
    for (const id in this.nestedGroup!.groups) {
      // Loop over all Group elements
      const group = this.nestedGroup!.groups[id];

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
   * Toggle explode mode on/off
   * @param flag - whether to enable or disable explode mode
   */
  setExplode(flag: boolean): void {
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
   * Set modifiers for keymap
   *
   * @param config - keymap e.g. {"shift": "shiftKey", "ctrl": "ctrlKey", "meta": "altKey"}
   */
  setKeyMap(config: KeymapConfig): void {
    const before = KeyMapper.get_config();
    KeyMapper.set(config);
    this.display.updateHelp(before, config);
  }

  // ---------------------------------------------------------------------------
  // View Layout
  // ---------------------------------------------------------------------------

  /**
   * Resize UI and renderer
   *
   * @param cadWidth - new width of CAD View
   * @param treeWidth - new width of navigation tree
   * @param height - new height of CAD View
   * @param glass - Whether to use glass mode or not
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
    this.renderer!.setSize(cadWidth, height);

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
    this.camera!.changeDimensions(this.bb_radius, cadWidth, height);

    // update the this
    this.update(true);

    // update the raycaster
    if (this.raycaster) {
      this.raycaster.width = cadWidth;
      this.raycaster.height = height;
    }
  }

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
