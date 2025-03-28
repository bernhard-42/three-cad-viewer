import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Vector3 } from "three";
import { DistancePanel, PropertiesPanel, AnglePanel } from "./ui.js";
import { GeomFilter } from "../raycast.js";

const DEBUG = false;

class DistanceLineArrow extends THREE.Group {
  /**
   *
   * @param {Vector3} point1 The start point of the line
   * @param {Vector3} point2 The end point of the line
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

  dispose() {
    this.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
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
    line.geometry.setPositions([...newStart.toArray(), ...newEnd.toArray()]);

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
   * @param {DistancePanel | PropertiesPanel | AnglePanel} panel The panel to display the measurement
   */
  constructor(viewer, panel) {
    this.selectedShapes = []; // array of dict ObjectGroup, bool
    this.point1 = null;
    this.point2 = null;
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
    document.addEventListener("mouseup", this._mouseup);
    document.addEventListener("mousemove", this._dragPanel);
  }

  enableContext() {
    this.contextEnabled = true;
    this.panelCenter = new Vector3(1, 0, 0);
  }

  disableContext() {
    this.contextEnabled = false;
    this.selectedShapes = [];
    this._hideMeasurement();
    this.viewer.checkChanges({ selectedShapeIDs: [] });
  }

  _hideMeasurement() {
    this.responseData = null;
    this.panel.show(false);
    this.scene.clear();
  }

  /**
   * Response handler for the measure context
   * @param {object} response
   */
  handleResponse(response) {
    this.viewer.info.addHtml(response.center_info);
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
    this.viewer.checkChanges({ selectedShapeIDs: [...ids] });

    if (this.selectedShapes.length != this._getMaxObjSelected()) {
      this._hideMeasurement();
      return;
    }

    if (DEBUG) {
      this._setMeasurementVals();
      this._makeLines();
      this.panel.show(true);
      this._movePanel();
    } else {
      const p = new Promise((resolve, reject) => {
        this._waitResponse(resolve, reject);
      });
      // eslint-disable-next-line no-unused-vars
      p.then((data) => {
        this._setMeasurementVals();
        this._makeLines();
        this.panel.show(true);
        this._movePanel();
      });
    }
  }

  /**
   * React to each new selected element in the viewer.
   * obj: ObjectGroup
   * fromSolid: boolean
   * @param {object} selectedObj The selected obj.
   */
  handleSelection = (selectedObj) => {
    this._hideMeasurement();
    if (
      this.selectedShapes.find((o) => o.obj.name === selectedObj.obj.name) !==
      undefined
    )
      this.selectedShapes.splice(this.selectedShapes.indexOf(selectedObj), 1);
    else this.selectedShapes.push(selectedObj);

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
    if (this.panelX == null) {
      this.panelX = canvasRect.width - panelRect.width - 2;
      this.panelY = canvasRect.height - panelRect.height - 2;
    }

    this.panel.relocate(this.panelX, this.panelY);

    const panelCenterX = this.panelX + panelRect.width / 2;
    const panelCenterY = this.panelY + panelRect.height / 2;
    const ndcX = panelCenterX / (canvasRect.width / 2) - 1;
    const ndcY = 1 - panelCenterY / (canvasRect.height / 2);
    const ndcZ = this.viewer.ortho ? -0.9 : 1; // seems like a nice default ...
    var panelCenter = new THREE.Vector3(ndcX, ndcY, ndcZ);

    const camera = this.viewer.camera.getCamera();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.panelCenter = panelCenter.unproject(camera);

    this.scene.clear();
    this._makeLines();
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

    this.scene.clear();
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
    for (let child of this.scene.children) {
      child.update(scaleFactor);
    }
  }

  update() {
    const camera = this.viewer.camera.getCamera();
    const zoom = this.viewer.camera.getZoom();
    this.coneLength = this.viewer.bb_radius / 15;
    this._adjustArrowsScaleFactor(zoom);
    this.viewer.renderer.clearDepth();
    this.viewer.renderer.render(this.scene, camera);
    this._movePanel();
  }

  dispose() {
    document.removeEventListener("mouseup", this._mouseup);
    document.removeEventListener("mousemove", this._dragPanel);

    for (var i in this.scene.children) {
      this.scene.children[i].dispose();
      this.scene.children[i] = null;
    }
    this.panel.dispose();
    this.panel = null;
    this.viewer = null;
    this.scene = null;
  }
}

class DistanceMeasurement extends Measurement {
  constructor(viewer) {
    super(viewer, new DistancePanel(viewer.display));
    this.point1 = null;
    this.point2 = null;
  }

  _setMeasurementVals() {
    this._getPoints();
    const total = DEBUG ? 50 : this.responseData.distance;
    const distVec = this.point2.clone().sub(this.point1);
    const xdist = Math.abs(distVec.x);
    const ydist = Math.abs(distVec.y);
    const zdist = Math.abs(distVec.z);
    this.panel.total = total.toFixed(3);
    this.panel.x_distance = xdist.toFixed(3);
    this.panel.y_distance = ydist.toFixed(3);
    this.panel.z_distance = zdist.toFixed(3);
  }

  _getMaxObjSelected() {
    return 2;
  }

  _getPoints() {
    if (DEBUG) {
      var obj1 = this.selectedShapes[0].obj;
      var obj2 = this.selectedShapes[1].obj;
      this.point1 = obj1.children[0].geometry.boundingSphere.center.clone();
      this.point1 = obj1.localToWorld(this.point1);
      this.point2 = obj2.children[0].geometry.boundingSphere.center.clone();
      this.point2 = obj2.localToWorld(this.point2);
    } else {
      this.point1 = new Vector3(...this.responseData.point1);
      this.point2 = new Vector3(...this.responseData.point2);
    }
  }

  _makeLines() {
    const lineWidth = 1.5;
    const distanceLine = new DistanceLineArrow(
      this.coneLength,
      this.point1,
      this.point2,
      2 * lineWidth,
      this.measurementLineColor,
    );
    this.scene.add(distanceLine);

    const middlePoint = new THREE.Vector3()
      .addVectors(this.point1, this.point2)
      .multiplyScalar(0.5);
    const connectingLine = new DistanceLineArrow(
      this.coneLength,
      this.panelCenter,
      middlePoint,
      lineWidth,
      this.connectingLineColor,
      false,
      false,
    );
    this.scene.add(connectingLine);
  }

  /**
   * Handle the response from the backend.
   * @param {object} response
   */
  handleResponse(response) {
    super.handleResponse(response);
    const data = {
      distance: response.distance,
      point1: new Vector3(...response.point1),
      point2: new Vector3(...response.point2),
    };
    this.responseData = data;
  }
}

class PropertiesMeasurement extends Measurement {
  constructor(viewer) {
    super(viewer, new PropertiesPanel(viewer.display));
  }

  _setMeasurementVals() {
    const obj = this.selectedShapes[0].obj;
    const isVertex = obj.name.match(/.*\|.*vertices/);
    const isLine = obj.name.match(/.*\|.*edges/);
    const isFace = obj.name.match(/.*\|.*faces/);
    const isSolid = this.selectedShapes[0].fromSolid;

    const subheader = isSolid
      ? "Solid"
      : isVertex
        ? "Vertex"
        : isLine
          ? "Edge"
          : isFace
            ? "Face"
            : "Unknown";
    this.panel.subheader = subheader;
    const debugProps = {
      volume: 0.445,
      area: -1.012,
      length: 2.012,
      width: 0.012,
      radius: 1.012,
      radius2: 2.023,
      geom_type: "Circle",
      vertex_coords: [1.3456, -4.3456, 2.3567],
      // volume: 44444.44,
      // area: 48.01,
      // length: 94.01,
      // width: 24.01,
      // radius: 10.01,
      // geom_type: "Circle",
      // vertex_coords: [10000.34, -41000.34, 82.35]
    };
    const props = DEBUG ? debugProps : this.responseData;
    this.panel.setProperties(props);
  }

  _getMaxObjSelected() {
    return 1;
  }

  _makeLines() {
    const lineWidth = 1.5;
    var worldCenter;
    if (DEBUG) {
      const obj = this.selectedShapes[0].obj;
      const center = obj.children[0].geometry.boundingSphere.center.clone();
      worldCenter = obj.localToWorld(center);
    }
    const middlePoint = DEBUG ? worldCenter : this.responseData.center;
    const connectingLine = new DistanceLineArrow(
      this.coneLength,
      this.panelCenter,
      middlePoint,
      lineWidth,
      this.connectingLineColor,
      false,
      false,
    );
    this.scene.add(connectingLine);
  }

  /**
   * Handle the response from the backend.
   * @param {object} response
   */
  handleResponse(response) {
    super.handleResponse(response);
    let data = { ...response };
    data.center = new Vector3(...response.center);
    this.responseData = data;
  }
}

class AngleMeasurement extends Measurement {
  constructor(viewer) {
    super(viewer, new AnglePanel(viewer.display));
  }

  _setMeasurementVals() {
    let angle;
    if (DEBUG) angle = "134.5678°";
    else angle = this.responseData.angle.toFixed(2) + " °";
    this.panel.angle = angle;
  }

  enableContext() {
    super.enableContext();
    this.viewer.raycaster.filters.geomFilter = [
      GeomFilter.line,
      GeomFilter.plane,
      GeomFilter.circle,
    ];
    this.viewer.info.addHtml(
      "When in angle measurement<br>context you cannot pick :<br>- Non planar faces<br>- Curved edges<br>- Solids",
    );
  }

  disableContext() {
    super.disableContext();
    this.viewer.raycaster.filters.geomFilter = [GeomFilter.none];
  }

  _getMaxObjSelected() {
    return 2;
  }

  _getPoints() {
    if (DEBUG) {
      var obj1 = this.selectedShapes[0].obj;
      var obj2 = this.selectedShapes[1].obj;
      this.point1 = obj1.children[0].geometry.boundingSphere.center.clone();
      this.point1 = obj1.localToWorld(this.point1);
      this.point2 = obj2.children[0].geometry.boundingSphere.center.clone();
      this.point2 = obj2.localToWorld(this.point2);
    } else {
      this.point1 = new Vector3(...this.responseData.point1);
      this.point2 = new Vector3(...this.responseData.point2);
    }
  }

  _makeLines() {
    const lineWidth = 1.5;
    this._getPoints();
    const item1Line = new DistanceLineArrow(
      this.coneLength,
      this.point1,
      this.panelCenter,
      lineWidth,
      this.connectingLineColor,
      false,
      false,
    );
    const item2Line = new DistanceLineArrow(
      this.coneLength,
      this.point2,
      this.panelCenter,
      lineWidth,
      this.connectingLineColor,
      false,
      false,
    );
    this.scene.add(item1Line);
    this.scene.add(item2Line);
  }

  handleResponse(response) {
    super.handleResponse(response);
    const data = {
      angle: response.angle,
      point1: new Vector3(...response.point1),
      point2: new Vector3(...response.point2),
    };
    this.responseData = data;
  }
}

export { DistanceMeasurement, PropertiesMeasurement, AngleMeasurement };
