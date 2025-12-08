import * as THREE from "three";
import type { Vector3Tuple, QuaternionTuple } from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import type { Axis } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** Unit vectors for each axis */
export const AXIS_VECTORS: Readonly<Record<Axis, THREE.Vector3>> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Flatten a nested array of numbers to a 1D array.
 * The cast is necessary because TypeScript's flat() return type
 * is a complex union that doesn't simplify to number[].
 */
function flatten(arr: number[][] | number[][][] | number[][][][], depth: number = 1): number[] {
  return arr.flat(depth) as number[];
}

/**
 * Convert an array to Vector3Tuple with validation.
 * Throws if the input is not a 3-element array.
 */
function toVector3Tuple(arr: number[]): Vector3Tuple {
  if (!Array.isArray(arr) || arr.length !== 3) {
    throw new Error(`Expected array of length 3, got ${Array.isArray(arr) ? arr.length : typeof arr}`);
  }
  return arr as Vector3Tuple;
}

/**
 * Convert an array to QuaternionTuple with validation.
 * Throws if the input is not a 4-element array.
 */
function toQuaternionTuple(arr: number[]): QuaternionTuple {
  if (!Array.isArray(arr) || arr.length !== 4) {
    throw new Error(`Expected array of length 4, got ${Array.isArray(arr) ? arr.length : typeof arr}`);
  }
  return arr as QuaternionTuple;
}

function isEqual(obj1: unknown, obj2: unknown, tol: number = 1e-9): boolean {
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    return (
      obj1.length === obj2.length && obj1.every((v, i) => isEqual(v, obj2[i], tol))
    );
  } else if (obj1 !== null && obj2 !== null && typeof obj1 === "object" && typeof obj2 === "object") {
    const rec1 = obj1 as Record<string, unknown>;
    const rec2 = obj2 as Record<string, unknown>;
    const keys1 = Object.keys(rec1);
    const keys2 = Object.keys(rec2);

    if (
      keys1.length === keys2.length &&
      keys1.every((key) => Object.prototype.hasOwnProperty.call(rec2, key))
    ) {
      return keys1.every((key) => isEqual(rec1[key], rec2[key], tol));
    } else {
      return false;
    }
  } else {
    if (typeof obj1 === "number" && typeof obj2 === "number") {
      return Math.abs(obj1 - obj2) < tol;
    }
    return obj1 === obj2;
  }
}

function sceneTraverse(obj: THREE.Object3D | null | undefined, fn: (obj: THREE.Object3D) => void): void {
  if (!obj) return;

  fn(obj);

  if (obj.children && obj.children.length > 0) {
    obj.children.forEach((o) => {
      sceneTraverse(o, fn);
    });
  }
}

interface GeometryLike {
  dispose: () => void;
  attributes: Record<string, unknown>;
}

function disposeGeometry(geometry: GeometryLike | null | undefined): void {
  if (geometry) {
    geometry.dispose();
    for (const attr of Object.values(geometry.attributes)) {
      if (attr && typeof attr === "object" && "dispose" in attr && typeof attr.dispose === "function") {
        attr.dispose();
      }
    }
  }
}

interface Disposable {
  dispose: () => void;
}

function isDisposable(value: unknown): value is Disposable {
  return value !== null && typeof value === "object" && "dispose" in value && typeof (value as Disposable).dispose === "function";
}

interface MaterialLike {
  dispose: () => void;
  map?: Disposable | null;
  normalMap?: Disposable | null;
  roughnessMap?: Disposable | null;
  metalnessMap?: Disposable | null;
  aoMap?: Disposable | null;
  emissiveMap?: Disposable | null;
  alphaMap?: Disposable | null;
  bumpMap?: Disposable | null;
  [key: string]: unknown;
}

/**
 * Dispose a material and its associated textures.
 */
function disposeMaterial(material: MaterialLike | null | undefined): void {
  if (!material) return;

  // Dispose all texture properties
  const textureProps: (keyof MaterialLike)[] = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
    "bumpMap",
  ];
  for (const prop of textureProps) {
    const texture = material[prop];
    if (isDisposable(texture)) {
      texture.dispose();
    }
  }

  material.dispose();
}

interface MeshLike {
  geometry?: GeometryLike | null;
  material?: MaterialLike | MaterialLike[] | null;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
}

function disposeMesh(mesh: MeshLike): void {
  if (mesh.geometry) {
    disposeGeometry(mesh.geometry);
  }

  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
    } else {
      disposeMaterial(mesh.material);
    }
  }
}

interface DisposableTree extends MeshLike {
  children?: DisposableTree[];
  dispose?: () => void;
}

function deepDispose(tree: DisposableTree | DisposableTree[] | null | undefined): void {
  if (!tree) {
    return;
  }
  if (Array.isArray(tree)) {
    tree.forEach(deepDispose);
    return;
  }
  if (Array.isArray(tree.children)) {
    tree.children.forEach(deepDispose);
  }
  if (tree.dispose) {
    tree.dispose();
  } else if (tree.isMesh || tree.isLine || tree.isPoints) {
    disposeMesh(tree);
  }
}

function format(v: number, b: number = 2, a: number = 2): string {
  const s = Math.abs(v).toFixed(a);
  let padding = "";
  const int = s.split(".")[0];
  for (let i = int.length; i < b; i++) padding += " ";
  padding += v < 0 ? "-" : " ";
  return padding + s;
}

function prettyPrintVector(v: number[], a: number, b: number): string {
  return `${format(v[0], a, b)}, ${format(v[1], a, b)}, ${format(v[2], a, b)}`;
}

// KeyEventLike matches MouseEvent, PointerEvent, KeyboardEvent etc.
type KeyEventLike = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

type KeyEventKey = keyof KeyEventLike;
type MappedKey = "shift" | "ctrl" | "meta" | "alt";

interface KeyMappingConfig {
  shift: KeyEventKey;
  ctrl: KeyEventKey;
  meta: KeyEventKey;
  alt: KeyEventKey;
}

class _KeyMapper {
  private keyMapping: Record<MappedKey, KeyEventKey>;

  constructor() {
    this.keyMapping = {
      shift: "ctrlKey",
      ctrl: "shiftKey",
      meta: "altKey",
      alt: "metaKey",
    };
  }

  getshortcuts = (key: MappedKey): string => {
    return this.keyMapping[key].replace("Key", "");
  };

  get_config(): Record<MappedKey, KeyEventKey> {
    return Object.assign({}, this.keyMapping);
  }

  get = (event: KeyEventLike, key: MappedKey): boolean => {
    const prop = this.keyMapping[key];
    return event[prop];
  };

  set = (config: Partial<KeyMappingConfig>): void => {
    for (const key of Object.keys(config) as MappedKey[]) {
      const value = config[key];
      if (value !== undefined) {
        this.keyMapping[key] = value;
      }
    }
  };
}

// see https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
function scaleLight(intensity: number): number {
  return Math.round(Math.PI * intensity);
}

// =============================================================================
// THREE.js Type Guards
// =============================================================================

/**
 * Type guard to check if an Object3D is a Mesh.
 */
function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return "isMesh" in obj && obj.isMesh === true;
}

/**
 * Type guard to check if an Object3D is a Line.
 */
function isLine(obj: THREE.Object3D): obj is THREE.Line {
  return "isLine" in obj && obj.isLine === true;
}

/**
 * Type guard to check if an Object3D is a Points.
 */
function isPoints(obj: THREE.Object3D): obj is THREE.Points {
  return "isPoints" in obj && obj.isPoints === true;
}

/**
 * Type guard to check if an object is an OrthographicCamera.
 * Accepts Object3D to allow use in controls where camera type is broader.
 */
function isOrthographicCamera(obj: THREE.Object3D): obj is THREE.OrthographicCamera {
  return "isOrthographicCamera" in obj && (obj as THREE.OrthographicCamera).isOrthographicCamera === true;
}

/**
 * Type guard to check if an object is a PerspectiveCamera.
 * Accepts Object3D to allow use in controls where camera type is broader.
 */
function isPerspectiveCamera(obj: THREE.Object3D): obj is THREE.PerspectiveCamera {
  return "isPerspectiveCamera" in obj && (obj as THREE.PerspectiveCamera).isPerspectiveCamera === true;
}

/**
 * Type guard to check if an Object3D is a LineSegments2 (fat line).
 */
function isLineSegments2(obj: THREE.Object3D): obj is LineSegments2 {
  return obj.type === "LineSegments2";
}

/**
 * Type guard to check if a material has a color property.
 */
function hasColor(material: THREE.Material): material is THREE.Material & { color: THREE.Color } {
  return "color" in material;
}

/**
 * Type guard to check if a material has emissive property.
 */
function hasEmissive(material: THREE.Material): material is THREE.Material & { emissive: THREE.Color } {
  return "emissive" in material;
}

/**
 * Type guard to check if a material is a MeshStandardMaterial.
 */
function isMeshStandardMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return "isMeshStandardMaterial" in material && material.isMeshStandardMaterial === true;
}

const KeyMapper = new _KeyMapper();

interface EventListenerEntry {
  target: EventTarget;
  event: string;
  handler: EventListenerOrEventListenerObject;
  options: boolean | AddEventListenerOptions;
}

class EventListenerManager {
  private listeners: EventListenerEntry[];

  constructor() {
    this.listeners = [];
  }

  add = (
    target: EventTarget,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options: boolean | AddEventListenerOptions = false
  ): void => {
    target.addEventListener(event, handler, options);
    this.listeners.push({
      target: target,
      event: event,
      handler: handler,
      options: options,
    });
  };

  dispose(): void {
    this.listeners.forEach(({ target, event, handler, options }) => {
      target.removeEventListener(event, handler, options);
    });
    this.listeners = [];
  }
}

export {
  flatten,
  isEqual,
  sceneTraverse,
  prettyPrintVector,
  KeyMapper,
  scaleLight,
  deepDispose,
  disposeGeometry,
  EventListenerManager,
  // Type guards
  isMesh,
  isLine,
  isPoints,
  isOrthographicCamera,
  isPerspectiveCamera,
  isLineSegments2,
  hasColor,
  hasEmissive,
  isMeshStandardMaterial,
  toVector3Tuple,
  toQuaternionTuple,
};

export type {
  KeyEventKey,
  KeyMappingConfig,
};
