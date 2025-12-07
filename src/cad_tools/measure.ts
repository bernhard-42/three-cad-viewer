import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { DistancePanel, PropertiesPanel, DistanceResponseData, PropertiesResponseData } from "./ui.js";
import { deepDispose } from "../utils.js";
import type { PickedObject } from "../raycast.js";
import type { DisplayLike } from "./tools.js";

interface ViewerLike {
  display: DisplayLike;
  renderer: THREE.WebGLRenderer;
  camera: {
    getCamera(): THREE.Camera;
    getZoom(): number;
  };
  state: {
    get(key: string): unknown;
  };
  ortho: boolean;
  bb_radius: number;
  checkChanges(changes: Record<string, unknown>): void;
}

interface PanelDragData {
  x: number | null;
  y: number | null;
  clicked: boolean;
}

class DistanceLineArrow extends THREE.Group {
  coneLength: number;
  point1: THREE.Vector3;
  point2: THREE.Vector3;
  linewidth: number;
  color: number;
  arrowStart: boolean;
  arrowEnd: boolean;
  override type: string;
  lineVec: THREE.Vector3 | undefined;

  constructor(
    coneLength: number,
    point1: THREE.Vector3,
    point2: THREE.Vector3,
    linewidth: number,
    color: number,
    arrowStart: boolean = true,
    arrowEnd: boolean = true,
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

  initialize(): void {
    const coneLength = this.coneLength;
    this.lineVec = this.point1.clone().sub(this.point2.clone()).normalize();
    let start: THREE.Vector3, end: THREE.Vector3;
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
   */
  update(scaleFactor: number): void {
    const newStart = this.point1
      .clone()
      .sub(
        this.lineVec!
          .clone()
          .multiplyScalar((scaleFactor * this.coneLength) / 2),
      );
    const newEnd = this.point2
      .clone()
      .sub(
        this.lineVec!
          .clone()
          .multiplyScalar((-scaleFactor * this.coneLength) / 2),
      );
    const line = this.children.find((child) => child.type == "LineSegments2") as LineSegments2;
    line.geometry.setPositions([
      ...(this.arrowStart ? newStart.toArray() : this.point1.toArray()),
      ...(this.arrowEnd ? newEnd.toArray() : this.point2.toArray()),
    ]);

    if (this.arrowStart) {
      const startCone = this.children.find(
        (child) => child.type == "Mesh" && child.name == "startCone",
      ) as THREE.Mesh;
      startCone.position.copy(newStart);
      startCone.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }
    if (this.arrowEnd) {
      const endCone = this.children.find(
        (child) => child.type == "Mesh" && child.name == "endCone",
      ) as THREE.Mesh;
      endCone.position.copy(newEnd);
      endCone.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }
  }

  /**
   * Dispose of all geometries and materials.
   * Handles shared geometry/material between cones.
   */
  dispose(): void {
    // Dispose line geometry and material
    const line = this.children.find((child) => child.type === "LineSegments2") as LineSegments2 | undefined;
    if (line) {
      line.geometry.dispose();
      line.material.dispose();
    }

    // Dispose cone geometry and material (shared between start and end cones)
    const startCone = this.children.find(
      (child) => child.type === "Mesh" && child.name === "startCone",
    ) as THREE.Mesh | undefined;
    if (startCone) {
      (startCone.geometry as THREE.BufferGeometry).dispose();
      (startCone.material as THREE.Material).dispose();
    }
    // endCone shares geometry and material with startCone, no need to dispose again

    this.clear();
  }
}

class Measurement {
  selectedShapes: PickedObject[];
  point1: THREE.Vector3 | null;
  point2: THREE.Vector3 | null;
  middlePoint: THREE.Vector3 | null;
  contextEnabled: boolean;
  viewer: ViewerLike;
  scene: THREE.Scene;
  panel: DistancePanel | PropertiesPanel;
  panelCenter: THREE.Vector3 | null;
  panelX: number | null;
  panelY: number | null;
  panelShown: boolean;
  responseData: DistanceResponseData | PropertiesResponseData | null;
  measurementLineColor: number;
  connectingLineColor: number;
  coneLength: number | undefined;
  panelDragData: PanelDragData;
  shift: boolean;
  debug: boolean;

  constructor(viewer: ViewerLike, panel: DistancePanel | PropertiesPanel) {
    this.selectedShapes = [];
    this.point1 = null;
    this.point2 = null;
    this.middlePoint = null;
    this.contextEnabled = false;
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
    this.debug = false;

    this.panelDragData = { x: null, y: null, clicked: false };
    this.panel.registerCallback("mousedown", ((e: MouseEvent) => {
      this.panelDragData.clicked = true;
      this.panelDragData.x = e.clientX;
      this.panelDragData.y = e.clientY;
      e.stopPropagation();
    }) as EventListener);
    this.shift = false;
  }

  enableContext(): void {
    this.contextEnabled = true;
    this.panelCenter = new THREE.Vector3(1, 0, 0);

    document.addEventListener("mouseup", this._mouseup);
    document.addEventListener("mousemove", this._dragPanel);
  }

  disableContext(): void {
    this._hideMeasurement();
    this.contextEnabled = false;
    this.responseData = null;

    for (const group of this.selectedShapes) {
      group.obj.clearHighlights();
    }
    this.selectedShapes = [];

    document.removeEventListener("mouseup", this._mouseup);
    document.removeEventListener("mousemove", this._dragPanel);

    this.viewer.checkChanges({ selectedShapeIDs: [] });
  }

  _hideMeasurement(): void {
    this.panel.show(false);
    this.disposeArrows();
    this.scene.clear();
  }

  /**
   * Response handler for the measure context
   */
  handleResponse(_response?: DistanceResponseData | PropertiesResponseData): void {}

  _createPanel(): void {
    throw new Error("Subclass needs to override this method");
  }

  _makeLines(): void {
    throw new Error("Subclass needs to override this method");
  }

  _updateConnectionLine(): void {
    throw new Error("Subclass needs to override this method");
  }

  /**
   * Get the maximum number of selected obj this measurement can handle
   */
  _getMaxObjSelected(): number {
    throw new Error("Subclass needs to override this method");
  }

  /**
   * Wait for the backend to send the data needed to display the real BREP measurement.
   */
  _waitResponse(resolve: (data: DistanceResponseData | PropertiesResponseData) => void, _reject: (reason?: unknown) => void): void {
    if (this.responseData) {
      resolve(this.responseData);
    } else {
      setTimeout(() => {
        this._waitResponse(resolve, _reject);
      }, 100);
    }
  }

  /**
   * Update the measurement panel, if enough shapes have been selected for the current tool,
   * ask the backend for the real measurement data and display it.
   */
  _updateMeasurement(): void {
    const getId = (shape: PickedObject): string => {
      if (shape.fromSolid) {
        const solidId = shape.obj.name
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

        let responseData: DistanceResponseData | PropertiesResponseData;
        if (this instanceof DistanceMeasurement) {
          if (this.selectedShapes.length < 2) return;
          const obj1 = this.selectedShapes[0].obj;
          const obj2 = this.selectedShapes[1].obj;
          this.point1 = (obj1.children[0] as THREE.Mesh).geometry.boundingSphere!.center.clone();
          this.point1 = obj1.localToWorld(this.point1);
          this.point2 = (obj2.children[0] as THREE.Mesh).geometry.boundingSphere!.center.clone();
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
          const center = (obj.children[0] as THREE.Mesh).geometry.boundingSphere!.center.clone();
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
        } else {
          return;
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

    const p = new Promise<DistanceResponseData | PropertiesResponseData>((resolve, reject) => {
      this._waitResponse(resolve, reject);
    });
    p.then((_data) => {
      this._createPanel();
      this._makeLines();
      this.panel.show(true);
      this._movePanel();
    });
  }

  /**
   * React to each new selected element in the viewer.
   */
  handleSelection = (selectedObj: PickedObject, shift: boolean = false): void => {
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

  _mouseup = (e: MouseEvent): void => {
    this.panelDragData.clicked = false;
    e.stopPropagation();
  };

  _movePanel = (): void => {
    if (!this.panel.isVisible()) return;

    const canvasRect = this.viewer.renderer.domElement.getBoundingClientRect();
    const panelRect = this.panel.html.getBoundingClientRect();

    if (this.panelX == null && this.middlePoint != null) {
      const center = this.middlePoint
        .clone()
        .project(this.viewer.camera.getCamera());
      let panelX = (center.x + 1) * (canvasRect.width / 2);
      const panelY = (1 - center.y) * (canvasRect.height / 2);

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

    const panelCenterX = this.panelX! + panelRect.width / 2;
    const panelCenterY = this.panelY! + panelRect.height / 2;
    const ndcX = panelCenterX / (canvasRect.width / 2) - 1;
    const ndcY = 1 - panelCenterY / (canvasRect.height / 2);
    const ndcZ = this.viewer.ortho ? -0.9 : 1;
    const panelCenter = new THREE.Vector3(ndcX, ndcY, ndcZ);

    const camera = this.viewer.camera.getCamera() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.panelCenter = panelCenter.unproject(camera);

    if (this.scene.children.length > 0) {
      this._updateConnectionLine();
    }
  };

  /**
   * This handler is responsible to update the panel center vector when the user drag the panel on the screen.
   */
  _dragPanel = (e: MouseEvent): void => {
    if (!this.panelDragData.clicked) return;
    const panelRect = this.panel.html.getBoundingClientRect();
    const canvasRect = this.viewer.renderer.domElement.getBoundingClientRect();
    const dx = e.clientX - this.panelDragData.x!;
    const dy = e.clientY - this.panelDragData.y!;

    if (
      !(
        (panelRect.x + dx < canvasRect.x && e.movementX <= 0) ||
        (panelRect.x + dx > canvasRect.x + canvasRect.width - panelRect.width &&
          e.movementX >= 0)
      )
    ) {
      this.panelX! += dx;
    }
    if (
      !(
        (panelRect.y + dy < canvasRect.y && e.movementY <= 0) ||
        (panelRect.y + dy >
          canvasRect.y + canvasRect.height - panelRect.height &&
          e.movementY >= 0)
      )
    ) {
      this.panelY! += dy;
    }

    this._updateMeasurement();

    // Update the drag start position
    this.panelDragData.x = e.clientX;
    this.panelDragData.y = e.clientY;
  };

  removeLastSelectedObj(force: boolean = false): void {
    if (force || this.selectedShapes.length == this._getMaxObjSelected()) {
      const lastItem = this.selectedShapes.pop();
      if (lastItem) {
        const objs = lastItem.objs();
        for (const obj of objs) {
          obj.clearHighlights();
        }
      }
      this._updateMeasurement();
    }
  }

  /**
   * Adjust the arrow cones scale factor to ensure they keep the same size on the screen.
   */
  _adjustArrowsScaleFactor(zoom: number): void {
    const scaleFactor = 1 / zoom;
    this.scene.children.forEach((ch) => (ch as DistanceLineArrow).update(scaleFactor));
  }

  update(): void {
    const camera = this.viewer.camera.getCamera();
    const zoom = this.viewer.camera.getZoom();
    const cadWidth = this.viewer.state.get("cadWidth") as number;
    const height = this.viewer.state.get("height") as number;
    this.coneLength =
      this.viewer.bb_radius / (Math.max(cadWidth, height) / 60);
    this._adjustArrowsScaleFactor(zoom);
    this.viewer.renderer.clearDepth();
    this._movePanel();
    this.viewer.renderer.render(this.scene, camera);
  }

  disposeArrows(): void {
    deepDispose(this.scene);
    this.scene.clear();
  }

  dispose(): void {
    if (this.panel) {
      this.panel.show(false);
      deepDispose(this.panel);
    }
    this.disposeArrows();
    (this as { panel: DistancePanel | PropertiesPanel | null }).panel = null;
    (this as { viewer: ViewerLike | null }).viewer = null;
    (this as { scene: THREE.Scene | null }).scene = null;
  }
}

class DistanceMeasurement extends Measurement {
  override debug: boolean;

  constructor(viewer: ViewerLike, debug: boolean) {
    super(viewer, new DistancePanel(viewer.display));
    this.point1 = null;
    this.point2 = null;
    this.middlePoint = null;
    this.debug = debug;
  }

  override _createPanel(): void {
    (this.panel as DistancePanel).createTable(this.responseData as DistanceResponseData);
  }

  override _getMaxObjSelected(): number {
    return 2;
  }

  _getPoints(): void {
    this.point1 = new THREE.Vector3(...(this.responseData as DistanceResponseData).refpoint1!);
    this.point2 = new THREE.Vector3(...(this.responseData as DistanceResponseData).refpoint2!);
  }

  override _makeLines(): void {
    if (this.scene.children.length === 0) {
      const lineWidth = 1.5;
      const distanceLine = new DistanceLineArrow(
        this.coneLength!,
        this.point1!,
        this.point2!,
        2 * lineWidth,
        this.measurementLineColor,
      );
      this.scene.add(distanceLine);

      this.middlePoint = new THREE.Vector3()
        .addVectors(this.point1!, this.point2!)
        .multiplyScalar(0.5);
      const connectingLine = new DistanceLineArrow(
        this.coneLength!,
        this.panelCenter!,
        this.middlePoint,
        lineWidth,
        this.connectingLineColor,
        false,
        false,
      );
      this.scene.add(connectingLine);
    }
  }

  override _updateConnectionLine(): void {
    const lineArrow = this.scene.children[1] as DistanceLineArrow;
    const line = lineArrow.children[0] as LineSegments2;
    line.geometry.setPositions([
      ...this.middlePoint!.toArray(),
      ...this.panelCenter!.toArray(),
    ]);
  }

  /**
   * Handle the response from the backend.
   */
  override handleResponse(response: DistanceResponseData): void {
    this.responseData = { ...response };
    this._getPoints();
  }
}

class PropertiesMeasurement extends Measurement {
  override debug: boolean;

  constructor(viewer: ViewerLike, debug: boolean) {
    super(viewer, new PropertiesPanel(viewer.display));
    this.middlePoint = null;
    this.debug = debug;
  }

  override _createPanel(): void {
    (this.panel as PropertiesPanel).createTable(this.responseData as PropertiesResponseData);
  }

  override _getMaxObjSelected(): number {
    return 1;
  }

  _getPoint(): void {
    this.point1 = new THREE.Vector3(...(this.responseData as PropertiesResponseData).refpoint!);
  }

  override _makeLines(): void {
    if (this.scene.children.length === 0) {
      this.middlePoint = this.point1;
      const lineWidth = 1.5;
      const connectingLine = new DistanceLineArrow(
        this.coneLength!,
        this.panelCenter!,
        this.middlePoint!,
        lineWidth,
        this.connectingLineColor,
        false,
        false,
      );
      this.scene.add(connectingLine);
    }
  }

  override _updateConnectionLine(): void {
    const lineArrow = this.scene.children[0] as DistanceLineArrow;
    const line = lineArrow.children[0] as LineSegments2;
    line.geometry.setPositions([
      ...this.middlePoint!.toArray(),
      ...this.panelCenter!.toArray(),
    ]);
  }

  /**
   * Handle the response from the backend.
   */
  override handleResponse(response: PropertiesResponseData): void {
    this.responseData = { ...response };
    this._getPoint();
  }
}

export { DistanceMeasurement, PropertiesMeasurement };
