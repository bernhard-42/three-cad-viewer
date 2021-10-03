# A threejs based CAD viewer

## Overview

The CAD viewer can visualize low level `threejs` objects (tessellated objects)

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
    <link rel="stylesheet" href="./dist/three-cad-viewer.esm.css" />
    <script type="module">
      import { Viewer, Display, Timer } from "./dist/three-cad-viewer.esm.js";

      function nc(change) {
        console.log("NOTIFY:", JSON.stringify(change, null, 2));
      }

      const options = {
        theme: "light",
        ortho: true,
        control: "trackball", // "orbit",
        normalLen: 0,
        cadWidth: 800,
        height: 600,
        treeWidth: 240,
        ticks: 10,
        normalLen: 0,
        ambientIntensity: 0.9,
        directIntensity: 0.12,
        transparent: false,
        blackEdges: false,
        axes: true,
        grid: [false, false, false],
        timeit: false,
        rotateSpeed: 1
      };

      const shapes = {}; // a Shapes object, see example or API docs
      const states = {}; // a States object, see example or API docs

      // 1) get the container
      const container = document.getElementById("cad_view");

      // 2) Create the CAD display in this container
      const display = new Display(container, options);

      // 3) Create the CAD viewer
      const viewer = new Viewer(display, true, options, nc);

      // 4) Render the shapes and provide states for the navigation tree in this viewer
      viewer.render(shapes, states);
    </script>
  </head>

  <body>
    <div id="cad_view"></div>
  </body>
</html>
```

## Examples

Several examples can be seen in action in the CAD Viewer:

- [Live Examples](https://bernhard-42.github.io/three-cad-viewer/example.html)

To understand the data format, a look at the simple 1 unit sized box might be helpful:

- [1 unit sized box source code](https://github.com/bernhard-42/three-cad-viewer/blob/master/examples/box1.js)

## APIs of Viewer, Display, Camera and Controls

[API docs](https://bernhard-42.github.io/three-cad-viewer/Viewer.html) [Github
repo](https://github.com/bernhard-42/three-cad-viewer)
