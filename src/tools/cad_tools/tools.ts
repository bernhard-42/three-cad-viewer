import * as THREE from "three";
import { DistanceMeasurement, PropertiesMeasurement } from "./measure.js";
import { SelectObject } from "./select.js";
import type { PickedObject } from "../../rendering/raycast.js";

/**
 * Enum representing tool types.
 */
export const ToolTypes = {
  NONE: "None",
  DISTANCE: "DistanceMeasurement",
  PROPERTIES: "PropertiesMeasurement",
  SELECT: "SelectObjects",
} as const;

export type ToolType = typeof ToolTypes[keyof typeof ToolTypes];

/**
 * UI elements for measurement panels.
 */
export interface MeasurementPanelElements {
  distancePanel: HTMLElement;
  propertiesPanel: HTMLElement;
}

/**
 * UI elements for the shape filter dropdown.
 */
export interface FilterDropdownElements {
  container: HTMLElement;
  dropdown: HTMLElement;
  icon: HTMLElement;
  value: HTMLElement;
  content: HTMLElement;
  options: {
    none: HTMLElement;
    vertex: HTMLElement;
    edge: HTMLElement;
    face: HTMLElement;
    solid: HTMLElement;
  };
}

/**
 * Minimal display interface for CAD tools.
 */
export interface DisplayLike {
  container: HTMLElement;
  shapeFilterDropDownMenu: {
    reset(): void;
  };
  /** UI elements for measurement panels */
  measurementPanels: MeasurementPanelElements;
  /** UI elements for filter dropdown */
  filterDropdown: FilterDropdownElements;
}

/**
 * Minimal viewer interface for CAD tools.
 * Used by measurement, selection, and zebra tools.
 */
export interface ViewerLike {
  display: DisplayLike;
  renderer: THREE.WebGLRenderer;
  camera: {
    getCamera(): THREE.Camera;
    getZoom(): number;
  } | null;
  state: {
    get(key: string): unknown;
  };
  ortho: boolean;
  bb_radius: number;
  checkChanges(changes: Record<string, unknown>, notify?: boolean): void;
}

export interface ToolResponse {
  tool_type: ToolType;
  [key: string]: unknown;
}

export class Tools {
  viewer: ViewerLike;
  distanceMeasurement: DistanceMeasurement;
  propertiesMeasurement: PropertiesMeasurement;
  selectObject: SelectObject;
  enabledTool: ToolType | null;

  constructor(viewer: ViewerLike, debug: boolean) {
    this.viewer = viewer;
    this.distanceMeasurement = new DistanceMeasurement(viewer, debug);
    this.propertiesMeasurement = new PropertiesMeasurement(viewer, debug);
    this.selectObject = new SelectObject(viewer);
    this.enabledTool = null;
  }

  /**
   * Enables a specific tool. (Disables the currently enabled tool if any)
   */
  enable(toolType: ToolType): void {
    // Disable the currently enabled tool (if any)
    if (this.enabledTool) {
      this.disable();
    }

    switch (toolType) {
      case ToolTypes.DISTANCE:
        this.distanceMeasurement.enableContext();
        break;
      case ToolTypes.PROPERTIES:
        this.propertiesMeasurement.enableContext();
        break;
      case ToolTypes.SELECT:
        this.selectObject.enableContext();
        break;
      default:
        throw new Error(`Unknown tool type: ${toolType}`);
    }

    this.enabledTool = toolType;
  }

  disable(): void {
    if (this.enabledTool) {
      this.viewer.display.shapeFilterDropDownMenu.reset();
      this._disable();
    }
  }

  /**
   * Disables the currently enabled tool.
   */
  _disable(): void {
    if (!this.enabledTool) {
      return;
    }

    switch (this.enabledTool) {
      case ToolTypes.DISTANCE:
        this.distanceMeasurement.disableContext();
        break;
      case ToolTypes.PROPERTIES:
        this.propertiesMeasurement.disableContext();
        break;
      case ToolTypes.SELECT:
        this.selectObject.disableContext();
        break;
      default:
        throw new Error(`Unknown tool type: ${this.enabledTool}`);
    }

    this.enabledTool = null;
  }

  handleRemoveLastSelection(force: boolean = false): void {
    if (this.distanceMeasurement.contextEnabled) {
      this.distanceMeasurement.removeLastSelectedObj(force);
    } else if (this.propertiesMeasurement.contextEnabled) {
      this.propertiesMeasurement.removeLastSelectedObj(force);
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.removeLastSelectedObj(false);
    }
  }

  /**
   * Handle selected object from raycaster.
   */
  handleSelectedObj(selectedObj: PickedObject, isNewObject: boolean, shift: boolean): void {
    if (this.distanceMeasurement.contextEnabled) {
      if (isNewObject) {
        this.distanceMeasurement.removeLastSelectedObj();
      }
      this.distanceMeasurement.handleSelection(selectedObj, shift);
    } else if (this.propertiesMeasurement.contextEnabled) {
      if (isNewObject) {
        this.propertiesMeasurement.removeLastSelectedObj();
      }
      this.propertiesMeasurement.handleSelection(selectedObj);
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.handleSelection(selectedObj);
    }
  }

  handleResetSelection(): void {
    if (this.distanceMeasurement.contextEnabled) {
      this.distanceMeasurement.removeLastSelectedObj(true);
      this.distanceMeasurement.removeLastSelectedObj(true);
    } else if (this.propertiesMeasurement.contextEnabled) {
      this.propertiesMeasurement.removeLastSelectedObj(true);
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.removeLastSelectedObj(true);
    }
  }

  /**
   * Handle the response from the backend.
   */
  handleResponse(response: ToolResponse): void {
    const toolType = response.tool_type;
    switch (toolType) {
      case ToolTypes.DISTANCE:
        this.distanceMeasurement.handleResponse(response);
        break;
      case ToolTypes.PROPERTIES:
        this.propertiesMeasurement.handleResponse(response);
        break;
      case ToolTypes.SELECT:
        this.selectObject.handleResponse(response);
        break;
    }
  }

  /**
   * This is called each time the viewer gets updated
   */
  update(): void {
    if (this.distanceMeasurement.contextEnabled) {
      this.distanceMeasurement.update();
    } else if (this.propertiesMeasurement.contextEnabled) {
      this.propertiesMeasurement.update();
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.update();
    }
  }

  dispose(): void {
    this.distanceMeasurement.dispose();
    this.propertiesMeasurement.dispose();
    this.selectObject.dispose();
  }
}
