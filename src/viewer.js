import * as THREE from "three";

import { NestedGroup } from "./nestedgroup.js";
import { Grid } from "./grid.js";
import { AxesHelper } from "./axes.js";
import { OrientationMarker } from "./orientation.js";
import { TreeView } from "./treeview.js";
import { Timer } from "./timer.js";
import { Clipping } from "./clipping.js";
import { Animation } from "./animation.js";
import { Info } from "./info.js";
import { clone, isEqual, sceneTraverse } from "./utils.js";
import { Controls } from "./controls.js";
import { Camera } from "./camera.js";

class Viewer {
  /**
   * Create Viewer.
   * @param {Display} display - The Display object.
   * @param {boolean} needsAnimationLoop - Whether to start an anuimation loop or handle camera updates manually.
   * @param {ViewerOptions} options - configuration parameters.
   * @param {NotificationCallback} notifyCallback - The callback to get camera position and zoom changes.
   */
  constructor(display, needsAnimationLoop, options, notifyCallback) {
    this.display = display;
    this.needsAnimationLoop = needsAnimationLoop;
    this.setDefaults(options);
    this.notifyCallback = notifyCallback;

    this.display.setSizes({
      cadWidth: this.cadWidth,
      height: this.height,
      treeWidth: this.treeWidth
    });

    window.THREE = THREE;

    this.nestedGroup = null;
    this.mapping = null;
    this.tree = null;
    this.bbox = null;
    this.bb_max = 0;
    this.scene = null;
    this.gridHelper = null;
    this.axesHelper = null;
    this.camera = null;
    this.controls = null;
    this.orientationMarker = null;
    this.treeview = null;

    this.ready = false;
    this.mixer = null;
    this.animation = null;
    this.continueAnimation = true;

    this.camera_distance = 0;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // setup renderer
    this.renderer = new THREE.WebGLRenderer({
      alpha: !this.dark,
      antialias: true
    });

    this.width = this.cadWidth;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height);

    this.lastNotification = {};

    this.renderer.domElement.addEventListener("dblclick", this.pick, false);
    this.renderer.domElement.addEventListener("contextmenu", (e) =>
      e.stopPropagation()
    );

    this.display.addCadView(this.renderer.domElement);

    this.display.setupUI(this);
  }

  /**
   * Create Viewer.
   * @param {ViewerOptions} options - The Display object.
   */
  setDefaults(options) {
    this.cadWidth = 800;
    this.height = 600;
    this.treeWidth = 250;
    this.treeHeight = 250;
    this.theme = "light";
    this.bbFactor = 1.0;
    this.zoom0 = 1.0;
    this.grid = [false, false, false];
    this.ticks = 10;
    this.axes = false;
    this.axes0 = false;
    this.ortho = true;
    this.control = "orbit";
    this.rotateSpeed = 1.0;
    this.zoomSpeed = 0.5;
    this.panSpeed = 0.5;
    this.blackEdges = false;
    this.edgeColor = 0x707070;
    this.ambientIntensity = 0.5;
    this.directIntensity = 0.3;
    this.transparent = false;
    this.defaultOpacity = 0.4;
    this.normalLen = 0;
    this.tools = true;
    this.timeit = false;
    this.clipIntersection = false;
    this.clipPlaneHelpers = false;
    this.clipNormal = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1]
    ];

    for (var option in options) {
      if (this[option] == null) {
        console.warn(`unknown option ${option} ignored`);
      } else {
        this[option] = options[option];
      }
    }
  }

  /**
   * Render the shapes of the CAD object.
   * @param {Shapes} shapes - The Shapes object.
   * @returns {THREE.Group} A nested THREE.Group object.
   */
  renderShapes(shapes) {
    const nestedGroup = new NestedGroup(
      shapes,
      this.width,
      this.height,
      this.edgeColor,
      this.transparent,
      this.defaultOpacity,
      this.normalLen
    );
    nestedGroup.render();
    return nestedGroup;
  }

  /**
   * Retrieve the navigation tree from a Shapes object.
   * @param {Shapes} shapes - The Shapes object.
   * @returns {NavTree} The navigation tree object.
   */
  getTree(shapes) {
    const delim = "/";

    const _getTree = (subGroup, path) => {
      const newPath = `${path}${delim}${subGroup.name}`;
      var result = {
        name: subGroup.name,
        id: newPath
      };
      if (subGroup.parts) {
        result.type = "node";
        result.children = [];
        for (var part of subGroup.parts) {
          result.children.push(_getTree(part, newPath));
        }
      } else {
        result.type = "leaf";
        result.states = this.states[newPath];
      }
      return result;
    };

    return _getTree(shapes, "");
  }

  /**
   * Initialize the visibility state of all objects according to the navigation tree setting.
   */
  initObjectStates() {
    for (var key in this.states) {
      const state = this.states[key];
      var obj = this.nestedGroup.groups[key];
      obj.setShapeVisible(state[0] === 1);
      obj.setEdgesVisible(state[1] === 1);
    }
  }

  /**
   * Add an animation track to the THREE.Group
   * @param {string} selector - path/id of group to be animated.
   * @param {string} action - one of "rx", "ry", "rz" for rotations around axes, "q" for quaternions or "t", "tx", "ty", "tz" for translations.
   * @param {number[]} time - array of times.
   * @param {number[]} values - array of values, the type depends on the action.
   */
  addAnimationTrack(selector, action, time, values) {
    if (!this.needsAnimationLoop) {
      console.error("Start viewer with animation loop");
      return;
    }
    if (this.animation == null) {
      this.animation = new Animation(
        this.nestedGroup.rootGroup,
        this.nestedGroup.delim
      );
      this.display.setAnimationControl(true);
    }
    this.animation.addTrack(
      selector,
      this.nestedGroup.groups[selector],
      action,
      time,
      values
    );
  }

  /**
   * Initialize the animation.
   * @param {number} duration - overall duration of the anmiation.
   * @param {number} speed - speed of the animation.
   */
  initAnimation(duration, speed) {
    if (!this.needsAnimationLoop) {
      console.error("Start viewer with animation loop");
      return;
    }
    this.clipAction = this.animation.animate(duration, speed);
  }

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
              : clone(this.lastNotification[key])
        };
        this.lastNotification[key] = change;
      }
    });
    if (notify && this.notifyCallback && Object.keys(changed).length) {
      this.notifyCallback(changed);
    }
  };

  /**
   * Render scene and update orientation marker
   * If no animation loop exists, this needs to be called manually after every camera/scene change
   * @function
   * @param {boolean} updateMarker - whether to update the orientation marker
   * @param {boolean} fromAnimationLoop - whether a animation loop is running in the background. Update will skipped for this case
   * @param {boolean} notify - whether to send notification or not.
   */
  update = (updateMarker, fromAnimationLoop, notify = true) => {
    if (this.ready && !(this.needsAnimationLoop && !fromAnimationLoop)) {
      if (this.animation) {
        this.animation.update();
      }

      this.renderer.render(this.scene, this.camera.getCamera());

      if (updateMarker) {
        this.orientationMarker.update(
          this.camera.getPosition().clone().sub(this.controls.getTarget()),
          this.camera.getRotation()
        );
        this.orientationMarker.render();
      }
    }
    this.checkChanges(
      {
        zoom: this.camera.getZoom(),
        position: this.camera.getPosition().toArray()
      },
      notify
    );
  };

  /**
   * Start the animation loop
   * @function
   */
  animate = () => {
    if (this.continueAnimation) {
      requestAnimationFrame(this.animate);
      this.controls.update();
      this.update(true, true, true);
    } else {
      console.log("animation stopped");
    }
  };

  /**
   * Remove assets and event handlers.
   */
  dispose() {
    // stop animation
    this.continueAnimation = false;

    // clear info
    this.info.dispose();

    // dispose all event handlers and HTML content

    this.display.dispose();
    this.display = null;

    // dispose scene

    sceneTraverse(this.scene, (o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.scene = null;

    this.camera.dispose();
    this.controls.dispose();
    this.orientationMarker.dispose();

    // dispose renderer
    this.renderer.renderLists.dispose();
    this.renderer = null;
  }

  /**
   * Render a CAD object and build the navigation tree
   * @param {Shapes} shapes - the shapes of the CAD object to be rendered
   * @param {States} states - the visibility state of meshes and edges
   * @param {number[]} [position=null] - the camera position.
   * @param {number[]} [quaternion=null] - the camera rotation as quaternion. Only relevant for TrackballControls and needs position to be set, too.
   * @param {number} [zoom=null] - zoom value.
   */
  render(shapes, states, position = null, quaternion = null, zoom = null) {
    this.states = states;
    this.scene = new THREE.Scene();

    const timer = new Timer("viewer", this.timeit);

    //
    // render the input assembly
    //

    this.nestedGroup = this.renderShapes(shapes);
    this.scene.add(this.nestedGroup.render());

    this.nestedGroup.setTransparent(this.transparent);
    this.nestedGroup.setBlackEdges(this.blackEdges);
    this.nestedGroup.setPolygonOffset(2);

    timer.split("rendered nested group");

    this.bbox = this.nestedGroup.boundingBox();
    this.bb_max = this.bbox.max_dist_from_center();
    this.bb_radius = this.nestedGroup.bsphere.radius;

    timer.split("bounding box");

    //
    // add Info box
    //

    this.info = new Info(this.display.cadInfo);

    //
    // create cameras
    //
    this.camera = new Camera(
      this.width,
      this.height,
      this.bb_radius,
      this.bbox.center,
      this.ortho,
      this.control
    );

    //
    // build mouse/touch controls
    //
    this.controls = new Controls(
      this.control,
      this.camera.getCamera(),
      this.bbox.center,
      this.renderer.domElement,
      this.rotateSpeed,
      this.zoomSpeed,
      this.panSpeed
    );
    this.controls.enableKeys = false;

    // this needs to happen after the controls have been established
    if (position == null && quaternion == null) {
      this.presetCamera("iso", zoom);
    } else if (position != null) {
      this.setCamera(false, position, quaternion, zoom);
      if (quaternion == null) {
        this.camera.lookAtTarget();
      }
    } else {
      this.info.addHtml(
        "<b>quaternion needs position to be provided, falling back to ISO view</b>"
      );
      this.presetCamera("iso", zoom);
    }

    // Save the new state again
    this.controls.saveState();

    //
    // Register update event if needed
    //

    if (!this.needsAnimationLoop) {
      this.controls.addChangeListener(() => this.update(true, true, true));
    }

    //
    // add lights
    //

    const amb_light = new THREE.AmbientLight(0xffffff, this.ambientIntensity);
    this.scene.add(amb_light);

    for (var xpos of [-this.bb_max, this.bb_max]) {
      for (var ypos of [-this.bb_max, this.bb_max]) {
        for (var zpos of [-this.bb_max, this.bb_max]) {
          const directionalLight = new THREE.DirectionalLight(
            0xffffff,
            this.directIntensity
          );
          directionalLight.position.set(10 * xpos, 10 * ypos, 10 * zpos);
          this.scene.add(directionalLight);
        }
      }
    }

    //
    // add grid helpers
    //

    this.gridHelper = new Grid(
      this.display,
      this.bbox,
      this.ticks,
      this.axes0,
      this.grid
    );
    this.gridHelper.computeGrid();

    for (var i = 0; i < 3; i++) {
      this.scene.add(this.gridHelper.gridHelper[i]);
    }

    this.gridSize = this.gridHelper.size;

    //
    // add axes helper
    //

    this.axesHelper = new AxesHelper(
      this.bbox.center,
      this.gridSize / 2,
      2,
      this.width,
      this.height,
      this.axes0,
      this.axes,
      this.theme
    );
    this.scene.add(this.axesHelper);

    //
    // set up clipping planes and helpers
    //

    this.clipping = new Clipping(
      this.bbox.center,
      this.gridSize,
      this.gridSize / 2,
      (index, normal) => this.display.setNormalLabel(index, normal),
      this.theme
    );

    this.scene.add(this.clipping.planeHelpers);
    this.nestedGroup.setClipPlanes(this.clipping.clipPlanes);
    this.display.setSliders(this.gridSize / 2);

    this.setLocalClipping(false); // only allow clipping when Clipping tab is selected

    //
    // set up the orientation marker
    //

    this.orientationMarker = new OrientationMarker(
      80,
      80,
      this.camera.getCamera(),
      this.theme
    );
    this.display.addCadInset(this.orientationMarker.create());

    //
    // build tree view
    //

    this.tree = this.getTree(shapes);
    this.treeview = new TreeView(
      clone(this.states),
      this.tree,
      this.setObjects,
      this.theme
    );
    this.display.addCadTree(this.treeview.render());

    this.initObjectStates();

    timer.split("scene done");

    //
    // show the rendering
    //

    this.ready = true;

    if (this.needsAnimationLoop) {
      this.animate();
    } else {
      this.update(true, false);
    }

    this.info.readyMsg(this.gridHelper.ticks, this.control);

    timer.stop();
  }

  //
  // Event handlers
  //

  /**
   * Move the camera to a given locations
   * @function
   * @param {number[]} position - the camera position as 3 dim array [x,y,z]
   * @param {relative} [relative=false] - flag whether the position is a relative (e.g. [1,1,1] for iso) or absolute point.
   * @param {number[]} quaternion - the camera rotation expressed by a quaternion array [x,y,z,w].
   * @param {number} [zoom=null] - zoom value.
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setCamera = (
    relative,
    position,
    quaternion = null,
    zoom = null,
    notify = true
  ) => {
    this.camera.setupCamera(
      relative,
      new THREE.Vector3(...position),
      quaternion != null ? new THREE.Quaternion(...quaternion) : null,
      zoom,
      notify
    );
    this.update(true, false, notify);
  };

  /**
   * Move the camera to one of the preset locations
   * @function
   * @param {string} dir - can be "iso", "top", "bottom", "front", "rear", "left", "right"
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  presetCamera = (dir, zoom = null, notify = true) => {
    this.camera.presetCamera(dir, zoom, notify);
    this.update(true, false, notify);
  };

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
    this.ortho = flag;
    this.camera.switchCamera(flag, notify);
    this.controls.setCamera(this.camera.getCamera());
    this.display.setOrthoCheck(flag);

    this.checkChanges({ ortho: flag }, notify);
    this.update(true, false, notify);
  }

  /**
   * Reset zoom to the initiale value
   * @function
   */
  resize = () => {
    this.camera.setZoom(this.zoom0);
    this.camera.updateProjectionMatrix();
    this.update(true, false);
  };

  /**
   * Reset the view to the initial camera and controls settings
   * @function
   */
  reset = () => {
    this.controls.reset();
    this.update(true, false);
  };

  /**
   * Enbable/disable local clipping
   * @param {boolean} flag - whether to enable local clipping
   */
  setLocalClipping(flag) {
    this.renderer.localClippingEnabled = flag;
    this.update(true, false);
  }

  /**
   * Set the rendered shape visibility state according to the states map
   * @function
   * @param {States} states
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setObjects = (states, notify = true) => {
    for (var key in this.states) {
      var oldState = this.states[key];
      var newState = states[key];
      var objectGroup = this.nestedGroup.groups[key];
      if (oldState[0] != newState[0]) {
        objectGroup.setShapeVisible(newState[0] === 1);
        this.states[key][0] = newState[0];
      }
      if (oldState[1] != newState[1]) {
        objectGroup.setEdgesVisible(newState[1] === 1);
        this.states[key][1] = newState[1];
      }
    }

    this.checkChanges({ states: states }, notify);

    this.update(true, false);
  };

  /**
   * Refresh clipping plane
   * @function
   * @param {number} index - index of the plane: 0,1,2
   * @param {number} value - distance on the clipping normal from the center
   */
  refreshPlane = (index, value) => {
    this.clipping.setConstant(index, value);
    this.update(false, false);
  };

  /**
   * Handler for the animation control
   * @function
   * @param {string} btn - the pressed button: "play", "pause", "stop"
   */
  controlAnimation = (btn) => {
    switch (btn) {
      case "play":
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
   * @param {string} - id
   * @param {number[]} - 2 dim array [mesh, edges] = [0/1, 0/1]
   */
  setState = (id, state, notify = true) => {
    [0, 1].forEach((i) =>
      this.treeview.handleStateChange("leaf", id, i, state[i])
    );
    this.update(true, false, notify);
  };

  /**
   * Find the shape that was double clicked and send notification
   * @function
   * @param {MouseEvent} e - a DOM MouseEvent
   */
  pick = (e) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const offsetX = rect.x + window.pageXOffset;
    const offsetY = rect.y + window.pageYOffset;
    this.mouse.x = ((e.pageX - offsetX) / this.width) * 2 - 1;
    this.mouse.y = -((e.pageY - offsetY) / this.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera.getCamera());

    const objects = this.raycaster.intersectObjects(
      this.scene.children.slice(0, 1),
      true
    );
    var nearest = null;
    for (var object of objects) {
      if (object.object.visible) {
        nearest = {
          path: object.object.parent.parent.name.replaceAll("|", "/"),
          name: object.object.name,
          boundingBox: object.object.geometry.boundingBox,
          boundingSphere: object.object.geometry.boundingSphere,
          objectGroup: object.object.parent
        };
        break;
      }
    }
    if (nearest != null) {
      this.checkChanges({
        lastPick: {
          path: nearest.path,
          name: nearest.name,
          boundingBox: JSON.parse(JSON.stringify(nearest.boundingBox)),
          boundingSphere: JSON.parse(JSON.stringify(nearest.boundingSphere))
        }
      });
      this.info.bbInfo(nearest.path, nearest.name, nearest.boundingBox);
    }
  };

  //
  // Getters and Setters
  //

  /**
   * Get whether axes helpers are shon/hidden.
   * @returns {boolean} axes value.
   **/
  getAxes() {
    return this.axes;
  }

  /**
   * Show/hide axes helper
   * @function
   * @param {boolean} flag - whether to show the axes
   * @param {boolean} notify - whether to send notification or not.
   */
  setAxes = (flag, notify = true) => {
    this.axes = flag;
    this.axesHelper.setVisible(flag);
    this.display.setAxesCheck(flag);

    this.checkChanges({ axes: flag }, notify);

    this.update(true, false);
  };

  /**
   * Show/hide grids
   * @function
   * @param {string} action -  one of "grid" (all grids), "grid-xy","grid-xz", "grid-yz"
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setGrid = (action, notify = true) => {
    this.gridHelper.setGrid(action);

    this.checkChanges({ grid: this.gridHelper.grid }, notify);

    this.update(true, false);
  };

  /**
   * Get visibility of grids.
   * @returns {number[]} grids value.
   **/
  getGrids() {
    return this.grid;
  }

  /**
   * Toggle grid visibility
   * @function
   * @param {boolean[]} grids - 3 dim grid visibility (xy, xzm yz)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setGrids = (grids, notify = true) => {
    this.gridHelper.setGrids(...grids);
    this.grid = this.gridHelper.grid;

    this.checkChanges({ grid: this.gridHelper.grid }, notify);

    this.update(true, false);
  };

  /**
   * Get location of axes.
   * @returns {boolean} axes0 value, true means at origin (0,0,0)
   **/
  getAxes0() {
    return this.axes0;
  }

  /**
   * Set whether grids and axes center at the origin or the object's boundary box center
   * @function
   * @param {boolean} flag - whether grids and axes center at the origin (0,0,0)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setAxes0 = (flag, notify = true) => {
    this.axes0 = flag;
    this.gridHelper.setCenter(flag);
    this.display.setAxes0Check(flag);
    this.axesHelper.setCenter(flag);

    this.checkChanges({ axes0: flag }, notify);

    this.update(true, false);
  };

  /**
   * Get transparency state of CAD objects.
   * @returns {boolean} transparent value.
   **/
  getTransparent() {
    return this.transparent;
  }

  /**
   * Set CAD objects transparency
   * @function
   * @param {boolean} flag - whether to show the CAD object in transparent mode
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setTransparent = (flag, notify = true) => {
    this.transparent = flag;
    this.nestedGroup.setTransparent(flag);
    this.display.setTransparentCheck(flag);

    this.checkChanges({ transparent: flag }, notify);

    this.update(true, false);
  };

  /**
   * Get blackEdges value.
   * @returns {boolean} blackEdges value.
   **/
  getBlackEdges() {
    return this.blackEdges;
  }

  /**
   * Show edges in black or the default edge color
   * @function
   * @param {boolean} flag - whether to show edges in black
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setBlackEdges = (flag, notify = true) => {
    this.blackEdges = flag;
    this.nestedGroup.setBlackEdges(flag);
    this.display.setBlackEdgesCheck(flag);

    this.checkChanges({ black_edges: flag }, notify);

    this.update(true, false);
  };

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
    this.update(true, false, notify);
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
    this.update(true, false, notify);
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
    this.update(true, false, notify);
  }

  /**
   * Get default color of the edges.
   * @returns {number} edgeColor value.
   **/
  getEdgeColor() {
    return this.edgeColor;
  }

  /**
   * Set the default edge color
   * @function
   * @param {number} edge color (0xrrggbb)
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setEdgeColor = (color, notify = true) => {
    this.edgeColor = color;
    this.nestedGroup.setEdgeColor(color);
    this.update(true, false, notify);
  };

  /**
   * Get whether tools are shown/hidden.
   * @returns {boolean} tools value.
   **/
  getTools() {
    return this.tools;
  }

  /**
   * Show/hide the CAD tools
   * @function
   * @param {boolean} flag
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setTools = (flag, notify = true) => {
    this.tools = flag;
    this.display.setTools(flag);
    this.update(true, false, notify);
  };

  /**
   * Get intensity of ambient light.
   * @returns {number} ambientLight value.
   **/
  getAmbientLight() {
    return this.ambientIntensity;
  }

  /**
   * Set the intensity of ambient light
   * @function
   * @param {States} states
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setAmbientLight = (val, notify = true) => {
    this.ambientIntensity = val;
    for (var el of this.scene.children) {
      if (el instanceof THREE.AmbientLight) {
        el.intensity = val;
      }
    }
    this.update(true, false, notify);
  };

  /**
   * Get intensity of direct light.
   * @returns {number} directLight value.
   **/
  getDirectLight() {
    return this.directIntensity;
  }
  /**
   * Set the intensity of directional light
   * @function
   * @param {States} states
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setDirectLight = (val, notify = true) => {
    this.directIntensity = val;
    for (var el of this.scene.children) {
      if (el instanceof THREE.DirectionalLight) {
        el.intensity = val;
      }
    }
    this.update(true, false, notify);
  };

  /**
   * Get states of a treeview leafs.
   * @returns {States} states value.
   **/
  getStates() {
    return this.states;
  }

  /**
   * Set states of a treeview leafs
   * @function
   * @param {States} - states
   */
  setStates = (states, notify = true) => {
    for (var id in states) {
      if (
        states[id][0] != this.states[id][0] ||
        states[id][1] != this.states[id][1]
      ) {
        this.setState(id, states[id], notify);
      }
    }
  };

  /**
   * Get zoom speed.
   * @returns {number} zoomSpeed value.
   **/
  getZoomSpeed() {
    return this.zoomSpeed;
  }

  /**
   * Set zoom speed.
   * @function
   * @param {number} val - the new zoom speed
   * @param {boolean} notify - whether to send notification or not.
   */
  setZoomSpeed = (val, notify = true) => {
    this.zoomSpeed = val;
    this.controls.setZoomSpeed(val);
    this.checkChanges({ grid: this.gridHelper.grid }, notify);
  };

  /**
   * Get panning speed.
   * @returns {number} pan speed value.
   **/
  getPanSpeed() {
    return this.panSpeed;
  }

  /**
   * Set pan speed.
   * @function
   * @param {number} val - the new pan speed
   * @param {boolean} notify - whether to send notification or not.
   */
  setPanSpeed = (val, notify = true) => {
    this.panSpeed = val;
    this.controls.setPanSpeed(val);
    this.checkChanges({ grid: this.gridHelper.grid }, notify);
  };

  /**
   * Get rotation speed.
   * @returns {number} rotation speed value.
   **/
  getRotateSpeed() {
    return this.rotateSpeed;
  }

  /**
   * Set rotation speed.
   * @function
   * @param {number} val - the new rotation speed.
   * @param {boolean} notify - whether to send notification or not.
   */
  setRotateSpeed = (val, notify = true) => {
    this.rotateSpeed = val;
    this.controls.setRotateSpeed(val);
    this.checkChanges({ grid: this.gridHelper.grid }, notify);
  };

  /**
   * Get intersection mode.
   * @returns {boolean} clip intersection value.
   **/
  getClipIntersection() {
    return this.clipIntersection;
  }

  /**
   * Set the clipping mode to intersection mode
   * @function
   * @param {boolean} flag - whether to use intersection mode
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipIntersection = (flag, notify = true) => {
    this.clipIntersection = flag;
    this.nestedGroup.setClipIntersection(flag);
    this.display.setClipIntersectionCheck(flag);

    this.checkChanges({ clip_intersection: flag }, notify);

    this.update(true, false);
  };

  /**
   * Get clipping plane state.
   * @returns {boolean} clip plane visibility value.
   **/
  getClipPlaneHelpers() {
    return this.clipPlaneHelpers;
  }

  /**
   * Show/hide clip plane helpers
   * @function
   * @param {boolean} flag - whether to show clip plane helpers
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipPlaneHelpers = (flag, notify = true) => {
    this.clipPlaneHelpers = flag;
    this.clipping.planeHelpers.visible = flag;
    this.display.setClipPlaneHelpersCheck(flag);

    this.checkChanges({ clip_planes: flag }, notify);

    this.update(false, false);
  };

  /**
   * Get clipping plane state.
   * @param {boolean} index - index of the normal: 0, 1 ,2
   * @returns {boolean} clip plane visibility value.
   **/
  getClipNormal(index) {
    return this.clipNormal[index];
  }

  /**
   * Set the normal at index to the current viewing direction
   * @function
   * @param {boolean} index - index of the normal: 0, 1 ,2
   * @param {boolean} [notify=true] - whether to send notification or not.
   */
  setClipNormal = (index, notify = true) => {
    const cameraPosition = this.camera.getPosition().clone();
    const normal = cameraPosition
      .sub(this.controls.getTarget())
      .normalize()
      .negate();

    this.clipNormal[index] = normal;

    this.clipping.setNormal(index, normal);
    var notifyObject = {};
    notifyObject[`clip_normal_${index}`] = normal.toArray();

    this.checkChanges(notifyObject, notify);

    this.nestedGroup.setClipPlanes(this.clipping.clipPlanes);
    this.update(true, false);
  };
}

export { Viewer };
