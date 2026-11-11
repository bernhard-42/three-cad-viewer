/**
 * captureView: an image from a camera of its own (view preset, ortho or
 * perspective) that leaves the user's camera, light and view untouched. The
 * renderer is mocked here, so the tests record which camera each render used and
 * when the image was read; the pixels are checked in the browser.
 */
import { describe, test, expect, afterEach, vi } from "vitest";
import * as THREE from "three";
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

async function setup() {
  testContext = setupViewer({});
  const { viewer, renderOptions, viewerOptions } = testContext;
  viewer.render(await loadExample("boxes"), renderOptions, viewerOptions);
  return viewer;
}

/** The user's camera state and the light, to compare before and after. */
function userState(viewer) {
  const cam = viewer.rendered.camera.getCamera();
  return {
    position: cam.position.toArray(),
    quaternion: cam.quaternion.toArray(),
    zoom: viewer.rendered.camera.getZoom(),
    ortho: viewer.rendered.camera.ortho,
    target: viewer.rendered.controls.getTarget().toArray(),
    light: viewer.rendered.directLight.position.toArray(),
  };
}

/**
 * Record every render (its camera and the clip / hover state at that moment) and
 * every read of the canvas, in order.
 */
function record(viewer, probe = () => ({})) {
  const events = [];
  viewer.renderer.render.mockImplementation((scene, camera) => {
    events.push({ type: "render", camera, ...probe() });
  });
  vi.spyOn(viewer.renderer.domElement, "toDataURL").mockImplementation(() => {
    events.push({ type: "read" });
    return "data:image/png;base64,CAPTURE";
  });
  return events;
}

const direction = (camera) =>
  camera.position
    .clone()
    .sub(camera.target ?? new THREE.Vector3())
    .normalize();

describe("captureView", () => {
  test("renders from a camera of its own and returns the image read right after", async () => {
    const viewer = await setup();
    const user = viewer.rendered.camera.getCamera();
    const events = record(viewer);
    const result = await viewer.captureView({ view: "front", ortho: true });
    expect(result.dataUrl).toBe("data:image/png;base64,CAPTURE");
    const read = events.findIndex((e) => e.type === "read");
    expect(read).toBeGreaterThan(0);
    const captureRender = events[read - 1];
    expect(captureRender.type).toBe("render");
    expect(captureRender.camera).not.toBe(user);
    // the user's view is rendered again afterwards
    expect(events.slice(read + 1).some((e) => e.camera === user)).toBe(true);
  });

  test("leaves the user's camera, target, zoom and light untouched", async () => {
    const viewer = await setup();
    const before = userState(viewer);
    record(viewer);
    await viewer.captureView({ view: "top", ortho: false });
    expect(userState(viewer)).toEqual(before);
  });

  test("the user's view is rendered again with the light at the user's camera", async () => {
    const viewer = await setup();
    const user = viewer.rendered.camera.getCamera();
    const events = record(viewer, () => ({
      light: viewer.rendered.directLight.position.toArray(),
    }));
    await viewer.captureView({ view: "front" });
    const read = events.findIndex((e) => e.type === "read");
    const userRender = events.slice(read + 1).find((e) => e.camera === user);
    expect(userRender.light).toEqual(user.position.toArray());
  });

  test("reports the camera it used, looking from the view direction at the model", async () => {
    const viewer = await setup();
    record(viewer);
    const front = await viewer.captureView({ view: "front", ortho: true });
    expect(front.camera.view).toBe("front");
    expect(front.camera.ortho).toBe(true);
    expect(front.camera.target).toEqual(
      viewer.rendered.controls.target0.toArray(),
    );
    const dir = new THREE.Vector3(...front.camera.position)
      .sub(new THREE.Vector3(...front.camera.target))
      .normalize();
    // Z up: "front" looks from -Y
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(-1);
    expect(dir.z).toBeCloseTo(0);
    expect(front.camera.up).toEqual([0, 0, 1]);
    expect(front.camera.zoom).toBeCloseTo(1);
    const iso = await viewer.captureView({ view: "iso", ortho: false });
    expect(iso.camera.ortho).toBe(false);
  });

  test("defaults to the user's projection", async () => {
    const viewer = await setup();
    record(viewer);
    const result = await viewer.captureView({ view: "iso" });
    expect(result.camera.ortho).toBe(viewer.rendered.camera.ortho);
  });

  test("an unknown view throws", async () => {
    const viewer = await setup();
    record(viewer);
    await expect(viewer.captureView({ view: "side" })).rejects.toThrow(/view/);
  });

  test("no hover highlight in the image", async () => {
    const viewer = await setup();
    const highlight = viewer.rendered.nestedGroup.highlight;
    const face = [...viewer.rendered.nestedGroup.registry.entries()].find(
      (e) => e.topo === "face",
    );
    highlight.setHover(face.id);
    const user = viewer.rendered.camera.getCamera();
    const events = record(viewer, () => ({
      hover:
        (highlight.stateTexture.image.data[face.id] & HighlightFlag.HOVER) !==
        0,
    }));
    await viewer.captureView({ view: "front" });
    const captureRender = events.find(
      (e) => e.type === "render" && e.camera !== user,
    );
    expect(captureRender.hover).toBe(false);
  });

  test("clip planes are off unless requested, and restored afterwards", async () => {
    const viewer = await setup();
    viewer.setLocalClipping(true);
    viewer.rendered.clipping.setVisible(true);
    const clipping = viewer.rendered.clipping;
    const user = viewer.rendered.camera.getCamera();
    const events = record(viewer, () => ({
      clip: viewer.renderer.localClippingEnabled,
      planes: clipping.planesVisible,
    }));
    await viewer.captureView({ view: "front" });
    let captureRender = events.find(
      (e) => e.type === "render" && e.camera !== user,
    );
    expect(captureRender.clip).toBe(false);
    expect(captureRender.planes).toBe(false);
    expect(viewer.renderer.localClippingEnabled).toBe(true);
    expect(clipping.planesVisible).toBe(true);

    events.length = 0;
    await viewer.captureView({ view: "front", clip: true });
    captureRender = events.find(
      (e) => e.type === "render" && e.camera !== user,
    );
    expect(captureRender.clip).toBe(true);
    expect(captureRender.planes).toBe(true);
  });

  test("displaced says why positions differ from the model", async () => {
    const viewer = await setup();
    record(viewer);
    expect((await viewer.captureView({ view: "front" })).displaced).toBeNull();
    viewer.state.set("animationMode", "explode", false);
    expect((await viewer.captureView({ view: "front" })).displaced).toBe(
      "explode",
    );
    viewer.state.set("animationMode", "animation", false);
    viewer._animationStarted = true;
    expect((await viewer.captureView({ view: "front" })).displaced).toBe(
      "animation",
    );
  });
});
