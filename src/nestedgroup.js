import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./patches.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { VertexNormalsHelper } from "three/examples/jsm/helpers/VertexNormalsHelper.js";
import { BoundingBox } from "./bbox.js";
import { ObjectGroup } from "./objectgroup.js";
import { Group } from "./group.js";
import { flatten, flatten32, disposeShapes } from "./utils.js";
import { Timer } from "./timer.js";

class States {
  constructor(states) {
    this.states = states;
  }
  convert(states) {
    const parts = id.split("/");
    var node = states;
    for (var i = 1; i++; i < parts.length) {
      node = node[parts[i]];
    }
    return node;
  }
  getState(path, index) {
    return this.convert(this.states[path])[index];
  }
  getStates(path) {
    return this.convert(this.states[path]);
  }
}

// class AGroup extends THREE.Group {
//   constructor() {
//     super();
//   }

//   boundingBox() {
//     var bbox = THREE.Box3();
//     for (var child in this.children) {
//       if (child.name == "PlaneMeshes") {
//         bbox.union(child.boundingBox());
//       }
//     }
//   }
// }

class NestedGroup {
  constructor(
    shapes,
    width,
    height,
    edgeColor,
    transparent,
    opacity,
    metalness,
    roughness,
    normalLen,
    bb_max,
    timeit = false,
  ) {
    this.shapes = shapes;
    this.width = width;
    this.height = height;
    this.edgeColor = edgeColor;
    this.transparent = transparent;
    this.metalness = metalness;
    this.roughness = roughness;
    this.defaultOpacity = opacity;
    this.normalLen = normalLen;
    this.blackEdges = false;
    this.backVisible = false;
    this.bb_max = bb_max;
    this.delim = "|";
    this.rootGroup = null;
    this.instances = null;
    this.bbox = null;
    this.bsphere = null;
    this.groups = {};
    this.timeit = timeit;
    this.clipPlanes = null;
  }

  dispose() {
    if (this.groups) {
      for (var k in this.groups) {
        this.groups[k].dispose();
      }
      this.groups = null;
    }
    if (this.rootGroup) {
      this.rootGroup.dispose();
      this.rootGroup = null;
    }
    if (this.shapes) {
      disposeShapes(this.shapes);
      this.shapes = null;
    }
  }

  _dump(ind) {
    if (ind == undefined) {
      ind = "";
    }
    if (this.parts) {
      for (var part of this.parts) {
        this._dump(part, ind + "  ");
      }
    }
  }

  _renderEdges(edgeList, lineWidth, color, state) {
    var positions =
      edgeList instanceof Float32Array
        ? edgeList
        : new Float32Array(flatten(edgeList, 3));

    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(positions);

    const lineMaterial = new LineMaterial({
      linewidth: lineWidth,
      transparent: true,
      depthWrite: !this.transparent,
      depthTest: !this.transparent,
      clipIntersection: false,
    });

    if (Array.isArray(color)) {
      var colors = color
        .map((c) => [
          new THREE.Color(c).toArray(),
          new THREE.Color(c).toArray(),
        ])
        .flat(2);
      lineGeometry.setColors(colors);
      lineMaterial.vertexColors = "VertexColors";
    } else {
      lineMaterial.color = new THREE.Color(
        color == null ? this.edgeColor : color,
      );
    }
    lineMaterial.visible = state == 1;
    lineMaterial.resolution.set(this.width, this.height);

    var edges = new LineSegments2(lineGeometry, lineMaterial);
    edges.renderOrder = 999;

    return edges;
  }

  renderEdges(edgeList, lineWidth, color, path, name, state, geomtype = null) {
    var group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      color == null ? this.edgeColor : color,
      geomtype,
      "edges",
    );

    var edges = this._renderEdges(
      edgeList.edges
        ? edgeList.edges // protocol version 2
        : flatten(edgeList), // protocol version 1
      lineWidth,
      color,
      state,
    );
    if (name) {
      edges.name = name;
    }
    group.addType(edges, "edges");

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    return group;
  }

  renderVertices(vertexList, size, color, path, name, state, geomtype = null) {
    var group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      color == null ? this.edgeColor : color,
      geomtype,
      "vertices",
    );

    const vertex_color = color == null ? this.edgeColor : color;

    let positions;
    if (vertexList.obj_vertices) {
      // protocol version 2
      positions =
        vertexList.obj_vertices instanceof Float32Array
          ? vertexList.obj_vertices
          : new Float32Array(vertexList.obj_vertices);
    } else {
      // protocol version 1
      positions =
        vertexList instanceof Float32Array
          ? vertexList
          : new Float32Array(flatten(vertexList));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    const material = new THREE.PointsMaterial({
      color: vertex_color,
      sizeAttenuation: false,
      size: size,
      transparent: true,
      clipIntersection: false,
      visible: state == 1,
    });

    var points = new THREE.Points(geometry, material);
    if (name) {
      points.name = name;
    }
    group.addType(points, "vertices");

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    return group;
  }

  renderShape(
    shape,
    color,
    alpha,
    renderback,
    exploded,
    path,
    name,
    states,
    geomtype = null,
    subtype = null,
    texture_data = null,
    texture_width = null,
    texture_height = null,
  ) {
    const positions =
      shape.vertices instanceof Float32Array
        ? shape.vertices
        : new Float32Array(flatten(shape.vertices));
    const normals =
      shape.normals instanceof Float32Array
        ? shape.normals
        : new Float32Array(flatten(shape.normals));
    const triangles =
      shape.triangles instanceof Uint32Array
        ? shape.triangles
        : new Uint32Array(flatten(shape.triangles));

    var group = new ObjectGroup(
      this.defaultOpacity,
      alpha,
      this.edgeColor,
      geomtype,
      subtype,
      renderback,
    );

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    if (alpha == null) {
      alpha = 1.0;
    } else if (alpha < 1.0) {
      this.transparent = true;
    }

    var shapeGeometry;
    var texture = null;
    var frontMaterial = null;

    if (texture_data != null) {
      const url = `data:image/${texture_data.format};base64,${texture_data.data}`;
      var img = new Image();
      img.setAttribute("src", url);
      shapeGeometry = new THREE.PlaneGeometry(texture_width, texture_height);

      texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;

      frontMaterial = new THREE.MeshBasicMaterial({
        color: "#ffffff",
        map: texture,
        side: THREE.DoubleSide,
      });
      renderback = false;
    } else {
      shapeGeometry = new THREE.BufferGeometry();
      shapeGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      shapeGeometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(normals, 3),
      );
      shapeGeometry.setIndex(new THREE.BufferAttribute(triangles, 1));
      group.shapeGeometry = shapeGeometry;

      // see https://stackoverflow.com/a/37651610
      // "A common draw configuration you see is to draw all the opaque object with depth testing on,
      //  turn depth write off, then draw the transparent objects in a back to front order."
      frontMaterial = new THREE.MeshStandardMaterial({
        color: color,
        metalness: this.metalness,
        roughness: this.roughness,
        // envMap: texture,
        polygonOffset: true,
        polygonOffsetFactor: 1.0,
        polygonOffsetUnits: 1.0,
        transparent: true,
        opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
        // turn depth write off for transparent objects
        depthWrite: !this.transparent,
        // but keep depth test
        depthTest: true,
        clipIntersection: false,
        side: THREE.FrontSide,
        visible: states[0] == 1,
        map: texture,
        name: "frontMaterial",
      });
    }

    const backColor =
      group.subtype === "solid" && !exploded
        ? color
        : new THREE.Color(this.edgeColor).lerp(new THREE.Color(1, 1, 1), 0.15);

    const backMaterial = new THREE.MeshBasicMaterial({
      color: backColor,
      side: THREE.BackSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      transparent: true,
      opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
      // turn depth write off for transparent objects
      depthWrite: !this.transparent,
      // but keep depth test
      depthTest: true,
      clipIntersection: false,
      visible: states[0] == 1 && (renderback || this.backVisible),
      name: "backMaterial",
    });

    const back = new THREE.Mesh(shapeGeometry, backMaterial);
    back.name = name;

    const front = new THREE.Mesh(shapeGeometry, frontMaterial);
    front.name = name;

    // ensure, transparent objects will be rendered at the end
    if (alpha < 1.0) {
      back.renderOrder = 999;
      front.renderOrder = 999;
    }

    group.name = path.replaceAll("/", this.delim);
    group.addType(back, "back");
    group.addType(front, "front");

    if (front.geometry.boundingBox == null) {
      front.geometry.computeBoundingBox();
    }

    if (this.normalLen > 0) {
      const normalsHelper = new VertexNormalsHelper(
        front,
        this.normalLen,
        0xff00ff,
      );
      group.add(normalsHelper);
    }

    // group.add(new THREE.BoxHelper(front, 0x888888))

    const edgeList = shape.edges;
    if (edgeList.length > 0) {
      var edges = this._renderEdges(edgeList, 1, null, states[1]);
      edges.name = name;
      group.addType(edges, "edges");
    }

    return group;
  }

  renderInstancedPolygon(
    shape,
    color,
    alpha,
    renderback,
    exploded,
    path,
    name,
    states,
    geomtype = null,
    subtype = null,
  ) {
    var timer = new Timer(`renderPolygon ${name}`, this.timeit);

    var group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      this.edgeColor,
      geomtype,
      subtype,
      renderback,
    );
    group.name = path.replaceAll("/", this.delim);
    this.groups[path] = group;

    var ref = shape.ref;
    var offsets = shape.offsets;
    var vertices = this.instances[ref];
    const n = vertices.length / 2;
    const points = new Array(n);
    for (let i = 0; i < n; i++) {
      points[i] = new THREE.Vector2(vertices[2 * i], vertices[2 * i + 1]);
    }
    const polygon = new THREE.Shape(points);

    const extrudeSettings = {
      depth: shape.height,
      bevelEnabled: false,
    };
    const polyGeometry = new THREE.ExtrudeGeometry(polygon, extrudeSettings);

    // see https://stackoverflow.com/a/37651610
    // "A common draw configuration you see is to draw all the opaque object with depth testing on,
    //  turn depth write off, then draw the transparent objects in a back to front order."
    var frontMaterial = new THREE.MeshStandardMaterial({
      color: color,
      metalness: this.metalness,
      roughness: this.roughness,
      // envMap: texture,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      transparent: true,
      opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
      // turn depth write off for transparent objects
      depthWrite: !this.transparent,
      // but keep depth test
      depthTest: true,
      clipIntersection: false,
      side: THREE.FrontSide,
      visible: states[0] == 1,
      name: "frontMaterial",
    });

    var backColor =
      group.subtype === "solid" && !exploded
        ? color
        : new THREE.Color(this.edgeColor).lerp(new THREE.Color(1, 1, 1), 0.15);

    var backMaterial = new THREE.MeshBasicMaterial({
      color: backColor,
      side: THREE.BackSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      transparent: true,
      opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
      // turn depth write off for transparent objects
      depthWrite: !this.transparent,
      // but keep depth test
      depthTest: true,
      clipIntersection: false,
      visible: states[0] == 1 && (renderback || this.backVisible),
      name: "backMaterial",
    });
    timer.split("create materials");

    const back = new THREE.InstancedMesh(
      polyGeometry,
      backMaterial,
      offsets.length / 2,
    );

    const front = new THREE.InstancedMesh(
      polyGeometry,
      frontMaterial,
      offsets.length / 2,
    );
    timer.split("create instanced mesh");

    // Edges

    var edges = new THREE.EdgesGeometry(polyGeometry);
    var edgeGeom = new THREE.InstancedBufferGeometry().copy(edges);
    var edgeOffset = [];

    var instMat = new THREE.LineBasicMaterial({
      color: this.edgeColor,
      onBeforeCompile: (shader) => {
        shader.vertexShader = `
    	attribute vec3 offset;
      ${shader.vertexShader}
    `.replace(
          `#include <begin_vertex>`,
          `
      #include <begin_vertex>
      transformed += offset;
      `,
        );
      },
    });
    instMat.depthWrite = !this.transparent;
    instMat.depthTest = !this.transparent;
    instMat.clipIntersection = false;

    timer.split("create edges geometry");

    // create instances
    const dummy = new THREE.Object3D();
    for (let i = 0; i < offsets.length / 2; i++) {
      dummy.position.set(offsets[2 * i], offsets[2 * i + 1], 0);
      dummy.updateMatrix();
      front.setMatrixAt(i, dummy.matrix);
      back.setMatrixAt(i, dummy.matrix);
      edgeOffset.push(offsets[2 * i], offsets[2 * i + 1], 0);
    }
    front.instanceMatrix.needsUpdate = true;
    back.instanceMatrix.needsUpdate = true;
    // needs to be done manually for InstancedMesh
    timer.split("create instances");

    // only back will be used to calculate bounding box
    front.computeBoundingBox();
    timer.split("compute bounding box");

    edgeGeom.setAttribute(
      "offset",
      new THREE.InstancedBufferAttribute(new Float32Array(edgeOffset), 3),
    );
    edgeGeom.instanceCount = Infinity;
    var polyEdges = new THREE.LineSegments(edgeGeom, instMat);

    group.addType(front, "front");
    group.addType(back, "back");
    group.addType(polyEdges, "edges");

    timer.stop();

    return group;
  }

  // renderPolygon(
  //   shape,
  //   color,
  //   alpha,
  //   renderback,
  //   exploded,
  //   path,
  //   name,
  //   states,
  //   geomtype = null,
  //   subtype = null,
  // ) {
  //   function createEdges(points, h) {
  //     const n = points.length;
  //     const len = n * 2 * 3;
  //     const edges = new Float32Array(3 * len);

  //     let idx = 0;
  //     for (let i = 0; i < n; i++) {
  //       const a = points[i];
  //       const b = points[(i + 1) % n];

  //       edges[idx++] = a.x;
  //       edges[idx++] = a.y;
  //       edges[idx++] = 0;
  //       edges[idx++] = b.x;
  //       edges[idx++] = b.y;
  //       edges[idx++] = 0;
  //     }
  //     for (let i = 0; i < n; i++) {
  //       const a = points[i];
  //       const b = points[(i + 1) % n];

  //       edges[len + idx++] = a.x;
  //       edges[len + idx++] = a.y;
  //       edges[len + idx++] = h;
  //       edges[len + idx++] = b.x;
  //       edges[len + idx++] = b.y;
  //       edges[len + idx++] = h;
  //     }
  //     for (let i = 0; i < n; i++) {
  //       const a = points[i];

  //       edges[2 * len + idx++] = a.x;
  //       edges[2 * len + idx++] = a.y;
  //       edges[2 * len + idx++] = 0;
  //       edges[2 * len + idx++] = a.x;
  //       edges[2 * len + idx++] = a.y;
  //       edges[2 * len + idx++] = h;
  //     }
  //     return edges;
  //   }
  //   var timer = new Timer(`renderPolygon ${name}`, this.timeit);

  //   var group = new ObjectGroup(
  //     this.defaultOpacity,
  //     1.0,
  //     this.edgeColor,
  //     geomtype,
  //     subtype,
  //     renderback,
  //   );
  //   // see https://stackoverflow.com/a/37651610
  //   // "A common draw configuration you see is to draw all the opaque object with depth testing on,
  //   //  turn depth write off, then draw the transparent objects in a back to front order."
  //   var frontMaterial = new THREE.MeshStandardMaterial({
  //     color: color,
  //     metalness: this.metalness,
  //     roughness: this.roughness,
  //     // envMap: texture,
  //     polygonOffset: true,
  //     polygonOffsetFactor: 1.0,
  //     polygonOffsetUnits: 1.0,
  //     transparent: true,
  //     opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
  //     // turn depth write off for transparent objects
  //     depthWrite: !this.transparent,
  //     // but keep depth test
  //     depthTest: true,
  //     clipIntersection: false,
  //     side: THREE.FrontSide,
  //     visible: states[0] == 1,
  //     name: "frontMaterial",
  //   });

  //   var backColor =
  //     group.subtype === "solid" && !exploded
  //       ? color
  //       : new THREE.Color(this.edgeColor).lerp(new THREE.Color(1, 1, 1), 0.15);

  //   var backMaterial = new THREE.MeshBasicMaterial({
  //     color: backColor,
  //     side: THREE.BackSide,
  //     polygonOffset: true,
  //     polygonOffsetFactor: 1.0,
  //     polygonOffsetUnits: 1.0,
  //     transparent: true,
  //     opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
  //     // turn depth write off for transparent objects
  //     depthWrite: !this.transparent,
  //     // but keep depth test
  //     depthTest: true,
  //     clipIntersection: false,
  //     visible: states[0] == 1 && (renderback || this.backVisible),
  //     name: "backMaterial",
  //   });
  //   timer.split("create materials");

  //   var shapes = [];
  //   var edgeList = [];
  //   var height = shape.height;
  //   var points = 0;
  //   var polygonShape = null;
  //   for (var index in shape.polygons) {
  //     var polygon = shape.polygons[index];
  //     edgeList.push(createEdges(polygon, height));
  //     points += polygon.length;
  //     polygonShape = new THREE.Shape(polygon);
  //     polygonShape.closePath();
  //     shapes.push(polygonShape);
  //   }
  //   timer.split("create shapes");

  //   const extrudeSettings = {
  //     depth: height,
  //     bevelEnabled: false,
  //   };
  //   const shapeGeometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
  //   timer.split(`extrude geometry (${shape.polygons.length}, ${points})`);

  //   const back = new THREE.Mesh(shapeGeometry, backMaterial);
  //   back.name = name;

  //   const front = new THREE.Mesh(shapeGeometry, frontMaterial);
  //   front.name = name;

  //   group.addType(back, "back");
  //   group.addType(front, "front");
  //   timer.split("create meshes");

  //   edgeList = flatten32(edgeList);
  //   if (edgeList.length > 0) {
  //     var edges = this._renderEdges(edgeList, 0.5, null, states[1]);
  //     edges.name = name;
  //     group.addType(edges, "edges");
  //   }
  //   timer.split("create edges");

  //   timer.stop();
  //   return group;
  // }

  renderLoop(shapes) {
    const _render = (shape, texture, width, height, version = null) => {
      var mesh;
      switch (shape.type) {
        case "edges":
          mesh = this.renderEdges(
            shape.shape,
            shape.width,
            shape.color,
            shape.id,
            shape.name,
            shape.state[1],
            { topo: "edge", geomtype: shape.geomtype },
          );
          break;
        case "vertices":
          mesh = this.renderVertices(
            shape.shape,
            shape.size,
            shape.color,
            shape.id,
            shape.name,
            shape.state[1],
            { topo: "vertex", geomtype: null },
          );
          break;
        case "polygon":
          if (version == 1) {
            mesh = this.renderPolygon(
              shape.shape,
              shape.color,
              1.0,
              shape.renderback == null ? false : shape.renderback,
              false, //exploded
              shape.id,
              shape.name,
              shape.state,
              { topo: "face", geomtype: shape.geomtype },
              shape.subtype,
            );
          } else if (version == 2) {
            mesh = this.renderInstancedPolygon(
              shape.shape,
              shape.color,
              1.0,
              shape.renderback == null ? false : shape.renderback,
              false, //exploded
              shape.id,
              shape.name,
              shape.state,
              { topo: "face", geomtype: shape.geomtype },
              shape.subtype,
            );
          }
          break;
        default:
          mesh = this.renderShape(
            shape.shape,
            shape.color,
            shape.alpha,
            shape.renderback == null ? false : shape.renderback,
            shape.exploded,
            shape.id,
            shape.name,
            shape.state,
            { topo: "face", geomtype: shape.geomtype },
            shape.subtype,
            texture,
            width,
            height,
          );
      }
      // support object locations
      if (shape.loc != null) {
        mesh.position.set(...shape.loc[0]);
        mesh.quaternion.set(...shape.loc[1]);
      }
      return mesh;
    };

    var group = new Group();
    if (shapes.loc == null) {
      shapes.loc = [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
      ];
    }
    group.position.set(...shapes.loc[0]);
    group.quaternion.set(...shapes.loc[1]);

    this.groups[shapes.id] = group;
    group.name = shapes.id.replaceAll("/", "|");

    for (var shape of shapes.parts) {
      if (shape.parts) {
        group.add(this.renderLoop(shape));
      } else {
        const has_texture = shape.texture != null;
        var texture = has_texture ? shape.texture.image : null;
        var width = has_texture ? shape.texture.width : null;
        var height = has_texture ? shape.texture.height : null;
        const objectGroup = _render(
          shape,
          texture,
          width,
          height,
          shapes.version,
        );
        this.groups[shape.id] = objectGroup;
        group.add(objectGroup);
      }
    }
    return group;
  }

  render() {
    if (this.shapes.format == "GDS" && this.shapes.version == 2) {
      this.instances = this.shapes.instances;
    }
    this.rootGroup = this.renderLoop(this.shapes);
    return this.rootGroup;
  }

  boundingBox() {
    if (this.bbox == null) {
      this.bbox = new BoundingBox();
      this.bbox.setFromObject(this.rootGroup, false); // false uses precomputed bounding box
    }
    return this.bbox;
  }

  _traverse(func, flag) {
    for (var path in this.groups) {
      var obj = this.groups[path];
      if (obj instanceof ObjectGroup) {
        obj[func](flag);
      }
    }
  }

  selection() {
    var result = [];
    for (var path in this.groups) {
      for (var obj of this.groups[path].children) {
        if (obj instanceof ObjectGroup) {
          if (obj.isSelected) {
            result.push(obj);
          }
        }
      }
    }
    return result;
  }

  clearSelection() {
    for (var object of this.selection()) {
      object.clearHighlights();
    }
  }

  setMetalness(value) {
    this.metalness = value;
    this._traverse("setMetalness", value);
  }

  setRoughness(value) {
    this.roughness = value;
    this._traverse("setRoughness", value);
  }

  setTransparent(flag) {
    this.transparent = flag;
    this._traverse("setTransparent", flag);
  }

  setBlackEdges(flag) {
    this.blackEdges = flag;
    this._traverse("setBlackEdges", flag);
  }

  setBackVisible(flag) {
    this.backVisible = flag;
    this._traverse("setBackVisible", flag);
  }

  setEdgeColor(color) {
    this.edge_color = color;
    this._traverse("setEdgeColor", color);
  }

  setOpacity(opacity) {
    this.opacity = opacity;
    this._traverse("setOpacity", opacity);
  }

  setClipIntersection(flag) {
    this._traverse("setClipIntersection", flag);
  }

  setClipPlanes(planes) {
    this.clipPlanes = planes;
    this._traverse("setClipPlanes", planes);
  }

  setPolygonOffset(offset) {
    this._traverse("setPolygonOffset", offset);
  }

  updateMaterials() {
    this._traverse("updateMaterials", true);
  }
}

export { NestedGroup, ObjectGroup, States };
