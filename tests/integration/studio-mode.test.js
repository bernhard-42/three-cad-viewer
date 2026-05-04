/**
 * Studio mode tests — decode-instances, mode switching, material resolution.
 */
import { describe, test, expect, afterEach, beforeEach, vi } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { ViewerState } from "../../src/core/viewer-state.js";
import {
  isInstancedFormat,
  decodeInstancedFormat,
} from "../../src/utils/decode-instances.js";
import { isMaterialXMaterial } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// Helpers: encode test data in the instanced format
// ---------------------------------------------------------------------------

/** Encode a Float32Array / Uint32Array to base64. */
function toBase64(typedArray) {
  const bytes = new Uint8Array(typedArray.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Build an encoded buffer entry. */
function encodedBuffer(typedArray, dtype) {
  return {
    shape: Array.from(typedArray.length ? [typedArray.length] : [0]),
    dtype,
    buffer: toBase64(typedArray),
    codec: "b64",
  };
}

/** Build a minimal encoded instance (9 required fields). */
function makeEncodedInstance(vertices, triangles) {
  const normals = new Float32Array(vertices.length); // same count, zeroed
  const edges = new Float32Array(0);
  const objVertices = new Float32Array(0);
  const faceTypes = new Uint32Array(triangles.length / 3);
  const edgeTypes = new Uint32Array(0);
  const tpf = new Uint32Array(faceTypes.length).fill(1);
  const spe = new Uint32Array(0);

  return {
    vertices: encodedBuffer(vertices, "float32"),
    triangles: encodedBuffer(triangles, "uint32"),
    normals: encodedBuffer(normals, "float32"),
    edges: encodedBuffer(edges, "float32"),
    obj_vertices: encodedBuffer(objVertices, "float32"),
    face_types: encodedBuffer(faceTypes, "uint32"),
    edge_types: encodedBuffer(edgeTypes, "uint32"),
    triangles_per_face: encodedBuffer(tpf, "uint32"),
    segments_per_edge: encodedBuffer(spe, "uint32"),
  };
}

// ---------------------------------------------------------------------------
// 6a. decode-instances.ts
// ---------------------------------------------------------------------------

describe("decode-instances", () => {
  test("isInstancedFormat detects instanced data", () => {
    expect(isInstancedFormat({ instances: [], shapes: {} })).toBe(true);
    expect(isInstancedFormat({ shapes: {} })).toBe(false);
    expect(isInstancedFormat(null)).toBe(false);
    expect(isInstancedFormat("string")).toBe(false);
    expect(isInstancedFormat({ instances: "not-array", shapes: {} })).toBe(
      false,
    );
  });

  test("decodes valid instanced format correctly", () => {
    const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const tris = new Uint32Array([0, 1, 2]);
    const instance = makeEncodedInstance(verts, tris);

    const data = {
      instances: [instance],
      shapes: {
        id: "root",
        name: "Root",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [{ id: "p1", name: "Part", shape: { ref: 0 } }],
      },
    };

    const result = decodeInstancedFormat(data);
    expect(result.parts[0].shape.vertices).toBeInstanceOf(Float32Array);
    expect(result.parts[0].shape.vertices.length).toBe(9);
    expect(result.parts[0].shape.triangles).toBeInstanceOf(Uint32Array);
    expect(result.parts[0].shape.triangles.length).toBe(3);
  });

  test("resolves { ref: 0 } to decoded shape", () => {
    const verts = new Float32Array([1, 2, 3]);
    const tris = new Uint32Array([0]);
    const instance = makeEncodedInstance(verts, tris);

    const data = {
      instances: [instance],
      shapes: {
        id: "r",
        name: "R",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [
          { id: "a", name: "A", shape: { ref: 0 } },
          { id: "b", name: "B", shape: { ref: 0 } },
        ],
      },
    };

    const result = decodeInstancedFormat(data);
    // Both parts should share the same decoded instance
    expect(result.parts[0].shape).toBe(result.parts[1].shape);
  });

  test("rejects unknown dtype", () => {
    const badInstance = makeEncodedInstance(
      new Float32Array([0]),
      new Uint32Array([0]),
    );
    badInstance.vertices.dtype = "float64";

    const data = {
      instances: [badInstance],
      shapes: {
        id: "r",
        name: "R",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [],
      },
    };

    expect(() => decodeInstancedFormat(data)).toThrow("Unknown dtype");
  });

  test("rejects out-of-bounds ref", () => {
    const verts = new Float32Array([0, 0, 0]);
    const tris = new Uint32Array([0]);
    const instance = makeEncodedInstance(verts, tris);

    const data = {
      instances: [instance],
      shapes: {
        id: "r",
        name: "R",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [{ id: "p", name: "P", shape: { ref: 5 } }],
      },
    };

    expect(() => decodeInstancedFormat(data)).toThrow("out of bounds");
  });

  test("rejects negative ref", () => {
    const verts = new Float32Array([0, 0, 0]);
    const tris = new Uint32Array([0]);
    const instance = makeEncodedInstance(verts, tris);

    const data = {
      instances: [instance],
      shapes: {
        id: "r",
        name: "R",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [{ id: "p", name: "P", shape: { ref: -1 } }],
      },
    };

    expect(() => decodeInstancedFormat(data)).toThrow("out of bounds");
  });

  test("handles empty instances array", () => {
    const data = {
      instances: [],
      shapes: {
        id: "r",
        name: "R",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [],
      },
    };

    const result = decodeInstancedFormat(data);
    expect(result.parts).toEqual([]);
  });

  test("decodes instance with uvs field", () => {
    const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const tris = new Uint32Array([0, 1, 2]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    const instance = makeEncodedInstance(verts, tris);
    instance.uvs = encodedBuffer(uvs, "float32");

    const data = {
      instances: [instance],
      shapes: {
        id: "r",
        name: "R",
        loc: [
          [0, 0, 0],
          [0, 0, 0, 1],
        ],
        parts: [{ id: "p", name: "P", shape: { ref: 0 } }],
      },
    };

    const result = decodeInstancedFormat(data);
    expect(result.parts[0].shape.uvs).toBeInstanceOf(Float32Array);
    expect(result.parts[0].shape.uvs.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 6b. Mode switching (viewer state and studio setters)
// ---------------------------------------------------------------------------

describe("Studio mode switching", () => {
  let testContext;

  beforeEach(() => {
    testContext = setupViewer();
  });

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  test("studio setters update state correctly", () => {
    const { viewer } = testContext;

    viewer.setStudioToneMapping("ACES");
    expect(viewer.getStudioToneMapping()).toBe("ACES");

    viewer.setStudioExposure(1.5);
    expect(viewer.getStudioExposure()).toBe(1.5);

    viewer.setStudioBackground("white");
    expect(viewer.getStudioBackground()).toBe("white");

    viewer.setStudioEnvIntensity(2.0);
    expect(viewer.getStudioEnvIntensity()).toBe(2.0);

    viewer.setStudio4kEnvMaps(true);
    expect(viewer.getStudio4kEnvMaps()).toBe(true);
  });

  test("new setters/getters for env rotation and texture mapping work", () => {
    const { viewer } = testContext;

    viewer.setStudioEnvRotation(90);
    expect(viewer.getStudioEnvRotation()).toBe(90);

    viewer.setStudioTextureMapping("parametric");
    expect(viewer.getStudioTextureMapping()).toBe("parametric");

    viewer.setStudioTextureMapping("triplanar");
    expect(viewer.getStudioTextureMapping()).toBe("triplanar");
  });

  test("resetStudio resets all keys to defaults", () => {
    const { viewer } = testContext;
    const defaults = ViewerState.STUDIO_MODE_DEFAULTS;

    // Change several settings
    viewer.setStudioToneMapping("ACES");
    viewer.setStudioExposure(0.5);
    viewer.setStudioBackground("white");
    viewer.setStudioEnvRotation(180);
    viewer.setStudioTextureMapping("parametric");
    viewer.setStudioShadowIntensity(0.8);

    // Reset
    viewer.resetStudio();

    expect(viewer.getStudioToneMapping()).toBe(defaults.studioToneMapping);
    expect(viewer.getStudioExposure()).toBe(defaults.studioExposure);
    expect(viewer.getStudioBackground()).toBe(defaults.studioBackground);
    expect(viewer.getStudioEnvRotation()).toBe(defaults.studioEnvRotation);
    expect(viewer.getStudioTextureMapping()).toBe(
      defaults.studioTextureMapping,
    );
    expect(viewer.getStudioShadowIntensity()).toBe(
      defaults.studioShadowIntensity,
    );
  });

  test("studio subscriptions fire on state change", () => {
    const { viewer } = testContext;
    const callback = vi.fn();

    viewer.state.subscribe("studioExposure", callback);
    viewer.setStudioExposure(1.8);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ old: 1.0, new: 1.8 }),
    );
  });

  test("exposure is clamped to 0-2", () => {
    const { viewer } = testContext;

    viewer.setStudioExposure(-1);
    expect(viewer.getStudioExposure()).toBe(0);

    viewer.setStudioExposure(5);
    expect(viewer.getStudioExposure()).toBe(2);
  });

  test("shadow intensity is clamped to 0-1", () => {
    const { viewer } = testContext;

    viewer.setStudioShadowIntensity(-0.5);
    expect(viewer.getStudioShadowIntensity()).toBe(0);

    viewer.setStudioShadowIntensity(2.0);
    expect(viewer.getStudioShadowIntensity()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6c. Material resolution (type guards)
// ---------------------------------------------------------------------------

describe("Material type guards", () => {
  test("isMaterialXMaterial detects MaterialXMaterial objects", () => {
    expect(isMaterialXMaterial({ properties: { roughness: 0.5 } })).toBe(true);
    expect(isMaterialXMaterial({ properties: {} })).toBe(true);
  });

  test("isMaterialXMaterial rejects non-MaterialXMaterial values", () => {
    expect(isMaterialXMaterial(null)).toBe(false);
    expect(isMaterialXMaterial(undefined)).toBe(false);
    expect(isMaterialXMaterial("builtin:plastic")).toBe(false);
    expect(isMaterialXMaterial(42)).toBe(false);
    expect(isMaterialXMaterial({ roughness: 0.5 })).toBe(false); // no 'properties' key
  });

  test("isInstancedFormat rejects partial objects", () => {
    expect(isInstancedFormat({ instances: [] })).toBe(false); // missing shapes
    expect(isInstancedFormat({ shapes: {} })).toBe(false); // missing instances
  });
});
