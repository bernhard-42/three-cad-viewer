interface SizeOptions {
  excludeAttributes?: string[];
  visited?: WeakSet<object>;
}

function calculateObjectSize(obj: unknown, options: SizeOptions = {}): number {
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
    return estimatePrimitiveSize(obj as string | number | boolean | symbol | bigint);
  }

  // Prevent circular references
  if (typeof obj === "object" && visited.has(obj)) return 0;
  if (typeof obj === "object") visited.add(obj);

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
    return obj.byteLength + estimateTypedArrayOverhead();
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
    let objectSize = estimateObjectOverhead();
    for (const key in obj) {
      // Skip excluded attributes
      if (
        Object.prototype.hasOwnProperty.call(obj, key) &&
        !excludeAttributes.includes(key)
      ) {
        objectSize += calculateObjectSize(key, { excludeAttributes, visited });
        objectSize += calculateObjectSize((obj as Record<string, unknown>)[key], {
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

function estimatePrimitiveSize(primitive: string | number | boolean | symbol | bigint | null | undefined): number {
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

function estimateArrayOverhead(arr: unknown[]): number {
  return 24 + arr.length * 8; // Array header + pointer overhead
}

function estimateTypedArrayOverhead(): number {
  return 24; // Typical overhead for TypedArrays
}

function estimateMapOverhead(map: Map<unknown, unknown>): number {
  return 40 + map.size * 16; // Map header + entry overhead
}

function estimateObjectOverhead(): number {
  return 32; // Basic object overhead
}

export function sizeof(obj: unknown): number {
  return calculateObjectSize(obj);
}
