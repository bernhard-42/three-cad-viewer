/**
 * Callback for dom events.
 *
 * @callback domEventCallback
 * @param {event} event - DOM event
 */

/**
 * Camera position/zoom, UI and pick changes.
 * @typedef {Object} ChangeInfos - change info.
 * @property {Object} [camera_position] info: {camera_position: [a,b,c]}.
 * @property {Object} [camera_zoom] - zoom change: {camera_zoom: x}.
 * @property {boolean} [axes] - axes shown or hidden: {axes: false}
 * @property {boolean} [axes0] - axes and grid centered at origin: {axes0: false}
 * @property {boolean} [ortho] - orthographic or perspective camera: {ortho: false}
 * @property {string} [grid] - visibility of grids as 3-dim array of boolean for grid xy, xz, yz: {"grid": [false, true, false]}
 * @property {string} [lastPick] - last object double clicked, see example below
 * @example
 * {
 *   "camera_zoom": 0.5},
 *   "camera_position": [
 *       686.1137426105751,
 *       2.842170943040401e-14,
 *       679.0741829484135
 *   ]
 * }
 * @example
 * {
 *  "lastPick": {
 *    "path": "/Group",
 *    "name": "Part_0",
 *    "boundingBox": {
 *      "min": {
 *        "x": -0.5,
 *        "y": -0.5,
 *        "z": -0.5
 *      },
 *      "max": {
 *        "x": 0.5,
 *        "y": 0.5,
 *        "z": 0.5
 *      }
 *    },
 *    "boundingSphere": {
 *      "center": {
 *        "x": 0,
 *        "y": 0,
 *        "z": 0
 *      },
 *      "radius": 0.8660254037844386
 *    }
 *  }
 *}
 */

/**
 * Camera position/zoom, UI and pick change notification.
 * @typedef {Object} ChangeNotification
 * @property {Object} [camera_position] - position change, {camera_position:{new:[a,b,c], old:[x,y,z]}}.
 * @property {Vector3} camera_position.new - new position.
 * @property {Vector3} camera_position.old - old position.
 * @property {Object} [camera_zoom] - zoom change, {camera_zoom:{new:x, old:y}}.
 * @property {number} camera_zoom.new - new zoom value.
 * @property {number} camera_zoom.old - old zoom value.
 * @property {boolean} [axes] - visibility of axes
 * @property {boolean} axes.new - new visibility of axes
 * @property {boolean} axes.old - old visibility of axes
 * @property {Object} [grid] - visibility of grids
 * @property {boolean[]} grid.new - new visibility of grids as 3-dim array of boolean for grid xy, xz, yz
 * @property {boolean[]} grid.old - old visibility of grids
 * @property {Object} [lastPick] - last object double clicked
 * @property {Object} lastPick.new - new object info, see example below
 * @property {Object} lastPick.old - old object info, see example below
 * @example
 * {
 *   "camera_zoom": {
 *     "new": 0.5,
 *     "old": 1
 *   },
 *   "camera_position": {
 *     "new": [
 *       686.1137426105751,
 *       2.842170943040401e-14,
 *       679.0741829484135
 *     ],
 *     "old": [
 *       559.6495141762458,
 *       562.7012872475352,
 *       552.6099545140844
 *     ]
 *   }
 * }
 * @example
 * {
 *   "lastPick": {
 *     "new": {
 *       "path": "/Group",
 *       "name": "Part_0",
 *       "boundingBox": {
 *         "min": {
 *           "x": -0.5,
 *           "y": -0.5,
 *           "z": -0.5
 *         },
 *         "max": {
 *           "x": 0.5,
 *           "y": 0.5,
 *           "z": 0.5
 *         }
 *       },
 *       "boundingSphere": {
 *         "center": {
 *           "x": 0,
 *           "y": 0,
 *           "z": 0
 *         },
 *         "radius": 0.8660254037844386
 *       }
 *     },
 *     "old": null
 *   }
 * }
 */

/**
 * Callback for notifications.
 *
 * @callback NotificationCallback
 * @param {ChangeNotification} change - change event
 */

/**
 * Display options.
 * @typedef {Object} DisplayOptions
 * @property {number} [cadWidth = 800] - width of CAD canvas.
 * @property {number} [height = 600] - height of CAD canvas.
 * @property {number} [treeWidth = 250] - width of tree navigation.
 * @property {string} [theme = "light"] - theme ["light", "dark"]
 * @example
 * options = {
 *   "theme": "light",
 *   "height": 600,
 *   "cadWidth": 800,
 *   "treeWidth": 240,
 * }
 */

/**
 * Viewer options.
 * @typedef {Object} RenderOptions
 * @property {number} [edgeColor = 0x707070] - default edge color.
 * @property {number} [ambientIntensity = 0.5] - ambient light intensity.
 * @property {number} [directIntensity = 0.3] - direct light intensity.
 * @property {number} [defaultOpacity = 0.4] - default opacity level for transparency.
 * @property {number} [normalLen = 0] - show triangle normals when normalLen > 0.
 * @example
 * options = {
 *   "normalLen": 0,
 *   "ambientIntensity": 0.5,
 *   "directIntensity": 0.3,
 * }
 */

/**
 * Viewer options.
 * @typedef {Object} ViewerOptions
 * @property {string} [control = "orbit"] - use OrbitControls or  TrackballControls.
 * @property {boolean} [axes = false] - show X-, Y-, Z-axes.
 * @property {boolean} [axes0 = false] - show axes at [0,0,0] ot at object center (target).
 * @property {boolean[]} [grid = [false, false, false]] - initial grid setting, 3-dim.
 * @property {boolean} [ortho = true] - use an orthographic (true) or perspective camera (false)
 * @property {boolean} [transparent = false] - show CAD object trasparent.
 * @property {boolean} [blackEdges = false] - show edges in black and not in edgeColor.
 * @property {boolean} [clipIntersection = false] - use intersection clipping
 * @property {boolean} [clipPlaneHelpers = false] - show clipping planes
 * @property {number[][]} [clipNormal = [[-1,0,0], [0,-1,0], [0,0,-1]] - normal directions for clipping
 * @property {number} [ticks = 10] - hint for the number of grid ticks.
 * @property {number} [rotateSpeed = 1.0] - rotation speed.
 * @property {number} [zoomSpeed = 0.5] - zooom speed.
 * @property {number} [panSpeed = 0.5] - pan speed.
 * @property {number[]} [position = null] - camera position as 3-dim array
 * @property {number[]} [quaternion = null] - camera rotation as 4-dim quaternion array [x,y,z,w]
 * @property {number} [zoom = null] - camera zoom value
 * @property {number} [zoom0 = 1.0] - initial zoom factor.
 * @property {boolean} [tools = true] - Show/hide all tools.
 * @property {boolean} [timeit = false] - show timings in browser console.
 * @example
 * options = {
 *   "ortho": true,
 *   "ticks": 10,
 *   "transparent": false,
 *   "axes": true,
 *   "grid": [false, false, false],
 *   "timeit": false,
 *   "rotateSpeed": 1
 * }
 */

/**
 * Vector3, a 3-dim list of floats [x,y,z].
 * @typedef {number[]} Vector3
 * @example
 * [x, y, z] = [1.0, 2.0, 3.0]
 */

/**
 * Quaternion, a 4-dim list of floats [x, y, z, w].
 * @typedef {number[]} Quaternion
 * @example
 * [x, y, z, w] = [0.5 0.5 0.5 0.5]
 */

/**
 * Edge, a tuple of two Vector3s, start and and of a simple edge.
 * @typedef {Vector3[]} Edge
 * @example
 * edge = [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]
 */

/**
 * A tessellated 3D shape.
 * @typedef {Object} Texture
 *  @property {number} height - image height.
 *  @property {number} width - image width.
 *  @property {Object} image - {data: base64 encoded image, format: "png"}
 * @example
 * texture: {
 *   height: 1989,
 *   width: 1873,
 *   image:  {
 *     data: 'iVBORw0KGgoAAAANSUhEUgAAB1 … FZQAAAABJRU5ErkJggg==',
 *     format: 'png'
 * }
 */

/**
 * A tessellated 3D shape.
 * @typedef {Object} Shape
 * @property {Vector3[]} vertices - flattened list of 3-dim vertices defining the triangles.
 * @property {Vector3[]} normals - flattened list of 3-dim vertex normals.
 * @property {number[]} triangles - flattened list of 3-dim triangle id's per face.
 * @property {Edge[]} edges - list of edge segments defining an multi point edge per face.
 * @property {Vector3[]} obj_vertices - flattened list of 3-dim vertices of the CAD object.
 * @property {number[]} edge_types - OCP types of the edges.
 * @property {number[]} face_types - OCP types of the faces.
 * @example
 * shape: {
 *    vertices: [
 *      -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5,
 *      0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5,
 *      -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
 *      0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5,
 *      -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5,
 *      0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5,
 *    ],
 *    triangles: [
 *      1, 2, 0, 1, 3, 2, 5, 4, 6, 5, 6, 7, 11, 8, 9, 11, 10, 8, 15, 13, 12,
 *      15, 12, 14, 19, 16, 17, 19, 18, 16, 23, 21, 20, 23, 20, 22,
 *    ],
 *    normals: [
 *      -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, 0.0,
 *      1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 0.0,
 *      -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, 0.0, -1.0, -0.0, -0.0,
 *      1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, 1.0, 0.0, -0.0, -0.0,
 *      -1.0, -0.0, -0.0, -1.0, -0.0, -0.0, -1.0, -0.0, -0.0, -1.0, 0.0, 0.0,
 *      1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,
 *    ],
 *    edges: [
 *      -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
 *      -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5,
 *      0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
 *      0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5,
 *      -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5,
 *      -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
 *    ],
 *    obj_vertices: [
 *      -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
 *      0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
 *    ],
 *    face_types: [0, 0, 0, 0, 0, 0],
 *    edge_types: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
 *    triangles_per_face: [2, 2, 2, 2, 2, 2],
 *    segments_per_edge: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
 *  }
 */

/**
 * Hierachical/groupd objects of type Shape.
 * @typedef {Object} Shapes
 * @property {number} version - protocol version.
 * @property {string} name - group name.
 * @property {string} id - id of the group. It is a '/' separated path.
 * @property {Array} [loc] - a tuple of a 3-dim position [x,y,z] and a 4-dim quaternion [x,y,z,w] describing the group's location.
 * @property {Shapes[]} [parts] - children of the group as list of shapes.
 * @property {Shape} [shape] - Shape object or null, if parts != null.
 * @property {State} [state] - Shape visibility 1=shown, 0=hidden, 3=n/a for faces and edges.
 * @property {string} [type] - object type: "shapes", edges", "vertices", if "shape" != null.
 * @property {string} [subtype] - object subtype: only for type=="shapes": "solid" or "faces", if "shape" != null.
 * @property {string} [color] - rbg object color in CSS format, if "shape" != null.
 * @property {number} [alpha] - object alpha transparency between 0 and 1, if "shape" != null.
 * @property {boolean} [renderback] - whether to render the back of the face or not, if "shape" != null.
 * @property {Texture} [texture] - The encoded png file (only works for faces)
 * @property {map} [bb] - bounding box as map with xmin, xmax, ymin, ymax, zmin, zmax, if "shape" != null.
 * @example
 * shapes = {
 *   version: 3,
 *   parts: [
 *     {
 *       id: "/Group/Workplane(Solid)",
 *       type: "shapes",
 *       subtype: "solid",
 *       name: "Workplane(Solid)",
 *       shape: <see Shape>,
 *       state: [1, 1],
 *       color: "#e8b024",
 *       alpha: 1.0,
 *       texture: null,
 *       loc: [
 *         [-0.0, -0.0, 0.0],
 *         [0.0, 0.0, 0.0, 1.0],
 *       ],
 *       renderback: false,
 *       accuracy: null,
 *       bb: null,
 *     },
 *   ],
 *   loc: [
 *     [0.0, 0.0, 0.0],
 *     [0.0, 0.0, 0.0, 1.0],
 *   ],
 *   name: "Group",
 *   id: "/Group",
 *   normal_len: 0,
 *   bb: { xmin: -0.5, xmax: 0.5, ymin: -0.5, ymax: 0.5, zmin: -0.5, zmax: 0.5 },
 * };
 */
