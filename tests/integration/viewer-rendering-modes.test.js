import { describe, test, expect, afterEach } from "vitest";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample, captureSceneState } from "../helpers/snapshot.js";

describe("Viewer - Rendering", () => {
  let testContext;

  afterEach(() => {
    if (testContext) {
      cleanup(testContext);
      testContext = null;
    }
  });

  /**
   * Tests for the single compact rendering path. renderTessellatedShapes(shapes)
   * builds one ObjectGroup per solid (merged face mesh + edges + points) plus the
   * per-vertex componentId attributes the GPU picker reads.
   */

  test("renders solids as unified objects", async () => {
    testContext = setupViewer();
    const { viewer, renderOptions, viewerOptions } = testContext;

    const box1Data = await loadExample("box1");
    viewer.render(box1Data, renderOptions, viewerOptions);

    const snapshot = captureSceneState(viewer);

    expect(snapshot.scene).toBeDefined();
    expect(snapshot.scene.totalChildren).toBeGreaterThan(0);
    // Faces are rendered as meshes
    expect(snapshot.scene.counts.meshes).toBeGreaterThan(0);

    expect(snapshot).toMatchSnapshot("box1-render");
  });

  test("renderTessellatedShapes returns a group + tree", async () => {
    testContext = setupViewer();
    const { viewer, renderOptions } = testContext;

    viewer.setRenderDefaults(renderOptions);

    const box1Data = await loadExample("box1");
    const result = viewer.renderTessellatedShapes(box1Data);

    expect(result).toBeDefined();
    expect(result).toHaveProperty("group");
    expect(result).toHaveProperty("tree");
    expect(result.group).toBeDefined();
    expect(typeof result.tree).toBe("object");

    expect(result.tree).toMatchSnapshot("box1-tree");
  });

  test("renders different example shapes", async () => {
    testContext = setupViewer();
    const { viewer, renderOptions } = testContext;

    viewer.setRenderDefaults(renderOptions);

    const edgesData = await loadExample("edges");
    const result = viewer.renderTessellatedShapes(edgesData);

    expect(result).toBeDefined();
    expect(result.group).toBeDefined();
    expect(typeof result.tree).toBe("object");
    expect(Object.keys(result.tree).length).toBeGreaterThan(0);
  });
});
