import { TopoFilter } from "./../raycast.js";

class Panel {
  /**
   * @param {import ("../display.js").Display} display
   */
  constructor(display) {
    this.display = display;
    this.html = this._getHtml();
    this.callbacks = [];
    this.html.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
    });
  }

  _getHtml() {
    throw new Error("Not implemented");
  }

  // Helper function to get cell value by the CSS class name
  _getCellValue(cellClass) {
    const cellElement = this.display._getElement(cellClass);
    return cellElement ? cellElement.textContent : null;
  }

  // Helper function to set cell value by the CSS class name
  _setCellValue(cellClass, value) {
    const cellElement = this.display._getElement(cellClass);
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
    this.callbacks.push({ callback: callback, type: eventType });
    this.html.addEventListener(eventType, callback);
  }

  dispose() {
    for (var callback of this.callbacks) {
      this.html.removeEventListener(callback.type, callback.callback);
    }
  }
}

class DistancePanel extends Panel {
  constructor(display) {
    super(display);
  }

  _getHtml() {
    return this.display._getElement("tcv_distance_measurement_panel");
  }

  get total() {
    return this._getCellValue("tcv_total");
  }
  set total(value) {
    this._setCellValue("tcv_total", value);
  }

  get x_distance() {
    return this._getCellValue("tcv_x");
  }
  set x_distance(value) {
    this._setCellValue("tcv_x", value);
  }
  get y_distance() {
    return this._getCellValue("tcv_y");
  }
  set y_distance(value) {
    this._setCellValue("tcv_y", value);
  }
  get z_distance() {
    return this._getCellValue("tcv_z");
  }
  set z_distance(value) {
    this._setCellValue("tcv_z", value);
  }
}

class PropertiesPanel extends Panel {
  constructor(display) {
    super(display);

    this._hideAllRows();
  }

  _getHtml() {
    return this.display._getElement("tcv_properties_measurement_panel");
  }

  _hideAllRows() {
    const rows = this.html.getElementsByTagName("tr");
    for (var i = 0; i < rows.length; i++) {
      rows[i].style.display = "none";
      if (rows[i].classList.contains("tcv_vertex_coords_title_row")) continue;
      const cells = rows[i].getElementsByTagName("td");
      for (var j = 0; j < cells.length; j++) {
        cells[j].textContent = "";
      }
    }
  }

  set subheader(subheader) {
    this._setCellValue("tcv_measure_subheader", subheader);
  }
  get subheader() {
    return this._getCellValue("tcv_measure_subheader");
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
    this._hideAllRows();

    // Define the field names corresponding to table rows
    const fieldToCell = {
      vertex_coords: ["x_value", "y_value", "z_value"],
      volume: "volume",
      area: "area",
      length: "length",
      width: "width",
      radius: "radius",
      radius2: "radius2",
      geom_type: "geom_type",
    };

    // Iterate through the fields and set their values
    for (const field in fieldToCell) {
      const cellId = fieldToCell[field];
      const value = properties[field];

      if (value !== null && value !== undefined) {
        if (Array.isArray(cellId)) {
          // Only the vertex coordinates are an array
          const vertex_title_row = this.display._getElement(
            "tcv_vertex_coords_title_row",
          );
          vertex_title_row.style.display = "table-row";
          for (let i = 0; i < cellId.length; i++) {
            const row = this.display
              ._getElement("tcv_" + cellId[i])
              .closest("tr");
            row.style.display = "table-row";
            this._setCellValue("tcv_" + cellId[i], value[i]);
          }
        } else {
          const row = this.display._getElement("tcv_" + cellId).closest("tr");
          row.style.display = "table-row";
        }

        this._setCellValue("tcv_" + cellId, value);
      }
    }
  }
}

class AnglePanel extends Panel {
  constructor(display) {
    super(display);
  }

  _getHtml() {
    return this.display._getElement("tcv_angle_measurement_panel");
  }

  get angle() {
    return this._getCellValue("tcv_angle");
  }

  set angle(value) {
    this._setCellValue("tcv_angle", value);
  }
}

class FilterByDropDownMenu {
  /**
   * Initialize a new filter drop down menu, it needs the raycast to update interactively the filter mode
   */
  constructor(display) {
    this.display = display;
    this.selectElement = display._getElement("tcv_shape_filter");
    this.dropdownElement = display._getElement("tcv_filter_dropdown");
    this.arrowElement = display._getElement("tcv_filter_icon");
    this.options = ["none", "vertex", "edge", "face", "solid"];
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

  _setValue = (topoType) => {
    if (this.raycaster != null) {
      this.display._getElement("tcv_filter_value").innerText = topoType;
      if (topoType == "none") {
        this.raycaster.filters.topoFilter = [TopoFilter.none];
      } else {
        this.raycaster.filters.topoFilter = [
          TopoFilter[topoType.toLowerCase()],
        ];
      }
    }
  };

  _toggleDropdown = (ev) => {
    if (ev != null) {
      ev.stopPropagation();
    }
    if (this.dropdownElement.classList.contains("tcv_filter_dropdown_active")) {
      this.dropdownElement.classList.remove("tcv_filter_dropdown_active");
      this.arrowElement.innerText = "⏶";
    } else {
      this.dropdownElement.classList.add("tcv_filter_dropdown_active");
      this.arrowElement.innerText = "⏷";
    }
  };

  _closeDropdown = (ev) => {
    if (this.dropdownElement.classList.contains("tcv_filter_dropdown_active")) {
      this._toggleDropdown(ev);
    }
  };

  handleSelection = (ev) => {
    const topoType = ev.target.innerText;
    this._setValue(topoType);
    this._toggleDropdown(ev);
  };

  reset = () => {
    this._setValue("None");
  };

  _keybindSelect = (e) => {
    const validKeys = ["n", "v", "e", "f", "s", "Escape"];
    if (validKeys.indexOf(e.key) === -1) return;
    if (e.key == "n") this._setValue("None");
    else if (e.key == "v") this._setValue("Vertex");
    else if (e.key == "e") this._setValue("Edge");
    else if (e.key == "f") this._setValue("Face");
    else if (e.key == "s") this._setValue("Solid");
    else if (e.key == "Escape") this._closeDropdown();
  };

  /**
   * Show or hide the drop down menu
   * @param {boolean} flag
   */
  show(flag) {
    if (flag) {
      this.display.container.addEventListener("keydown", this._keybindSelect);
      this.display.container.addEventListener("click", this._closeDropdown);

      let el = this.display._getElement("tcv_filter_content");
      el.addEventListener("click", this._toggleDropdown);

      for (const option of this.options) {
        el = this.display._getElement(`tvc_filter_${option}`);
        el.addEventListener("click", this.handleSelection);
      }
    } else {
      this.display.container.removeEventListener(
        "keydown",
        this._keybindSelect,
      );
      this.display.container.removeEventListener("click", this._closeDropdown);

      let el = this.display._getElement("tcv_filter_content");
      el.removeEventListener("click", this._toggleDropdown);

      for (const option of this.options) {
        el = this.display._getElement(`tvc_filter_${option}`);
        el.removeEventListener("click", this.handleSelection);
      }
    }

    this.selectElement.style.display = flag ? "block" : "none";
  }
}

export { FilterByDropDownMenu, DistancePanel, PropertiesPanel, AnglePanel };
