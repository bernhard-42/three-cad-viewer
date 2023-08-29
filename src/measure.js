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
    constructor(renderer, point1, point2, decompose = false) {

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
        this._makeHTMLPanel();
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

    _makeHTMLPanel() {

        const panel = document.createElement('div');
        panel.style.position = 'absolute';
        panel.style.width = '160px';
        panel.style.height = '200px';
        panel.style.background = 'radial-gradient(circle, rgba(169, 169, 169, 1) 0%, rgba(169, 255, 255, 0.8) 100%)';
        panel.style.border = '1.5px solid #000';
        panel.style.fontFamily = 'Calibri, sans-serif';
        panel.style.textAlign = 'center';

        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.fontSize = '25px';
        title.style.lineHeight = '40px';
        title.style.color = "Black";
        title.style.backgroundColor = 'rgba(169, 169, 169, 1)';
        title.textContent = 'Distance';
        panel.appendChild(title);

        const total = this.point1.distanceTo(this.point2);
        const distVec = this.point2.clone().sub(this.point1);
        const xdist = distVec.x;
        const ydist = distVec.y;
        const zdist = distVec.z;
        const lines = [{ text: `Total : ${total.toFixed(2)}`, class: 'line', color: "black" },
        { text: `X : ${xdist.toFixed(2)}`, class: 'line', color: "red" },
        { text: `Y : ${ydist.toFixed(2)}`, class: 'line', color: "green" },
        { text: `Z : ${zdist.toFixed(2)}`, class: 'line', color: "blue" },
        ];

        lines.forEach(lineData => {
            const line = document.createElement('div');
            line.style.fontWeight = 'bold';
            line.style.color = lineData.color;
            line.style.fontSize = '20px';
            line.style.lineHeight = '30px';
            line.style.paddingLeft = '10px';
            line.classList.add(lineData.class);
            line.textContent = lineData.text;
            panel.appendChild(line);
        });

        panel.style.top = '200px';
        panel.style.left = '300px';

        document.body.appendChild(panel);
    }

    _makePanel() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const xpadding = 10;
        const ypadding = 10;
        canvas.width = 160;
        canvas.height = 200;
        const titleRectHeight = 40;
        const yAxisSpacing = (canvas.height - titleRectHeight - ypadding) / 4;
        const borderWidth = 3;
        // const yAxisSpacing = (canvas.height - titleRectHeight) / 3;

        // Create the circular gradient background
        const gradient = context.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, canvas.width / 2
        );
        gradient.addColorStop(0, 'rgba(255, 0, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = 'rgba(255, 255, 255, 0.8)';
        context.strokeStyle = '#000';
        context.lineWidth = borderWidth;
        context.rect(0, 0, canvas.width, canvas.height);
        context.fill();
        context.stroke();

        const total = this.point1.distanceTo(this.point2);
        const distVec = this.point2.clone().sub(this.point1);
        const xdist = distVec.x;
        const ydist = distVec.y;
        const zdist = distVec.z;
        const lines = [`Total : ${total.toFixed(2)}`, `X : ${xdist.toFixed(2)}`, `Y : ${ydist.toFixed(2)}`, `Z : ${zdist.toFixed(2)}`];

        context.fillStyle = "black";
        context.fillStyle = "black";
        context.font = 'Bold 25px Calibri';
        const title = 'Distance';
        context.textAlign = "center";
        context.textBaseline = 'middle';
        context.fillText(title, canvas.width / 2, titleRectHeight / 2);
        context.strokeStyle = '#000';
        context.lineWidth = borderWidth;
        context.beginPath();
        context.moveTo(0, titleRectHeight);
        context.lineTo(canvas.width, titleRectHeight);
        context.stroke();

        context.font = 'Bold 20px Calibri';
        context.textAlign = "left";
        context.textBaseline = 'top';
        const colors = ["black", "red", "green", "blue"];
        for (let i = 0; i < lines.length; i++) {
            context.fillStyle = colors[i];
            context.fillText(lines[i], xpadding, ypadding + titleRectHeight + i * yAxisSpacing);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;;
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: false });

        this.sprite = new THREE.Sprite(spriteMaterial);
        this.sprite.position.y = 2;
        this.panelScene.add(this.sprite);
    }

    update(viewerCamera) {
        this.camera = viewerCamera.camera;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.clearDepth();
        this.renderer.render(this.lineScene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.panelScene, this.camera);
    }
}

export { Measurement };