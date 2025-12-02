// Global test setup file
// This runs before all tests

import { vi, expect } from 'vitest';
import * as THREE from 'three';
import { toAlmostEqual } from './helpers/almostEqual.js';

// Register custom matchers
expect.extend({
  toAlmostEqual,
});

// Spy on console methods to detect issues in the codebase
// These spies preserve the original behavior (output still visible)
// but allow us to assert on console calls later
export const consoleSpy = {
  debug: vi.spyOn(console, 'debug'),
  log: vi.spyOn(console, 'log'),
  warn: vi.spyOn(console, 'warn'),
  error: vi.spyOn(console, 'error'),
  info: vi.spyOn(console, 'info'),
};

// After each test, check for unexpected errors/warnings
// This helps catch issues in the current codebase
afterEach(() => {
  // Log summary if there were errors or warnings
  if (consoleSpy.error.mock.calls.length > 0) {
    console.log('\n⚠️  Console errors detected:', consoleSpy.error.mock.calls.length);
    consoleSpy.error.mock.calls.forEach((call, i) => {
      console.log(`  ${i + 1}.`, ...call);
    });
  }

  if (consoleSpy.warn.mock.calls.length > 0) {
    console.log('\n⚠️  Console warnings detected:', consoleSpy.warn.mock.calls.length);
    consoleSpy.warn.mock.calls.forEach((call, i) => {
      console.log(`  ${i + 1}.`, ...call);
    });
  }

  // Clear mocks for next test
  Object.values(consoleSpy).forEach(spy => spy.mockClear());
});

// Mock Canvas 2D Context for zebra tool and other texture generation
const mockCanvas2DContext = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 10,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  })),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  translate: vi.fn(),
  transform: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  ellipse: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  clip: vi.fn(),
  isPointInPath: vi.fn(),
  isPointInStroke: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  canvas: null,
};

// Patch HTMLCanvasElement.prototype.getContext to support 2d context
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (contextType, ...args) {
    if (contextType === '2d') {
      const ctx = { ...mockCanvas2DContext };
      ctx.canvas = this;
      return ctx;
    }
    return originalGetContext?.call(this, contextType, ...args);
  };
}

// Mock WebGLRenderer at the module level (before any imports)
const mockRenderer = {
  domElement: document.createElement('canvas'),
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
  setViewport: vi.fn(),
  setScissor: vi.fn(),
  setScissorTest: vi.fn(),
  setClearColor: vi.fn(),
  getClearColor: vi.fn(() => new THREE.Color(0x000000)),
  getPixelRatio: vi.fn(() => 1),
  getSize: vi.fn((target) => {
    if (target) {
      target.set(800, 600);
      return target;
    }
    return { width: 800, height: 600 };
  }),
  render: vi.fn(),
  clear: vi.fn(),
  clearColor: vi.fn(),
  clearDepth: vi.fn(),
  clearStencil: vi.fn(),
  dispose: vi.fn(),
  autoClear: false,
  shadowMap: {
    enabled: false,
    type: THREE.PCFSoftShadowMap,
  },
  toneMapping: THREE.NoToneMapping,
  toneMappingExposure: 1,
  capabilities: {
    getMaxAnisotropy: vi.fn(() => 16),
    getMaxPrecision: vi.fn(() => 'highp'),
    precision: 'highp',
    logarithmicDepthBuffer: false,
    maxTextures: 16,
    maxVertexTextures: 16,
    maxTextureSize: 16384,
    maxCubemapSize: 16384,
    maxAttributes: 16,
    maxVertexUniforms: 1024,
    maxVaryings: 30,
    maxFragmentUniforms: 1024,
    vertexTextures: true,
    floatFragmentTextures: true,
    floatVertexTextures: true,
  },
};

// Mock THREE.WebGLRenderer before tests run
vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    WebGLRenderer: vi.fn(() => mockRenderer),
  };
});
