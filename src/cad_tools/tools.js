import { DistanceMeasurement, PropertiesMeasurement } from "./measure";

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
    PROPERTIES: "PropertiesMeasurement"
};

export class Tools {
    /**
     * 
     * @param {import ("../viewer.js").Viewer} viewer The viewer instance
     */
    constructor(viewer) {
        this.distanceMeasurement = new DistanceMeasurement(viewer);
        this.propertiesMeasurement = new PropertiesMeasurement(viewer);
        this.enabledTool = null; // There can only be one enabled tool at a time
    }

    /**
     * Enables a specific tool. (Disables the currently enabled tool if any)
     * @param {ToolTypes} toolType - The type of tool to enable.
     */
    enable(toolType) {
        // Disable the currently enabled tool (if any)
        if (this.enabledTool) {
            this._disable();
        }

        switch (toolType) {
            case ToolTypes.DISTANCE:
                this.distanceMeasurement.enableContext();
                break;
            case ToolTypes.PROPERTIES:
                this.propertiesMeasurement.enableContext();
                break;
            default:
                throw new Error(`Unknown tool type: ${toolType}`);
        }

        this.enabledTool = toolType;
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
            default:
                throw new Error(`Unknown tool type: ${this.enabledTool}`);
        }

        // Reset the currently enabled tool to null
        this.enabledTool = null;
    }

    handleRemoveLastSelection() {
        if (this.distanceMeasurement.contextEnabled) {
            this.distanceMeasurement.removeLastSelectedObj();
        }
        else if (this.propertiesMeasurement.contextEnabled) {
            this.propertiesMeasurement.removeLastSelectedObj();
        }
    }

    /**
     * @param {import ("../nestedgroup.js").ObjectGroup} objGroup The selected object group.
     */
    handleSelectedObj(objGroup) {

        if (this.distanceMeasurement.contextEnabled)
            this.distanceMeasurement.handleSelection(objGroup);
        else if (this.propertiesMeasurement.contextEnabled)
            this.propertiesMeasurement.handleSelection(objGroup);
    }

    handleResetSelection() {
        if (this.distanceMeasurement.contextEnabled) {
            this.distanceMeasurement.removeLastSelectedObj();
            this.distanceMeasurement.removeLastSelectedObj();
        }
        else if (this.propertiesMeasurement.contextEnabled)
            this.propertiesMeasurement.removeLastSelectedObj();
    }

    /**
     * Handle the response from the backend.
     * @param {Object} response 
     */
    handleResponse(response) {
        const toolType = response.get("tool_type");
        switch (toolType) {
            case ToolTypes.DISTANCE:
                this.distanceMeasurement.handleResponse(response);
                break;
            case ToolTypes.PROPERTIES:
                this.propertiesMeasurement.handleResponse(response);
        }
    }

    /**
     * This is called each time the viewer gets updated
     */
    update() {
        if (this.distanceMeasurement.contextEnabled)
            this.distanceMeasurement.update();
        else if (this.propertiesMeasurement.contextEnabled)
            this.propertiesMeasurement.update();
    }
}