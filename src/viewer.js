import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { NestedGroup } from './nestedgroup.js'
import { Grid } from './grid.js'
import { AxesHelper } from './axes.js'
import { OrientationMarker } from './orientation.js'
import { TreeView } from './treeview.js'
import { Timer } from './timer.js';
import { Clipping } from './clipping.js';
import { Animation } from './animation.js';
import { Info } from './info.js'


function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
};

const defaultDirections = {
    "iso": { "position": [1, 1, 1] },
    "front": { "position": [1, 0, 0] },
    "rear": { "position": [-1, 0, 0] },
    "left": { "position": [0, 1, 0] },
    "right": { "position": [0, -1, 0] },
    "top": { "position": [0, 0, 1], "rotateZ": Math.PI },
    "bottom": { "position": [0, 0, -1], "rotateZ": Math.PI }
}

class Viewer {

    constructor(display, needsAnimationLoop, options) {
        this.display = display;
        this.needsAnimationLoop = needsAnimationLoop;
        this.setDefaults(options);
        this.display.setSizes({
            cadWidth: this.cadWidth,
            height: this.height,
            treeWidth: this.treeWidth,
        });

        this._measure = false;

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

        this.camera_distance = 0;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2()

        // setup renderer
        this.renderer = new THREE.WebGLRenderer({
            alpha: !this.dark,
            antialias: true
        });
        [this.width, this.height] = this.display.getCadViewSize();
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.width, this.height);

        this.renderer.domElement.addEventListener('dblclick', this.pick, false);

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
        this.position = [1, 1, 1];
        this.zoom0 = 1.0;
        this.grid = false;
        this.axes = false;
        this.axes0 = false;
        this.ortho = true;
        this.blackEdges = false;
        this.edgeColor = 0x707070;
        this.ambientIntensity = 0.5;
        this.directIntensity = 0.3;
        this.transparent = false;
        this.defaultOpacity = 0.4;
        this.normalLen = 0;
        this.ready = false;
        this.mixer = null;
        this.animation = null;

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
            this.normalLen,
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
        var fov = 2 * Math.atan(1 / dfactor) / Math.PI * 180;

        this.pCamera = new THREE.PerspectiveCamera(
            fov,
            aspect,
            0.1,
            100 * distance
        )

        //
        // define the orthographic camera
        //

        const w = distance * 1.3;
        const h = distance * 1.3 / aspect;

        this.oCamera = new THREE.OrthographicCamera(
            -w, w, h, -h,
            0.1,
            10 * distance
        )
    }

    initOrbitControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.listenToKeyEvents(window);
        this.controls.target = new THREE.Vector3(...this.bbox.center);
        this.controls.zoomSpeed = 0.5;
        this.controls.panSpeed = 0.5;

        // save default view for reset
        this.controls.saveState();

        if (!this.needsAnimationLoop) {
            this.controls.addEventListener('change', () => this.update());
        }
        this.controls.update()
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
                result.type = "leaf"
                result.states = this.states[newPath]
            }
            return result;
        }

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
            return
        }
        if (this.animation == null) {
            this.animation = new Animation(this.nestedGroup.rootGroup, this.nestedGroup.delim);
            this.display.setAnimationControl(true);
        }
        this.animation.addTrack(selector, this.nestedGroup.groups[selector], action, time, values);
    }

    initAnimation(duration, speed) {
        if (!this.needsAnimationLoop) {
            console.error("Start viewer with animation loop");
            return
        }
        this.clipAction = this.animation.animate(duration, speed);
    }

    update(updateMarker, fromAnimationLoop) {
        if (this.ready & !(this.needsAnimationLoop & !fromAnimationLoop)) {
            if (this.animation) {
                this.animation.update();
            }

            this.renderer.render(this.scene, this.camera);

            if (updateMarker) {
                this.orientationMarker.update(this.camera.position, this.controls.target);
                this.orientationMarker.render();
            }
        }
    }

    animate = () => {
        requestAnimationFrame(this.animate);
        this.update(true, true);
    }

    render(shapes, states) {
        this.states = states;

        this.scene = new THREE.Scene();

        const timer = new Timer("viewer", this._measure);

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
        this.initOrbitControls();

        //
        // add lights
        //

        const amb_light = new THREE.AmbientLight(0xffffff, this.ambientIntensity);
        this.scene.add(amb_light);

        for (var xpos of [-this.bb_max, this.bb_max]) {
            for (var ypos of [-this.bb_max, this.bb_max]) {
                for (var zpos of [-this.bb_max, this.bb_max]) {
                    const directionalLight = new THREE.DirectionalLight(0xffffff, this.directIntensity);
                    directionalLight.position.set(10 * xpos, 10 * ypos, 10 * zpos)
                    this.scene.add(directionalLight);
                }
            }
        }

        //
        // add grid helpers
        //

        this.gridHelper = new Grid(this.display, this.bbox, 10, this.axes0, this.grid ? [true, true, true] : [false, false, false])
        for (var i = 0; i < 3; i++) {
            this.scene.add(this.gridHelper.gridHelper[i]);
        }

        this.gridSize = this.gridHelper.size;

        //
        // add axes helper
        //

        this.axesHelper = new AxesHelper(this.bbox.center, this.gridSize / 2, 2, this.width, this.height, this.axes0, this.axes, this.theme);
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

        this.setLocalClipping(false);  // only allow clipping when Clipping tab is selected

        //
        // set up the orientation marker
        //

        const [insetWidth, insetHeight] = this.display.getCadInsetSize();
        this.orientationMarker = new OrientationMarker(insetWidth, insetHeight, this.camera, this.theme);
        this.display.addCadInset(this.orientationMarker.create());

        //
        // build tree view
        //

        this.tree = this.getTree(shapes);
        this.treeview = new TreeView(clone(this.states), this.tree, this.setObjects, this.theme);
        this.display.addCadTree(this.treeview.render());

        this.initObjectStates();

        timer.split("scene done");

        //
        // add Info box
        //

        this.info = new Info(this.display.cadInfo);
        this.info.readyMsg(this.gridHelper.ticks);

        //
        // show the rendering
        //

        this.ready = true;

        if (this.needsAnimationLoop) {
            this.animate()
        } else {
            this.update(true, false);
        }

        timer.stop();
    }

    //
    // Event handlers 
    //

    setupCamera(relative, position, rotateZ, zoom) {
        const center = new THREE.Vector3(...this.bbox.center);
        var cameraPosition = null;
        if (relative) {
            cameraPosition = new THREE.Vector3(...position)
                .normalize()
                .multiplyScalar(this.camera_distance)
                .add(center);
        } else {
            cameraPosition = position;
        }

        this.camera.up = new THREE.Vector3(0, 0, 1)
        this.camera.lookAt(center);
        this.camera.zoom = (zoom) ? zoom : this.zoom0;
        this.camera.position.set(...cameraPosition.toArray());
        this.camera.updateProjectionMatrix();

        // set x direction for top and bottom view to avoid flickering
        if (rotateZ) {
            this.camera.rotateZ(rotateZ);
            this.camera.updateProjectionMatrix();
        }
        this.controls?.update()
        this.update(true, false)
    }

    switchCamera(ortho_flag, init) {
        var p0 = (init) ? null : this.camera.position.clone();
        var z0 = (init) ? null : this.camera.zoom;

        this.camera = (ortho_flag) ? this.oCamera : this.pCamera;

        if (init) {
            this.setupCamera(true, this.position);
        } else {
            this.controls.object = this.camera;
            // reposition to the last camera position
            this.setupCamera(false, p0, null, z0);
        }
    }

    setCamera = (dir) => {
        this.setupCamera(true, defaultDirections[dir]["position"], defaultDirections[dir]["rotateZ"], this.camera.zoom);
        this.update(true, false);
    }

    resize = () => {
        console.log("resize")
        this.camera.zoom = this.zoom0;
        this.camera.updateProjectionMatrix();
        this.update(true, false)
    }

    reset = () => {
        this.controls.reset();
        this.update(true, false)
    }

    setAxes = (flag) => {
        this.axesHelper.setVisible(flag);
        this.update(true, false)
    }

    setGrid = (action) => {
        this.gridHelper.setGrid(action);
        this.update(true, false)
    }

    setAxes0 = (flag) => {
        this.gridHelper.setCenter(flag);
        this.axesHelper.setCenter(flag);
        this.update(true, false)
    }

    setTransparent = (flag) => {
        this.nestedGroup.setTransparent(flag);
        this.update(true, false);
    }

    setBlackEdges = (flag) => {
        this.nestedGroup.setBlackEdges(flag);
        this.update(true, false);
    }

    setClipIntersection = (flag) => {
        this.nestedGroup.setClipIntersection(flag);
        this.update(true, false);
    }

    setLocalClipping(flag) {
        this.renderer.localClippingEnabled = flag;
        this.update(true, false);
    }

    setClipNormal = (index) => {
        const cameraPosition = this.camera.position.clone()
        const normal = cameraPosition.sub(this.controls.target).normalize().negate();

        this.clipping.setNormal(index, normal);
        this.nestedGroup.setClipPlanes(this.clipping.clipPlanes);
        this.update(true, false);
    }

    setObjects = (states) => {
        for (var key in this.states) {
            var oldState = this.states[key];
            var newState = states[key];
            var objectGroup = this.nestedGroup.groups[key];
            if (oldState[0] != newState[0]) {
                objectGroup.setShapeVisible(newState[0] === 1);
                this.states[key][0] = newState[0]
            }
            if (oldState[1] != newState[1]) {
                objectGroup.setEdgesVisible(newState[1] === 1);
                this.states[key][1] = newState[1]
            }
        }
        this.update(true, false);
    }

    setPlaneHelpers = (flag) => {
        this.clipping.planeHelpers.visible = flag;
        this.update(false, false);
    }

    refreshPlane = (index, value) => {
        this.clipping.setConstant(index, value);
        this.update(false, false);
    }

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
    }

    pick = (e) => {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const offsetX = rect.x + window.pageXOffset;
        const offsetY = rect.y + window.pageYOffset;
        this.mouse.x = ((e.pageX - offsetX) / this.width) * 2 - 1;
        this.mouse.y = -((e.pageY - offsetY) / this.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const objects = this.raycaster.intersectObjects(this.scene.children.slice(0, 1), true);
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
        console.log(nearest);
        this.info.bbInfo(nearest.path, nearest.name, nearest.boundingBox);
    }
}

export { Viewer, defaultDirections }