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
const zoom = 1;
const ortho = true;
const black_edges = false;
const edge_color = black_edges ? 0x000000 : 0x707070;
const transparent = false;
const shapes = example;

const renderer = new THREE.WebGLRenderer({
    alpha: !dark,
    antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);


// render the assembly
var assembly = new Assembly(shapes, window.innerWidth, window.innerHeight, edge_color, transparent);
var geom = assembly.render();

// use the provided bounding box
const bb = new BoundingBox(example.bb)
const bb_max = bb.max_dist_from_center()

// build the scene
const scene = new THREE.Scene();
scene.add(geom);

const amb_light = new THREE.AmbientLight(0xffffff);
scene.add(amb_light);

// define the camera

const camera_position = new THREE.Vector3(...position).normalize().multiplyScalar(6 * bb_max);

var camera = new CombinedCamera(
    window.innerWidth, window.innerHeight, 35,
    0.1, 12 * bb_factor * bb_max,
    0.1, 12 * bb_factor * bb_max
)
camera.up = new THREE.Vector3(0, 0, 1)
camera.position.set(...camera_position.toArray());
camera.toOrthographic()

// define the orbit controller
const controls = new OrbitControls(camera, renderer.domElement);

// render
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate()
global.geom = geom
global.scene = scene
global.example = example
