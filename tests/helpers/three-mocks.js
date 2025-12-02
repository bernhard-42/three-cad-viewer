import * as THREE from 'three';
import { vi } from 'vitest';

/**
 * Mock WebGLRenderer for testing (happy-dom doesn't support WebGL)
 * Quick & dirty - just enough to let tests run
 */
export function mockWebGLRenderer() {
  const mockRenderer = {
    domElement: document.createElement('canvas'),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setClearColor: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    autoClear: false,
    shadowMap: {
      enabled: false,
      type: THREE.PCFSoftShadowMap,
    },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
  };

  // Mock the THREE.WebGLRenderer constructor
  vi.spyOn(THREE, 'WebGLRenderer').mockImplementation(() => mockRenderer);

  return mockRenderer;
}

/**
 * Restore original THREE.WebGLRenderer
 */
export function restoreWebGLRenderer() {
  vi.restoreAllMocks();
}
