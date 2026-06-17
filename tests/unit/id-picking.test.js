import { describe, test, expect } from "vitest";
import {
  ComponentRegistry,
  BACKGROUND_ID,
  packId,
  unpackId,
  buildFaceComponentIds,
  buildEdgeComponentIds,
} from "../../src/rendering/id-picking.js";

describe("id-picking: ComponentRegistry", () => {
  test("allocates monotonic ids starting at 1 (0 reserved for background)", () => {
    const reg = new ComponentRegistry();
    const base = {
      path: "/a",
      name: "a",
      topo: "face",
      subtype: null,
      solidPath: null,
    };
    const id1 = reg.register(base);
    const id2 = reg.register({ ...base, path: "/b", name: "b" });
    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(id1).not.toBe(BACKGROUND_ID);
  });

  test("get() round-trips the stored info and writes the allocated id", () => {
    const reg = new ComponentRegistry();
    const id = reg.register({
      path: "/Assembly/Part1/faces/faces_3",
      name: "faces_3",
      topo: "face",
      subtype: "solid",
      solidPath: "/Assembly/Part1",
    });
    const info = reg.get(id);
    expect(info).toBeDefined();
    expect(info.id).toBe(id);
    expect(info.name).toBe("faces_3");
    expect(info.topo).toBe("face");
    expect(info.solidPath).toBe("/Assembly/Part1");
  });

  test("get() returns undefined for background and unknown ids", () => {
    const reg = new ComponentRegistry();
    reg.register({
      path: "/a",
      name: "a",
      topo: "edge",
      subtype: null,
      solidPath: null,
    });
    expect(reg.get(BACKGROUND_ID)).toBeUndefined();
    expect(reg.get(999)).toBeUndefined();
  });

  test("clear() empties the registry and resets id allocation", () => {
    const reg = new ComponentRegistry();
    reg.register({
      path: "/a",
      name: "a",
      topo: "vertex",
      subtype: null,
      solidPath: null,
    });
    expect(reg.size).toBe(1);
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.register({
      path: "/b",
      name: "b",
      topo: "vertex",
      subtype: null,
      solidPath: null,
    })).toBe(1);
  });
});

describe("id-picking: packId / unpackId", () => {
  test("round-trips representative ids across the 32-bit range", () => {
    for (const id of [1, 2, 255, 256, 65535, 65536, 16777215, 16777216, 4294967295]) {
      const [r, g, b, a] = packId(id);
      for (const c of [r, g, b, a]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
      expect(unpackId(r, g, b, a)).toBe(id);
    }
  });

  test("packs the low byte into R (matches the pick-shader layout)", () => {
    expect(packId(0x04030201)).toEqual([0x01, 0x02, 0x03, 0x04]);
  });
});

describe("id-picking: buildFaceComponentIds", () => {
  // 2 faces, 6 non-shared verts: face0 = tri[0,1,2], face1 = tri[3,4,5]
  test("flat format: per-vertex ids + backend-contract paths + no collisions", () => {
    const reg = new ComponentRegistry();
    const { componentId, collisions } = buildFaceComponentIds(
      6,
      [0, 1, 2, 3, 4, 5],
      [1, 1], // triangles_per_face
      "/obj",
      "solid",
      reg,
    );
    expect(collisions).toBe(0);
    expect(Array.from(componentId)).toEqual([1, 1, 1, 2, 2, 2]);
    // backend path contract + topo + solidPath
    expect(reg.get(1)).toMatchObject({
      path: "/obj/faces/faces_0",
      name: "faces_0",
      topo: "face",
      solidPath: "/obj",
    });
    expect(reg.get(2).path).toBe("/obj/faces/faces_1");
  });

  test("nested format yields identical ids to flat format", () => {
    const reg = new ComponentRegistry();
    const { componentId, collisions } = buildFaceComponentIds(
      6,
      [
        [0, 1, 2],
        [3, 4, 5],
      ],
      undefined, // nested → no triangles_per_face
      "/obj",
      "solid",
      reg,
    );
    expect(collisions).toBe(0);
    expect(Array.from(componentId)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(reg.get(2).path).toBe("/obj/faces/faces_1");
  });

  test("standalone (non-solid) face → solidPath null", () => {
    const reg = new ComponentRegistry();
    buildFaceComponentIds(3, [0, 1, 2], [1], "/face", null, reg);
    expect(reg.get(1).solidPath).toBeNull();
  });

  test("detects cross-face shared vertices as collisions", () => {
    const reg = new ComponentRegistry();
    // vertex 2 shared by face0 (0,1,2) and face1 (2,3,4)
    const { collisions } = buildFaceComponentIds(
      5,
      [0, 1, 2, 2, 3, 4],
      [1, 1],
      "/obj",
      "solid",
      reg,
    );
    expect(collisions).toBe(1);
  });
});

describe("id-picking: buildEdgeComponentIds", () => {
  test("flat format: one id per segment + backend-contract paths", () => {
    const reg = new ComponentRegistry();
    // edge0 = 1 segment, edge1 = 2 segments
    const { componentId } = buildEdgeComponentIds(
      new Float32Array(18), // content unused in flat branch
      [1, 2], // segments_per_edge
      "/obj",
      "solid",
      reg,
    );
    expect(Array.from(componentId)).toEqual([1, 2, 2]);
    expect(reg.get(1)).toMatchObject({
      path: "/obj/edges/edges_0",
      topo: "edge",
      solidPath: "/obj",
    });
    expect(reg.get(2).path).toBe("/obj/edges/edges_1");
  });

  test("nested format yields identical ids (6 floats per segment)", () => {
    const reg = new ComponentRegistry();
    const seg = [0, 0, 0, 1, 1, 1]; // one segment = 6 floats
    const { componentId } = buildEdgeComponentIds(
      [seg, [...seg, ...seg]], // edge0: 1 seg, edge1: 2 segs
      undefined,
      "/obj",
      "solid",
      reg,
    );
    expect(Array.from(componentId)).toEqual([1, 2, 2]);
    expect(reg.get(2).path).toBe("/obj/edges/edges_1");
  });
});

describe("id-picking: faces + edges share one registry (global ids)", () => {
  test("ids are unique across topos and match the backend path scheme", () => {
    const reg = new ComponentRegistry();
    buildFaceComponentIds(6, [0, 1, 2, 3, 4, 5], [1, 1], "/obj", "solid", reg);
    buildEdgeComponentIds(new Float32Array(6), [1], "/obj", "solid", reg);
    // 2 faces (ids 1,2) + 1 edge (id 3)
    expect(reg.size).toBe(3);
    expect(reg.get(3)).toMatchObject({
      path: "/obj/edges/edges_0",
      topo: "edge",
    });
  });
});
