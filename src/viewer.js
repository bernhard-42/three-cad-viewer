import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Assembly } from './assembly.js'
import { BoundingBox } from './bbox.js'
import { Grid } from './grid.js'
import { AxesHelper } from './axes.js'
import { OrientationMarker } from './orientation.js'
import { TreeView } from './treeview.js'
import { PlaneHelper } from './planehelper.js'

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
};

// Orbit controls does not work properly if the camera is looking straight down or straight up
// https://stackoverflow.com/questions/42520648/how-do-i-make-the-orbitcontrols-in-three-js-honor-changes-to-orientation-of-the#comment72227004_42520648
// hence "top" and "bottom" are slightly changed

const defaultDirections = {
    "iso": { "position": [1, 1, 1] },
    "front": { "position": [1, 0, 0] },
    "rear": { "position": [-1, 0, 0] },
    "left": { "position": [0, 1, 0] },
    "right": { "position": [0, -1, 0] },
    "top": { "position": [0, 1e-9, 1] },
    "bottom": { "position": [0, 1e-9, -1] }
}

class Viewer {

    constructor(
        display,
        dark,
        bbFactor,
        position,
        zoom,
        grid,
        axes,
        axes0,
        ortho,
        blackEdges,
        edgeColor,
        ambientIntensity,
        directIntensity,
        transparent,
        transparentOpacity,
        normalLen
    ) {
        this.display = display;
        this.dark = dark;
        this.bbFactor = bbFactor;
        this.position = position;
        this.zoom0 = zoom;
        this.grid = grid;
        this.axes = axes;
        this.ortho = ortho;
        this.axes0 = axes0;
        this.blackEdges = blackEdges;
        this.edgeColor = edgeColor;
        this.ambientIntensity = ambientIntensity;
        this.directIntensity = directIntensity;
        this.transparent = transparent;
        this.transparentOpacity = transparentOpacity;
        this.normalLen = normalLen;

        this.assembly = null;
        this.shapes = null;
        this.mapping = null;
        this.tree = null;
        this.geom = null;
        this.bbox = null;
        this.bb_max = 0;
        this.zoom = zoom;
        this.scene = null;
        this.gridHelper = null;
        this.axesHelper = null;
        this.camera = null;
        this.controls = null;
        this.orientationMarker = null;
        this.treeview = null;
        this.normals = [];

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2()

        // setup renderer
        this.renderer = new THREE.WebGLRenderer({
            alpha: !dark,
            antialias: true
        });
        [this.width, this.height] = this.display.getCadViewSize();
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.renderer.localClippingEnabled = true;

        this.renderer.domElement.addEventListener('click', this.pick, false);

        this.display.addCadView(this.renderer.domElement);

        this.display.setupUI(this);
    }

    dump(assembly, ind) {
        if (ind == undefined) {
            ind = ""
        }
        if (assembly.parts) {
            for (var part of assembly.parts) {
                dump(part, ind + "  ");
            }
        }
    }

    getGroup(path) {
        var group = this.geom;
        for (var i = 1; i < path.length; i++) {
            var key = path[i];
            group = group.children[key];
        }
        return group;
    }

    initObjects() {
        for (var key in this.states) {
            const state = this.states[key];
            var objectGroup = this.getGroup(this.paths[key])
            objectGroup.setShapeVisible(state[0] === 1);
            objectGroup.setEdgesVisible(state[1] === 1);
        }
    }

    render(shapes, tree, states, paths) {
        this.shapes = shapes;
        this.tree = tree;
        this.states = states;
        this.paths = paths;

        // build tree view

        this.treeview = new TreeView(clone(this.states), this.tree, this.setObjects);
        this.display.addCadTree(this.treeview.render());

        // clipping planes, need to be available before building the assembly 
        this.normals.push(new THREE.Vector3(-1, 0, 0));
        this.normals.push(new THREE.Vector3(0, -1, 0));
        this.normals.push(new THREE.Vector3(0, 0, -1));
        this.clipPlanes = this.normals.map((n) => new THREE.Plane(n, 0));

        // render the assembly

        this.assembly = new Assembly(
            shapes.parts[0],
            this.width,
            this.height,
            this.edgeColor,
            this.transparent,
            this.transparentOpacity,
            this.normalLen,
            this.clipPlanes
        );
        this.geom = this.assembly.render();

        var b = new THREE.Box3().setFromObject(this.geom);
        this.bbox = new BoundingBox(b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z)
        this.bb_max = this.bbox.max_dist_from_center()

        // build the scene

        this.scene = new THREE.Scene();
        this.scene.add(this.geom);

        // add lights

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

        // add axes and grid

        this.gridHelper = new Grid(this.display, this.bbox, 10, this.axes0, this.grid ? [true, true, true] : [false, false, false])
        for (var i = 0; i < 3; i++) {
            this.scene.add(this.gridHelper.gridHelper[i]);
        }

        const gsize = this.gridHelper.size;
        const gsize2 = this.gridHelper.size / 2;

        this.axesHelper = new AxesHelper(this.bbox.center, gsize2, 2, this.width, this.height, this.axes0, this.axes);
        this.scene.add(this.axesHelper);

        // clipping planes and helpers
        for (var i = 0; i < 3; i++) {
            this.clipPlanes[i].constant = gsize2 + this.bbox.center[i];
            this.display.setNormal(i, this.clipPlanes[i].normal.toArray())
        }

        this.planeHelpers = new THREE.Group();
        this.planeHelpers.add(new PlaneHelper(this.clipPlanes[0], this.bbox.center, gsize, 0xff0000));
        this.planeHelpers.add(new PlaneHelper(this.clipPlanes[1], this.bbox.center, gsize, 0x00ff00));
        this.planeHelpers.add(new PlaneHelper(this.clipPlanes[2], this.bbox.center, gsize, 0x0000ff));
        this.planeHelpers.visible = false;
        this.scene.add(this.planeHelpers);

        // this.display.adaptSliders([[b.min.x, b.max.x], [b.min.y, b.max.y], [b.min.z, b.max.z]]);
        this.display.adaptSliders([
            [-gsize2, gsize2],
            [-gsize2, gsize2],
            [-gsize2, gsize2]
        ]);

        // define the camera
        var distance = 6 * this.bb_max;
        var diag = Math.sqrt((this.height * this.height) + (this.width * this.width))
        var fov = 2 * Math.atan(diag / (2 * distance)) * 180 / Math.PI;

        this.pCamera = new THREE.PerspectiveCamera(
            fov,
            this.width / this.height,
            0.1,
            100 * this.bb_max)

        this.oCamera = new THREE.OrthographicCamera(
            this.width / -2, this.width / 2,
            this.height / 2, this.height / -2,
            0.1,
            10 * this.bbFactor * this.bb_max
        )

        this.setOrthoCamera(true);

        // define the orientation marker

        const [insetWidth, insetHeight] = this.display.getCadInsetSize();
        this.orientationMarker = new OrientationMarker(insetWidth, insetHeight, this.camera);
        this.display.addCadInset(this.orientationMarker.create());

        // show the rendering

        this.animate();
        this.initObjects();
    }

    // handler 

    resize = () => {
        this.camera.zoom = this.zoom0;
        this.camera.updateProjectionMatrix();
    }

    reset = () => {
        this.controls.reset();
    }

    setCamera = (dir) => {
        this.setCameraPosition(defaultDirections[dir]["position"]);
    }

    setTransparent = (flag) => {
        this.assembly.setTransparent(flag);
    }

    setBlackEdges = (flag) => {
        this.assembly.setBlackEdges(flag);
    }

    setCameraPosition(dir) {
        var cameraPosition;
        if (this.camera.type === "OrthographicCamera") {
            cameraPosition = new THREE.Vector3(...dir).normalize().multiplyScalar(6 * this.bb_max);
        } else {
            cameraPosition = new THREE.Vector3(...dir).normalize().multiplyScalar(3.5 * this.bb_max);
        }
        const center = new THREE.Vector3(...this.bbox.center);
        cameraPosition = cameraPosition.add(center);

        this.camera.position.set(...cameraPosition.toArray());
        this.camera.up = new THREE.Vector3(0, 0, 1)
        this.camera.lookAt(center);
        this.camera.zoom = this.zoom0;
        this.camera.updateProjectionMatrix();
    }

    setOrthoCamera(ortho_flag) {
        if (ortho_flag) {
            this.camera = this.oCamera;
        } else {
            this.camera = this.pCamera;
        }

        this.setCameraPosition(this.position);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.listenToKeyEvents(window);
        this.controls.target = new THREE.Vector3(...this.bbox.center);
        this.controls.update();
        this.controls.saveState();
    }

    // handler (bound to Viewer instance)

    _render() {
        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        this.orientationMarker.update(this.camera.position, this.controls.target);
        this.orientationMarker.render();
    }

    animate = () => {
        requestAnimationFrame(this.animate);
        this._render();
    }

    setObjects = (states) => {
        for (var i in this.states) {
            var oldState = this.states[i];
            var newState = states[i];
            var objectGroup = this.getGroup(this.paths[i])
            if (oldState[0] != newState[0]) {
                objectGroup.setShapeVisible(newState[0] === 1);
                this.states[i][0] = newState[0]
            }
            if (oldState[1] != newState[1]) {
                objectGroup.setEdgesVisible(newState[1] === 1);
                this.states[i][1] = newState[1]
            }
        }
    }

    setPlaneHelpers = (flag) => {
        this.planeHelpers.visible = flag;
    }

    refreshPlane = (index, value) => {
        if (this.clipPlanes) {
            this.clipPlanes[index].constant = value;
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
                    name: object.object.name,
                    boundingBox: object.object.geometry.boundingBox,
                    boundingSphere: object.object.geometry.boundingSphere,
                    mesh: object.object
                };
                break;
            }
        }
        console.log(nearest);
    }
}

export { Viewer, defaultDirections }