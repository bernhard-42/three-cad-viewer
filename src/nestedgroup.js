import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "./patches.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { VertexNormalsHelper } from "three/examples/jsm/helpers/VertexNormalsHelper.js";
import { BoundingBox } from "./bbox.js";
import { ObjectGroup } from "./objectgroup.js";
import { MaterialFactory } from "./material-factory.js";
import { deepDispose, flatten } from "./utils.js";


/**
 * Manages hierarchical 3D geometry rendering from tessellated CAD data.
 * Creates and organizes ObjectGroup instances for shapes, edges, and vertices.
 */
class NestedGroup {
  /**
   * Create a NestedGroup for rendering CAD geometry.
   * @param {Object} shapes - The tessellated shape data to render.
   * @param {number} width - Canvas/viewport width for line material resolution.
   * @param {number} height - Canvas/viewport height for line material resolution.
   * @param {number} edgeColor - Default edge color as hex value (e.g., 0x000000).
   * @param {boolean} transparent - Whether to render shapes with transparency.
   * @param {number} opacity - Default opacity value (0.0 to 1.0).
   * @param {number} metalness - Material metalness value (0.0 to 1.0).
   * @param {number} roughness - Material roughness value (0.0 to 1.0).
   * @param {number} normalLen - Length for vertex normal helpers (0 to disable).
   * @param {number} bb_max - Maximum bounding box dimension.
   */
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
    this.instances = null;
    this.bbox = null;
    this.bsphere = null;
    this.groups = {};

    this.clipPlanes = null;

    this.materialFactory = new MaterialFactory({
      defaultOpacity: opacity,
      metalness: metalness,
      roughness: roughness,
      edgeColor: edgeColor,
      transparent: transparent,
    });
  }

  /**
   * Dispose of all resources and clean up memory.
   * Releases groups, root group, and shape data.
   */
  dispose() {
    if (this.groups) {
      deepDispose(Object.values(this.groups));
      this.groups = null;
    }
    if (this.rootGroup) {
      deepDispose(this.rootGroup);
      this.rootGroup = null;
    }
    if (this.shapes) {
      deepDispose(this.shapes);
      this.shapes = null;
    }
  }

  /**
   * Convert array data to Float32Array, handling protocol version differences.
   * @param {Float32Array|Array} data - Array data or Float32Array.
   * @param {number} [flattenDepth=1] - Depth to flatten nested arrays.
   * @returns {Float32Array} The data as a Float32Array.
   */
  _toFloat32Array(data, flattenDepth = 1) {
    return data instanceof Float32Array
      ? data
      : new Float32Array(flatten(data, flattenDepth));
  }

  /**
   * Convert array data to Uint32Array, handling protocol version differences.
   * @param {Uint32Array|Array} data - Array data or Uint32Array.
   * @param {number} [flattenDepth=1] - Depth to flatten nested arrays.
   * @returns {Uint32Array} The data as a Uint32Array.
   */
  _toUint32Array(data, flattenDepth = 1) {
    return data instanceof Uint32Array
      ? data
      : new Uint32Array(flatten(data, flattenDepth));
  }

  /**
   * Internal method to render edge geometry as fat lines.
   * @param {Float32Array|Array} edgeList - Edge vertex positions.
   * @param {number} lineWidth - Width of the rendered lines.
   * @param {number|number[]} color - Edge color or array of colors per segment.
   * @param {number} state - Visibility state (1 = visible).
   * @returns {LineSegments2} The rendered line segments.
   * @private
   */
  _renderEdges(edgeList, lineWidth, color, state) {
    const positions = this._toFloat32Array(edgeList, 3);

    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(positions);

    const hasVertexColors = Array.isArray(color);

    if (hasVertexColors) {
      var colors = color
        .map((c) => [
          new THREE.Color(c).toArray(),
          new THREE.Color(c).toArray(),
        ])
        .flat(2);
      lineGeometry.setColors(colors);
    }

    const lineMaterial = this.materialFactory.createEdgeMaterial({
      lineWidth: lineWidth,
      color: hasVertexColors ? null : color,
      vertexColors: hasVertexColors,
      visible: state == 1,
      resolution: { width: this.width, height: this.height },
    });

    var edges = new LineSegments2(lineGeometry, lineMaterial);
    edges.renderOrder = 999;

    return edges;
  }

  /**
   * Render standalone edge geometry (not associated with a face).
   * @param {Object|Array} edgeList - Edge data (v2: {edges: [...]} or v1: direct array).
   * @param {number} lineWidth - Width of the rendered lines.
   * @param {number} color - Edge color as hex value.
   * @param {string} path - Unique path identifier for this edge group.
   * @param {string} name - Display name for the edges.
   * @param {number} state - Visibility state (1 = visible).
   * @param {Object} [geomtype=null] - Geometry type metadata.
   * @returns {ObjectGroup} The created ObjectGroup containing the edges.
   */
  renderEdges(edgeList, lineWidth, color, path, name, state, geomtype = null) {
    var group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      color == null ? this.edgeColor : color,
      geomtype,
      "edges",
    );

    // Handle protocol version differences: v2 has edges property, v1 is direct array
    const edgeData = edgeList.edges ?? edgeList;
    var edges = this._renderEdges(edgeData, lineWidth, color, state);
    if (name) {
      edges.name = name;
    }
    group.addType(edges, "edges");

    this.groups[path] = group;
    group.name = path.replaceAll("/", this.delim);

    return group;
  }

  /**
   * Render vertex points as a point cloud.
   * @param {Object|Array} vertexList - Vertex data (v2: {obj_vertices: [...]} or v1: direct array).
   * @param {number} size - Point size in pixels.
   * @param {number} color - Vertex color as hex value.
   * @param {string} path - Unique path identifier for this vertex group.
   * @param {string} name - Display name for the vertices.
   * @param {number} state - Visibility state (1 = visible).
   * @param {Object} [geomtype=null] - Geometry type metadata.
   * @returns {ObjectGroup} The created ObjectGroup containing the vertices.
   */
  renderVertices(vertexList, size, color, path, name, state, geomtype = null) {
    var group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      color == null ? this.edgeColor : color,
      geomtype,
      "vertices",
    );

    // Handle protocol version differences: v2 has obj_vertices property, v1 is direct array
    const vertexData = vertexList.obj_vertices ?? vertexList;
    const positions = this._toFloat32Array(vertexData);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    const material = this.materialFactory.createVertexMaterial({
      size: size,
      color: color,
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

  /**
   * Render a tessellated 3D shape with front/back faces and optional edges.
   * @param {Object} shape - Shape data with vertices, normals, triangles, and edges.
   * @param {number|number[]} color - Face color or array of colors.
   * @param {number} alpha - Transparency value (0.0 to 1.0).
   * @param {boolean} renderback - Whether to render back faces.
   * @param {boolean} exploded - Whether shape is in exploded view mode.
   * @param {string} path - Unique path identifier for this shape.
   * @param {string} name - Display name for the shape.
   * @param {number[]} states - Visibility states [shapeState, edgeState].
   * @param {Object} [geomtype=null] - Geometry type metadata.
   * @param {string} [subtype=null] - Shape subtype (e.g., "solid").
   * @param {Object} [texture_data=null] - Base64 texture data with format field.
   * @param {number} [texture_width=null] - Texture width in pixels.
   * @param {number} [texture_height=null] - Texture height in pixels.
   * @returns {ObjectGroup} The created ObjectGroup containing the shape geometry.
   */
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
    const positions = this._toFloat32Array(shape.vertices);
    const normals = this._toFloat32Array(shape.normals);
    const triangles = this._toUint32Array(shape.triangles);

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

      frontMaterial = this.materialFactory.createTextureMaterial({ texture });
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

      frontMaterial = this.materialFactory.createFrontFaceMaterial({
        color: color,
        alpha: alpha,
        visible: states[0] == 1,
      });
      frontMaterial.name = "frontMaterial";
    }

    const backColor =
      group.subtype === "solid" && !exploded
        ? color
        : new THREE.Color(this.edgeColor).lerp(new THREE.Color(1, 1, 1), 0.15);

    const backMaterial = this.materialFactory.createBackFaceBasicMaterial({
      color: backColor,
      alpha: alpha,
      visible: states[0] == 1 && (renderback || this.backVisible),
    });
    backMaterial.name = "backMaterial";

    const back = new THREE.Mesh(shapeGeometry, backMaterial);
    back.name = name;

    const front = new THREE.Mesh(shapeGeometry, frontMaterial);
    front.name = name;

    // ensure, transparent objects will be rendered at the end
    if (alpha < 1.0) {
      back.renderOrder = 999;
      front.renderOrder = 999;
    }

    if (front.geometry.boundingBox == null) {
      front.geometry.computeBoundingBox();
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

    const edgeList = shape.edges;
    if (edgeList && edgeList.length > 0) {
      const edges = this._renderEdges(edgeList, 1, null, states[1]);
      edges.name = name;
      group.addType(edges, "edges");
    }

    return group;
  }

  /**
   * Create edge geometry from extruded polygons.
   * Generates wireframe edges for bottom, top, and vertical connections.
   * @param {THREE.Shape[]} polygons - Array of polygon shapes.
   * @param {number} depth - Extrusion depth.
   * @returns {THREE.BufferGeometry} Edge geometry for line rendering.
   * @private
   */
  _createEdgesFromPolygons(polygons, depth) {
    const vertices = [];
    const indices = [];
    let vertexOffset = 0;

    for (let j = 0; j < polygons.length; j++) {
      const polygon = polygons[j];
      const points = polygon.getPoints(); // Get 2D polygon points
      const bottomPoints = points.map((p) => new THREE.Vector3(p.x, p.y, 0));
      const topPoints = points.map((p) => new THREE.Vector3(p.x, p.y, depth));

      // Add bottom and top perimeter edges
      const addPerimeter = (perimeterPoints) => {
        for (let i = 0; i < perimeterPoints.length; i++) {
          const nextIndex = (i + 1) % perimeterPoints.length;
          indices.push(vertexOffset + i, vertexOffset + nextIndex);
        }
        vertices.push(...perimeterPoints);
        vertexOffset += perimeterPoints.length;
      };

      addPerimeter(bottomPoints);
      addPerimeter(topPoints);

      // Add vertical edges between corresponding points
      for (let i = 0; i < points.length; i++) {
        indices.push(
          vertexOffset - 2 * points.length + i, // Bottom point index
          vertexOffset - points.length + i, // Top point index
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(vertices);
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Render extruded 2D polygons (GDS format) as 3D geometry.
   * @param {Object} shape - Shape data with refs (polygon references), matrices, and height.
   * @param {number} minZ - Minimum Z coordinate for positioning.
   * @param {number} color - Face color as hex value.
   * @param {number} alpha - Transparency value (0.0 to 1.0).
   * @param {boolean} renderback - Whether to render back faces.
   * @param {boolean} exploded - Whether shape is in exploded view mode.
   * @param {string} path - Unique path identifier for this shape.
   * @param {string} name - Display name for the shape.
   * @param {number[]} states - Visibility states [shapeState, edgeState].
   * @param {Object} [geomtype=null] - Geometry type metadata.
   * @param {string} [subtype=null] - Shape subtype.
   * @returns {ObjectGroup} The created ObjectGroup containing the extruded geometry.
   */
  renderPolygons(
    shape,
    minZ,
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
    const group = new ObjectGroup(
      this.defaultOpacity,
      1.0,
      this.edgeColor,
      geomtype,
      subtype,
      renderback,
    );
    group.name = path.replaceAll("/", this.delim);
    group.minZ = minZ;
    group.height = shape.height;

    this.groups[path] = group;

    // var timer = new Timer(`renderPolygons ${path}`, this.timeit);

    var polygons = [];
    var matrices;
    if (shape.matrices && shape.matrices.length > 0) {
      matrices = shape.matrices;
    } else {
      matrices = [1, 0, 0, 0, 1, 0];
    }
    for (var ref of shape.refs) {
      var vertices = this.instances[ref];
      const n = vertices.length / 2;
      var points = new Array(n);
      for (var i = 0; i < matrices.length / 6; i++) {
        const a = matrices[6 * i];
        const b = matrices[6 * i + 1];
        const x = matrices[6 * i + 2];
        const d = matrices[6 * i + 3];
        const e = matrices[6 * i + 4];
        const y = matrices[6 * i + 5];
        for (let j = 0; j < n; j++) {
          points[j] = new THREE.Vector2(
            a * vertices[2 * j] + b * vertices[2 * j + 1] + x,
            d * vertices[2 * j] + e * vertices[2 * j + 1] + y,
          );
        }

        const polygon = new THREE.Shape(points);
        polygons.push(polygon);
      }
    }
    // timer.split(
    //   `- created polygons ${shape.refs.length * (matrices.length / 6)}`,
    // );

    const extrudeSettings = {
      depth: shape.height,
      bevelEnabled: false,
    };
    let polyGeometry;
    polyGeometry = new THREE.ExtrudeGeometry(polygons, extrudeSettings);
    // timer.split("- created geometry");

    var frontMaterial = this.materialFactory.createFrontFaceMaterial({
      color: color,
      alpha: alpha,
      visible: states[0] == 1,
    });
    frontMaterial.name = "frontMaterial";

    var backMaterial = this.materialFactory.createBackFaceStandardMaterial({
      color: color,
      alpha: alpha,
      visible: states[0] == 1 && (renderback || this.backVisible),
    });
    backMaterial.name = "backMaterial";

    const back = new THREE.Mesh(polyGeometry, backMaterial);
    back.name = name;
    const front = new THREE.Mesh(polyGeometry, frontMaterial);
    front.name = name;
    // timer.split("- prepared solid material");

    // Edges
    const edgeGeom = this._createEdgesFromPolygons(polygons, shape.height);
    // timer.split("- created edge geometry");

    var lineMat = this.materialFactory.createSimpleEdgeMaterial({});

    var polyEdges = new THREE.LineSegments(edgeGeom, lineMat);
    // timer.split("- created line segments");

    group.shapeGeometry = polyGeometry;
    group.addType(front, "front");
    group.addType(back, "back");
    group.addType(polyEdges, "edges");

    // timer.stop();

    return group;
  }

  /**
   * Recursively render all shapes in the shape tree.
   * Dispatches to appropriate render method based on shape type.
   * @param {Object[]} shapes - Array of shape objects to render.
   * @returns {THREE.Group} The root group containing all rendered geometry.
   */
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
          mesh = this.renderPolygons(
            shape.shape,
            shape.loc[0][2],
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

    var group = new THREE.Group();
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

  /**
   * Main entry point to render all shapes.
   * Initializes GDS instances if applicable and starts the render loop.
   * @returns {THREE.Group} The root group containing all rendered geometry.
   */
  render() {
    if (this.shapes.format == "GDS") {
      this.instances = this.shapes.instances;
    }
    this.rootGroup = this.renderLoop(this.shapes);
    return this.rootGroup;
  }

  /**
   * Get the bounding box of all rendered geometry.
   * Computes and caches the bounding box on first call.
   * @returns {BoundingBox} The bounding box of the root group.
   */
  boundingBox() {
    if (this.bbox == null) {
      this.bbox = new BoundingBox();
      this.bbox.setFromObject(this.rootGroup, false); // false uses precomputed bounding box
    }
    return this.bbox;
  }

  /**
   * Traverse all ObjectGroup instances and call a method on each.
   * @param {string} func - Name of the method to call on each ObjectGroup.
   * @param {*} flag - Argument to pass to the method.
   * @private
   */
  _traverse(func, flag) {
    for (var path in this.groups) {
      var obj = this.groups[path];
      if (obj instanceof ObjectGroup) {
        obj[func](flag);
      }
    }
  }

  /**
   * Get all currently selected ObjectGroup instances.
   * @returns {ObjectGroup[]} Array of selected ObjectGroups.
   */
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

  /**
   * Clear selection and highlights from all selected objects.
   */
  clearSelection() {
    for (var object of this.selection()) {
      object.clearHighlights();
    }
  }

  /**
   * Set metalness value for all materials.
   * @param {number} value - Metalness value (0.0 to 1.0).
   */
  setMetalness(value) {
    this.metalness = value;
    this.materialFactory.update({ metalness: value });
    this._traverse("setMetalness", value);
  }

  /**
   * Set roughness value for all materials.
   * @param {number} value - Roughness value (0.0 to 1.0).
   */
  setRoughness(value) {
    this.roughness = value;
    this.materialFactory.update({ roughness: value });
    this._traverse("setRoughness", value);
  }

  /**
   * Enable or disable transparency for all shapes.
   * @param {boolean} flag - Whether to enable transparency.
   */
  setTransparent(flag) {
    this.transparent = flag;
    this.materialFactory.update({ transparent: flag });
    this._traverse("setTransparent", flag);
  }

  /**
   * Set whether edges should be rendered in black.
   * @param {boolean} flag - Whether to use black edges.
   */
  setBlackEdges(flag) {
    this.blackEdges = flag;
    this._traverse("setBlackEdges", flag);
  }

  /**
   * Set visibility of back faces.
   * @param {boolean} flag - Whether back faces should be visible.
   */
  setBackVisible(flag) {
    this.backVisible = flag;
    this._traverse("setBackVisible", flag);
  }

  /**
   * Set the edge color for all shapes.
   * @param {number} color - Edge color as hex value.
   */
  setEdgeColor(color) {
    this.edge_color = color;
    this._traverse("setEdgeColor", color);
  }

  /**
   * Set the opacity for all shapes.
   * @param {number} opacity - Opacity value (0.0 to 1.0).
   */
  setOpacity(opacity) {
    this.opacity = opacity;
    this._traverse("setOpacity", opacity);
  }

  /**
   * Set clip intersection mode for all materials.
   * @param {boolean} flag - Whether to use intersection clipping.
   */
  setClipIntersection(flag) {
    this._traverse("setClipIntersection", flag);
  }

  /**
   * Set clipping planes for all materials.
   * @param {THREE.Plane[]} planes - Array of clipping planes.
   */
  setClipPlanes(planes) {
    this.clipPlanes = planes;
    this._traverse("setClipPlanes", planes);
  }

  /**
   * Set polygon offset for depth sorting.
   * @param {number} offset - Polygon offset units value.
   */
  setPolygonOffset(offset) {
    this._traverse("setPolygonOffset", offset);
  }

  /**
   * Set Z-axis scale for all shapes (used for GDS extrusion visualization).
   * @param {number} value - Z scale factor.
   */
  setZScale(value) {
    this._traverse("setZScale", value);
  }

  /**
   * Reset minimum Z position for all shapes.
   */
  setMinZ() {
    this._traverse("setMinZ");
  }

  /**
   * Mark all materials as needing update.
   */
  updateMaterials() {
    this._traverse("updateMaterials", true);
  }

  /**
   * Enable or disable zebra stripe visualization.
   * @param {boolean} flag - Whether to enable zebra stripes.
   */
  setZebra(flag) {
    this._traverse("setZebra", flag);
  }

  /**
   * Set the number of zebra stripes.
   * @param {number} value - Number of stripes (2-50).
   */
  setZebraCount(value) {
    this._traverse("setZebraCount", value);
  }

  /**
   * Set the opacity of zebra stripes.
   * @param {number} value - Stripe opacity (0.0 to 1.0).
   */
  setZebraOpacity(value) {
    this._traverse("setZebraOpacity", value);
  }

  /**
   * Set the direction/angle of zebra stripes.
   * @param {number} value - Stripe direction in degrees (0-90).
   */
  setZebraDirection(value) {
    this._traverse("setZebraDirection", value);
  }

  /**
   * Set the color scheme for zebra stripes.
   * @param {string} flag - Color scheme ("blackwhite", "colorful", "grayscale").
   */
  setZebraColorScheme(flag) {
    this._traverse("setZebraColorScheme", flag);
  }

  /**
   * Set the mapping mode for zebra stripes.
   * @param {string} flag - Mapping mode ("reflection", "normal").
   */
  setZebraMappingMode(flag) {
    this._traverse("setZebraMappingMode", flag);
  }
}

export { NestedGroup, ObjectGroup };
