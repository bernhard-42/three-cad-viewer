import * as THREE from "three";
import type { Vector3Tuple } from "three";
import type { MessageId, Translate } from "./i18n.js";

/**
 * Escape text for use inside HTML. Paths and names come from the model data and
 * may contain markup characters, which must be shown literally, never parsed.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The mouse control settings shown under "Control": `holroyd` (trackball only),
 * `cursorPivot` and `zoomToCursor`.
 */
interface ControlSettings {
  holroyd: boolean;
  cursorPivot: boolean;
  zoomToCursor: boolean;
}

/**
 * One of the {@link ControlSettings}: holroyd `mode`, which decides whether the
 * control is a trackball or a tumbler, cursor pivot `rotate`, and `zoom`.
 */
type ControlSetting = "mode" | "rotate" | "zoom";

/**
 * Name of the control as shown: the trackball without holroyd turns by the mouse
 * movement, which is a tumbler (it is path dependent, so the model tumbles),
 * while "trackball" means the path-independent holroyd trackball.
 */
function controlName(control: string, holroyd: boolean): string {
  return control === "trackball" && !holroyd ? "tumbler" : control;
}

/** Label and the values for on and off of the settings listed under "Control". */
const CONTROL_SETTING_TEXTS: Record<
  "rotate" | "zoom",
  { label: MessageId; changed: MessageId; on: MessageId; off: MessageId }
> = {
  rotate: {
    label: "info.rotate",
    changed: "info.rotateChanged",
    on: "info.aroundPivot",
    off: "info.aroundTarget",
  },
  zoom: {
    label: "info.zoom",
    changed: "info.zoomChanged",
    on: "info.toCursor",
    off: "info.toCenter",
  },
};

/**
 * Manages information display panel for the CAD viewer.
 * Shows bounding box info, version info, and other contextual information.
 */
class Info {
  html: HTMLElement;
  number: number;
  chunks: [number, string][];
  private t: Translate;

  /**
   * Create an Info panel instance.
   * @param html - The HTML container element for info display.
   * @param t - Translates UI messages.
   */
  constructor(html: HTMLElement, t: Translate) {
    this.html = html;
    this.t = t;
    this.number = 0;
    this.chunks = [];
    this.clear();
  }

  /**
   * Clear all displayed information.
   */
  clear(): void {
    this.html.innerHTML = "";
    this.number = 0;
    this.chunks = [];
  }

  /**
   * Dispose of resources and clear the container.
   */
  dispose(): void {
    this.clear();
    this.html.innerHTML = "";
  }

  /**
   * Add plain text as a preformatted block.
   * @param msg - The text message to display.
   */
  addText(msg: string): void {
    this.addHtml(`<pre style="white-space: nowrap;">${msg}</pre>`);
  }

  /**
   * Add HTML content to the info panel.
   * New content appears at the top of the list.
   * @param html - The HTML string to add.
   */
  addHtml(html: string): void {
    this.chunks.unshift([this.number, html]);
    this.number += 1;
    this.render();
  }

  /**
   * Render all chunks to the container as a table.
   */
  private render(): void {
    let html = "<table class='tcv_info_table'>";

    for (const chunk of this.chunks) {
      html += "<tr class='tcv_info_row'>";
      html += `<td><pre class="tcv_info_num">[${chunk[0]}]</pre></td>`;
      html += `<td>${chunk[1]}</td>`;
      html += "</tr>";
    }
    html += "</table>";

    this.html.innerHTML = html;
  }

  /**
   * Display version information for CadQuery and Jupyter CadQuery.
   * @param cqVersion - CadQuery version string.
   * @param jcqVersion - Jupyter CadQuery version string.
   */
  versionMsg(cqVersion: string, jcqVersion: string): void {
    this.addHtml(
      `<b>${this.text("info.versions")}</b>
          <table>
            <tr class="tcv_small_table"><td>${this.text("info.cadquery")}</td>        <td>${cqVersion}</td> </tr>
            <tr class="tcv_small_table"><td>${this.text("info.jupyterCadquery")}</td><td>${jcqVersion}</td> </tr>
          </table>`,
    );
  }

  /**
   * Display the ready message with viewer version and control mode.
   * @param version - Viewer version string.
   * @param control - Control mode name (e.g., "orbit", "trackball").
   * @param settings - The control settings: holroyd names the trackball (tumbler
   *   without it), cursor pivot and zoom are listed under the control; without
   *   them only the control is shown.
   */
  readyMsg(
    version: string,
    control: string,
    settings: ControlSettings | null = null,
  ): void {
    this.clear();
    let settingRows = "";
    let shownControl = control;
    if (settings !== null) {
      shownControl = controlName(control, settings.holroyd);
      const shown: ["rotate" | "zoom", boolean][] = [
        ["rotate", settings.cursorPivot],
        ["zoom", settings.zoomToCursor],
      ];
      for (const [setting, flag] of shown) {
        const texts = CONTROL_SETTING_TEXTS[setting];
        // "- rotate": an attribute of the control above
        settingRows += `<tr class="tcv_small_table_row" ><td>- ${this.text(texts.label)}</td><td>${this.text(flag ? texts.on : texts.off)}</td></tr>`;
      }
    }
    const html = `<div class="tcv_info_header">${this.text("info.ready")}</div>
            <table class="small_table">
              <tr class="tcv_small_table_row" ><td>${this.text("info.version")}</td><td>${version}</td> </tr>
              <tr class="tcv_small_table_row" ><td>${this.text("info.control")}</td><td>${escapeHtml(shownControl)}</td></tr>
              ${settingRows}
              <tr class="tcv_small_table_row" ><td>${this.text("info.axes")}</td>
                <td>
                  <span class="tcv_info_red"><b>X</b></span>,
                  <span class="tcv_info_green"><b>Y</b></span>,
                  <span class="tcv_info_blue"><b>Z</b></span>
                </td>
              </tr>
            </table>`;
    this.addHtml(html);
  }

  /**
   * Display bounding box information for a selected object.
   * @param path - The object's path in the tree.
   * @param name - The object's name.
   * @param bb - The bounding box to display.
   * @param component - The picked face or edge inside the object (e.g.
   *   "faces/faces_3") when the box is the component's, else null.
   */
  bbInfo(
    path: string,
    name: string,
    bb: THREE.Box3,
    component: string | null = null,
  ): void {
    let html = this.pickTable(path, name, component);
    html += `
            <div class="tcv_info_header">${this.text("info.boundingBox")}</div>
            <table class="tcv_small_table">
                <tr class="tcv_small_table_row">
                    <th></th>
                    <th>${this.text("info.min")}</th>
                    <th>${this.text("info.max")}</th>
                    <th>${this.text("info.center")}</th>
                </tr>
            `;

    const center = new THREE.Vector3();
    bb.getCenter(center);

    (["x", "y", "z"] as const).forEach((a) => {
      html += `
                <tr class="tcv_small_table_row">
                    <th>${a}</th>
                    <td align='right'>${bb.min[a].toFixed(3)}</td>
                    <td align='right'>${bb.max[a].toFixed(3)}</td>
                    <td align='right'>${center[a].toFixed(3)}</td>
                </tr>
            `;
    });
    html += "</table>";
    this.addHtml(html);
  }

  /**
   * Display the position of a picked vertex.
   * @param path - The object's path in the tree.
   * @param name - The object's name.
   * @param component - The vertex inside the object, e.g. "vertices/vertices_2".
   * @param point - The vertex's world position.
   */
  pointInfo(
    path: string,
    name: string,
    component: string | null,
    point: Vector3Tuple,
  ): void {
    let html = this.pickTable(path, name, component);
    html += `
            <div class="tcv_info_header">${this.text("info.vertex")}</div>
            <table class="tcv_small_table">
                <tr class="tcv_small_table_row">
                    <th>x</th><th>y</th><th>z</th>
                </tr>
                <tr class="tcv_small_table_row">
                    ${point.map((v) => `<td align='right'>${v.toFixed(3)}</td>`).join("")}
                </tr>
            </table>`;
    this.addHtml(html);
  }

  /** Path, name and (when given) component of a pick as an HTML table. */
  private pickTable(
    path: string,
    name: string,
    component: string | null,
  ): string {
    const row = (label: MessageId, value: string): string => `
                <tr class="tcv_small_table_row">
                    <td><b>${this.text(label)}</b></td>
                    <td>${escapeHtml(value)}</td>
                </tr>`;
    return `
            <table class="tcv_small_table">${row("info.path", path)}${row("info.name", name)}${
              component === null ? "" : row("info.component", component)
            }
            </table>
            `;
  }

  /**
   * A translated message, escaped for use inside HTML.
   */
  private text(id: MessageId): string {
    return escapeHtml(this.t(id));
  }

  /**
   * Display that a control setting changed: "control: tumbler" for holroyd,
   * else e.g. "rotation control: around target".
   * @param setting - Which setting: holroyd `mode`, cursor pivot `rotate`, `zoom`.
   * @param flag - Its new value.
   */
  controlChangeInfo(setting: ControlSetting, flag: boolean): void {
    let message: string;
    if (setting === "mode") {
      message = this.t("info.controlChanged", {
        value: controlName("trackball", flag),
      });
    } else {
      const texts = CONTROL_SETTING_TEXTS[setting];
      const value = this.t(flag ? texts.on : texts.off);
      message = this.t(texts.changed, { value });
    }
    this.addHtml(`<div>${escapeHtml(message)}</div>`);
  }

  /**
   * Display camera target center information.
   * @param center - The center coordinates [x, y, z].
   */
  centerInfo(center: Vector3Tuple): void {
    this.targetInfo("info.cameraTarget", center);
  }

  /**
   * Display that the camera target was set to a clicked point.
   * @param point - The point's coordinates [x, y, z].
   */
  targetPointInfo(point: Vector3Tuple): void {
    this.targetInfo("info.cameraTargetPoint", point);
  }

  /** A message about the camera target and its coordinates. */
  private targetInfo(message: MessageId, target: Vector3Tuple): void {
    const html =
      `<div>${this.text(message)}</div>` +
      "<div class='tcv_info_line'>{ " +
      `x: ${target[0].toFixed(2)}, ` +
      `y: ${target[1].toFixed(2)}, ` +
      `z: ${target[2].toFixed(2)}` +
      " }</div>";
    this.addHtml(html);
  }
}

export { Info, escapeHtml };
export type { ControlSettings, ControlSetting };
