import { Display } from './display.js';
import { Viewer } from './viewer.js';
import { Timer } from './timer.js';

// BEGIN loading and temp conversion

import { example as box } from '../examples/box.js';
import { example as box1 } from '../examples/box1.js';
import { example as boxE } from '../examples/boxes.js';
import { example as hexapod } from '../examples/hexapod.js';
import { example as mhexapod } from '../examples/hexapod-mates.js';
import { example as faces } from '../examples/faces.js';
import { example as edges } from '../examples/edges.js';
import { example as vertices } from '../examples/vertices.js';

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
                if (subAssembly.shape.edges) {
                    subAssembly.shape.edges = subAssembly.shape.edges[0];
                }
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
const needsAnimationLoop = (shapes.name == "bottom");

timer.split("loaded");

const theme = "light";
const options = {
    theme: theme,
    ortho: true,
    normalLen: 0,
    cadWidth: 800,
    height: 600,
    treeWidth: 240,
    normalLen: 0,
    ambientIntensity: 0.9,
    directIntensity: 0.12,
}

const container = document.getElementById("cad_view_001")
const display = new Display(container, theme);
timer.split("display");

const viewer = new Viewer(display, needsAnimationLoop, options);
viewer._measure = measure;

timer.split("viewer");

viewer.render(shapes, states);
timer.split("renderer");
timer.stop()

// hexapod animation tracks

if (needsAnimationLoop) {
    const horizontal_angle = 25

    function isin(el, container) {
        return container.indexOf(el) >= 0;
    }

    function intervals(count) {
        var range = [...Array(count).keys()]
        return range.map((i) => Math.min(180, (90 + i * Math.floor(360 / count)) % 360));
    }

    function times(end, count) {
        var range = [...Array(count + 1).keys()]
        return range.map((i) => i / count * end)
    }

    function vertical(count, end, offset) {
        const ints = intervals(count)
        var heights = ints.map((x) => Math.round(350 * Math.sin(x / 180 * Math.PI) - 150) / 10)
        heights.push(heights[0])
        return [times(end, count), [...heights.slice(offset), ...heights.slice(1, offset + 1)]]
    }

    function horizontal(end, reverse) {
        const factor = reverse ? 1 : -1
        return [times(end, 4), [0, factor * horizontal_angle, 0, -factor * horizontal_angle, 0]]
    }

    const legNames = ["right_back", "right_middle", "right_front", "left_back", "left_middle", "left_front"];
    const legGroup = ["left_front", "right_middle", "left_back"];

    for (var name of legNames) {
        // move upper leg
        viewer.addAnimationTrack(
            `/bottom/${name}`, "rz", ...horizontal(4, isin("middle", name))
        );
        // move lower leg
        viewer.addAnimationTrack(
            `/bottom/${name}/lower`, "rz", ...vertical(8, 4, isin(name, legGroup) ? 0 : 4, isin("left", name))
        );
    }
    viewer.initAnimation(4, 2);
}
// Enable debugging in browser console
global.viewer = viewer