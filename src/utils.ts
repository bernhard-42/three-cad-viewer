import * as THREE from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";

type CloneableValue = unknown;
type CloneableObject = { [key: string]: CloneableValue };

function clone<T extends CloneableValue>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((el) => clone(el)) as T;
  } else if (obj !== null && typeof obj === "object") {
    const result: CloneableObject = {};
    for (const [k, v] of Object.entries(obj as CloneableObject)) {
      result[k] = clone(v);
    }
    return result as T;
  } else {
    return obj;
  }
}

function flatten(arr: number | number[] | number[][], depth: number = 1): number | number[] {
  return Array.isArray(arr) ? (arr.flat(depth) as number[]) : arr;
}

function isEqual(obj1: unknown, obj2: unknown, tol: number = 1e-9): boolean {
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    return (
      obj1.length === obj2.length && obj1.every((v, i) => isEqual(v, obj2[i], tol))
    );
  } else if (obj1 !== null && obj2 !== null && typeof obj1 === "object" && typeof obj2 === "object") {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (
      keys1.length === keys2.length &&
      keys1.every((key) => Object.prototype.hasOwnProperty.call(obj2, key))
    ) {
      return keys1.every((key) => isEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key], tol));
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

interface SceneObject {
  children?: SceneObject[];
  [key: string]: unknown;
}

function sceneTraverse(obj: SceneObject | null | undefined, fn: (obj: SceneObject) => void): void {
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
      (attr as { dispose?: () => void })?.dispose?.();
    }
  }
}

interface TextureLike {
  dispose: () => void;
}

interface MaterialLike {
  dispose: () => void;
  map?: TextureLike | null;
  normalMap?: TextureLike | null;
  roughnessMap?: TextureLike | null;
  metalnessMap?: TextureLike | null;
  aoMap?: TextureLike | null;
  emissiveMap?: TextureLike | null;
  alphaMap?: TextureLike | null;
  bumpMap?: TextureLike | null;
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
    if (texture && typeof texture === "object" && "dispose" in texture) {
      (texture as TextureLike).dispose();
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

interface DisposableTree {
  children?: DisposableTree[];
  dispose?: () => void;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  geometry?: GeometryLike | null;
  material?: MaterialLike | MaterialLike[] | null;
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
    disposeMesh(tree as MeshLike);
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

interface KeyMappingConfig {
  shift: string;
  ctrl: string;
  meta: string;
  alt?: string;
}

// KeyEventLike matches MouseEvent, PointerEvent, KeyboardEvent etc.
type KeyEventLike = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

class _KeyMapper {
  private keyMapping: { [key: string]: string };

  constructor() {
    this.keyMapping = {
      shift: "ctrlKey",
      ctrl: "shiftKey",
      meta: "altKey",
      alt: "metaKey",
    };
  }

  getshortcuts = (key: string): string => {
    return this.keyMapping[key].replace("Key", "");
  };

  get_config(): { [key: string]: string } {
    return Object.assign({}, this.keyMapping);
  }

  get = (event: KeyEventLike, key: string): boolean => {
    const prop = this.keyMapping[key] as keyof KeyEventLike;
    return event[prop];
  };

  set = (config: Partial<KeyMappingConfig>): void => {
    for (const key in config) {
      this.keyMapping[key] = config[key as keyof KeyMappingConfig] as string;
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
  return (obj as THREE.Mesh).isMesh === true;
}

/**
 * Type guard to check if an Object3D is a Line.
 */
function isLine(obj: THREE.Object3D): obj is THREE.Line {
  return (obj as THREE.Line).isLine === true;
}

/**
 * Type guard to check if an Object3D is a Points.
 */
function isPoints(obj: THREE.Object3D): obj is THREE.Points {
  return (obj as THREE.Points).isPoints === true;
}

/**
 * Type guard to check if a camera is an OrthographicCamera.
 */
function isOrthographicCamera(camera: THREE.Camera): camera is THREE.OrthographicCamera {
  return (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
}

/**
 * Type guard to check if a camera is a PerspectiveCamera.
 */
function isPerspectiveCamera(camera: THREE.Camera): camera is THREE.PerspectiveCamera {
  return (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
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
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
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
  clone,
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
};
