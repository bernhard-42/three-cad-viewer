// Studio mode example: demonstrates all Studio material types
// - Car paint (clearcoat), glass (transmission), brushed aluminum (anisotropy),
//   rubber (built-in preset), and textured wood (textures).
//
// Geometry: UV spheres — curved surfaces show material properties clearly.

// Helper: generate a UV sphere shape.
// Parameters: center [cx, cy, cz], radius, latDiv (latitude divisions), lonDiv (longitude divisions).
// Returns a Shape object in flat format (triangles_per_face / segments_per_edge).
function makeSphere(cx, cy, cz, radius, latDiv, lonDiv) {
  var vertices = [];
  var normals = [];
  var uvs = [];

  // Generate vertices row by row (north pole to south pole)
  for (var i = 0; i <= latDiv; i++) {
    var theta = Math.PI * i / latDiv;
    var st = Math.sin(theta);
    var ct = Math.cos(theta);

    for (var j = 0; j <= lonDiv; j++) {
      var phi = 2 * Math.PI * j / lonDiv;
      var cp = Math.cos(phi);
      var sp = Math.sin(phi);

      var nx = st * cp;
      var ny = st * sp;
      var nz = ct;

      normals.push(nx, ny, nz);
      vertices.push(cx + radius * nx, cy + radius * ny, cz + radius * nz);
      uvs.push(j / lonDiv, 1 - i / latDiv);
    }
  }

  // Generate triangles (skip degenerate triangles at poles)
  var triangles = [];
  for (var i = 0; i < latDiv; i++) {
    for (var j = 0; j < lonDiv; j++) {
      var a = i * (lonDiv + 1) + j;
      var b = a + lonDiv + 1;

      if (i !== 0) {
        triangles.push(a, b, a + 1);
      }
      if (i !== latDiv - 1) {
        triangles.push(a + 1, b, b + 1);
      }
    }
  }

  // One face for the whole sphere
  var triangles_per_face = [triangles.length / 3];
  var face_types = [0];

  // obj_vertices: all unique positions (same as vertices for UV sphere)
  var obj_vertices = vertices.slice();

  // Edges: equator ring + one meridian (enough for CAD mode display)
  var edges = [];
  var segments_per_edge = [];
  var edge_types = [];

  // Equator (latitude ring at middle row)
  var eqRow = Math.floor(latDiv / 2);
  for (var j = 0; j < lonDiv; j++) {
    var idx1 = eqRow * (lonDiv + 1) + j;
    var idx2 = idx1 + 1;
    edges.push(
      vertices[idx1 * 3], vertices[idx1 * 3 + 1], vertices[idx1 * 3 + 2],
      vertices[idx2 * 3], vertices[idx2 * 3 + 1], vertices[idx2 * 3 + 2]
    );
    segments_per_edge.push(1);
    edge_types.push(0);
  }

  // One meridian (j=0 column, all latitude rows)
  for (var i = 0; i < latDiv; i++) {
    var idx1 = i * (lonDiv + 1);
    var idx2 = (i + 1) * (lonDiv + 1);
    edges.push(
      vertices[idx1 * 3], vertices[idx1 * 3 + 1], vertices[idx1 * 3 + 2],
      vertices[idx2 * 3], vertices[idx2 * 3 + 1], vertices[idx2 * 3 + 2]
    );
    segments_per_edge.push(1);
    edge_types.push(0);
  }

  return {
    vertices: vertices,
    normals: normals,
    triangles: triangles,
    edges: edges,
    obj_vertices: obj_vertices,
    face_types: face_types,
    edge_types: edge_types,
    triangles_per_face: triangles_per_face,
    segments_per_edge: segments_per_edge,
    uvs: uvs,
  };
}

var studio_mode = {
  version: 3,

  // =========================================================================
  // Studio mode: material library (tag -> MaterialAppearance)
  // =========================================================================
  materials: {
    "car-paint": {
      preset: "car-paint",
      baseColor: [0.8, 0.0, 0.0, 1.0],
    },
    "windshield": {
      baseColor: [1.0, 1.0, 1.0, 1.0],
      transmission: 1.0,
      roughness: 0.0,
      ior: 1.5,
      thickness: 0.2,
    },
    "trim": {
      preset: "brushed-aluminum",
      normalTexture: "builtin:brushed",
    },
    "dashboard": {
      baseColorTexture: "builtin:checker",
      normalTexture: "builtin:brushed",
      roughness: 0.7,
    },
  },

  // Using builtin: references for all textures (no embedded image data needed).
  textures: {},

  // Studio mode rendering hints
  studioOptions: {
    environment: { type: "built-in" },
    toneMapping: "neutral",
    showEdges: false,
  },

  // =========================================================================
  // Parts — flat list of leaves under root
  // NOTE: Tree paths are built from name fields, groups dict uses id fields.
  //       Root name must match first id segment for tree selection to work.
  // =========================================================================
  parts: [
    {
      id: "/Studio/Sphere A (car-paint)",
      type: "shapes",
      subtype: "solid",
      name: "Sphere A (car-paint)",
      shape: makeSphere(0, 0, 0, 3, 48, 96),
      state: [1, 1],
      color: "#cc0000",
      alpha: 1.0,
      texture: null,
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      renderback: false,
      accuracy: null,
      bb: null,
      material: "car-paint",
    },
    {
      id: "/Studio/Sphere B (glass)",
      type: "shapes",
      subtype: "solid",
      name: "Sphere B (glass)",
      shape: makeSphere(5, 0, 2, 2, 48, 96),
      state: [1, 1],
      color: "#aaddff",
      alpha: 0.3,
      texture: null,
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      renderback: false,
      accuracy: null,
      bb: null,
      material: "windshield",
    },
    {
      id: "/Studio/Sphere C (brushed-aluminum)",
      type: "shapes",
      subtype: "solid",
      name: "Sphere C (brushed-aluminum)",
      shape: makeSphere(-5, 0, 1, 1.5, 48, 96),
      state: [1, 1],
      color: "#888888",
      alpha: 1.0,
      texture: null,
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      renderback: false,
      accuracy: null,
      bb: null,
      material: "trim",
    },
    {
      id: "/Studio/Sphere D (rubber-black)",
      type: "shapes",
      subtype: "solid",
      name: "Sphere D (rubber-black)",
      shape: makeSphere(3, 0, -4, 1, 48, 96),
      state: [1, 1],
      color: "#333333",
      alpha: 1.0,
      texture: null,
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      renderback: false,
      accuracy: null,
      bb: null,
      material: "rubber-black",
    },
    {
      id: "/Studio/Sphere E (textured)",
      type: "shapes",
      subtype: "solid",
      name: "Sphere E (textured)",
      shape: makeSphere(-3, 0, -4, 1.5, 48, 96),
      state: [1, 1],
      color: "#8b4513",
      alpha: 1.0,
      texture: null,
      loc: [[0, 0, 0], [0, 0, 0, 1]],
      renderback: false,
      accuracy: null,
      bb: null,
      material: "dashboard",
    },
  ],
  loc: [[0, 0, 0], [0, 0, 0, 1]],
  name: "Studio",
  id: "/Studio",
  normal_len: 0,
  bb: {
    xmin: -7,
    xmax: 7,
    ymin: -3,
    ymax: 3,
    zmin: -5.5,
    zmax: 5.5,
  },
};
