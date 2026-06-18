import type { PickedComponent } from "../../rendering/picked.js";
import type { ViewerLike } from "./tools.js";

class SelectObject {
  viewer: ViewerLike;
  selectedShapes: PickedComponent[];
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
    for (const shape of this.selectedShapes) {
      shape.clearHighlights();
    }
    this.selectedShapes = [];
  }

  _getMaxObjSelected(): null {
    return null;
  }

  /** Numeric sub-index from a leaf name like "faces_3" → "3". */
  private _getIndex(name: string): string {
    return name.split("_")[1];
  }

  private _includes(shape: PickedComponent): boolean {
    return this.selectedShapes.some((s) => s.equals(shape));
  }

  notify(): void {
    const indices = this.selectedShapes.map((s) => this._getIndex(s.name));
    this.viewer.checkChanges({ selected: indices }, true);
  }

  handleSelection(selectedObj: PickedComponent | null): void {
    if (!selectedObj) return;
    if (this._includes(selectedObj)) {
      this.selectedShapes = this.selectedShapes.filter(
        (s) => !s.equals(selectedObj),
      );
    } else {
      this.selectedShapes.push(selectedObj);
    }
    this.notify();
  }

  private _removeLastSelectedObj(shape: PickedComponent | undefined): void {
    if (shape) {
      shape.clearHighlights();
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
