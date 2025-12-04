import * as THREE from "three";

/**
 * Manages information display panel for the CAD viewer.
 * Shows bounding box info, version info, and other contextual information.
 */
class Info {
  /**
   * Create an Info panel instance.
   * @param {HTMLElement} html - The HTML container element for info display.
   */
  constructor(html) {
    this.html = html;
    this.clear();
  }

  /**
   * Clear all displayed information.
   */
  clear() {
    this.html.value = "";
    this.number = 0;
    this.chunks = [];
  }

  /**
   * Dispose of resources and clear the container.
   */
  dispose() {
    this.clear();
    this.html.innerHTML = "";
  }

  /**
   * Add plain text as a preformatted block.
   * @param {string} msg - The text message to display.
   */
  addText(msg) {
    this.addHtml(`<pre style="white-space: nowrap;">${msg}</pre>`);
  }

  /**
   * Add HTML content to the info panel.
   * New content appears at the top of the list.
   * @param {string} html - The HTML string to add.
   */
  addHtml(html) {
    this.chunks.unshift([this.number, html]);
    this.number += 1;
    this.render();
  }

  /**
   * Render all chunks to the container as a table.
   * @private
   */
  render() {
    var html = "<table class='tcv_info_table'>";

    for (var chunk of this.chunks) {
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
   * @param {string} cqVersion - CadQuery version string.
   * @param {string} jcqVersion - Jupyter CadQuery version string.
   */
  versionMsg(cqVersion, jcqVersion) {
    this.addHtml(
      `<b>Versions</b>
          <table>
            <tr class="tcv_small_table"><td>CadQuery:</td>        <td>${cqVersion}</td> </tr>
            <tr class="tcv_small_table"><td>Jupyter CadQuery:</td><td>${jcqVersion}</td> </tr>
          </table>`,
    );
  }

  /**
   * Display the ready message with viewer version and control mode.
   * @param {string} version - Viewer version string.
   * @param {string} control - Control mode name (e.g., "orbit", "trackball").
   */
  readyMsg(version, control) {
    var html = `<div class="tcv_info_header">Ready</div>
            <table class="small_table">
              <tr class="tcv_small_table_row" ><td>Version</td><td>${version}</td> </tr>
              <tr class="tcv_small_table_row" ><td>Control</td><td>${control}</td></tr>
              <tr class="tcv_small_table_row" ><td>Axes</td>
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
   * @param {string} path - The object's path in the tree.
   * @param {string} name - The object's name.
   * @param {THREE.Box3} bb - The bounding box to display.
   */
  bbInfo(path, name, bb) {
    var html = `
            <table class="tcv_small_table">
                <tr class="tcv_small_table_row">
                    <td><b>Path:</b></td>
                    <td>${path}</td>
                </tr>
                <tr class="tcv_small_table_row">
                    <td><b>Name:</b></td>
                    <td>${name}</td>
                </tr>
            </table>
            `;
    html += `
            <div class="tcv_info_header">Bounding box:</div>
            <table class="tcv_small_table">
                <tr class="tcv_small_table_row">
                    <th></th>
                    <th>min</th>
                    <th>max</th>
                    <th>center</th>
                </tr>
            `;

    var center = new THREE.Vector3();
    bb.getCenter(center);

    ["x", "y", "z"].forEach((a) => {
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
   * Display camera target center information.
   * @param {number[]} center - The center coordinates [x, y, z].
   */
  centerInfo(center) {
    var html =
      "<div>Camera target set to AABB center:</div>" +
      "<div class='tcv_info_line'>{ " +
      `x: ${center[0].toFixed(2)}, ` +
      `y: ${center[1].toFixed(2)}, ` +
      `z: ${center[2].toFixed(2)}` +
      " }</div>";
    this.addHtml(html);
  }
}

export { Info };
