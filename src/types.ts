/**
 * TypeScript type definitions for three-cad-viewer
 */

import * as THREE from "three";
import type { Vector3Tuple, QuaternionTuple } from "three";

// Re-export tuple types for external API use
export type { Vector3Tuple, QuaternionTuple } from "three";

// =============================================================================
// Basic Types
// =============================================================================

/** Theme input option (browser resolves to light or dark) */
export type ThemeInput = "light" | "dark" | "browser";

/** Resolved theme (after browser detection) */
export type Theme = "light" | "dark";

/** Control type */
export type ControlType = "orbit" | "trackball";

/** Up direction */
export type UpDirection = "Z" | "Y" | "legacy";

/** Animation mode */
export type AnimationMode = "none" | "animation" | "explode";

/** Active sidebar tab */
export type ActiveTab = "tree" | "clip" | "material" | "zebra";

/** Zebra color scheme */
export type ZebraColorScheme = "blackwhite" | "colorful" | "grayscale";

/** Zebra mapping mode */
export type ZebraMappingMode = "reflection" | "normal";

/** Shape type */
export type ShapeType = "shapes" | "edges" | "vertices";

/** Shape subtype */
export type ShapeSubtype = "solid" | "faces";

/** Axis identifier */
export type Axis = "x" | "y" | "z";

/** Clip plane index (0, 1, or 2) */
export type ClipIndex = 0 | 1 | 2;

/** Valid clip indices as array for iteration */
export const CLIP_INDICES: readonly ClipIndex[] = [0, 1, 2];

/** Type guard to check if a number is a valid ClipIndex */
export function isClipIndex(n: number): n is ClipIndex {
  return n === 0 || n === 1 || n === 2;
}

/** Color value that THREE.Color accepts - hex number or CSS string */
export type ColorValue = number | string;

/** RGB color as tuple [r, g, b] with values 0-1 */
export type RGBColor = [number, number, number];

/** Axis colors per theme - array of RGB colors for X, Y, Z axes */
export type AxisColors = Record<Theme, RGBColor[]>;

/** Flat axis colors per theme - all RGB values concatenated for line geometry */
export type AxisColorsFlatArray = Record<Theme, number[]>;

// =============================================================================
// State Change Types
// =============================================================================

/** State change object with old and new values */
export interface StateChange<T> {
  old: T | undefined;
  new: T;
}

/** Callback for state change subscriptions */
export type StateSubscriber<T> = (change: StateChange<T>) => void;

/** Callback for global state subscriptions */
export type GlobalStateSubscriber = (key: string, change: StateChange<unknown>) => void;

// =============================================================================
// Bounding Box & Sphere
// =============================================================================

export interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface BoundingSphere {
  center: { x: number; y: number; z: number };
  radius: number;
}

export interface BoundingBoxFlat {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
}

// =============================================================================
// Pick Info
// =============================================================================

export interface PickInfo {
  path: string;
  name: string;
  boundingBox: BoundingBox;
  boundingSphere: BoundingSphere;
}

// =============================================================================
// Change Notifications
// =============================================================================

/** Camera position/zoom, UI and pick changes */
export interface ChangeInfos {
  camera_position?: Vector3Tuple;
  camera_zoom?: number;
  axes?: boolean;
  axes0?: boolean;
  ortho?: boolean;
  grid?: [boolean, boolean, boolean];
  lastPick?: PickInfo | null;
}

/** Camera position/zoom, UI and pick change notification with old/new values */
export interface ChangeNotification {
  // Camera state
  camera_position?: StateChange<Vector3Tuple>;
  camera_zoom?: StateChange<number>;
  position?: StateChange<Vector3Tuple>;
  quaternion?: StateChange<QuaternionTuple>;
  target?: StateChange<Vector3Tuple>;
  zoom?: StateChange<number>;
  // Reset location
  position0?: StateChange<Vector3Tuple>;
  quaternion0?: StateChange<QuaternionTuple>;
  target0?: StateChange<Vector3Tuple>;
  zoom0?: StateChange<number>;
  // UI state
  axes?: StateChange<boolean>;
  axes0?: StateChange<boolean>;
  ortho?: StateChange<boolean>;
  grid?: StateChange<[boolean, boolean, boolean]>;
  tab?: StateChange<ActiveTab | null>;
  // Clipping
  clip_normal_0?: StateChange<Vector3Tuple>;
  clip_normal_1?: StateChange<Vector3Tuple>;
  clip_normal_2?: StateChange<Vector3Tuple>;
  // Pick info
  lastPick?: StateChange<PickInfo | null>;
  // Allow other state properties dynamically
  [key: string]: StateChange<unknown> | undefined;
}

/** Callback for notifications */
export type NotificationCallback = (change: ChangeNotification) => void;

// =============================================================================
// Options
// =============================================================================

/** Display options */
export interface DisplayOptions {
  /** Width of CAD canvas (default: 800) */
  cadWidth?: number;
  /** Height of CAD canvas (default: 600) */
  height?: number;
  /** Width of tree navigation (default: 250) */
  treeWidth?: number;
  /** Height of tree navigation (default: 400) */
  treeHeight?: number;
  /** Theme: "light", "dark", or "browser" (default: "light") */
  theme?: Theme;
  /** Enable pinning (default: false) */
  pinning?: boolean;
  /** Enable glass mode (default: false) */
  glass?: boolean;
  /** Show/hide all tools (default: true) */
  tools?: boolean;
  /** Keymap configuration */
  keymap?: {
    shift: string;
    ctrl: string;
    meta: string;
  };
  /** Use new tree behavior (default: true) */
  newTreeBehavior?: boolean;
  /** Show measure tools (default: true) */
  measureTools?: boolean;
  /** Show select tool (default: true) */
  selectTool?: boolean;
  /** Show explode tool (default: true) */
  explodeTool?: boolean;
  /** Show z-scale tool (default: false) */
  zscaleTool?: boolean;
  /** Show zebra tool (default: true) */
  zebraTool?: boolean;
  /** Enable measurement debug mode (default: false) */
  measurementDebug?: boolean;
}

/** Render options */
export interface RenderOptions {
  /** Default edge color (default: 0x707070) */
  edgeColor?: number;
  /** Ambient light intensity (default: 0.5) */
  ambientIntensity?: number;
  /** Direct light intensity (default: 0.6) */
  directIntensity?: number;
  /** Metalness (default: 0.7) */
  metalness?: number;
  /** Roughness (default: 0.7) */
  roughness?: number;
  /** Default opacity level for transparency (default: 0.5) */
  defaultOpacity?: number;
  /** Show triangle normals when normalLen > 0 (default: 0) */
  normalLen?: number;
}

/** Viewer options */
export interface ViewerOptions {
  /** Use OrbitControls or TrackballControls (default: "orbit") */
  control?: ControlType;
  /** Show X-, Y-, Z-axes (default: false) */
  axes?: boolean;
  /** Show axes at [0,0,0] or at object center (default: false) */
  axes0?: boolean;
  /** Initial grid setting [xy, xz, yz] (default: [false, false, false]) */
  grid?: [boolean, boolean, boolean];
  /** Use orthographic (true) or perspective camera (default: true) */
  ortho?: boolean;
  /** Show CAD object transparent (default: false) */
  transparent?: boolean;
  /** Show edges in black instead of edgeColor (default: false) */
  blackEdges?: boolean;
  /** Collapse level (default: 0) */
  collapse?: number;
  /** Use intersection clipping (default: false) */
  clipIntersection?: boolean;
  /** Show clipping planes (default: false) */
  clipPlaneHelpers?: boolean;
  /** Use object colors for clipping (default: false) */
  clipObjectColors?: boolean;
  /** Normal direction for clipping plane 0 (default: [-1, 0, 0]) */
  clipNormal0?: Vector3Tuple;
  /** Normal direction for clipping plane 1 (default: [0, -1, 0]) */
  clipNormal1?: Vector3Tuple;
  /** Normal direction for clipping plane 2 (default: [0, 0, -1]) */
  clipNormal2?: Vector3Tuple;
  /** Clip slider 0 value (default: -1) */
  clipSlider0?: number;
  /** Clip slider 1 value (default: -1) */
  clipSlider1?: number;
  /** Clip slider 2 value (default: -1) */
  clipSlider2?: number;
  /** Holroyd mode for controls (default: true) */
  holroyd?: boolean;
  /** Up direction (default: "Z") */
  up?: UpDirection;
  /** Hint for the number of grid ticks (default: 10) */
  ticks?: number;
  /** Grid font size (default: 10) */
  gridFontSize?: number;
  /** Center grid on object (default: false) */
  centerGrid?: boolean;
  /** Camera position as 3-dim array */
  position?: Vector3Tuple | null;
  /** Camera rotation as 4-dim quaternion [x,y,z,w] */
  quaternion?: QuaternionTuple | null;
  /** Camera target */
  target?: Vector3Tuple | null;
  /** Camera zoom value (default: 1) */
  zoom?: number;
  /** Pan speed (default: 1.0) */
  panSpeed?: number;
  /** Rotation speed (default: 1.0) */
  rotateSpeed?: number;
  /** Zoom speed (default: 1.0) */
  zoomSpeed?: number;
  /** Show timings in browser console (default: false) */
  timeit?: boolean;
}

/** Zebra tool options */
export interface ZebraOptions {
  /** Zebra stripe count (default: 9) */
  zebraCount?: number;
  /** Zebra opacity (default: 1.0) */
  zebraOpacity?: number;
  /** Zebra direction (default: 0) */
  zebraDirection?: number;
  /** Zebra color scheme (default: "blackwhite") */
  zebraColorScheme?: ZebraColorScheme;
  /** Zebra mapping mode (default: "reflection") */
  zebraMappingMode?: ZebraMappingMode;
}

/** Combined options for initialization */
export type CombinedOptions = DisplayOptions & RenderOptions & ViewerOptions & ZebraOptions;

// =============================================================================
// Viewer State Shape
// =============================================================================

/** Complete state shape with all properties */
export interface ViewerStateShape {
  // Display
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

  // Render
  ambientIntensity: number;
  directIntensity: number;
  metalness: number;
  roughness: number;
  defaultOpacity: number;
  edgeColor: number;
  normalLen: number;

  // Viewer
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

  // Zebra
  zebraCount: number;
  zebraOpacity: number;
  zebraDirection: number;
  zebraColorScheme: ZebraColorScheme;
  zebraMappingMode: ZebraMappingMode;

  // Runtime
  activeTool: string | null;
  animationMode: AnimationMode;
  animationSliderValue: number;
  zscaleActive: boolean;
  highlightedButton: string | null;
  activeTab: ActiveTab;
}

/** Keys of ViewerStateShape */
export type StateKey = keyof ViewerStateShape;

// =============================================================================
// Shape & Texture Types
// =============================================================================

/** Encoded texture */
export interface Texture {
  height: number;
  width: number;
  image: {
    data: string;
    format: "png";
  };
}

/**
 * A tessellated 3D shape.
 *
 * Data can come in different formats depending on serialization:
 * - Arrays from JSON: number[] or number[][]
 * - TypedArrays from binary: Float32Array, Uint32Array, Uint8Array
 */
export interface Shape {
  /** Flattened list of 3-dim vertices defining the triangles */
  vertices: number[] | Float32Array;
  /** Vertex normals - flat array, nested number[][], or Float32Array */
  normals: number[] | number[][] | Float32Array;
  /** Triangle indices - flat Uint32Array with triangles_per_face, or nested number[][] */
  triangles: number[] | number[][] | Uint32Array;
  /** Edge segments - flat Float32Array with segments_per_edge, or nested number[][] */
  edges: number[] | number[][] | Float32Array;
  /** Flattened list of 3-dim vertices of the CAD object */
  obj_vertices: number[] | Float32Array;
  /** OCP types of the edges */
  edge_types: number[] | Uint8Array | Uint32Array;
  /** OCP types of the faces */
  face_types: number[] | Uint32Array;
  /** Number of triangles per face (when triangles is flat) */
  triangles_per_face?: number[] | Uint32Array;
  /** Number of segments per edge (when edges is flat) */
  segments_per_edge?: number[] | Uint32Array;
}

/**
 * Shape with flat binary format (TypedArrays with per-face/per-edge counts).
 */
export interface ShapeBinary {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  edges: Float32Array;
  obj_vertices: Float32Array;
  edge_types: Uint8Array;
  face_types: Uint32Array;
  triangles_per_face: Uint32Array;
  segments_per_edge: Uint32Array;
}

/**
 * Shape with nested array format (JSON-serialized).
 */
export interface ShapeNested {
  vertices: number[];
  normals: number[];
  triangles: number[][];
  edges: number[][];
  obj_vertices: number[];
  edge_types: number[];
  face_types: number[];
}

/**
 * Check if shape uses binary format (has triangles_per_face).
 */
export function isShapeBinaryFormat(shape: Shape): shape is Shape & { triangles_per_face: Uint32Array | number[] } {
  return shape.triangles_per_face !== undefined;
}

/**
 * Check if triangles are in flat format (Uint32Array or number[] with triangles_per_face).
 */
export function hasTrianglesPerFace(shape: Shape): shape is Shape & {
  triangles_per_face: Uint32Array | number[];
  triangles: Uint32Array | number[];
  face_types: Uint32Array | number[];
} {
  return shape.triangles_per_face !== undefined;
}

/**
 * Check if edges are in flat format (Float32Array or number[] with segments_per_edge).
 */
export function hasSegmentsPerEdge(shape: Shape): shape is Shape & {
  segments_per_edge: Uint32Array | number[];
  edges: Float32Array | number[];
  edge_types: Uint8Array | Uint32Array | number[];
} {
  return shape.segments_per_edge !== undefined;
}

/** Location tuple: position and quaternion */
export type Location = [Vector3Tuple, QuaternionTuple];

/** Visibility state value: 0=unselected, 1=selected, 2=mixed, 3=disabled */
export type VisibilityValue = 0 | 1 | 2 | 3;

/** Visibility state: [faces, edges] where 1=shown, 0=hidden, 3=n/a */
export type VisibilityState = [VisibilityValue, VisibilityValue];

/** Hierarchical/grouped objects of type Shape */
export interface Shapes {
  /** Protocol version */
  version: number;
  /** Group name */
  name: string;
  /** ID of the group (slash-separated path) */
  id: string;
  /** Location: [position, quaternion] */
  loc?: Location;
  /** Children of the group */
  parts?: Shapes[];
  /** Shape object (null if parts != null) */
  shape?: Shape | null;
  /** Visibility state [faces, edges] */
  state?: VisibilityState;
  /** Object type */
  type?: ShapeType;
  /** Object subtype (only for type "shapes") */
  subtype?: ShapeSubtype;
  /** RGB object color in CSS format or array of colors for multi-colored edges */
  color?: string | string[];
  /** Object alpha transparency (0-1) */
  alpha?: number;
  /** Whether to render the back of the face */
  renderback?: boolean;
  /** Encoded texture */
  texture?: Texture | null;
  /** Bounding box */
  bb?: BoundingBoxFlat | null;
  /** Accuracy */
  accuracy?: number | null;
  /** Normal length */
  normal_len?: number;
  /** Format identifier (e.g., "GDS" for GDSII format) */
  format?: string;
  /** Instances data for GDS format */
  instances?: Record<string, number[]>;
  /** Geometry type (added during decomposition) */
  geomtype?: number;
  /** Whether the shape is from an exploded view (added during decomposition) */
  exploded?: boolean;
  /** Edge width in pixels (added during decomposition for edge shapes) */
  width?: number;
  /** Vertex size in pixels (added during decomposition for vertex shapes) */
  size?: number;
}

// =============================================================================
// DOM Event Types
// =============================================================================

/** Callback for DOM events */
export type DomEventCallback = (event: Event) => void;

// =============================================================================
// THREE.js Material Types
// =============================================================================

/**
 * Material with color property - used for highlighting and theme changes.
 * Matches MeshBasicMaterial, MeshStandardMaterial, LineBasicMaterial, etc.
 */
export interface ColoredMaterial extends THREE.Material {
  color: THREE.Color;
}

// =============================================================================
// Subscription Options
// =============================================================================

/** Options for state subscriptions */
export interface SubscribeOptions {
  /** If true, immediately invoke listener with current value */
  immediate?: boolean;
}
