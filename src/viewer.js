// =============================================================================
// IMPORTS
// =============================================================================

import * as THREE from "three";

import { NestedGroup, ObjectGroup } from "./nestedgroup.js";
import { Grid } from "./grid.js";
import { AxesHelper } from "./axes.js";
import { OrientationMarker } from "./orientation.js";
import { TreeView } from "./treeview.js";
import { Timer } from "./timer.js";
import { Clipping } from "./clipping.js";
import { Animation } from "./animation.js";
import {
  clone,
  isEqual,
  KeyMapper,
  scaleLight,
  flatten,
  deepDispose,
} from "./utils.js";
import { Controls } from "./controls.js";
import { Camera } from "./camera.js";
import { BoundingBox, BoxHelper } from "./bbox.js";
import { Tools } from "./cad_tools/tools.js";
import { version } from "./_version.js";
import { PickedObject, Raycaster, TopoFilter } from "./raycast.js";
import { ViewerState } from "./viewer-state.js";

// =============================================================================
// VIEWER CLASS
// =============================================================================

class Viewer {
  // ---------------------------------------------------------------------------
  // Constructor & Initialization
  // ---------------------------------------------------------------------------

  /**
   * Create Viewer.
   * @param {Display} display - The Display object.
   * @param {DisplayOptions} options - configuration parameters.
   * @param {NotificationCallback} notifyCallback - The callback to receive changes of viewer parameters.
   * @param {boolean} updateMarker - enforce to redraw orientation marker after evry ui activity
   */
  constructor(
    display,
    options,
    notifyCallback,
    pinAsPngCallback = null,
    updateMarker = true,
  ) {
    // Create centralized state from options (single source of truth)
    this.state = new ViewerState(options);

    this.notifyCallback = notifyCallback;
    this.pinAsPngCallback = pinAsPngCallback;
    this.updateMarker = updateMarker;

    this.hasAnimationLoop = false;

    this.display = display;

    if (options.keymap) {
      this.setKeyMap(options.keymap);
    }

    window.THREE = THREE;

    this.nestedGroup = null;
    this.mapping = null;
    this.tree = null;
    this.bbox = null;
    this.bb_max = 0;
    this.scene = null;
    this.camera = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.controls = null;
    this.orientationMarker = null;
    this.treeview = null;
    this.cadTools = new Tools(this, options.measurementDebug);

    this.ready = false;
    this.mixer = null;
    this.animation = new Animation("|");
    this.continueAnimation = true;

    this.clipNormals = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ];

    this.camera_distance = 0;

    this.mouse = new THREE.Vector2();

    // setup renderer
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      stencil: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.state.get("cadWidth"), this.state.get("height"));
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.autoClear = false;

    this.lastNotification = {};
    this.lastBbox = null;

    // measure supporting exploded shapes and compact shapes
    this.expandedTree = null;
    this.compactTree = null;
    this.expandedNestedGroup = null;
    this.compactNestedGroup = null;

    // If fromSolid is true, this means the selected object is from the solid
    // This is the obj that has been picked but the actual selected obj is the solid
    // Since we cannot directly pick a solid this is the solution
    this.lastObject = null;
    this.lastSelection = null;
    this.lastPosition = null;
    this.bboxNeedsUpdate = false;

    this.keepHighlight = false;

    this.setPickHandler(true);

    this.renderer.domElement.addEventListener("contextmenu", (e) =>
      e.stopPropagation(),
    );

    this.display.setupUI(this, this.renderer.domElement);

    console.debug("three-cad-viewer: WebGL Renderer created");
    window.viewer = this;
  }

  /**
   * Return three-cad-viewer version as semver string
   * @returns semver version
   */
  version() {
    return version;
  }

  /**
   * Apply render options and build materialSettings object.
   * Called by render() after state is populated with render options.
   * @param {RenderOptions} options - The provided options object for rendering.
   */
  setRenderDefaults(options) {
    // Update state with any render-specific options
    for (const option of Object.keys(options)) {
      if (this.state.get(option) !== undefined) {
        this.state.set(option, options[option], false);
      }
    }

    // Build materialSettings from current state
    this.materialSettings = {
      ambientIntensity: this.state.get("ambientIntensity"),
      directIntensity: this.state.get("directIntensity"),
      metalness: this.state.get("metalness"),
      roughness: this.state.get("roughness"),
    };
  }

  /**
   * Apply view options to state.
   * Called by render() after state is populated.
   * @param {ViewOptions} options - The provided options object for the view.
   */
  setViewerDefaults(options) {
    // Update state with view-specific options (notify to sync UI)
    for (const option of Object.keys(options)) {
      if (this.state.get(option) !== undefined) {
        this.state.set(option, options[option]);
      }
    }
  }

  /**
   * @deprecated Use state properties directly. Kept for backwards compatibility.
   */
  setDisplayDefaults() {
    // No-op: ViewerState now handles all defaults in its constructor
    // This method is kept only for API compatibility
  }

  dumpOptions() {
    this.state.dump();
  }

  // ---------------------------------------------------------------------------
  // Shape Tessellation & Decomposition
  // ---------------------------------------------------------------------------

  /**
   * Render tessellated shapes of a CAD object.
   * @param {Shapes} shapes - The Shapes object representing the tessellated CAD object.
   * @returns {THREE.Group} A nested THREE.Group object.
   */
  _renderTessellatedShapes(shapes) {
    const nestedGroup = new NestedGroup(
      shapes,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.state.get("edgeColor"),
      this.state.get("transparent"),
      this.state.get("defaultOpacity"),
      this.state.get("metalness"),
      this.state.get("roughness"),
      this.state.get("normalLen"),
    );
    if (shapes.bb) {
      this.bbox = new BoundingBox(
        new THREE.Vector3(shapes.bb.xmin, shapes.bb.ymin, shapes.bb.zmin),
        new THREE.Vector3(shapes.bb.xmax, shapes.bb.ymax, shapes.bb.zmax),
      );
    }
    nestedGroup.render();
    return nestedGroup;
  }

  /**
   * Retrieve the navigation tree from a Shapes object.
   * @param {Shapes} shapes - The Shapes object.
   * @returns {NavTree} The navigation tree object.
   */
  _getTree(shapes) {
    const _getTree = (parts) => {
      var result = {};
      for (var part of parts) {
        if (part.parts != null) {
          result[part.name] = _getTree(part.parts);
        } else {
          result[part.name] = part.state;
        }
      }
      return result;
    };
    var tree = {};
    tree[shapes.name] = _getTree(shapes.parts);
    return tree;
  }

  /**
   * Decompose a CAD object into faces, edges and vertices.
   * @param {Shapes} shapes - The Shapes object.
   * @returns {Shapes} A decomposed Shapes object.
   */
  _decompose(part) {
    const shape = part.shape;
    var j;

    part.parts = [];

    if (part.type == "shapes") {
      // decompose faces
      var new_part = {
        parts: [],
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        name: "faces",
        id: `${part.id}/faces`,
      };
      var triangles;
      const vertices = shape.vertices;
      const normals = shape.normals;
      const num = shape.triangles_per_face
        ? shape.triangles_per_face.length
        : shape.triangles.length;
      var current = 0;
      for (j = 0; j < num; j++) {
        if (shape.triangles_per_face) {
          triangles = shape.triangles.subarray(
            current,
            current + 3 * shape.triangles_per_face[j],
          );
          current += 3 * shape.triangles_per_face[j];
        } else {
          triangles = shape.triangles[j];
        }

        var vecs = new Float32Array(triangles.length * 3);
        var norms = new Float32Array(triangles.length * 3);
        for (var i = 0; i < triangles.length; i++) {
          var s = triangles[i];
          vecs[3 * i] = vertices[3 * s];
          vecs[3 * i + 1] = vertices[3 * s + 1];
          vecs[3 * i + 2] = vertices[3 * s + 2];
          norms[3 * i] = normals[3 * s];
          norms[3 * i + 1] = normals[3 * s + 1];
          norms[3 * i + 2] = normals[3 * s + 2];
        }
        var new_shape = {
          loc: [
            [0, 0, 0],
            [0, 0, 0, 1],
          ],
          name: `faces_${j}`,
          id: `${part.id}/faces/faces_${j}`,
          type: "shapes",
          color: part.color,
          alpha: part.alpha,
          renderback: true,
          state: [1, 3],
          accuracy: part.accuracy,
          bb: {},
          geomtype: shape.face_types[j],
          subtype: part.subtype,
          exploded: true,
          shape: {
            triangles: [...Array(triangles.length).keys()],
            vertices: vecs,
            normals: norms,
            edges: [],
          },
        };
        if (part.texture) {
          new_shape.texture = part.texture;
        }
        new_part.parts.push(new_shape);
      }

      part.parts.push(new_part);
    }

    if (part.type == "shapes" || part.type == "edges") {
      // decompose edges
      new_part = {
        parts: [],
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        name: "edges",
        id: `${part.id}/edges`,
      };
      const multiColor =
        Array.isArray(part.color) && part.color.length == shape.edges.length;
      var color;

      const num = shape.segments_per_edge
        ? shape.segments_per_edge.length
        : shape.edges.length;
      current = 0;
      var edge;
      for (j = 0; j < num; j++) {
        if (shape.segments_per_edge) {
          edge = shape.edges.subarray(
            current,
            current + 6 * shape.segments_per_edge[j],
          );
          current += 6 * shape.segments_per_edge[j];
        } else {
          edge = shape.edges[j];
        }
        color = multiColor ? part.color[j] : part.color;
        new_shape = {
          loc: [
            [0, 0, 0],
            [0, 0, 0, 1],
          ],
          name: `edges_${j}`,
          id: `${part.id}/edges/edges_${j}`,
          type: "edges",
          color: part.type == "shapes" ? this.state.get("edgeColor") : color,
          state: [3, 1],
          width: part.type == "shapes" ? 1 : part.width,
          bb: {},
          geomtype: shape.edge_types[j],
          shape: { edges: edge },
        };
        new_part.parts.push(new_shape);
      }
      if (new_part.parts.length > 0) {
        part.parts.push(new_part);
      }
    }

    // decompose vertices
    new_part = {
      parts: [],
      loc: [
        [0, 0, 0],
        [0, 0, 0, 1],
      ],
      name: "vertices",
      id: `${part.id}/vertices`,
    };
    var vertices = shape.obj_vertices;
    for (j = 0; j < vertices.length / 3; j++) {
      new_shape = {
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        name: `vertices_${j}`,
        id: `${part.id}/vertices/vertices_${j}`,
        type: "vertices",
        color:
          part.type == "shapes" || part.type == "edges"
            ? this.edgeColor
            : part.color,
        state: [3, 1],
        size: part.type == "shapes" || part.type == "edges" ? 4 : part.size,
        bb: {},
        shape: {
          obj_vertices: [
            vertices[3 * j],
            vertices[3 * j + 1],
            vertices[3 * j + 2],
          ],
        },
      };
      new_part.parts.push(new_shape);
    }
    if (new_part.parts.length > 0) {
      part.parts.push(new_part);
    }
    delete part.shape;
    delete part.color;
    delete part.alpha;
    delete part.accuracy;
    delete part.renderBack;

    return part;
  }

  /**
   * Render the shapes of the CAD object.
   * @param {boolean} exploded - Whether to render the compact or exploded version
   * @param {Shapes} shapes - The Shapes object.
   * @returns {THREE.Group} A nested THREE.Group object.
   */
  renderTessellatedShapes(exploded, shapes) {
    const _convertArrays = (shape) => {
      if (shape.triangles != null && !(shape.triangles instanceof Uint32Array))
        shape.triangles = new Uint32Array(shape.triangles);
      if (shape.edges != null && !(shape.edges instanceof Float32Array))
        shape.edges = new Float32Array(flatten(shape.edges, 3));
      if (shape.vertices != null && !(shape.vertices instanceof Float32Array))
        shape.vertices = new Float32Array(shape.vertices);
      if (shape.normals != null && !(shape.normals instanceof Float32Array))
        shape.normals = new Float32Array(flatten(shape.normals, 2));
      if (
        shape.obj_vertices != null &&
        !(shape.obj_vertices instanceof Float32Array)
      )
        shape.obj_vertices = new Float32Array(shape.obj_vertices);
      if (
        shape.face_types != null &&
        !(shape.face_types instanceof Uint32Array)
      )
        shape.face_types = new Uint32Array(shape.face_types);
      if (
        shape.edge_types != null &&
        !(shape.edge_types instanceof Uint32Array)
      )
        shape.edge_types = new Uint32Array(shape.edge_types);
      if (
        shape.triangles_per_face != null &&
        !(shape.triangles_per_face instanceof Uint32Array)
      )
        shape.triangles_per_face = new Uint32Array(shape.triangles_per_face);
      if (
        shape.segments_per_edge != null &&
        !(shape.segments_per_edge instanceof Uint32Array)
      )
        shape.segments_per_edge = new Uint32Array(shape.segments_per_edge);
    };
    const _render = (shapes) => {
      var part;
      if (shapes.version == 2 || shapes.version == 3) {
        var i, tmp;
        let parts = [];
        for (i = 0; i < shapes.parts.length; i++) {
          part = shapes.parts[i];
          if (part.shape != null) {
            _convertArrays(part.shape);
          }
          if (part.parts != null) {
            tmp = _render(part);
            parts.push(tmp);
          } else {
            parts.push(this._decompose(part));
          }
        }
        shapes.parts = parts;
      }
      return shapes;
    };

    var exploded_shapes;
    if (exploded) {
      exploded_shapes = _render(structuredClone(shapes));
    } else {
      exploded_shapes = structuredClone(shapes);
    }
    var nested_group = this._renderTessellatedShapes(exploded_shapes);
    var rendered_tree = this._getTree(exploded_shapes);

    return {
      group: nested_group,
      tree: rendered_tree,
    };
  }

  // ---------------------------------------------------------------------------
  // Animation Control
  // ---------------------------------------------------------------------------

  /**
   * Add an animation track for a THREE.Group
   * @param {string} selector - path/id of group to be animated.
   * @param {string} action - one of "rx", "ry", "rz" for rotations around axes, "q" for quaternions or "t", "tx", "ty", "tz" for translations.
   * @param {number[]} time - array of times.
   * @param {number[]} values - array of values, the type depends on the action.
   */
  addAnimationTrack(selector, action, time, values) {
    this.animation.addTrack(
      selector,
      this.nestedGroup.groups[selector],
      action,
      time,
      values,
    );
  }

  /**
   * Initialize the animation.
   * @param {number} duration - overall duration of the anmiation.
   * @param {number} speed - speed of the animation.
   */
  initAnimation(duration, speed, label = "A", repeat = true) {
    if (this.animation == null || this.animation.tracks.lenght == 0) {
      console.error("Animation does not have tracks");
      return;
    }
    console.debug("three-cad-viewer: Animation initialized");
    if (!this.hasAnimationLoop) {
      this.toggleAnimationLoop(true);
    }

    this.state.set("animationMode", label === "E" ? "explode" : "animation");
    this.clipAction = this.animation.animate(
      this.nestedGroup.rootGroup,
      duration,
      speed,
      repeat,
    );
    // Reset animation slider to start
    this.state.set("animationSliderValue", 0);
  }

  /**
   * Check whether animation object exists
   */
  hasAnimation() {
    return !!this.animation.clipAction;
  }

  /**
   * Clear the animation obect and dispose dependent objects
   */
  clearAnimation() {
    if (this.animation) {
      deepDispose(this.animation);
    }
    this.state.set("animationMode", "none");
    this.toggleAnimationLoop(false);
  }

  // ---------------------------------------------------------------------------
  // Render Loop & Scene Updates
  // ---------------------------------------------------------------------------

  /**
   * Creates ChangeNotification object if new value != old value and sends change notifications via viewer.notifyCallback.
   * @function
   * @param {ChangeInfos} changes - change information.
   * @param {boolean} notify - whether to send notification or not.
   */
  checkChanges = (changes, notify = true) => {
    var changed = {};
    Object.keys(changes).forEach((key) => {
      if (!isEqual(this.lastNotification[key], changes[key])) {
        var change = clone(changes[key]);
        changed[key] = {
          new: change,
          // map undefined in lastNotification to null to enable JSON exchange
          old:
            this.lastNotification[key] == null
              ? null
              : clone(this.lastNotification[key]),
        };
        this.lastNotification[key] = change;
      }
    });

    if (Object.keys(changed).includes("position")) {
      if (this.keepHighlight) {
        this.keepHighlight = false;
      } else {
        this.state.set("highlightedButton", null);
      }
    }

    if (notify && this.notifyCallback && Object.keys(changed).length) {
      this.notifyCallback(changed);
    }
  };

  /**
   * Notifies the states by checking for changes and passing the states to the checkChanges method.
   */
  notifyStates = () => {
    this.checkChanges({ states: this.getStates() }, true);
  };

  /**
   * Render scene and update orientation marker
   * If no animation loop exists, this needs to be called manually after every camera/scene change
   * @function
   * @param {boolean} updateMarker - whether to update the orientation marker
   * @param {boolean} fromAnimationLoop - whether a animation loop is running in the background. Update will skipped for this case
   * @param {boolean} notify - whether to send notification or not.
   */
  update = (updateMarker, notify = true) => {
    if (this.ready) {
      this.renderer.clear();

      if (this.raycaster && this.raycaster.raycastMode) {
        this.handleRaycast();
      }

      this.gridHelper.update(this.camera.getZoom());

      this.renderer.setViewport(
        0,
        0,
        this.state.get("cadWidth"),
        this.state.get("height"),
      );
      this.renderer.render(this.scene, this.camera.getCamera());
      this.cadTools.update();

      this.directLight.position.copy(this.camera.getCamera().position);

      if (
        this.lastBbox != null &&
        (this.lastBbox.needsUpdate || this.bboxNeedsUpdate)
      ) {
        console.debug("updated bbox");
        this.lastBbox.bbox.update();
        this.lastBbox.needsUpdate = false;
      }

      if (updateMarker) {
        this.renderer.clearDepth(); // ensure orientation Marker is at the top

        this.orientationMarker.update(
          this.camera.getPosition().clone().sub(this.controls.getTarget()),
          this.camera.getQuaternion(),
        );
        this.orientationMarker.render(this.renderer);
      }

      if (this.animation) {
        this.animation.update();
      }

      this.checkChanges(
        {
          zoom: this.camera.getZoom(),
          position: this.camera.getPosition().toArray(),
          quaternion: this.camera.getQuaternion().toArray(),
          target: this.controls.getTarget().toArray(),
        },
        notify,
      );
    }
  };

  /**
   * Start the animation loop
   * @function
   */
  animate = () => {
    if (this.continueAnimation) {
      requestAnimationFrame(this.animate);
      this.controls.update();
      this.update(true, true);
    } else {
      console.debug("three-cad-viewer: Animation loop stopped");
    }
  };

  toggleAnimationLoop(flag) {
    if (flag) {
      this.continueAnimation = true;
      this.hasAnimationLoop = true;
      this.controls.removeChangeListener();
      console.debug("three-cad-viewer: Change listener removed");
      this.animate();
      console.debug("three-cad-viewer: Animation loop started");
    } else {
      if (this.hasAnimationLoop) {
        console.debug("three-cad-viewer: Turning animation loop off");
      }
      this.continueAnimation = false;
      this.hasAnimationLoop = false;
      this.controls.addChangeListener(() => this.update(true, true));
      console.debug("three-cad-viewer: Change listener registered");

      // ensure last animation cycle has finished
      setTimeout(() => this.update(true, true), 50);
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup & Disposal
  // ---------------------------------------------------------------------------

  /**
   * Remove assets and event handlers.
   */
  dispose() {
    this.clear();

    // dispose the orientation marker
    if (this.orientationMarker != null) {
      this.orientationMarker.dispose();
    }

    // dispose renderer
    if (this.renderer != null) {
      this.renderer.renderLists.dispose();
      this.renderer
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext();
      console.debug("three-cad-viewer: WebGL context disposed");
      this.renderer = null;
    }

    this.ambientLight.dispose();
    this.ambientLight = null;
    this.directLight.dispose();
    this.directLight = null;
    this.materialSettings = null;
    this.clipping = null;
    this.camera = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.controls = null;
    this.orientationMarker = null;
    this.compactTree = null;
    deepDispose(this.cadTools);
    this.cadTools = null;
    this.clipAction = null;
    this.treeview.dispose();
    this.treeview = null;
    this.animation = null;
    this.clipNormals = null;
    this.lastNotification = null;
    this.clipNormal0 = null;
    this.clipNormal1 = null;
    this.clipNormal2 = null;
    this.display = null;
    this.renderOptions = null;
    this.mouse = null;
    this.tree = null;
    // Info is owned by Display
    this.bbox = null;
    this.keymap = null;
    if (this.raycaster) {
      this.raycaster.dispose();
      this.raycaster = null;
    }
  }

  /**
   * Clear CAD view and remove event handler.
   */
  clear() {
    if (this.scene != null) {
      // stop animation
      this.hasAnimationLoop = false;
      this.continueAnimation = false;

      // remove change listener if exists
      if (!this.hasAnimationLoop) {
        this.controls.removeChangeListener();
        console.debug("three-cad-viewer: Change listener removed");
      }
      this.hasAnimationLoop = false;
      this.state.set("animationMode", "none");

      if (this.animation != null) {
        deepDispose(this.animation);
      }

      // Reset zscale state
      if (this.shapes.format == "GDS") {
        this.state.set("zscaleActive", false);
      }
      // clear render canvas
      this.renderer.clear();

      // deselect measurement tools
      if (this.cadTools) {
        this.cadTools.disable();
        const currentTool = this.state.get("activeTool");
        if (currentTool != null) {
          this.state.set("activeTool", null);
          this.display.setTool(currentTool, false);
        }
      }

      // dispose scene
      deepDispose(this.scene);

      deepDispose(this.gridHelper);
      this.gridHelper = null;

      deepDispose(this.clipping);
      this.clipping = null;

      // clear tree view
      this.display.clearCadTree();

      // clear info
      deepDispose(this.info);

      // dispose camera and controls
      deepDispose(this.camera);
      deepDispose(this.controls);

      // dispose scene
      this.scene = null;
      this.ready = false;
    }

    if (this.shapes != null) {
      deepDispose(this.shapes);
      this.shapes = null;
    }

    if (this.expandedNestedGroup != null) {
      deepDispose(this.expandedNestedGroup);
      this.expandedNestedGroup = null;
    }
    if (this.compactNestedGroup != null) {
      deepDispose(this.compactNestedGroup);
      this.compactNestedGroup = null;
    }
    if (this.nestedGroup != null) {
      deepDispose(this.nestedGroup);
      this.nestedGroup = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Scene Rendering & Tree Management
  // ---------------------------------------------------------------------------

  /**
   * Synchronizes the states of two tree structures recursively.
   *
   * @param {Array|Object} compactTree - The compact tree structure.
   * @param {Array|Object} expandedTree - The expanded tree structure.
   * @param {string} path - The current path in the tree structure.
   */
  syncTreeStates = (compactTree, expandedTree, exploded, path) => {
    if (Array.isArray(compactTree)) {
      if (exploded) {
        for (let t in expandedTree) {
          for (let l in expandedTree[t]) {
            const id = `${path}/${t}/${l}`;
            const objectGroup = this.expandedNestedGroup.groups[id];
            for (let i of [0, 1]) {
              if (i == 0) {
                objectGroup.setShapeVisible(compactTree[0] == 1);
              } else {
                objectGroup.setEdgesVisible(compactTree[1] == 1);
              }
              if (expandedTree[t][l][i] != 3) {
                expandedTree[t][l][i] = compactTree[i];
              }
            }
          }
        }
      } else {
        const objectGroup = this.compactNestedGroup.groups[path];
        for (let i of [0, 1]) {
          let visible = false;
          for (let t in expandedTree) {
            for (let l in expandedTree[t]) {
              if (expandedTree[t][l][i] == 1) {
                visible = true;
              }
            }
          }
          if (i == 0) {
            objectGroup.setShapeVisible(visible);
          } else {
            objectGroup.setEdgesVisible(visible);
          }
          if (compactTree[i] != 3) {
            compactTree[i] = visible ? 1 : 0;
          }
        }
      }
    } else {
      for (var key in compactTree) {
        var id = `${path}/${key}`;
        this.syncTreeStates(compactTree[key], expandedTree[key], exploded, id);
      }
    }
  };

  /**
   * Get the color of a node from its path
   * @param path - path of the CAD object
   */
  getNodeColor = (path) => {
    var group = this.nestedGroup.groups["/" + path];
    if (group instanceof ObjectGroup) {
      let color = "";
      if (
        group.children[0].type !== "Mesh" ||
        group.children[0].material.name == "frontMaterial"
      ) {
        color = group.children[0].material.color;
      } else {
        color = group.children[1].material.color;
      }
      return "#" + color.getHexString();
    }
    return null;
  };

  /**
   * Toggle the two version of the NestedGroup
   * @param expanded - whether to render the exploded or compact version
   */
  toggleGroup(expanded) {
    var timer = new Timer("toggleGroup", this.state.get("timeit"));
    var _config = () => {
      this.nestedGroup.setTransparent(this.state.get("transparent"));
      this.nestedGroup.setBlackEdges(this.state.get("blackEdges"));
      this.nestedGroup.setMetalness(this.state.get("metalness"));
      this.nestedGroup.setRoughness(this.state.get("roughness"));
      this.nestedGroup.setPolygonOffset(2);
    };

    if (
      (this.compactNestedGroup == null && !expanded) ||
      (this.expandedNestedGroup == null && expanded)
    ) {
      this.setRenderDefaults(this.renderOptions);
      var result;
      if (expanded) {
        if (this.expandedNestedGroup == null) {
          result = this.renderTessellatedShapes(expanded, this.shapes);
          this.nestedGroup = result["group"];
          this.expandedNestedGroup = result["group"];
          _config();
          this.expandedTree = result["tree"];
        }
      } else {
        if (this.compactNestedGroup == null) {
          result = this.renderTessellatedShapes(expanded, this.shapes);
          this.nestedGroup = result["group"];
          this.compactNestedGroup = result["group"];
          _config();
          this.compactTree = result["tree"];
        }
      }
      timer.split(`rendered${expanded ? " exploded" : " compact"} shapes`);
    } else {
      this.nestedGroup = expanded
        ? this.expandedNestedGroup
        : this.compactNestedGroup;
      _config();
    }

    // only sync if both trees exist
    if (this.expandedTree) {
      this.syncTreeStates(this.compactTree, this.expandedTree, expanded, "");
    }
    timer.split("synched tree states");

    this.tree = expanded ? this.expandedTree : this.compactTree;
    this.scene.children[0] = this.nestedGroup.rootGroup;
    timer.split("added shapes to scene");

    deepDispose(this.treeview);
    this.treeview = new TreeView(
      this.tree,
      this.display.cadTreeScrollContainer,
      this.setObject,
      this.handlePick,
      this.update,
      this.notifyStates,
      this.getNodeColor,
      this.state.get("theme"),
      this.state.get("newTreeBehavior"),
      false,
    );

    this.display.clearCadTree();
    const t = this.treeview.create();
    timer.split("created tree");

    this.display.addCadTree(t);
    this.treeview.render();
    timer.split("rendered tree");
    timer.stop();
  }

  /**
   * Toggle tab and ensure collaps is treated correctly
   * Needs to be called in sync with toggleGroup!
   * @param boolean disable - true to disable clipping tab
   */
  toggleTab(disable) {
    var timer = new Timer("toggleTab", this.state.get("timeit"));
    this.state.set("activeTab", "tree");
    timer.split("collapse tree");
    switch (this.state.get("collapse")) {
      case 0:
        this.treeview.expandAll();
        break;
      case 1:
        this.treeview.openLevel(-1);
        break;
      case 2:
        this.treeview.collapseAll();
        break;

      case 3:
        this.treeview.openLevel(1);
        break;
      default:
        break;
    }
    this.checkChanges({ states: this.getStates() }, true);
    timer.split("notify state changes");
    timer.stop();
    this.display.toggleClippingTab(!disable);
  }

  /**
   * Render a CAD object and build the navigation tree
   * @param {Shapes} shapes - the Shapes object representing the tessellated CAD object
   * @param {RenderOptions} renderOptions - the render options
   * @param {ViewerOptions} viewerOptions - the viewer options
   */
  render(shapes, renderOptions, viewerOptions) {
    this.shapes = shapes;
    this.renderOptions = renderOptions;
    this.setViewerDefaults(viewerOptions);

    this.animation.cleanBackup();

    const timer = new Timer("viewer", this.state.get("timeit"));

    this.scene = new THREE.Scene();
    // this.orthographicScene = new THREE.Scene();

    //
    // add shapes and cad tree
    //

    this.toggleGroup(false);
    timer.split("scene and tree done");

    if (!this.bbox) {
      this.bbox = this.nestedGroup.boundingBox();
    }
    const center = new THREE.Vector3();
    this.bbox.getCenter(center);
    this.bb_max = this.bbox.max_dist_from_center();
    this.bb_radius = Math.max(
      this.bbox.boundingSphere().radius,
      center.length(),
    );
    timer.split("bounding box");

    //
    // add Info box
    //

    // Info is owned by Display

    //
    // create cameras
    //
    this.camera = new Camera(
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.bb_radius,
      viewerOptions.target == null ? this.bbox.center() : viewerOptions.target,
      this.state.get("ortho"),
      viewerOptions.up,
    );

    //
    // build mouse/touch controls
    //
    this.controls = new Controls(
      this.state.get("control"),
      this.camera.getCamera(),
      viewerOptions.target == null ? this.bbox.center() : viewerOptions.target,
      this.renderer.domElement,
      this.state.get("rotateSpeed"),
      this.state.get("zoomSpeed"),
      this.state.get("panSpeed"),
    );
    this.controls.enableKeys = false;

    // ensure panning works for screen coordinates
    this.controls.controls.screenSpacePanning = true;

    // this needs to happen after the controls have been established
    if (viewerOptions.position == null && viewerOptions.quaternion == null) {
      this.presetCamera("iso", this.state.get("zoom"));
      this.state.set("highlightedButton", "iso");
    } else if (viewerOptions.position != null) {
      this.setCamera(
        false,
        viewerOptions.position,
        viewerOptions.quaternion,
        this.state.get("zoom"),
      );
      if (viewerOptions.quaternion == null) {
        this.camera.lookAtTarget();
      }
    } else {
      this.display.addInfoHtml(
        "<b>quaternion needs position to be provided, falling back to ISO view</b>",
      );
      this.presetCamera("iso", this.state.get("zoom"));
    }
    this.controls.update();

    // Save the new state again
    this.controls.saveState();

    //
    // add lights
    //

    this.ambientLight = new THREE.AmbientLight(
      0xffffff,
      scaleLight(this.state.get("ambientIntensity")),
    );
    this.scene.add(this.ambientLight);

    // this.directLight = new THREE.PointLight(0xffffff, this.state.get("directIntensity"));
    this.directLight = new THREE.DirectionalLight(
      0xffffff,
      scaleLight(this.state.get("directIntensity")),
    );
    this.scene.add(this.directLight);

    this.setAmbientLight(this.state.get("ambientIntensity"));
    this.setDirectLight(this.state.get("directIntensity"));

    //
    // add grid helpers
    //

    this.gridHelper = new Grid({
      bbox: this.bbox,
      ticks: this.state.get("ticks"),
      gridFontSize: this.state.get("gridFontSize"),
      centerGrid: this.state.get("centerGrid"),
      axes0: this.state.get("axes0"),
      grid: [...this.state.get("grid")], // Copy to avoid shared reference with state
      flipY: viewerOptions.up == "Z",
      theme: this.state.get("theme"),
      cadWidth: this.state.get("cadWidth"),
      height: this.state.get("height"),
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      tickValueElement: this.display.tickValueElement,
      tickInfoElement: this.display.tickInfoElement,
      getCamera: () => this.camera?.getCamera() ?? null,
      isOrtho: () => this.state?.get("ortho") ?? true,
      getAxes0: () => this.state?.get("axes0") ?? false,
      // Grid state is set by setGrid/setGrids methods after gridHelper updates
    });
    this.gridHelper.computeGrid();

    this.scene.add(this.gridHelper);

    this.gridSize = this.gridHelper.size;

    //
    // add axes helper
    //

    this.axesHelper = new AxesHelper(
      this.bbox.center(),
      this.gridSize / 2,
      2,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.state.get("axes0"),
      this.state.get("axes"),
      this.state.get("theme"),
    );
    this.scene.add(this.axesHelper);

    // const geometry = new THREE.SphereGeometry(this.gridSize / 2, 32, 16);
    // const material = new THREE.MeshBasicMaterial({
    //   color: 0xffff00,
    //   opacity: 0.2,
    //   transparent: true,
    //   depthWrite: false,
    // });
    // const sphere = new THREE.Mesh(geometry, material);
    // const sgroup = new THREE.Group();
    // sgroup.add(sphere);
    // sgroup.position.set(...this.bbox.center());
    // this.scene.add(sgroup);

    //
    // set up clipping planes and helpers
    //
    const cSize =
      1.1 *
      Math.max(
        Math.abs(this.bbox.min.length()),
        Math.abs(this.bbox.max.length()),
      );
    this.clipping = new Clipping(
      this.bbox.center(),
      2 * cSize,
      this.nestedGroup,
      {
        onNormalChange: (index, normal) =>
          this.display.setNormalLabel(index, normal),
      },
      this.state.get("theme"),
    );

    this.display.setSliderLimits(this.gridSize / 2, this.bbox.center());

    this.setClipNormal(0, viewerOptions.clipNormal0, null, true);
    this.setClipNormal(1, viewerOptions.clipNormal1, null, true);
    this.setClipNormal(2, viewerOptions.clipNormal2, null, true);

    const clipSlider0 =
      viewerOptions.clipSlider0 != null
        ? viewerOptions.clipSlider0
        : this.gridSize / 2;
    const clipSlider1 =
      viewerOptions.clipSlider1 != null
        ? viewerOptions.clipSlider1
        : this.gridSize / 2;
    const clipSlider2 =
      viewerOptions.clipSlider2 != null
        ? viewerOptions.clipSlider2
        : this.gridSize / 2;

    this.setClipSlider(0, clipSlider0, true);
    this.setClipSlider(1, clipSlider1, true);
    this.setClipSlider(2, clipSlider2, true);

    this.setClipIntersection(viewerOptions.clipIntersection, true);
    this.setClipObjectColorCaps(viewerOptions.clipObjectColors, true);
    // Clip plane helpers checkbox is synced via subscription with immediate:true

    this.scene.add(this.clipping);
    this.nestedGroup.setClipPlanes(this.clipping.clipPlanes);

    this.setLocalClipping(false); // only allow clipping when Clipping tab is selected

    this.clipping.setVisible(false);

    this.toggleTab(false);

    // Material sliders are synced via subscriptions with immediate:true

    const theme =
      this.state.get("theme") === "dark" ||
      (this.state.get("theme") === "browser" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";

    //
    // set up the orientation marker
    //

    this.orientationMarker = new OrientationMarker(
      80,
      80,
      this.camera.getCamera(),
      theme,
    );
    this.orientationMarker.create();

    //
    // update UI elements
    //

    this.display.updateUI();
    timer.split("ui updated");
    this.display.autoCollapse();

    timer.split("stencil done");
    //
    // show the rendering
    //

    this.toggleAnimationLoop(this.hasAnimationLoop);

    this.ready = true;
    this.display.showReadyMessage(version, this.state.get("control"));

    //
    // notify calculated results
    //
    timer.split("show done");
    if (this.notifyCallback) {
      this.notifyCallback({
        tab: { old: null, new: this.state.get("activeTab") },
        target: { old: null, new: this.controls.target },
        target0: { old: null, new: this.controls.target0 },
        clip_normal_0: { old: null, new: this.clipNormal0 },
        clip_normal_1: { old: null, new: this.clipNormal1 },
        clip_normal_2: { old: null, new: this.clipNormal2 },
      });
    }
    timer.split("notification done");

    this.update(true, false);
    this.treeview.update();
    this.display.setTheme(this.state.get("theme"));

    this.setZebraCount(this.state.get("zebraCount"));
    this.setZebraDirection(this.state.get("zebraDirection"));
    this.setZebraOpacity(this.state.get("zebraOpacity"));
    this.setZebraColorScheme(this.state.get("zebraColorScheme"));
    this.setZebraMappingMode(this.state.get("zebraMappingMode"));

    timer.split("update done");
    timer.stop();
  }

  // ---------------------------------------------------------------------------
  // Camera Controls
  // ---------------------------------------------------------------------------

  /**
   * Move the camera to a given locations
   * @function
   * @param {relative} [relative=false] - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {number[]} position - the camera position as 3 dim array [x,y,z]
   * @param {number[]} [quaternion=null] - the camera rotation expressed by a quaternion array [x,y,z,w].
   * @param {number} [zoom=null] - zoom value.
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setCamera = (
    relative,
    position,
    quaternion = null,
    zoom = null,
    notify = true,
  ) => {
    this.camera.setupCamera(
      relative,
      new THREE.Vector3(...position),
      quaternion != null ? new THREE.Quaternion(...quaternion) : null,
      zoom,
      notify,
    );
    this.update(true, notify);
  };

  /**
   * Move the camera to one of the preset locations
   * @function
   * @param {string} dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   * @param {number} [zoom=null] - zoom value
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  presetCamera = (dir, zoom = null, notify = true) => {
    this.camera.target = new THREE.Vector3(...this.bbox.center());
    this.camera.presetCamera(dir, zoom, notify);
    this.controls.setTarget(this.camera.target);
    this.update(true, notify);
  };

  /**
   * Get reset location value.
   * @function
   * @returns {object} - target, position, quaternion, zoom as object.
   */
  getResetLocation = () => {
    const location = this.controls.getResetLocation();
    return {
      target0: location.target0.toArray(),
      position0: location.position0.toArray(),
      quaternion0: location.quaternion0.toArray(),
      zoom0: location.zoom0,
    };
  };

  /**
   * Set reset location value.
   * @function
   * @param {number[]} target - camera target as 3 dim Array [x,y,z].
   * @param {number[]} position - camera position as 3 dim Array [x,y,z].
   * @param {number[]} quaternion - camera rotation as 4 dim quaternion array [x,y,z,w].
   * @param {number} zoom - camera zoom value.
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setResetLocation = (target, position, quaternion, zoom, notify = true) => {
    var location = this.getResetLocation();
    this.controls.setResetLocation(
      new THREE.Vector3(...target),
      new THREE.Vector3(...position),
      new THREE.Vector4(...quaternion),
      zoom,
    );
    if (notify && this.notifyCallback) {
      this.notifyCallback({
        target0: { old: location.target0, new: target },
        position0: { old: location.position0, new: position },
        quaternion0: { old: location.quaternion0, new: quaternion },
        zoom0: { old: location.zoom0, new: zoom },
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Camera Type & Projection
  // ---------------------------------------------------------------------------

  /**
   * Get camera type.
   * @returns {string} "ortho" or "perspective".
   **/
  getCameraType() {
    return this.camera.ortho ? "ortho" : "perspective";
  }

  /**
   * Set camera mode to OrthographicCamera or PersepctiveCamera (see also setOrtho)
   * @param {boolean} flag - whether the camery should be orthographic or persepctive
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  switchCamera(flag, notify = true) {
    this.state.set("ortho", flag);
    this.camera.switchCamera(flag, notify);
    this.controls.setCamera(this.camera.getCamera());

    this.checkChanges({ ortho: flag }, notify);

    this.gridHelper.scaleLabels();
    this.gridHelper.update(this.camera.getZoom(), true);

    this.update(true, notify);
  }

  /**
   * TODO: Doesn't work as expected. Needs to be fixed.
   *
   * Set camera mode to OrthographicCamera or PersepctiveCamera (see also setOrtho)
   * @param {number} distance - if provided, new camera distance
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  recenterCamera(notify = true) {
    const camera = this.camera.getCamera();

    const center = new THREE.Vector3();
    const c = this.bbox.center();
    center.fromArray(c);

    const target = new THREE.Vector3();
    const t = this.controls.target;
    target.fromArray(t);

    this.camera.camera_distance = 5 * this.bb_radius;
    camera.position.sub(target).add(center);
    this.controls.controls.target = center;

    let cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    let p = center
      .clone()
      .add(cameraDir.normalize().multiplyScalar(-this.camera.camera_distance));
    camera.position.set(p.x, p.y, p.z);

    this.update(true, notify);
  }

  /**
   * Centers the camera view on all visible objects in the scene.
   * Calculates a bounding box that encompasses all visible ObjectGroup instances
   * and sets the camera target to the center of that bounding box.
   *
   * @param {boolean} [notify=true] - Whether to notify listeners of the camera update
   */
  centerVisibleObjects(notify = true) {
    const groups = this.nestedGroup.groups;

    var bbox = new BoundingBox();
    for (var path in groups) {
      var obj = groups[path];
      if (obj instanceof ObjectGroup) {
        if (obj.getVisibility()) {
          console.log(path);
          bbox.expandByObject(obj);
        }
      }
    }
    const target = new THREE.Vector3(...bbox.center());
    this.setCameraTarget(target);
    this.update(true, notify);
  }

  /**
   * Reset zoom to 1.0
   * @function
   */
  resize = () => {
    this.camera.setZoom(1.0);
    this.camera.updateProjectionMatrix();
    this.update(true);
  };

  /**
   * Reset the view to the initial camera and controls settings
   * @function
   */
  reset = () => {
    this.controls.reset();
    this.update(true);
  };

  /**
   * Enbable/disable local clipping
   * @param {boolean} flag - whether to enable local clipping
   */
  setLocalClipping(flag) {
    this.renderer.localClippingEnabled = flag;
    this.update(this.updateMarker);
  }

  // ---------------------------------------------------------------------------
  // Object Visibility & Bounding Box
  // ---------------------------------------------------------------------------

  /**
   * Sets the visibility state of an object in the viewer.
   *
   * @param {string} path - The path of the object.
   * @param {number} state - The visibility state (0 or 1).
   * @param {number} iconNumber - The icon number.
   * @param {boolean} [notify=true] - Whether to notify the changes.
   */
  setObject = (path, state, iconNumber, notify = true, update = true) => {
    var objectGroup = this.nestedGroup.groups[path];
    if (objectGroup != null && objectGroup instanceof ObjectGroup) {
      if (iconNumber == 0) {
        objectGroup.setShapeVisible(state === 1);
      } else {
        objectGroup.setEdgesVisible(state === 1);
      }
      if (notify) {
        const state = {};
        state[path] = this.getState(path);
      }
      if (update) {
        this.update(this.updateMarker);
      }
    }
  };

  /**
   * Sets the bounding box for a given ID.
   * @param {string} id - The ID of the group.
   */
  setBoundingBox = (id) => {
    var group = this.nestedGroup.groups[id];
    if (group != null) {
      if (this.lastBbox != null) {
        this.scene.remove(this.lastBbox.bbox);
        this.lastBbox.bbox.geometry.dispose();
        this.lastBbox.bbox.material.dispose();
      }
      if (
        this.lastBbox == null ||
        (this.lastBbox != null && id != this.lastBbox.id)
      ) {
        this.lastBbox = {
          id: id,
          bbox: new BoxHelper(group, 0xff00ff),
          needsUpdate: false,
        };
        this.scene.add(this.lastBbox.bbox);
      } else {
        this.lastBbox = null;
      }

      this.update(false, false, false);
    }
  };

  /**
   * Refresh clipping plane
   * @function
   * @param {number} index - index of the plane: 0,1,2
   * @param {number} value - distance on the clipping normal from the center
   */
  refreshPlane = (index, value) => {
    this.state.set(`clipSlider${index}`, value);
    this.clipping.setConstant(index, value);
    this.update(this.updateMarker);
  };

  /**
   * Backup animation (for switch to explode animation)
   */
  backupAnimation() {
    if (this.animation.hasTracks()) {
      this.backupTracks = this.animation.backup();
    }
  }

  /**
   * Restore animation (for switch back from explode animation)
   */
  restoreAnimation() {
    if (this.animation.hasBackup()) {
      var params = this.animation.restore();
      this.initAnimation(params.duration, params.speed, "A", params.repeat);
    }
  }

  /**
   * Handler for the animation control
   * @function
   * @param {string} btn - the pressed button as string: "play", "pause", "stop"
   */
  controlAnimation = (btn) => {
    switch (btn) {
      case "play":
        if (this.clipAction.paused) {
          this.clipAction.paused = false;
        }
        this.clipAction.play();
        break;
      case "pause":
        this.clipAction.paused = !this.clipAction.paused;
        break;
      case "stop":
        this.clipAction.stop();
        break;
    }
  };

  /**
   * Set state of one entry of a treeview leaf given by an id
   * @function
   * @param {string} id - object id
   * @param {number[]} state - 2 dim array [mesh, edges] = [0/1, 0/1]
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  // eslint-disable-next-line no-unused-vars
  setState = (id, state, _nodeType = "leaf", notify = true) => {
    this.treeview.setState(id, state);
    this.update(this.updateMarker, notify);
  };

  removeLastBbox() {
    if (this.lastBbox != null) {
      this.scene.remove(this.lastBbox.bbox);
      this.lastBbox.bbox.geometry.dispose();
      this.lastBbox.bbox.material.dispose();
      this.lastBbox = null;
    }
  }

  /**
   * Handle bounding box and notifications for picked elements
   * @function
   * @param {string} - path of object
   * @param {string} - name of object (id = path/name)
   * @param {boolean} - meta key pressed
   * @param {boolean} shift - whether to send notification or not.
   */
  handlePick = (
    path,
    name,
    meta,
    shift,
    alt,
    point,
    nodeType = "leaf",
    tree,
  ) => {
    const id = `${path}/${name}`;
    const object = this.nestedGroup.groups[id];
    if (object == null) {
      return;
    }
    var boundingBox;
    if (object.parent != null) {
      boundingBox = new BoundingBox().setFromObject(object, true);
    } else {
      // ignore PlaneMesh group
      boundingBox = new BoundingBox();
      for (var i = 0; i < object.children.length - 1; i++) {
        boundingBox = boundingBox.expandByObject(object.children[i]);
      }
    }

    if (this.lastBbox != null && this.lastBbox.id === id && !meta && !shift) {
      this.removeLastBbox();
      this.treeview.toggleLabelColor(null, id);
    } else {
      this.checkChanges({
        lastPick: {
          path: path,
          name: name,
          boundingBox: boundingBox,
          boundingSphere: boundingBox.boundingSphere(),
        },
      });

      if (this.animation.clipAction?.isRunning()) {
        this.bboxNeedsUpdate = true;
      }

      if (shift && meta) {
        this.removeLastBbox();
        if (tree) {
          this.treeview.hideAll();
          this.setState(id, [1, 1], nodeType);
        } else {
          // this.treeview.openPath(id);
          // this.presetCamera("iso");
          const center = boundingBox.center();
          this.setCameraTarget(point);
          this.display.showCenterInfo(center);
        }
      } else if (shift) {
        this.removeLastBbox();
        this.treeview.hideAll();
        this.setState(id, [1, 1], nodeType);
        const center = boundingBox.center();
        // this.treeview.openPath(id);
        this.setCameraTarget(new THREE.Vector3(...center));
        this.display.showCenterInfo(center);
      } else if (meta) {
        this.setState(id, [0, 0], nodeType);
      } else {
        this.display.showBoundingBoxInfo(path, name, boundingBox);
        this.setBoundingBox(id);
        this.treeview.openPath(id);
      }
    }
    this.update(true);
  };

  // ---------------------------------------------------------------------------
  // Object Picking & Selection
  // ---------------------------------------------------------------------------

  setPickHandler(flag) {
    if (flag) {
      this.renderer.domElement.addEventListener("dblclick", this.pick, false);
    } else {
      this.renderer.domElement.removeEventListener(
        "dblclick",
        this.pick,
        false,
      );
    }
  }

  /**
   * Find the shape that was double clicked and send notification
   * @function
   * @param {MouseEvent} e - a DOM MouseEvent
   */
  pick = (e) => {
    const raycaster = new Raycaster(
      this.camera,
      this.renderer.domElement,
      this.state.get("cadWidth"),
      this.state.get("height"),
      this.bb_max / 30,
      this.scene.children.slice(0, 1),
      // eslint-disable-next-line no-unused-vars
      (ev) => {},
    );
    raycaster.init();
    raycaster.onPointerMove(e);

    const validObjs = raycaster.getIntersectedObjs(e);
    if (validObjs.length == 0) {
      return;
    }

    let nearestObj = null;
    for (var ind in validObjs) {
      const obj = validObjs[ind];
      if (obj.object instanceof THREE.Mesh) {
        nearestObj = validObjs[ind];
        break;
      }
    }
    if (nearestObj == null) {
      return;
    }
    // }
    const point = nearestObj.point;
    const nearest = {
      path: nearestObj.object.parent.parent.name.replaceAll("|", "/"),
      name: nearestObj.object.name,
      boundingBox:
        this.shapes.format == "GDS"
          ? new THREE.Box3(
              point.clone().subScalar(10),
              point.clone().addScalar(10),
            )
          : nearestObj.object.geometry.boundingBox,
      boundingSphere:
        this.shapes.format == "GDS"
          ? new THREE.Sphere(point, 1)
          : nearestObj.object.geometry.boundingSphere,
      objectGroup: nearestObj.object.parent,
    };
    if (nearest != null) {
      this.handlePick(
        nearest.path,
        nearest.name,
        KeyMapper.get(e, "meta"),
        KeyMapper.get(e, "shift"),
        KeyMapper.get(e, "alt"),
        nearestObj.point,
        null,
        false,
      );
    }
    raycaster.dispose();
  };

  // ---------------------------------------------------------------------------
  // CAD Tools & Raycasting
  // ---------------------------------------------------------------------------

  clearSelection = () => {
    this.nestedGroup.clearSelection();
    this.cadTools.handleResetSelection();
  };

  _releaseLastSelected = () => {
    if (this.lastObject != null) {
      let objs = this.lastObject.objs();
      for (let obj of objs) {
        obj.unhighlight(true);
      }
    }
  };

  _removeLastSelected = () => {
    if (this.lastSelection != null) {
      let objs = this.lastSelection.objs();
      for (let obj of objs) {
        obj.unhighlight(false);
        this.treeview.toggleLabelColor(
          null,
          obj.name.replaceAll(this.nestedGroup.delim, "/"),
        );
      }
      this.lastSelection = null;
      this.lastObject = null;
    }
    this.cadTools.handleRemoveLastSelection(true);
  };

  /**
   * Set raycast mode
   * @function
   * @param {boolean} flag - turn raycast mode on or off
   */
  setRaycastMode(flag) {
    if (flag) {
      // initiate raycasting
      this.raycaster = new Raycaster(
        this.camera,
        this.renderer.domElement,
        this.state.get("cadWidth"),
        this.state.get("height"),
        this.bb_max / 30,
        this.scene.children.slice(0, 1),
        this.handleRaycastEvent,
      );
      this.raycaster.init();
    } else {
      if (this.raycaster) {
        this.raycaster.dispose();
      }
      this.raycaster = null;
    }
  }

  handleRaycast = () => {
    const objects = this.raycaster.getValidIntersectedObjs();
    if (objects.length > 0) {
      // highlight hovered object(s)
      for (var object of objects) {
        {
          const objectGroup = object.object.parent;
          var name = objectGroup ? objectGroup.name : null;
          var last_name = this.lastObject ? this.lastObject.obj.name : null;
          if (name != null && name !== last_name) {
            this._releaseLastSelected();
            const fromSolid = this.raycaster.filters.topoFilter.includes(
              TopoFilter.solid,
            );

            // one object for a selected vertex, edge and face and multiple faces for a solid
            const pickedObj = new PickedObject(objectGroup, fromSolid);
            for (let obj of pickedObj.objs()) {
              obj.highlight(true);
            }
            // this object will be handled in handleRaycastEvent after a mouse event
            this.lastObject = pickedObj;
          }
          break;
        }
      }
    } else {
      // unhighlight hovered object(s)
      if (this.lastObject != null) {
        this._releaseLastSelected();
        this.lastObject = null;
      }
    }
  };

  handleRaycastEvent = (event) => {
    if (event.key) {
      switch (event.key) {
        case "Escape":
          this.clearSelection();
          break;
        case "Backspace":
          this._removeLastSelected();
          break;
        default:
          break;
      }
    } else {
      switch (event.mouse) {
        case "left":
          if (this.lastObject != null) {
            const objs = this.lastObject.objs();
            // one object for a selected vertex, edge and face and multiple faces for a solid
            for (let obj of objs) {
              obj.toggleSelection();
            }
            this.cadTools.handleSelectedObj(
              this.lastObject,
              this.lastSelection?.obj.name != this.lastObject.obj.name,
              event.shift,
            );
            this.lastSelection = this.lastObject;
          }
          break;
        case "right":
          this._removeLastSelected();
          break;
        default:
          break;
      }
    }
  };

  /**
   * Handle a backend response sent by the backend
   * The response is a JSON object sent by the Python backend through VSCode
   * @param {object} response
   */
  handleBackendResponse = (response) => {
    if (response.subtype === "tool_response") {
      this.cadTools.handleResponse(response);
    }
  };

  // ---------------------------------------------------------------------------
  // Appearance (Axes, Grid, Visual Settings)
  // ---------------------------------------------------------------------------

  /**
   * Get whether axes helpers are shon/hidden.
   * @returns {boolean} axes value.
   **/
  getAxes() {
    return this.state.get("axes");
  }

  /**
   * Show/hide axes helper
   * @function
   * @param {boolean} flag - whether to show the axes
   * @param {boolean} notify - whether to send notification or not.
   */
  setAxes = (flag, notify = true) => {
    this.state.set("axes", flag);
    this.axesHelper.setVisible(flag);

    this.checkChanges({ axes: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Show/hide grids
   * @function
   * @param {string} action -  one of "grid" (all grids), "grid-xy","grid-xz", "grid-yz"
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setGrid = (action, flag, notify = true) => {
    this.gridHelper.setGrid(action, flag);
    // Copy array to avoid reference comparison issues in state.set
    this.state.set("grid", [...this.gridHelper.grid]);

    this.checkChanges({ grid: this.gridHelper.grid }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Get visibility of grids.
   * @returns {number[]} grids value.
   **/
  getGrids() {
    return this.state.get("grid");
  }

  /**
   * Toggle grid visibility
   * @function
   * @param {boolean[]} grids - 3 dim grid visibility (xy, xz, yz)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setGrids = (grids, notify = true) => {
    this.gridHelper.setGrids(...grids);
    // Copy array to avoid reference comparison issues in state.set
    this.state.set("grid", [...this.gridHelper.grid]);

    this.checkChanges({ grid: this.gridHelper.grid }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Set grid center
   * @function
   * @param {boolean[]} center - true for centering grid at (0,0,0)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setGridCenter = (center, notify = true) => {
    this.gridHelper.centerGrid = center;
    this.gridHelper.setCenter(
      this.state.get("axes0"),
      this.state.get("up") == "Z",
    );

    this.checkChanges({ center_grid: this.gridHelper.centerGrid }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Get location of axes.
   * @returns {boolean} axes0 value, true means at origin (0,0,0)
   **/
  getAxes0() {
    return this.state.get("axes0");
  }

  /**
   * Set whether grids and axes center at the origin or the object's boundary box center
   * @function
   * @param {boolean} flag - whether grids and axes center at the origin (0,0,0)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setAxes0 = (flag, notify = true) => {
    this.state.set("axes0", flag);
    this.gridHelper.setCenter(flag, this.state.get("up") == "Z");
    this.axesHelper.setCenter(flag);

    this.checkChanges({ axes0: flag }, notify);

    this.update(this.updateMarker);
  };
  /**
   * Get transparency state of CAD objects.
   * @returns {boolean} transparent value.
   **/
  getTransparent() {
    return this.state.get("transparent");
  }

  /**
   * Set CAD objects transparency
   * @function
   * @param {boolean} flag - whether to show the CAD object in transparent mode
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setTransparent = (flag, notify = true) => {
    this.state.set("transparent", flag);
    this.nestedGroup.setTransparent(flag);

    this.checkChanges({ transparent: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Get blackEdges value.
   * @returns {boolean} blackEdges value.
   **/
  getBlackEdges() {
    return this.state.get("blackEdges");
  }

  /**
   * Show edges in black or the default edge color
   * @function
   * @param {boolean} flag - whether to show edges in black
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setBlackEdges = (flag, notify = true) => {
    this.state.set("blackEdges", flag);
    this.nestedGroup.setBlackEdges(flag);

    this.checkChanges({ black_edges: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Show or hide the CAD tools panel
   * @function
   * @param {boolean} flag - whether to show tools
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setTools = (flag, notify = true) => {
    this.state.set("tools", flag);
    this.checkChanges({ tools: flag }, notify);
  };

  /**
   * Enable or disable glass mode (overlay navigation)
   * @function
   * @param {boolean} flag - whether to enable glass mode
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setGlass = (flag, notify = true) => {
    this.state.set("glass", flag);
    this.checkChanges({ glass: flag }, notify);
  };

  /**
   * Get default color of the edges.
   * @returns {number} edgeColor value.
   **/
  getEdgeColor() {
    return this.state.get("edgeColor");
  }

  /**
   * Set the default edge color
   * @function
   * @param {number} edge color (0xrrggbb)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setEdgeColor = (color, notify = true) => {
    this.state.set("edgeColor", color);
    this.nestedGroup.setEdgeColor(color);
    this.update(this.updateMarker, notify);
  };

  /**
   * Get default opacity.
   * @returns {number} opacity value.
   **/
  getOpacity() {
    return this.state.get("defaultOpacity");
  }

  /**
   * Set the default opacity
   * @function
   * @param {number} opacity (between 0.0 and 1.0)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setOpacity = (opacity, notify = true) => {
    this.state.set("defaultOpacity", opacity);
    this.nestedGroup.setOpacity(opacity);
    this.update(this.updateMarker, notify);
  };

  /**
   * Get whether tools are shown/hidden.
   * @returns {boolean} tools value.
   **/
  getTools() {
    return this.state.get("tools");
  }

  /**
   * Show/hide the CAD tools
   * @function
   * @param {boolean} flag
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  showTools = (flag, notify = true) => {
    this.state.set("tools", flag);
    this.update(this.updateMarker, notify);
  };

  // ---------------------------------------------------------------------------
  // Getters & Setters: Lighting & Materials
  // ---------------------------------------------------------------------------

  /**
   * Get intensity of ambient light.
   * @returns {number} ambientLight value.
   **/
  getAmbientLight() {
    return this.state.get("ambientIntensity");
  }

  /**
   * Set the intensity of ambient light
   * @function
   * @param {number} val - the new ambient light intensity
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setAmbientLight = (val, notify = true) => {
    val = Math.max(0, Math.min(4, val));
    this.state.set("ambientIntensity", val);
    this.ambientLight.intensity = scaleLight(val);
    this.checkChanges({ ambient_intensity: val }, notify);
    this.update(this.updateMarker, notify);
  };

  /**
   * Get intensity of direct light.
   * @returns {number} directLight value.
   **/
  getDirectLight() {
    return this.state.get("directIntensity");
  }
  /**
   * Set the intensity of directional light
   * @function
   * @param {number} val - the new direct light intensity
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setDirectLight = (val, notify = true) => {
    val = Math.max(0, Math.min(4, val));
    this.state.set("directIntensity", val);
    this.directLight.intensity = scaleLight(val);
    this.checkChanges({ direct_intensity: val }, notify);
    this.update(this.updateMarker, notify);
  };

  /**
   * Retrieves the metalness value.
   *
   * @returns {number} The current metalness value.
   */
  getMetalness = () => {
    return this.state.get("metalness");
  };

  /**
   * Sets the metalness value for the viewer and updates related properties.
   *
   * @param {number} value - The metalness value to set.
   * @param {boolean} [notify=true] - Whether to notify about the changes.
   */
  setMetalness = (value, notify = true) => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("metalness", value);
    this.nestedGroup.setMetalness(value);
    this.checkChanges({ metalness: value }, notify);
    this.update(this.updateMarker);
  };

  /**
   * Retrieves the roughness value.
   *
   * @returns {number} The current roughness value.
   */
  getRoughness = () => {
    return this.state.get("roughness");
  };

  /**
   * Sets the roughness value for the viewer and updates related components.
   *
   * @param {number} value - The roughness value to set.
   * @param {boolean} [notify=true] - Whether to notify about the changes.
   */
  setRoughness = (value, notify = true) => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("roughness", value);
    this.nestedGroup.setRoughness(value);
    this.checkChanges({ roughness: value }, notify);
    this.update(this.updateMarker);
  };

  /**
   * Resets the material settings of the viewer to their default values.
   * Updates the metalness, roughness, ambient light intensity, and direct light intensity
   * based on the current material settings.
   *
   * @returns {void}
   */
  resetMaterial = () => {
    this.setMetalness(this.materialSettings.metalness, true);
    this.setRoughness(this.materialSettings.roughness, true);
    this.setAmbientLight(this.materialSettings.ambientIntensity, true);
    this.setDirectLight(this.materialSettings.directIntensity, true);
  };

  // ---------------------------------------------------------------------------
  // Getters & Setters: Zebra Tool
  // ---------------------------------------------------------------------------

  enableZebraTool = (flag) => {
    this.nestedGroup.setZebra(flag);
    this.update(true, true);
    this.treeview.update();
  };

  /**
   * Sets the stripe count value for the viewer and updates related components.
   * @param {number} value - The stripe count value to set.
   */
  setZebraCount = (value) => {
    value = Math.max(2, Math.min(50, value));
    this.state.set("zebraCount", value);
    this.nestedGroup.setZebraCount(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe opacity value for the viewer and updates related components.
   * @param {number} value - The stripe opacity value to set.
   */
  setZebraOpacity = (value) => {
    value = Math.max(0, Math.min(1, value));
    this.state.set("zebraOpacity", value);
    this.nestedGroup.setZebraOpacity(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe direction value for the viewer and updates related components.
   * @param {number} value - The stripe direction value to set.
   */
  setZebraDirection = (value) => {
    value = Math.max(0, Math.min(90, value));
    this.state.set("zebraDirection", value);
    this.nestedGroup.setZebraDirection(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe color scheme for the viewer and updates related components.
   * @param {string} value - The color scheme ("blackwhite", "colorful", "grayscale").
   */
  setZebraColorScheme = (value) => {
    this.state.set("zebraColorScheme", value);
    this.nestedGroup.setZebraColorScheme(value);
    this.update(this.updateMarker);
  };

  /**
   * Sets the stripe mapping mode for the viewer and updates related components.
   * @param {string} value - The mapping mode ("reflection", "normal").
   */
  setZebraMappingMode = (value) => {
    this.state.set("zebraMappingMode", value);
    this.nestedGroup.setZebraMappingMode(value);
    this.update(this.updateMarker);
  };

  // ---------------------------------------------------------------------------
  // Camera State Getters & Setters
  // ---------------------------------------------------------------------------

  /**
   * Get ortho value.
   * @returns {number} ortho value.
   **/
  getOrtho() {
    return this.camera.ortho;
  }

  /**
   * Set/unset camera's orthographic mode.
   * @param {boolean} whether to set orthographic mode or not.
   **/
  setOrtho(flag, notify = true) {
    this.switchCamera(flag, notify);
  }

  /**
   * Set zscaling value.
   * @param {number} scale factor.
   **/
  setZscaleValue(value) {
    this.nestedGroup.setZScale(value);
    this.zScale = value;
    this.update(true);
  }
  /**
   * Get zoom value.
   * @returns {number} zoom value.
   **/
  getCameraZoom() {
    return this.camera.getZoom();
  }

  /**
   * Set zoom value.
   * @param {number} val - float zoom value.
   * @param {boolean} [notify=true] - whether to send notification or not.
   **/
  setCameraZoom(val, notify = true) {
    this.camera.setZoom(val);
    this.controls.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera position.
   * @returns {number[]} camera position as 3 dim array [x,y,z].
   **/
  getCameraPosition() {
    return this.camera.getPosition().toArray();
  }

  /**
   * Set camera position.
   * @param {number[]} position - camera position as 3 dim Array [x,y,z].
   * @param {relative} [relative=false] - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {boolean} [notify=true] - whether to send notification or not.
   **/
  setCameraPosition(position, relative = false, notify = true) {
    this.camera.setPosition(position, relative);
    this.controls.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera rotation as quaternion.
   * @returns {number[]} camera rotation as 4 dim quaternion array [x,y,z,w].
   **/
  getCameraQuaternion() {
    return this.camera.getQuaternion().toArray();
  }

  /**
   * Set camera rotation via quaternion.
   * @param {number[]} quaternion - camera rotation as 4 dim quaternion array [x,y,z,w].
   * @param {boolean} [notify=true] - whether to send notification or not.
   **/
  setCameraQuaternion(quaternion, notify = true) {
    this.camera.setQuaternion(quaternion);
    this.controls.update();
    this.update(true, notify);
  }

  /**
   * Get the current camera target.
   * @returns {number[]} camera target as 3 dim array array [x,y,z].
   **/
  getCameraTarget() {
    return this.controls.getTarget().toArray();
  }

  /**
   * Set camera target.
   * @param {number[]} target - camera target as 3 dim quaternion array [x,y,z].
   * @param {boolean} [notify=true] - whether to send notification or not.
   **/
  setCameraTarget(target, notify = true) {
    // Store current state
    const camera = this.camera.getCamera();
    const zoom = camera.zoom; // For orthographic cameras

    const offset = camera.position.clone().sub(this.controls.getTarget());

    // Update position and target
    camera.position.copy(target.clone().add(offset));
    camera.updateWorldMatrix(true, false);
    this.controls.getTarget().copy(target);

    // Preserve zoom for orthographic cameras
    if (camera.type === "OrthographicCamera") {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }

    // Update controls
    this.controls.update();
    this.update(true, notify);
  }

  getCameraLocationSettings() {
    return {
      position: this.getCameraPosition(),
      quaternion: this.getCameraQuaternion(),
      target: this.getCameraTarget(),
      zoom: this.getCameraZoom(),
    };
  }

  setCameraLocationSettings(
    position = null,
    quaternion = null,
    target = null,
    zoom = null,
    notify = true,
  ) {
    if (position != null) {
      this.camera.setPosition(position, false);
    }
    if (quaternion != null && this.state.get("control") === "trackball") {
      this.camera.setQuaternion(quaternion);
    }
    if (target != null) {
      this.controls.setTarget(new THREE.Vector3(...target));
    }
    if (zoom != null) {
      this.camera.setZoom(zoom);
    }
    this.controls.update();
    this.update(true, notify);
  }

  // ---------------------------------------------------------------------------
  // Tree State Management
  // ---------------------------------------------------------------------------

  /**
   * Get states of a treeview leafs.
   **/
  getStates() {
    return this.treeview.getStates();
  }

  /**
   * Get state of a treeview leafs for a path.
   * separator can be / or |
   * @param {string} path - path of the object
   * @returns {number[]} state value in the form of [mesh, edges] = [0/1, 0/1]
   **/
  getState(path) {
    var p = path.replaceAll("|", "/");
    return this.treeview.getState(p);
  }

  /**
   * Set states of a treeview leafs
   * @function
   * @param {dict} - states
   */
  setStates = (states) => {
    this.treeview.setStates(states);
  };

  // ---------------------------------------------------------------------------
  // UI sensitivity
  // ---------------------------------------------------------------------------

  /**
   * Get zoom speed.
   * @returns {number} zoomSpeed value.
   **/
  getZoomSpeed() {
    return this.state.get("zoomSpeed");
  }

  /**
   * Set zoom speed.
   * @function
   * @param {number} val - the new zoom speed
   * @param {boolean} notify - whether to send notification or not.
   */
  setZoomSpeed = (val, notify = true) => {
    this.state.set("zoomSpeed", val);
    this.controls.setZoomSpeed(val);
    this.checkChanges({ grid: this.gridHelper.grid }, notify);
  };

  /**
   * Get panning speed.
   * @returns {number} pan speed value.
   **/
  getPanSpeed() {
    return this.state.get("panSpeed");
  }

  /**
   * Set pan speed.
   * @function
   * @param {number} val - the new pan speed
   * @param {boolean} notify - whether to send notification or not.
   */
  setPanSpeed = (val, notify = true) => {
    this.state.set("panSpeed", val);
    this.controls.setPanSpeed(val);
    this.checkChanges({ grid: this.gridHelper.grid }, notify);
  };

  /**
   * Get rotation speed.
   * @returns {number} rotation speed value.
   **/
  getRotateSpeed() {
    return this.state.get("rotateSpeed");
  }

  /**
   * Set rotation speed.
   * @function
   * @param {number} val - the new rotation speed.
   * @param {boolean} notify - whether to send notification or not.
   */
  setRotateSpeed = (val, notify = true) => {
    this.state.set("rotateSpeed", val);
    this.controls.setRotateSpeed(val);
    this.checkChanges({ grid: this.gridHelper.grid }, notify);
  };

  // ---------------------------------------------------------------------------
  // Clipping Planes
  // ---------------------------------------------------------------------------

  /**
   * Get intersection mode.
   * @returns {boolean} clip intersection value.
   **/
  getClipIntersection() {
    return this.state.get("clipIntersection");
  }

  /**
   * Set the clipping mode to intersection mode
   * @function
   * @param {boolean} flag - whether to use intersection mode
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipIntersection = (flag, notify = true) => {
    if (flag == null) return;

    this.state.set("clipIntersection", flag);
    this.nestedGroup.setClipIntersection(flag);

    for (var child of this.nestedGroup.rootGroup.children) {
      if (child.name == "PlaneMeshes") {
        for (var capPlane of child.children) {
          if (flag) {
            capPlane.material.clippingPlanes =
              this.clipping.reverseClipPlanes.filter(
                (_, j) => j !== capPlane.index,
              );
          } else {
            capPlane.material.clippingPlanes = this.clipping.clipPlanes.filter(
              (_, j) => j !== capPlane.index,
            );
          }
        }
      }
    }

    for (child of this.scene.children) {
      if (child.name == "PlaneHelpers") {
        for (var helper of child.children[0].children) {
          if (flag) {
            helper.material.clippingPlanes =
              this.clipping.reverseClipPlanes.filter(
                (_, j) => j !== helper.index,
              );
          } else {
            helper.material.clippingPlanes = this.clipping.clipPlanes.filter(
              (_, j) => j !== helper.index,
            );
          }
        }
      }
    }

    this.checkChanges({ clip_intersection: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Get whether the clipping caps color status
   * @returns {boolean} color caps value (object color (true) or RGB (false)).
   */
  getObjectColorCaps = () => {
    return this.clipping.getObjectColorCaps();
  };

  /**
   * Toggle the clipping caps color between object color and RGB
   * @function
   * @param {boolean} flag - whether to use intersection mode
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipObjectColorCaps = (flag, notify = true) => {
    if (flag == null) return;
    this.state.set("clipObjectColors", flag);
    this.clipping.setObjectColorCaps(flag);
    this.checkChanges({ clip_object_colors: flag }, notify);
    this.update(this.updateMarker);
  };

  /**
   * Get clipping plane state.
   * @returns {boolean} clip plane visibility value.
   **/
  getClipPlaneHelpers() {
    return this.state.get("clipPlaneHelpers");
  }

  /**
   * Show/hide clip plane helpers
   * @function
   * @param {boolean} flag - whether to show clip plane helpers
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipPlaneHelpers = (flag, notify = true) => {
    if (flag == null) return;

    this.state.set("clipPlaneHelpers", flag);
    this.clipping.planeHelpers.visible = flag;

    this.checkChanges({ clip_planes: flag }, notify);

    this.update(this.updateMarker);
  };

  /**
   * Get clipping plane state.
   * @param {boolean} index - index of the normal: 0, 1 ,2
   * @returns {boolean} clip plane visibility value.
   **/
  getClipNormal(index) {
    return this.clipNormals[index];
  }

  /**
   * Set the normal at index to a given normal
   * @function
   * @param {number} index - index of the normal: 0, 1 ,2
   * @param {number[]} normal - 3 dim array representing the normal
   * @param {number} [value=null] - value of the slider, if given
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipNormal(index, normal, value = null, notify = true) {
    if (normal == null) return;
    const normal1 = new THREE.Vector3(...normal).normalize().toArray();
    this.clipNormals[index] = normal1;

    this.clipping.setNormal(index, new THREE.Vector3(...normal1));
    this.clipping.setConstant(index, this.gridSize / 2);
    if (value == null) value = this.gridSize / 2;
    this.setClipSlider(index, value);

    var notifyObject = {};
    notifyObject[`clip_normal_${index}`] = normal1;
    notifyObject[`clip_slider_${index}`] = value;
    this.checkChanges(notifyObject, notify);

    this.nestedGroup.setClipPlanes(this.clipping.clipPlanes);

    this.update(this.updateMarker);
  }

  /**
   * Set the normal at index to the current viewing direction
   * @function
   * @param {number} index - index of the normal: 0, 1 ,2
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipNormalFromPosition = (index, notify = true) => {
    const cameraPosition = this.camera.getPosition().clone();
    const normal = cameraPosition
      .sub(this.controls.getTarget())
      .normalize()
      .negate()
      .toArray();
    this.setClipNormal(index, normal, null, notify);

    var notifyObject = {};
    notifyObject[`clip_normal_${index}`] = normal;
    this.checkChanges(notifyObject, notify);
  };

  /**
   * Get clipping slider value.
   * @function
   * @param {number} index - index of the normal: 0, 1 ,2
   * @returns {number} clip slider value.
   **/
  getClipSlider = (index) => {
    return this.state.get(`clipSlider${index}`);
  };

  /**
   * Set clipping slider value.
   * @function
   * @param {number} index - index of the normal: 0, 1 ,2
   * @param {number} value - value for the clipping slider
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipSlider = (index, value, notify = true) => {
    if (value == -1 || value == null) return;

    this.state.set(`clipSlider${index}`, value, notify);
  };

  // ---------------------------------------------------------------------------
  // Image Export
  // ---------------------------------------------------------------------------

  /**
   * Replace CadView with an inline png image of the canvas.
   *
   * Note: Only the canvas will be shown, no tools and orientation marker
   */
  pinAsPng = () => {
    const screenshot = this.getImage("screenshot");
    screenshot.then((data) => {
      var image = document.createElement("img");
      image.width = this.state.get("cadWidth");
      image.height = this.state.get("height");
      image.src = data.dataUrl;
      if (this.pinAsPngCallback == null) {
        // default, replace the viewer with the image
        this.display.replaceWithImage(image);
      }
    });
  };

  /**
   * Get the current canvas as png data.
   * @function
   * @param {string} taksId - and id to identify the screenshot
   * Note: Only the canvas will be shown, no tools and orientation marker
   */
  getImage = (taskId) => {
    // canvas.toBlob can be very slow when animation loop is off!
    const animationLoop = this.hasAnimationLoop;
    if (!animationLoop) {
      this.toggleAnimationLoop(true);
    }
    this.orientationMarker.setVisible(false);
    this.update(true);

    return this.display.captureCanvas({
      taskId,
      render: () => {
        this.renderer.setViewport(
          0,
          0,
          this.state.get("cadWidth"),
          this.state.get("height"),
        );
        this.renderer.render(this.scene, this.camera.getCamera());
      },
      onComplete: () => {
        // Restore animation loop to original state
        if (!animationLoop) {
          this.toggleAnimationLoop(false);
        }
        this.orientationMarker.setVisible(true);
        this.update(true);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Explode Animation
  // ---------------------------------------------------------------------------

  /**
   * Calculate explode trajectories and initiate the animation
   *
   * @param {number} [duration=2] - duration of animation.
   * @param {number} [speed=1] - speed of animation.
   * @param {number} [multiplier=2.5] - multiplier for length of trajectories.
   */
  explode(duration = 2, speed = 1, multiplier = 2.5) {
    this.clearAnimation();

    const use_origin = this.getAxes0();

    var worldCenterOrOrigin = new THREE.Vector3();
    var worldObjectCenter = new THREE.Vector3();

    var worldDirection = null;
    var localDirection = null;
    var scaledLocalDirection = null;

    if (!use_origin) {
      var bb = new THREE.Box3().setFromObject(this.nestedGroup.rootGroup);
      bb.getCenter(worldCenterOrOrigin);
    }
    for (var id in this.nestedGroup.groups) {
      // Loop over all Group elements
      var group = this.nestedGroup.groups[id];

      var b = new THREE.Box3();
      if (group instanceof ObjectGroup) {
        b.expandByObject(group);
      }
      if (b.isEmpty()) {
        continue;
      }
      b.getCenter(worldObjectCenter);
      // Explode around global center or origin
      worldDirection = worldObjectCenter.sub(worldCenterOrOrigin);
      localDirection = group.parent.worldToLocal(worldDirection.clone());

      // Use the parent to calculate the local directions
      scaledLocalDirection = group.parent.worldToLocal(
        worldDirection.clone().multiplyScalar(multiplier),
      );
      // and ensure to shift objects at its center and not at its position
      scaledLocalDirection.sub(localDirection);

      // build an animation track for the group with this direction
      this.addAnimationTrack(
        id,
        "t",
        [0, duration],
        [[0, 0, 0], scaledLocalDirection.toArray()],
      );
    }
    this.initAnimation(duration, speed, "E", false);
  }

  /**
   * Toggle explode mode on/off
   * @param {boolean} flag - whether to enable or disable explode mode
   */
  setExplode(flag) {
    const isExplodeActive = this.state.get("animationMode") === "explode";
    if (flag === isExplodeActive) return;

    if (flag) {
      if (this.hasAnimation()) {
        this.backupAnimation();
      }
      this.explode(); // This sets animationMode to "explode" via initAnimation
    } else {
      if (this.hasAnimation()) {
        this.controlAnimation("stop");
        this.clearAnimation(); // This sets animationMode to "none"
        this.restoreAnimation();
      } else {
        this.state.set("animationMode", "none");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard Configuration
  // ---------------------------------------------------------------------------

  /**
   * Set modifiers for keymap
   *
   * @param {config} keymap - e.g. {"shift": "shiftKey", "ctrl": "ctrlKey", "meta": "altKey"}
   */
  setKeyMap(config) {
    const before = KeyMapper.get_config();
    KeyMapper.set(config);
    this.display.updateHelp(before, config);
  }

  // ---------------------------------------------------------------------------
  // View Layout
  // ---------------------------------------------------------------------------

  /**
   * Resize UI and renderer
   *
   * @param {number} cadWidth - new width of CAD View
   * @param {number} treeWidth - new width of navigation tree
   * @param {number} height - new height of CAD View
   * @param {boolean} [glass=false] - Whether to use glass mode or not
   */
  resizeCadView(cadWidth, treeWidth, height, glass = false) {
    this.state.set("cadWidth", cadWidth);
    this.state.set("height", height);

    // Adapt renderer dimensions
    this.renderer.setSize(cadWidth, height);

    // Adapt display dimensions
    this.display.setSizes({
      treeWidth: treeWidth,
      treeHeight: this.state.get("treeHeight"),
      cadWidth: cadWidth,
      height: height,
    });
    // Set glass state - subscription will update UI
    this.state.set("glass", glass);

    const fullWidth = cadWidth + (glass ? 0 : treeWidth);
    this.display.updateToolbarCollapse(fullWidth);

    // Adapt camers to new dimensions
    this.camera.changeDimensions(this.bb_radius, cadWidth, height);

    // update the this
    this.update(true);

    // update the raycaster
    if (this.raycaster) {
      this.raycaster.width = cadWidth;
      this.raycaster.height = height;
    }
  }

  // ---------------------------------------------------------------------------
  // THREE.js Helper Factories
  // ---------------------------------------------------------------------------

  vector3(x = 0, y = 0, z = 0) {
    return new THREE.Vector3(x, y, z);
  }

  quaternion(x = 0, y = 0, z = 0, w = 1) {
    return new THREE.Quaternion(x, y, z, w);
  }
}

export { Viewer };
