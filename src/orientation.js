import * as THREE from 'three';
import { RGBA_ASTC_10x5_Format } from 'three';
import { AxesHelper } from './axes.js';

class OrientationMarker {
    constructor(camera, dark) {
        this.cad_camera = camera;
        this.dark = dark;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
    }

    create = () => {
        const container = document.getElementById('cad_inset');
        const width = container.clientWidth;
        const height = container.clientHeight;
        const size = 2.7;
        const length = 60;

        // renderer
        this.renderer = new THREE.WebGLRenderer({ alpha: !this.dark, antialias: true });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        // scene
        this.scene = new THREE.Scene();

        // camera
        // this.camera = new THREE.PerspectiveCamera(50, width / height, 1, 1000);
        this.camera = new THREE.OrthographicCamera(-width, width, height, -height, 1, 1000);
        this.camera.up = this.cad_camera.up; // important!

        // axes
        const axes = new AxesHelper([0, 0, 0], length, size, width, height, true, true);
        this.scene.add(axes);

        const colors = [
            [1, 0, 0],
            [0, 0.7, 0],
            [0, 0, 1]
        ];
        this.cones = [];
        for (var i = 0; i < 3; i++) {
            var coneGeometry = new THREE.CylinderGeometry(0, 3 * size, 6 * size, 20, 1);
            const coneMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(...colors[i]),
                toneMapped: false
            });
            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.matrixAutoUpdate = false;
            this.cones.push(cone);
        }

        this.cones[0].geometry.rotateZ(-Math.PI / 2);
        this.cones[0].geometry.translate(length, 0, 0);
        this.cones[1].geometry.translate(0, length, 0);
        this.cones[2].geometry.rotateX(Math.PI / 2);
        this.cones[2].geometry.translate(0, 0, length);

        this.scene.add(...this.cones);

        const geometry = new THREE.SphereGeometry(3 * size, 20, 20);
        const material = new THREE.MeshBasicMaterial({ color: 0xa0a0a0 });
        const sphere = new THREE.Mesh(geometry, material);
        this.scene.add(sphere);
    }

    update = (position, target) => {
        this.camera.position.copy(position);
        this.camera.position.sub(target);
        this.camera.position.setLength(300);
        this.camera.lookAt(this.scene.position);
    }

    render = () => {
        this.renderer.render(this.scene, this.camera)
    }
}

export { OrientationMarker }