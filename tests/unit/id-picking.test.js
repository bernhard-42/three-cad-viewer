import { describe, test, expect, vi } from "vitest";
import * as THREE from "three";
import {
  ComponentRegistry,
  BACKGROUND_ID,
  packId,
  unpackId,
  buildFaceComponentIds,
  buildEdgeComponentIds,
  buildVertexComponentIds,
  IdPicker,
  PICK_LAYER,
  createVertexPickMaterial,
  createEdgePickMaterial,
  EDGE_DEPTH_BIAS_FACTOR,
  VERTEX_DEPTH_BIAS_FACTOR,
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

  test("removeByPathPrefix drops a subtree without recycling ids", () => {
    const reg = new ComponentRegistry();
    const f = (path) => ({ path, name: path, topo: "face", subtype: "solid", solidPath: null });
    const a = reg.register(f("/a/faces/faces_0"));
    const b = reg.register(f("/b/faces/faces_0"));
    const maxBefore = reg.maxId;

    reg.removeByPathPrefix("/a");
    expect(reg.get(a)).toBeUndefined(); // removed subtree gone
    expect(reg.get(b)).toBeDefined(); // sibling survives
    expect(reg.maxId).toBe(maxBefore); // ids NOT recycled (highlight texel stable)
    // a fresh registration gets a new id, never reuses the removed one
    expect(reg.register(f("/c"))).toBe(maxBefore + 1);
  });

  test("removeByPathPrefix matches the exact path and only true descendants", () => {
    const reg = new ComponentRegistry();
    const f = (path) => ({ path, name: path, topo: "face", subtype: "solid", solidPath: null });
    const exact = reg.register(f("/a"));
    const child = reg.register(f("/a/faces/faces_0"));
    const sibling = reg.register(f("/ab")); // shares the prefix string but not the path

    reg.removeByPathPrefix("/a");
    expect(reg.get(exact)).toBeUndefined();
    expect(reg.get(child)).toBeUndefined();
    expect(reg.get(sibling)).toBeDefined(); // "/ab" is NOT under "/a/"
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

describe("id-picking: view-space depth bias", () => {
  test("factors are monotonic vertex > edge > 0 (hover priority)", () => {
    expect(VERTEX_DEPTH_BIAS_FACTOR).toBeGreaterThan(EDGE_DEPTH_BIAS_FACTOR);
    expect(EDGE_DEPTH_BIAS_FACTOR).toBeGreaterThan(0);
  });

  test("pick materials expose uDepthBias, default 0, honor the option", () => {
    const v0 = createVertexPickMaterial();
    const e0 = createEdgePickMaterial();
    expect(v0.uniforms.uDepthBias.value).toBe(0);
    expect(e0.uniforms.uDepthBias.value).toBe(0);

    const v = createVertexPickMaterial({ depthBias: 0.42 });
    const e = createEdgePickMaterial({ depthBias: 0.21 });
    expect(v.uniforms.uDepthBias.value).toBeCloseTo(0.42);
    expect(e.uniforms.uDepthBias.value).toBeCloseTo(0.21);
  });

  test("setSceneRadius scales the bias to radius*factor on lazily-created materials", () => {
    const reg = new ComponentRegistry();
    // Minimal renderer: enough for pickAt to allocate materials/target and read.
    const renderer = {
      autoClear: true,
      getContext: () => ({ getExtension: () => ({}) }),
      getPixelRatio: () => 2,
      getClearColor: (c) => c,
      getClearAlpha: () => 0,
      getViewport: (v) => v,
      setViewport: () => {},
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: () => {},
      readRenderTargetPixels: (t, x, y, w, h, buf) => {
        for (let i = 0; i < w * h * 4; i++) buf[i] = 0;
      },
    };
    const picker = new IdPicker(renderer, reg);
    const r = 1000;
    picker.setSceneRadius(r); // set BEFORE materials exist → stored, applied on create
    picker.attach(new THREE.Scene(), { getCamera: () => new THREE.PerspectiveCamera() });
    picker.setSize(800, 600);
    picker.pickAt(10, 10); // forces _ensureResources → material creation

    expect(picker.vertexMaterial.uniforms.uDepthBias.value).toBeCloseTo(
      r * VERTEX_DEPTH_BIAS_FACTOR,
    );
    expect(picker.edgeMaterial.uniforms.uDepthBias.value).toBeCloseTo(
      r * EDGE_DEPTH_BIAS_FACTOR,
    );

    // A later radius change updates existing materials in place.
    picker.setSceneRadius(500);
    expect(picker.vertexMaterial.uniforms.uDepthBias.value).toBeCloseTo(
      500 * VERTEX_DEPTH_BIAS_FACTOR,
    );
    expect(picker.edgeMaterial.uniforms.uDepthBias.value).toBeCloseTo(
      500 * EDGE_DEPTH_BIAS_FACTOR,
    );
  });
});

describe("id-picking: IdPicker.pickAt", () => {
  // Mock renderer: pickAt's GPU calls are stubbed; readRenderTargetPixels writes
  // the bytes we choose, so we test the readback -> unpack -> registry path and
  // the coordinate transform / dirty cadence without a real GL context.
  function makeRenderer(pixel, opts = {}) {
    const calls = { read: [], render: 0 };
    const pos = opts.pos ?? [0, 0, 0, 0];
    return {
      calls,
      autoClear: true,
      // Float-color capability probe (IdPicker._probeFloatColor): report support so
      // the RGBA32F world-position readback path is exercised. Pass
      // `{ floatColor: false }` to simulate a context lacking the extension.
      getContext: () => ({
        getExtension: (name) =>
          name === "EXT_color_buffer_float" && opts.floatColor !== false
            ? {}
            : null,
      }),
      getPixelRatio: () => opts.dpr ?? 2,
      getClearColor: (c) => c,
      getClearAlpha: () => 0,
      getViewport: (v) => v,
      setViewport: () => {},
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      setClearColor: () => {},
      clear: () => {},
      render: () => {
        calls.render += 1;
      },
      // MRT: attachment 0 (default textureIndex) = packed id bytes; attachment 1 =
      // RGBA32F world position. textureIndex is the 8th arg (after activeCubeFace).
      // Fills the WHOLE w*h block (the N×N id window) with the same value.
      readRenderTargetPixels: (target, x, y, w, h, buf, _cube, textureIndex = 0) => {
        calls.read.push([x, y, w, h, textureIndex]);
        const src = textureIndex === 1 ? pos : pixel;
        for (let i = 0; i < w * h; i++) {
          buf[i * 4] = src[0];
          buf[i * 4 + 1] = src[1];
          buf[i * 4 + 2] = src[2];
          buf[i * 4 + 3] = src[3];
        }
      },
    };
  }

  // Camera wrapper stand-in: pickAt only needs getCamera() -> a THREE camera
  // (for .layers manipulation).
  const fakeCamera = () => ({ getCamera: () => new THREE.PerspectiveCamera() });

  function registerFace(reg) {
    return reg.register({
      path: "/obj/faces/faces_0",
      name: "faces_0",
      topo: "face",
      subtype: "solid",
      solidPath: "/obj",
    });
  }

  test("returns null before attach (no scene/camera)", () => {
    const reg = new ComponentRegistry();
    const picker = new IdPicker(makeRenderer([0, 0, 0, 0]), reg);
    expect(picker.pickAt(10, 10)).toBeNull();
  });

  test("returns null when the canvas size is unset (target < 1px)", () => {
    const reg = new ComponentRegistry();
    const picker = new IdPicker(makeRenderer([1, 0, 0, 0]), reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    expect(picker.pickAt(10, 10)).toBeNull(); // setSize never called
  });

  test("resolves a registered id to its ComponentInfo (point null in 2a)", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    const picker = new IdPicker(makeRenderer(packId(id)), reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    const result = picker.pickAt(50, 20);
    expect(result).not.toBeNull();
    expect(result.id).toBe(id);
    expect(result.info.path).toBe("/obj/faces/faces_0");
    expect(result.point).toBeNull();
  });

  test("returns null for the background id (0)", () => {
    const reg = new ComponentRegistry();
    registerFace(reg);
    const picker = new IdPicker(makeRenderer([0, 0, 0, 0]), reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    expect(picker.pickAt(50, 20)).toBeNull();
  });

  test("returns null for an id not in the registry", () => {
    const reg = new ComponentRegistry();
    registerFace(reg); // id 1
    const picker = new IdPicker(makeRenderer(packId(999)), reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    expect(picker.pickAt(50, 20)).toBeNull();
  });

  test("coordinate transform: canvas px -> x dpr x 0.5 -> Y-flip", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    const renderer = makeRenderer(packId(id), { dpr: 2 });
    const picker = new IdPicker(renderer, reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100); // -> target 200x100
    picker.pickAt(50, 20);
    // tx = floor(50*2*0.5)=50; tyTop = floor(20*2*0.5)=20; ty = 100-1-20 = 79.
    // Read 1: N×N id window (default 3, half=1) clamped around (50,79) -> origin (49,78).
    // Read 2: position at the chosen pixel (center (50,79), the window being uniform).
    expect(renderer.calls.read[0]).toEqual([49, 78, 3, 3, 0]); // id window
    expect(renderer.calls.read.at(-1)).toEqual([50, 79, 1, 1, 1]); // position
  });

  test("returns the world-space hit point from the position attachment", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    // attachment 1 = RGBA32F world position; w != 0 marks a written texel.
    const picker = new IdPicker(
      makeRenderer(packId(id), { pos: [1.5, -2.0, 3.25, 1] }),
      reg,
    );
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    const result = picker.pickAt(50, 20);
    expect(result.point).not.toBeNull();
    expect(result.point.toArray()).toEqual([1.5, -2.0, 3.25]);
  });

  test("no EXT_color_buffer_float: positionSupported false, point always null, id still resolves", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    // Probe reports the float-color extension as unavailable.
    const renderer = makeRenderer(packId(id), {
      pos: [1.5, -2.0, 3.25, 1],
      floatColor: false,
    });
    const picker = new IdPicker(renderer, reg);
    expect(picker.positionSupported).toBe(false);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    const result = picker.pickAt(50, 20);
    expect(result.id).toBe(id); // id picking unaffected
    expect(result.point).toBeNull(); // position readback skipped
    // The position attachment is never read back (only the id window).
    expect(renderer.calls.read.every((c) => c[4] === 0)).toBe(true);
  });

  test("point is null when the position texel is unwritten (w = 0)", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    const picker = new IdPicker(
      makeRenderer(packId(id), { pos: [9, 9, 9, 0] }),
      reg,
    );
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    expect(picker.pickAt(50, 20).point).toBeNull();
  });

  test("dirty cadence: re-renders only when dirty, reuses the buffer otherwise", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    const renderer = makeRenderer(packId(id));
    const picker = new IdPicker(renderer, reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);

    // Each buffer render does 3 passes (FACE + EDGE + VERTEX).
    picker.pickAt(50, 20);
    expect(renderer.calls.render).toBe(3); // first read renders (3 passes)
    picker.pickAt(60, 30);
    expect(renderer.calls.render).toBe(3); // no view change -> no re-render
    picker.setDirty();
    picker.pickAt(60, 30);
    expect(renderer.calls.render).toBe(6); // dirtied -> re-render (3 passes)
  });

  test("setClippingPlanes recompiles the material only on plane-count change", () => {
    const reg = new ComponentRegistry();
    registerFace(reg);
    const picker = new IdPicker(makeRenderer([0, 0, 0, 0]), reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    picker.pickAt(50, 20); // lazily creates the pick materials (0 planes)

    // THREE.Material.needsUpdate is write-only (the setter bumps `version`);
    // assert recompile via the version counter (on the face material).
    const mat = picker.faceMaterial;
    const v0 = mat.version;
    const three = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
    picker.setClippingPlanes(three); // 0 -> 3: recompile
    expect(mat.version).toBe(v0 + 1);
    expect(mat.clippingPlanes).toBe(three);

    const v1 = mat.version;
    const three2 = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
    picker.setClippingPlanes(three2); // 3 -> 3, union -> union: value-only
    expect(mat.version).toBe(v1);
    expect(mat.clippingPlanes).toBe(three2);

    const v2 = mat.version;
    picker.setClippingPlanes(three2, true); // union -> intersection: recompile
    expect(mat.version).toBe(v2 + 1);
    expect(mat.clipIntersection).toBe(true);
  });

  test("dispose releases GPU resources and detaches", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    const picker = new IdPicker(makeRenderer(packId(id)), reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    picker.pickAt(50, 20);

    const target = picker.pickTarget;
    const faceMat = picker.faceMaterial;
    const vertexMat = picker.vertexMaterial;
    const targetSpy = vi.spyOn(target, "dispose");
    const faceSpy = vi.spyOn(faceMat, "dispose");
    const vertexSpy = vi.spyOn(vertexMat, "dispose");
    picker.dispose();
    expect(targetSpy).toHaveBeenCalled();
    expect(faceSpy).toHaveBeenCalled();
    expect(vertexSpy).toHaveBeenCalled();
    expect(picker.pickAt(50, 20)).toBeNull(); // detached
  });

  test("per-topo passes select FACE, EDGE, VERTEX layers, restored afterwards", () => {
    const reg = new ComponentRegistry();
    const id = registerFace(reg);
    const renderer = makeRenderer(packId(id));
    const masks = [];
    const cam = new THREE.PerspectiveCamera();
    const wrapper = { getCamera: () => cam };
    renderer.render = () => masks.push(cam.layers.mask);
    const picker = new IdPicker(renderer, reg);
    picker.attach(new THREE.Scene(), wrapper);
    picker.setSize(200, 100);
    const savedBefore = cam.layers.mask;
    picker.pickAt(50, 20);
    const layerMask = (n) => {
      const l = new THREE.Layers();
      l.set(n);
      return l.mask;
    };
    expect(masks).toEqual([
      layerMask(PICK_LAYER.FACE),
      layerMask(PICK_LAYER.EDGE),
      layerMask(PICK_LAYER.VERTEX),
    ]);
    expect(cam.layers.mask).toBe(savedBefore); // restored afterwards
  });

  test("priority: a vertex in the window beats a face, even off-center", () => {
    const reg = new ComponentRegistry();
    const faceId = reg.register({ path: "/o/faces/faces_0", name: "faces_0", topo: "face", subtype: "solid", solidPath: "/o" });
    const vertId = reg.register({ path: "/o/vertices/vertices_0", name: "vertices_0", topo: "vertex", subtype: "solid", solidPath: "/o" });
    // Window full of the face id except one corner pixel = the vertex id.
    const fb = packId(faceId), vb = packId(vertId);
    const renderer = makeRenderer(fb, { pos: [0, 0, 0, 1] });
    renderer.readRenderTargetPixels = (t, x, y, w, h, buf, _c, ti = 0) => {
      renderer.calls.read.push([x, y, w, h, ti]);
      const src = ti === 1 ? [0, 0, 0, 1] : fb;
      for (let i = 0; i < w * h; i++) {
        buf[i * 4] = src[0]; buf[i * 4 + 1] = src[1];
        buf[i * 4 + 2] = src[2]; buf[i * 4 + 3] = src[3];
      }
      if (ti === 0) { buf[0] = vb[0]; buf[1] = vb[1]; buf[2] = vb[2]; buf[3] = vb[3]; }
    };
    const picker = new IdPicker(renderer, reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);

    expect(picker.pickAt(50, 20).id).toBe(vertId); // vertex wins (priority)
    // topoFilter restricts eligibility:
    expect(picker.pickAt(50, 20, { topoFilter: ["face"] }).id).toBe(faceId);
    expect(picker.pickAt(50, 20, { topoFilter: ["vertex"] }).id).toBe(vertId);
  });

  test("priority full ordering: vertex > edge > face, topoFilter selects each", () => {
    const reg = new ComponentRegistry();
    const faceId = reg.register({ path: "/o/faces/faces_0", name: "faces_0", topo: "face", subtype: "solid", solidPath: "/o" });
    const edgeId = reg.register({ path: "/o/edges/edges_0", name: "edges_0", topo: "edge", subtype: "solid", solidPath: "/o" });
    const vertId = reg.register({ path: "/o/vertices/vertices_0", name: "vertices_0", topo: "vertex", subtype: "solid", solidPath: "/o" });
    const fb = packId(faceId), eb = packId(edgeId), vb = packId(vertId);
    // Window: face everywhere, edge at pixel 1, vertex at pixel 0.
    const renderer = makeRenderer(fb, { pos: [0, 0, 0, 1] });
    renderer.readRenderTargetPixels = (t, x, y, w, h, buf, _c, ti = 0) => {
      renderer.calls.read.push([x, y, w, h, ti]);
      const src = ti === 1 ? [0, 0, 0, 1] : fb;
      for (let i = 0; i < w * h; i++) {
        buf[i * 4] = src[0]; buf[i * 4 + 1] = src[1];
        buf[i * 4 + 2] = src[2]; buf[i * 4 + 3] = src[3];
      }
      if (ti === 0) {
        buf[0] = vb[0]; buf[1] = vb[1]; buf[2] = vb[2]; buf[3] = vb[3]; // pixel 0 = vertex
        buf[4] = eb[0]; buf[5] = eb[1]; buf[6] = eb[2]; buf[7] = eb[3]; // pixel 1 = edge
      }
    };
    const picker = new IdPicker(renderer, reg);
    picker.attach(new THREE.Scene(), fakeCamera());
    picker.setSize(200, 100);
    expect(picker.pickAt(50, 20).id).toBe(vertId); // vertex > edge > face
    expect(picker.pickAt(50, 20, { topoFilter: ["edge"] }).id).toBe(edgeId);
    expect(picker.pickAt(50, 20, { topoFilter: ["face"] }).id).toBe(faceId);
    // solid filter resolves via faces (caller maps to solidPath)
    const solid = picker.pickAt(50, 20, { topoFilter: ["solid"] });
    expect(solid.id).toBe(faceId);
    expect(solid.info.solidPath).toBe("/o");
  });
});

describe("id-picking: buildVertexComponentIds", () => {
  test("one id per obj_vertices point + backend-contract paths (solid)", () => {
    const reg = new ComponentRegistry();
    // 3 corners (9 floats)
    const { componentId } = buildVertexComponentIds(
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      "/obj",
      "solid",
      reg,
    );
    expect(Array.from(componentId)).toEqual([1, 2, 3]);
    expect(reg.get(1)).toMatchObject({
      path: "/obj/vertices/vertices_0",
      name: "vertices_0",
      topo: "vertex",
      solidPath: "/obj",
    });
    expect(reg.get(3).path).toBe("/obj/vertices/vertices_2");
  });

  test("standalone (non-solid) vertex → solidPath null", () => {
    const reg = new ComponentRegistry();
    buildVertexComponentIds([0, 0, 0], "/vtx", null, reg);
    expect(reg.get(1).solidPath).toBeNull();
  });

  test("accepts a Float32Array and ignores a trailing partial point", () => {
    const reg = new ComponentRegistry();
    const { componentId } = buildVertexComponentIds(
      new Float32Array([0, 0, 0, 1, 1, 1]),
      "/obj",
      "solid",
      reg,
    );
    expect(componentId.length).toBe(2);
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

describe("id-picking: stock three clipping chunks (loud guard for three upgrades)", () => {
  test("the clipping_planes_* chunks the pick shaders #include still exist", () => {
    // The GLSL3 pick materials hardcode these chunk names (id-picking.ts). A three
    // rename would otherwise break picking silently at runtime — clipped geometry
    // would stay pickable — with no build/test failure. Fail loudly here instead.
    for (const chunk of [
      "clipping_planes_pars_vertex",
      "clipping_planes_vertex",
      "clipping_planes_pars_fragment",
      "clipping_planes_fragment",
    ]) {
      expect(typeof THREE.ShaderChunk[chunk]).toBe("string");
      expect(THREE.ShaderChunk[chunk].length).toBeGreaterThan(0);
    }
  });
});
