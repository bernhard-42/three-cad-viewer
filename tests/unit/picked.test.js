import { describe, it, expect, vi } from "vitest";
import { ComponentRegistry } from "../../src/rendering/id-picking.js";
import { HighlightController, HighlightFlag } from "../../src/rendering/highlight.js";
import { IdPicked, RaycastPicked } from "../../src/rendering/picked.js";

// Two faces + one edge of solid "/s", one standalone face, one standalone vertex.
function makeRegistry() {
  const reg = new ComponentRegistry();
  const ids = {
    f0: reg.register({ path: "/s/faces/faces_0", name: "faces_0", topo: "face", subtype: "solid", solidPath: "/s" }),
    f1: reg.register({ path: "/s/faces/faces_1", name: "faces_1", topo: "face", subtype: "solid", solidPath: "/s" }),
    e0: reg.register({ path: "/s/edges/edges_0", name: "edges_0", topo: "edge", subtype: "solid", solidPath: "/s" }),
    sf: reg.register({ path: "/f/faces/faces_0", name: "faces_0", topo: "face", subtype: null, solidPath: null }),
    sv: reg.register({ path: "/v/vertices/vertices_0", name: "vertices_0", topo: "vertex", subtype: null, solidPath: null }),
  };
  return { reg, ids };
}

const texByte = (ctl, id) => ctl.stateTexture.image.data[id];

describe("IdPicked", () => {
  function setup() {
    const { reg, ids } = makeRegistry();
    const ctl = new HighlightController(reg);
    ctl.resize(reg.maxId);
    return { reg, ids, ctl };
  }

  it("backendId is the component path (non-solid) or the solid path (fromSolid)", () => {
    const { reg, ids, ctl } = setup();
    const face = new IdPicked(reg.get(ids.sf), false, null, ctl);
    expect(face.backendId).toBe("/f/faces/faces_0");
    const solid = new IdPicked(reg.get(ids.f0), true, null, ctl);
    expect(solid.backendId).toBe("/s");
  });

  it("name and topo come from the ComponentInfo", () => {
    const { reg, ids, ctl } = setup();
    const v = new IdPicked(reg.get(ids.sv), false, null, ctl);
    expect(v.name).toBe("vertices_0");
    expect(v.topo).toBe("vertex");
  });

  it("highlight(true) sets the HOVER bit (single component) or whole solid faces", () => {
    const { reg, ids, ctl } = setup();
    new IdPicked(reg.get(ids.sf), false, null, ctl).highlight(true);
    expect(texByte(ctl, ids.sf) & HighlightFlag.HOVER).toBeTruthy();

    new IdPicked(reg.get(ids.f0), true, null, ctl).highlight(true);
    expect(texByte(ctl, ids.f0) & HighlightFlag.HOVER).toBeTruthy();
    expect(texByte(ctl, ids.f1) & HighlightFlag.HOVER).toBeTruthy(); // all solid faces
    expect(texByte(ctl, ids.e0) & HighlightFlag.HOVER).toBeFalsy(); // edges untouched
  });

  it("toggleSelection flips SELECTED for a single component", () => {
    const { reg, ids, ctl } = setup();
    const p = new IdPicked(reg.get(ids.sf), false, null, ctl);
    p.toggleSelection();
    expect(ctl.isSelected(ids.sf)).toBe(true);
    p.toggleSelection();
    expect(ctl.isSelected(ids.sf)).toBe(false);
  });

  it("solid toggleSelection selects ALL faces even if one was single-selected first (fix #3)", () => {
    const { reg, ids, ctl } = setup();
    // a single face was selected earlier
    ctl.setSelected(ids.f0, true);
    // solid pick that happens to resolve the SAME face f0 → must SELECT the whole solid
    new IdPicked(reg.get(ids.f0), true, null, ctl).toggleSelection();
    expect(ctl.isSelected(ids.f0)).toBe(true);
    expect(ctl.isSelected(ids.f1)).toBe(true);
    expect(ctl.isSolidSelected("/s")).toBe(true);
    // pick again → deselect the whole solid
    new IdPicked(reg.get(ids.f1), true, null, ctl).toggleSelection();
    expect(ctl.isSolidSelected("/s")).toBe(false);
    expect(ctl.isSelected(ids.f0)).toBe(false);
  });

  it("unhighlight(true) clears hover but keeps selection; (false) clears both", () => {
    const { reg, ids, ctl } = setup();
    const p = new IdPicked(reg.get(ids.sf), false, null, ctl);
    p.toggleSelection(); // SELECTED
    p.highlight(true); // + HOVER
    p.unhighlight(true);
    expect(texByte(ctl, ids.sf) & HighlightFlag.HOVER).toBeFalsy();
    expect(ctl.isSelected(ids.sf)).toBe(true);
    p.unhighlight(false);
    expect(ctl.isSelected(ids.sf)).toBe(false);
  });

  it("clearHighlights clears hover + selection", () => {
    const { reg, ids, ctl } = setup();
    const p = new IdPicked(reg.get(ids.sf), false, null, ctl);
    p.toggleSelection();
    p.highlight(true);
    p.clearHighlights();
    expect(ctl.isSelected(ids.sf)).toBe(false);
    expect(texByte(ctl, ids.sf) & HighlightFlag.HOVER).toBeFalsy();
  });

  it("equals: by id (non-solid), by solidPath (solid), false across topo/type/null", () => {
    const { reg, ids, ctl } = setup();
    const a = new IdPicked(reg.get(ids.sf), false, null, ctl);
    const aSame = new IdPicked(reg.get(ids.sf), false, null, ctl);
    const b = new IdPicked(reg.get(ids.f0), false, null, ctl);
    expect(a.equals(aSame)).toBe(true);
    expect(a.equals(b)).toBe(false);
    expect(a.equals(null)).toBe(false);

    // two different faces of the SAME solid compare equal (intentional divergence)
    const s0 = new IdPicked(reg.get(ids.f0), true, null, ctl);
    const s1 = new IdPicked(reg.get(ids.f1), true, null, ctl);
    expect(s0.equals(s1)).toBe(true);

    // a solid pick and a face pick of the same face are NOT equal (asSolid differs)
    const faceOfSolid = new IdPicked(reg.get(ids.f0), false, null, ctl);
    expect(s0.equals(faceOfSolid)).toBe(false);
  });
});

describe("RaycastPicked", () => {
  function mockObjectGroup(name, topo) {
    return {
      name,
      shapeInfo: { topo },
      highlight: vi.fn(),
      unhighlight: vi.fn(),
      toggleSelection: vi.fn(),
      clearHighlights: vi.fn(),
    };
  }
  function mockPicked(name, fromSolid, topo, solidFaces) {
    const og = mockObjectGroup(name, topo);
    const all = solidFaces ?? [og];
    return { picked: { obj: og, fromSolid, objs: () => all }, og, all };
  }

  it("backendId: delimiter→'/' (non-solid) and solid-suffix strip (fromSolid)", () => {
    const { picked: nonSolid } = mockPicked("/a/b|faces|faces_3", false, "face");
    expect(new RaycastPicked(nonSolid, "|").backendId).toBe("/a/b/faces/faces_3");
    const { picked: solid } = mockPicked("/a/b|faces|faces_3", true, "face");
    expect(new RaycastPicked(solid, "|").backendId).toBe("/a/b");
  });

  it("name is the last delimiter segment; topo from shapeInfo", () => {
    const { picked } = mockPicked("/a|edges|edges_7", false, "edge");
    const rp = new RaycastPicked(picked, "|");
    expect(rp.name).toBe("edges_7");
    expect(rp.topo).toBe("edge");
  });

  it("forwards highlight/unhighlight/toggleSelection/clearHighlights to every objs()", () => {
    const extra = mockObjectGroup("/s|faces|faces_1", "face");
    const { picked, og } = mockPicked("/s|faces|faces_0", true, "face", [
      // first is the picked face; include a second solid face
    ]);
    picked.objs = () => [og, extra];
    const rp = new RaycastPicked(picked, "|");
    rp.highlight(true);
    rp.toggleSelection();
    rp.clearHighlights();
    for (const o of [og, extra]) {
      expect(o.highlight).toHaveBeenCalledWith(true);
      expect(o.toggleSelection).toHaveBeenCalled();
      expect(o.clearHighlights).toHaveBeenCalled();
    }
  });

  it("equals by ObjectGroup name; false vs different name and vs IdPicked", () => {
    const { picked: p1 } = mockPicked("/s|faces|faces_0", false, "face");
    const p1b = { obj: { name: "/s|faces|faces_0", shapeInfo: { topo: "face" } }, fromSolid: false, objs: () => [] };
    const { picked: p2 } = mockPicked("/s|faces|faces_9", false, "face");
    const rp1 = new RaycastPicked(p1, "|");
    expect(rp1.equals(new RaycastPicked(p1b, "|"))).toBe(true);
    expect(rp1.equals(new RaycastPicked(p2, "|"))).toBe(false);

    const { reg, ids } = makeRegistry();
    const ctl = new HighlightController(reg);
    expect(rp1.equals(new IdPicked(reg.get(ids.sf), false, null, ctl))).toBe(false);
  });

  it("point is null (raycast path carries no hit point)", () => {
    const { picked } = mockPicked("/s|faces|faces_0", false, "face");
    expect(new RaycastPicked(picked, "|").point).toBeNull();
  });
});
