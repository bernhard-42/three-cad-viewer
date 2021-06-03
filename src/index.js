import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Assembly } from './assembly.js'
import { example } from './example.js'
import { BoundingBox } from './bbox.js'


const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// input parameters
const bb_factor = 1.0;
const position = [1, 1, 1];
const zoom = 1;
const ortho = true;
const black_edges = false;
const edge_color = black_edges ? 0x000000 : 0x707070;
const transparent = true;
const shapes = example;

// render the assembly
var assembly = new Assembly(shapes, edge_color, transparent);
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

var camera = null;

if (ortho) {
    camera = new THREE.OrthographicCamera(
        -window.innerWidth / 2,
        window.innerWidth / 2,
        window.innerHeight / 2,
        -window.innerHeight / 2,
    );
    camera.zoom = 2 * zoom;
} else {
    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight);
}
camera.up = new THREE.Vector3(0, 0, 1)
camera.near = 0.1;
camera.far = 10 * bb_factor * bb_max;
camera.position.set(...camera_position.toArray());

camera.updateProjectionMatrix()

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
