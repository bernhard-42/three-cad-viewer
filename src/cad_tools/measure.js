import * as THREE from "three";
import { Vector3 } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { DistancePanel, PropertiesPanel } from "./ui.js";
import { deepDispose } from "../utils.js";

class DistanceLineArrow extends THREE.Group {
  /**
   *
   * @param {THREE.Vector3} point1 The start point of the line
   * @param {THREE.Vector3} point2 The end point of the line
   * @param {number} linewidth The thickness of the line
   * @param {THREE.Color} color The color of the line
   * @param {boolean} arrowStart If true, a cone is added at the start of the line
   * @param {boolean} arrowEnd If true, a cone is added at the end of the line
   */
  constructor(
    coneLength,
    point1,
    point2,
    linewidth,
    color,
    arrowStart = true,
    arrowEnd = true,
  ) {
    super();
    this.coneLength = coneLength;
    this.point1 = point1;
    this.point2 = point2;
    this.linewidth = linewidth;
    this.color = color;
    this.arrowStart = arrowStart;
    this.arrowEnd = arrowEnd;
    this.type = "DistanceLineArrow";
    this.lineVec = undefined;
    this.initialize();
  }

  initialize() {
    const coneLength = this.coneLength;
    this.lineVec = this.point1.clone().sub(this.point2.clone()).normalize();
    let start, end;
    if (this.arrowStart) {
      start = this.point1
        .clone()
        .sub(this.lineVec.clone().multiplyScalar(coneLength / 2));
    } else {
      start = this.point1.clone();
    }
    if (this.arrowEnd) {
      end = this.point2
        .clone()
        .sub(this.lineVec.clone().multiplyScalar(-coneLength / 2));
    } else {
      end = this.point2.clone();
    }
    const material = new LineMaterial({
      linewidth: this.linewidth,
      color: this.color,
    });
    const geom = new LineSegmentsGeometry();
    geom.setPositions([...start.toArray(), ...end.toArray()]);

    const line = new LineSegments2(geom, material);

    const coneGeom = new THREE.ConeGeometry(coneLength / 4, coneLength, 10);
    const coneMaterial = new THREE.MeshBasicMaterial({ color: this.color });
    const startCone = new THREE.Mesh(coneGeom, coneMaterial);
    const endCone = new THREE.Mesh(coneGeom, coneMaterial);
    startCone.name = "startCone";
    endCone.name = "endCone";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    matrix.lookAt(this.point1, this.point2, startCone.up);
    quaternion.setFromRotationMatrix(matrix);
    startCone.setRotationFromQuaternion(quaternion);
    matrix.lookAt(this.point2, this.point1, endCone.up);
    quaternion.setFromRotationMatrix(matrix);
    endCone.setRotationFromQuaternion(quaternion);
    startCone.rotateX((90 * Math.PI) / 180);
    endCone.rotateX((90 * Math.PI) / 180);

    startCone.position.copy(start);
    endCone.position.copy(end);

    if (this.arrowStart) this.add(startCone);

    if (this.arrowEnd) this.add(endCone);

    this.add(line);
  }

  /**
   * Update the arrow so it keeps the same size on the screen.
   * @param {number} scaleFactor
   */
  update(scaleFactor) {
    const newStart = this.point1
      .clone()
      .sub(
        this.lineVec
          .clone()
          .multiplyScalar((scaleFactor * this.coneLength) / 2),
      );
    const newEnd = this.point2
      .clone()
      .sub(
        this.lineVec
          .clone()
          .multiplyScalar((-scaleFactor * this.coneLength) / 2),
      );
    const line = this.children.find((child) => child.type == "LineSegments2");
    line.geometry.setPositions([
      ...(this.arrowStart ? newStart.toArray() : this.point1),
      ...(this.arrowEnd ? newEnd.toArray() : this.point2),
    ]);

    if (this.arrowStart) {
      const startCone = this.children.find(
        (child) => child.type == "Mesh" && child.name == "startCone",
      );
      startCone.position.copy(newStart);
      startCone.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }
    if (this.arrowEnd) {
      const endCone = this.children.find(
        (child) => child.type == "Mesh" && child.name == "endCone",
      );
      endCone.position.copy(newEnd);
      endCone.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }
  }
}

class Measurement {
  /**
   *
   * @param {import ("../viewer.js").Viewer} viewer The viewer instance
   * @param {DistancePanel | PropertiesPanel } panel The panel to display the measurement
   */
  constructor(viewer, panel) {
    this.selectedShapes = []; // array of dict ObjectGroup, bool
    this.point1 = null;
    this.point2 = null;
    this.middlePoint = null;
    this.contextEnabled = false; // Tells if the measure context is active
    this.viewer = viewer;
    this.scene = new THREE.Scene();
    this.panel = panel;
    this.panelCenter = null;
    this.panelX = null;
    this.panelY = null;
    this.panelShown = false;
    this.responseData = null;
    this.measurementLineColor = 0x000000;
    this.connectingLineColor = 0x800080;
    this.coneLength = undefined;

    this.panelDragData = { x: null, y: null, clicked: false };
    this.panel.registerCallback("mousedown", (e) => {
      this.panelDragData.clicked = true;
      this.panelDragData.x = e.clientX;
      this.panelDragData.y = e.clientY;
      e.stopPropagation();
    });
    this.shift = false;
  }

  enableContext() {
    this.contextEnabled = true;
    this.panelCenter = new THREE.Vector3(1, 0, 0);

    document.addEventListener("mouseup", this._mouseup);
    document.addEventListener("mousemove", this._dragPanel);
  }

  disableContext() {
    this._hideMeasurement();
    this.contextEnabled = false;
    this.responseData = null;

    for (var group of this.selectedShapes) {
      group.obj.clearHighlights();
    }
    this.selectedShapes = [];

    document.removeEventListener("mouseup", this._mouseup);
    document.removeEventListener("mousemove", this._dragPanel);

    this.viewer.checkChanges({ selectedShapeIDs: [] });
  }

  _hideMeasurement() {
    this.panel.show(false);
    this.disposeArrows();
    this.scene.clear();
  }

  /**
   * Response handler for the measure context
   * @param {object} response
   */
  handleResponse(response) {}

  _createPanel() {
    throw new Error("Subclass needs to override this method");
  }

  _makeLines() {
    throw new Error("Subclass needs to override this method");
  }

  _updateConnectionLine() {
    throw new Error("Subclass needs to override this method");
  }

  /**
   * Get the maximum number of selected obj this measurement can handle
   * @returns {int} The numbers of obj handled by the measurement
   */
  _getMaxObjSelected() {
    throw new Error("Subclass needs to override this method");
  }

  /**
   * Wait for the backend to send the data needed to display the real BREP measurement.
   * @param {*} resolve
   * @param {*} reject
   */
  _waitResponse(resolve, reject) {
    if (this.responseData) {
      resolve(this.responseData);
    } else {
      setTimeout(() => {
        this._waitResponse(resolve, reject);
      }, 100);
    }
  }

  /**
   * Update the measurement panel, if enough shapes have been selected for the current tool,
   * ask the backend for the real measurement data and display it.
   * @returns
   */
  _updateMeasurement() {
    let getId = (shape) => {
      if (shape.fromSolid) {
        let solidId = shape.obj.name
          .replace(/\|faces.*$/, "")
          .replace(/\|edges.*$/, "")
          .replace(/\|vertices.*$/, "");
        return solidId.replaceAll("|", "/");
      } else {
        return shape.obj.name.replaceAll("|", "/");
      }
    };
    const ids = this.selectedShapes.map(getId);

    this.responseData = null;
    if (this.debug) {
      const delay = 50 + Math.floor(Math.random() * 200);
      setTimeout(() => {
        if (this.selectedShapes.length == 0) return;

        let responseData;
        if (this instanceof DistanceMeasurement) {
          if (this.selectedShapes.length < 2) return;
          var obj1 = this.selectedShapes[0].obj;
          var obj2 = this.selectedShapes[1].obj;
          this.point1 = obj1.children[0].geometry.boundingSphere.center.clone();
          this.point1 = obj1.localToWorld(this.point1);
          this.point2 = obj2.children[0].geometry.boundingSphere.center.clone();
          this.point2 = obj2.localToWorld(this.point2);
          responseData = {
            type: "backend_response",
            Distance: 2.345,
            info: "center",
            refpoint1: this.point1.toArray(),
            refpoint2: this.point2.toArray(),
            Angle: 43.21,
            info1: "Plane (Face)",
            info2: "Plane (Face)",
          };
        } else if (this instanceof PropertiesMeasurement) {
          const obj = this.selectedShapes[0].obj;
          const center = obj.children[0].geometry.boundingSphere.center.clone();
          this.point1 = obj.localToWorld(center);
          responseData = {
            type: "backend_response",
            shape_type: "Edge",
            geom_type: "EllipseArc",
            "Major radius": 0.4,
            "Minor radius": 0.2,
            Length: 0.6868592404716374,
            Start: [2.4, -1.0, 0.0],
            Center: this.point1.toArray(),
            refpoint: this.point1.toArray(),
            End: [1.8, -0.8267949192431111, 0.0],
            bb: {
              min: [1.8, -1.0, 0.0],
              center: [2.1, -0.9, 0.0],
              max: [2.4, -0.8, 0.0],
              size: [0.56, 0.2, 0.0],
            },
          };
        }
        this.handleResponse(responseData);
      }, delay);
    } else {
      this.viewer.checkChanges({
        selectedShapeIDs: [...ids, this.shift],
      });
    }

    if (this.selectedShapes.length != this._getMaxObjSelected()) {
      this._hideMeasurement();
      return;
    }

    const p = new Promise((resolve, reject) => {
      this._waitResponse(resolve, reject);
    });
    // eslint-disable-next-line no-unused-vars
    p.then((data) => {
      this._createPanel();
      this._makeLines();
      this.panel.show(true);
      this._movePanel();
    });
  }

  /**
   * React to each new selected element in the viewer.
   * obj: ObjectGroup
   * fromSolid: boolean
   * @param {object} selectedObj The selected obj.
   */
  handleSelection = (selectedObj, shift = false) => {
    this.shift = shift;

    if (
      this.selectedShapes.find((o) => o.obj.name === selectedObj.obj.name) !==
      undefined
    )
      this.selectedShapes.splice(this.selectedShapes.indexOf(selectedObj), 1);
    else this.selectedShapes.push(selectedObj);

    this.panel.finished = false;

    this._updateMeasurement();
  };

  _mouseup = (e) => {
    this.panelDragData.clicked = false;
    e.stopPropagation();
  };

  _movePanel = () => {
    if (!this.panel.isVisible()) return;

    const canvasRect = this.viewer.renderer.domElement.getBoundingClientRect();
    const panelRect = this.panel.html.getBoundingClientRect();

    if (this.panelX == null && this.middlePoint != null) {
      let center = this.middlePoint
        .clone()
        .project(this.viewer.camera.getCamera());
      let panelX = (center.x + 1) * (canvasRect.width / 2);
      let panelY = (1 - center.y) * (canvasRect.height / 2);

      if (panelX < canvasRect.width / 2) {
        this.panelX = panelX + panelRect.width / 2;
      } else {
        this.panelX = panelX - panelRect.width - panelRect.width / 2;
      }
      this.panelX = Math.max(
        0,
        Math.min(canvasRect.width - panelRect.width, this.panelX),
      );

      this.panelY = panelY;
      this.panelY = Math.max(
        0,
        Math.min(canvasRect.height - panelRect.height, this.panelY),
      );
    }

    this.panel.relocate(this.panelX, this.panelY);

    const panelCenterX = this.panelX + panelRect.width / 2;
    const panelCenterY = this.panelY + panelRect.height / 2;
    const ndcX = panelCenterX / (canvasRect.width / 2) - 1;
    const ndcY = 1 - panelCenterY / (canvasRect.height / 2);
    const ndcZ = this.viewer.ortho ? -0.9 : 1; // seems like a nice default ...
    var panelCenter = new Vector3(ndcX, ndcY, ndcZ);

    const camera = this.viewer.camera.getCamera();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.panelCenter = panelCenter.unproject(camera);

    if (this.scene.children.length > 0) {
      this._updateConnectionLine();
    }
  };

  /**
   * This handler is responsible to update the panel center vector when the user drag the panel on the screen.
   * @param {Event} e
   * @returns
   */
  _dragPanel = (e) => {
    if (!this.panelDragData.clicked) return;
    const panelRect = this.panel.html.getBoundingClientRect();
    const canvasRect = this.viewer.renderer.domElement.getBoundingClientRect();
    let dx = e.clientX - this.panelDragData.x;
    let dy = e.clientY - this.panelDragData.y;

    if (
      !(
        (panelRect.x + dx < canvasRect.x && e.movementX <= 0) ||
        (panelRect.x + dx > canvasRect.x + canvasRect.width - panelRect.width &&
          e.movementX >= 0)
      )
    ) {
      this.panelX += dx;
    }
    if (
      !(
        (panelRect.y + dy < canvasRect.y && e.movementY <= 0) ||
        (panelRect.y + dy >
          canvasRect.y + canvasRect.height - panelRect.height &&
          e.movementY >= 0)
      )
    ) {
      this.panelY += dy;
    }

    this._updateMeasurement();

    // Update the drag start position
    this.panelDragData.x = e.clientX;
    this.panelDragData.y = e.clientY;
  };

  removeLastSelectedObj(force = false) {
    if (force || this.selectedShapes.length == this._getMaxObjSelected()) {
      const lastItem = this.selectedShapes.pop();
      if (lastItem) {
        let objs = lastItem.objs();
        for (let obj of objs) {
          obj.clearHighlights();
        }
      }
      this._updateMeasurement();
    }
  }

  /**
   * Adjust the arrow cones scale factor to ensure they keep the same size on the screen.
   * @param {number} zoom
   */
  _adjustArrowsScaleFactor(zoom) {
    const scaleFactor = 1 / zoom;
    this.scene.children.forEach((ch) => ch.update(scaleFactor));
  }

  update() {
    const camera = this.viewer.camera.getCamera();
    const zoom = this.viewer.camera.getZoom();
    this.coneLength =
      this.viewer.bb_radius /
      (Math.max(this.viewer.cadWidth, this.viewer.height) / 60);
    this._adjustArrowsScaleFactor(zoom);
    this.viewer.renderer.clearDepth();
    this._movePanel();
    this.viewer.renderer.render(this.scene, camera);
  }

  disposeArrows() {
    deepDispose(this.scene);
    this.scene.clear();
  }

  dispose() {
    if (this.panel) {
      this.panel.show(false);
      deepDispose(this.panel);
    }
    this.disposeArrows();
    this.panel = null;
    this.viewer = null;
    this.scene = null;
  }
}

class DistanceMeasurement extends Measurement {
  constructor(viewer, debug) {
    super(viewer, new DistancePanel(viewer.display));
    this.point1 = null;
    this.point2 = null;
    this.middlePoint = null;
    this.debug = debug;
  }

  _createPanel() {
    this.panel.createTable(this.responseData);
  }

  _getMaxObjSelected() {
    return 2;
  }

  _getPoints() {
    this.point1 = new THREE.Vector3(...this.responseData.refpoint1);
    this.point2 = new THREE.Vector3(...this.responseData.refpoint2);
  }

  _makeLines() {
    if (this.scene.children.length === 0) {
      const lineWidth = 1.5;
      const distanceLine = new DistanceLineArrow(
        this.coneLength,
        this.point1,
        this.point2,
        2 * lineWidth,
        this.measurementLineColor,
      );
      this.scene.add(distanceLine);

      this.middlePoint = new THREE.Vector3()
        .addVectors(this.point1, this.point2)
        .multiplyScalar(0.5);
      const connectingLine = new DistanceLineArrow(
        this.coneLength,
        this.panelCenter,
        this.middlePoint,
        lineWidth,
        this.connectingLineColor,
        false,
        false,
      );
      this.scene.add(connectingLine);
    }
  }

  _updateConnectionLine() {
    this.scene.children[1].children[0].geometry.setPositions([
      ...this.middlePoint,
      ...this.panelCenter,
    ]);
  }

  /**
   * Handle the response from the backend.
   * @param {object} response
   */
  handleResponse(response) {
    // super.handleResponse(response);
    this.responseData = { ...response };
    this._getPoints();
  }
}

class PropertiesMeasurement extends Measurement {
  constructor(viewer, debug) {
    super(viewer, new PropertiesPanel(viewer.display));
    this.middlePoint = null;
    this.debug = debug;
  }

  _createPanel() {
    this.panel.createTable(this.responseData);
  }

  _getMaxObjSelected() {
    return 1;
  }
  _getPoint() {
    this.point1 = new THREE.Vector3(...this.responseData.refpoint);
  }

  _makeLines() {
    if (this.scene.children.length === 0) {
      this.middlePoint = this.point1;
      const lineWidth = 1.5;
      const connectingLine = new DistanceLineArrow(
        this.coneLength,
        this.panelCenter,
        this.middlePoint,
        lineWidth,
        this.connectingLineColor,
        false,
        false,
      );
      this.scene.add(connectingLine);
    }
  }

  _updateConnectionLine() {
    this.scene.children[0].children[0].geometry.setPositions([
      ...this.middlePoint,
      ...this.panelCenter,
    ]);
  }

  /**
   * Handle the response from the backend.
   * @param {object} response
   */
  handleResponse(response) {
    // super.handleResponse(response);
    this.responseData = { ...response };
    this._getPoint();
  }
}

export { DistanceMeasurement, PropertiesMeasurement };
