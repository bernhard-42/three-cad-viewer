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
    constructor(point1, point2, linewidth, color, withStart = true) {
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

        if (withStart) {
            this.add(startCone);
        }
        this.add(endCone);
        this.add(line);
    }
}

class Measurement {
    /**
     * 
     * @param {import ("../viewer.js").Viewer} viewer The viewer instance
     * @param {HTMLElement} panel The panel to display
     */
    constructor(viewer, panel) {

        this.selectedGeoms = [];
        this.point1 = null;
        this.point2 = null;
        this.contextEnabled = false; // Tells if the measure context is active
        this.viewer = viewer;
        this.scene = new THREE.Scene();
        this.panel = panel;
        this.panelCenter = null;

        this.panelDragData = { x: null, y: null, clicked: false };
        this.panel.addEventListener("mousedown", (e) => {
            this.panelDragData.clicked = true;
            this.panelDragData.x = e.clientX;
            this.panelDragData.y = e.clientY;
            e.stopPropagation();
        });
        document.addEventListener("mouseup", (e) => {
            this.panelDragData.clicked = false;
            e.stopPropagation();
        });
        document.addEventListener("mousemove", this._dragPanel);


    }

    enableContext() {
        this.contextEnabled = true;
        this.panelCenter = new Vector3(1, 0, 0);

    }

    disableContext() {
        this.contextEnabled = false;
        this.selectedGeoms = [];
        this._hideMeasurement();
    }

    _hideMeasurement() {
        this.panel.style.display = "none";
        // this.panelCenter = null;
        this.scene.clear();
    }

    _setMeasurementVals() {
        throw new Error("Subclass needs to override this method");
    }

    _makeLines() {
        throw new Error("Subclass needs to override this method");
    }

    /**
     * Get the maximum number of selected obj this measurement can handle
     * @returns {int} The numbers of obj handled by the measurement
     */
    _getMaxObjSelected() {
        throw new Error("Subclass needs to override this method");
    }

    _updateMeasurement() {
        if (this.selectedGeoms.length != this._getMaxObjSelected()) {
            this._hideMeasurement();
            return;
        }
        // this._computePanelCenter(); // TODO Implement good logic for initialisation
        this._makeLines();
        this._setMeasurementVals();
        this.panel.style.display = "block";
        this._movePanel();
    }


    _computePanelCenter() {

        const camera = this.viewer.camera.getCamera();
        const zCam = new THREE.Vector3();
        const xCam = new THREE.Vector3();
        const yCam = new THREE.Vector3();

        camera.getWorldDirection(zCam);
        zCam.multiplyScalar(-1);
        // Check if zCam is parallel to camera.up
        if (Math.abs(zCam.dot(camera.up)) >= 0.99) {
            // Choose a different vector to cross with zCam
            xCam.crossVectors(new THREE.Vector3(1, 0, 0), zCam).normalize();
        } else {
            xCam.crossVectors(camera.up, zCam).normalize();
        }
        yCam.crossVectors(zCam, xCam).normalize();
        const offsetDistance = this.viewer.bbox.boundingSphere().radius;
        this.panelCenter = this.viewer.bbox.boundingSphere().center.add(xCam.multiplyScalar(offsetDistance));
    }

    /**
     * React to each new selected element in the viewer.
     * @param {import ("../nestedgroup.js").ObjectGroup} objGroup 
     */
    handleSelection = (objGroup) => {

        this._hideMeasurement();
        if (this.selectedGeoms.length == this._getMaxObjSelected()) {
            this.removeLastSelectedObj();
        }
        this.selectedGeoms.push(objGroup);

        this._updateMeasurement();
    };

    _movePanel = () => {

        var worldCoord = this.panelCenter;
        var screenCoord = worldCoord.clone().project(this.viewer.camera.getCamera());
        screenCoord.x = Math.round((1 + screenCoord.x) * this.viewer.renderer.domElement.offsetWidth / 2);
        screenCoord.y = Math.round((1 - screenCoord.y) * this.viewer.renderer.domElement.offsetHeight / 2);
        const panelStyle = window.getComputedStyle(this.panel);
        this.panel.style.left = screenCoord.x - parseFloat(panelStyle.width) / 2 + "px";
        this.panel.style.top = screenCoord.y - parseFloat(panelStyle.height) / 2 + "px";
    };

    /**
     * This handler is responsible to update the panel center vector when the user drag the panel on the screen.
     * @param {Event} e 
     * @returns 
     */
    _dragPanel = (e) => {
        if (!this.panelDragData.clicked)
            return;

        const viewer = this.viewer;
        const camera = viewer.camera.getCamera();

        let x = e.clientX - this.panelDragData.x;
        let y = e.clientY - this.panelDragData.y;
        const viewerWidth = this.viewer.renderer.domElement.offsetWidth;
        const viewerHeight = this.viewer.renderer.domElement.offsetHeight;
        const viewerToClientWidthRatio = (0.5 * viewerWidth) / document.documentElement.clientWidth; // I dont get why we need to use half of the viewer width
        const viewerToClientHeightRatio = (0.5 * viewerHeight) / document.documentElement.clientHeight;

        x /= document.documentElement.clientWidth; // x becomes a percentage of the client width
        y /= document.documentElement.clientHeight;
        x /= viewerToClientWidthRatio; // rescale the x value so it represent a percentage of the viewer width
        y /= viewerToClientHeightRatio;

        // First transform world vec in screen vec
        // Then add the offset vec and then retransform back to world vec
        const panelCenter = this.panelCenter.clone().project(camera);
        const offsetVec = new THREE.Vector3(x, -y, 0);
        panelCenter.add(offsetVec);
        panelCenter.unproject(camera);
        this.panelCenter = panelCenter;

        // Clear and update the scene
        this.scene.clear();
        this._updateMeasurement();

        // Update the drag start position
        this.panelDragData.x = e.clientX;
        this.panelDragData.y = e.clientY;
    };

    removeLastSelectedObj() {
        const lastItem = this.selectedGeoms.pop();
        if (lastItem)
            lastItem.clearHighlights();
        this._updateMeasurement();
    }


    update() {
        const camera = this.viewer.camera.getCamera();
        this.viewer.renderer.clearDepth();
        this.viewer.renderer.render(this.scene, camera);
        this._movePanel();
    }
}

class DistanceMeasurement extends Measurement {
    constructor(viewer) {
        super(viewer, viewer.display.measurePanel);
        this.point1 = null;
        this.point2 = null;
    }


    _setMeasurementVals() {
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

    _getMaxObjSelected() {
        return 2;
    }

    _getPoints() {
        const obj1 = this.selectedGeoms[0];
        const obj2 = this.selectedGeoms[1];
        this.point1 = obj1.children[0].geometry.boundingSphere.center;
        this.point2 = obj2.children[0].geometry.boundingSphere.center;
    }

    _makeLines() {

        this._getPoints();

        const lineWidth = 0.0025;
        const distanceLine = new DistanceLineArrow(this.point1, this.point2, 2 * lineWidth, 0xFF8C00);
        this.scene.add(distanceLine);

        const middlePoint = new THREE.Vector3().addVectors(this.point1, this.point2).multiplyScalar(0.5);
        const connectingLine = new DistanceLineArrow(this.panelCenter, middlePoint, lineWidth, 0x800080, false);
        this.scene.add(connectingLine);
    }

}

class SizeMeasurement extends Measurement {
    constructor(viewer) {
        super(viewer, viewer.display.measureSizePanel);
    }

    _hideRows() {
        this.panel.querySelector("#volume_row").style.display = "none";
        this.panel.querySelector("#area_row").style.display = "none";
        this.panel.querySelector("#length_row").style.display = "none";
    }

    _setMeasurementVals() {
        this._hideRows();
        const obj = this.selectedGeoms[0];
        const isLine = obj.name.match(/.*\|.*edges/);;
        const isFace = obj.name.match(/.*\|.*faces/);;
        let row;
        if (isLine) {
            this.panel.querySelector("#length").textContent = 12;
            row = this.panel.querySelector("#length_row");
        }
        else if (isFace) {
            this.panel.querySelector("#area").textContent = 68;
            row = this.panel.querySelector("#area_row");
        }
        row.style.display = "block";
    }

    _getMaxObjSelected() {
        return 1;
    }

    _makeLines() {

        const lineWidth = 0.0025;

        const middlePoint = this.selectedGeoms[0].children[0].geometry.boundingSphere.center;
        const connectingLine = new DistanceLineArrow(this.panelCenter, middlePoint, lineWidth, 0x800080, false);
        this.scene.add(connectingLine);
    }


}

export { DistanceMeasurement, SizeMeasurement };