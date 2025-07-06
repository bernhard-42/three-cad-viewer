import {
  AngleMeasurement,
  DistanceMeasurement,
  PropertiesMeasurement,
} from "./measure";
import { SelectObject } from "./select";

/**
 * Enum representing tool types.
 * @typedef {Object} ToolTypes
 * @property {string} NONE - Represents no tool.
 * @property {string} DISTANCE - Distance measurement tool.
 * @property {string} PROPERTIES - Properties measurement tool.
 */
export const ToolTypes = {
  NONE: "None",
  DISTANCE: "DistanceMeasurement",
  PROPERTIES: "PropertiesMeasurement",
  ANGLE: "AngleMeasurement",
  SELECT: "SelectObjects",
};

export class Tools {
  /**
   *
   * @param {import ("../viewer.js").Viewer} viewer The viewer instance
   */
  constructor(viewer) {
    this.viewer = viewer;
    this.distanceMeasurement = new DistanceMeasurement(viewer);
    this.propertiesMeasurement = new PropertiesMeasurement(viewer);
    this.angleMeasurement = new AngleMeasurement(viewer);
    this.selectObject = new SelectObject(viewer);
    this.enabledTool = null; // There can only be one enabled tool at a time
  }

  /**
   * Enables a specific tool. (Disables the currently enabled tool if any)
   * @param {ToolTypes} toolType - The type of tool to enable.
   */
  enable(toolType) {
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
      case ToolTypes.ANGLE:
        this.angleMeasurement.enableContext();
        break;
      case ToolTypes.SELECT:
        this.selectObject.enableContext();
        break;
      default:
        throw new Error(`Unknown tool type: ${toolType}`);
    }

    this.enabledTool = toolType;
  }

  disable() {
    if (this.enabledTool) {
      this.viewer.display.shapeFilterDropDownMenu.reset();
      this._disable();
    }
  }

  /**
   * Disables the currently enabled tool.
   */
  _disable() {
    if (!this.enabledTool) {
      return; // No tool is currently enabled
    }

    // Disable the currently enabled tool using a switch statement
    switch (this.enabledTool) {
      case ToolTypes.DISTANCE:
        this.distanceMeasurement.disableContext();
        break;
      case ToolTypes.PROPERTIES:
        this.propertiesMeasurement.disableContext();
        break;
      case ToolTypes.ANGLE:
        this.angleMeasurement.disableContext();
        break;
      case ToolTypes.SELECT:
        this.selectObject.disableContext();
        break;
      default:
        throw new Error(`Unknown tool type: ${this.enabledTool}`);
    }

    // Reset the currently enabled tool to null
    this.enabledTool = null;
  }

  handleRemoveLastSelection(force = false) {
    if (this.distanceMeasurement.contextEnabled) {
      this.distanceMeasurement.removeLastSelectedObj(force);
    } else if (this.propertiesMeasurement.contextEnabled) {
      this.propertiesMeasurement.removeLastSelectedObj(force);
    } else if (this.angleMeasurement.contextEnabled) {
      this.angleMeasurement.removeLastSelectedObj(force);
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.removeLastSelectedObj(false);
    }
  }

  /**
   * obj: ObjectGroup
   * @param {object} selectedObj The selected obj.
   */
  handleSelectedObj(selectedObj, isNewObject) {
    if (this.distanceMeasurement.contextEnabled) {
      if (isNewObject) {
        this.distanceMeasurement.removeLastSelectedObj();
      }
      this.distanceMeasurement.handleSelection(selectedObj);
    } else if (this.propertiesMeasurement.contextEnabled) {
      if (isNewObject) {
        this.propertiesMeasurement.removeLastSelectedObj();
      }
      this.propertiesMeasurement.handleSelection(selectedObj);
    } else if (this.angleMeasurement.contextEnabled) {
      if (isNewObject) {
        this.angleMeasurement.removeLastSelectedObj();
      }
      this.angleMeasurement.handleSelection(selectedObj);
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.handleSelection(selectedObj);
    }
  }

  handleResetSelection() {
    if (this.distanceMeasurement.contextEnabled) {
      this.distanceMeasurement.removeLastSelectedObj(true);
      this.distanceMeasurement.removeLastSelectedObj(true);
    } else if (this.propertiesMeasurement.contextEnabled)
      this.propertiesMeasurement.removeLastSelectedObj(true);
    else if (this.angleMeasurement.contextEnabled) {
      this.angleMeasurement.removeLastSelectedObj(true);
      this.angleMeasurement.removeLastSelectedObj(true);
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.removeLastSelectedObj(true);
    }
  }

  /**
   * Handle the response from the backend.
   * @param {Object} response
   */
  handleResponse(response) {
    console.log(response);
    const toolType = response.tool_type;
    switch (toolType) {
      case ToolTypes.DISTANCE:
        this.distanceMeasurement.handleResponse(response);
        break;
      case ToolTypes.PROPERTIES:
        this.propertiesMeasurement.handleResponse(response);
        break;
      case ToolTypes.ANGLE:
        this.angleMeasurement.handleResponse(response);
        break;
      case ToolTypes.SELECT:
        this.selectObject.handleResponse(response);
        break;
    }
  }

  /**
   * This is called each time the viewer gets updated
   */
  update() {
    if (this.distanceMeasurement.contextEnabled) {
      this.distanceMeasurement.update();
    } else if (this.propertiesMeasurement.contextEnabled) {
      this.propertiesMeasurement.update();
    } else if (this.angleMeasurement.contextEnabled) {
      this.angleMeasurement.update();
    } else if (this.selectObject.contextEnabled) {
      this.selectObject.update();
    }
  }

  dispose() {
    this.distanceMeasurement.dispose();
    this.angleMeasurement.dispose();
    this.propertiesMeasurement.dispose();
    this.selectObject.dispose();
  }
}
