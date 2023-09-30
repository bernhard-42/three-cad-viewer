
class Panel {
    constructor() {
        this.html = this._getHtml();
    }

    _getHtml() {
        throw new Error("Not implemented");
    }

    // Helper function to get cell value by ID
    _getCellValue(cellId) {
        const cellElement = document.getElementById(cellId);
        return cellElement ? cellElement.textContent : null;
    }

    // Helper function to set cell value by ID
    _setCellValue(cellId, value) {
        const cellElement = document.getElementById(cellId);
        if (cellElement) {
            cellElement.textContent = value;
        }
    }

    /**
     * Show or hide the panel
     * @param {boolean} flag 
     */
    show = (flag) => {
        this.html.style.display = flag ? "inline-block" : "none";
    };

    /**
     * Sets the position of the panel (with the top left corner at the specified coordinates)
     * @param {number} x 
     * @param {number} y 
     */
    relocate = (x, y) => {
        this.html.style.left = `${x}px`;
        this.html.style.top = `${y}px`;
    };


    /**
     * Register a callback for a specific event type
     * @param {string} eventType - The type of event to register the callback for
     * @param {CallableFunction} callback - The callback function to register
     */
    registerCallback(eventType, callback) {
        this.html.addEventListener(eventType, callback);
    }
}

class DistancePanel extends Panel {
    constructor() {
        super();
    }

    _getHtml() {
        return document.getElementsByClassName("tcv_distance_measurement_panel")[0];
    }

    get distance() {
        return this._getCellValue("total");
    }
    set distance(value) {
        this._setCellValue("total", value);
    }

    get x_distance() {
        return this._getCellValue("x");
    }
    set x_distance(value) {
        this._setCellValue("x", value);
    }
    get y_distance() {
        return this._getCellValue("y");
    }
    set y_distance(value) {
        this._setCellValue("y", value);
    }
    get z_distance() {
        return this._getCellValue("z");
    }
    set z_distance(value) {
        this._setCellValue("z", value);
    }

}

class PropertiesPanel extends Panel {
    constructor() {
        super();

        this._hideAllRows();
    }


    _getHtml() {
        return document.getElementsByClassName("tcv_properties_measurement_panel")[0];
    }

    _hideAllRows() {
        const rows = this.html.getElementsByTagName("tr");
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].id == "vertex_coords_title_row" || rows[i].id == "vertex_coords_row")
                continue;

            rows[i].style.display = "none";
            const cells = rows[i].getElementsByTagName("td");
            for (var j = 0; j < cells.length; j++) {
                cells[j].textContent = "";
            }
        }
    }

    set subheader(subheader) {
        this._setCellValue("subheader", subheader);
    }
    get subheader() {
        return this._getCellValue("subheader");
    }

    _adjustPanelStyle() {

        const table = document.getElementById("tcv_properties_table");

        // set no border bottom to last displayed row
        const rows = table.getElementsByTagName("tr");
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            if (row.style.display == "block") {
                row.style.borderBottom = "none";
                break;
            }
        }

        if (document.getElementById("vertex_coords_row").style.display == "block") // no edit on vertex css
            return;

        const headers = table.getElementsByTagName("th");
        const values = table.getElementsByTagName("td");
        const fontFactor = 8;
        let maxWidthHeader = 0;
        let maxWidthValue = 0;

        // Find the maximum width among the cells in the specified column
        for (let i = 0; i < headers.length; i++) {
            const cell = headers[i];
            const value = values[i];
            const cellWidth = cell.textContent.length * fontFactor; // Width of the cell's content
            const cellWidthValue = value.textContent.length * fontFactor; // Width of the cell's content
            maxWidthHeader = Math.max(maxWidthHeader, cellWidth);
            maxWidthValue = Math.max(maxWidthValue, cellWidthValue);
        }

        // Set the width of the specified column to the maximum width
        for (let i = 0; i < headers.length; i++) {
            const cell = headers[i];
            cell.style.width = maxWidthHeader + "px";
            const value = values[i];
            value.style.width = maxWidthValue + "px";
        }


    }

    /**
     * Set the properties of the panel valid props are :
     * - vertex_coords : [x, y, z] array of numbers
     * - volume : number
     * - area : number
     * - length : number
     * - width : number
     * - radius : number
     * - geom_type : string
     * @param {object} properties 
     */
    setProperties(properties) {
        // Define the field names corresponding to table rows
        const fieldToCell = {
            "vertex_coords": ["x_value", "y_value", "z_value"],
            "volume": "volume",
            "area": "area",
            "length": "length",
            "width": "width",
            "radius": "radius",
            "geom_type": "geom_type",
        };

        // Iterate through the fields and set their values
        for (const field in fieldToCell) {
            const cellId = fieldToCell[field];
            const value = properties[field];

            if (value !== null && value !== undefined) {
                if (Array.isArray(cellId)) {
                    // Only the vertex coordinates are an array
                    const vertex_title_row = document.getElementById("vertex_coords_title_row");
                    vertex_title_row.style.display = "block";
                    for (let i = 0; i < cellId.length; i++) {
                        const row = document.getElementById(cellId[i]).closest("tr");
                        row.style.display = "block";
                        this._setCellValue(cellId[i], value[i]);
                    }
                } else {
                    const row = document.getElementById(cellId).closest("tr");;
                    row.style.display = "block";
                }

                this._setCellValue(cellId, value);
            }
        }

        this._adjustPanelStyle();
    }
}

class AnglePanel extends Panel {
    constructor() {
        super();
    }

    _getHtml() {
        return document.getElementsByClassName("tcv_angle_measurement_panel")[0];
    }

    get angle() {
        return this._getCellValue("angle");
    }

    set angle(value) {
        this._setCellValue("angle", value);
    }

}

class FilterByDropDownMenu {

    /**
     * Initialize a new filter drop down menu, it needs the raycast to update interactively the filter mode
     */
    constructor() {
        this.selectElement = document.getElementById("shape_filter");
        this.selectElement.addEventListener("change", this.handleSelection);
        this.selectElement.style.display = "none";
        this.raycaster = null;
    }

    /** 
     * Set the raycaster to update the filter mode
    * @param {import ("./../raycast.js").Raycaster } raycaster 
    */
    setRaycaster(raycaster) {
        this.raycaster = raycaster;
    }

    handleSelection = () => {
        const shapeType = this.selectElement.value;
        if (shapeType == "none")
            this.raycaster.filterType = null;
        else
            this.raycaster.filterType = shapeType;
    };

    _keybindSelect = (e) => {
        const validKeys = ["n", "v", "e", "f", "s"];
        if (validKeys.indexOf(e.key) === -1)
            return;
        if (e.key == "n")
            this.selectElement.value = "none";
        else if (e.key == "v")
            this.selectElement.value = "vertex";
        else if (e.key == "e")
            this.selectElement.value = "edge";
        else if (e.key == "f")
            this.selectElement.value = "face";
        else if (e.key == "s")
            this.selectElement.value = "solid";

        this.selectElement.dispatchEvent(new Event("change"));
    };


    /**
     * Show or hide the drop down menu
     * @param {boolean} flag 
     */
    show(flag) {
        if (flag)
            document.addEventListener("keydown", this._keybindSelect);
        else
            document.removeEventListener("keydown", this._keybindSelect);
        this._keybindSelect({ key: "n" });
        this.selectElement.style.display = flag ? "block" : "none";
    }
}

export { FilterByDropDownMenu, DistancePanel, PropertiesPanel, AnglePanel };