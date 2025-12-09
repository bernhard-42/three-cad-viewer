/**
 * three-cad-viewer - A CAD viewer built on Three.js
 *
 * This is the main entry point for the library.
 * It exports the core classes and all public TypeScript types.
 */

// CSS imports
import "../css/global.css";
import "../css/ui.css";
import "../css/treeview.css";
import "../css/tools.css";

// =============================================================================
// Core Classes
// =============================================================================

import { Viewer } from "./viewer.js";
import { Display } from "./display.js";
import { Timer } from "./timer.js";
import { version } from "./_version.js";

export { Viewer, Display, Timer, version };

// =============================================================================
// Type Exports
// =============================================================================

// Re-export Three.js tuple types used in our API
export type { Vector3Tuple, QuaternionTuple } from "three";

// Basic types
export type {
  ThemeInput,
  Theme,
  ControlType,
  UpDirection,
  AnimationMode,
  ActiveTab,
  ZebraColorScheme,
  ZebraMappingMode,
  ShapeType,
  ShapeSubtype,
  Axis,
  ClipIndex,
  ColorValue,
  RGBColor,
  AxisColors,
  AxisColorsFlatArray,
} from "./types.js";

// Type guards and constants
export { CLIP_INDICES, isClipIndex } from "./types.js";

// State change types
export type {
  StateChange,
  StateSubscriber,
  GlobalStateSubscriber,
} from "./types.js";

// Bounding box/sphere types
export type {
  BoundingBox,
  BoundingSphere,
  BoundingBoxFlat,
} from "./types.js";

// Pick info
export type { PickInfo } from "./types.js";

// Change notification types
export type {
  ChangeInfos,
  ChangeNotification,
  NotificationCallback,
} from "./types.js";

// Options types - these are the main configuration interfaces
export type {
  DisplayOptions,
  RenderOptions,
  ViewerOptions,
  ZebraOptions,
  CombinedOptions,
} from "./types.js";

// Viewer state shape
export type {
  ViewerStateShape,
  StateKey,
} from "./types.js";

// Shape and texture types - for working with CAD data
export type {
  Texture,
  Shape,
  ShapeBinary,
  ShapeNested,
  Location,
  VisibilityValue,
  VisibilityState,
  Shapes,
} from "./types.js";

// Shape type guards
export {
  isShapeBinaryFormat,
  hasTrianglesPerFace,
  hasSegmentsPerEdge,
} from "./types.js";

// DOM event callback
export type { DomEventCallback } from "./types.js";

// Material types
export type { ColoredMaterial } from "./types.js";

// Subscription options
export type { SubscribeOptions } from "./types.js";
