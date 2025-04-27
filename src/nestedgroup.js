import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./patches.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { VertexNormalsHelper } from "three/examples/jsm/helpers/VertexNormalsHelper.js";
import { BoundingBox } from "./bbox.js";
import { ObjectGroup } from "./objectgroup.js";
import { Group } from "./group.js";
import { flatten, disposeShapes } from "./utils.js";

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
    this.bbox = null;
    this.bsphere = null;
    this.groups = {};

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

    group.addType(back, "back");
    group.addType(front, "front");

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
  renderPolygon(
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
    function createShape(points) {
      const shape = new THREE.Shape();
      shape.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, points[i].y);
      }
      shape.closePath();
      return shape;
    }

    var group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      this.edgeColor,
      geomtype,
      subtype,
      renderback,
    );
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

    var polygon = shape.polygon;
    var height = shape.height;

    var shape = createShape(polygon);
    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
    };
    const shapeGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    const back = new THREE.Mesh(shapeGeometry, backMaterial);
    back.name = name;

    const front = new THREE.Mesh(shapeGeometry, frontMaterial);
    front.name = name;

    group.addType(back, "back");
    group.addType(front, "front");

    return group;
  }

  renderLoop(shapes) {
    const _render = (shape, texture, width, height) => {
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
        const objectGroup = _render(shape, texture, width, height);
        this.groups[shape.id] = objectGroup;
        group.add(objectGroup);
      }
    }
    return group;
  }

  render() {
    this.rootGroup = this.renderLoop(this.shapes);
    return this.rootGroup;
  }

  boundingBox() {
    if (this.bbox == null) {
      this.bbox = new BoundingBox();
      this.bbox.setFromObject(this.rootGroup, true);
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
