/**
 * Double-click pick: picks what hover shows (topo filter, solid mode), reports the
 * picked component and point in `lastPick` on every double-click, and boxes the
 * picked face or edge (a vertex gets a marker).
 *
 * WebGL is mocked, so the GPU id picker is stubbed with results built from the
 * real component registry.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import * as THREE from "three";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";
import { BoxHelper, PointMarker } from "../../src/scene/bbox.js";
import { TopoFilter } from "../../src/rendering/id-picking.js";
import { KeyMapper } from "../../src/utils/utils.js";

const SOLID = "/Group/Workplane(Solid)";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

/** Viewer with box1 (a unit cube solid) rendered, and its lastPick notifications. */
async function setup() {
  const picks = [];
  testContext = setupViewer({
    notifyCallback: (changes) => {
      if (changes.lastPick !== undefined) picks.push(changes.lastPick.new);
    },
  });
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("box1"), renderOptions, viewerOptions);
  vi.spyOn(viewer.renderer.domElement, "getBoundingClientRect").mockReturnValue(
    { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
  );
  return { viewer, picks };
}

/** The registry entry of a component. */
function component(viewer, path) {
  for (const info of viewer.rendered.nestedGroup.registry.entries()) {
    if (info.path === path) return info;
  }
  throw new Error(`no component ${path}`);
}

/** Let the stubbed picker return `info` (or nothing) at any position. */
function stubPick(viewer, info, point = null) {
  return vi
    .spyOn(viewer.idPicker, "pickAt")
    .mockImplementation(() =>
      info === null ? null : { id: info.id, info, point },
    );
}

function doubleClick(viewer, modifiers = {}) {
  viewer.renderer.domElement.dispatchEvent(
    new MouseEvent("dblclick", { clientX: 50, clientY: 50, ...modifiers }),
  );
}

/** The event flag of the physical key a logical modifier is mapped to. */
function modifier(name) {
  return { [KeyMapper.get_config()[name]]: true };
}

function setFilter(viewer, filter) {
  viewer.display.shapeFilterDropDownMenu.currentFilter = [filter];
}

const boxOf = (pick) => [
  [pick.boundingBox.min.x, pick.boundingBox.min.y, pick.boundingBox.min.z],
  [pick.boundingBox.max.x, pick.boundingBox.max.y, pick.boundingBox.max.z],
];

describe("double-click picks like hover", () => {
  test("uses the shape filter of hover", async () => {
    const { viewer } = await setup();
    const pickAt = stubPick(
      viewer,
      component(viewer, `${SOLID}/edges/edges_0`),
    );
    setFilter(viewer, TopoFilter.edge);
    doubleClick(viewer);
    expect(pickAt).toHaveBeenCalledWith(50, 50, { topoFilter: ["edge"] });

    setFilter(viewer, TopoFilter.none);
    doubleClick(viewer);
    expect(pickAt).toHaveBeenLastCalledWith(50, 50, {});
  });

  test("a hidden component is not picked", async () => {
    const { viewer, picks } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    viewer.setState(SOLID, [0, 0]);
    doubleClick(viewer);
    expect(picks).toEqual([]);
  });

  test("meta on empty space shows the last hidden object", async () => {
    const { viewer } = await setup();
    const show = vi.spyOn(viewer, "showLastHidden");
    stubPick(viewer, null);
    doubleClick(viewer, modifier("meta"));
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe("hide, isolate and recentre ignore the shape filter", () => {
  /** The edge filter is on, the cursor is over a face: only an unfiltered pick finds it. */
  async function faceExcludedByFilter() {
    const { viewer, picks } = await setup();
    const face = component(viewer, `${SOLID}/faces/faces_0`);
    const pickAt = vi
      .spyOn(viewer.idPicker, "pickAt")
      .mockImplementation((x, y, opts) =>
        opts.topoFilter === undefined
          ? { id: face.id, info: face, point: new THREE.Vector3(-0.5, 0, 0) }
          : null,
      );
    setFilter(viewer, TopoFilter.edge);
    return { viewer, picks, pickAt };
  }

  test("a plain double-click there picks nothing", async () => {
    const { viewer, picks } = await faceExcludedByFilter();
    doubleClick(viewer);
    expect(picks).toEqual([]);
    expect(viewer.lastBbox).toBeNull();
  });

  test("Cmd hides the solid and reports it with its box", async () => {
    const { viewer, picks, pickAt } = await faceExcludedByFilter();
    const show = vi.spyOn(viewer, "showLastHidden");
    doubleClick(viewer, modifier("meta"));
    expect(pickAt).toHaveBeenLastCalledWith(50, 50, {});
    expect(viewer.getState(SOLID)).toEqual([0, 0]);
    expect(show).not.toHaveBeenCalled();
    expect(picks).toHaveLength(1);
    expect(picks[0].component).toBe(SOLID);
    expect(picks[0].point).toEqual([-0.5, 0, 0]);
    const [min, max] = boxOf(picks[0]);
    expect(min.map((v) => v.toFixed(6))).toEqual([
      "-0.500000",
      "-0.500000",
      "-0.500000",
    ]);
    expect(max.map((v) => v.toFixed(6))).toEqual([
      "0.500000",
      "0.500000",
      "0.500000",
    ]);
  });

  test("Shift isolates the solid and reports it", async () => {
    const { viewer, picks, pickAt } = await faceExcludedByFilter();
    viewer.setState(SOLID, [0, 0]);
    viewer.setState(SOLID, [1, 0]);
    doubleClick(viewer, modifier("shift"));
    expect(pickAt).toHaveBeenLastCalledWith(50, 50, {});
    expect(viewer.getState(SOLID)).toEqual([1, 1]);
    expect(picks[0].component).toBe(SOLID);
  });

  test("with the cursor pivot off, Shift+Cmd recentres on the solid's point", async () => {
    const { viewer, picks } = await faceExcludedByFilter();
    viewer.setCursorPivot(false);
    const target = vi.spyOn(viewer, "setCameraTarget");
    const info = vi.spyOn(viewer.display, "showTargetPointInfo");
    doubleClick(viewer, { ...modifier("meta"), ...modifier("shift") });
    expect(target).toHaveBeenCalledWith(new THREE.Vector3(-0.5, 0, 0));
    // the info box reports the point that was set
    expect(info).toHaveBeenCalledWith([-0.5, 0, 0]);
    expect(picks[0].component).toBe(SOLID);
  });

  test("with the cursor pivot off and no clicked point, Shift+Cmd uses the box center", async () => {
    const { viewer } = await setup();
    viewer.setCursorPivot(false);
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`), null);
    const target = vi.spyOn(viewer, "setCameraTarget");
    const center = vi.spyOn(viewer.display, "showCenterInfo");
    const point = vi.spyOn(viewer.display, "showTargetPointInfo");
    doubleClick(viewer, { ...modifier("meta"), ...modifier("shift") });
    const box = viewer.bbox.center();
    expect(target).toHaveBeenCalledWith(new THREE.Vector3(...box));
    expect(center).toHaveBeenCalledWith(box);
    expect(point).not.toHaveBeenCalled();
  });

  test("with the cursor pivot on, Shift+Cmd does nothing", async () => {
    const { viewer, picks } = await faceExcludedByFilter();
    const target = vi.spyOn(viewer, "setCameraTarget");
    doubleClick(viewer, { ...modifier("meta"), ...modifier("shift") });
    expect(target).not.toHaveBeenCalled();
    expect(picks).toEqual([]);
  });
});

describe("lastPick reports component and point", () => {
  test("a face inside the solid: its path, the point and its box", async () => {
    const { viewer, picks } = await setup();
    const face = component(viewer, `${SOLID}/faces/faces_0`);
    stubPick(viewer, face, new THREE.Vector3(-0.5, 0.1, 0.2));
    doubleClick(viewer);

    expect(picks).toHaveLength(1);
    const pick = picks[0];
    expect(pick.path).toBe("/Group");
    expect(pick.name).toBe("Workplane(Solid)");
    expect(pick.component).toBe(`${SOLID}/faces/faces_0`);
    expect(pick.point).toEqual([-0.5, 0.1, 0.2]);
    // the cube is [-0.5, 0.5]^3; a face's box is flat in one direction
    const [min, max] = boxOf(pick);
    const sizes = [0, 1, 2].map((i) => max[i] - min[i]);
    expect(sizes.filter((s) => s < 1e-9)).toHaveLength(1);
    expect(sizes.filter((s) => Math.abs(s - 1) < 1e-6)).toHaveLength(2);
  });

  test("every double-click sends lastPick, also on the same component", async () => {
    const { viewer, picks } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    doubleClick(viewer);
    doubleClick(viewer);
    doubleClick(viewer);
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => p.point === null)).toBe(true);
  });

  test("solid mode reports the solid with the object's box", async () => {
    const { viewer, picks } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    setFilter(viewer, TopoFilter.solid);
    doubleClick(viewer);
    expect(picks[0].component).toBe(SOLID);
    const [min, max] = boxOf(picks[0]);
    expect(min.map((v) => v.toFixed(6))).toEqual([
      "-0.500000",
      "-0.500000",
      "-0.500000",
    ]);
    expect(max.map((v) => v.toFixed(6))).toEqual([
      "0.500000",
      "0.500000",
      "0.500000",
    ]);
    expect(viewer.lastBbox.component).toBe(SOLID);
  });

  test("a vertex: box of size zero and sphere radius zero", async () => {
    const { viewer, picks } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/vertices/vertices_0`));
    doubleClick(viewer);
    const [min, max] = boxOf(picks[0]);
    expect(min).toEqual(max);
    expect(picks[0].boundingSphere.radius).toBe(0);
  });

  test("no point while parts may be displaced", async () => {
    const { viewer, picks } = await setup();
    stubPick(
      viewer,
      component(viewer, `${SOLID}/faces/faces_0`),
      new THREE.Vector3(1, 2, 3),
    );
    viewer.zScale = 2;
    doubleClick(viewer);
    expect(picks[0].point).toBeNull();
    viewer.zScale = 1;
    doubleClick(viewer);
    expect(picks[1].point).toEqual([1, 2, 3]);
  });

  test("a click in the tree reports the tree node and no point", async () => {
    const { viewer, picks } = await setup();
    viewer.handlePick(
      "/Group",
      "Workplane(Solid)",
      false,
      false,
      false,
      null,
      "leaf",
      true,
    );
    expect(picks[0].component).toBe(SOLID);
    expect(picks[0].point).toBeNull();
  });
});

describe("the pick box wraps the picked component", () => {
  test("a face gets its own box, a second double-click toggles it off", async () => {
    const { viewer } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    doubleClick(viewer);
    expect(viewer.lastBbox.id).toBe(SOLID);
    expect(viewer.lastBbox.component).toBe(`${SOLID}/faces/faces_0`);
    expect(viewer.lastBbox.bbox).toBeInstanceOf(BoxHelper);
    expect(viewer.rendered.scene.children).toContain(viewer.lastBbox.bbox);
    expect(viewer.rendered.treeview.lastLabel).not.toBeNull();

    doubleClick(viewer);
    expect(viewer.lastBbox).toBeNull();
    expect(viewer.rendered.treeview.lastLabel).toBeNull();
  });

  test("another face of the same solid moves the box, the tree label stays", async () => {
    const { viewer } = await setup();
    const spy = stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    doubleClick(viewer);
    const first = viewer.lastBbox.bbox;
    const face = component(viewer, `${SOLID}/faces/faces_1`);
    spy.mockImplementation(() => ({ id: face.id, info: face, point: null }));
    doubleClick(viewer);
    expect(viewer.lastBbox.component).toBe(`${SOLID}/faces/faces_1`);
    expect(viewer.rendered.scene.children).not.toContain(first);
    expect(viewer.rendered.treeview.lastLabel).not.toBeNull();
  });

  test("an edge gets its own box", async () => {
    const { viewer, picks } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/edges/edges_0`));
    doubleClick(viewer);
    expect(viewer.lastBbox.bbox).toBeInstanceOf(BoxHelper);
    // an edge of the cube: one direction 1 long, the others zero
    const [min, max] = boxOf(picks[0]);
    const sizes = [0, 1, 2].map((i) => max[i] - min[i]);
    expect(sizes.filter((s) => s < 1e-9)).toHaveLength(2);
  });

  test("a vertex gets a marker and the info shows its position", async () => {
    const { viewer, picks } = await setup();
    const show = vi.spyOn(viewer.display, "showPointInfo");
    stubPick(viewer, component(viewer, `${SOLID}/vertices/vertices_0`));
    doubleClick(viewer);
    expect(viewer.lastBbox.bbox).toBeInstanceOf(PointMarker);
    // the CAD faces are transparent: an opaque marker would be drawn before them
    // and covered
    expect(viewer.lastBbox.bbox.material.transparent).toBe(true);
    const [min] = boxOf(picks[0]);
    expect(show).toHaveBeenCalledWith(
      "/Group",
      "Workplane(Solid)",
      "vertices/vertices_0",
      min,
    );
    const marked = viewer.lastBbox.bbox.geometry.getAttribute("position");
    expect([marked.getX(0), marked.getY(0), marked.getZ(0)]).toEqual(min);
  });

  test("the box follows the solid when it moves", async () => {
    const { viewer } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    doubleClick(viewer);
    const box = viewer.lastBbox.bbox;
    const xs = () => {
      const p = box.geometry.getAttribute("position");
      return [...Array(p.count).keys()].map((i) => p.getX(i));
    };
    const before = xs();
    viewer.rendered.nestedGroup.groups[SOLID].position.x += 10;
    box.update();
    expect(xs()).toEqual(before.map((x) => x + 10));
  });

  test("the box is disposed when removed", async () => {
    const { viewer } = await setup();
    stubPick(viewer, component(viewer, `${SOLID}/faces/faces_0`));
    doubleClick(viewer);
    const { bbox, proxy } = viewer.lastBbox;
    const disposeProxy = vi.spyOn(proxy, "dispose");
    const disposeMaterial = vi.spyOn(bbox.material, "dispose");
    viewer.removeLastBbox();
    expect(disposeProxy).toHaveBeenCalled();
    expect(disposeMaterial).toHaveBeenCalled();
    expect(viewer.rendered.scene.children).not.toContain(bbox);
  });
});
