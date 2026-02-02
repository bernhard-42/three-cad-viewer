# A threejs based CAD viewer

A CAD viewer component based on three.js. The CAD viewer can visualize low level `threejs` objects (tessellated objects)

![three-js-cad-viewer](overview.png)

⇒ [Live Examples](https://bernhard-42.github.io/three-cad-viewer/example.html)

## Getting started

1. [Install yarn](https://classic.yarnpkg.com/en/docs/install) on your system (ie. `npm i -g yarn`) if not already done;
2. Clone the repository: `git clone https://github.com/bernhard-42/three-cad-viewer.git && cd three-cad-viewer`;
3. Run `yarn install` to install dependencies
4. Start web server: `yarn run start` and go to the page displayed in the logs (ie. `127.0.0.1:8080`)
5. Build project: `yarn run clean; yarn run build; yarn run docs`;

## Overview

### Shape and Shapes

A Shape contains the attributes

- `vertices` (the `BufferGeometry` attribute `position`)
- `triangles` (the triangle index of the `BufferGeometry`)
- `normals` (the `BufferGeometry` attribute `normal`)

as described e.g. in [BufferGeometry](https://threejs.org/docs/#api/en/core/BufferGeometry) or [Three.js Custom BufferGeometry](https://threejsfundamentals.org/threejs/lessons/threejs-custom-buffergeometry.html)

plus additionally the attribute

- `edges`

to define which edges of the mesh should be shown.

The 4 attributes (`vertices`, `triangles`, `normals`, `edges`) define an object called `Shape`, see [Class Shape](https://bernhard-42.github.io/three-cad-viewer/global.html#Shape)

Multiple `Shape`s can be arranged as an hierarchical tree. This tree is modelled as `Shapes` object, see [Class Shapes](https://bernhard-42.github.io/three-cad-viewer/global.html#Shapes)

The `id`s on each level define a path to each node and leaf of tree, e.g. `/level1/level2_obj1/level3_object7` and so on.

### States

For each leaf of the tree a 2 dim tuple needs to be provided to define whether shape and edges should be shown

- 0 = shape/edges hidden
- 1 = shape/edges shown
- 3 = shape/edges does not exist

The value 2 is reserved for nodes and shows a mixed state, i.d. some of the children are show, some not.

For the `States` object, see [Class States](https://bernhard-42.github.io/three-cad-viewer/global.html#States)

## Skeleton:

```html
<html>
  <head>
    <link rel="stylesheet" href="./dist/three-cad-viewer.css" />
    <script type="module">
      import { Viewer, Display, Timer } from "./dist/three-cad-viewer.esm.js";

      function nc(change) {
        console.log("NOTIFY:", JSON.stringify(change, null, 2));
      }

      const displayOptions = {
        cadWidth: 850,
        height: 525,
        treeWidth: 240,
        theme: "browser",
        pinning: true,
        keymap: {
          shift: "shiftKey",
          ctrl: "ctrlKey",
          meta: "metaKey",
        },
      };

      const renderOptions = {
        ambientIntensity: 1.0,
        directIntensity: 1.1,
        metalness: 0.3,
        roughness: 0.65,
        edgeColor: 0x707070,
        defaultOpacity: 0.5,
        normalLen: 0,
      };
      const viewerOptions = {
        target: [0, 0, 0],
        up: "Z",
      };

      const shapes = {
        version: 3,
        parts: [
          {
            id: "/Group/Workplane(Solid)",
            type: "shapes",
            subtype: "solid",
            name: "Workplane(Solid)",
            shape: {
              vertices: [
                -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
                0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
                0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5,
                -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5,
                0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
                0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5,
                0.5, 0.5, 0.5,
              ],
              triangles: [
                1, 2, 0, 1, 3, 2, 5, 4, 6, 5, 6, 7, 11, 8, 9, 11, 10, 8, 15, 13,
                12, 15, 12, 14, 19, 16, 17, 19, 18, 16, 23, 21, 20, 23, 20, 22,
              ],
              normals: [
                -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0,
                0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0,
                -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, 0.0,
                -1.0, -0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0,
                -0.0, 1.0, 0.0, -0.0, -0.0, -1.0, -0.0, -0.0, -1.0, -0.0, -0.0,
                -1.0, -0.0, -0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,
                1.0, 0.0, 0.0, 1.0,
              ],
              edges: [
                -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5,
                0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5,
                0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
                0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5,
                0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5,
                0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
                0.5, 0.5, 0.5,
              ],
              obj_vertices: [
                -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
                -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
                -0.5,
              ],
              face_types: [0, 0, 0, 0, 0, 0],
              edge_types: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              triangles_per_face: [2, 2, 2, 2, 2, 2],
              segments_per_edge: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            },
            state: [1, 1],
            color: "#e8b024",
            alpha: 1.0,
            texture: null,
            loc: [
              [-0.0, -0.0, 0.0],
              [0.0, 0.0, 0.0, 1.0],
            ],
            renderback: false,
            accuracy: null,
            bb: null,
          },
        ],
        loc: [
          [0.0, 0.0, 0.0],
          [0.0, 0.0, 0.0, 1.0],
        ],
        name: "Group",
        id: "/Group",
        normal_len: 0,
        bb: {
          xmin: -0.5,
          xmax: 0.5,
          ymin: -0.5,
          ymax: 0.5,
          zmin: -0.5,
          zmax: 0.5,
        },
      };

      // 1) get the container
      const container = document.getElementById("cad_view");

      // 2) Create the CAD display in this container
      const display = new Display(container, displayOptions);

      // 3) Create the CAD viewer
      const viewer = new Viewer(display, viewerOptions, nc);
      // or viewer.clear() if the viewer exists

      // 4) Render the shapes and provide states for the navigation tree in this viewer
      viewer.render(shapes, renderOptions, viewerOptions);

      // 5) Dynamically add a second box offset by 2 units along X.
      //    addPart(parentPath, partData) builds the absolute path from the
      //    parent and the part's name: "/Group" + "/" + "Box2" = "/Group/Box2"
      const newPart = {
        version: 3,
        name: "Box2",
        type: "shapes",
        subtype: "solid",
        shape: {
          vertices: [
            1.5, -0.5, -0.5, 1.5, -0.5, 0.5, 1.5, 0.5, -0.5, 1.5, 0.5, 0.5, 2.5,
            -0.5, -0.5, 2.5, -0.5, 0.5, 2.5, 0.5, -0.5, 2.5, 0.5, 0.5, 1.5,
            -0.5, -0.5, 2.5, -0.5, -0.5, 1.5, -0.5, 0.5, 2.5, -0.5, 0.5, 1.5,
            0.5, -0.5, 2.5, 0.5, -0.5, 1.5, 0.5, 0.5, 2.5, 0.5, 0.5, 1.5, -0.5,
            -0.5, 2.5, -0.5, -0.5, 1.5, 0.5, -0.5, 2.5, 0.5, -0.5, 1.5, -0.5,
            0.5, 2.5, -0.5, 0.5, 1.5, 0.5, 0.5, 2.5, 0.5, 0.5,
          ],
          triangles: [
            1, 2, 0, 1, 3, 2, 5, 4, 6, 5, 6, 7, 11, 8, 9, 11, 10, 8, 15, 13, 12,
            15, 12, 14, 19, 16, 17, 19, 18, 16, 23, 21, 20, 23, 20, 22,
          ],
          normals: [
            -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
            1, 0, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0,
            0, 1, 0, 0, 1, 0, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1,
            0, 0, 1, 0, 0, 1, 0, 0, 1,
          ],
          edges: [
            1.5, -0.5, -0.5, 1.5, -0.5, 0.5, 1.5, -0.5, 0.5, 1.5, 0.5, 0.5, 1.5,
            0.5, -0.5, 1.5, 0.5, 0.5, 1.5, -0.5, -0.5, 1.5, 0.5, -0.5, 2.5,
            -0.5, -0.5, 2.5, -0.5, 0.5, 2.5, -0.5, 0.5, 2.5, 0.5, 0.5, 2.5, 0.5,
            -0.5, 2.5, 0.5, 0.5, 2.5, -0.5, -0.5, 2.5, 0.5, -0.5, 1.5, -0.5,
            -0.5, 2.5, -0.5, -0.5, 1.5, 0.5, -0.5, 2.5, 0.5, -0.5, 1.5, -0.5,
            0.5, 2.5, -0.5, 0.5, 1.5, 0.5, 0.5, 2.5, 0.5, 0.5,
          ],
          obj_vertices: [
            1.5, -0.5, 0.5, 1.5, -0.5, -0.5, 1.5, 0.5, 0.5, 1.5, 0.5, -0.5, 2.5,
            -0.5, 0.5, 2.5, -0.5, -0.5, 2.5, 0.5, 0.5, 2.5, 0.5, -0.5,
          ],
          face_types: [0, 0, 0, 0, 0, 0],
          edge_types: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          triangles_per_face: [2, 2, 2, 2, 2, 2],
          segments_per_edge: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
        state: [1, 1],
        color: "#5b9bd5",
        alpha: 1.0,
        renderback: false,
      };
      viewer.addPart("/Group", newPart); // creates "/Group/Box2"

      // 6) Remove the part again by absolute path
      viewer.removePart("/Group/Box2");
    </script>
  </head>

  <body>
    <div id="cad_view"></div>
  </body>
</html>
```

## Examples

To understand the data format, a look at the simple 1 unit sized box might be helpful:

- [1 unit sized box source code](https://github.com/bernhard-42/three-cad-viewer/blob/master/examples/box1.js)
- [addPart / removePart demo](https://github.com/bernhard-42/three-cad-viewer/blob/master/example-add-remove-part.html) — dynamically adding and removing shapes and subtrees after render

## APIs of Viewer, Display, Camera and Controls

- [API docs](https://bernhard-42.github.io/three-cad-viewer/Viewer.html)

Back to [Github repo](https://github.com/bernhard-42/three-cad-viewer)

## Utilities

### Logger

Control log verbosity with the built-in logger:

```javascript
import { logger } from "three-cad-viewer";

// Default level is "warn" (only warnings and errors shown)
logger.setLevel("debug"); // Enable all logging
logger.setLevel("info"); // Info, warnings, and errors
logger.setLevel("warn"); // Warnings and errors (default)
logger.setLevel("error"); // Only errors
logger.setLevel("silent"); // Disable all logging
```

### GPU Resource Tracker

Track GPU resource allocation to inspect current state or detect memory leaks:

```javascript
import { gpuTracker } from "three-cad-viewer";

// Check resource counts at any time
console.log(gpuTracker.summary);
// { geometry: 5, material: 10, texture: 1, total: 16 }

// Log details of allocated resources
gpuTracker.details();
```

For detailed allocation info with stack traces:

```javascript
// Enable debug mode BEFORE creating the viewer
gpuTracker.enableDebug();

const display = new Display(container, displayOptions);
const viewer = new Viewer(display, viewerOptions, nc);
viewer.render(shapes, renderOptions, viewerOptions);

// Inspect current allocations
gpuTracker.details();
// [1] geometry: BufferGeometry (shape) for /Assembly/Part1
//     Created at: 1234.56ms
//     Stack:
//       at NestedGroup.renderShape (nestedgroup.ts:425)
//       ...

// After disposal, any remaining resources are potential leaks
viewer.dispose();
gpuTracker.details();
```

The tracker is also available globally in the browser console as `window.tcv_gpu`.

## Development

Run a web server in watch and debug mode

```bash
yarn run debug
```

For the deployment, see [Release.md](./Release.md)

# Changes

see [Changes.md](./Changes.md)
