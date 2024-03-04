import * as THREE from "three";
import { ObjectGroup } from "./objectgroup.js";

const normals = [
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, -1),
];

const planeColors = {
  light: [0xff0000, 0x00ff00, 0x0000ff],
  dark: [0xff4500, 0x32cd32, 0x3b9eff],
};

const planeHelperMaterial = new THREE.MeshBasicMaterial({
  opacity: 0.05,
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});

// everywhere that the back faces are visible (clipped region) the stencil
// buffer is incremented by 1.
const backStencilMaterial = new THREE.MeshBasicMaterial({
  depthWrite: false,
  depthTest: false,
  colorWrite: false,
  stencilWrite: true,
  stencilFunc: THREE.AlwaysStencilFunc,
  side: THREE.BackSide,

  stencilFail: THREE.IncrementWrapStencilOp,
  stencilZFail: THREE.IncrementWrapStencilOp,
  stencilZPass: THREE.IncrementWrapStencilOp,
});

// everywhere that the front faces are visible the stencil
// buffer is decremented back to 0.
const frontStencilMaterial = new THREE.MeshBasicMaterial({
  depthWrite: false,
  depthTest: false,
  colorWrite: false,
  stencilWrite: true,
  stencilFunc: THREE.AlwaysStencilFunc,
  side: THREE.FrontSide,

  stencilFail: THREE.DecrementWrapStencilOp,
  stencilZFail: THREE.DecrementWrapStencilOp,
  stencilZPass: THREE.DecrementWrapStencilOp,
});

// draw the plane everywhere that the stencil buffer != 0, which will
// only be in the clipped region where back faces are visible.
const stencilPlaneMaterial = new THREE.MeshStandardMaterial({
  metalness: 0.1,
  roughness: 0.75,
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp,
  stencilZFail: THREE.ReplaceStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
  side: THREE.DoubleSide,
});

class PlaneMesh extends THREE.Mesh {
  static matrix = new THREE.Matrix4();

  constructor(index, plane, center, size, material, color, type, edges) {
    const meshPositions = [
      1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, -1, -1, 0, 1, -1, 0,
    ];

    const meshGeometry = new THREE.BufferGeometry();
    meshGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(meshPositions, 3),
    );
    meshGeometry.computeBoundingSphere();

    super(meshGeometry, material);

    this.type = type;
    this.index = index;
    this.plane = plane;
    this.size = size;
    this.center = center;

    if (edges) {
      const linePositions = [-1, -1, 0, -1, 1, 0, 1, 1, 0, 1, -1, 0, -1, -1, 0];

      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePositions, 3),
      );
      lineGeometry.computeBoundingSphere();

      this.line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: color, toneMapped: false }),
      );

      this.add(this.line);
    }
  }

  dispose = () => {
    this.geometry.dispose();
    this.material.dispose();
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].geometry.dispose();
      this.children[i].material.dispose();
    }
  };

  onAfterRender = (renderer) => {
    if (this.type === "StencilPlane") {
      renderer.clearStencil();
    }
  };

  // https://discourse.threejs.org/t/center-threejs-planehelper-on-geometry/48516/4
  updateMatrixWorld(force) {
    this.position.set(0, 0, 0);
    this.scale.set(0.5 * this.size, 0.5 * this.size, 1);

    PlaneMesh.matrix.lookAt(this.position, this.plane.normal, this.up);
    this.quaternion.setFromRotationMatrix(PlaneMesh.matrix);

    this.translateZ(this.plane.constant);
    THREE.Line.prototype.updateMatrixWorld.call(this, force);
  }
}

class Clipping {
  constructor(center, size, distance, nestedGroup, uiCallback, theme) {
    this.center = center;
    this.distance = distance;
    this.uiCallback = uiCallback;

    this.clipPlanes = [];
    this.planeHelpers = new THREE.Group();
    // this.planeHelpers.position.set(...center); // needed for the plane help to be at the correct location

    var i;
    for (i = 0; i < 3; i++) {
      const plane = new THREE.Plane(normals[i], distance);
      this.clipPlanes.push(plane);
      this.uiCallback(i, normals[i].toArray());

      const material = planeHelperMaterial.clone();
      material.color.set(planeColors[theme][i]);
      var planeHelperGroup = new THREE.Group();
      var otherCenters = [...center];
      otherCenters[i] = 0;
      planeHelperGroup.position.set(...otherCenters); // needed for the plane help to be at the correct location
      planeHelperGroup.add(
        new PlaneMesh(
          i,
          this.clipPlanes[i],
          center,
          size,
          material,
          planeColors[theme][i],
          "PlaneHelper",
          true,
        ),
      );
      this.planeHelpers.add(planeHelperGroup);
    }
    this.planeHelpers.visible = false;

    /*
    Stencils
    */

    for (i = 0; i < 3; i++) {
      const plane = this.clipPlanes[i];
      const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);

      for (var path in nestedGroup.groups) {
        var clippingGroup = new THREE.Group();
        clippingGroup.name = `clipping-${i}`;

        var group = nestedGroup.groups[path];
        if (group instanceof ObjectGroup) {
          var frontMaterial = frontStencilMaterial.clone();
          frontMaterial.clippingPlanes = [plane];
          var frontMesh = new THREE.Mesh(group.shapeGeometry, frontMaterial);
          frontMesh.name = `frontStencil-${i}`;

          var backMaterial = backStencilMaterial.clone();
          backMaterial.clippingPlanes = [plane];
          var backMesh = new THREE.Mesh(group.shapeGeometry, backMaterial);
          backMesh.name = `backStencil-${i}`;

          clippingGroup.add(frontMesh);
          clippingGroup.add(backMesh);
          group.addType(clippingGroup, `clipping-${i}`);
        }
      }

      var planeGroup = new THREE.Group();
      planeGroup.name = `clippingPlane-${i}`;
      otherCenters = [...center];
      otherCenters[i] = 0;
      planeGroup.position.set(...otherCenters); // needed for the plane help to be at the correct location

      var planeMaterial = stencilPlaneMaterial.clone();
      planeMaterial.color.set(planeColors[theme][i]);
      planeMaterial.clippingPlanes = otherPlanes;

      var planeMesh = new PlaneMesh(
        i,
        plane,
        center,
        0.95 * size,
        planeMaterial,
        planeColors[theme][i],
        "StencilPlane",
        false,
      );
      planeGroup.add(planeMesh);
      nestedGroup.rootGroup.add(planeGroup);
    }
  }

  setConstant(index, value) {
    this.clipPlanes[index].constant = value; // + this.center[index];
  }

  setNormal = (index, normal) => {
    this.clipPlanes[index].normal = normal;
    this.uiCallback(index, normal.toArray());
  };
}

export { Clipping };
