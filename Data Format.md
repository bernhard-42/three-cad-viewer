# three-cad-viewer Data Format

This document describes the input data format accepted by `three-cad-viewer`. The viewer
expects a single hierarchical `Shapes` object that represents a CAD model as a tree of
groups and parts, each carrying tessellated geometry, appearance, and transformation data.

## Overview

The data is a recursive tree. Every node is a `Shapes` object. Each node is either a
**group** (has `parts`) or a **leaf** (has `shape`), never both. A group's `parts` array
freely mixes leaves and nested groups at the same level:

```
hexapod (group)
 +-- parts[]
      +-- bottom (leaf -- has shape)
      +-- top (leaf -- has shape)
      +-- front_stand (leaf -- has shape)
      +-- left_front_leg (group -- has parts)
      |    +-- parts[]
      |         +-- upper_leg (leaf -- has shape)
      |         +-- lower_leg (group -- has parts)
      |              +-- parts[]
      |                   +-- lower_leg (leaf -- has shape)
      +-- right_front_leg (group -- has parts)
      |    +-- parts[]
      |         +-- ...
      ...
```

## Shapes Object

The top-level object and every node in the tree share the same `Shapes` interface.

### Required Fields

| Field     | Type     | Description                                       |
|-----------|----------|---------------------------------------------------|
| `version` | `number` | Protocol version. Must be `2` or `3`.             |
| `name`    | `string` | Display name shown in the navigation tree.        |
| `id`      | `string` | Unique slash-separated path, e.g. `"/Group/Part"`. |

### Tree Structure Fields

| Field   | Type       | Description                                                    |
|---------|------------|----------------------------------------------------------------|
| `parts` | `Shapes[]` | Child nodes (mix of leaves and groups). Present on group nodes. |
| `shape` | `Shape`    | Tessellated geometry. Present on leaf nodes. |

A node has either `parts` (group) or `shape` (leaf), never both.

### Transformation

| Field | Type                                    | Description                   |
|-------|-----------------------------------------|-------------------------------|
| `loc` | `[[x, y, z], [qx, qy, qz, qw]]` | Position as a 3D vector and orientation as a quaternion. Applied hierarchically from root to leaf. Set to `null` or omit for identity. |

Example:
```json
"loc": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0]]
```

### Bounding Box

| Field | Type | Description |
|-------|------|-------------|
| `bb`  | `BoundingBoxFlat \| null` | Axis-aligned bounding box of the entire model. Typically set on the root node only. |

```json
"bb": {"xmin": -0.5, "xmax": 0.5, "ymin": -0.5, "ymax": 0.5, "zmin": -0.5, "zmax": 0.5}
```

### Appearance (Leaf Nodes)

| Field        | Type                 | Default | Description                          |
|--------------|----------------------|---------|--------------------------------------|
| `color`      | `string \| string[]` | -       | CSS hex color (`"#e8b024"`) or array of hex colors for multi-colored edges. |
| `alpha`      | `number`             | `1.0`   | Opacity, `0` (transparent) to `1` (opaque). |
| `renderback` | `boolean`            | `false` | Whether to render the back face of triangles. |
| `texture`    | `Texture \| null`    | `null`  | Optional encoded texture (see [Texture](#texture)). |
| `material`   | `string`             | -       | Optional tag for Studio mode material lookup. References a key in the root-level `materials` table or a builtin preset name (e.g. `"stainless-steel"`). Ignored in CAD mode. |

### Visibility State (Leaf Nodes)

| Field   | Type                     | Description                            |
|---------|--------------------------|----------------------------------------|
| `state` | `[VisibilityValue, VisibilityValue]` | Initial visibility as `[faces, edges]`. |

`VisibilityValue` is one of:

| Value | Meaning  |
|-------|----------|
| `0`   | Hidden   |
| `1`   | Shown    |
| `2`   | Mixed (some children shown, some hidden) |
| `3`   | Not applicable (e.g. edges on a vertex-only object) |

Common combinations:

- `[1, 1]` -- faces and edges both visible (typical for solids)
- `[3, 1]` -- no faces, edges visible (edge-only or vertex-only objects)
- `[1, 3]` -- faces visible, no edges (face-only objects)

### Type Classification (Leaf Nodes)

| Field     | Type                                   | Description                  |
|-----------|----------------------------------------|------------------------------|
| `type`    | `"shapes"` \| `"edges"` \| `"vertices"` \| `"polygon"` | Kind of geometry this leaf carries. |
| `subtype` | `"solid"` \| `"faces"` \| `"face"`    | Distinguishes closed solids from open faces. Only meaningful when `type` is `"shapes"`. |

### Additional Leaf Fields

| Field        | Type             | Description                                    |
|--------------|------------------|------------------------------------------------|
| `accuracy`   | `number \| null` | Tessellation accuracy of the CAD kernel.       |
| `normal_len` | `number`         | Length of normal helper vectors. `0` to hide.  |
| `width`      | `number`         | Edge line width in pixels (for `"edges"` type). |
| `size`       | `number`         | Vertex point size in pixels (for `"vertices"` type). |

---

## Shape Object (Tessellated Geometry)

The `shape` field on a leaf node contains the actual tessellated mesh. There are three
geometry variants depending on the `type` of the leaf node.

### Solid / Face Geometry (`type: "shapes"`)

Contains triangulated surface mesh plus edges and vertices:

| Field               | Type                                     | Description                          |
|---------------------|------------------------------------------|--------------------------------------|
| `vertices`          | `number[]` \| `Float32Array`             | Flat array of 3D vertex positions: `[x0, y0, z0, x1, y1, z1, ...]`. |
| `normals`           | `number[]` \| `number[][]` \| `Float32Array` | Per-vertex normals, same length as `vertices`. Can be flat or nested per-face. |
| `triangles`         | `number[]` \| `number[][]` \| `Uint32Array`  | Triangle indices into `vertices`. See [Serialization Formats](#serialization-formats). |
| `edges`             | `number[]` \| `number[][]` \| `Float32Array` | Edge line segments as coordinate pairs. See [Serialization Formats](#serialization-formats). |
| `obj_vertices`      | `number[]` \| `Float32Array`             | Original CAD topology vertices: `[x0, y0, z0, ...]`. Used for vertex display. |
| `face_types`        | `number[]` \| `Uint32Array`              | One integer per face classifying the OCP face type. |
| `edge_types`        | `number[]` \| `Uint8Array` \| `Uint32Array` | One integer per edge classifying the OCP edge type. |
| `triangles_per_face`| `number[]` \| `Uint32Array`              | **Required when `triangles` is flat.** Number of triangles belonging to each face. Not needed when `triangles` is nested (`number[][]`). |
| `segments_per_edge` | `number[]` \| `Uint32Array`              | **Required when `edges` is flat.** Number of line segments belonging to each edge. Not needed when `edges` is nested (`number[][]`). |
| `uvs`               | `number[]` \| `Float32Array`             | Optional per-vertex UV coordinates: `[u0, v0, u1, v1, ...]`. Same vertex count as `vertices`. Used for texture mapping in Studio mode. When absent, the viewer uses triplanar or box projection as fallback. |

### Edge-only Geometry (`type: "edges"`)

Only the `edges` (and optionally `obj_vertices`) fields are populated. All other arrays
are empty.

### Vertex-only Geometry (`type: "vertices"`)

Only the `obj_vertices` field is populated. All other arrays are empty.

---

## Array Formats

All array fields accept plain `number[]` or TypedArrays (`Float32Array`, `Uint32Array`,
`Uint8Array`). The viewer converts plain arrays to TypedArrays internally for GPU
rendering.

The `triangles`, `normals`, and `edges` fields additionally accept **nested arrays**
(`number[][]`), where each inner array corresponds to one topological face or edge.
The viewer flattens these automatically.

### Flat Format

All data is in flat arrays. The **`triangles_per_face`** and **`segments_per_edge`**
count arrays are **required** so the viewer knows which triangles belong to which face
and which segments belong to which edge.

```js
shape: {
  vertices:           [x0,y0,z0, x1,y1,z1, ...],
  normals:            [nx0,ny0,nz0, nx1,ny1,nz1, ...],
  triangles:          [0, 1, 2, 2, 3, 0, 4, 5, 6, ...],
  triangles_per_face: [2, 1, ...],   // face 0 has 2 triangles, face 1 has 1, ...
  edges:              [x0,y0,z0, x1,y1,z1, ...],
  segments_per_edge:  [1, 3, ...],   // edge 0 has 1 segment, edge 1 has 3, ...
  obj_vertices:       [x0, y0, z0, ...],
  face_types:         [0, 0, ...],
  edge_types:         [0, 0, ...],
}
```

### Nested Format

`triangles`, `normals`, and `edges` can alternatively be provided as **arrays of
arrays**, one inner array per topological face or edge. In this case
`triangles_per_face` and `segments_per_edge` are not needed because the grouping is
implicit in the nesting.

```js
shape: {
  vertices: [x0, y0, z0, x1, y1, z1, ...],           // always flat
  normals:  [[nx, ny, nz, ...], [...]],                // nested per face
  triangles: [[0, 1, 2, 2, 3, 0], [4, 5, 6, ...]],   // nested per face
  edges: [[x0,y0,z0, x1,y1,z1], [...]],               // nested per edge
  obj_vertices: [x0, y0, z0, ...],                     // always flat
  face_types: [0, 0, ...],
  edge_types: [0, 0, ...],
}
```

### How the Counts Work

Given `triangles_per_face = [2, 3]`:
- Face 0 owns the first `2 * 3 = 6` indices in `triangles` (2 triangles, 3 indices each).
- Face 1 owns the next `3 * 3 = 9` indices (3 triangles).

Given `segments_per_edge = [1, 4]`:
- Edge 0 owns the first `1 * 6 = 6` floats in `edges` (1 segment = 2 endpoints * 3 coords).
- Edge 1 owns the next `4 * 6 = 24` floats (4 segments).

---

## Texture

An optional encoded image that is mapped onto a face.

```json
{
  "height": 256,
  "width": 256,
  "image": {
    "data": "<base64-encoded image data>",
    "format": "png"
  }
}
```

---

## GDS/Polygon Format

For GDSII semiconductor layouts, the viewer supports an alternative geometry
representation using extruded 2D polygons instead of tessellated meshes.

### Root-level GDS Fields

Set on the root `Shapes` node:

| Field       | Type                          | Description                          |
|-------------|-------------------------------|--------------------------------------|
| `format`    | `"GDS"`                       | Enables polygon rendering mode.      |
| `instances` | `Record<string, number[]>` \| `number[][]` | Shared polygon vertex data. Keys (or indices) are referenced by leaf nodes. Each value is a flat array of 2D coordinates: `[x0, y0, x1, y1, ...]`. |

### Polygon Leaf Nodes

Leaf nodes with `type: "polygon"` use a `PolygonShape` instead of a `Shape`:

| Field      | Type       | Description                                           |
|------------|------------|-------------------------------------------------------|
| `refs`     | `number[]` | Indices into the root-level `instances` table.        |
| `height`   | `number`   | Extrusion height for the 2D polygon.                  |
| `matrices` | `number[]` | Optional affine transformation matrices (6 values per matrix: `[a, b, c, d, tx, ty, ...]`). When empty, the identity transform is used. |

The polygon vertices from `instances[ref]` are transformed by the matrix, converted
to `THREE.Shape` objects, and extruded to `height` to produce 3D geometry.

---

## Complete Minimal Example

A unit cube centered at the origin:

```js
{
  version: 3,
  name: "Group",
  id: "/Group",
  loc: [[0, 0, 0], [0, 0, 0, 1]],
  normal_len: 0,
  bb: {xmin: -0.5, xmax: 0.5, ymin: -0.5, ymax: 0.5, zmin: -0.5, zmax: 0.5},
  parts: [
    {
      version: 3,
      id: "/Group/Box",
      name: "Box",
      type: "shapes",
      subtype: "solid",
      state: [1, 1],
      color: "#e8b024",
      alpha: 1.0,
      renderback: false,
      texture: null,
      accuracy: null,
      bb: null,
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      shape: {
        vertices: [
          // 24 vertices (4 per face, 6 faces) as flat [x, y, z, ...]:
          -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,-0.5, -0.5,0.5,0.5,
           0.5,-0.5,-0.5,  0.5,-0.5,0.5,  0.5,0.5,-0.5,  0.5,0.5,0.5,
          -0.5,-0.5,-0.5,  0.5,-0.5,-0.5, -0.5,-0.5,0.5,  0.5,-0.5,0.5,
          -0.5,0.5,-0.5,   0.5,0.5,-0.5,  -0.5,0.5,0.5,   0.5,0.5,0.5,
          -0.5,-0.5,-0.5,  0.5,-0.5,0.5,  -0.5,-0.5,0.5,   0.5,-0.5,-0.5,
          -0.5,0.5,-0.5,   0.5,0.5,0.5,   -0.5,0.5,0.5,    0.5,0.5,-0.5,
        ],
        normals: [
          -1,0,0, -1,0,0, -1,0,0, -1,0,0,
           1,0,0,  1,0,0,  1,0,0,  1,0,0,
           0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
           0,1,0,  0,1,0,  0,1,0,  0,1,0,
           0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
           0,0,1,  0,0,1,  0,0,1,  0,0,1,
        ],
        triangles: [
          1,2,0, 1,3,2,   // face 0: 2 triangles
          5,4,6, 5,6,7,   // face 1: 2 triangles
          11,8,9, 11,10,8, // face 2: 2 triangles
          15,13,12, 15,12,14, // face 3: 2 triangles
          19,16,17, 19,18,16, // face 4: 2 triangles
          23,21,20, 23,20,22, // face 5: 2 triangles
        ],
        triangles_per_face: [2, 2, 2, 2, 2, 2],
        edges: [
          -0.5,-0.5,-0.5, -0.5,-0.5,0.5,  // edge 0
          -0.5,-0.5,0.5,  -0.5,0.5,0.5,   // edge 1
          -0.5,0.5,-0.5,  -0.5,0.5,0.5,   // edge 2
          -0.5,-0.5,-0.5, -0.5,0.5,-0.5,  // edge 3
           0.5,-0.5,-0.5,  0.5,-0.5,0.5,  // edge 4
           0.5,-0.5,0.5,   0.5,0.5,0.5,   // edge 5
           0.5,0.5,-0.5,   0.5,0.5,0.5,   // edge 6
           0.5,-0.5,-0.5,  0.5,0.5,-0.5,  // edge 7
          -0.5,-0.5,-0.5,  0.5,-0.5,-0.5, // edge 8
          -0.5,-0.5,0.5,   0.5,-0.5,0.5,  // edge 9
          -0.5,0.5,-0.5,   0.5,0.5,-0.5,  // edge 10
          -0.5,0.5,0.5,    0.5,0.5,0.5,   // edge 11
        ],
        segments_per_edge: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        obj_vertices: [
          -0.5,-0.5,0.5,  -0.5,-0.5,-0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5,
           0.5,-0.5,0.5,   0.5,-0.5,-0.5,  0.5,0.5,0.5,  0.5,0.5,-0.5,
        ],
        face_types: [0, 0, 0, 0, 0, 0],
        edge_types: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
  ],
}
```

## Complete Minimal Example (Instanced Buffer Format)

The same unit cube, encoded in the instanced buffer format. The geometry is stored
once in `instances[0]` as base64-encoded buffers, and the leaf references it via
`{ ref: 0 }`:

```js
{
  instances: [
    {
      // Instance 0: unit cube geometry (same data as above, base64-encoded)
      vertices:          { shape: [24, 3], dtype: "float32",
        buffer: "AAAAvwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAvwAAAD8AAAC/AAAAvwAAAD8AAAA/AAAAPwAAAL8AAAC/AAAAPwAAAL8AAAA/AAAAPwAAAD8AAAC/AAAAPwAAAD8AAAA/AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAvwAAAD8AAAC/AAAAPwAAAD8AAAC/AAAAvwAAAD8AAAA/AAAAPwAAAD8AAAA/AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAA/AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAC/AAAAvwAAAD8AAAC/AAAAPwAAAD8AAAA/AAAAvwAAAD8AAAA/AAAAPwAAAD8AAAC/",
        codec: "b64" },
      normals:           { shape: [24, 3], dtype: "float32",
        buffer: "AACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAvwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgL8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIC/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/AAAAAAAAAAAAAIA/",
        codec: "b64" },
      triangles:         { shape: [12, 3], dtype: "uint32",
        buffer: "AQAAAAIAAAAAAAAAAQAAAAMAAAACAAAABQAAAAQAAAAGAAAABQAAAAYAAAAHAAAACwAAAAgAAAAJAAAACwAAAAoAAAAIAAAADwAAAA0AAAAMAAAADwAAAAwAAAAOAAAAEwAAABAAAAARAAAAEwAAABIAAAAQAAAAFwAAABUAAAAUAAAAFwAAABQAAAAWAAAA",
        codec: "b64" },
      edges:             { shape: [24, 3], dtype: "float32",
        buffer: "AAAAvwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAvwAAAL8AAAA/AAAAvwAAAD8AAAA/AAAAvwAAAD8AAAC/AAAAvwAAAD8AAAA/AAAAvwAAAL8AAAC/AAAAvwAAAD8AAAC/AAAAPwAAAL8AAAC/AAAAPwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAC/AAAAPwAAAD8AAAA/AAAAPwAAAL8AAAC/AAAAPwAAAD8AAAC/AAAAvwAAAL8AAAC/AAAAPwAAAL8AAAC/AAAAvwAAAL8AAAA/AAAAPwAAAL8AAAA/AAAAvwAAAD8AAAC/AAAAPwAAAD8AAAC/AAAAvwAAAD8AAAA/AAAAPwAAAD8AAAA/",
        codec: "b64" },
      obj_vertices:      { shape: [8, 3], dtype: "float32",
        buffer: "AAAAvwAAAL8AAAA/AAAAvwAAAL8AAAC/AAAAvwAAAD8AAAA/AAAAvwAAAD8AAAC/AAAAPwAAAL8AAAA/AAAAPwAAAL8AAAC/AAAAPwAAAD8AAAA/AAAAPwAAAD8AAAC/",
        codec: "b64" },
      face_types:        { shape: [6], dtype: "uint32",
        buffer: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        codec: "b64" },
      edge_types:        { shape: [12], dtype: "uint32",
        buffer: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        codec: "b64" },
      triangles_per_face:{ shape: [6], dtype: "uint32",
        buffer: "AgAAAAIAAAACAAAAAgAAAAIAAAACAAAA",
        codec: "b64" },
      segments_per_edge: { shape: [12], dtype: "uint32",
        buffer: "AQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAA",
        codec: "b64" },
    },
  ],
  shapes: {
    version: 3,
    name: "Group",
    id: "/Group",
    loc: [[0, 0, 0], [0, 0, 0, 1]],
    normal_len: 0,
    bb: {xmin: -0.5, xmax: 0.5, ymin: -0.5, ymax: 0.5, zmin: -0.5, zmax: 0.5},
    parts: [
      {
        version: 3,
        id: "/Group/Box",
        name: "Box",
        type: "shapes",
        subtype: "solid",
        state: [1, 1],
        color: "#e8b024",
        alpha: 1.0,
        renderback: false,
        texture: null,
        accuracy: null,
        bb: null,
        loc: [[0, 0, 0], [0, 0, 0, 1]],
        shape: { ref: 0 },   // references instances[0]
      },
    ],
  },
}
```

---

## Assembly Example

Multi-part models use nested `parts` arrays. Each group can carry its own `loc`
transform, which is applied on top of its parent's transform.

```js
{
  version: 3,
  name: "assembly",
  id: "/assembly",
  loc: [[0, 0, 0], [0, 0, 0, 1]],
  bb: {xmin: -10, xmax: 10, ymin: -10, ymax: 10, zmin: -10, zmax: 10},
  parts: [
    {
      // A leaf part
      version: 3,
      id: "/assembly/box",
      name: "box",
      type: "shapes",
      subtype: "solid",
      state: [1, 1],
      color: "#ff0000",
      alpha: 1.0,
      loc: [[3, 3, 3], [0, 0, 0, 1]],
      shape: { /* ... */ },
    },
    {
      // A nested sub-group
      version: 3,
      name: "sub-assembly",
      id: "/assembly/sub-assembly",
      loc: [[-3, 0, 0], [0, 0, 0, 1]],
      parts: [
        {
          version: 3,
          id: "/assembly/sub-assembly/cone",
          name: "cone",
          type: "shapes",
          subtype: "solid",
          state: [1, 1],
          color: "#00ff00",
          loc: [[0, 0, 0], [0, 0, 0, 1]],
          shape: { /* ... */ },
        },
      ],
    },
  ],
}
```

## Edge-only Example

Objects that consist only of edges (wireframes, curves):

```js
{
  version: 3,
  name: "Group",
  id: "/Group",
  loc: [[0, 0, 0], [0, 0, 0, 1]],
  bb: { /* ... */ },
  parts: [
    {
      id: "/Group/curves",
      name: "curves",
      type: "edges",
      state: [3, 1],
      color: "#ba55d3",
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      width: 3,
      shape: {
        edges: [
          // Each line segment is 6 floats: x0,y0,z0, x1,y1,z1
          -5,8,-13, -3,10,-15,
           5,8,13,   3,10,15,
        ],
        segments_per_edge: [1, 1],
        vertices: [],
        normals: [],
        triangles: [],
        obj_vertices: [-5,8,-13, -3,10,-15, 5,8,13, 3,10,15],
        edge_types: [0, 0],
        face_types: [],
      },
    },
  ],
}
```

## Vertex-only Example

Objects that consist only of points:

```js
{
  version: 3,
  name: "Group",
  id: "/Group",
  loc: [[0, 0, 0], [0, 0, 0, 1]],
  bb: { /* ... */ },
  parts: [
    {
      id: "/Group/points",
      name: "points",
      type: "vertices",
      state: [3, 1],
      color: "#ba55d3",
      loc: null,
      size: 6,
      shape: {
        obj_vertices: [
          -5, 8, 13,
          -5, 5,  7,
           5, 8,  4,
        ],
        vertices: [],
        normals: [],
        triangles: [],
        edges: [],
        edge_types: [],
        face_types: [],
      },
    },
  ],
}
```

## Encoded Buffer Format

As an alternative to plain arrays or TypedArrays, any geometry field in a `Shape`
object can be provided as a **base64-encoded buffer**. This is the format used by
`ocp-tessellate` for efficient binary transfer (e.g. over Jupyter comms).

An encoded buffer has this structure:

```js
{
  shape: [dim1, dim2, ...],   // array shape (informational, not used for decoding)
  dtype: "float32",           // "float32", "int32", or "uint32"
  buffer: "AAAA...",          // base64-encoded raw bytes (little-endian)
  codec: "b64"                // must be "b64"
}
```

Any field that normally accepts `number[]` or `Float32Array` can instead be an
`EncodedBuffer`. The viewer decodes them to TypedArrays before rendering.

Example -- an edge-only object with encoded buffers:

```js
{
  id: "/Group/wire",
  name: "wire",
  type: "edges",
  state: [3, 1],
  color: "#ff0000",
  shape: {
    edges:            { shape: [2, 6], dtype: "float32", buffer: "AAAA...", codec: "b64" },
    segments_per_edge:{ shape: [2],    dtype: "uint32",  buffer: "AQAA...", codec: "b64" },
    obj_vertices:     { shape: [6, 3], dtype: "float32", buffer: "AAAA...", codec: "b64" },
    vertices:         [],
    normals:          [],
    triangles:        [],
    edge_types:       { shape: [2],    dtype: "uint32",  buffer: "AAAA...", codec: "b64" },
    face_types:       [],
  },
}
```

Encoded buffers can be mixed freely with plain arrays in the same `Shape` --
only fields that have the `{ buffer, dtype, codec }` structure are decoded.

---

## Instanced Format

For models with repeated geometry (e.g. fasteners, connectors), the data can use
an **instanced format** that deduplicates shared shapes. Instead of embedding the
full `Shape` on every leaf, shared geometry is stored once in a top-level
`instances` array, and leaves reference it by index.

The instanced format wraps the standard `Shapes` tree:

```js
{
  instances: [
    // Instance 0: a complete Shape with all fields as encoded buffers
    {
      vertices:          { shape: [...], dtype: "float32", buffer: "...", codec: "b64" },
      triangles:         { shape: [...], dtype: "uint32",  buffer: "...", codec: "b64" },
      normals:           { shape: [...], dtype: "float32", buffer: "...", codec: "b64" },
      edges:             { shape: [...], dtype: "float32", buffer: "...", codec: "b64" },
      obj_vertices:      { shape: [...], dtype: "float32", buffer: "...", codec: "b64" },
      face_types:        { shape: [...], dtype: "uint32",  buffer: "...", codec: "b64" },
      edge_types:        { shape: [...], dtype: "uint32",  buffer: "...", codec: "b64" },
      triangles_per_face:{ shape: [...], dtype: "uint32",  buffer: "...", codec: "b64" },
      segments_per_edge: { shape: [...], dtype: "uint32",  buffer: "...", codec: "b64" },
      uvs:               { shape: [...], dtype: "float32", buffer: "...", codec: "b64" },  // optional
    },
    // Instance 1: ...
  ],
  shapes: {
    // Standard Shapes tree, but leaf nodes use { ref: N } instead of inline Shape
    version: 3,
    name: "Assembly",
    id: "/Assembly",
    bb: { /* ... */ },
    parts: [
      {
        id: "/Assembly/Bolt1",
        name: "Bolt1",
        type: "shapes",
        shape: { ref: 0 },        // references instances[0]
        color: "#aaaaaa",
        loc: [[10, 0, 0], [0, 0, 0, 1]],
        // ...
      },
      {
        id: "/Assembly/Bolt2",
        name: "Bolt2",
        type: "shapes",
        shape: { ref: 0 },        // same geometry, different position
        color: "#aaaaaa",
        loc: [[20, 0, 0], [0, 0, 0, 1]],
        // ...
      },
    ],
  }
}
```

The viewer detects the instanced format by the presence of both `instances` and
`shapes` keys. It decodes all instance buffers from base64 to TypedArrays, then
walks the tree replacing `{ ref: N }` with the decoded `Shape`. The result is a
standard `Shapes` tree identical to the non-instanced format.

Leaves that don't reference an instance (e.g. edge-only objects) can still embed
their geometry directly using encoded buffers -- the viewer decodes those inline.

---

## Configuration

The viewer accepts configuration at three levels:

1. **Display options** -- passed to `new Display(container, displayOptions)` for UI layout
2. **Render/Viewer options** -- passed to `viewer.render(shapes, renderOptions, viewerOptions)` for rendering and camera
3. **Data-level configuration** -- embedded in the `Shapes` object itself (materials, textures, studio settings)

This section documents all three levels.

### Display Options

Passed as the second argument to `new Display(container, options)`. Controls UI layout and
tool visibility.

| Field              | Type                             | Default   | Description                                    |
|--------------------|----------------------------------|-----------|------------------------------------------------|
| `cadWidth`         | `number`                         | `800`     | Width of CAD canvas in pixels.                 |
| `height`           | `number`                         | `600`     | Height of CAD canvas in pixels.                |
| `treeWidth`        | `number`                         | `260`     | Width of tree navigation panel in pixels.      |
| `treeHeight`       | `number`                         | `400`     | Height of tree navigation panel in pixels.     |
| `theme`            | `"light" \| "dark" \| "browser"` | `"light"` | UI theme. `"browser"` follows system setting.  |
| `pinning`          | `boolean`                        | `false`   | Enable pin-as-PNG button.                      |
| `glass`            | `boolean`                        | `false`   | Enable glass mode (compact overlay UI).        |
| `tools`            | `boolean`                        | `true`    | Show/hide all toolbar tools.                   |
| `keymap`           | `Keymap`                         | See below | Custom keyboard shortcuts.                     |
| `newTreeBehavior`  | `boolean`                        | `true`    | Use new tree navigation behavior.              |
| `measureTools`     | `boolean`                        | `true`    | Show measurement tools in toolbar.             |
| `selectTool`       | `boolean`                        | `true`    | Show select tool in toolbar.                   |
| `explodeTool`      | `boolean`                        | `true`    | Show explode/animation tool in toolbar.        |
| `zscaleTool`       | `boolean`                        | `false`   | Show z-scale tool in toolbar.                  |
| `zebraTool`        | `boolean`                        | `true`    | Show zebra tool in toolbar.                    |
| `studioTool`       | `boolean`                        | `true`    | Show Studio mode tool in toolbar.              |
| `measurementDebug` | `boolean`                        | `false`   | Log measurement debug info to console.         |
| `canvas`           | `HTMLCanvasElement`              | —         | External canvas for shared WebGL context.      |
| `gl`               | `WebGLRenderingContext`          | —         | External WebGL context (use with `canvas`).    |

### Render Options

Passed as the second argument to `viewer.render(shapes, renderOptions, viewerOptions)`.
Controls CAD mode material appearance and lighting.

| Field              | Type     | Default    | Description                                     |
|--------------------|----------|------------|-------------------------------------------------|
| `edgeColor`        | `number` | `0x707070` | Default edge color (hex).                       |
| `ambientIntensity` | `number` | `1.0`      | Ambient light intensity.                        |
| `directIntensity`  | `number` | `1.1`      | Directional light intensity.                    |
| `metalness`        | `number` | `0.3`      | Default metalness factor (0--1).                |
| `roughness`        | `number` | `0.65`     | Default roughness factor (0--1).                |
| `defaultOpacity`   | `number` | `0.5`      | Opacity level when transparency is enabled.     |
| `normalLen`        | `number` | `0`        | Length of normal display vectors. `0` to hide.  |

### Viewer Options

Passed as the third argument to `viewer.render(shapes, renderOptions, viewerOptions)`.
Controls camera, grid, clipping, and controls.

| Field              | Type                                 | Default                 | Description                                       |
|--------------------|--------------------------------------|-------------------------|---------------------------------------------------|
| `control`          | `"orbit" \| "trackball"`             | `"orbit"`               | Camera control type.                              |
| `axes`             | `boolean`                            | `false`                 | Show X/Y/Z axes.                                  |
| `axes0`            | `boolean`                            | `false`                 | Show axes at origin instead of object center.     |
| `grid`             | `[boolean, boolean, boolean]`        | `[false, false, false]` | Show grid planes [XY, XZ, YZ].                   |
| `ortho`            | `boolean`                            | `true`                  | Use orthographic camera (`false` = perspective).  |
| `transparent`      | `boolean`                            | `false`                 | Render object as transparent.                     |
| `blackEdges`       | `boolean`                            | `false`                 | Render edges in black.                            |
| `collapse`         | `number`                             | `0`                     | Tree collapse level (0=collapsed, 1=root, 2=all, -1=smart). |
| `clipIntersection` | `boolean`                            | `false`                 | Use intersection clipping mode.                   |
| `clipPlaneHelpers` | `boolean`                            | `false`                 | Show clipping plane helpers.                      |
| `clipObjectColors` | `boolean`                            | `false`                 | Use object colors for clipping caps.              |
| `clipNormal0`      | `[number, number, number]`           | `[-1, 0, 0]`           | Clipping plane 0 normal direction.                |
| `clipNormal1`      | `[number, number, number]`           | `[0, -1, 0]`           | Clipping plane 1 normal direction.                |
| `clipNormal2`      | `[number, number, number]`           | `[0, 0, -1]`           | Clipping plane 2 normal direction.                |
| `clipSlider0`      | `number`                             | `-1`                    | Clipping plane 0 slider position.                 |
| `clipSlider1`      | `number`                             | `-1`                    | Clipping plane 1 slider position.                 |
| `clipSlider2`      | `number`                             | `-1`                    | Clipping plane 2 slider position.                 |
| `holroyd`          | `boolean`                            | `true`                  | Holroyd non-tumbling rotation for trackball.      |
| `up`               | `"Z" \| "Y" \| "legacy"`            | `"Z"`                   | World up direction.                               |
| `ticks`            | `number`                             | `10`                    | Grid tick count hint.                             |
| `gridFontSize`     | `number`                             | `10`                    | Font size for grid labels.                        |
| `centerGrid`       | `boolean`                            | `false`                 | Center grid on object instead of origin.          |
| `position`         | `[number, number, number] \| null`   | `null`                  | Camera position.                                  |
| `quaternion`       | `[number, number, number, number] \| null` | `null`            | Camera rotation quaternion [x, y, z, w].          |
| `target`           | `[number, number, number] \| null`   | `null`                  | Camera look-at target.                            |
| `zoom`             | `number`                             | `1.0`                   | Camera zoom level.                                |
| `panSpeed`         | `number`                             | `1.0`                   | Pan speed multiplier.                             |
| `rotateSpeed`      | `number`                             | `1.0`                   | Rotation speed multiplier.                        |
| `zoomSpeed`        | `number`                             | `1.0`                   | Zoom speed multiplier.                            |
| `timeit`           | `boolean`                            | `false`                 | Log render timings to console.                    |
| `zebraCount`       | `number`                                   | `9`             | Number of zebra stripes.                          |
| `zebraOpacity`     | `number`                                   | `1.0`           | Zebra stripe opacity (0--1).                      |
| `zebraDirection`   | `number`                                   | `0`             | Stripe direction (0--360 degrees).                |
| `zebraColorScheme` | `"blackwhite" \| "colorful" \| "grayscale"` | `"blackwhite"` | Zebra color scheme.                               |
| `zebraMappingMode` | `"reflection" \| "normal"`                 | `"reflection"`  | Zebra mapping mode.                               |
| `studioEnvironment` | `string`                                  | `"studio"`      | Studio environment preset or custom HDR URL. See [Environment Presets](#environment-presets). |
| `studioEnvIntensity` | `number`                                 | `1.0`           | Studio environment map intensity (0--3).          |
| `studioBackground` | `StudioBackground`                          | `"environment"` | Studio background mode.                         |
| `studioToneMapping` | `"neutral" \| "ACES" \| "none"`            | `"neutral"`     | Studio tone mapping algorithm.                    |
| `studioExposure`   | `number`                                    | `1.0`           | Studio tone mapping exposure (0--2).              |
| `studio4kEnvMaps`  | `boolean`                                   | `false`         | Use 4K environment maps.                          |
| `studioTextureMapping` | `"triplanar" \| "parametric"`           | `"triplanar"`   | Studio texture mapping mode.                      |
| `studioEnvRotation` | `number`                                   | `0`             | Studio environment rotation (0--360 degrees).     |
| `studioShadowIntensity` | `number`                               | `0.5`           | Studio shadow intensity (0--1). `0` = off.        |
| `studioShadowSoftness` | `number`                                | `0.2`           | Studio shadow softness (0--1).                    |
| `studioAOIntensity` | `number`                                   | `0.5`           | Studio ambient occlusion intensity (0--3). `0` = off. |

> **Conceptual split:** Viewer Options describe the _studio_ (lighting, backdrop, camera
> processing) — things independent of the objects being viewed. Shape data describes the
> _objects_ (geometry, hierarchy, color, material) — physical properties of the parts.

#### Environment Presets

The `studioEnvironment` field accepts these values:

| Value | UI Label | Description |
|-------|----------|-------------|
| `"studio"` | Procedural Studio | Built-in procedural studio (no network required). |
| `"studio_small_08"` | Soft Light | Soft light, neutral, backlight. |
| `"studio_small_03"` | High Contrast Studio | High-contrast, softbox + ceiling lamp. |
| `"white_studio_05"` | Bright Neutral | White, product, bright, neutral lighting. |
| `"white_studio_03"` | Clean Softbox | White, softbox, reflection, clean. |
| `"photo_studio_01"` | Spotlit Setup | Lighting setup, spotlights. |
| `"studio_small_09"` | Controlled Light | Product lighting, controlled, soft reflections. |
| `"cyclorama_hard_light"` | Hard Contrast Light | Cyclorama, hard light, contrast. |
| `"canary_wharf"` | Urban Overcast | Urban, city, overcast. |
| `"kiara_1_dawn"` | Outdoor Warm | Dawn, warm, nature, sunrise. |
| `"empty_warehouse_01"` | Neutral Industrial | Warehouse, neutral, big space. |
| `"san_giuseppe_bridge"` | San Giuseppe Bridge | Bridge, outdoor. |
| `"none"` | — | No environment map. |
| Custom URL | — | Any `.hdr` file URL (loaded via HDRLoader). |

### Data-Level Configuration (Root Node)

These fields are set on the **root `Shapes` node** alongside `parts`, `name`, etc.
They configure which **materials** and **textures** are available for objects in Studio mode.

> **Note:** Studio _environment_ settings (lighting, background, shadows, AO, tone mapping)
> are **not** part of the shape data. They describe the physical studio, not the objects,
> and are configured via [Viewer Options](#viewer-options) (`studioEnvironment`,
> `studioBackground`, etc.).

#### `materials` — Material Library

A dictionary mapping material tag names to material definitions. Leaf nodes
reference entries by name via their `material` field.

```js
materials: {
  // Builtin preset (with optional overrides)
  "chrome":       { builtin: "chrome" },
  "blue-acrylic": { builtin: "acrylic-clear", color: "#0000ff" },

  // MaterialXMaterial format: full PBR definition with textures
  "aluminum": {
    properties: {
      color:     { value: [1.0, 1.0, 1.0], texture: "data:image/png;base64,..." },
      roughness: { value: 0.35,             texture: "data:image/png;base64,..." },
      metalness: { value: 1.0 },
      normal:    {                           texture: "data:image/png;base64,..." },
    },
    textureRepeat: [0.25, 0.25],
  },
}
```

**Value types:**

| Value Form | Description |
|------------|-------------|
| `MaterialAppearance` object | Builtin preset with optional overrides (detected by `builtin` key). See [Material Appearance](#material-appearance) below. |
| `MaterialXMaterial` object | threejs-materials format (detected by `properties` key). See [MaterialX Material](#materialx-material) below. |

##### Built-in Presets

31 presets organized by category:

| Category | Presets |
|----------|---------|
| Polished Metals | `chrome`, `polished-steel`, `polished-aluminum`, `gold`, `copper`, `brass` |
| Matte/Brushed Metals | `stainless-steel`, `brushed-aluminum`, `cast-iron`, `titanium`, `galvanized` |
| Plastics | `plastic-glossy`, `plastic-matte`, `abs-black`, `nylon` |
| Glass & Transparent | `acrylic-clear`, `glass-clear`, `glass-tinted`, `glass-frosted` |
| Rubber & Elastomers | `rubber-black`, `rubber-gray`, `rubber-red` |
| Painted Surfaces | `paint-matte`, `paint-glossy`, `paint-metallic`, `car-paint` |
| Natural & Other | `ceramic-white`, `carbon-fiber`, `concrete` |

### MaterialX Material

The `MaterialXMaterial` format is produced by the **threejs-materials** Python library,
which catalogs PBR materials from GPUOpen, ambientCG, PolyHaven, and PhysicallyBased.

```js
{
  // Required: property dict
  properties: {
    color:     { value: [0.8, 0.2, 0.1] },              // linear RGB
    roughness: { value: 0.4, texture: "data:image/..." }, // scalar + texture
    metalness: { value: 1.0 },
    normal:    { texture: "data:image/png;base64,..." },  // texture only
  },

  // Optional: texture tiling
  textureRepeat: [0.25, 0.25],
}
```

Detected by the presence of the `properties` key. Extra keys from threejs-materials
(`id`, `name`, `source`, `url`, `license`) pass through harmlessly.

| Field           | Type                                                    | Default  | Description                                                      |
|-----------------|---------------------------------------------------------|----------|------------------------------------------------------------------|
| `properties`    | `Record<string, { value?: unknown; texture?: string }>` | required | Property dict. Keys are simplified names (`"color"`, `"roughness"`, `"normal"`, etc.). Each entry has optional `value` (scalar or linear RGB array) and/or `texture` (data URI). |
| `textureRepeat` | `[number, number]`                                      | `[1, 1]` | Texture tiling factor `[u, v]`, applied to all textures.         |

### Material Appearance

A builtin preset reference with optional property overrides.
Field names follow Three.js `MeshPhysicalMaterial` naming.

All fields except `builtin` are optional. Only provided fields override the
preset defaults. Texture string fields are either a data URI or a URL resolved
against the HTML page.

#### Core Properties

| Field              | Type                           | Default | Description                                     |
|--------------------|--------------------------------|---------|-------------------------------------------------|
| `name`             | `string`                       | —       | Display name.                                   |
| `builtin`          | `string`                       | —       | Built-in preset reference (e.g., `"stainless-steel"`). |
| `color`            | `[r, g, b, a]` or `"#rrggbb"` | —       | sRGB base color. RGBA tuple (0--1) or CSS hex.  |
| `map`              | `string`                       | —       | Base color texture reference.                   |
| `metalness`        | `number`                       | `0.0`   | Metalness factor (0--1).                        |
| `roughness`        | `number`                       | `0.5`   | Roughness factor (0--1).                        |
| `metalnessMap`     | `string`                       | —       | Metalness map texture reference.                |
| `roughnessMap`     | `string`                       | —       | Roughness map texture reference.                |
| `normalMap`        | `string`                       | —       | Normal map texture reference.                   |
| `aoMap`            | `string`                       | —       | Ambient occlusion texture reference.            |

#### Emissive

| Field              | Type        | Default | Description                   |
|--------------------|-------------|---------|-------------------------------|
| `emissive`         | `[r, g, b]` | —       | Emissive color (linear RGB). |
| `emissiveMap`      | `string`    | —       | Emissive map texture.        |
| `emissiveIntensity`| `number`    | `1.0`   | Emissive intensity.          |

#### Transmission (glass, water)

| Field              | Type     | Default | Description                  |
|--------------------|----------|---------|------------------------------|
| `transmission`     | `number` | —       | Transmission factor (0--1). |
| `transmissionMap`  | `string` | —       | Transmission map texture.   |

#### Clearcoat (car paint, varnish)

| Field                    | Type     | Default | Description                       |
|--------------------------|----------|---------|-----------------------------------|
| `clearcoat`              | `number` | —       | Clearcoat intensity (0--1).      |
| `clearcoatRoughness`     | `number` | —       | Clearcoat roughness.             |
| `clearcoatMap`           | `string` | —       | Clearcoat intensity texture.     |
| `clearcoatRoughnessMap`  | `string` | —       | Clearcoat roughness texture.     |
| `clearcoatNormalMap`     | `string` | —       | Clearcoat normal map texture.    |

#### Volume (subsurface: jade, wax, skin)

| Field                | Type        | Default | Description                    |
|----------------------|-------------|---------|--------------------------------|
| `thickness`          | `number`    | —       | Thickness for volume effects. |
| `thicknessMap`       | `string`    | —       | Thickness map texture.        |
| `attenuationDistance` | `number`   | —       | Attenuation distance.         |
| `attenuationColor`   | `[r, g, b]` | —      | Attenuation color (linear RGB). |

#### IOR, Specular, Sheen, Anisotropy

| Field                  | Type        | Default | Description                               |
|------------------------|-------------|---------|-------------------------------------------|
| `ior`                  | `number`    | `1.5`   | Index of refraction.                      |
| `specularIntensity`    | `number`    | —       | Specular intensity (0--1).                |
| `specularColor`        | `[r, g, b]` | —      | Specular tint color (linear RGB).         |
| `specularIntensityMap` | `string`    | —       | Specular intensity texture.               |
| `specularColorMap`     | `string`    | —       | Specular color texture.                   |
| `sheen`                | `number`    | —       | Sheen intensity (0--1).                   |
| `sheenColor`           | `[r, g, b]` | —      | Sheen tint color (linear RGB).            |
| `sheenRoughness`       | `number`    | —       | Sheen roughness.                          |
| `sheenColorMap`        | `string`    | —       | Sheen color texture.                      |
| `sheenRoughnessMap`    | `string`    | —       | Sheen roughness texture.                  |
| `anisotropy`           | `number`    | —       | Anisotropy strength (0--1).               |
| `anisotropyRotation`   | `number`    | —       | Anisotropy rotation (radians).            |
| `anisotropyMap`        | `string`    | —       | Anisotropy direction texture.             |

#### Alpha & Misc

| Field         | Type                              | Default | Description                           |
|---------------|-----------------------------------|---------|---------------------------------------|
| `alphaMode`   | `"OPAQUE" \| "MASK" \| "BLEND"`  | —       | Alpha blending mode.                  |
| `alphaCutoff` | `number`                          | `0.5`   | Alpha cutoff for `MASK` mode.         |
| `unlit`       | `boolean`                         | —       | Use unlit material (no shading).      |
| `doubleSided` | `boolean`                         | —       | Render both sides of faces.           |

### Studio Materials Example

Both material formats in one model -- a builtin preset with overrides, and a
MaterialX material from threejs-materials:

```js
{
  version: 3,
  name: "Lamp",
  id: "/Lamp",
  loc: [[0, 0, 0], [0, 0, 0, 1]],
  bb: { xmin: -5, xmax: 5, ymin: -5, ymax: 5, zmin: 0, zmax: 12 },

  materials: {
    // 1. Builtin preset (with overrides)
    "arm": { builtin: "chrome" },
    "shade": {
      builtin: "glass-clear",
      color: "#eeddcc",
      thickness: 2.0,
      attenuationColor: [0.95, 0.9, 0.8],
      attenuationDistance: 10.0,
    },

    // 2. MaterialX material (threejs-materials format, detected by `properties` key)
    "base": {
      properties: {
        color:     { value: [0.9, 0.9, 0.9], texture: "data:image/png;base64,..." },
        roughness: { value: 0.35 },
        metalness: { value: 1.0 },
        normal:    { texture: "data:image/png;base64,..." },
      },
      textureRepeat: [0.5, 0.5],
    },
  },

  parts: [
    {
      version: 3,
      id: "/Lamp/Arm",
      name: "Arm",
      type: "shapes",
      subtype: "solid",
      state: [1, 1],
      color: "#cccccc",
      material: "arm",           // → builtin chrome preset
      shape: { /* ... */ },
    },
    {
      version: 3,
      id: "/Lamp/Base",
      name: "Base",
      type: "shapes",
      subtype: "solid",
      state: [1, 1],
      color: "#888888",
      material: "base",          // → MaterialX with textures
      shape: { /* ... */ },
    },
    {
      version: 3,
      id: "/Lamp/Shade",
      name: "Shade",
      type: "shapes",
      subtype: "solid",
      state: [1, 1],
      color: "#eeddcc",
      material: "shade",         // → Material Appearance (glass)
      shape: { /* ... */ },
    },
  ],
}
```

### Material Resolution

In CAD mode, `material` tags are ignored and objects render with standard
`MeshStandardMaterial` using their `color` and `alpha` values. In Studio mode,
the material library is resolved and `MeshPhysicalMaterial` instances are created
with the full PBR property set.

Objects without a `material` tag use the `plastic-glossy` preset in Studio mode.
Objects with `alpha < 1` and no explicit material tag automatically use the
`acrylic-clear` preset with `transmission = 1 - alpha`, simulating glass/acrylic
appearance.

---

## Processing Pipeline

When `viewer.render(shapes)` is called:

1. If the data is in instanced format, all instance buffers are decoded and
   `{ ref: N }` references are resolved to produce a standard `Shapes` tree.
2. Any remaining inline encoded buffers in `shape` objects are decoded.
3. Plain arrays are converted to TypedArrays; nested arrays are flattened.
4. The tree is passed to `NestedGroup` which builds the Three.js scene graph
   with appropriate materials, transformations, and clipping planes.
5. A navigation tree is extracted for the sidebar tree view UI.
