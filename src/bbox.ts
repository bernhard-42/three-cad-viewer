import * as THREE from "three";
import { disposeGeometry } from "./utils.js";

/**
 * Symbol used to identify ObjectGroup instances without instanceof checks.
 * Avoids circular dependency issues with objectgroup.js.
 */
const OBJECT_GROUP_MARKER = Symbol.for("tcv.ObjectGroup");

/**
 * Type predicate for objects marked as ObjectGroup.
 * Returns true only for ObjectGroup (marker === true), not CompoundGroup (marker === false).
 */
function hasObjectGroupMarker(obj: THREE.Object3D): boolean {
  return (obj as { [OBJECT_GROUP_MARKER]?: boolean })[OBJECT_GROUP_MARKER] === true;
}

/**
 * Extended THREE.Box3 for CAD-specific bounding box calculations.
 * Handles ObjectGroup instances and excludes clipping plane meshes.
 */
class BoundingBox extends THREE.Box3 {
  /**
   * Expand the bounding box to include an object.
   * For ObjectGroup instances, only the first mesh (faces) is considered.
   * Clipping plane meshes (PlaneMeshes/StencilPlane) are excluded.
   */
  expandByObject(object: THREE.Object3D, precise: boolean = false): this {
    object.updateWorldMatrix(false, false);

    // Use symbol marker for ObjectGroup detection (avoids circular dependencies)
    if (hasObjectGroupMarker(object)) {
      // for ObjectGroups calculate bounding box of first Mesh only
      this.expandByObject(object.children[0], precise);
      return this;
    }

    const geometry = (object as THREE.Mesh).geometry;
    if (geometry !== undefined) {
      if (
        precise &&
        geometry.attributes !== undefined &&
        geometry.attributes.position !== undefined
      ) {
        if (object.type.startsWith("LineSegment")) {
          const g = geometry.clone();
          g.applyMatrix4(object.matrixWorld);
          g.boundingBox = null;
          g.computeBoundingBox();
          this.union(g.boundingBox!);
          g.dispose(); // Dispose cloned geometry to prevent memory leak
        } else {
          const position = geometry.attributes.position as THREE.BufferAttribute;
          for (let i = 0, l = position.count; i < l; i++) {
            _vector3
              .fromBufferAttribute(position, i)
              .applyMatrix4(object.matrixWorld);
            this.expandByPoint(_vector3);
          }
        }
      } else {
        if (geometry.boundingBox === null) {
          geometry.computeBoundingBox();
        }
        _bbox.copy(geometry.boundingBox!);
        _bbox.applyMatrix4(object.matrixWorld);

        this.union(_bbox);
      }
    }

    const children = object.children;

    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (
        !(
          child.name === "PlaneMeshes" &&
          child.children &&
          child.children.length > 0 &&
          child.children[0].type.startsWith("StencilPlane")
        )
      ) {
        this.expandByObject(child, precise);
      }
    }

    return this;
  }

  /**
   * Calculate the maximum distance from the origin to any corner of the box.
   */
  max_dist_from_center(): number {
    return Math.max(
      ...this.min
        .toArray()
        .concat(this.max.toArray())
        .map((x) => Math.abs(x)),
    );
  }

  /**
   * Get the bounding sphere of this box.
   */
  boundingSphere(): THREE.Sphere {
    this.getBoundingSphere(_sphere);
    return _sphere;
  }

  /**
   * Get the center point of this box as an array.
   */
  center(): number[] {
    this.getCenter(_vector3);
    return _vector3.toArray();
  }
}

/**
 * Visual helper for displaying a bounding box as wireframe lines.
 * Extends THREE.LineSegments to render the 12 edges of a box.
 */
class BoxHelper extends THREE.LineSegments {
  object: THREE.Object3D | undefined;

  /**
   * Create a BoxHelper for visualizing an object's bounding box.
   */
  constructor(object: THREE.Object3D, color: number = 0xffff00) {
    const indices = new Uint16Array([
      0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7,
    ]);
    const positions = new Float32Array(8 * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    super(
      geometry,
      new THREE.LineBasicMaterial({ color: color, toneMapped: false }),
    );

    this.object = object;
    // Note: 'type' is readonly in THREE.js types but we need to set it
    (this as { type: string }).type = "BoxHelper";

    this.matrixAutoUpdate = false;

    this.update();
  }

  /**
   * Update the helper geometry to match the current bounding box.
   * Should be called when the target object changes.
   */
  update(): void {
    if (this.object !== undefined) {
      _hbox.setFromObject(this.object, true);
    }

    if (_hbox.isEmpty()) return;

    const min = _hbox.min;
    const max = _hbox.max;

    const position = this.geometry.attributes.position as THREE.BufferAttribute;
    const array = position.array as Float32Array;

    array[0] = max.x;
    array[1] = max.y;
    array[2] = max.z;
    array[3] = min.x;
    array[4] = max.y;
    array[5] = max.z;
    array[6] = min.x;
    array[7] = min.y;
    array[8] = max.z;
    array[9] = max.x;
    array[10] = min.y;
    array[11] = max.z;
    array[12] = max.x;
    array[13] = max.y;
    array[14] = min.z;
    array[15] = min.x;
    array[16] = max.y;
    array[17] = min.z;
    array[18] = min.x;
    array[19] = min.y;
    array[20] = min.z;
    array[21] = max.x;
    array[22] = min.y;
    array[23] = min.z;

    position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  /**
   * Set the target object and update the helper.
   */
  setFromObject(object: THREE.Object3D): this {
    this.object = object;
    this.update();

    return this;
  }

  /**
   * Dispose of geometry and material resources.
   */
  dispose(): void {
    disposeGeometry(this);
  }
}

const _vector3 = new THREE.Vector3();
const _bbox = new BoundingBox();
const _hbox = new BoundingBox();
const _sphere = new THREE.Sphere();

export { BoundingBox, BoxHelper, OBJECT_GROUP_MARKER };
