/**
 * Unit tests for MaterialFactory — material creation and property mapping.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { MaterialFactory } from '../../src/rendering/material-factory.js';
import { MATERIAL_PRESETS } from '../../src/rendering/material-presets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock TextureCache that returns null for all gets. */
function mockTextureCache() {
  return { get: vi.fn().mockResolvedValue(null) };
}

/** Create a factory with default options. */
function createFactory(opts = {}) {
  return new MaterialFactory({
    metalness: 0.3,
    roughness: 0.65,
    edgeColor: 0x707070,
    defaultOpacity: 1.0,
    transparent: false,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// CAD material creation
// ---------------------------------------------------------------------------

describe('MaterialFactory — CAD materials', () => {
  let factory;

  beforeEach(() => {
    factory = createFactory();
  });

  test('createFrontFaceMaterial returns MeshStandardMaterial', () => {
    const mat = factory.createFrontFaceMaterial({
      color: 0xff0000,
      opacity: 1.0,
      transparent: false,
    });
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(mat.metalness).toBe(0.3);
    expect(mat.roughness).toBe(0.65);
    expect(mat.side).toBe(THREE.FrontSide);
  });

  test('createBackFaceBasicMaterial returns MeshBasicMaterial', () => {
    const mat = factory.createBackFaceBasicMaterial({
      color: 0x00ff00,
      opacity: 1.0,
      transparent: false,
    });
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(mat.side).toBe(THREE.BackSide);
  });

  test('createVertexMaterial returns PointsMaterial', () => {
    const mat = factory.createVertexMaterial({
      color: 0x0000ff,
      size: 5,
    });
    expect(mat).toBeInstanceOf(THREE.PointsMaterial);
    expect(mat.size).toBe(5);
  });

  test('createSimpleEdgeMaterial returns LineBasicMaterial', () => {
    const mat = factory.createSimpleEdgeMaterial({
      color: 0x707070,
      visible: true,
    });
    expect(mat).toBeInstanceOf(THREE.LineBasicMaterial);
  });

  test('update changes metalness and roughness for new materials', () => {
    factory.update({ metalness: 0.8, roughness: 0.2 });
    const mat = factory.createFrontFaceMaterial({
      color: 0xffffff,
      opacity: 1.0,
      transparent: false,
    });
    expect(mat.metalness).toBe(0.8);
    expect(mat.roughness).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// Studio material creation
// ---------------------------------------------------------------------------

describe('MaterialFactory — Studio materials', () => {
  let factory;

  beforeEach(() => {
    factory = createFactory();
  });

  test('createStudioMaterial from preset produces MeshPhysicalMaterial', async () => {
    const preset = MATERIAL_PRESETS['plastic-glossy'];
    const mat = await factory.createStudioMaterial({
      materialDef: preset,
      fallbackColor: '#ff0000',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.roughness).toBeCloseTo(preset.roughness, 2);
    expect(mat.metalness).toBeCloseTo(preset.metalness, 2);
  });

  test('createStudioMaterial applies fallback color when no color in preset', async () => {
    const appearance = { name: 'test', metalness: 0.5, roughness: 0.5 };
    const mat = await factory.createStudioMaterial({
      materialDef: appearance,
      fallbackColor: '#ff0000',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    // Should use fallback color (red)
    expect(mat.color.r).toBeGreaterThan(0.5);
  });

  test('createStudioMaterial with transmission sets correct properties', async () => {
    const preset = MATERIAL_PRESETS['glass-clear'];
    const mat = await factory.createStudioMaterial({
      materialDef: preset,
      fallbackColor: '#ffffff',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.transmission).toBeGreaterThan(0);
    // Transmission materials should have transparent=false (uses separate render target)
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  test('createStudioMaterial with clearcoat', async () => {
    const preset = MATERIAL_PRESETS['car-paint'];
    const mat = await factory.createStudioMaterial({
      materialDef: preset,
      fallbackColor: '#cc0000',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat.clearcoat).toBeGreaterThan(0);
  });

  test('createStudioMaterial with anisotropy', async () => {
    const preset = MATERIAL_PRESETS['brushed-aluminum'];
    const mat = await factory.createStudioMaterial({
      materialDef: preset,
      fallbackColor: '#cccccc',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat.anisotropy).toBeGreaterThan(0);
  });

  test('createStudioMaterial with textureCache calls get for texture refs', async () => {
    const cache = mockTextureCache();
    const appearance = {
      name: 'textured',
      metalness: 0.5,
      roughness: 0.5,
      color: [0.8, 0.8, 0.8, 1.0],
      map: 'tex://basecolor.png',
      normalMap: 'tex://normal.png',
    };
    await factory.createStudioMaterial({
      materialDef: appearance,
      fallbackColor: '#ffffff',
      fallbackAlpha: 1.0,
      textureCache: cache,
    });
    // Should have called cache.get for each texture ref
    expect(cache.get).toHaveBeenCalledWith('tex://basecolor.png', 'baseColorTexture');  // role string, not field name
    expect(cache.get).toHaveBeenCalledWith('tex://normal.png', 'normalTexture');  // role string, not field name
  });

  test('createStudioMaterial with unlit appearance returns MeshBasicMaterial', async () => {
    const appearance = {
      name: 'unlit-test',
      metalness: 0,
      roughness: 1,
      unlit: true,
      color: [1, 0, 0, 1],
    };
    const mat = await factory.createStudioMaterial({
      materialDef: appearance,
      fallbackColor: '#ff0000',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
});

// ---------------------------------------------------------------------------
// Studio material from MaterialX/threejs-materials format
// ---------------------------------------------------------------------------

describe('MaterialFactory — MaterialX materials', () => {
  let factory;

  beforeEach(() => {
    factory = createFactory();
  });

  test('createStudioMaterialFromMaterialX sets properties from dict', async () => {
    const properties = {
      color: { value: [0.8, 0.5, 0.3] },
      metalness: { value: 0.9 },
      roughness: { value: 0.3 },
      clearcoat: { value: 0.5 },
    };
    const mat = await factory.createStudioMaterialFromMaterialX(
      properties, undefined, null,
    );
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.metalness).toBeCloseTo(0.9);
    expect(mat.roughness).toBeCloseTo(0.3);
    expect(mat.clearcoat).toBeCloseTo(0.5);
  });

  test('createStudioMaterialFromMaterialX handles texture references', async () => {
    const cache = mockTextureCache();
    const properties = {
      color: { value: [1, 1, 1], texture: 'data:image/png;base64,abc' },
      metalness: { value: 0.5 },
      roughness: { value: 0.5 },
    };
    await factory.createStudioMaterialFromMaterialX(
      properties, undefined, cache,
    );
    expect(cache.get).toHaveBeenCalled();
  });

  test('createStudioMaterialFromMaterialX with textureRepeat', async () => {
    const properties = {
      color: 0xffffff,
      metalness: 0,
      roughness: 0.5,
    };
    const mat = await factory.createStudioMaterialFromMaterialX(
      properties, [2, 3], null,
    );
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
  });
});

// ---------------------------------------------------------------------------
// Alpha/transparency handling
// ---------------------------------------------------------------------------

describe('MaterialFactory — alpha mode handling', () => {
  let factory;

  beforeEach(() => {
    factory = createFactory();
  });

  test('opaque alpha mode disables transparency', async () => {
    const appearance = {
      name: 'opaque',
      metalness: 0,
      roughness: 0.5,
      color: [1, 0, 0, 1],
      alphaMode: 'OPAQUE',
    };
    const mat = await factory.createStudioMaterial({
      materialDef: appearance,
      fallbackColor: '#ff0000',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  test('blend alpha mode enables transparency', async () => {
    const appearance = {
      name: 'blend',
      metalness: 0,
      roughness: 0.5,
      color: [1, 0, 0, 0.5],
      alphaMode: 'BLEND',
    };
    const mat = await factory.createStudioMaterial({
      materialDef: appearance,
      fallbackColor: '#ff0000',
      fallbackAlpha: 0.5,
      textureCache: null,
    });
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  test('mask alpha mode sets alphaTest', async () => {
    const appearance = {
      name: 'mask',
      metalness: 0,
      roughness: 0.5,
      color: [1, 0, 0, 1],
      alphaMode: 'MASK',
      alphaCutoff: 0.3,
    };
    const mat = await factory.createStudioMaterial({
      materialDef: appearance,
      fallbackColor: '#ff0000',
      fallbackAlpha: 1.0,
      textureCache: null,
    });
    expect(mat.alphaTest).toBeCloseTo(0.3);
    expect(mat.transparent).toBe(false);
  });
});
