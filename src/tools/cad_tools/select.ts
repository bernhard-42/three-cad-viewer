import {
  selectionEntry,
  type PickedComponent,
} from "../../rendering/picked.js";
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

  private _includes(shape: PickedComponent): boolean {
    return this.selectedShapes.some((s) => s.equals(shape));
  }

  /**
   * Send the selection as `{"<object path>/<kind>": [indices]}` in selection
   * order, e.g. `{"/box/edges": [3, 5]}`; a whole solid as `"<solid>/solids": [0]`.
   */
  notify(): void {
    const selected: Record<string, number[]> = {};
    for (const shape of this.selectedShapes) {
      const [key, index] = selectionEntry(shape.backendId);
      if (selected[key] === undefined) selected[key] = [];
      selected[key].push(index);
    }
    this.viewer.checkChanges({ selected }, true);
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
