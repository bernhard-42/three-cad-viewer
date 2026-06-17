import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ComponentRegistry } from "../../src/rendering/id-picking.js";
import {
  HighlightController,
  HighlightFlag,
  HIGHLIGHT_STATE_TEXTURE_WIDTH,
} from "../../src/rendering/highlight.js";

/**
 * Build a registry with a few components. Two faces + one edge belong to solid
 * "/s"; one standalone face has no solidPath.
 */
function makeRegistry() {
  const reg = new ComponentRegistry();
  const f0 = reg.register({
    path: "/s/faces/faces_0",
    name: "faces_0",
    topo: "face",
    subtype: "solid",
    solidPath: "/s",
  });
  const f1 = reg.register({
    path: "/s/faces/faces_1",
    name: "faces_1",
    topo: "face",
    subtype: "solid",
    solidPath: "/s",
  });
  const e0 = reg.register({
    path: "/s/edges/edges_0",
    name: "edges_0",
    topo: "edge",
    subtype: "solid",
    solidPath: "/s",
  });
  const standalone = reg.register({
    path: "/face/faces/faces_0",
    name: "faces_0",
    topo: "face",
    subtype: null,
    solidPath: null,
  });
  return { reg, f0, f1, e0, standalone };
}

/** The CPU mirror the texture uploads from. */
function texData(controller) {
  return controller.stateTexture.image.data;
}

describe("ComponentRegistry — Phase 3 additions", () => {
  it("entries() yields every component in id order", () => {
    const { reg } = makeRegistry();
    const ids = [...reg.entries()].map((c) => c.id);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it("maxId equals the largest allocated id (== size, contiguous from 1)", () => {
    const { reg } = makeRegistry();
    expect(reg.maxId).toBe(4);
    expect(reg.maxId).toBe(reg.size);
  });

  it("maxId is 0 for an empty registry", () => {
    expect(new ComponentRegistry().maxId).toBe(0);
  });
});

describe("HighlightController — data layer", () => {
  it("allocates an R8UI texture wide enough for maxId, NearestFilter, no mips", () => {
    const { reg } = makeRegistry();
    const c = new HighlightController(reg);
    const tex = c.stateTexture;
    expect(tex.image.width).toBe(HIGHLIGHT_STATE_TEXTURE_WIDTH);
    expect(tex.image.data.length).toBeGreaterThanOrEqual(reg.maxId + 1);
    expect(tex.internalFormat).toBe("R8UI");
    expect(tex.generateMipmaps).toBe(false);
    c.dispose();
  });

  it("setSelected sets/clears the SELECTED bit at the id's texel", () => {
    const { reg, f0 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED);
    c.setSelected(f0, false);
    expect(texData(c)[f0]).toBe(HighlightFlag.NONE);
    c.dispose();
  });

  it("setHover moves the HOVER bit off the previous id and never touches SELECTED", () => {
    const { reg, f0, f1 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    c.setHover(f0); // hover the selected one
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED | HighlightFlag.HOVER);
    c.setHover(f1); // move hover away
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED); // selection preserved
    expect(texData(c)[f1]).toBe(HighlightFlag.HOVER);
    c.setHover(null); // clear hover
    expect(texData(c)[f1]).toBe(HighlightFlag.NONE);
    c.dispose();
  });

  it("setHoverSolid HOVERs only the solid's faces and moves cleanly", () => {
    const { reg, f0, f1, e0, standalone } = makeRegistry();
    const c = new HighlightController(reg);
    c.setHoverSolid("/s");
    expect(texData(c)[f0]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[f1]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[e0]).toBe(HighlightFlag.NONE); // edge of the solid not hovered
    expect(texData(c)[standalone]).toBe(HighlightFlag.NONE);
    // moving to a single-component hover clears the whole-solid hover
    c.setHover(standalone);
    expect(texData(c)[f0]).toBe(HighlightFlag.NONE);
    expect(texData(c)[standalone]).toBe(HighlightFlag.HOVER);
    // null clears
    c.setHoverSolid(null);
    expect(texData(c)[standalone]).toBe(HighlightFlag.NONE);
    c.dispose();
  });

  it("setHoverSolid preserves SELECTED bits (hover is layered)", () => {
    const { reg, f0 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    c.setHoverSolid("/s");
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED | HighlightFlag.HOVER);
    c.setHoverSolid(null);
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED); // selection survives
    c.dispose();
  });

  it("selectSolid flags only the solid's faces (matches _getSolidObjectGroups)", () => {
    const { reg, f0, f1, e0, standalone } = makeRegistry();
    const c = new HighlightController(reg);
    c.selectSolid("/s", true);
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED);
    expect(texData(c)[f1]).toBe(HighlightFlag.SELECTED);
    expect(texData(c)[e0]).toBe(HighlightFlag.NONE); // edge not flagged
    expect(texData(c)[standalone]).toBe(HighlightFlag.NONE);
    c.selectSolid("/s", false);
    expect(texData(c)[f0]).toBe(HighlightFlag.NONE);
    c.dispose();
  });

  it("clear() resets all state and hover tracking", () => {
    const { reg, f0, f1 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    c.setHover(f1);
    c.clear();
    expect(texData(c)[f0]).toBe(HighlightFlag.NONE);
    expect(texData(c)[f1]).toBe(HighlightFlag.NONE);
    // hover tracking reset: hovering f1 again must re-set its bit
    c.setHover(f1);
    expect(texData(c)[f1]).toBe(HighlightFlag.HOVER);
    c.dispose();
  });

  it("resize grows capacity past a larger maxId, preserves state, re-binds uniform", () => {
    const { reg, f0 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    const before = c.stateTexture;

    const bigId = HIGHLIGHT_STATE_TEXTURE_WIDTH + 5; // forces a second row
    c.resize(bigId);

    expect(c.stateTexture).not.toBe(before); // re-allocated
    expect(c.uniforms.uHighlightState.value).toBe(c.stateTexture); // re-bound
    expect(texData(c).length).toBeGreaterThanOrEqual(bigId + 1);
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED); // preserved
    c.setSelected(bigId, true); // now in range
    expect(texData(c)[bigId]).toBe(HighlightFlag.SELECTED);
    c.dispose();
  });

  it("ignores background id 0 and out-of-range ids", () => {
    const { reg } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(0, true); // background
    c.setSelected(999999, true); // far out of range
    expect(texData(c)[0]).toBe(HighlightFlag.NONE);
    c.dispose();
  });
});

/** A bare object with the surface `_install` touches. */
function fakeMaterial() {
  return { onBeforeCompile: undefined, needsUpdate: false, userData: {} };
}

/** A minimal shader with the face/points fragment color anchor. */
function shaderWith(vertexBody) {
  return {
    uniforms: {},
    vertexShader: `void main() {\n${vertexBody}\n}`,
    fragmentShader:
      "void main() {\n  vec4 diffuseColor = vec4(1.0);\n  #include <color_fragment>\n}",
  };
}

describe("HighlightController — shader patching", () => {
  function controller() {
    return new HighlightController(makeRegistry().reg);
  }

  it("patchFaceMaterial binds shared uniforms (by reference) and injects id + color", () => {
    const c = controller();
    const mat = fakeMaterial();
    c.patchFaceMaterial(mat);
    expect(mat.userData.highlightPatched).toBe(true);
    expect(typeof mat.onBeforeCompile).toBe("function");

    const shader = shaderWith("  gl_Position = vec4(0.0);");
    mat.onBeforeCompile(shader, null);
    expect(shader.uniforms.uHighlightState).toBe(c.uniforms.uHighlightState);
    expect(shader.uniforms.uHighlightSelectedColor).toBe(
      c.uniforms.uHighlightSelectedColor,
    );
    expect(shader.vertexShader).toContain("attribute uint componentId;");
    expect(shader.vertexShader).toContain("vHighlightId = componentId;");
    expect(shader.fragmentShader).toContain(
      "diffuseColor.rgb = uHighlightSelectedColor",
    );
    c.dispose();
  });

  it("patchEdgeMaterial widens at the linewidth anchor (replaces it) + recolors", () => {
    const c = controller();
    const mat = fakeMaterial();
    c.patchEdgeMaterial(mat);
    const shader = shaderWith("  vec2 offset = vec2(0.0);\n  offset *= linewidth;");
    mat.onBeforeCompile(shader, null);
    expect(shader.vertexShader).toContain("hlEdgeState");
    expect(shader.vertexShader).not.toContain("offset *= linewidth;"); // replaced
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = uHighlight");
    c.dispose();
  });

  it("patchVertexMaterial cull mode zero-sizes + discards unflagged points", () => {
    const c = controller();
    const mat = fakeMaterial();
    c.patchVertexMaterial(mat, { cullUnhighlighted: true });
    const shader = shaderWith("  gl_PointSize = size;");
    mat.onBeforeCompile(shader, null);
    expect(shader.vertexShader).toContain("hlPtState");
    expect(shader.vertexShader).toContain("0.0))"); // none-size = 0 (cull)
    expect(shader.fragmentShader).toContain("discard");
    c.dispose();
  });

  it("patchVertexMaterial visible mode keeps authored size, no discard", () => {
    const c = controller();
    const mat = fakeMaterial();
    c.patchVertexMaterial(mat); // default: visible (not cull)
    const shader = shaderWith("  gl_PointSize = size;");
    mat.onBeforeCompile(shader, null);
    expect(shader.vertexShader).toContain("size))"); // none-size = authored `size`
    expect(shader.fragmentShader).not.toContain("discard");
    c.dispose();
  });

  it("throws loudly when a shader anchor is missing (guards three upgrades)", () => {
    const c = controller();
    const mat = fakeMaterial();
    c.patchEdgeMaterial(mat);
    const shader = shaderWith("  // anchor intentionally absent");
    expect(() => mat.onBeforeCompile(shader, null)).toThrow(/anchor not found/);
    c.dispose();
  });

  it("is idempotent — a second patch call does not re-wrap onBeforeCompile", () => {
    const c = controller();
    const mat = fakeMaterial();
    c.patchFaceMaterial(mat);
    const first = mat.onBeforeCompile;
    c.patchFaceMaterial(mat);
    expect(mat.onBeforeCompile).toBe(first);
    c.dispose();
  });
});

describe("stock three shader anchors (loud guard for three upgrades)", () => {
  it("the anchors the patch methods rely on still exist", () => {
    expect(new LineMaterial().vertexShader).toContain("offset *= linewidth;");
    expect(THREE.ShaderLib.standard.fragmentShader).toContain(
      "#include <color_fragment>",
    );
    expect(THREE.ShaderLib.points.vertexShader).toContain("gl_PointSize = size;");
    expect(THREE.ShaderLib.points.fragmentShader).toContain(
      "#include <color_fragment>",
    );
  });
});
