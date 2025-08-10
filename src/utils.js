import { sizeof } from "./sizeof.js";

function clone(obj) {
  if (Array.isArray(obj)) {
    return obj.map((el) => clone(el));
  } else if (typeof obj === "object") {
    var result = {};
    for (var [k, v] of Object.entries(obj)) {
      result[k] = clone(v);
    }
    return result;
  } else {
    return obj;
  }
}
function flatten(arr, depth = 1) {
  return Array.isArray(arr) ? arr.flat(depth) : arr;
}

function isEqual(obj1, obj2, tol = 1e-9) {
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    return (
      obj1.length === obj2.length && obj1.every((v, i) => isEqual(v, obj2[i]))
    );
  } else if (typeof obj1 === "object" && typeof obj2 === "object") {
    var keys1 = Object.keys(obj1);
    var keys2 = Object.keys(obj2);

    if (
      keys1.length == keys2.length &&
      keys1.every((key) => Object.prototype.hasOwnProperty.call(obj2, key))
    ) {
      return keys1.every((key) => isEqual(obj1[key], obj2[key]));
    } else {
      return false;
    }
  } else {
    if (Number(obj1) === obj1 && Number(obj2) === obj2) {
      return Math.abs(obj1 - obj2) < tol;
    }
    return obj1 === obj2;
  }
}

function sceneTraverse(obj, fn) {
  if (!obj) return;

  fn(obj);

  if (obj.children && obj.children.length > 0) {
    obj.children.forEach((o) => {
      sceneTraverse(o, fn);
    });
  }
}

function disposeGeometry(geometry) {
  if (geometry) {
    if (geometry.attributes) {
      if (geometry.attributes.normal) {
        geometry.attributes.normal.array = null; // new Float32Array([]);
      }
      if (geometry.attributes.position) {
        geometry.attributes.position.array = null; // new Float32Array([]);
      }
      if (geometry.attributes.uv) {
        geometry.attributes.uv.array = null; // new Float32Array([]);
      }
      if (geometry.attributes.color) {
        geometry.attributes.color.array = null; // new Float32Array([]);
      }
      if (geometry.index) {
        geometry.index.array = null; // new Float32Array([]);
      }
      if (geometry.attributes.instanceStart) {
        geometry.attributes.instanceStart.data.array = null; // new Float32Array([]);
      }
      if (geometry.attributes.instanceEnd) {
        geometry.attributes.instanceEnd.data.array = null; // new Float32Array([]);
      }
      geometry.attributes = null;
    }
  }
}

function disposeMesh(mesh) {
  if (mesh.geometry) {
    mesh.geometry.dispose();
    disposeGeometry(mesh.geometry);
  }

  if (mesh.material) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material.dispose();
    }
  }
}

function newDisposableMesh(...args) {
  const mesh = new THREE.Mesh(...args);

  mesh.dispose = function () {
    disposeMesh(mesh);
  };

  return mesh;
}

function disposeShapes(shapes) {
  if (shapes.shape) {
    var key = "";
    for (key of [
      "edge_types",
      "face_types",
      "segments_per_edge",
      "triangles",
      "triangles_per_face",
    ]) {
      if (shapes.shape[key]) {
        shapes.shape[key] = null; // new Uint32Array(0);
      }
    }
    for (key of ["edges", "normals", "obj_vertices", "vertices"]) {
      if (shapes.shape[key]) {
        shapes.shape[key] = null; // new Float32Array(0);
      }
    }
  } else if (shapes.parts) {
    for (var i in shapes.parts) {
      disposeShapes(shapes.parts[i]);
      // shapes.parts[i] = null;
    }
    shapes.parts = null;
  }
}

function format(v, b = 2, a = 2) {
  const s = Math.abs(v).toFixed(a);
  var padding = "";
  var int = s.split(".")[0];
  for (var i = int.length; i < b; i++) padding += " ";
  padding += v < 0 ? "-" : " ";
  return padding + s;
}

function prettyPrintVector(v, a, b) {
  return `${format(v[0], a, b)}, ${format(v[2], a, b)}, ${format(v[2], a, b)}`;
}

class _KeyMapper {
  constructor() {
    this.keyMapping = {
      shift: "shiftKey",
      ctrl: "ctrlKey",
      meta: "metaKey",
      alt: "altKey",
    };
  }
  getshortcuts = (key) => {
    return this.keyMapping[key].replace("Key", "");
  };

  get_config() {
    return Object.assign({}, this.keyMapping);
  }

  get = (event, key) => {
    return event[this.keyMapping[key]];
  };

  set = (config) => {
    for (var key in config) {
      this.keyMapping[key] = config[key];
    }
  };
}

// see https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733
function scaleLight(intensity) {
  return Math.round(Math.PI * intensity);
}

function memSize(obj, tag = "obj") {
  for (var attr in obj) {
    if (attr != "parent") {
      try {
        console.log("-", attr, sizeof(obj[attr]));
      } catch (error) {
        console.log("ERROR", attr, obj[attr]);
      }
    }
  }
  console.log(tag, "(TOTAL)", sizeof(obj));
}

const KeyMapper = new _KeyMapper();

export {
  clone,
  flatten,
  isEqual,
  sceneTraverse,
  prettyPrintVector,
  KeyMapper,
  scaleLight,
  newDisposableMesh,
  disposeGeometry,
  disposeMesh,
  disposeShapes,
};
