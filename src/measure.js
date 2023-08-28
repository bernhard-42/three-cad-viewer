import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";;
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
     * @param {THREE.Renderer} renderer The viewer renderer
     * @param {Vector3} point1 The starting point to measure
     * @param {Vector3} point2 The end point to measure
     * @param {boolean} decompose Wheveter to decompose the measurment per axis.
     */
    constructor(renderer, point1, point2, decompose = true) {

        super();
        this.point1 = point1;
        this.point2 = point2;
        this.renderer = renderer;
        this.lineScene = new THREE.Scene();
        this.panelScene = new THREE.Scene();
        this.sprite = null;
        this.decompose = decompose;
        this._makePanel();
        this._makeLines();
        this.lineScene.add(this);
    }

    _makeLines() {
        const lineWidth = 0.0025;
        const distanceLine = new DistanceLineArrow(this.point1, this.point2, 2 * lineWidth, 0xFF8C00);
        this.add(distanceLine);

        const middlePoint = new THREE.Vector3().addVectors(this.point1, this.point2).multiplyScalar(0.5);
        const connectingLine = new DistanceLineArrow(middlePoint, this.sprite.position, lineWidth, 0x800080);
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

    _makePanel() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 180;
        canvas.height = 160;

        // Draw the rounded rectangle
        context.fillStyle = 'rgba(255, 255, 255, 0.8)';
        context.strokeStyle = '#000';
        context.lineWidth = 2;
        const radius = 10;
        context.beginPath();
        context.moveTo(radius, 0);
        context.lineTo(canvas.width - radius, 0);
        context.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
        context.lineTo(canvas.width, canvas.height - radius);
        context.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
        context.lineTo(radius, canvas.height);
        context.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
        context.lineTo(0, radius);
        context.quadraticCurveTo(0, 0, radius, 0);
        context.closePath();
        context.fill();
        context.stroke();

        // Draw the title and lines
        context.font = 'Bold 16px Arial';
        context.fillStyle = '#000';
        context.textAlign = 'left';
        context.textBaseline = 'top';

        const title = 'Distance';
        context.fillText(title, 10, 10);
        const total = this.point1.distanceTo(this.point2);
        const distVec = this.point2.clone().sub(this.point1);
        const xdist = distVec.x;
        const ydist = distVec.y;
        const zdist = distVec.z;
        const lines = [`Total : ${total.toFixed(2)}`, `X : ${xdist.toFixed(2)}`, `Y : ${ydist.toFixed(2)}`, `Z : ${zdist.toFixed(2)}`];
        for (let i = 0; i < lines.length; i++) {
            context.fillText(lines[i], 10, 40 + i * 30); // Adjust the position and spacing
        }
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: false });

        this.sprite = new THREE.Sprite(spriteMaterial);
        this.sprite.position.y = 2;
        this.panelScene.add(this.sprite);
    }

    update(viewerCamera) {
        this.camera = viewerCamera.camera;
        this.renderer.clearDepth();
        this.renderer.render(this.lineScene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.panelScene, this.camera);
    }
}

export { Measurement };