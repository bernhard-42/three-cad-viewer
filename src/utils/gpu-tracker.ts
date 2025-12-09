/**
 * GPU Resource Tracker for three-cad-viewer.
 *
 * Tracks Three.js GPU resources (geometries, materials, textures) to detect memory leaks
 * or inspect current allocations. By default, only maintains counts. Enable debug mode
 * for detailed creation info.
 *
 * @example
 * // Check resource counts
 * import { gpuTracker } from "three-cad-viewer";
 * console.log(gpuTracker.summary);
 * // { geometry: 5, material: 10, texture: 1, total: 16 }
 *
 * @example
 * // Debug mode - see detailed allocation info
 * gpuTracker.enableDebug();
 * // ... create viewer and render objects ...
 * gpuTracker.details(); // Shows what's currently allocated
 * // ... dispose viewer ...
 * gpuTracker.details(); // After dispose, shows any leaks
 */

import { logger } from "./logger.js";

/** Resource types tracked by the GPU tracker */
export type ResourceType = "geometry" | "material" | "texture";

/** Information about a tracked resource (debug mode only) */
export interface TrackedResource {
  /** Type of GPU resource */
  type: ResourceType;
  /** Human-readable label for identification */
  label: string;
  /** Stack trace at creation time (truncated) */
  stack: string;
  /** Timestamp of creation (performance.now()) */
  timestamp: number;
}

/** Summary of current resource counts */
export interface ResourceSummary {
  geometry: number;
  material: number;
  texture: number;
  total: number;
}

// Internal state
const counts: Record<ResourceType, number> = {
  geometry: 0,
  material: 0,
  texture: 0,
};

let debugMode = false;
const tracked = new Map<object, TrackedResource>();

/**
 * GPU Resource Tracker.
 *
 * Tracks creation and disposal of Three.js GPU resources to help detect memory leaks.
 * Access via `window.tcv_gpu` in browser console for debugging.
 */
export const gpuTracker = {
  /**
   * Enable debug mode to capture creation info (stack traces, labels).
   * Call before creating any viewer resources for full tracking.
   *
   * Performance impact: Captures stack trace on every resource creation.
   * Only enable when debugging leaks.
   */
  enableDebug(): void {
    debugMode = true;
    logger.info("GPU tracker debug mode enabled");
  },

  /**
   * Disable debug mode and clear tracked objects.
   */
  disableDebug(): void {
    debugMode = false;
    tracked.clear();
    logger.info("GPU tracker debug mode disabled");
  },

  /**
   * Check if debug mode is enabled.
   */
  get isDebugEnabled(): boolean {
    return debugMode;
  },

  /**
   * Track a GPU resource creation.
   *
   * @param type - Resource type (geometry, material, texture)
   * @param obj - The Three.js object being tracked
   * @param label - Optional descriptive label (e.g., "front face material for /Assembly/Part1")
   */
  track(type: ResourceType, obj: object, label?: string): void {
    counts[type]++;

    if (debugMode) {
      // Capture stack trace, skip first 2 lines (Error + this function)
      const stack = new Error().stack?.split("\n").slice(2, 6).join("\n") ?? "";

      tracked.set(obj, {
        type,
        label: label ?? "unlabeled",
        stack,
        timestamp: performance.now(),
      });
    }
  },

  /**
   * Untrack a GPU resource after disposal.
   *
   * @param type - Resource type (required in non-debug mode)
   * @param obj - The Three.js object being untracked (optional in non-debug mode)
   */
  untrack(type: ResourceType, obj?: object): void {
    if (debugMode && obj) {
      const info = tracked.get(obj);
      if (info) {
        counts[info.type]--;
        tracked.delete(obj);
        return;
      }
      // Object not found - was created before debug mode enabled or before tracking was added
      // Don't warn, just fall through to decrement (or skip if count is 0)
    }

    // Non-debug mode or object not found: decrement counter if positive
    // Silently ignore if count is already 0 (resource wasn't tracked)
    if (counts[type] > 0) {
      counts[type]--;
    }
  },

  /**
   * Get current resource counts.
   */
  get summary(): ResourceSummary {
    return {
      geometry: counts.geometry,
      material: counts.material,
      texture: counts.texture,
      total: counts.geometry + counts.material + counts.texture,
    };
  },

  /**
   * Get all tracked resources (debug mode only).
   *
   * @returns Array of currently tracked resources
   */
  getResources(): TrackedResource[] {
    if (!debugMode) {
      logger.warn("GPU tracker: getResources() requires debug mode - call enableDebug() first");
      return [];
    }
    return Array.from(tracked.values());
  },

  /**
   * Get tracked resources grouped by type.
   */
  getResourcesByType(): Record<ResourceType, TrackedResource[]> {
    const resources = this.getResources();
    return {
      geometry: resources.filter((r) => r.type === "geometry"),
      material: resources.filter((r) => r.type === "material"),
      texture: resources.filter((r) => r.type === "texture"),
    };
  },

  /**
   * Log details of currently tracked resources.
   * Useful for inspecting allocations or detecting leaks after disposal.
   * Always outputs to console regardless of logger level.
   */
  details(): void {
    const { total, geometry, material, texture } = this.summary;

    if (total === 0) {
      console.log("GPU tracker: No resources currently allocated");
      return;
    }

    console.log(`GPU tracker: ${total} resources allocated:`);
    console.log(`  - Geometries: ${geometry}`);
    console.log(`  - Materials: ${material}`);
    console.log(`  - Textures: ${texture}`);

    if (debugMode) {
      const resources = this.getResources();
      console.log("\nResource details:");
      resources.forEach((resource, i) => {
        console.log(`\n[${i + 1}] ${resource.type}: ${resource.label}`);
        console.log(`    Created at: ${resource.timestamp.toFixed(2)}ms`);
        console.log(`    Stack:\n${resource.stack}`);
      });
    } else {
      console.log("\nFor detailed resource info, enable debug mode before creating resources:");
      console.log("  gpuTracker.enableDebug()");
    }
  },

  /**
   * Reset all counters and tracked objects.
   * Useful for testing or starting fresh.
   */
  reset(): void {
    counts.geometry = 0;
    counts.material = 0;
    counts.texture = 0;
    tracked.clear();
  },

  /**
   * Assert that all resources have been disposed.
   * Useful in tests.
   *
   * @throws Error if any resources remain
   */
  assertEmpty(): void {
    const { total } = this.summary;
    if (total !== 0) {
      this.details();
      throw new Error(`GPU tracker: ${total} resources not disposed`);
    }
  },

  // Convenience methods for common Three.js types

  /**
   * Track a geometry and return it (for chaining).
   */
  trackGeometry<T extends object>(geometry: T, label?: string): T {
    this.track("geometry", geometry, label);
    return geometry;
  },

  /**
   * Track a material and return it (for chaining).
   */
  trackMaterial<T extends object>(material: T, label?: string): T {
    this.track("material", material, label);
    return material;
  },

  /**
   * Track a texture and return it (for chaining).
   */
  trackTexture<T extends object>(texture: T, label?: string): T {
    this.track("texture", texture, label);
    return texture;
  },
};

// Expose globally for browser debugging
if (typeof window !== "undefined") {
  (window as unknown as { tcv_gpu: typeof gpuTracker }).tcv_gpu = gpuTracker;
}
