/**
 * Restoring the user's selection from a list of paths (V9 end_preview(discard)):
 * the select tool's list, the highlight and one `selected` notification, as if the
 * user had clicked the components. Only with the select tool on.
 */
import { describe, test, expect, afterEach } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";
import { HighlightFlag } from "../../src/rendering/highlight.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

async function setup({ selectTool = true } = {}) {
  const notifications = [];
  testContext = setupViewer({
    notifyCallback: (changes) => notifications.push(changes),
  });
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
  if (selectTool) viewer.display.setTool("select", true);
  notifications.length = 0;
  return { viewer, notifications };
}

/** Highlight bits, a solid with its faces, two edges of other objects. */
function scene(viewer) {
  const highlight = viewer.rendered.nestedGroup.highlight;
  const entries = [...viewer.rendered.nestedGroup.registry.entries()];
  const face = entries.find((e) => e.topo === "face" && e.solidPath !== null);
  const solidPath = face.solidPath;
  const solidFaces = entries.filter(
    (e) => e.solidPath === solidPath && e.topo === "face",
  );
  const edges = entries.filter(
    (e) => e.topo === "edge" && e.solidPath !== solidPath,
  );
  const bits = (info) => highlight.stateTexture.image.data[info.id];
  return { highlight, solidPath, solidFaces, edges, bits, entries };
}

const selectedChanges = (notifications) =>
  notifications.filter((n) => "selected" in n);
const shapes = (viewer) =>
  viewer.cadTools.selectObject.selectedShapes.map((s) => s.backendId);

describe("restore a selection", () => {
  test("without the select tool it throws and changes nothing", async () => {
    const { viewer, notifications } = await setup({ selectTool: false });
    const { edges, bits } = scene(viewer);
    expect(() => viewer.setSelection([edges[0].path])).toThrow(/select tool/);
    expect(bits(edges[0])).toBe(HighlightFlag.NONE);
    expect(selectedChanges(notifications)).toEqual([]);
  });

  test("selects components and whole solids, with one notification", async () => {
    const { viewer, notifications } = await setup();
    const { edges, solidPath, solidFaces, bits } = scene(viewer);
    const unknown = viewer.setSelection([edges[0].path, solidPath]);
    expect(unknown).toEqual([]);
    expect(bits(edges[0])).toBe(HighlightFlag.SELECTED);
    for (const f of solidFaces) expect(bits(f)).toBe(HighlightFlag.SELECTED);
    expect(shapes(viewer)).toEqual([edges[0].path, solidPath]);
    expect(selectedChanges(notifications)).toHaveLength(1);
  });

  test("unknown paths are returned, the others applied", async () => {
    const { viewer } = await setup();
    const { edges, bits } = scene(viewer);
    const unknown = viewer.setSelection(["/nope", edges[0].path]);
    expect(unknown).toEqual(["/nope"]);
    expect(bits(edges[0])).toBe(HighlightFlag.SELECTED);
    expect(shapes(viewer)).toEqual([edges[0].path]);
  });

  test("replaces the previous selection and keeps the agent marks", async () => {
    const { viewer } = await setup();
    const { edges, bits } = scene(viewer);
    viewer.setAgentHighlight([edges[1].path]);
    viewer.setSelection([edges[0].path, edges[1].path]);
    viewer.setSelection([edges[2].path]);
    expect(bits(edges[0])).toBe(HighlightFlag.NONE);
    expect(bits(edges[1])).toBe(HighlightFlag.AGENT);
    expect(bits(edges[2])).toBe(HighlightFlag.SELECTED);
    expect(shapes(viewer)).toEqual([edges[2].path]);
  });

  test("a path given twice is selected once", async () => {
    const { viewer } = await setup();
    const { edges, bits } = scene(viewer);
    viewer.setSelection([edges[0].path, edges[0].path]);
    expect(bits(edges[0])).toBe(HighlightFlag.SELECTED);
    expect(shapes(viewer)).toEqual([edges[0].path]);
  });

  test("Backspace afterwards removes the last restored component", async () => {
    const { viewer } = await setup();
    const { edges, bits } = scene(viewer);
    viewer.setSelection([edges[0].path, edges[1].path]);
    viewer.pickingController.removeLastSelected();
    expect(bits(edges[1])).toBe(HighlightFlag.NONE);
    expect(bits(edges[0])).toBe(HighlightFlag.SELECTED);
    expect(shapes(viewer)).toEqual([edges[0].path]);
  });

  test("an empty list clears the selection", async () => {
    const { viewer } = await setup();
    const { edges, bits } = scene(viewer);
    viewer.setSelection([edges[0].path]);
    viewer.setSelection([]);
    expect(bits(edges[0])).toBe(HighlightFlag.NONE);
    expect(shapes(viewer)).toEqual([]);
  });
});
