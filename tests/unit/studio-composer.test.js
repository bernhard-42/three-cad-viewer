/**
 * The Studio composer with the real n8ao and postprocessing classes. WebGL is mocked,
 * so this cannot render; it checks what three reads from the render targets.
 */
import { describe, test, expect } from "vitest";
import * as THREE from "three";
import { StudioComposer } from "../../src/rendering/studio-composer.js";

function mockRenderer() {
  return {
    autoClear: true,
    capabilities: { logarithmicDepthBuffer: false, isWebGL2: true },
    getContext: () => ({
      getContextAttributes: () => ({
        alpha: true,
        depth: true,
        stencil: false,
      }),
    }),
    getSize: (target) => target.set(64, 64),
    getDrawingBufferSize: (target) => target.set(64, 64),
    getPixelRatio: () => 1,
    setPixelRatio: () => {},
    setSize: () => {},
  };
}

describe("StudioComposer", () => {
  // three r187 reads renderTarget.texture.mipmaps.length unguarded, and n8ao's
  // get texture() returned the array of textures: Studio mode did not start.
  test("the n8ao downsample target exposes one texture to three", () => {
    const composer = new StudioComposer(
      mockRenderer(),
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
      64,
      64,
    );

    const target = composer._n8aoPass.depthDownsampleTarget;

    expect(target.textures).toHaveLength(2);
    expect(target.texture).toBe(target.textures[0]);
    expect(target.texture.mipmaps).toEqual([]);
  });
});
