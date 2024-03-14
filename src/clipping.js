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
  side: THREE.FrontSide,
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
const stencilPlaneMaterial = new THREE.MeshBasicMaterial({
  metalness: 0.3,
  roughness: 0.65,
  opacity: 1.0,
  transparent: false,
  stencilWrite: true,
  stencilRef: 0,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp,
  stencilZFail: THREE.ReplaceStencilOp,
  stencilZPass: THREE.ReplaceStencilOp,
  side: THREE.DoubleSide,
});

class CenteredPlane extends THREE.Plane {
  constructor(normal, constant, center) {
    super(normal, constant);
    this.center = center;
    this.setConstant(constant);
  }

  setConstant(value) {
    this.centeredConstant = value;
    const c = this.distanceToPoint(new THREE.Vector3(...this.center));
    const z = this.distanceToPoint(new THREE.Vector3(0, 0, 0));
    this.constant = z - c + value;
  }
}

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
    material.color.set(new THREE.Color(color));
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
    super.updateMatrixWorld(this, force);
  }
}

function createStencil(name, material, geometry, plane) {
  material.clippingPlanes = [plane];
  var mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

class Clipping {
  constructor(center, size, nestedGroup, display, theme) {
    this.center = center;
    this.distance = size / 2;
    this.display = display;
    this.theme = theme;
    this.nestedGroup = nestedGroup;

    this.clipPlanes = [];
    this.reverseClipPlanes = [];

    this.planeHelpers = new THREE.Group();
    this.planeHelpers.name = "PlaneHelpers";
    this.planeHelperMaterials = [];
    this.objectColors = [];

    var i;
    for (i = 0; i < 3; i++) {
      const plane = new CenteredPlane(normals[i], this.distance, center);
      this.clipPlanes.push(plane);
      const reversePlane = new CenteredPlane(
        normals[i].clone().negate(),
        -this.distance,
        center,
      );
      this.reverseClipPlanes.push(reversePlane);

      this.display.setNormalLabel(i, normals[i].toArray());

      const material = planeHelperMaterial.clone();
      this.planeHelperMaterials.push(material);
      this.planeHelpers.add(
        new PlaneMesh(
          i,
          plane,
          center,
          size,
          material,
          planeColors[theme][i],
          "PlaneHelper",
          true,
        ),
      );
    }
    this.planeHelpers.visible = false;

    /*
    Stencils
    */
    var planeMeshGroup = new THREE.Group();
    planeMeshGroup.name = "PlaneMeshes";

    for (i = 0; i < 3; i++) {
      const plane = this.clipPlanes[i];
      const otherPlanes = this.clipPlanes.filter((_, j) => j !== i);

      for (var path in nestedGroup.groups) {
        var clippingGroup = new THREE.Group();
        clippingGroup.name = `clipping-${i}`;

        var group = nestedGroup.groups[path];
        if (group instanceof ObjectGroup && group.subtype === "solid") {
          this.objectColors.push(group.children[0].material.color.getHex());

          clippingGroup.add(
            createStencil(
              `frontStencil-${i}`,
              frontStencilMaterial.clone(),
              group.shapeGeometry,
              plane,
            ),
          );

          clippingGroup.add(
            createStencil(
              `backStencil-${i}`,
              backStencilMaterial.clone(),
              group.shapeGeometry,
              plane,
            ),
          );

          group.addType(clippingGroup, `clipping-${i}`);

          var planeMaterial = stencilPlaneMaterial.clone();
          planeMaterial.color.set(new THREE.Color(planeColors[theme][i]));
          planeMaterial.clippingPlanes = otherPlanes;


          planeMeshGroup.add(
            new PlaneMesh(
              i,
              plane,
              center,
              size,
              planeMaterial,
              planeColors[theme][i],
              // group.children[0].material.color.getHex(),
              "StencilPlane",
              false,
            )
          );
        }
      }
    }
    nestedGroup.rootGroup.add(planeMeshGroup);
  }


  setConstant(index, value) {
    this.clipPlanes[index].setConstant(value);
    this.reverseClipPlanes[index].setConstant(-value);
  }

  setNormal = (index, normal) => {
    this.clipPlanes[index].normal = normal.clone();
    this.reverseClipPlanes[index].normal = normal.clone().negate();
    this.setConstant(index, this.distance);
    this.display.setNormalLabel(index, normals[index].toArray());
  };

  setObjectColorCaps = (flag) => {

    var pmGroup;
    for (pmGroup of this.nestedGroup.rootGroup.children) {
      if (pmGroup.name === "PlaneMeshes") {
        break;
      }
    }
    var i = 0, j = -1;
    const len = Object.keys(pmGroup.children).length / 3;
    for (var group of pmGroup.children) {
      if (i % len === 0) {
        j++;
      }
      if (flag) {
        group.material.color.set(new THREE.Color(this.objectColors[i]));
      } else {
        group.material.color.set(new THREE.Color(planeColors[this.theme][j]));
      }
      i++;
    };
  };

  setVisible = (flag) => {

    var pmGroup;
    for (pmGroup of this.nestedGroup.rootGroup.children) {
      if (pmGroup.name === "PlaneMeshes") {
        break;
      }
    }
    for (var group of pmGroup.children) {
      group.material.visible = flag;
    };
  };
}

export { Clipping };
