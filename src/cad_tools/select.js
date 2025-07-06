import { GeomFilter } from "../raycast.js";

class SelectObject {
  constructor(viewer) {
    this.viewer = viewer;
    this.selectedShapes = [];
    this.contextEnabled = false;
  }

  enableContext() {
    this.viewer.raycaster.filters.geomFilter = [GeomFilter.none];
    this.contextEnabled = true;
  }

  disableContext() {
    if (this.viewer.raycaster) {
      this.viewer.raycaster.filters.geomFilter = [GeomFilter.none];
    }
    this.contextEnabled = false;
    for (var group of this.selectedShapes) {
      group.obj.clearHighlights();
    }
    this.selectedShapes = [];
  }

  _getMaxObjSelected() {
    return null;
  }

  _getIndex(path) {
    const object = path.split("|");
    const name = object[object.length - 1];
    return name.split("_")[1];
  }

  _includes(path) {
    for (var shape of this.selectedShapes) {
      if (path === shape.obj.name) {
        return true;
      }
    }
    return false;
  }
  notify() {
    var indices = [];
    for (let shape of this.selectedShapes) {
      var path = shape.obj.name;
      indices.push(this._getIndex(path));
    }
    this.viewer.checkChanges({ selected: indices }, true);
  }

  handleSelection(selectedObj) {
    if (!selectedObj) return;
    var path = selectedObj.obj.name;
    if (this._includes(path)) {
      this.selectedShapes = this.selectedShapes.filter(
        (p) => p.obj.name !== path,
      );
    } else {
      this.selectedShapes.push(selectedObj);
    }
    this.notify();
  }

  _removeLastSelectedObj(shape) {
    if (shape) {
      let objs = shape.objs();
      for (let obj of objs) {
        obj.clearHighlights();
      }
    }
    this.notify();
  }
  removeLastSelectedObj(force) {
    if (force) {
      for (var shape of this.selectedShapes) {
        this._removeLastSelectedObj(shape);
      }
      this.selectedShapes = [];
    } else {
      const shape = this.selectedShapes.pop();
      this._removeLastSelectedObj(shape);
      this.notify();
    }
  }

  update() {}

  dispose() {
    this.disableContext();
  }
}

export { SelectObject };
