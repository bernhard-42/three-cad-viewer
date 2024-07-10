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
    this.panelCenter = this.viewer.bbox
      .boundingSphere()
      .center.add(xCam.multiplyScalar(offsetDistance));
  }

  /**
   * React to each new selected element in the viewer.
   * obj: ObjectGroup
   * fromSolid: boolean
   * @param {object} selectedObj The selected obj.
   */
  handleSelection = (selectedObj) => {
    this._hideMeasurement();
    if (this.selectedShapes.length == this._getMaxObjSelected()) {
      this.removeLastSelectedObj();
    }
    if (
      this.selectedShapes.find((o) => o.obj.name === selectedObj.obj.name) !==
      undefined
    )
      this.selectedShapes.splice(this.selectedShapes.indexOf(selectedObj), 1);
    else this.selectedShapes.push(selectedObj);

    this._updateMeasurement();
  };

  _movePanel = () => {
    var worldCoord = this.panelCenter;
    var screenCoord = worldCoord
      .clone()
      .project(this.viewer.camera.getCamera());
    screenCoord.x = Math.round(
      ((1 + screenCoord.x) * this.viewer.renderer.domElement.offsetWidth) / 2,
    );
    screenCoord.y = Math.round(
      ((1 - screenCoord.y) * this.viewer.renderer.domElement.offsetHeight) / 2,
    );
    const panelStyle = window.getComputedStyle(this.panel.html);
    const x = screenCoord.x - parseFloat(panelStyle.width) / 2;
    const y = screenCoord.y - parseFloat(panelStyle.height) / 2;
    this.panel.relocate(x, y);
  };

  /**
   * This handler is responsible to update the panel center vector when the user drag the panel on the screen.
   * @param {Event} e
   * @returns
   */
  _dragPanel = (e) => {
    if (!this.panelDragData.clicked) return;

    const viewer = this.viewer;
    const camera = viewer.camera.getCamera();

    let x = e.clientX - this.panelDragData.x;
    let y = e.clientY - this.panelDragData.y;
    const viewerWidth = this.viewer.renderer.domElement.offsetWidth;
    const viewerHeight = this.viewer.renderer.domElement.offsetHeight;
    const viewerToClientWidthRatio =
      (0.5 * viewerWidth) / document.documentElement.clientWidth; // I dont get why we need to use half of the viewer width
    const viewerToClientHeightRatio =
      (0.5 * viewerHeight) / document.documentElement.clientHeight;

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
    const lastItem = this.selectedShapes.pop();
    if (lastItem) {
      let objs = lastItem.objs();
      for (let obj of objs) {
        obj.clearHighlights();
      }
    }
    this._updateMeasurement();
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
    this.panel.total = total.toFixed(2);
    this.panel.x_distance = xdist.toFixed(2);
    this.panel.y_distance = ydist.toFixed(2);
    this.panel.z_distance = zdist.toFixed(2);
  }

  _getMaxObjSelected() {
    return 2;
  }

  _getPoints() {
    if (DEBUG) {
      this.point1 =
        this.selectedShapes[0].obj.children[0].geometry.boundingSphere.center;
      this.point2 =
        this.selectedShapes[1].obj.children[0].geometry.boundingSphere.center;
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
      volume: 0.44,
      area: -1.01,
      length: 2.01,
      width: 0.01,
      radius: 1.01,
      geom_type: "Circle",
      vertex_coords: [1.34, -4.34, 2.35],
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

    const middlePoint = DEBUG
      ? this.selectedShapes[0].obj.children[0].geometry.boundingSphere.center
      : this.responseData.center;
    const connectingLine = new DistanceLineArrow(
      this.coneLength,
      this.panelCenter,
      middlePoint,
      lineWidth,
      this.connectingLineColor,
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
    if (DEBUG) angle = "134.56°";
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
      this.point1 =
        this.selectedShapes[0].obj.children[0].geometry.boundingSphere.center;
      this.point2 =
        this.selectedShapes[1].obj.children[0].geometry.boundingSphere.center;
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
      true,
      false,
    );
    const item2Line = new DistanceLineArrow(
      this.coneLength,
      this.point2,
      this.panelCenter,
      lineWidth,
      this.connectingLineColor,
      true,
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
