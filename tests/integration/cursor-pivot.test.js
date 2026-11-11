/**
 * Cursor pivot and zoom to cursor as the viewer wires them: the two options, the
 * pivot of a rotate drag, and the camera-target gesture that the pivot replaces.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import * as THREE from "three";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";
import { ObjectGroup } from "../../src/scene/objectgroup.js";
import { KeyMapper } from "../../src/utils/utils.js";
import {
  dotRadius,
  measureConeLength,
} from "../../src/tools/cad_tools/measure.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

/** Viewer with the boxes example rendered; returns its notifications as well. */
async function setup(viewerOptions = {}) {
  const notifications = [];
  testContext = setupViewer({
    notifyCallback: (changes) => notifications.push(changes),
  });
  const { viewer, renderOptions, viewerOptions: options } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, {
    ...options,
    ...viewerOptions,
  });
  notifications.length = 0;
  return { viewer, notifications };
}

const leaves = (viewer) =>
  Object.entries(viewer.rendered.nestedGroup.groups)
    .filter(([, group]) => group instanceof ObjectGroup)
    .map(([path]) => path);

describe("options", () => {
  test("both are on by default", async () => {
    const { viewer } = await setup();
    expect(viewer.getCursorPivot()).toBe(true);
    expect(viewer.getZoomToCursor()).toBe(true);
    const controls = viewer.rendered.controls.controls;
    expect(controls.pivotPicker).not.toBeNull();
    expect(controls.zoomToCursor).toBe(true);
  });

  test("the viewer options switch them separately", async () => {
    const off = await setup({ cursorPivot: false });
    expect(off.viewer.rendered.controls.controls.pivotPicker).toBeNull();
    expect(off.viewer.rendered.controls.controls.zoomToCursor).toBe(true);
    cleanup(testContext);

    const noZoom = await setup({ zoomToCursor: false });
    expect(noZoom.viewer.rendered.controls.controls.pivotPicker).not.toBeNull();
    expect(noZoom.viewer.rendered.controls.controls.zoomToCursor).toBe(false);
  });

  test("the setters switch them separately and notify", async () => {
    const { viewer, notifications } = await setup();
    const controls = viewer.rendered.controls.controls;

    viewer.setZoomToCursor(false);
    expect(controls.zoomToCursor).toBe(false);
    expect(controls.pivotPicker).not.toBeNull();
    expect(viewer.getZoomToCursor()).toBe(false);
    expect(notifications.at(-1).zoom_to_cursor.new).toBe(false);

    viewer.setCursorPivot(false);
    expect(controls.pivotPicker).toBeNull();
    expect(controls.zoomToCursor).toBe(false);
    expect(viewer.getCursorPivot()).toBe(false);
    expect(notifications.at(-1).cursor_pivot.new).toBe(false);
  });

  test("the info box lists the settings at start, and each change once", async () => {
    const { viewer } = await setup({ control: "trackball" });
    const info = viewer.display._info;
    const text = () => info.html.textContent.replace(/\s+/g, " ");
    const rows = [...info.html.querySelectorAll(".small_table tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent.trim()),
    );
    expect(viewer.state.get("control")).toBe("trackball");
    expect(rows.slice(1, 4)).toEqual([
      ["Control", "trackball"],
      ["- rotate", "around pivot"],
      ["- zoom", "to cursor"],
    ]);
    const entries = info.chunks.length;

    viewer.setCursorPivot(false);
    viewer.setCursorPivot(false); // no change, no entry
    viewer.setZoomToCursor(false);
    viewer.setHolroyd(false);

    expect(info.chunks.length).toBe(entries + 3);
    expect(text()).toContain("rotation control: around target");
    expect(text()).toContain("zoom control: to center");
    expect(text()).toContain("control: tumbler");
  });

  test("setHolroyd with orbit controls throws and changes nothing", async () => {
    const { viewer, notifications } = await setup({ control: "orbit" });
    const info = viewer.display._info;
    const entries = info.chunks.length;
    const sent = notifications.length;
    expect(viewer.getHolroyd()).toBe(true);

    expect(() => viewer.setHolroyd(false)).toThrow(
      "Operation requires TrackballControls",
    );

    expect(viewer.getHolroyd()).toBe(true);
    expect(notifications.length).toBe(sent);
    expect(info.chunks.length).toBe(entries);
  });
});

describe("pivot of a rotate drag", () => {
  /** The pivot for a drag starting off the model. */
  const onBackground = (viewer) => {
    vi.spyOn(viewer.pickingController, "pointAt").mockReturnValue(null);
    return viewer.rendered.controls.controls.pivotPicker(10, 10);
  };

  test("on the model: the point under the cursor", async () => {
    const { viewer } = await setup();
    const point = new THREE.Vector3(1, 2, 3);
    vi.spyOn(viewer.pickingController, "pointAt").mockReturnValue(point);
    expect(viewer.rendered.controls.controls.pivotPicker(10, 10)).toBe(point);
  });

  test("on the background: the centre of the visible objects", async () => {
    const { viewer } = await setup();
    const all = onBackground(viewer);
    expect(all.toArray()).toEqual(viewer.bbox.center());

    // hiding an object moves the centre to that of the remaining ones
    const [hidden, ...rest] = leaves(viewer);
    expect(rest.length).toBeGreaterThan(0);
    viewer.setState(hidden, [0, 0]);
    const visible = onBackground(viewer);
    expect(visible.distanceTo(all)).toBeGreaterThan(1e-3);

    const expected = new THREE.Box3();
    for (const path of rest) {
      expected.expandByObject(
        viewer.rendered.nestedGroup.groups[path].children[0],
      );
    }
    const center = expected.getCenter(new THREE.Vector3());
    expect(visible.distanceTo(center)).toBeLessThan(1e-3);
  });

  test("the centre does not depend on the view", async () => {
    const { viewer } = await setup();
    const before = onBackground(viewer);
    // pan far away, so that the centre is out of the view
    const camera = viewer.rendered.camera.getCamera();
    const off = new THREE.Vector3(1000, 1000, 0);
    camera.position.add(off);
    viewer.rendered.controls.getTarget().add(off);
    camera.updateMatrixWorld();
    expect(Math.abs(before.clone().project(camera).x)).toBeGreaterThan(1);
    expect(onBackground(viewer).toArray()).toEqual(before.toArray());
  });

  test("with nothing visible: the target", async () => {
    const { viewer } = await setup();
    for (const path of leaves(viewer)) viewer.setState(path, [0, 0]);
    expect(onBackground(viewer)).toBeNull();
  });
});

describe("setting the camera target by hand", () => {
  const modifiers = () => {
    const config = KeyMapper.get_config();
    return { [config.shift]: true, [config.meta]: true };
  };

  /** Shift+meta double-click on the canvas, on the first object. */
  const shiftMetaDoubleClick = (viewer) => {
    const info = [...viewer.rendered.nestedGroup.registry.entries()][0];
    vi.spyOn(viewer.idPicker, "pickAt").mockReturnValue({
      id: info.id,
      info,
      point: new THREE.Vector3(1, 2, 3),
    });
    const el = viewer.renderer.domElement;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
    });
    el.dispatchEvent(
      new MouseEvent("dblclick", { clientX: 50, clientY: 50, ...modifiers() }),
    );
  };

  const helpRow = (viewer) =>
    viewer.display.container.querySelector(".tcv_help_camera_target");

  test("with the cursor pivot on, the double-click does nothing", async () => {
    const { viewer, notifications } = await setup();
    const target = vi.spyOn(viewer, "setCameraTarget");
    const center = vi.spyOn(viewer.display, "showCenterInfo");
    shiftMetaDoubleClick(viewer);
    expect(target).not.toHaveBeenCalled();
    expect(center).not.toHaveBeenCalled();
    expect(notifications.filter((n) => n.lastPick !== undefined)).toEqual([]);
  });

  test("with the cursor pivot off, it sets the target", async () => {
    const { viewer } = await setup({ cursorPivot: false });
    const target = vi.spyOn(viewer, "setCameraTarget");
    shiftMetaDoubleClick(viewer);
    expect(target).toHaveBeenCalledWith(new THREE.Vector3(1, 2, 3));
  });

  test("shift+meta on a tree label still hides the others", async () => {
    const { viewer } = await setup();
    const [shown, other] = leaves(viewer);
    const slash = shown.lastIndexOf("/");
    viewer.handlePick(
      shown.slice(0, slash),
      shown.slice(slash + 1),
      true,
      true,
      false,
      null,
      "leaf",
      true,
    );
    expect(viewer.getState(shown)).toEqual([1, 1]);
    expect(viewer.getState(other)).toEqual([0, 0]);
  });

  test("the help lists it only with the cursor pivot off", async () => {
    const { viewer } = await setup();
    expect(helpRow(viewer).style.display).toBe("none");
    viewer.setCursorPivot(false);
    expect(helpRow(viewer).style.display).toBe("");
    viewer.setCursorPivot(true);
    expect(helpRow(viewer).style.display).toBe("none");
  });
});

describe("pivot sphere", () => {
  /** Start a left-button rotate drag whose pivot is `point`. */
  const startDrag = (viewer, point) => {
    vi.spyOn(viewer.pickingController, "pointAt").mockReturnValue(point);
    viewer.rendered.controls.controls._onMouseDown(
      new MouseEvent("mousedown", { button: 0, clientX: 10, clientY: 10 }),
    );
  };
  const endDrag = (viewer) =>
    viewer.rendered.controls.controls.dispatchEvent({ type: "end" });

  /** World radius of the measure tool's zero-distance dot at the target. */
  const measureDot = (viewer) =>
    dotRadius(
      measureConeLength(
        viewer.bb_radius,
        viewer.state.get("cadWidth"),
        viewer.state.get("height"),
      ),
    ) / viewer.rendered.camera.getZoom();

  test.each(["orbit", "trackball"])(
    "%s: a rotate mouse-down fires start and picks the pivot",
    async (control) => {
      const { viewer } = await setup({ control });
      const start = vi.fn();
      viewer.rendered.controls.controls.addEventListener("start", start);
      const point = new THREE.Vector3(1, 2, 3);
      startDrag(viewer, point);
      expect(start).toHaveBeenCalledTimes(1);
      expect(viewer.rendered.controls.getPivot()).toBe(point);
    },
  );

  test.each(["orbit", "trackball"])(
    "%s: drawn at the pivot during the drag, and end repaints without it",
    async (control) => {
      const { viewer } = await setup({ control });
      const render = vi.spyOn(viewer.rendered.pivotMarker, "render");
      const point = new THREE.Vector3(1, 2, 3);
      startDrag(viewer, point);
      viewer.update(true);
      expect(render).toHaveBeenCalledTimes(1);
      expect(render.mock.calls[0][2]).toBe(point);

      const update = vi.spyOn(viewer, "update");
      endDrag(viewer);
      expect(update).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
      viewer.update(true);
      expect(render).toHaveBeenCalledTimes(1);
    },
  );

  test("nothing is drawn, and end does not repaint, without a pivot", async () => {
    const { viewer } = await setup({ cursorPivot: false });
    const render = vi.spyOn(viewer.rendered.pivotMarker, "render");
    startDrag(viewer, new THREE.Vector3(1, 2, 3));
    expect(viewer.rendered.controls.getPivot()).toBeNull();
    viewer.update(true);
    expect(render).not.toHaveBeenCalled();
    const update = vi.spyOn(viewer, "update");
    endDrag(viewer);
    expect(update).not.toHaveBeenCalled();
  });

  test("orthographic: the size of the measure tool's dot", async () => {
    const { viewer } = await setup({ ortho: true });
    viewer.setCameraZoom(2.5);
    const render = vi.spyOn(viewer.rendered.pivotMarker, "render");
    startDrag(viewer, new THREE.Vector3(1, 2, 3));
    viewer.update(true);
    expect(render.mock.calls[0][3]).toBeCloseTo(measureDot(viewer), 9);
  });

  test("perspective: the dot's size on screen at the pivot's depth", async () => {
    const { viewer } = await setup({ ortho: false });
    const camera = viewer.rendered.camera.getCamera();
    const target = viewer.rendered.controls.getTarget();
    // a pivot half way from the camera to the target
    const point = camera.position.clone().lerp(target, 0.5);
    const render = vi.spyOn(viewer.rendered.pivotMarker, "render");
    startDrag(viewer, point);
    viewer.update(true);
    expect(render.mock.calls[0][3]).toBeCloseTo(measureDot(viewer) * 0.5, 9);
  });
});
