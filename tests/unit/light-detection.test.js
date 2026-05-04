/**
 * Unit tests for light-detection.ts — pure CPU computation, no WebGL needed.
 */
import { describe, test, expect } from "vitest";
import {
  detectDominantLights,
  getDefaultLights,
} from "../../src/rendering/light-detection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a float as IEEE 754 half-float (Uint16). */
function floatToHalf(val) {
  if (val === 0) return 0;
  const f32 = new Float32Array([val]);
  const u32 = new Uint32Array(f32.buffer)[0];
  const sign = (u32 >> 31) & 1;
  let exponent = ((u32 >> 23) & 0xff) - 127;
  const mantissa = u32 & 0x7fffff;

  if (exponent > 15) return (sign << 15) | (0x1f << 10); // Infinity
  if (exponent < -14) return sign << 15; // Zero (subnormal truncated)

  const h = (sign << 15) | ((exponent + 15) << 10) | (mantissa >> 13);
  return h;
}

/**
 * Create a synthetic equirectangular HDR image (Float32Array, 3 channels).
 * All pixels = bgValue, except a bright spot at (spotX, spotY) with spotValue.
 */
function createHdrWithSpot(
  width,
  height,
  bgValue,
  spotX,
  spotY,
  spotValue,
  spotRadius = 2,
) {
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const dx = x - spotX;
      const dy = y - spotY;
      if (dx * dx + dy * dy <= spotRadius * spotRadius) {
        data[idx] = spotValue;
        data[idx + 1] = spotValue;
        data[idx + 2] = spotValue;
      } else {
        data[idx] = bgValue;
        data[idx + 1] = bgValue;
        data[idx + 2] = bgValue;
      }
    }
  }
  return data;
}

/** Create a uniform HDR image (all pixels same value). */
function createUniformHdr(width, height, value) {
  const data = new Float32Array(width * height * 3);
  data.fill(value);
  return data;
}

// ---------------------------------------------------------------------------
// getDefaultLights
// ---------------------------------------------------------------------------

describe("getDefaultLights", () => {
  test("returns a single light with expected structure", () => {
    const result = getDefaultLights();
    expect(result.wasAnalyzed).toBe(false);
    expect(result.lights).toHaveLength(1);

    const light = result.lights[0];
    expect(light.intensity).toBe(1.0);
    expect(light.color).toEqual([1, 1, 1]);
    expect(light.direction).toHaveLength(3);
  });

  test("default light direction is normalized", () => {
    const { direction } = getDefaultLights().lights[0];
    const len = Math.sqrt(
      direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2,
    );
    expect(len).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// detectDominantLights — edge cases
// ---------------------------------------------------------------------------

describe("detectDominantLights — edge cases", () => {
  test("returns empty lights for insufficient channels", () => {
    // 2-channel data (not enough for RGB)
    const data = new Float32Array(64 * 32 * 2);
    const result = detectDominantLights(data, 64, 32);
    expect(result.lights).toHaveLength(0);
    expect(result.wasAnalyzed).toBe(false);
  });

  test("returns empty lights for all-zero image", () => {
    const data = createUniformHdr(64, 32, 0);
    const result = detectDominantLights(data, 64, 32);
    expect(result.lights).toHaveLength(0);
    expect(result.wasAnalyzed).toBe(true);
  });

  test("returns empty lights for uniform image (no bright spots)", () => {
    // All pixels identical — nothing exceeds 10x median
    const data = createUniformHdr(128, 64, 0.5);
    const result = detectDominantLights(data, 128, 64);
    expect(result.lights).toHaveLength(0);
    expect(result.wasAnalyzed).toBe(true);
  });

  test("handles 4-channel data (RGBA)", () => {
    // 4 channels — should still work (uses first 3)
    const width = 64,
      height = 32;
    const data = new Float32Array(width * height * 4);
    // Place a bright spot at center
    const cx = 32,
      cy = 16;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const dx = x - cx,
          dy = y - cy;
        const val = dx * dx + dy * dy <= 4 ? 50.0 : 0.1;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 1.0;
      }
    }
    const result = detectDominantLights(data, width, height);
    expect(result.wasAnalyzed).toBe(true);
    expect(result.lights.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// detectDominantLights — single bright spot
// ---------------------------------------------------------------------------

describe("detectDominantLights — spot detection", () => {
  test("detects a single bright spot (Float32Array)", () => {
    // 128x64 image, bg=0.1, bright spot at center (64, 32) with value=100
    const data = createHdrWithSpot(128, 64, 0.1, 64, 32, 100.0, 3);
    const result = detectDominantLights(data, 128, 64);

    expect(result.wasAnalyzed).toBe(true);
    expect(result.lights).toHaveLength(1);

    const light = result.lights[0];
    expect(light.intensity).toBeCloseTo(1.0, 1); // brightest cluster
    // Direction should be a unit vector
    const len = Math.sqrt(
      light.direction[0] ** 2 +
        light.direction[1] ** 2 +
        light.direction[2] ** 2,
    );
    expect(len).toBeCloseTo(1.0, 3);
    // Color should be close to white (equal R,G,B)
    expect(light.color[0]).toBeCloseTo(light.color[1], 1);
    expect(light.color[1]).toBeCloseTo(light.color[2], 1);
  });

  test("spot at left edge (u≈0) produces direction near (-1, 0, 0)", () => {
    // Spot at x=0 (left edge of equirect = azimuth=-π → direction ≈ (-1, 0, 0))
    // Place at y=height/2 (equator, phi=0)
    const w = 256,
      h = 128;
    const data = createHdrWithSpot(w, h, 0.05, 2, h / 2, 200.0, 3);
    const result = detectDominantLights(data, w, h);

    expect(result.lights).toHaveLength(1);
    const dir = result.lights[0].direction;
    // x should be strongly negative (cos(-π) = -1)
    expect(dir[0]).toBeLessThan(-0.5);
    // y should be near 0 (equator)
    expect(Math.abs(dir[1])).toBeLessThan(0.3);
  });

  test("spot at top (north pole) produces positive Y direction", () => {
    const w = 256,
      h = 128;
    // Spot at y=2 (near top → elevation close to +π/2 → Y positive)
    const data = createHdrWithSpot(w, h, 0.05, w / 2, 2, 200.0, 3);
    const result = detectDominantLights(data, w, h);

    expect(result.lights).toHaveLength(1);
    expect(result.lights[0].direction[1]).toBeGreaterThan(0.5);
  });

  test("colored spot preserves color ratios", () => {
    const w = 128,
      h = 64;
    const data = new Float32Array(w * h * 3);
    // Background: dim grey
    for (let i = 0; i < data.length; i += 3) {
      data[i] = 0.05;
      data[i + 1] = 0.05;
      data[i + 2] = 0.05;
    }
    // Red spot at center
    const cx = 64,
      cy = 32,
      r = 3;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = (y * w + x) * 3;
          data[idx] = 100.0; // R
          data[idx + 1] = 10.0; // G
          data[idx + 2] = 10.0; // B
        }
      }
    }

    const result = detectDominantLights(data, w, h);
    expect(result.lights).toHaveLength(1);
    // Red channel should dominate
    expect(result.lights[0].color[0]).toBeGreaterThan(
      result.lights[0].color[1],
    );
  });
});

// ---------------------------------------------------------------------------
// detectDominantLights — Uint16Array (half-float)
// ---------------------------------------------------------------------------

describe("detectDominantLights — half-float input", () => {
  test("detects spot from Uint16Array data", () => {
    const w = 128,
      h = 64;
    const data = new Uint16Array(w * h * 3);
    const bgHalf = floatToHalf(0.1);
    const brightHalf = floatToHalf(50.0);

    // Fill background
    data.fill(bgHalf);

    // Bright spot at center
    const cx = 64,
      cy = 32,
      r = 3;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = (y * w + x) * 3;
          data[idx] = brightHalf;
          data[idx + 1] = brightHalf;
          data[idx + 2] = brightHalf;
        }
      }
    }

    const result = detectDominantLights(data, w, h);
    expect(result.wasAnalyzed).toBe(true);
    expect(result.lights).toHaveLength(1);
    expect(result.lights[0].intensity).toBeCloseTo(1.0, 1);
  });
});
