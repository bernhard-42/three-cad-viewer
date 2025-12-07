import { TopoFilter, Raycaster } from "./../raycast.js";
import type { DisplayLike } from "./tools.js";

interface CallbackEntry {
  callback: EventListener;
  type: string;
}

function createVectorRow(key: string, value: number[]): HTMLTableRowElement {
  const xyzColors = [
    "tcv_x_measure_val",
    "tcv_y_measure_val",
    "tcv_z_measure_val",
  ];
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

function createStringRow(key: string, value: string): HTMLTableRowElement {
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

function createValueRow(key: string, value: number, qualifier: string | null = null): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");

  th.textContent = key;
  th.classList.add("tcv_measure_key");
  th.classList.add("tcv_measure_cell");
  tr.appendChild(th);

  for (let i = 0; i < 2; i++) {
    const empty = document.createElement("td");
    tr.appendChild(empty);
  }

  td.textContent = value.toFixed(3);
  td.classList.add("tcv_measure_val");
  td.classList.add("tcv_measure_cell");
  tr.appendChild(td);

  if (qualifier == null) {
    for (let i = 0; i < 2; i++) {
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

abstract class Panel {
  display: DisplayLike;
  html: HTMLElement;
  finished: boolean;
  callbacks: CallbackEntry[];

  constructor(display: DisplayLike) {
    this.display = display;
    this.html = this.getHtmlElement();
    this.finished = false;
    this.callbacks = [];
    this.html.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
    });
  }

  private removeTable(): void {
    const table = this.html.getElementsByTagName("table");
    if (table.length > 0) {
      table[0].remove();
    }
    this.finished = false;
  }

  protected resetTable(): void {
    this.removeTable();
  }

  protected abstract getHtmlElement(): HTMLElement;

  /**
   * Show or hide the panel
   */
  show = (flag: boolean): void => {
    this.html.style.display = flag ? "inline-block" : "none";
  };

  /**
   * Get status of the panel
   */
  isVisible = (): boolean => {
    return this.html.style.display == "inline-block";
  };

  /**
   * Sets the position of the panel (with the top left corner at the specified coordinates)
   */
  relocate = (x: number | null, y: number | null): void => {
    this.html.style.left = `${x}px`;
    this.html.style.top = `${y}px`;
  };

  /**
   * Register a callback for a specific event type
   */
  registerCallback(eventType: string, callback: EventListener): void {
    this.callbacks.push({ callback: callback, type: eventType });
    this.html.addEventListener(eventType, callback);
  }

  dispose(): void {
    for (const callback of this.callbacks) {
      this.html.removeEventListener(callback.type, callback.callback);
    }
  }
}

interface DistanceResponseData {
  Distance?: number;
  Angle?: number;
  info?: string;
  info1?: string;
  info2?: string;
  refpoint1?: number[];
  refpoint2?: number[];
  [key: string]: unknown;
}

class DistancePanel extends Panel {
  constructor(display: DisplayLike) {
    super(display);
  }

  protected getHtmlElement(): HTMLElement {
    return this.display.measurementPanels.distancePanel;
  }

  createTable(properties: DistanceResponseData): void {
    if (this.finished) return;

    this.resetTable();

    const table = document.createElement("table");
    table.classList.add("tcv_properties_table");
    const tbody = document.createElement("tbody");
    for (const key in properties) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      if (
        [
          "shape_type",
          "geom_type",
          "type",
          "type",
          "tool_type",
          "subtype",
          "info",
          "info1",
          "info2",
          "refpoint1",
          "refpoint2",
        ].includes(key.toLowerCase())
      )
        continue;

      const value = properties[key];

      let tr: HTMLTableRowElement;
      if (Array.isArray(value) && value.length === 3) {
        tr = createVectorRow(key, value as number[]);
        tbody.appendChild(tr);
      } else {
        if (key.toLowerCase() === "distance") {
          tr = createValueRow(key, value as number, properties["info"] as string);
        } else {
          tr = createValueRow(key, value as number);
        }
        tbody.appendChild(tr);

        if (key.toLowerCase() == "angle") {
          tr.classList.add("tcv_measure_cell_top_border");

          tr = createStringRow("Reference 1", properties["info1"] as string);
          tbody.appendChild(tr);
          tr = createStringRow("Reference 2", properties["info2"] as string);
          tbody.appendChild(tr);
        }
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this.html.append(table);
    this.finished = true;
  }
}

interface PropertiesResponseData {
  shape_type?: string;
  geom_type?: string;
  refpoint?: number[];
  bb?: Record<string, number[]>;
  [key: string]: unknown;
}

class PropertiesPanel extends Panel {
  constructor(display: DisplayLike) {
    super(display);
  }

  protected getHtmlElement(): HTMLElement {
    return this.display.measurementPanels.propertiesPanel;
  }

  private setSubHeader(text: string): void {
    this.html.getElementsByClassName("tcv_measure_subheader")[0].textContent =
      text;
  }

  createTable(properties: PropertiesResponseData): void {
    if (this.finished) return;

    this.resetTable();

    this.setSubHeader(
      `${properties["shape_type"]} / ${properties["geom_type"]}`,
    );
    const table = document.createElement("table");
    table.classList.add("tcv_properties_table");
    const tbody = document.createElement("tbody");
    for (const key in properties) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
      if (
        [
          "shape_type",
          "geom_type",
          "type",
          "tool_type",
          "subtype",
          "refpoint",
        ].includes(key.toLowerCase())
      )
        continue;

      const value = properties[key];

      let tr: HTMLTableRowElement;
      if (key.toLowerCase() === "bb") {
        const bbValue = value as Record<string, number[]>;
        for (const bbKey in bbValue) {
          const tr = createVectorRow(`BB ${bbKey}`, bbValue[bbKey]);
          if (bbKey === "min") {
            tr.classList.add("tcv_measure_cell_top_border");
          }
          tbody.appendChild(tr);
        }
      } else if (Array.isArray(value) && value.length === 3) {
        tr = createVectorRow(key, value as number[]);
        tbody.appendChild(tr);
      } else {
        tr = createValueRow(key, value as number);
        tbody.appendChild(tr);
      }
      if (["length", "area", "volume", "start"].includes(key.toLowerCase())) {
        tr!.classList.add("tcv_measure_cell_top_border");
      }
    }
    table.appendChild(tbody);
    this.html.append(table);
    this.finished = true;
  }
}

class FilterByDropDownMenu {
  private display: DisplayLike;
  private elements: DisplayLike["filterDropdown"];
  private raycaster: Raycaster | null;

  /**
   * Initialize a new filter drop down menu, it needs the raycast to update interactively the filter mode
   */
  constructor(display: DisplayLike) {
    this.display = display;
    this.elements = display.filterDropdown;
    this.elements.container.style.display = "none";
    this.raycaster = null;
  }

  /**
   * Set the raycaster to update the filter mode
   */
  setRaycaster(raycaster: Raycaster): void {
    this.raycaster = raycaster;
  }

  private setValue = (topoType: string): void => {
    if (this.raycaster != null) {
      this.elements.value.innerText = topoType;
      if (topoType == "none") {
        this.raycaster.filters.topoFilter = [TopoFilter.none];
      } else {
        this.raycaster.filters.topoFilter = [
          TopoFilter[topoType.toLowerCase() as keyof typeof TopoFilter],
        ];
      }
    }
  };

  private toggleDropdown = (ev: Event | null): void => {
    if (ev != null) {
      ev.stopPropagation();
    }
    if (this.elements.dropdown.classList.contains("tcv_filter_dropdown_active")) {
      this.elements.dropdown.classList.remove("tcv_filter_dropdown_active");
      this.elements.icon.innerText = "⏶";
    } else {
      this.elements.dropdown.classList.add("tcv_filter_dropdown_active");
      this.elements.icon.innerText = "⏷";
    }
  };

  private closeDropdown = (ev: Event): void => {
    if (this.elements.dropdown.classList.contains("tcv_filter_dropdown_active")) {
      this.toggleDropdown(ev);
    }
  };

  private handleSelection = (ev: Event): void => {
    const topoType = (ev.target as HTMLElement).innerText;
    this.setValue(topoType);
    this.toggleDropdown(ev);
  };

  reset = (): void => {
    this.setValue("None");
  };

  private keybindSelect = (e: KeyboardEvent): void => {
    const validKeys = ["n", "v", "e", "f", "s", "Escape"];
    if (validKeys.indexOf(e.key) === -1) return;
    if (e.key == "n") this.setValue("None");
    else if (e.key == "v") this.setValue("Vertex");
    else if (e.key == "e") this.setValue("Edge");
    else if (e.key == "f") this.setValue("Face");
    else if (e.key == "s") this.setValue("Solid");
    else if (e.key == "Escape") this.closeDropdown(e);
  };

  private getOptionElements(): HTMLElement[] {
    const opts = this.elements.options;
    return [opts.none, opts.vertex, opts.edge, opts.face, opts.solid];
  }

  /**
   * Show or hide the drop down menu
   */
  show(flag: boolean): void {
    if (flag) {
      this.display.container.addEventListener("keydown", this.keybindSelect as EventListener);
      this.display.container.addEventListener("click", this.closeDropdown);

      this.elements.content.addEventListener("click", this.toggleDropdown as EventListener);

      for (const el of this.getOptionElements()) {
        el.addEventListener("click", this.handleSelection);
      }
    } else {
      this.display.container.removeEventListener(
        "keydown",
        this.keybindSelect as EventListener,
      );
      this.display.container.removeEventListener("click", this.closeDropdown);

      this.elements.content.removeEventListener("click", this.toggleDropdown as EventListener);

      for (const el of this.getOptionElements()) {
        el.removeEventListener("click", this.handleSelection);
      }
    }

    this.elements.container.style.display = flag ? "block" : "none";
  }
}

export { FilterByDropDownMenu, DistancePanel, PropertiesPanel };
export type { DistanceResponseData, PropertiesResponseData };
