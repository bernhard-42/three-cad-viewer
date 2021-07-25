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

function isEqual(obj1, obj2) {
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    return (
      obj1.length === obj2.length && obj1.every((v, i) => isEqual(v, obj2[i]))
    );
  } else if (typeof obj1 === "object" && typeof obj2 === "object") {
    var keys1 = Object.keys(obj1);
    var keys2 = Object.keys(obj2);

    if (
      keys1.length == keys2.length &&
      keys1.every((key) => obj2.hasOwnProperty(key))
    ) {
      return keys1.every((key) => isEqual(obj1[key], obj2[key]));
    } else {
      return false;
    }
  } else {
    return obj1 === obj2;
  }
}

export { clone, isEqual };
