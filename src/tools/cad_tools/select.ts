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

  /** Switch the tool off: the selection is dropped and reported empty, once. */
  disableContext(): void {
    this.contextEnabled = false;
    this._clear();
  }

  /** Clear every selected shape's highlight, empty the list and notify once. */
  private _clear(): void {
    for (const shape of this.selectedShapes) {
      shape.clearHighlights();
    }
    this.selectedShapes = [];
    this.notify();
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

  /** Replace the selection with `shapes` (already highlighted), with one notification. */
  setSelection(shapes: PickedComponent[]): void {
    this.selectedShapes = [...shapes];
    this.notify();
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

  /**
   * Remove the last selected shape (Backspace), or with `force` all of them
   * (Escape). Either way the remaining selection is reported once.
   */
  removeLastSelectedObj(force: boolean): void {
    if (force) {
      this._clear();
      return;
    }
    const shape = this.selectedShapes.pop();
    if (shape !== undefined) {
      shape.clearHighlights();
    }
    this.notify();
  }

  update(): void {}

  handleResponse(_response: unknown): void {}

  dispose(): void {
    this.disableContext();
  }
}

export { SelectObject };
