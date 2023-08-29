import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Vector3 } from "three";


class DistanceLineArrow extends THREE.Group {

    /**
     * 
     * @param {Vector3} point1 The start point of the line
     * @param {Vector3} point2 The end point of the lind
     * @param {number} linewidth The thickness of the line
     * @param {THREE.Color} color The color of the line
     */
    constructor(point1, point2, linewidth, color) {
        super();
        const coneLength = 0.08;
        const lineVec = point1.clone().sub(point2.clone()).normalize();
        const start = point1.clone().sub(lineVec.clone().multiplyScalar(coneLength / 2));
        const end = point2.clone().sub(lineVec.clone().multiplyScalar(-coneLength / 2));

        const geom = new LineSegmentsGeometry();
        geom.setPositions([...start.toArray(), ...end.toArray()]);
        const material = new LineMaterial({ linewidth: linewidth, color: color });
        const line = new LineSegments2(geom, material);

        const coneGeom = new THREE.ConeGeometry(linewidth * 6, coneLength, 10);
        const coneMaterial = new THREE.MeshBasicMaterial({ color: color });
        const startCone = new THREE.Mesh(coneGeom, coneMaterial);
        const endCone = new THREE.Mesh(coneGeom, coneMaterial);
        coneGeom.center();
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        matrix.lookAt(point1, point2, startCone.up);
        quaternion.setFromRotationMatrix(matrix);
        startCone.setRotationFromQuaternion(quaternion);
        matrix.lookAt(point2, point1, endCone.up);
        quaternion.setFromRotationMatrix(matrix);
        endCone.setRotationFromQuaternion(quaternion);
        startCone.rotateX((90 * Math.PI) / 180);
        endCone.rotateX((90 * Math.PI) / 180);

        startCone.position.copy(start);
        endCone.position.copy(end);

        this.add(startCone);
        this.add(endCone);
        this.add(line);
    }
}



class Measurement extends THREE.Group {
    /**
     * 
     * @param {import ("./viewer.js").Viewer} viewer The viewer instance
     * @param {Vector3} point1 The starting point to measure
     * @param {Vector3} point2 The end point to measure
     * @param {boolean} decompose Wheveter to decompose the measurment per axis.
     */
    constructor(viewer, point1, point2, decompose = false) {

        super();
        this.panel = null;
        this.point1 = point1;
        this.point2 = point2;
        this.viewer = viewer;
        this.renderer = viewer.renderer;
        this.lineScene = new THREE.Scene();
        this.panelScene = new THREE.Scene();
        this.decompose = decompose;
        this.lineScene.add(this);
        this.panel = this.viewer.display.measurePanel;
        this.viewer.display.showMeasurePanel(true);
        this.initialPos = new Vector3(0, 1, 0).multiplyScalar(this.viewer.bbox.boundingSphere().radius);
        this._makeLines();
        this._makeMeasurement();
        this.movePanel();
    }

    _makeLines() {
        const lineWidth = 0.0025;
        const distanceLine = new DistanceLineArrow(this.point1, this.point2, 2 * lineWidth, 0xFF8C00);
        this.add(distanceLine);

        const middlePoint = new THREE.Vector3().addVectors(this.point1, this.point2).multiplyScalar(0.5);
        const connectingLine = new DistanceLineArrow(middlePoint, this.initialPos, lineWidth, 0x800080);
        this.add(connectingLine);

        if (this.decompose) {
            // Create axes lines
            const xEnd = new Vector3(this.point2.x, this.point1.y, this.point1.z);
            const xLine = new DistanceLineArrow(this.point1, xEnd, lineWidth, 0xff0000);
            this.add(xLine);

            const yEnd = new Vector3(xEnd.x, this.point2.y, xEnd.z);
            const yLine = new DistanceLineArrow(xEnd, yEnd, lineWidth, 0x00ff00);
            this.add(yLine);

            const zLine = new DistanceLineArrow(yEnd, this.point2, lineWidth, 0x0000ff);
            this.add(zLine);
        }

    }

    movePanel() {
        var worldCoord = this.initialPos;
        var screenCoord = worldCoord.clone().project(this.viewer.camera.getCamera());
        screenCoord.x = Math.round((1 + screenCoord.x) * this.viewer.renderer.domElement.offsetWidth / 2);
        screenCoord.y = Math.round((1 - screenCoord.y) * this.viewer.renderer.domElement.offsetHeight / 2);
        const panelStyle = window.getComputedStyle(this.panel);
        this.panel.style.left = screenCoord.x - parseFloat(panelStyle.width) / 2 + "px";
        this.panel.style.top = screenCoord.y - parseFloat(panelStyle.height) / 2 + "px";
        console.log(screenCoord);
    }


    _makeMeasurement() {
        const total = this.point1.distanceTo(this.point2);
        const distVec = this.point2.clone().sub(this.point1);
        const xdist = distVec.x;
        const ydist = distVec.y;
        const zdist = distVec.z;
        this.panel.querySelector("#total").textContent = total.toFixed(2);
        this.panel.querySelector("#x").textContent = xdist.toFixed(2);
        this.panel.querySelector("#y").textContent = ydist.toFixed(2);
        this.panel.querySelector("#z").textContent = zdist.toFixed(2);
    }

    update(viewerCamera) {
        this.camera = viewerCamera.camera;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.clearDepth();
        this.renderer.render(this.lineScene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.panelScene, this.camera);
        this._makeMeasurement();
        this.movePanel();
    }
}

export { Measurement };