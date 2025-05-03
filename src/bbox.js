import * as THREE from "three";
import { disposeGeometry } from "./utils";
class BoundingBox extends THREE.Box3 {
  expandByObject(object, precise = false) {
    // Computes the world-axis-aligned bounding box of an object (including its children),
    // accounting for both the object's, and children's, world transforms

    object.updateWorldMatrix(false, false);

    const geometry = object.geometry;
    if (geometry !== undefined) {
      const positionAttribute = geometry.getAttribute("position");

      // precise AABB computation based on vertex data requires at least a position attribute.
      // instancing isn't supported so far and uses the normal (conservative) code path.

      if (
        precise === true &&
        positionAttribute !== undefined &&
        object.isInstancedMesh !== true
      ) {
        for (let i = 0, l = positionAttribute.count; i < l; i++) {
          if (object.isMesh === true) {
            object.getVertexPosition(i, _vector3);
          } else {
            _vector3.fromBufferAttribute(positionAttribute, i);
          }

          _vector3.applyMatrix4(object.matrixWorld);
          this.expandByPoint(_vector3);
        }
      } else {
        if (object.boundingBox !== undefined) {
          // object-level bounding box

          if (object.boundingBox === null) {
            object.computeBoundingBox();
          }

          _bbox.copy(object.boundingBox);
        } else {
          // geometry-level bounding box

          if (geometry.boundingBox === null) {
            geometry.computeBoundingBox();
          }

          _bbox.copy(geometry.boundingBox);
        }

        _bbox.applyMatrix4(object.matrixWorld);

        this.union(_bbox);
      }
    }

    const children = object.children;

    for (let i = 0, l = children.length; i < l; i++) {
      if (children[i].name !== "PlaneMeshes") {
        this.expandByObject(children[i], precise);
        if (children[i].isMesh) {
          // Only use the first Mesh which is front
          break;
        }
      }
    }

    return this;
  }

  max_dist_from_center() {
    return Math.max(
      ...this.min
        .toArray()
        .concat(this.max.toArray())
        .map((x) => Math.abs(x)),
    );
  }

  boundingSphere() {
    this.getBoundingSphere(_sphere);
    return _sphere;
  }

  center() {
    this.getCenter(_vector3);
    return _vector3.toArray();
  }
}

class BoxHelper extends THREE.LineSegments {
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

  setFromObject(object) {
    this.object = object;
    this.update();

    return this;
  }

  dispose() {
    disposeGeometry(this.geometry);
    this.geometry = null;
  }
}

const _vector3 = new THREE.Vector3();
const _bbox = new BoundingBox();
const _hbox = new BoundingBox();
const _sphere = new THREE.Sphere();

export { BoundingBox, BoxHelper };
