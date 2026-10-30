/**
 * Unit tests for the Studio background protection: the composer protects the
 * background only while a solid color background is shown.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { StudioManager } from "../../src/core/studio-manager.js";
import { ViewerState } from "../../src/core/viewer-state.js";

describe("StudioManager - background protection", () => {
  let scene;
  let state;
  let manager;
  let setBackgroundProtect;

  beforeEach(() => {
    scene = new THREE.Scene();
    state = new ViewerState();
    manager = new StudioManager({
      renderer: null,
      state,
      isRendered: () => true,
      getScene: () => scene,
      getCamera: () => ({ ortho: false }),
      update: vi.fn(),
    });
    // Studio mode active with a loaded environment and a composer stub,
    // without a WebGL renderer
    setBackgroundProtect = vi.fn();
    manager._composer = { setBackgroundProtect };
    manager._active = true;
    manager.envManager._currentTexture = new THREE.Texture();
  });

  const lastProtect = () => setBackgroundProtect.mock.calls.at(-1)[0];

  test.each(["grey", "darkgrey", "white"])(
    "a solid %s background is protected",
    (background) => {
      state.set("studioBackground", background);
      expect(lastProtect()).toBeInstanceOf(THREE.Color);
    },
  );

  // "gradient" is left out: happy-dom has no 2D canvas to draw it
  test.each(["grey", "darkgrey", "white", "transparent"])(
    "switching from %s to environment turns protection off",
    (background) => {
      state.set("studioBackground", background);
      state.set("studioBackground", "environment");
      expect(manager.envManager.isEnvBackgroundActive).toBe(true);
      expect(lastProtect()).toBeNull();
    },
  );

  test("environment without a loaded map falls back to protected grey", () => {
    manager.envManager._currentTexture = null;
    state.set("studioBackground", "white");
    state.set("studioBackground", "environment");
    expect(manager.envManager.isEnvBackgroundActive).toBe(false);
    expect(lastProtect()).toBe(scene.background);
    expect(lastProtect()).toBeInstanceOf(THREE.Color);
  });
});
