/**
 * HDR environment map light source detection.
 *
 * Analyzes equirectangular HDR pixel data to find dominant light sources
 * (softboxes in studio HDRs, sun in outdoor HDRs). Returns direction,
 * intensity, and color for up to 2 lights, used to create shadow-casting
 * DirectionalLights in Studio mode.
 *
 * Algorithm: downsample to 128x64 luminance grid → threshold at 10x median
 * → flood-fill cluster → convert centroids to 3D direction vectors.
 * Runs ~5-10ms on CPU, no GPU readback needed.
 */

import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A detected dominant light source from HDR analysis. */
export interface DetectedLight {
  /** Unit direction vector toward the light source (Y-up, before Z-up rotation). */
  direction: [number, number, number];
  /** Relative intensity (normalized, 0-1 range). */
  intensity: number;
  /** Linear RGB color of the light source (0-1 range). */
  color: [number, number, number];
}

/** Result of light detection analysis. */
export interface LightDetectionResult {
  /** Detected light sources (0-2 entries). */
  lights: DetectedLight[];
  /** Whether the result came from actual HDR analysis (true) or a fallback (false). */
  wasAnalyzed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Downsampled grid width for analysis. */
const GRID_W = 128;
/** Downsampled grid height for analysis. */
const GRID_H = 64;
/** Threshold multiplier: pixels brighter than median * this are "light sources". */
const THRESHOLD_MULTIPLIER = 10;
/** Maximum number of lights to return. */
const MAX_LIGHTS = 1;

// ---------------------------------------------------------------------------
// Half-float decoding
// ---------------------------------------------------------------------------

/**
 * Decode a 16-bit half-float value to a JavaScript number.
 * HDRLoader returns Uint16Array with HalfFloatType pixels.
 */
function halfToFloat(h: number): number {
  const sign = (h >> 15) & 0x1;
  const exponent = (h >> 10) & 0x1f;
  const mantissa = h & 0x3ff;

  if (exponent === 0) {
    // Subnormal or zero
    return (sign ? -1 : 1) * Math.pow(2, -14) * (mantissa / 1024);
  }
  if (exponent === 31) {
    // Infinity or NaN
    return mantissa ? NaN : sign ? -Infinity : Infinity;
  }
  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/**
 * Detect dominant light sources from equirectangular HDR pixel data.
 *
 * @param data - Raw pixel data (Uint16Array for HalfFloat, or Float32Array)
 * @param width - HDR image width in pixels
 * @param height - HDR image height in pixels
 * @returns Detection result with up to 2 lights
 */
export function detectDominantLights(
  data: Uint16Array | Float32Array,
  width: number,
  height: number,
): LightDetectionResult {
  const isHalf = data instanceof Uint16Array;
  const channels = data.length / (width * height);
  if (channels < 3) {
    logger.warn("Light detection: unexpected channel count", channels);
    return { lights: [], wasAnalyzed: false };
  }

  // 1. Downsample to GRID_W x GRID_H luminance grid with cos(latitude) weighting
  const grid = new Float32Array(GRID_W * GRID_H);
  const gridR = new Float32Array(GRID_W * GRID_H);
  const gridG = new Float32Array(GRID_W * GRID_H);
  const gridB = new Float32Array(GRID_W * GRID_H);
  const gridCount = new Float32Array(GRID_W * GRID_H);

  for (let sy = 0; sy < height; sy++) {
    const gy = Math.min(Math.floor((sy / height) * GRID_H), GRID_H - 1);
    // cos(latitude) weighting: equator has more area than poles
    const phi = (0.5 - sy / height) * Math.PI;
    const cosWeight = Math.cos(phi);

    for (let sx = 0; sx < width; sx++) {
      const gx = Math.min(Math.floor((sx / width) * GRID_W), GRID_W - 1);
      const srcIdx = (sy * width + sx) * channels;

      let r: number, g: number, b: number;
      if (isHalf) {
        r = halfToFloat(data[srcIdx]);
        g = halfToFloat(data[srcIdx + 1]);
        b = halfToFloat(data[srcIdx + 2]);
      } else {
        r = data[srcIdx];
        g = data[srcIdx + 1];
        b = data[srcIdx + 2];
      }

      // Clamp negative values (shouldn't happen in valid HDR but be safe)
      r = Math.max(0, r);
      g = Math.max(0, g);
      b = Math.max(0, b);

      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const gi = gy * GRID_W + gx;

      grid[gi] += luminance * cosWeight;
      gridR[gi] += r * cosWeight;
      gridG[gi] += g * cosWeight;
      gridB[gi] += b * cosWeight;
      gridCount[gi] += cosWeight;
    }
  }

  // Normalize by sample count
  for (let i = 0; i < grid.length; i++) {
    if (gridCount[i] > 0) {
      grid[i] /= gridCount[i];
      gridR[i] /= gridCount[i];
      gridG[i] /= gridCount[i];
      gridB[i] /= gridCount[i];
    }
  }

  // 2. Compute median luminance and threshold
  const sorted = Array.from(grid)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { lights: [], wasAnalyzed: true };
  }
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = median * THRESHOLD_MULTIPLIER;

  // 3. Mark bright pixels
  const bright = new Uint8Array(GRID_W * GRID_H);
  for (let i = 0; i < grid.length; i++) {
    bright[i] = grid[i] >= threshold ? 1 : 0;
  }

  // 4. Flood-fill clustering
  const visited = new Uint8Array(GRID_W * GRID_H);
  const clusters: Array<{
    totalLum: number;
    totalR: number;
    totalG: number;
    totalB: number;
    weightedGx: number;
    weightedGy: number;
    count: number;
  }> = [];

  for (let startY = 0; startY < GRID_H; startY++) {
    for (let startX = 0; startX < GRID_W; startX++) {
      const startIdx = startY * GRID_W + startX;
      if (!bright[startIdx] || visited[startIdx]) continue;

      // BFS flood-fill
      const cluster = {
        totalLum: 0,
        totalR: 0,
        totalG: 0,
        totalB: 0,
        weightedGx: 0,
        weightedGy: 0,
        count: 0,
      };

      const queue: number[] = [startIdx];
      visited[startIdx] = 1;

      while (queue.length > 0) {
        const idx = queue.pop()!;
        const cy = Math.floor(idx / GRID_W);
        const cx = idx % GRID_W;
        const lum = grid[idx];

        cluster.totalLum += lum;
        cluster.totalR += gridR[idx] * lum;
        cluster.totalG += gridG[idx] * lum;
        cluster.totalB += gridB[idx] * lum;
        cluster.weightedGx += cx * lum;
        cluster.weightedGy += cy * lum;
        cluster.count++;

        // 4-connected neighbors (wrap horizontally for equirectangular)
        const neighbors = [
          [cx, cy - 1],
          [cx, cy + 1],
          [(cx - 1 + GRID_W) % GRID_W, cy],
          [(cx + 1) % GRID_W, cy],
        ];

        for (const [nx, ny] of neighbors) {
          if (ny < 0 || ny >= GRID_H) continue;
          const ni = ny * GRID_W + nx;
          if (!bright[ni] || visited[ni]) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }

      if (cluster.count > 0) {
        clusters.push(cluster);
      }
    }
  }

  if (clusters.length === 0) {
    return { lights: [], wasAnalyzed: true };
  }

  // 5. Sort by total luminance (brightest first) and take top N
  clusters.sort((a, b) => b.totalLum - a.totalLum);
  const topClusters = clusters.slice(0, MAX_LIGHTS);

  // Find max total luminance for normalization
  const maxLum = topClusters[0].totalLum;

  // 6. Convert centroids to 3D direction vectors
  const lights: DetectedLight[] = topClusters.map((c) => {
    // Centroid in grid coordinates
    const cx = c.weightedGx / c.totalLum;
    const cy = c.weightedGy / c.totalLum;

    // Convert to equirectangular UV
    const u = cx / GRID_W;
    const v = cy / GRID_H;

    // Convert to spherical: theta = azimuth, phi = elevation
    // Y-up convention (before Z-up rotation applied in viewer.ts)
    const theta = (u - 0.5) * 2 * Math.PI;
    const phi = (0.5 - v) * Math.PI;

    const cosPhi = Math.cos(phi);
    const direction: [number, number, number] = [
      Math.cos(theta) * cosPhi,
      Math.sin(phi),
      Math.sin(theta) * cosPhi,
    ];

    // Normalize color
    const colorTotal = c.totalR + c.totalG + c.totalB;
    let color: [number, number, number];
    if (colorTotal > 0) {
      color = [
        (c.totalR / colorTotal) * 3,
        (c.totalG / colorTotal) * 3,
        (c.totalB / colorTotal) * 3,
      ];
      // Clamp to 0-1
      color = [
        Math.min(1, color[0]),
        Math.min(1, color[1]),
        Math.min(1, color[2]),
      ];
    } else {
      color = [1, 1, 1];
    }

    return {
      direction,
      intensity: c.totalLum / maxLum,
      color,
    };
  });

  logger.debug(
    `Light detection: found ${lights.length} dominant light(s) from ${clusters.length} cluster(s)`,
  );

  return { lights, wasAnalyzed: true };
}

/**
 * Return hardcoded fallback lights for procedural RoomEnvironment.
 *
 * The RoomEnvironment has no raw HDR data to analyze. A single top-front
 * light direction approximates its primary illumination.
 */
export function getDefaultLights(): LightDetectionResult {
  // Top-front-right direction (Y-up, similar to RoomEnvironment's main emitter)
  const dir = normalize([0.3, 0.8, 0.5]);
  return {
    lights: [
      {
        direction: dir,
        intensity: 1.0,
        color: [1, 1, 1],
      },
    ],
    wasAnalyzed: false,
  };
}

/** Normalize a 3-component vector in-place and return it. */
function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}
