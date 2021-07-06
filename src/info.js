import * as THREE from 'three';

class Info {
    constructor(html) {
        this.html = html;
        this.clear();
    }

    clear() {
        this.html.value = ""
        this.number = 0
        this.chunks = []
    }

    addText(msg) {
        this.addHtml(`<pre style="white-space: nowrap;">${msg}</pre>`)
    }

    addHtml(html) {
        this.chunks.unshift([this.number, html])
        this.number += 1
        this.render()
    }

    render() {
        var html = '<table class="info_table">'

        for (var chunk of this.chunks) {
            html += '<tr class="info_row">'
            html += `<td><pre class="info_num">[${chunk[0]}]</pre></td>`
            html += `<td>${chunk[1]}</td>`
            html += "</tr>"
        }
        html += "</table>"

        this.html.innerHTML = html
    }

    versionMsg(cqVersion, jcqVersion) {
        this.addHtml(
            `<b>Versions</b>
            <table>
                <tr class="small_table"><td>CadQuery:</td>        <td>${cqVersion}</td> </tr>
                <tr class="small_table"><td>Jupyter CadQuery:</td><td>${jcqVersion}</td> </tr>
            </table>`
        )
    }

    readyMsg(gridSize) {
        var html = (
            `<div class="info_header">Ready</div>
            <table class="small_table">
                <tr class="small_table_row" >           <td>Tick size</td>  <td>${gridSize} mm</td> </tr>
                <tr class="small_table_row info_red">   <td>X-Axis</td>     <td>Red</td>    </tr>
                <tr class="small_table_row info_green"> <td>Y-Axis</td>     <td>Green</td>  </tr>
                <tr class="small_table_row info_blue">  <td>Z-Axis</td>     <td>Blue</td>   </tr>
            </table>`
        )
        this.addHtml(html)
    }

    bbInfo(path, name, bb) {
        var html = (`
            <table class="small_table">
                <tr class="small_table_row">
                    <td><b>Path:</b></td>
                    <td>${path}</td>
                </tr>
                <tr class="small_table_row">
                    <td><b>Name:</b></td>
                    <td>${name}</td>
                </tr>
            </table>
            `
        )
        html += `
            <div class="info_header">Bounding box:</div>
            <table class="small_table">
                <tr class="small_table_row">
                    <th></th>
                    <th>min</th>
                    <th>max</th>
                    <th>center</th>
                </tr>
            `

        var center = new THREE.Vector3()
        bb.getCenter(center);

        ["x", "y", "z"].forEach((a) => {
            html += `
                <tr class="small_table_row">
                    <th>${a}</th>
                    <td align='right'>${bb.min[a].toFixed(3)}</td>
                    <td align='right'>${bb.max[a].toFixed(3)}</td>
                    <td align='right'>${center[a].toFixed(3)}</td>
                </tr>
            `
        })
        html += "</table>"
        console.log(html)
        this.addHtml(html)
    }
}

export { Info }