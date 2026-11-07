/**
 * The point under the cursor in the status line: a left click shows it, Ctrl/Cmd-C
 * shows the copied point, and both give way to the hover readout again once the
 * mouse moves on.
 *
 * WebGL is mocked, so the GPU id picker is stubbed with a result built from the real
 * component registry.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import * as THREE from "three";
import { setupViewer, cleanup } from "../helpers/setup.js";
import { loadExample } from "../helpers/snapshot.js";

let testContext = null;

afterEach(() => {
  if (testContext) {
    cleanup(testContext);
    testContext = null;
  }
});

/**
 * Viewer with box1 rendered on `platform`; the picker returns a face of it and
 * `point`.
 */
async function setup(
  point = new THREE.Vector3(1, -2.5, 0.123456),
  platform = "MacIntel",
) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  testContext = setupViewer();
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("box1"), renderOptions, viewerOptions);
  const canvas = viewer.renderer.domElement;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
  });
  const face = [...viewer.rendered.nestedGroup.registry.entries()].find(
    (info) => info.topo === "face",
  );
  const pickAt = vi
    .spyOn(viewer.idPicker, "pickAt")
    .mockImplementation(() => ({ id: face.id, info: face, point }));
  return { viewer, canvas, pickAt };
}

function pointer(canvas, type, x, y, button = 0) {
  canvas.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button,
      buttons: type === "pointermove" ? 0 : 1,
      bubbles: true,
    }),
  );
}

const statusOf = (viewer) => viewer.display.statusLine.textContent;

const POINT = "Point: 1.0000, -2.5000, 0.1235 (Cmd+C)";

describe("Status line point", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a left click shows the point under the cursor, with the macOS copy key", async () => {
    const { viewer, canvas } = await setup();
    viewer.display.setStatusLine("Solid: hover readout");

    pointer(canvas, "pointerdown", 50, 50);

    expect(statusOf(viewer)).toBe(POINT);
  });

  test("on other platforms the hint names Ctrl+C", async () => {
    const { viewer, canvas } = await setup(undefined, "Win32");

    pointer(canvas, "pointerdown", 50, 50);

    expect(statusOf(viewer)).toBe("Point: 1.0000, -2.5000, 0.1235 (Ctrl+C)");
  });

  test("a move of up to 3 px keeps the point, a longer one brings the hover readout back", async () => {
    const { viewer, canvas } = await setup();
    viewer.display.setStatusLine("Solid: hover readout");
    pointer(canvas, "pointerdown", 50, 50);

    pointer(canvas, "pointermove", 52, 52); // 2.8 px: jitter while clicking
    expect(statusOf(viewer)).toBe(POINT);

    pointer(canvas, "pointermove", 54, 50); // 4 px: moved on, or dragging
    expect(statusOf(viewer)).toBe("Solid: hover readout");
  });

  test("hover updates under the point are shown once it gives way", async () => {
    const { viewer, canvas } = await setup();
    pointer(canvas, "pointerdown", 50, 50);
    viewer.display.setStatusLine("Plane: area ≈ 1");
    expect(statusOf(viewer)).toBe(POINT);

    pointer(canvas, "pointermove", 60, 50);
    expect(statusOf(viewer)).toBe("Plane: area ≈ 1");
  });

  test("no point for other buttons, over background, or while parts are displaced", async () => {
    const { viewer, canvas, pickAt } = await setup();
    viewer.display.setStatusLine("Solid: hover readout");

    pointer(canvas, "pointerdown", 50, 50, 2); // right button: pan
    expect(statusOf(viewer)).toBe("Solid: hover readout");

    pickAt.mockImplementation(() => null); // background
    pointer(canvas, "pointerdown", 50, 50);
    expect(statusOf(viewer)).toBe("Solid: hover readout");

    pickAt.mockRestore();
    vi.spyOn(viewer, "pointsOnModel").mockReturnValue(false);
    pointer(canvas, "pointerdown", 50, 50);
    expect(statusOf(viewer)).toBe("Solid: hover readout");
  });

  test("the copied point also gives way when the mouse moves on", async () => {
    const { viewer, canvas } = await setup();
    viewer.display.setStatusLine("Solid: hover readout");
    pointer(canvas, "pointermove", 50, 50); // the cursor is over the model

    expect(viewer.copyPointUnderCursor()).toBe(true);
    expect(statusOf(viewer)).toBe("Copied: 1.0000, -2.5000, 0.1235");

    pointer(canvas, "pointermove", 51, 51);
    expect(statusOf(viewer)).toBe("Copied: 1.0000, -2.5000, 0.1235");
    pointer(canvas, "pointermove", 60, 50);
    expect(statusOf(viewer)).toBe("Solid: hover readout");
  });
});
