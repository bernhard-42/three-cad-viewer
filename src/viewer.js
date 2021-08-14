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
import { clone, isEqual } from "./utils.js";
import { defaultDirections } from "./directions.js";
import { Controls } from "./controls.js";

class Viewer {
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

    this.display.addCadView(this.renderer.domElement);

    this.display.setupUI(this);
  }

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

    for (var option in options) {
      if (this[option] == null) {
        console.warn(`unknown option ${option} ignored`);
      } else {
        this[option] = options[option];
      }
    }

    this.edgeColor = this.blackEdges ? 0x000000 : this.edgeColor;
  }

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
    nestedGroup.setTransparent(this.transparent);
    nestedGroup.setBlackEdges(this.blackEdges);
    nestedGroup.setPolygonOffset(2);
    nestedGroup.render();
    return nestedGroup;
  }

  createCameras(distance) {
    //
    // define the perspective camera
    //

    const aspect = this.width / this.height;

    // calculate FOV
    const dfactor = 5;
    this.camera_distance = dfactor * distance;
    var fov = ((2 * Math.atan(1 / dfactor)) / Math.PI) * 180;

    this.pCamera = new THREE.PerspectiveCamera(
      fov,
      aspect,
      0.1,
      100 * distance
    );

    //
    // define the orthographic camera
    //

    const w = distance * 1.3;
    const h = (distance * 1.3) / aspect;

    this.oCamera = new THREE.OrthographicCamera(
      -w,
      w,
      h,
      -h,
      0.1,
      10 * distance
    );
  }

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

  initObjectStates() {
    for (var key in this.states) {
      const state = this.states[key];
      var obj = this.nestedGroup.groups[key];
      obj.setShapeVisible(state[0] === 1);
      obj.setEdgesVisible(state[1] === 1);
    }
  }

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

  initAnimation(duration, speed) {
    if (!this.needsAnimationLoop) {
      console.error("Start viewer with animation loop");
      return;
    }
    this.clipAction = this.animation.animate(duration, speed);
  }

  checkChanges = (changes, notify = true) => {
    if (notify && this.notifyCallback) {
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
      if (Object.keys(changed).length) {
        this.notifyCallback(changed);
      }
    }
  };

  update = (updateMarker, fromAnimationLoop, notify = true) => {
    if (this.ready && !(this.needsAnimationLoop && !fromAnimationLoop)) {
      if (this.animation) {
        this.animation.update();
      }

      this.renderer.render(this.scene, this.camera);

      if (updateMarker) {
        this.orientationMarker.update(
          this.camera.position.clone().sub(this.controls.target0),
          this.camera.rotation
        );
        this.orientationMarker.render();
      }
    }
    this.checkChanges(
      {
        camera_zoom: this.camera.zoom,
        camera_position: this.camera.position.toArray()
      },
      notify
    );
  };

  animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.update(true, true, true);
  };

  render(shapes, states) {
    this.states = states;

    this.scene = new THREE.Scene();

    const timer = new Timer("viewer", this.timeit);

    //
    // render the input assembly
    //

    this.nestedGroup = this.renderShapes(shapes);
    this.scene.add(this.nestedGroup.render());

    timer.split("rendered nested group");

    this.bbox = this.nestedGroup.boundingBox();
    this.bb_max = this.bbox.max_dist_from_center();
    this.bb_radius = this.nestedGroup.bsphere.radius;

    timer.split("bounding box");

    //
    // create cameras
    //

    this.createCameras(this.bb_radius);
    this.switchCamera(this.ortho, true);

    //
    // build mouse/touch controls
    //
    this.controls = new Controls(
      this.control,
      this.camera,
      this.bbox.center,
      this.renderer.domElement,
      this.rotateSpeed,
      this.zoomSpeed,
      this.panSpeed
    );

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
      this.camera,
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
    // add Info box
    //

    this.info = new Info(this.display.cadInfo);
    this.info.readyMsg(this.gridHelper.ticks, this.control);

    //
    // show the rendering
    //

    this.ready = true;

    if (this.needsAnimationLoop) {
      this.animate();
    } else {
      this.update(true, false);
    }

    timer.stop();
  }

  //
  // Event handlers
  //

  setupCamera(relative, position, up, zoom, notify = true) {
    const center = new THREE.Vector3(...this.bbox.center);

    if (position != null) {
      var cameraPosition = relative
        ? new THREE.Vector3(...position)
            .normalize()
            .multiplyScalar(this.camera_distance)
            .add(center)
            .toArray()
        : position;

      this.camera.position.set(...cameraPosition);
    }

    if (zoom != null) {
      this.camera.zoom = zoom;
    }

    if (this.control == "trackball") {
      this.camera.up.set(...up);
    } else {
      this.camera.up.set(0, 0, 1);
    }

    this.camera.lookAt(center);

    this.camera.updateProjectionMatrix();
    this.controls?.update();

    this.update(true, false, notify);
  }

  setCamera = (dir, notify = null) => {
    this.setupCamera(
      true,
      defaultDirections[dir]["position"],
      defaultDirections[dir]["up"],
      this.camera.zoom,
      notify
    );
  };

  setCameraPosition = (x, y, z, relative = false, notify = true) => {
    const up = null; // TODO fix for trackball
    this.setupCamera(relative, [x, y, z], up, null, notify);
  };

  setCameraZoom = (value, notify = true) => {
    this.setupCamera(false, null, null, null, value, notify);
  };

  switchCamera(ortho_flag, init = false, notify = true) {
    this.camera = ortho_flag ? this.oCamera : this.pCamera;

    if (init) {
      this.setCamera("iso", notify);
    } else {
      // TODO fix for trackball and orbit
      var p0 = this.camera.position.toArray();
      var z0 = this.camera.zoom;
      var u0 = this.camera.up.toArray();
      this.controls.object = this.camera;
      // reposition to the last camera position and zoom
      this.setupCamera(false, p0, u0, z0, notify);
    }
    this.checkChanges({ ortho: ortho_flag }, notify);
  }

  resize = () => {
    this.camera.zoom = this.zoom0;
    this.camera.updateProjectionMatrix();
    this.update(true, false);
  };

  reset = () => {
    this.controls.reset();
    this.update(true, false);
  };

  setZoomSpeed = (val) => {
    this.controls.setZoomSpeed(val);
  };

  setPanSpeed = (val) => {
    this.controls.setPanSpeed(val);
  };

  setRotateSpeed = (val) => {
    this.controls.setRotateSpeed(val);
  };

  setAxes = (flag, notify = true) => {
    this.axesHelper.setVisible(flag);
    this.display.setAxesCheck(flag);

    this.checkChanges({ axes: flag }, notify);

    this.update(true, false);
  };

  setGrid = (action, notify = true) => {
    this.gridHelper.setGrid(action);

    this.checkChanges({ grid: this.gridHelper.grid }, notify);

    this.update(true, false);
  };

  setGrids = (xy, xz, yz, notify = true) => {
    this.gridHelper.setGrids(xy, xz, yz);

    this.checkChanges({ grid: this.gridHelper.grid }, notify);

    this.update(true, false);
  };

  setAxes0 = (flag, notify = true) => {
    this.gridHelper.setCenter(flag);
    this.display.setAxes0Check(flag);
    this.axesHelper.setCenter(flag);

    this.checkChanges({ axes0: flag }, notify);

    this.update(true, false);
  };

  setTransparent = (flag, notify = true) => {
    this.nestedGroup.setTransparent(flag);
    this.display.setTransparentCheck(flag);

    this.checkChanges({ transparent: flag }, notify);

    this.update(true, false);
  };

  setBlackEdges = (flag, notify = true) => {
    this.nestedGroup.setBlackEdges(flag);
    this.display.setBlackEdgesCheck(flag);

    this.checkChanges({ black_edges: flag }, notify);

    this.update(true, false);
  };

  setClipIntersection = (flag, notify = true) => {
    this.nestedGroup.setClipIntersection(flag);
    this.display.setClipIntersectionCheck(flag);

    this.checkChanges({ clip_intersection: flag }, notify);

    this.update(true, false);
  };

  setClipPlaneHelpers = (flag, notify = true) => {
    this.clipping.planeHelpers.visible = flag;
    this.display.setClipPlaneHelpersCheck(flag);

    this.checkChanges({ clip_planes: flag }, notify);

    this.update(false, false);
  };

  setLocalClipping(flag) {
    this.renderer.localClippingEnabled = flag;
    this.update(true, false);
  }

  setClipNormal = (index, notify = true) => {
    const cameraPosition = this.camera.position.clone();
    const normal = cameraPosition
      .sub(this.controls.target)
      .normalize()
      .negate();

    this.clipping.setNormal(index, normal);
    var notifyObject = {};
    notifyObject[`clip_normal_${index}`] = normal.toArray();

    this.checkChanges(notifyObject, notify);

    this.nestedGroup.setClipPlanes(this.clipping.clipPlanes);
    this.update(true, false);
  };

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

  setTreeState(type, id, icon_id, state) {
    this.treeview.setState(type, id, icon_id, state);
  }

  refreshPlane = (index, value) => {
    this.clipping.setConstant(index, value);
    this.update(false, false);
  };

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

  pick = (e) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const offsetX = rect.x + window.pageXOffset;
    const offsetY = rect.y + window.pageYOffset;
    this.mouse.x = ((e.pageX - offsetX) / this.width) * 2 - 1;
    this.mouse.y = -((e.pageY - offsetY) / this.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const objects = this.raycaster.intersectObjects(
      this.scene.children.slice(0, 1),
      true
    );
    var nearest = {};
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

    this.checkChanges({
      lastPick: {
        path: nearest.path,
        name: nearest.name,
        boundingBox: JSON.parse(JSON.stringify(nearest.boundingBox)),
        boundingSphere: JSON.parse(JSON.stringify(nearest.boundingSphere))
      }
    });
    this.info.bbInfo(nearest.path, nearest.name, nearest.boundingBox);
  };

  pitch(angle) {
    this.controls.pitch(angle);
  }

  yaw(angle) {
    this.controls.yaw(angle);
  }

  roll(angle) {
    this.controls.roll(angle);
  }
}

export { Viewer, defaultDirections };
