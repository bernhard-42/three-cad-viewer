import * as THREE from "three";

class Info {
  constructor(html) {
    this.html = html;
    this.clear();
  }

  clear() {
    this.html.value = "";
    this.number = 0;
    this.chunks = [];
  }

  addText(msg) {
    this.addHtml(`<pre style="white-space: nowrap;">${msg}</pre>`);
  }

  addHtml(html) {
    this.chunks.unshift([this.number, html]);
    this.number += 1;
    this.render();
  }

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

  versionMsg(cqVersion, jcqVersion) {
    this.addHtml(
      `<b>Versions</b>
          <table>
            <tr class="tcv_small_table"><td>CadQuery:</td>        <td>${cqVersion}</td> </tr>
            <tr class="tcv_small_table"><td>Jupyter CadQuery:</td><td>${jcqVersion}</td> </tr>
          </table>`
    );
  }

  readyMsg(gridSize, control) {
    var html = `<div class="tcv_info_header">Ready</div>
            <table class="small_table">
              <tr class="tcv_small_table_row" ><td>Tick size</td>  <td>${gridSize} mm</td> </tr>
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
}

export { Info };
