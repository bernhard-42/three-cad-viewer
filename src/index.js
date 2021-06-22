import { example } from './example.js';
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
const ortho = true;
const blackEdges = false;
const edgeColor = blackEdges ? 0x000000 : 0x707070;
const ambientIntensity = 0.5;
const directIntensity = 0.3;
const transparent = false;
const transparent_opyacity = 0.5;
const normalLen = 0;
const shapes = example.shapes;
const mapping = example.mapping;
const tree = example.tree;
// const bb = example.bb;
// console.log(bb)

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
    transparent_opyacity,
    normalLen
)

var states = {}
var paths = {}
for (var key in mapping) {
    states[key] = mapping[key]["state"]
    paths[key] = mapping[key]["path"]
}

// function clone(obj) {
//     return JSON.parse(JSON.stringify(obj));
// };

// const tree2 = clone(tree);
// const states2 = clone(states);
// const paths2 = clone(paths);


// for (var key in states) {
//     if (key < 201) {
//         states[key][0] = 0;
//     }
//     if ((key > 201) & (key < 208)) {
//         states[key][1] = 0;
//     }
//     if ((key > 208) & (key < 212)) {
//         states[key][0] = 0;
//         states[key][1] = 0;
//     }
// }
viewer.render(shapes, tree, states, paths);


// const container2 = document.getElementById("cad_view_002")

// const display2 = new Display(container2);

// const viewer2 = new Viewer(
//     display2,
//     dark,
//     bbFactor,
//     position,
//     zoom,
//     grid,
//     axes,
//     axes0,
//     ortho,
//     blackEdges,
//     edgeColor,
//     ambientIntensity,
//     directIntensity,
//     transparent,
//     transparent_opyacity,
//     normalLen
// )

// viewer2.render(shapes, tree2, states2, paths2);

// DEBUG stuff
global.viewer = viewer
global.TreeView = TreeView
global.tree = tree
global.states = states
global.paths = paths