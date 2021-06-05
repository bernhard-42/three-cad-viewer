import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CombinedCamera } from './pythreejs/cameras/CombinedCamera'
import { Assembly } from './assembly.js'
import { example } from './example.js'
import { BoundingBox } from './bbox.js'

// input parameters
const dark = false;
const bb_factor = 1.0;
const position = [1, 1, 1];
const zoom = 1.2;
const ortho = true;
const black_edges = false;
const edge_color = black_edges ? 0x000000 : 0x707070;
const transparent = true;
const transparent_opyacity = 0.5;
const shapes = example.shapes;
const mapping = example.mapping;
const tree = example.tree;
const bb = example.bb;


const defaultDirections = {
    "front": { "position": [1, 0, 0] },
    "rear": { "position": [-1, 0, 0] },
    "top": { "position": [0, 0, 1] },
    "bottom": { "position": [0, 0, -1] },
    "left": { "position": [0, 1, 0] },
    "right": { "position": [0, -1, 0] },
    "iso": { "position": [1, 1, 1] }
}

const setCameraPosition = (center, position0) => {
    var cameraPosition = new THREE.Vector3(...position0).normalize().multiplyScalar(6 * bb_max);
    cameraPosition = cameraPosition.add(new THREE.Vector3(...center));
    camera.position.set(...cameraPosition.toArray());
}

const setOrthoCamera = (ortho_flag) => {
    if (ortho_flag) {
        camera.toOrthographic()
    } else {
        camera.toPerspective()
    }
}

const setOrtho = (e) => {
    const flag = !!e.target.checked;
    setOrthoCamera(flag);
}

const setTransparency = (e) => {
    const flag = !!e.target.checked;
    assembly.setTransparent(flag);
}

const setBlackEdges = (e) => {
    const flag = !!e.target.checked;
    assembly.setBlackEdges(flag);
}

const reset = () => {
    setCameraPosition(bbox.center, defaultDirections["iso"]["position"])
    camera.setZoom(zoom);
    camera.lookAt(bbox.center);
    controls.target = controls.target0;
}

const resize = () => {
    camera.setZoom(zoom);
}

const setView = (e) => {
    const dir = defaultDirections[e.target.className]["position"]
    setCameraPosition(bbox.center, dir);
}

// render
const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

const dump = (assembly, ind) => {
    if (ind == undefined) {
        ind = ""
    }
    if (assembly.parts) {
        for (var part of assembly.parts) {
            dump(part, ind + "  ");
        }
    }
}

//
// main
//

// setup renderer
const container = document.getElementById('cad_view');
const renderer = new THREE.WebGLRenderer({
    alpha: !dark,
    antialias: true
});
const width = container.clientWidth
const height = container.clientHeight
renderer.setSize(width, height);
container.appendChild(renderer.domElement);

// configure the UI
document.querySelector('.ortho').addEventListener('change', setOrtho);
document.querySelector('.ortho').checked = ortho;
document.querySelector('.reset').addEventListener('click', reset);
document.querySelector('.resize').addEventListener('click', resize);
document.querySelector('.transparent').addEventListener('change', setTransparency);
document.querySelector('.transparent').checked = transparent;
document.querySelector('.black_edges').addEventListener('change', setBlackEdges);
document.querySelector('.black_edges').checked = black_edges;

["front", "rear", "top", "bottom", "left", "right", "iso"].forEach((b) => {
    document.querySelector(`.${b}`).addEventListener('click', setView);
})


// render the assembly
var assembly = new Assembly(shapes.parts[0], width, height, edge_color, transparent, transparent_opyacity);
var geom = assembly.render();

// use the provided bounding box
const bbox = new BoundingBox(bb)
const bb_max = bbox.max_dist_from_center()

// build the scene
const scene = new THREE.Scene();
scene.add(geom);

const amb_light = new THREE.AmbientLight(0xffffff);
scene.add(amb_light);

// define the camera

var camera = new CombinedCamera(
    width, height, 35,
    0.1, 10 * bb_factor * bb_max,
    0.1, 10 * bb_factor * bb_max
)
camera.up = new THREE.Vector3(0, 0, 1)
setCameraPosition(bbox.center, position);
setOrthoCamera(true);
resize()

// define the orbit controller
const controls = new OrbitControls(camera, renderer.domElement);

animate()
global.geom = geom
global.scene = scene
global.example = example
global.assembly = assembly
global.camera = camera
global.controls = controls