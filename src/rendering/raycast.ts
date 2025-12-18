import * as THREE from "three";
import { KeyMapper, isMesh, isPoints, isLine } from "../utils/utils.js";
import { isObjectGroup, type ObjectGroup } from "../scene/objectgroup.js";
import type { Camera } from "../camera/camera.js";

/**
 * Filter types for topology-based raycasting.
 */
export const TopoFilter: {
  none: null;
  vertex: "vertex";
  edge: "edge";
  face: "face";
  solid: "solid";
} = {
  none: null,
  vertex: "vertex",
  edge: "edge",
  face: "face",
  solid: "solid",
};

export type TopoFilterType = typeof TopoFilter[keyof typeof TopoFilter];

interface RaycastFilters {
  topoFilter: TopoFilterType[];
}

interface RaycastCallback {
  (event: { mouse?: "left" | "right"; shift?: boolean; key?: string }): void;
}

/**
 * Represents a picked object from raycasting.
 * Can represent either a single shape or all faces of a solid.
 */
export class PickedObject {
  obj: ObjectGroup;
  fromSolid: boolean;

  /**
   * Create a PickedObject.
   * @param objectGroup - The picked ObjectGroup.
   * @param fromSolid - Whether this pick is from a solid selection.
   */
  constructor(objectGroup: ObjectGroup, fromSolid: boolean) {
    this.obj = objectGroup;
    this.fromSolid = fromSolid;
  }

  /**
   * Returns all the faces ObjectGroups that define the solid from the picked object.
   */
  private _getSolidObjectGroups(solidSubObject: ObjectGroup): ObjectGroup[] {
    const solidGroup = solidSubObject.parent!.parent!;
    let facesGroup: THREE.Object3D | undefined;
    for (let i = 0; i < solidGroup.children.length; i++) {
      const child = solidGroup.children[i];
      if (child.name === solidGroup.name + "|faces") {
        facesGroup = child;
        break;
      }
    }

    return (facesGroup?.children || []).filter(isObjectGroup);
  }

  /**
   * If the picked object is part of a solid, returns all the faces ObjectGroups that define the solid.
   * Otherwise, returns the picked object.
   */
  objs(): ObjectGroup[] {
    if (this.fromSolid) {
      return this._getSolidObjectGroups(this.obj);
    } else {
      return [this.obj];
    }
  }
}

/**
 * Handles mouse-based raycasting for object selection in the 3D scene.
 * Supports topology filtering and provides click/keyboard callbacks.
 */
class Raycaster {
  camera: Camera | null;
  group: THREE.Object3D | null;
  domElement: HTMLElement | null;
  width: number;
  height: number;
  threshold: number;
  callback: RaycastCallback;
  raycaster: THREE.Raycaster;
  raycastMode: boolean;
  lastPosition: THREE.Vector3 | null;
  mouse: THREE.Vector2;
  mouseMoved: boolean;
  filters: RaycastFilters;

  /**
   * Create a Raycaster for object picking.
   * @param camera - The camera used for ray projection.
   * @param domElement - The DOM element to listen for events.
   * @param width - Viewport width in pixels.
   * @param height - Viewport height in pixels.
   * @param threshold - Point picking threshold in world units.
   * @param group - The scene group to raycast against.
   * @param callback - Callback for pick events.
   */
  constructor(
    camera: Camera,
    domElement: HTMLElement,
    width: number,
    height: number,
    threshold: number,
    group: THREE.Object3D,
    callback: RaycastCallback
  ) {
    this.camera = camera;
    this.group = group;
    this.domElement = domElement;
    this.width = width;
    this.height = height;
    this.threshold = threshold;
    this.callback = callback;

    this.raycaster = new THREE.Raycaster();
    this.raycastMode = false;

    this.lastPosition = null;

    this.mouse = new THREE.Vector2();
    this.mouseMoved = false;
    this.filters = {
      topoFilter: [TopoFilter.none],
    };
  }

  /**
   * Dispose of event listeners and clean up resources.
   */
  dispose(): void {
    if (this.domElement) {
      this.domElement.removeEventListener("mousemove", this.onPointerMove);
      this.domElement.removeEventListener("mouseup", this.onMouseKeyUp);
      this.domElement.removeEventListener("mousedown", this.onMouseKeyDown);
    }
    // Keyboard listener is on document (canvas doesn't receive focus)
    document.removeEventListener("keydown", this.onKeyDown);
    this.raycastMode = false;
    this.group = null;
    this.domElement = null;
    this.camera = null;
  }

  /**
   * Initialize event listeners and enable raycast mode.
   */
  init(): void {
    if (!this.domElement) return;
    this.domElement.addEventListener("mousemove", this.onPointerMove);
    this.domElement.addEventListener("mouseup", this.onMouseKeyUp, false);
    this.domElement.addEventListener("mousedown", this.onMouseKeyDown, false);
    // Use document-level listener for keyboard (canvas doesn't receive focus)
    document.addEventListener("keydown", this.onKeyDown, false);
    this.raycastMode = true;
  }

  /**
   * Retrieve all the valid intersected objects by a ray caster from the mouse.
   */
  getIntersectedObjs(): THREE.Intersection[] {
    if (!this.camera || !this.group) return [];
    this.raycaster.setFromCamera(this.mouse, this.camera.getCamera());
    this.raycaster.params.Points!.threshold =
      this.threshold / this.camera.getZoom();
    this.raycaster.params.Line2 = { threshold: 4 };
    const objects = this.raycaster.intersectObjects([this.group], true);
    const validObjs: THREE.Intersection[] = [];
    for (const obj of objects) {
      const object = obj.object;
      // Accept Mesh (faces), Points (vertices), and Line (edges)
      const isValidType = isMesh(object) || isPoints(object) || isLine(object);
      if (isValidType && !Array.isArray(object.material) && object.material.visible) {
        validObjs.push(obj);
      }
    }
    return validObjs;
  }

  /**
   * Retrieve all the valid intersected objects by a ray caster from the mouse.
   * The objects are sorted by their distance from the ray. (The closest first)
   */
  getValidIntersectedObjs(): THREE.Intersection[] {
    const validObjs: THREE.Intersection[] = [];
    if (this.mouseMoved) {
      const objects = this.getIntersectedObjs();

      for (const object of objects) {
        const obj = object.object;
        // Accept Mesh (faces), Points (vertices), and Line (edges)
        const isValidType = isMesh(obj) || isPoints(obj) || isLine(obj);
        if (!isValidType) continue;
        if (Array.isArray(obj.material) || !obj.material.visible) continue;

        const objectGroup = object.object.parent;
        if (!isObjectGroup(objectGroup)) continue;

        if (!objectGroup.shapeInfo) continue; // clipping plane

        const topo = objectGroup.shapeInfo.topo;

        // Check if topology is acceptable given the topology filters
        const isSolid = objectGroup.subtype === "solid";
        const isSubShapeOfSolid =
          this.filters.topoFilter.includes(TopoFilter.solid) && isSolid;

        // topo is a string from shapeInfo, check if it matches any filter
        const topoMatchesFilter = this.filters.topoFilter.some(
          (filter) => filter === topo
        );
        const valid =
          isSubShapeOfSolid ||
          this.filters.topoFilter.includes(TopoFilter.none) ||
          topoMatchesFilter;

        if (valid) {
          validObjs.push(object);
        }
      }
    }
    return validObjs;
  }

  /**
   * Handle left mouse button down event
   */
  onMouseKeyDown = (e: MouseEvent): void => {
    if (this.raycastMode && this.camera) {
      if (e.button == THREE.MOUSE.LEFT || e.button == THREE.MOUSE.RIGHT) {
        this.lastPosition = this.camera.getPosition().clone();
      }
    }
  };

  /**
   * Handle left mouse button up event
   */
  onMouseKeyUp = (e: MouseEvent): void => {
    if (this.raycastMode && this.camera && this.lastPosition) {
      if (e.button == THREE.MOUSE.LEFT) {
        if (this.lastPosition.distanceTo(this.camera.getPosition()) < 1e-6) {
          this.callback({ mouse: "left", shift: KeyMapper.get(e, "shift") });
        }
      } else if (e.button == THREE.MOUSE.RIGHT) {
        if (this.lastPosition.distanceTo(this.camera.getPosition()) < 1e-6) {
          this.callback({ mouse: "right" });
        }
      }
    }
  };

  /**
   * Handle key down event
   */
  onKeyDown = (e: KeyboardEvent): void => {
    if (this.raycastMode) {
      if (e.key == "Backspace") {
        this.callback({ key: "Backspace" });
      } else if (e.key == "Escape") {
        this.callback({ key: "Escape" });
      }
    }
  };

  /**
   * Get the current mouse position
   */
  onPointerMove = (e: MouseEvent): void => {
    if (!this.domElement) return;
    const rect = this.domElement.getBoundingClientRect();
    const offsetX = rect.x + window.scrollX;
    const offsetY = rect.y + window.scrollY;
    this.mouse.x = ((e.pageX - offsetX) / this.width) * 2 - 1;
    this.mouse.y = -((e.pageY - offsetY) / this.height) * 2 + 1;
    this.mouseMoved = true;
  };
}

export { Raycaster };
