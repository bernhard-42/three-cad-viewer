import {
  TopoFilter,
  type TopoFilterType,
} from "../../rendering/id-picking.js";
import type { DisplayLike } from "./tools.js";
import type { MessageId, Translate } from "../../ui/i18n.js";
import { geomTypeLabel } from "./mesh-measure.js";

/**
 * Type guard to check if a value is a number array of specific length.
 */
function isNumberArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((v) => typeof v === "number")
  );
}

/**
 * Type guard to check if a value is a Record<string, number[]> (bounding box data).
 */
function isBoundingBoxData(value: unknown): value is Record<string, number[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => isNumberArray(v, 3));
}

interface CallbackEntry {
  callback: EventListener;
  type: string;
}

/**
 * Normalize a backend key: lowercase and exactly one space before trailing
 * digits, e.g. "normal1" → "normal 1", "Point 1" → "point 1",
 * "Distance" → "distance". Idempotent, so already spaced keys stay as they are.
 */
function formatKey(key: string): string {
  return key.toLowerCase().replace(/(\D)\s*(\d+)$/, "$1 $2");
}

/** Message id of each row name the measurement backends send (normalized). */
const ROW_IDS: Record<string, MessageId> = {
  distance: "measure.row.distance",
  "point 1": "measure.row.point1",
  "point 2": "measure.row.point2",
  angle: "measure.row.angle",
  "angle to xy": "measure.row.angleToXy",
  "reference 1": "measure.row.reference1",
  "reference 2": "measure.row.reference2",
  "direction 1": "measure.row.direction1",
  "direction 2": "measure.row.direction2",
  "tangent at p 1": "measure.row.tangentAtP1",
  "tangent at p 2": "measure.row.tangentAtP2",
  "⇒ x | y | z": "measure.row.delta",
  xyz: "measure.row.xyz",
  area: "measure.row.area",
  length: "measure.row.length",
  volume: "measure.row.volume",
  radius: "measure.row.radius",
  diameter: "measure.row.diameter",
  center: "measure.row.center",
  "face normal": "measure.row.faceNormal",
  "bb min": "measure.row.bbMin",
  "bb max": "measure.row.bbMax",
  "bb center": "measure.row.bbCenter",
  "bb size": "measure.row.bbSize",
};

/** Message id of each string value the measurement backends send. */
const VALUE_IDS: Record<string, MessageId> = {
  line: "measure.value.line",
  "face normal": "measure.value.faceNormal",
  min: "measure.qualifier.min",
  center: "measure.qualifier.center",
};

/** Message id of each shape_type name. */
const SHAPE_IDS: Record<string, MessageId> = {
  Vertex: "shape.vertex",
  Edge: "shape.edge",
  Face: "shape.face",
  Solid: "shape.solid",
};

/** Translate `name` via `ids`; names without a message are shown as they are. */
function translated(
  ids: Record<string, MessageId>,
  name: string,
  t: Translate,
): string {
  return Object.prototype.hasOwnProperty.call(ids, name) ? t(ids[name]) : name;
}

/** Row label for a backend key. */
function rowLabel(key: string, t: Translate): string {
  return translated(ROW_IDS, formatKey(key), t);
}

function createVectorRow(
  key: string,
  value: number[],
  t: Translate,
): HTMLTableRowElement {
  const xyzColors = [
    "tcv_x_measure_val",
    "tcv_y_measure_val",
    "tcv_z_measure_val",
  ];
  const tr = document.createElement("tr");
  const th = document.createElement("th");

  th.textContent = rowLabel(key, t);
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

function createStringRow(
  key: string,
  value: string,
  t: Translate,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");
  th.textContent = rowLabel(key, t);
  th.classList.add("tcv_measure_key");
  th.classList.add("tcv_measure_cell");
  tr.appendChild(th);

  td.textContent = translated(VALUE_IDS, value, t);
  td.classList.add("tcv_measure_val_center");
  td.classList.add("tcv_measure_cell");
  td.colSpan = 5;
  tr.appendChild(td);

  return tr;
}

function createValueRow(
  key: string,
  value: number,
  qualifier: string | null,
  t: Translate,
): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");

  th.textContent = rowLabel(key, t);
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
    qualText.textContent = `(${translated(VALUE_IDS, qualifier, t)})`;
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

  /** Set the panel title (e.g. "Distance" or "Distance (mesh based)"). */
  protected setHeader(text: string): void {
    const el = this.html.getElementsByClassName("tcv_measure_header")[0];
    if (el) el.textContent = text;
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

/**
 * Skip list for technical fields that should not be rendered in panels.
 */
const SKIP_KEYS = [
  "type",
  "tool_type",
  "subtype",
  "info",
  "refpoint",
  "refpoint1",
  "refpoint2",
  "shape_type",
  "geom_type",
  "groups",
  "result",
];

/**
 * Render entries from a group object into a tbody.
 * If addSeparator is true, the first rendered row gets a top border.
 */
function renderGroup(
  group: Record<string, unknown>,
  tbody: HTMLTableSectionElement,
  addSeparator: boolean,
  t: Translate,
): void {
  let firstRow = true;
  for (const key in group) {
    if (!Object.prototype.hasOwnProperty.call(group, key)) continue;
    if (SKIP_KEYS.includes(key.toLowerCase())) continue;

    const value = group[key];

    let tr: HTMLTableRowElement | undefined;
    if (key.toLowerCase() === "bb" && isBoundingBoxData(value)) {
      for (const bbKey in value) {
        const bbTr = createVectorRow(`bb ${bbKey}`, value[bbKey], t);
        if (addSeparator && firstRow) {
          bbTr.classList.add("tcv_measure_cell_top_border");
          firstRow = false;
        }
        tbody.appendChild(bbTr);
      }
    } else if (isNumberArray(value, 3)) {
      tr = createVectorRow(key, value, t);
    } else if (typeof value === "number") {
      if (key.toLowerCase() === "distance") {
        const info =
          typeof group["info"] === "string" ? group["info"] : undefined;
        tr = createValueRow(key, value, info ?? null, t);
      } else {
        tr = createValueRow(key, value, null, t);
      }
    } else if (typeof value === "string") {
      tr = createStringRow(key, value, t);
    }
    if (tr) {
      if (addSeparator && firstRow) {
        tr.classList.add("tcv_measure_cell_top_border");
      }
      tbody.appendChild(tr);
      firstRow = false;
    }
  }
}

/**
 * Render groups into a tbody, or fall back to treating properties as a single group.
 */
function renderGroups(
  properties: Record<string, unknown>,
  tbody: HTMLTableSectionElement,
  t: Translate,
): void {
  const groups = properties.result ?? properties.groups;
  if (Array.isArray(groups)) {
    for (let i = 0; i < groups.length; i++) {
      renderGroup(groups[i] as Record<string, unknown>, tbody, i > 0, t);
    }
  } else {
    renderGroup(properties, tbody, false, t);
  }
}

interface DistanceResponseData {
  result?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
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
    const t = this.display.t;
    this.setHeader(
      t(
        properties.meshBased === true
          ? "measure.distance.headerMesh"
          : "measure.distance.header",
      ),
    );

    const table = document.createElement("table");
    table.classList.add("tcv_properties_table");
    const tbody = document.createElement("tbody");
    renderGroups(properties as Record<string, unknown>, tbody, t);
    table.appendChild(tbody);
    this.html.append(table);
    this.finished = true;
  }
}

interface PropertiesResponseData {
  result?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
  shape_type?: string;
  geom_type?: string;
  refpoint?: number[];
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
    const t = this.display.t;
    this.setHeader(
      t(
        properties.meshBased === true
          ? "measure.properties.headerMesh"
          : "measure.properties.header",
      ),
    );

    const shapeType = translated(SHAPE_IDS, properties["shape_type"] ?? "", t);
    const geomType = geomTypeLabel(properties["geom_type"] ?? "", t);
    this.setSubHeader(`${shapeType} / ${geomType}`);
    const table = document.createElement("table");
    table.classList.add("tcv_properties_table");
    const tbody = document.createElement("tbody");
    renderGroups(properties as Record<string, unknown>, tbody, t);
    table.appendChild(tbody);
    this.html.append(table);
    this.finished = true;
  }
}

/** The filter options, named like their `TopoFilter` (none = all topos). */
const FILTER_OPTIONS = ["none", "vertex", "edge", "face", "solid"] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

/** Message id of each filter option's label. */
const FILTER_LABEL_IDS: Record<FilterOption, MessageId> = {
  none: "filter.all",
  vertex: "filter.vertex",
  edge: "filter.edge",
  face: "filter.face",
  solid: "filter.solid",
};

class FilterByDropDownMenu {
  private display: DisplayLike;
  private elements: DisplayLike["filterDropdown"];
  /**
   * The current topo filter the GPU id picker reads. `[TopoFilter.none]` means
   * "no filter" (all topos eligible).
   */
  currentFilter: TopoFilterType[];

  /**
   * Initialize a new filter drop down menu.
   */
  constructor(display: DisplayLike) {
    this.display = display;
    this.elements = display.filterDropdown;
    this.elements.container.style.display = "none";
    this.currentFilter = [TopoFilter.none];
  }

  /**
   * Select a filter option by its canonical name. The state never comes from
   * the rendered label, which is translated.
   */
  private setValue = (option: FilterOption): void => {
    this.elements.value.innerText = this.display.t(FILTER_LABEL_IDS[option]);
    // "none" (label "All") = no filter → every topo eligible (vertex>edge>face priority).
    // The picker-readable filter source.
    this.currentFilter = [TopoFilter[option]];
  };

  private toggleDropdown = (ev: Event | null): void => {
    if (ev != null) {
      ev.stopPropagation();
    }
    if (
      this.elements.dropdown.classList.contains("tcv_filter_dropdown_active")
    ) {
      this.elements.dropdown.classList.remove("tcv_filter_dropdown_active");
      this.elements.icon.innerText = "▾"; // ▾ closed (down-caret = expand)
    } else {
      this.elements.dropdown.classList.add("tcv_filter_dropdown_active");
      this.elements.icon.innerText = "▴"; // ▴ open
    }
  };

  private closeDropdown = (ev: Event): void => {
    if (
      this.elements.dropdown.classList.contains("tcv_filter_dropdown_active")
    ) {
      this.toggleDropdown(ev);
    }
  };

  private handleSelection = (ev: Event): void => {
    const target = ev.target;
    const options = this.elements.options;
    const option = FILTER_OPTIONS.find((name) => options[name] === target);
    if (option !== undefined) {
      this.setValue(option);
      this.toggleDropdown(ev);
    }
  };

  reset = (): void => {
    this.setValue("none");
  };

  private keybindSelect = (e: KeyboardEvent): void => {
    const validKeys = ["a", "v", "e", "f", "s", "Escape"];
    if (validKeys.indexOf(e.key) === -1) return;
    if (e.key == "a") this.setValue("none");
    else if (e.key == "v") this.setValue("vertex");
    else if (e.key == "e") this.setValue("edge");
    else if (e.key == "f") this.setValue("face");
    else if (e.key == "s") this.setValue("solid");
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
      // Use document-level listener for keyboard shortcuts (container div can't receive focus)
      document.addEventListener("keydown", this.keybindSelect as EventListener);
      this.display.container.addEventListener("click", this.closeDropdown);

      this.elements.content.addEventListener(
        "click",
        this.toggleDropdown as EventListener,
      );

      for (const el of this.getOptionElements()) {
        el.addEventListener("click", this.handleSelection);
      }
    } else {
      document.removeEventListener(
        "keydown",
        this.keybindSelect as EventListener,
      );
      this.display.container.removeEventListener("click", this.closeDropdown);

      this.elements.content.removeEventListener(
        "click",
        this.toggleDropdown as EventListener,
      );

      for (const el of this.getOptionElements()) {
        el.removeEventListener("click", this.handleSelection);
      }
    }

    this.elements.container.style.display = flag ? "block" : "none";
  }
}

export { FilterByDropDownMenu, DistancePanel, PropertiesPanel };
export type { DistanceResponseData, PropertiesResponseData };
