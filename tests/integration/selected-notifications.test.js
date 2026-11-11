/**
 * The `selected` notification follows the select tool's list: switching the tool
 * off and Escape report the empty selection once, Backspace reports the rest, and
 * restoring a selection reports it once.
 */
import { describe, test, expect, afterEach } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

/** Select tool on, three edges selected; returns the `selected` values sent after that. */
async function setup() {
  const notifications = [];
  testContext = setupViewer({
    notifyCallback: (changes) => notifications.push(changes),
  });
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
  viewer.display.setTool("select", true);
  const edges = [...viewer.rendered.nestedGroup.registry.entries()]
    .filter((e) => e.topo === "edge")
    .slice(0, 3)
    .map((e) => e.path);
  viewer.setSelection(edges);
  notifications.length = 0;
  const selected = () =>
    notifications.filter((n) => "selected" in n).map((n) => n.selected.new);
  return { viewer, edges, selected };
}

const list = (viewer) => viewer.cadTools.selectObject.selectedShapes;

describe("selected notifications", () => {
  test("switching the select tool off reports the empty selection once", async () => {
    const { viewer, selected } = await setup();
    viewer.display.setTool("select", false);
    expect(list(viewer)).toEqual([]);
    expect(selected()).toEqual([{}]);
  });

  test("Escape reports the empty selection once", async () => {
    const { viewer, selected } = await setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(list(viewer)).toEqual([]);
    expect(selected()).toEqual([{}]);
  });

  test("Backspace reports the remaining selection", async () => {
    const { viewer, selected } = await setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    expect(list(viewer)).toHaveLength(2);
    expect(selected()).toHaveLength(1);
    expect(Object.values(selected()[0]).flat()).toHaveLength(2);
  });

  test("restoring a selection reports it once, without an empty one first", async () => {
    const { viewer, edges, selected } = await setup();
    viewer.setSelection([edges[0]]);
    expect(selected()).toHaveLength(1);
    const kind = edges[0].slice(0, edges[0].lastIndexOf("/"));
    const index = Number(edges[0].slice(edges[0].lastIndexOf("_") + 1));
    expect(selected()[0]).toEqual({ [kind]: [index] });
  });
});
