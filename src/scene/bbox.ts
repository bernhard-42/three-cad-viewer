import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { disposeGeometry, toVector3Tuple } from "../utils/utils.js";
import { isObjectGroup } from "./objectgroup.js";

/**
 * Get the geometry from an Object3D if it has one (Mesh, Line, Points).
 * @returns The BufferGeometry if present, null otherwise.
 */
function getGeometry(object: THREE.Object3D): THREE.BufferGeometry | null {
  if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) {
    return object.geometry;
  }
  return null;
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

    if (isObjectGroup(object)) {
      // for ObjectGroups calculate bounding box of first Mesh only
      this.expandByObject(object.children[0], precise);
      return this;
    }

    const geometry = getGeometry(object);
    if (geometry !== null) {
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
  center(): Vector3Tuple {
    this.getCenter(_vector3);
    return toVector3Tuple(_vector3.toArray());
  }
}

/**
 * Visual helper for displaying a bounding box as wireframe lines.
 * Extends THREE.LineSegments to render the 12 edges of a box.
 */
class BoxHelper extends THREE.LineSegments {
  declare type: "BoxHelper";
  declare geometry: THREE.BufferGeometry & {
    attributes: { position: THREE.BufferAttribute };
  };
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
    this.type = "BoxHelper";
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
    disposeGeometry(this.geometry);
  }
}

/**
 * Stand-in object for one face, edge or vertex inside a solid, which has no object
 * of its own (it shares the solid's merged geometry). Holds the component's points
 * in the solid's local space and takes the solid's current world matrix whenever it
 * is measured, so a {@link BoxHelper} around it follows animation and explode.
 * Never added to the scene.
 */
class ComponentProxy extends THREE.Points {
  readonly source: THREE.Object3D;

  /**
   * @param points - The component's points (xyz triples) in the local space of `source`.
   * @param source - The object whose `matrixWorld` maps the points into world space.
   */
  constructor(points: Float32Array, source: THREE.Object3D) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    super(geometry);
    this.source = source;
    this.matrixAutoUpdate = false;
  }

  /** Whether the component is a single point (a vertex). */
  get isPoint(): boolean {
    return this.geometry.getAttribute("position").count === 1;
  }

  /** Take the source's current world matrix (called by every measurement). */
  override updateWorldMatrix(): void {
    this.source.updateWorldMatrix(true, false);
    this.matrixWorld.copy(this.source.matrixWorld);
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
  }
}

/**
 * Marker for a picked vertex, where a box would have size zero: a fixed-size point
 * drawn on top of the model, following the vertex through animation and explode.
 */
class PointMarker extends THREE.Points {
  declare type: "PointMarker";
  readonly proxy: ComponentProxy;

  constructor(proxy: ComponentProxy, color: number = 0xffff00) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(3), 3),
    );
    super(
      geometry,
      new THREE.PointsMaterial({
        color: color,
        size: 9,
        sizeAttenuation: false,
        depthTest: false,
        // The CAD face materials are transparent, so they are drawn after every
        // opaque object and would cover an opaque marker; in the transparent pass
        // the high renderOrder draws the marker last.
        transparent: true,
        toneMapped: false,
      }),
    );
    this.type = "PointMarker";
    this.proxy = proxy;
    this.matrixAutoUpdate = false;
    this.renderOrder = 999;
    this.update();
  }

  /** World position of the vertex. */
  point(): THREE.Vector3 {
    this.proxy.updateWorldMatrix();
    const local = this.proxy.geometry.getAttribute("position");
    return new THREE.Vector3()
      .fromBufferAttribute(local, 0)
      .applyMatrix4(this.proxy.matrixWorld);
  }

  /** Move the marker to the vertex's current world position. */
  update(): void {
    const p = this.point();
    const position = this.geometry.getAttribute("position");
    position.setXYZ(0, p.x, p.y, p.z);
    position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    disposeGeometry(this.geometry);
    (this.material as THREE.Material).dispose();
  }
}

const _vector3 = new THREE.Vector3();
const _bbox = new BoundingBox();
const _hbox = new BoundingBox();
const _sphere = new THREE.Sphere();

export { BoundingBox, BoxHelper, ComponentProxy, PointMarker };
