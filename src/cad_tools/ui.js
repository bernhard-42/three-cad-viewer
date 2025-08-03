import { TopoFilter } from "./../raycast.js";

const xyzColors = [
  "tcv_x_measure_val",
  "tcv_y_measure_val",
  "tcv_z_measure_val",
];

function createVectorRow(key, value) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");

  th.textContent = key;
  th.classList.add("tcv_measure_key");
  th.classList.add("tcv_measure_cell");
  tr.appendChild(th);

  const br1 = document.createElement("td");
  br1.textContent = "(";
  br1.classList.add("tcv_measure_cell_bracket");
  tr.appendChild(br1);

  for (let i = 0; i < 3; ++i) {
    const td = document.createElement("td");
    td.textContent = value[i].toFixed(3);
    td.classList.add("tcv_measure_val");
    td.classList.add("tcv_measure_cell");
    td.classList.add(xyzColors[i]);
    tr.appendChild(td);
  }

  const br2 = document.createElement("td");
  br2.textContent = ")";
  br2.classList.add("tcv_measure_cell_bracket");
  tr.appendChild(br2);

  return tr;
}

function createStringRow(key, value) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");
  th.textContent = key;
  th.classList.add("tcv_measure_key");
  th.classList.add("tcv_measure_cell");
  tr.appendChild(th);

  td.textContent = value;
  td.classList.add("tcv_measure_val_center");
  td.classList.add("tcv_measure_cell");
  td.colSpan = 5;
  tr.appendChild(td);

  return tr;
}

function createValueRow(key, value, qualifier = null) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");

  th.textContent = key;
  th.classList.add("tcv_measure_key");
  th.classList.add("tcv_measure_cell");
  tr.appendChild(th);

  for (var i = 0; i < 2; i++) {
    const empty = document.createElement("td");
    tr.appendChild(empty);
  }

  td.textContent = value.toFixed(3);
  td.classList.add("tcv_measure_val");
  td.classList.add("tcv_measure_cell");
  tr.appendChild(td);

  if (qualifier == null) {
    for (var i = 0; i < 2; i++) {
      const empty = document.createElement("td");
      tr.appendChild(empty);
    }
  } else {
    const qualText = document.createElement("td");
    qualText.textContent = `(${qualifier})`;
    qualText.classList.add("tcv_measure_cell");
    tr.appendChild(qualText);
    const empty = document.createElement("td");
    tr.appendChild(empty);
  }
  return tr;
}

class Panel {
  /**
   * @param {import ("../display.js").Display} display
   */
  constructor(display) {
    this.display = display;
    this.html = this._getHtml();
    this.finished = false;
    this.callbacks = [];
    this.html.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
    });
  }

  _removeTable() {
    const table = this.html.getElementsByTagName("table");
    if (table.length > 0) {
      table[0].remove();
    }
    this.finished = false;
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
   * Get status of the panel
   */
  isVisible = () => {
    return this.html.style.display == "inline-block";
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

  createTable(properties) {
    if (this.finished) return;

    this._removeTable();

    this.subheader = `${properties["shape type"]}/${properties["geom type"]}`;
    const table = document.createElement("table");
    table.classList.add("tcv_properties_table");
    const tbody = document.createElement("tbody");
    for (const key in properties) {
      if (!properties.hasOwnProperty(key)) continue;
      if (
        [
          "shape type",
          "geom type",
          "type",
          "type",
          "tool_type",
          "subtype",
          "info",
          "info1",
          "info2",
        ].includes(key)
      )
        continue;

      const value = properties[key];

      var tr;
      if (Array.isArray(value) && value.length === 3) {
        var key2 = key;
        if (key2 == "point1") key2 = "point 1";
        if (key2 == "point2") key2 = "point 2";

        tr = createVectorRow(key2, value);
        tbody.appendChild(tr);
      } else {
        if (key === "distance") {
          tr = createValueRow(key, value, properties["info"]);
        } else {
          tr = createValueRow(key, value);
        }
        tbody.appendChild(tr);

        if (key == "angle") {
          tr.classList.add("tcv_measure_cell_top_border");

          tr = createStringRow("ref 1", properties["info1"]);
          tbody.appendChild(tr);
          tr = createStringRow("ref 2", properties["info2"]);
          tbody.appendChild(tr);
        }
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this.html.append(table);
    this.finished = true;
  }
  // get total() {
  //   return this._getCellValue("tcv_total");
  // }
}

class PropertiesPanel extends Panel {
  constructor(display) {
    super(display);

    // this._removeTable();
  }

  _getHtml() {
    return this.display._getElement("tcv_properties_measurement_panel");
  }

  set subheader(subheader) {
    this._setCellValue("tcv_measure_subheader", subheader);
  }

  get subheader() {
    return this._getCellValue("tcv_measure_subheader");
  }

  createTable(properties) {
    if (this.finished) return;

    this._removeTable();

    this.subheader = `${properties["shape type"]}/${properties["geom type"]}`;
    const table = document.createElement("table");
    table.classList.add("tcv_properties_table");
    const tbody = document.createElement("tbody");
    for (const key in properties) {
      if (!properties.hasOwnProperty(key)) continue;
      if (
        ["shape type", "geom type", "type", "tool_type", "subtype"].includes(
          key,
        )
      )
        continue;

      const value = properties[key];

      var tr;
      if (key === "bb") {
        for (var bbKey in value) {
          const tr = createVectorRow(`BB ${bbKey}`, value[bbKey]);
          if (bbKey === "min") {
            tr.classList.add("tcv_measure_cell_top_border");
          }
          tbody.appendChild(tr);
        }
      } else if (Array.isArray(value) && value.length === 3) {
        tr = createVectorRow(key, value);
        tbody.appendChild(tr);
      } else {
        tr = createValueRow(key, value);
        tbody.appendChild(tr);
      }
      if (["length", "area", "volume", "start"].includes(key)) {
        tr.classList.add("tcv_measure_cell_top_border");
      }
    }
    table.appendChild(tbody);
    this.html.append(table);
    this.finished = true;
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

export { FilterByDropDownMenu, DistancePanel, PropertiesPanel };
