/**
 * Every key the viewer acts on arrives default-prevented, and a key it does not act
 * on is left alone. build123d Studio shows the viewer in macOS's WebKit view, which
 * plays the system beep for every keydown the page leaves unhandled, so a key that
 * did something must not reach it unhandled.
 *
 * The keys are enumerated, not sampled: every action of the default keymap, the
 * filter letters, and Escape and Backspace in every state a handler acts on them.
 */
import { describe, test, expect, afterEach } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";
import { KeyMapper } from "../../src/utils/utils.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

/** Viewer with the boxes example and the shape filter shown. */
async function setup(options = {}) {
  testContext = setupViewer({});
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, {
    ...viewerOptions,
    ...options,
  });
  menu(viewer).show(true);
  return viewer;
}

const menu = (viewer) => viewer.display.shapeFilterDropDownMenu;
const selected = (viewer) => viewer.cadTools.selectObject.selectedShapes;

/** Press a key on the viewer's container (the viewer has focus); returns the event. */
function press(viewer, key, init = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  viewer.display.container.dispatchEvent(event);
  return event;
}

/** Select tool on with three edges selected. */
function selectThreeEdges(viewer) {
  viewer.display.setTool("select", true);
  const edges = [...viewer.rendered.nestedGroup.registry.entries()]
    .filter((e) => e.topo === "edge")
    .slice(0, 3)
    .map((e) => e.path);
  viewer.setSelection(edges);
  expect(selected(viewer)).toHaveLength(3);
}

function openDropdown(viewer) {
  viewer.display.filterDropdown.content.click();
  expect(menu(viewer).isOpen()).toBe(true);
}

describe("keys the viewer acts on are marked handled", () => {
  test("every action of the default keymap", async () => {
    const viewer = await setup();
    const shortcuts = Object.entries(KeyMapper.getActionShortcuts());
    cleanup(testContext);
    testContext = null;
    expect(shortcuts.length).toBeGreaterThan(20);

    const unhandled = [];
    for (const [action, key] of shortcuts) {
      const fresh = await setup();
      if (!press(fresh, key).defaultPrevented)
        unhandled.push(`${action} (${key})`);
      cleanup(testContext);
      testContext = null;
    }
    expect(viewer).toBeDefined();
    expect(unhandled).toEqual([]);
  });

  test.each(["a", "v", "e", "f", "s"])("filter key %s", async (key) => {
    const viewer = await setup();
    expect(press(viewer, key).defaultPrevented).toBe(true);
  });

  test.each(["select", "distance", "properties"])(
    "Escape and Backspace with the %s tool on",
    async (tool) => {
      const viewer = await setup();
      viewer.display.setTool(tool, true);
      expect(press(viewer, "Escape").defaultPrevented).toBe(true);
      expect(press(viewer, "Backspace").defaultPrevented).toBe(true);
    },
  );

  test("Escape with the select tool clears the selection", async () => {
    const viewer = await setup();
    selectThreeEdges(viewer);
    expect(press(viewer, "Escape").defaultPrevented).toBe(true);
    expect(selected(viewer)).toHaveLength(0);
  });

  test("Backspace with the select tool removes the last selected element", async () => {
    const viewer = await setup();
    selectThreeEdges(viewer);
    expect(press(viewer, "Backspace").defaultPrevented).toBe(true);
    expect(selected(viewer)).toHaveLength(2);
  });

  test("Escape closes an open filter dropdown without a tool", async () => {
    const viewer = await setup();
    openDropdown(viewer);
    expect(press(viewer, "Escape").defaultPrevented).toBe(true);
    expect(menu(viewer).isOpen()).toBe(false);
  });

  // The filter's key listener is added when the filter is shown; showing it again
  // after the tool is switched on puts it after the select keys' listener. Escape
  // must close only the dropdown in both orders.
  test.each([
    ["filter listener first", false],
    ["select listener first", true],
  ])(
    "Escape with a tool on and the dropdown open closes only the dropdown (%s)",
    async (_, reshowFilter) => {
      const viewer = await setup();
      selectThreeEdges(viewer);
      if (reshowFilter) {
        menu(viewer).show(false);
        menu(viewer).show(true);
      }
      openDropdown(viewer);
      expect(press(viewer, "Escape").defaultPrevented).toBe(true);
      expect(menu(viewer).isOpen()).toBe(false);
      expect(selected(viewer)).toHaveLength(3);
      // the next Escape clears the selection
      expect(press(viewer, "Escape").defaultPrevented).toBe(true);
      expect(selected(viewer)).toHaveLength(0);
    },
  );

  test("Escape closes the help, also with a tool on, and keeps the selection", async () => {
    const viewer = await setup();
    selectThreeEdges(viewer);
    viewer.display.showHelp(true);
    expect(press(viewer, "Escape").defaultPrevented).toBe(true);
    expect(viewer.display.help_shown).toBe(false);
    expect(selected(viewer)).toHaveLength(3);
  });

  test("Escape closes the material editor", async () => {
    const viewer = await setup();
    const dialog = viewer.display.container.querySelector(".tcv_mat_editor");
    dialog.style.display = "block";
    expect(press(viewer, "Escape").defaultPrevented).toBe(true);
    expect(dialog.style.display).toBe("none");
  });
});

describe("keys the viewer does not act on are left alone", () => {
  test.each(["q", "d"])(
    "unbound key %s, with and without a tool",
    async (key) => {
      const viewer = await setup();
      expect(press(viewer, key).defaultPrevented).toBe(false);
      viewer.display.setTool("select", true);
      expect(press(viewer, key).defaultPrevented).toBe(false);
    },
  );

  test("Backspace without a tool", async () => {
    const viewer = await setup();
    expect(press(viewer, "Backspace").defaultPrevented).toBe(false);
  });

  test("filter keys with the filter hidden", async () => {
    const viewer = await setup();
    menu(viewer).show(false);
    expect(press(viewer, "v").defaultPrevented).toBe(false);
  });
});

describe("trackball controls ignore held keys", () => {
  // three's TrackballControls turns a held a/s/d into a rotate/zoom/pan drag through
  // window listeners that see keys typed anywhere on the page; the viewer removes them.
  test.each([
    ["a", "KeyA"],
    ["s", "KeyS"],
    ["d", "KeyD"],
  ])("%s does not change the drag mode", async (key, code) => {
    const viewer = await setup({ control: "trackball" });
    const controls = viewer.controls.controls;
    const none = controls.keyState;
    press(viewer, key, { code });
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code }));
    expect(controls.keyState).toBe(none);
  });
});
