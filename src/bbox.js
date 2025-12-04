import * as THREE from "three";

/**
 * Symbol used to identify ObjectGroup instances without instanceof checks.
 * Avoids circular dependency issues with objectgroup.js.
 * @type {symbol}
 */
const OBJECT_GROUP_MARKER = Symbol.for("tcv.ObjectGroup");

/**
 * Extended THREE.Box3 for CAD-specific bounding box calculations.
 * Handles ObjectGroup instances and excludes clipping plane meshes.
 */
class BoundingBox extends THREE.Box3 {
  /**
   * Expand the bounding box to include an object.
   * For ObjectGroup instances, only the first mesh (faces) is considered.
   * Clipping plane meshes (PlaneMeshes/StencilPlane) are excluded.
   * @param {THREE.Object3D} object - The object to include in the bounding box.
   * @param {boolean} [precise=false] - Whether to use precise vertex-level calculation.
   * @returns {BoundingBox} This bounding box for chaining.
   */
  expandByObject(object, precise = false) {
    object.updateWorldMatrix(false, false);

    // Use symbol marker for ObjectGroup detection (avoids circular dependencies)
    if (object[OBJECT_GROUP_MARKER]) {
      // for ObjectGroups calculate bounding box of first Mesh only
      this.expandByObject(object.children[0], precise);
      return this;
    }
    const geometry = object.geometry;
    if (geometry !== undefined) {
      if (
        precise &&
        geometry.attributes != undefined &&
        geometry.attributes.position !== undefined
      ) {
        if (object.type.startsWith("LineSegment")) {
          var g = geometry.clone();
          g.applyMatrix4(object.matrixWorld);
          g.boundingBox = null;
          g.computeBoundingBox();
          this.union(g.boundingBox);
          g.dispose(); // Dispose cloned geometry to prevent memory leak
        } else {
          const position = geometry.attributes.position;
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
        _bbox.copy(geometry.boundingBox);
        _bbox.applyMatrix4(object.matrixWorld);

        this.union(_bbox);
      }
    }
    const children = object.children;

    for (let i = 0, l = children.length; i < l; i++) {
      if (
        !(
          children[i].name == "PlaneMeshes" &&
          children[i].children &&
          children[i].children.length > 0 &&
          children[i].children[0].type.startsWith("StencilPlane")
        )
      ) {
        this.expandByObject(children[i], precise);
      }
    }

    return this;
  }

  /**
   * Calculate the maximum distance from the origin to any corner of the box.
   * @returns {number} The maximum absolute coordinate value.
   */
  max_dist_from_center() {
    return Math.max(
      ...this.min
        .toArray()
        .concat(this.max.toArray())
        .map((x) => Math.abs(x)),
    );
  }

  /**
   * Get the bounding sphere of this box.
   * @returns {THREE.Sphere} The bounding sphere.
   */
  boundingSphere() {
    this.getBoundingSphere(_sphere);
    return _sphere;
  }

  /**
   * Get the center point of this box as an array.
   * @returns {number[]} The center coordinates [x, y, z].
   */
  center() {
    this.getCenter(_vector3);
    return _vector3.toArray();
  }
}

/**
 * Visual helper for displaying a bounding box as wireframe lines.
 * Extends THREE.LineSegments to render the 12 edges of a box.
 */
class BoxHelper extends THREE.LineSegments {
  /**
   * Create a BoxHelper for visualizing an object's bounding box.
   * @param {THREE.Object3D} object - The object to visualize bounds for.
   * @param {number} [color=0xffff00] - Line color as hex value.
   */
  constructor(object, color = 0xffff00) {
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
    this.type = "BoxHelper";

    this.matrixAutoUpdate = false;

    this.update();
  }

  /**
   * Update the helper geometry to match the current bounding box.
   * Should be called when the target object changes.
   */
  update() {
    if (this.object !== undefined) {
      _hbox.setFromObject(this.object, true);
    }

    if (_hbox.isEmpty()) return;

    const min = _hbox.min;
    const max = _hbox.max;

    const position = this.geometry.attributes.position;
    const array = position.array;

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
   * @param {THREE.Object3D} object - The new object to track.
   * @returns {BoxHelper} This helper for chaining.
   */
  setFromObject(object) {
    this.object = object;
    this.update();

    return this;
  }
}

const _vector3 = new THREE.Vector3();
const _bbox = new BoundingBox();
const _hbox = new BoundingBox();
const _sphere = new THREE.Sphere();

export { BoundingBox, BoxHelper };
