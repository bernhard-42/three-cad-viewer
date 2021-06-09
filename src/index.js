import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CombinedCamera } from './pythreejs/cameras/CombinedCamera'
import { Assembly } from './assembly.js'
import { example } from './example.js'
import { BoundingBox } from './bbox.js'
import { Grid } from './grid.js'
import { UI } from './ui.js'
class Viewer {

    constructor(
        dark,
        bb_factor,
        position,
        zoom,
        ortho,
        black_edges,
        edge_color,
        ambient_intensity,
        direct_intensity,
        transparent,
        transparent_opyacity,
        normalLen
    ) {
        this.dark = dark;
        this.bb_factor = bb_factor;
        this.position = position;
        this.zoom = zoom;
        this.ortho = ortho;
        this.black_edges = black_edges;
        this.edge_color = edge_color;
        this.ambient_intensity = ambient_intensity;
        this.direct_intensity = direct_intensity;
        this.transparent = transparent;
        this.transparent_opyacity = transparent_opyacity;
        this.normalLen = normalLen;
        this.shapes = shapes;
        this.mapping = mapping;
        this.tree = tree;

        this.assembly = null;
        this.shapes = null;
        this.mapping = null;
        this.tree = null;
        this.geom = null;
        this.bbox = null;
        this.bb_max = 0;
        this.scene = null;
        this.grid = null;
        this.camera = null;
        this.controls = null;

        // setup renderer
        const container = document.getElementById('cad_view');

        this.renderer = new THREE.WebGLRenderer({
            alpha: !dark,
            antialias: true
        });

        this.width = container.clientWidth
        this.height = container.clientHeight
        this.renderer.setSize(this.width, this.height);
        container.appendChild(this.renderer.domElement);

        this.ui = new UI(this);
    }

    setCameraPosition = (center, position0) => {
        var cameraPosition = new THREE.Vector3(...position0).normalize().multiplyScalar(6 * this.bb_max);
        cameraPosition = cameraPosition.add(new THREE.Vector3(...center));
        this.camera.position.set(...cameraPosition.toArray());
        this.camera.up = new THREE.Vector3(0, 0, 1)
    }

    setOrthoCamera = (ortho_flag) => {
        if (ortho_flag) {
            this.camera.toOrthographic()
        } else {
            this.camera.toPerspective()
        }
    }

    resize = () => {
        this.camera.setZoom(this.zoom);
    }

    // render
    animate = () => {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dump = (assembly, ind) => {
        if (ind == undefined) {
            ind = ""
        }
        if (assembly.parts) {
            for (var part of assembly.parts) {
                dump(part, ind + "  ");
            }
        }
    }

    render = (shapes, mapping, tree) => {
        this.shapes = shapes;
        this.mapping = mapping;
        this.tree = tree;

        // render the assembly
        this.assembly = new Assembly(
            shapes.parts[0],
            this.width,
            this.height,
            this.edge_color,
            this.transparent,
            this.transparent_opyacity,
            this.normalLen
        );
        this.geom = this.assembly.render();

        var b = new THREE.Box3().setFromObject(this.geom);
        this.bbox = new BoundingBox(b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z)
        this.bb_max = this.bbox.max_dist_from_center()

        // build the scene
        this.scene = new THREE.Scene();
        this.scene.add(this.geom);

        const amb_light = new THREE.AmbientLight(0xffffff, ambient_intensity);
        this.scene.add(amb_light);

        for (var xpos of [-this.bb_max, this.bb_max]) {
            for (var ypos of [-this.bb_max, this.bb_max]) {
                for (var zpos of [-this.bb_max, this.bb_max]) {
                    const directionalLight = new THREE.DirectionalLight(0xffffff, direct_intensity);
                    directionalLight.position.set(10 * xpos, 10 * ypos, 10 * zpos)
                    this.scene.add(directionalLight);
                }
            }
        }

        this.grid = new Grid(this.bbox, 10, true)
        for (var i = 0; i < 3; i++) {
            this.scene.add(this.grid.gridHelper[i]);
        }


        const axesHelper = new THREE.AxesHelper(100);
        this.scene.add(axesHelper);
        // define the camera

        this.camera = new CombinedCamera(
            this.width, this.height, 35,
            0.1, 10 * bb_factor * this.bb_max,
            0.1, 10 * bb_factor * this.bb_max
        )

        this.setOrthoCamera(true);
        this.setCameraPosition(this.bbox.center, position);

        this.resize()

        // define the orbit controller
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target = new THREE.Vector3(...this.bbox.center);
        this.controls.saveState();

        this.animate()
    }
}


// 
// main
//

// input parameters
const dark = false;
const bb_factor = 1.0;
const position = [1, 1, 1];
const zoom = 2.0;
const ortho = true;
const black_edges = false;
const edge_color = black_edges ? 0x000000 : 0x707070;
const ambient_intensity = 0.5;
const direct_intensity = 0.3;
const transparent = false;
const transparent_opyacity = 0.5;
const normalLen = 0;
const shapes = example.shapes;
const mapping = example.mapping;
const tree = example.tree;
// const bb = example.bb;
// console.log(bb)

const viewer = new Viewer(
    dark,
    bb_factor,
    position,
    zoom,
    ortho,
    black_edges,
    edge_color,
    ambient_intensity,
    direct_intensity,
    transparent,
    transparent_opyacity,
    normalLen
)

viewer.render(shapes, mapping, tree);

// DEBUG stuff
global.viewer = viewer
