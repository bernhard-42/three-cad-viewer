import { Display } from './display.js';
import { Viewer } from './viewer.js';
import { Timer } from './timer.js';

// BEGIN loading and temp conversion

import { example as box } from './examples/box.js';
import { example as box1 } from './examples/box1.js';
import { example as boxE } from './examples/boxes.js';
import { example as hexapod } from './examples/hexapod.js';
import { example as faces } from './examples/faces.js';
import { example as edges } from './examples/edges.js';
import { example as vertices } from './examples/vertices.js';

function load(assembly) {

    function convertAssembly(assembly) {
        const delim = "/";
        var states = {};

        function _convertAssembly(subAssembly, path) {
            const newPath = `${path}${delim}${subAssembly.name}`;
            var result = {
                name: subAssembly.name,
                id: newPath
            };
            if (subAssembly.parts) {
                result.parts = [];
                result.loc = subAssembly.loc;
                for (var part of subAssembly.parts) {
                    result.parts.push(_convertAssembly(part, newPath));
                }
            } else {
                result.type = subAssembly.type;
                result.shape = subAssembly.shape;
                result.color = subAssembly.color;
                if (subAssembly.type == "edges") {
                    result.width = 3;
                    states[newPath] = [3, 1];
                } else if (subAssembly.type == "vertices") {
                    result.size = 6;
                    states[newPath] = [3, 1];
                } else {
                    states[newPath] = [1, 1];
                }
            }
            return result;
        }
        return [_convertAssembly(assembly, ""), states];
    }
    return convertAssembly(assembly.shapes)
}
//END loading and temp conversion

const measure = false;
const timer = new Timer("index", measure);

const [shapes, states] = load(hexapod);
timer.split("loaded");

const options = {
    ortho: true,
    normalLen: 0,
    cadWidth: 640,
    height: 480,
    treeWidth: 250,
    // normalLen: 5,
};

const container = document.getElementById("cad_view_001")
const display = new Display(container);
timer.split("display");

const viewer = new Viewer(display, options);
viewer._measure = measure;

timer.split("viewer");

viewer.render(shapes, states);
timer.split("renderer");
timer.stop()

// DEBUG stuff
global.viewer = viewer
global.states = states
