import type { PickedObject } from "../raycast.js";
import type { ViewerLike } from "./tools.js";

class SelectObject {
  viewer: ViewerLike;
  selectedShapes: PickedObject[];
  contextEnabled: boolean;

  constructor(viewer: ViewerLike) {
    this.viewer = viewer;
    this.selectedShapes = [];
    this.contextEnabled = false;
  }

  enableContext(): void {
    this.contextEnabled = true;
  }

  disableContext(): void {
    this.contextEnabled = false;
    for (const group of this.selectedShapes) {
      group.obj.clearHighlights();
    }
    this.selectedShapes = [];
  }

  _getMaxObjSelected(): null {
    return null;
  }

  private _getIndex(path: string): string {
    const object = path.split("|");
    const name = object[object.length - 1];
    return name.split("_")[1];
  }

  private _includes(path: string): boolean {
    for (const shape of this.selectedShapes) {
      if (path === shape.obj.name) {
        return true;
      }
    }
    return false;
  }

  notify(): void {
    const indices: string[] = [];
    for (const shape of this.selectedShapes) {
      const path = shape.obj.name;
      indices.push(this._getIndex(path));
    }
    this.viewer.checkChanges({ selected: indices }, true);
  }

  handleSelection(selectedObj: PickedObject | null): void {
    if (!selectedObj) return;
    const path = selectedObj.obj.name;
    if (this._includes(path)) {
      this.selectedShapes = this.selectedShapes.filter(
        (p) => p.obj.name !== path,
      );
    } else {
      this.selectedShapes.push(selectedObj);
    }
    this.notify();
  }

  private _removeLastSelectedObj(shape: PickedObject | undefined): void {
    if (shape) {
      const objs = shape.objs();
      for (const obj of objs) {
        obj.clearHighlights();
      }
    }
    this.notify();
  }

  removeLastSelectedObj(force: boolean): void {
    if (force) {
      for (const shape of this.selectedShapes) {
        this._removeLastSelectedObj(shape);
      }
      this.selectedShapes = [];
    } else {
      const shape = this.selectedShapes.pop();
      this._removeLastSelectedObj(shape);
      this.notify();
    }
  }

  update(): void {}

  handleResponse(_response: unknown): void {}

  dispose(): void {
    this.disableContext();
  }
}

export { SelectObject };
