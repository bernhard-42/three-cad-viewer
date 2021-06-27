// import { example } from './examples/box.js';
// import { example } from './examples/box1.js';
// import { example } from './examples/boxes.js';
import { example } from './examples/hexapod.js';
import { Display } from './display.js';
import { Viewer } from './viewer.js';
import { TreeView } from './treeview.js';

// input parameters
const dark = false;
const bbFactor = 1.0;
const position = [1, 1, 1];
const zoom = 1.0;
const grid = false;
const axes = false;
const axes0 = false;
const ortho = false;
const blackEdges = false;
const edgeColor = blackEdges ? 0x000000 : 0x707070;
const ambientIntensity = 0.5;
const directIntensity = 0.3;
const transparent = false;
const defaultOpacity = 0.4;
const normalLen = 0;
const assembly = example.shapes;

const container = document.getElementById("cad_view_001")

const display = new Display(container);

const viewer = new Viewer(
    display,
    dark,
    bbFactor,
    position,
    zoom,
    grid,
    axes,
    axes0,
    ortho,
    blackEdges,
    edgeColor,
    ambientIntensity,
    directIntensity,
    transparent,
    defaultOpacity,
    normalLen
)

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
            states[newPath] = [1, 1];
        }
        return result;
    }
    return [_convertAssembly(assembly, ""), states];
}

const [shapes, states] = convertAssembly(assembly)

viewer.render(shapes, states);

// DEBUG stuff
global.viewer = viewer
global.TreeView = TreeView
global.states = states
