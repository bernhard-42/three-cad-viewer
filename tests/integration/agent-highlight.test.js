/**
 * Agent marks: a highlight state of their own (AGENT) beside the user's selection,
 * set by path, kept by Escape and by switching a tool off, cleared by `[]` and by a
 * new model.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";
import { HighlightFlag } from "../../src/rendering/highlight.js";
import { IdPicked } from "../../src/rendering/picked.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

async function setup() {
  testContext = setupViewer({});
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
  return viewer;
}

/** Highlight bits of a component, and paths of a solid, its faces and an edge. */
function scene(viewer) {
  const highlight = viewer.rendered.nestedGroup.highlight;
  const entries = [...viewer.rendered.nestedGroup.registry.entries()];
  const face = entries.find((e) => e.topo === "face" && e.solidPath !== null);
  const solidPath = face.solidPath;
  const solidFaces = entries.filter(
    (e) => e.solidPath === solidPath && e.topo === "face",
  );
  const edge = entries.find(
    (e) => e.topo === "edge" && e.solidPath !== solidPath,
  );
  const bits = (info) => highlight.stateTexture.image.data[info.id];
  return { highlight, face, solidPath, solidFaces, edge, bits, entries };
}

describe("agent marks", () => {
  test("mark components and whole solids by path; unknown paths are returned", async () => {
    const viewer = await setup();
    const { solidPath, solidFaces, edge, bits } = scene(viewer);
    const unknown = viewer.setAgentHighlight([edge.path, solidPath, "/nope"]);
    expect(unknown).toEqual(["/nope"]);
    expect(bits(edge)).toBe(HighlightFlag.AGENT);
    expect(solidFaces.length).toBeGreaterThan(1);
    for (const f of solidFaces) expect(bits(f)).toBe(HighlightFlag.AGENT);
  });

  test("a new call replaces the marks, [] clears them", async () => {
    const viewer = await setup();
    const { solidPath, solidFaces, edge, bits } = scene(viewer);
    viewer.setAgentHighlight([solidPath]);
    viewer.setAgentHighlight([edge.path]);
    expect(bits(edge)).toBe(HighlightFlag.AGENT);
    for (const f of solidFaces) expect(bits(f)).toBe(HighlightFlag.NONE);
    viewer.setAgentHighlight([]);
    expect(bits(edge)).toBe(HighlightFlag.NONE);
  });

  test("setting the marks repaints", async () => {
    const viewer = await setup();
    const { edge } = scene(viewer);
    const update = vi.spyOn(viewer, "update");
    viewer.setAgentHighlight([edge.path]);
    expect(update).toHaveBeenCalled();
  });

  test("clearing the user's selection (Escape, tool off) keeps the marks", async () => {
    const viewer = await setup();
    const { highlight, face, edge, bits } = scene(viewer);
    viewer.setAgentHighlight([edge.path, face.path]);
    highlight.setSelected(face.id, true);
    viewer.clearSelection();
    expect(bits(face)).toBe(HighlightFlag.AGENT);
    expect(bits(edge)).toBe(HighlightFlag.AGENT);
  });

  test("a click on an agent mark selects it and keeps the mark", async () => {
    const viewer = await setup();
    const { highlight, edge, bits } = scene(viewer);
    viewer.setAgentHighlight([edge.path]);
    const picked = new IdPicked(edge, false, null, highlight);
    picked.toggleSelection();
    expect(bits(edge)).toBe(HighlightFlag.AGENT | HighlightFlag.SELECTED);
    picked.toggleSelection();
    expect(bits(edge)).toBe(HighlightFlag.AGENT);
  });

  test("a click on an agent-marked solid selects the solid and keeps the marks", async () => {
    const viewer = await setup();
    const { highlight, face, solidPath, solidFaces, bits } = scene(viewer);
    viewer.setAgentHighlight([solidPath]);
    new IdPicked(face, true, null, highlight).toggleSelection();
    for (const f of solidFaces) {
      expect(bits(f)).toBe(HighlightFlag.AGENT | HighlightFlag.SELECTED);
    }
  });

  test("a new model has no marks", async () => {
    const viewer = await setup();
    const { solidPath } = scene(viewer);
    viewer.setAgentHighlight([solidPath]);
    const { renderOptions, viewerOptions } = testContext;
    viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
    const { entries, bits } = scene(viewer);
    expect(entries.every((e) => (bits(e) & HighlightFlag.AGENT) === 0)).toBe(
      true,
    );
  });
});
