function calculateObjectSize(obj, options = {}) {
  const {
    excludeAttributes = ["parent", "context", "_parent", "__parent"],
    visited = new WeakSet(),
  } = options;

  // Prevent circular reference
  if (obj === null || obj === undefined) return 0;

  // Check for primitive types
  if (
    ["number", "string", "boolean", "symbol", "bigint"].includes(typeof obj)
  ) {
    return estimatePrimitiveSize(obj);
  }

  // Prevent circular references
  if (visited.has(obj)) return 0;
  visited.add(obj);

  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.reduce(
      (total, item) =>
        total +
        calculateObjectSize(item, {
          excludeAttributes,
          visited,
        }),
      estimateArrayOverhead(obj),
    );
  }

  // Handle TypedArrays
  if (ArrayBuffer.isView(obj)) {
    return obj.byteLength + estimateTypedArrayOverhead(obj);
  }

  // Handle Maps
  if (obj instanceof Map) {
    let mapSize = estimateMapOverhead(obj);
    for (const [key, value] of obj) {
      mapSize += calculateObjectSize(key, { excludeAttributes, visited });
      mapSize += calculateObjectSize(value, { excludeAttributes, visited });
    }
    return mapSize;
  }

  // Handle regular objects
  if (typeof obj === "object") {
    let objectSize = estimateObjectOverhead(obj);
    for (const key in obj) {
      // Skip excluded attributes
      if (
        Object.prototype.hasOwnProperty.call(obj, key) &&
        !excludeAttributes.includes(key)
      ) {
        objectSize += calculateObjectSize(key, { excludeAttributes, visited });
        objectSize += calculateObjectSize(obj[key], {
          excludeAttributes,
          visited,
        });
      }
    }
    return objectSize;
  }

  // For functions or unknown types
  return 0;
}

// (Previous helper functions remain the same)
function estimatePrimitiveSize(primitive) {
  if (primitive === null || primitive === undefined) return 0;
  switch (typeof primitive) {
    case "number":
      return 8; // 64-bit float
    case "string":
      return primitive.length * 2; // Assume UTF-16 encoding
    case "boolean":
      return 4;
    case "symbol":
      return 8;
    case "bigint":
      return 8;
    default:
      return 0;
  }
}

function estimateArrayOverhead(arr) {
  return 24 + arr.length * 8; // Array header + pointer overhead
}

function estimateTypedArrayOverhead() {
  return 24; // Typical overhead for TypedArrays
}

function estimateMapOverhead(map) {
  return 40 + map.size * 16; // Map header + entry overhead
}

function estimateObjectOverhead() {
  return 32; // Basic object overhead
}

export function sizeof(obj) {
  return calculateObjectSize(obj);
}
