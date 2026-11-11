import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ComponentRegistry } from "../../src/rendering/id-picking.js";
import {
  HighlightController,
  HighlightFlag,
  HIGHLIGHT_STATE_TEXTURE_WIDTH,
  IMAGE_FACE_HIGHLIGHT_OPACITY,
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

  it("setHoverPath HOVERs every face at or below the path, not edges", () => {
    const { reg, f0, f1, e0, standalone } = makeRegistry();
    const sibling = reg.register({
      path: "/sx/faces/faces_0",
      name: "faces_0",
      topo: "face",
      subtype: "solid",
      solidPath: "/sx",
    });
    const c = new HighlightController(reg);
    c.setHoverPath("/s");
    expect(texData(c)[f0]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[f1]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[e0]).toBe(HighlightFlag.NONE); // edges are not hovered
    expect(texData(c)[standalone]).toBe(HighlightFlag.NONE);
    expect(texData(c)[sibling]).toBe(HighlightFlag.NONE); // "/sx" is not under "/s"
    // a group path covers solids and standalone faces below it
    c.setHoverPath("");
    expect(texData(c)[f0]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[standalone]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[sibling]).toBe(HighlightFlag.HOVER);
    // null clears
    c.setHoverPath(null);
    expect(texData(c)[f0]).toBe(HighlightFlag.NONE);
    expect(texData(c)[standalone]).toBe(HighlightFlag.NONE);
    c.dispose();
  });

  it("setHoverPath shows edges or vertices of leaves without faces", () => {
    const { reg, f0, f1, e0, standalone } = makeRegistry();
    const reg2 = (path, topo) =>
      reg.register({
        path,
        name: path.split("/").pop(),
        topo,
        subtype: null,
        solidPath: null,
      });
    // edges-only leaf "/grp/wire" with its pick-only corner point
    const wireEdge = reg2("/grp/wire/edges/edges_0", "edge");
    const wireCorner = reg2("/grp/wire/vertices/vertices_0", "vertex");
    // vertices-only leaf "/grp/pts"
    const pt = reg2("/grp/pts/vertices/vertices_0", "vertex");
    const c = new HighlightController(reg);

    c.setHoverPath("/grp/wire"); // edges, not the corner point
    expect(texData(c)[wireEdge]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[wireCorner]).toBe(HighlightFlag.NONE);

    c.setHoverPath("/grp/pts"); // a vertex-only leaf shows its vertices
    expect(texData(c)[pt]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[wireEdge]).toBe(HighlightFlag.NONE);

    // a group: each leaf shows its highest topology
    c.setHoverPath("");
    expect(texData(c)[f0]).toBe(HighlightFlag.HOVER); // solid: faces
    expect(texData(c)[f1]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[e0]).toBe(HighlightFlag.NONE); // not the solid's edges
    expect(texData(c)[standalone]).toBe(HighlightFlag.HOVER); // face shape
    expect(texData(c)[wireEdge]).toBe(HighlightFlag.HOVER);
    expect(texData(c)[wireCorner]).toBe(HighlightFlag.NONE);
    expect(texData(c)[pt]).toBe(HighlightFlag.HOVER);
    c.dispose();
  });

  it("setHoverPath preserves SELECTED bits", () => {
    const { reg, f0 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    c.setHoverPath("/s");
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED | HighlightFlag.HOVER);
    c.setHoverPath(null);
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED);
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
    // The id crosses as two interpolated float halves, never as a `flat` varying
    // (ANGLE-on-Metal graphics-memory trap, see highlight.ts).
    expect(shader.vertexShader).toContain(
      "vHighlightIdLo = float(componentId & 0xFFFFu);",
    );
    expect(shader.vertexShader).toContain(
      "vHighlightIdHi = float(componentId >> 16);",
    );
    expect(shader.vertexShader).not.toContain("flat ");
    expect(shader.fragmentShader).not.toContain("flat ");
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

  // Ghost-vertex regression: the cull and non-cull vertex PointsMaterials are
  // otherwise cache-identical and our onBeforeCompile stringifies identically, so
  // without a distinct customProgramCacheKey three.js shares ONE shader program and
  // the discard-less (no-cull) variant wins → the hidden face-corner points render.
  it("cull vs non-cull vertex materials get distinct program cache keys", () => {
    const c = controller();
    const cullMat = fakeMaterial();
    const visibleMat = fakeMaterial();
    c.patchVertexMaterial(cullMat, { cullUnhighlighted: true });
    c.patchVertexMaterial(visibleMat); // no cull
    expect(typeof cullMat.customProgramCacheKey).toBe("function");
    expect(cullMat.customProgramCacheKey()).not.toBe(
      visibleMat.customProgramCacheKey(),
    );
    c.dispose();
  });

  it("face / edge / vertex materials get distinct program cache keys", () => {
    const c = controller();
    const f = fakeMaterial();
    const e = fakeMaterial();
    const v = fakeMaterial();
    c.patchFaceMaterial(f);
    c.patchEdgeMaterial(e);
    c.patchVertexMaterial(v);
    const keys = [f, e, v].map((m) => m.customProgramCacheKey());
    expect(new Set(keys).size).toBe(3);
    c.dispose();
  });

  it("a chained prior onBeforeCompile (e.g. triplanar) contributes to the key", () => {
    const c = controller();
    const plain = fakeMaterial();
    const withPrev = fakeMaterial();
    withPrev.onBeforeCompile = function triplanarLike() {};
    c.patchFaceMaterial(plain);
    c.patchFaceMaterial(withPrev);
    expect(plain.customProgramCacheKey()).not.toBe(
      withPrev.customProgramCacheKey(),
    );
    c.dispose();
  });

  it("an image face mixes the highlight over its image, in a program of its own", () => {
    const c = controller();
    const face = fakeMaterial();
    const image = fakeMaterial();
    c.patchFaceMaterial(face);
    c.patchFaceMaterial(image, IMAGE_FACE_HIGHLIGHT_OPACITY);
    const faceShader = shaderWith("");
    const imageShader = shaderWith("");
    face.onBeforeCompile(faceShader, null);
    image.onBeforeCompile(imageShader, null);

    expect(faceShader.fragmentShader).toContain(
      "diffuseColor.rgb = uHighlightHoverColor;",
    );
    expect(imageShader.fragmentShader).toContain(
      "diffuseColor.rgb = mix(diffuseColor.rgb, uHighlightHoverColor, 0.35);",
    );
    expect(imageShader.fragmentShader).toContain(
      "diffuseColor.rgb = mix(diffuseColor.rgb, uHighlightSelectedColor, 0.35);",
    );
    expect(face.customProgramCacheKey()).not.toBe(
      image.customProgramCacheKey(),
    );
    c.dispose();
  });
});

describe("stock three shader anchors (loud guard for three upgrades)", () => {
  it("the anchors the patch methods rely on still exist", () => {
    expect(new LineMaterial().vertexShader).toContain("offset *= linewidth;");
    expect(THREE.ShaderLib.standard.fragmentShader).toContain(
      "#include <color_fragment>",
    );
    // image faces use MeshBasicMaterial
    expect(THREE.ShaderLib.basic.fragmentShader).toContain(
      "#include <color_fragment>",
    );
    expect(THREE.ShaderLib.points.vertexShader).toContain("gl_PointSize = size;");
    expect(THREE.ShaderLib.points.fragmentShader).toContain(
      "#include <color_fragment>",
    );
  });
});

describe("HighlightController — agent marks", () => {
  it("setAgent marks exactly the given ids, replacing the previous marks", () => {
    const { reg, f0, f1, e0 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setAgent([f0, e0]);
    expect(texData(c)[f0]).toBe(HighlightFlag.AGENT);
    expect(texData(c)[e0]).toBe(HighlightFlag.AGENT);
    c.setAgent([f1]);
    expect(texData(c)[f0]).toBe(HighlightFlag.NONE);
    expect(texData(c)[e0]).toBe(HighlightFlag.NONE);
    expect(texData(c)[f1]).toBe(HighlightFlag.AGENT);
    c.setAgent([]);
    expect(texData(c)[f1]).toBe(HighlightFlag.NONE);
    c.dispose();
  });

  it("agent marks, selection and hover are independent bits", () => {
    const { reg, f0 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setSelected(f0, true);
    c.setHover(f0);
    c.setAgent([f0]);
    expect(texData(c)[f0]).toBe(
      HighlightFlag.SELECTED | HighlightFlag.HOVER | HighlightFlag.AGENT,
    );
    c.setAgent([]);
    expect(texData(c)[f0]).toBe(HighlightFlag.SELECTED | HighlightFlag.HOVER);
    c.dispose();
  });

  it("clearSelection drops selection and hover, keeps agent marks", () => {
    const { reg, f0, f1 } = makeRegistry();
    const c = new HighlightController(reg);
    c.setAgent([f0, f1]);
    c.setSelected(f0, true);
    c.setHover(f1);
    c.clearSelection();
    expect(texData(c)[f0]).toBe(HighlightFlag.AGENT);
    expect(texData(c)[f1]).toBe(HighlightFlag.AGENT);
    // hover tracking reset: hovering f1 again sets its bit again
    c.setHover(f1);
    expect(texData(c)[f1]).toBe(HighlightFlag.AGENT | HighlightFlag.HOVER);
    c.dispose();
  });

  it("the colours: agent ff6699, agreed 09b241, selection unchanged", () => {
    const c = new HighlightController(makeRegistry().reg);
    expect(c.uniforms.uHighlightAgentColor.value.getHex()).toBe(0xff6699);
    expect(c.uniforms.uHighlightAgreedColor.value.getHex()).toBe(0x09b241);
    expect(c.uniforms.uHighlightSelectedColor.value.getHex()).toBe(0x53a0e3);
    c.dispose();
  });

  it("the colour chain: agreed, then selected, then hover, then agent", () => {
    const c = new HighlightController(makeRegistry().reg);
    const mat = fakeMaterial();
    c.patchFaceMaterial(mat);
    const shader = shaderWith("  gl_Position = vec4(0.0);");
    mat.onBeforeCompile(shader, null);
    expect(shader.uniforms.uHighlightAgentColor).toBe(
      c.uniforms.uHighlightAgentColor,
    );
    expect(shader.uniforms.uHighlightAgreedColor).toBe(
      c.uniforms.uHighlightAgreedColor,
    );
    const src = shader.fragmentShader;
    const at = (s) => {
      const i = src.indexOf(s);
      expect(i).toBeGreaterThan(-1);
      return i;
    };
    const agreed = at("diffuseColor.rgb = uHighlightAgreedColor");
    const selected = at("diffuseColor.rgb = uHighlightSelectedColor");
    const hover = at("diffuseColor.rgb = uHighlightHoverColor");
    const agent = at("diffuseColor.rgb = uHighlightAgentColor");
    expect(agreed).toBeLessThan(selected);
    expect(selected).toBeLessThan(hover);
    expect(hover).toBeLessThan(agent);
    // agreed needs both bits
    expect(src).toContain(
      `(hlColorState & ${HighlightFlag.SELECTED | HighlightFlag.AGENT}u) == ${HighlightFlag.SELECTED | HighlightFlag.AGENT}u`,
    );
    c.dispose();
  });

  it("a selected or agent-marked vertex is drawn at 8 px, also while hovered", () => {
    const c = new HighlightController(makeRegistry().reg);
    for (const cull of [true, false]) {
      const mat = fakeMaterial();
      c.patchVertexMaterial(mat, { cullUnhighlighted: cull });
      const shader = shaderWith("  gl_PointSize = size;");
      mat.onBeforeCompile(shader, null);
      const src = shader.vertexShader;
      const marked = src.indexOf("(hlPtState & 5u) != 0u ? 8.0"); // SELECTED | AGENT
      const hover = src.indexOf("(hlPtState & 2u) != 0u ? 6.0");
      expect(marked).toBeGreaterThan(-1);
      expect(hover).toBeGreaterThan(marked); // checked after the marks
    }
    c.dispose();
  });

  it("edge widths are unchanged: hover 5, selected or agent 3", () => {
    const c = new HighlightController(makeRegistry().reg);
    const mat = fakeMaterial();
    c.patchEdgeMaterial(mat);
    const shader = shaderWith(
      "  vec2 offset = vec2(0.0);\n  offset *= linewidth;",
    );
    mat.onBeforeCompile(shader, null);
    expect(shader.vertexShader).toContain(
      "((hlEdgeState & 2u) != 0u ? 5.0 : ((hlEdgeState & 5u) != 0u ? 3.0 : linewidth))",
    );
    c.dispose();
  });

  it("an agent mark widens edges and shows hidden solid corners like a selection", () => {
    const c = new HighlightController(makeRegistry().reg);
    expect(HighlightFlag.AGENT).toBe(4);
    const mask = "& 5u"; // SELECTED | AGENT
    const edge = fakeMaterial();
    c.patchEdgeMaterial(edge);
    const edgeShader = shaderWith(
      "  vec2 offset = vec2(0.0);\n  offset *= linewidth;",
    );
    edge.onBeforeCompile(edgeShader, null);
    expect(edgeShader.vertexShader).toContain(`(hlEdgeState ${mask}) != 0u`);
    const corners = fakeMaterial();
    c.patchVertexMaterial(corners, { cullUnhighlighted: true });
    const pointShader = shaderWith("  gl_PointSize = size;");
    corners.onBeforeCompile(pointShader, null);
    expect(pointShader.vertexShader).toContain(`(hlPtState ${mask}) != 0u`);
    c.dispose();
  });
});
