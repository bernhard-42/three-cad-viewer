import { example } from './example.js'
import { Viewer } from './viewer.js'
import { TreeView } from './treeview.js'

// input parameters
const dark = false;
const bbFactor = 1.0;
const position = [1, 1, 1];
const zoom = 2.0;
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

const viewer = new Viewer(
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
for (var key in states) {
    if (key < 201) {
        states[key][0] = 0;
    }
    if ((key > 201) & (key < 208)) {
        states[key][1] = 0;
    }
    if ((key > 208) & (key < 212)) {
        states[key][0] = 0;
        states[key][1] = 0;
    }
}
viewer.render(shapes, tree, states, paths);

// DEBUG stuff
global.viewer = viewer
global.TreeView = TreeView
global.tree = tree
global.states = states
global.paths = paths