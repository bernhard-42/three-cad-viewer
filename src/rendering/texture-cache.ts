import * as THREE from "three";
import type { TextureEntry } from "../core/types.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// Constants
// =============================================================================

/** Size of procedurally generated builtin textures (pixels) */
const BUILTIN_SIZE = 256;

/** Names of all supported builtin procedural textures */
const BUILTIN_NAMES = [
  "brushed",
  "knurled",
  "sandblasted",
  "hammered",
  "checker",
] as const;

type BuiltinName = (typeof BUILTIN_NAMES)[number];

/**
 * Texture fields that carry sRGB color data.
 *
 * When a texture is used for one of these roles, its `colorSpace` must be set
 * to `SRGBColorSpace` so Three.js applies the sRGB-to-linear decode on
 * sampling. All other texture roles (normal, metallic-roughness, occlusion,
 * thickness, transmission, roughness maps) remain `LinearSRGBColorSpace`.
 */
const SRGB_TEXTURE_ROLES = new Set([
  "baseColorTexture",
  "emissiveTexture",
  "sheenColorTexture",
  "specularColorTexture",
]);

// =============================================================================
// Builtin Procedural Texture Generators
// =============================================================================

/**
 * Create a 2D canvas context of the given size.
 */
function createCanvas(size: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  // Prefer OffscreenCanvas when available (Web Workers, modern browsers)
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d")!;
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

/**
 * Simple pseudo-random number generator (mulberry32) for deterministic output.
 * Ensures builtin textures look identical across sessions.
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a brushed-metal normal map.
 *
 * Creates horizontal noise streaks simulating directional brushing.
 * The streaks run along the X axis with slight vertical variation.
 */
function generateBrushed(size: number): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = createCanvas(size);
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const rng = mulberry32(42);

  // Generate per-row intensity variation (horizontal streaks)
  const rowIntensity = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    rowIntensity[y] = 0.3 + rng() * 0.7;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // High-frequency horizontal noise for brush lines
      const noise = (rng() - 0.5) * 0.15 * rowIntensity[y];

      // Slight vertical gradient perturbation
      const yNoise = (rng() - 0.5) * 0.05;

      // Normal map encoding: (0.5, 0.5, 1.0) = flat
      data[idx] = Math.round((0.5 + noise) * 255);     // R: tangent X
      data[idx + 1] = Math.round((0.5 + yNoise) * 255); // G: tangent Y
      data[idx + 2] = 255;                                // B: tangent Z (flat)
      data[idx + 3] = 255;                                // A: opaque
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Generate a diamond knurl pattern normal map.
 *
 * Creates a repeating diamond grid pattern typical of knurled metal surfaces.
 */
function generateKnurled(size: number): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = createCanvas(size);
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const diamonds = 16; // Number of diamond repeats
  const step = size / diamonds;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Diamond pattern using modular arithmetic
      const dx = ((x % step) / step) * 2 - 1; // -1 to 1 within cell
      const dy = ((y % step) / step) * 2 - 1;

      // Diamond distance (L1 norm)
      const dist = Math.abs(dx) + Math.abs(dy);

      // Gradient direction for normal
      const sx = dx > 0 ? 1 : -1;
      const sy = dy > 0 ? 1 : -1;

      // Smooth pyramid shape
      const strength = 0.3;
      const nx = dist < 1 ? sx * strength * (1 - dist) : 0;
      const ny = dist < 1 ? sy * strength * (1 - dist) : 0;

      data[idx] = Math.round((0.5 + nx) * 255);
      data[idx + 1] = Math.round((0.5 + ny) * 255);
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Generate a sandblasted surface normal map.
 *
 * Creates fine random grain using layered noise at different frequencies,
 * simulating a sandblasted or bead-blasted metal surface.
 */
function generateSandblasted(size: number): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = createCanvas(size);
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const rng = mulberry32(137);

  // Generate a height field with multi-octave noise
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = rng() * 0.5 + rng() * 0.3 + rng() * 0.2;
  }

  // Derive normals from height field via finite differences
  const strength = 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const xp = (x + 1) % size;
      const xm = (x - 1 + size) % size;
      const yp = (y + 1) % size;
      const ym = (y - 1 + size) % size;

      const dhdx = (heights[y * size + xp] - heights[y * size + xm]) * 0.5;
      const dhdy = (heights[yp * size + x] - heights[ym * size + x]) * 0.5;

      data[idx] = Math.round((0.5 - dhdx * strength) * 255);
      data[idx + 1] = Math.round((0.5 - dhdy * strength) * 255);
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Generate a hammered/peened surface normal map.
 *
 * Creates random crater bumps simulating a hand-hammered metal surface.
 */
function generateHammered(size: number): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = createCanvas(size);
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const rng = mulberry32(314);

  // Generate a height field with random circular craters
  const heights = new Float32Array(size * size);
  const craterCount = 80;

  for (let c = 0; c < craterCount; c++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = 8 + rng() * 16;
    const depth = 0.3 + rng() * 0.7;

    // Stamp crater (with wrapping for tileable texture)
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          const px = ((Math.round(cx + dx) % size) + size) % size;
          const py = ((Math.round(cy + dy) % size) + size) % size;
          // Smooth hemisphere shape
          const t = 1 - d2 / r2;
          heights[py * size + px] += depth * t * t;
        }
      }
    }
  }

  // Derive normals from height field
  const strength = 0.25;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const xp = (x + 1) % size;
      const xm = (x - 1 + size) % size;
      const yp = (y + 1) % size;
      const ym = (y - 1 + size) % size;

      const dhdx = (heights[y * size + xp] - heights[y * size + xm]) * 0.5;
      const dhdy = (heights[yp * size + x] - heights[ym * size + x]) * 0.5;

      data[idx] = Math.round(Math.max(0, Math.min(255, (0.5 - dhdx * strength) * 255)));
      data[idx + 1] = Math.round(Math.max(0, Math.min(255, (0.5 - dhdy * strength) * 255)));
      data[idx + 2] = 255;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Generate a black/white checkerboard texture.
 *
 * Useful for UV debugging and as a base color texture for testing.
 */
function generateChecker(size: number): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = createCanvas(size);
  const squares = 8; // 8x8 checkerboard
  const step = size / squares;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#000000";
  for (let row = 0; row < squares; row++) {
    for (let col = 0; col < squares; col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillRect(col * step, row * step, step, step);
      }
    }
  }

  return canvas;
}

/** Map of builtin texture names to their generator functions */
const BUILTIN_GENERATORS: Record<
  BuiltinName,
  (size: number) => HTMLCanvasElement | OffscreenCanvas
> = {
  brushed: generateBrushed,
  knurled: generateKnurled,
  sandblasted: generateSandblasted,
  hammered: generateHammered,
  checker: generateChecker,
};

// =============================================================================
// TextureCache
// =============================================================================

/**
 * Manages loading, caching, and lifecycle of all Studio mode textures.
 *
 * The TextureCache is the **sole owner** of all THREE.Texture objects used by
 * Studio mode. Materials reference textures but never dispose them directly.
 * Only TextureCache.dispose() / disposeFull() disposes GPU texture resources.
 *
 * Resolution order for texture reference strings:
 * 1. `builtin:` prefix -- procedural texture from the persistent builtin cache
 * 2. Key in the root-level `textures` table -- embedded data or URL
 * 3. `data:` prefix -- treat as data URI, load directly
 * 4. Otherwise -- treat as URL, resolve relative to HTML page
 *
 * Features:
 * - Two-tier caching: user textures (disposed on clear) + builtin textures
 *   (persistent, only disposed on viewer teardown)
 * - In-flight promise deduplication (no duplicate loads for the same key)
 * - Correct colorSpace assignment per texture semantic role
 * - GPU resource tracking via gpuTracker
 */
class TextureCache {
  /** User textures cache (disposed on clear/dispose, rebuilt per shape data) */
  private _cache: Map<string, THREE.Texture> = new Map();

  /** Built-in procedural textures (persistent, only disposed via disposeFull) */
  private _builtinCache: Map<string, THREE.Texture> = new Map();

  /** In-flight load promises keyed by cache key */
  private _inflight: Map<string, Promise<THREE.Texture>> = new Map();

  /** Root-level textures table from shape data */
  private _texturesTable: Record<string, TextureEntry> = {};

  /** THREE.TextureLoader instance (created lazily) */
  private _textureLoader: THREE.TextureLoader | null = null;

  /** Whether this cache has been fully disposed */
  private _disposed = false;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Set or update the root-level textures table.
   *
   * Called when new shape data is loaded. The table maps string keys to
   * TextureEntry objects (embedded base64 data or URL references).
   *
   * @param table - The textures table from root Shapes node, or undefined to clear
   */
  setTexturesTable(table: Record<string, TextureEntry> | undefined): void {
    this._texturesTable = table ?? {};
  }

  /**
   * Resolve a texture reference string and return a cached or newly loaded
   * THREE.Texture with the correct colorSpace set.
   *
   * @param ref - Texture reference string (builtin name, table key, data URI, or URL)
   * @param textureRole - The MaterialAppearance field name using this texture
   *   (e.g. "baseColorTexture", "normalTexture"). Used to determine colorSpace.
   * @returns The resolved THREE.Texture, or null if the reference is invalid
   *   or loading fails
   */
  async get(
    ref: string,
    textureRole: string,
  ): Promise<THREE.Texture | null> {
    if (this._disposed) {
      logger.warn("TextureCache.get() called after dispose");
      return null;
    }

    if (!ref) {
      return null;
    }

    // Determine the target color space based on the texture role
    const colorSpace = SRGB_TEXTURE_ROLES.has(textureRole)
      ? THREE.SRGBColorSpace
      : THREE.LinearSRGBColorSpace;

    // 1. builtin: prefix
    if (ref.startsWith("builtin:")) {
      return this._getBuiltin(ref, colorSpace);
    }

    // 2. Look up in textures table
    const tableEntry = this._texturesTable[ref];
    if (tableEntry) {
      return this._getFromTable(ref, tableEntry, colorSpace);
    }

    // 3. data: prefix (data URI)
    if (ref.startsWith("data:")) {
      return this._getFromDataUri(ref, colorSpace);
    }

    // 4. URL (relative to HTML page)
    return this._getFromUrl(ref, colorSpace);
  }

  /**
   * Check whether a texture reference string would resolve to a builtin texture.
   */
  isBuiltin(ref: string): boolean {
    return ref.startsWith("builtin:");
  }

  /**
   * Dispose user textures (called on viewer.clear() when shape data is replaced).
   *
   * Disposes all textures in the user cache and clears in-flight promises.
   * The builtin procedural texture cache is preserved.
   */
  dispose(): void {
    // Dispose user textures
    for (const [key, texture] of this._cache) {
      gpuTracker.untrack("texture", texture);
      texture.dispose();
      logger.debug(`Disposed user texture: ${key}`);
    }
    this._cache.clear();

    // Clear in-flight promises (they may resolve but won't be used)
    this._inflight.clear();

    // Clear the textures table (will be set again with new shape data)
    this._texturesTable = {};
  }

  /**
   * Dispose all textures including builtin procedural textures.
   *
   * Called on viewer.dispose() when the viewer is fully torn down.
   * After this call, the TextureCache cannot be used again.
   */
  disposeFull(): void {
    this._disposed = true;

    // Dispose user textures first
    this.dispose();

    // Dispose builtin textures
    for (const [key, texture] of this._builtinCache) {
      gpuTracker.untrack("texture", texture);
      texture.dispose();
      logger.debug(`Disposed builtin texture: ${key}`);
    }
    this._builtinCache.clear();

    // Null the texture loader reference
    this._textureLoader = null;

    logger.debug("TextureCache fully disposed");
  }

  // ---------------------------------------------------------------------------
  // Private: Builtin procedural textures
  // ---------------------------------------------------------------------------

  /**
   * Get or generate a builtin procedural texture.
   *
   * Builtin textures are cached in the persistent `_builtinCache` and survive
   * `dispose()` calls. They are only freed via `disposeFull()`.
   */
  private _getBuiltin(
    ref: string,
    colorSpace: THREE.ColorSpace,
  ): THREE.Texture | null {
    // Extract name after "builtin:" prefix
    const name = ref.slice(8) as BuiltinName;

    if (!BUILTIN_GENERATORS[name]) {
      logger.warn(`Unknown builtin texture: "${ref}". Available: ${BUILTIN_NAMES.join(", ")}`);
      return null;
    }

    // Check builtin cache
    const cached = this._builtinCache.get(ref);
    if (cached) {
      // TODO: If the same builtin is used in different roles (sRGB vs Linear),
      // mutating colorSpace in-place would affect other materials. This is
      // unlikely for builtins (almost always normal maps) but could be fixed
      // with a composite cache key (ref + colorSpace) if needed.
      cached.colorSpace = colorSpace;
      return cached;
    }

    // Generate the procedural texture
    const canvas = BUILTIN_GENERATORS[name](BUILTIN_SIZE);
    const texture = new THREE.CanvasTexture(canvas as TexImageSource);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = colorSpace;
    texture.needsUpdate = true;

    // Cache in the persistent builtin cache
    this._builtinCache.set(ref, texture);
    gpuTracker.trackTexture(texture, `Builtin procedural texture: ${ref}`);
    logger.debug(`Generated builtin texture: ${ref}`);

    return texture;
  }

  // ---------------------------------------------------------------------------
  // Private: Table entry loading
  // ---------------------------------------------------------------------------

  /**
   * Load a texture from the root-level textures table entry.
   *
   * Handles both embedded (base64 data) and URL-referenced entries.
   */
  private async _getFromTable(
    key: string,
    entry: TextureEntry,
    colorSpace: THREE.ColorSpace,
  ): Promise<THREE.Texture | null> {
    // Check user cache
    // TODO: If the same texture table entry is used in different roles
    // (sRGB vs Linear), mutating colorSpace in-place would affect other
    // materials. Could be fixed with a composite cache key (key + colorSpace).
    const cached = this._cache.get(key);
    if (cached) {
      cached.colorSpace = colorSpace;
      return cached;
    }

    // Check in-flight
    const inflight = this._inflight.get(key);
    if (inflight) {
      const texture = await inflight;
      texture.colorSpace = colorSpace;
      return texture;
    }

    // Resolve table entry to a loadable source
    if (entry.data && entry.format) {
      // Embedded: construct data URI from base64 data
      const mimeType = this._formatToMime(entry.format);
      const dataUri = `data:${mimeType};base64,${entry.data}`;
      return this._loadAndCache(key, dataUri, colorSpace);
    }

    if (entry.url) {
      // URL reference
      return this._loadAndCache(key, entry.url, colorSpace);
    }

    // Invalid entry (neither data nor url)
    logger.warn(`Texture table entry "${key}" has neither data nor url, skipping`);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Private: Data URI loading
  // ---------------------------------------------------------------------------

  /**
   * Load a texture from a data URI string.
   */
  private async _getFromDataUri(
    dataUri: string,
    colorSpace: THREE.ColorSpace,
  ): Promise<THREE.Texture | null> {
    // Use the data URI itself as the cache key
    const cacheKey = dataUri;

    const cached = this._cache.get(cacheKey);
    if (cached) {
      cached.colorSpace = colorSpace;
      return cached;
    }

    const inflight = this._inflight.get(cacheKey);
    if (inflight) {
      const texture = await inflight;
      texture.colorSpace = colorSpace;
      return texture;
    }

    return this._loadAndCache(cacheKey, dataUri, colorSpace);
  }

  // ---------------------------------------------------------------------------
  // Private: URL loading
  // ---------------------------------------------------------------------------

  /**
   * Load a texture from a URL (resolved relative to the HTML page).
   */
  private async _getFromUrl(
    url: string,
    colorSpace: THREE.ColorSpace,
  ): Promise<THREE.Texture | null> {
    const cached = this._cache.get(url);
    if (cached) {
      cached.colorSpace = colorSpace;
      return cached;
    }

    const inflight = this._inflight.get(url);
    if (inflight) {
      const texture = await inflight;
      texture.colorSpace = colorSpace;
      return texture;
    }

    return this._loadAndCache(url, url, colorSpace);
  }

  // ---------------------------------------------------------------------------
  // Private: Core loading
  // ---------------------------------------------------------------------------

  /**
   * Load a texture from a source (URL or data URI), cache it, and return it.
   *
   * Deduplicates in-flight loads for the same cache key.
   *
   * @param cacheKey - Key for the user cache
   * @param source - URL or data URI to load from
   * @param colorSpace - Color space to assign to the loaded texture
   * @returns The loaded texture, or null on failure
   */
  private async _loadAndCache(
    cacheKey: string,
    source: string,
    colorSpace: THREE.ColorSpace,
  ): Promise<THREE.Texture | null> {
    const promise = this._doLoad(source, colorSpace);
    this._inflight.set(cacheKey, promise);

    try {
      const texture = await promise;

      // Check if disposed while loading:
      // - disposeFull() sets _disposed
      // - dispose() clears _inflight (so our entry is gone)
      if (this._disposed || !this._inflight.has(cacheKey)) {
        texture.dispose();
        return null;
      }

      // Cache and track
      this._cache.set(cacheKey, texture);
      const label = cacheKey.startsWith("data:")
        ? `Texture (data URI, ${cacheKey.length} chars)`
        : `Texture: ${cacheKey}`;
      gpuTracker.trackTexture(texture, label);
      logger.debug(`Loaded and cached texture: ${label}`);

      return texture;
    } catch (error) {
      if (this._disposed) return null;

      const displayKey = cacheKey.startsWith("data:")
        ? `data URI (${cacheKey.length} chars)`
        : cacheKey;
      logger.warn(
        `Failed to load texture "${displayKey}":`,
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      this._inflight.delete(cacheKey);
    }
  }

  /**
   * Perform the actual texture load via THREE.TextureLoader.
   *
   * THREE.TextureLoader handles both URLs and data URIs.
   */
  private _doLoad(
    source: string,
    colorSpace: THREE.ColorSpace,
  ): Promise<THREE.Texture> {
    const loader = this._ensureTextureLoader();

    return new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        source,
        (texture) => {
          texture.colorSpace = colorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          resolve(texture);
        },
        undefined, // onProgress (not used)
        (error) => {
          reject(
            error instanceof Error
              ? error
              : new Error(`Texture load failed: ${source.substring(0, 100)}`),
          );
        },
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Private: Utilities
  // ---------------------------------------------------------------------------

  /**
   * Get or create the THREE.TextureLoader (lazy initialization).
   */
  private _ensureTextureLoader(): THREE.TextureLoader {
    if (!this._textureLoader) {
      this._textureLoader = new THREE.TextureLoader();
      logger.debug("Created TextureLoader");
    }
    return this._textureLoader;
  }

  /**
   * Convert a format string (e.g. "png", "jpg", "webp") to a MIME type.
   */
  private _formatToMime(format: string): string {
    switch (format.toLowerCase()) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      default:
        // Default to PNG for unknown formats
        logger.warn(`Unknown texture format "${format}", defaulting to image/png`);
        return "image/png";
    }
  }
}

export { TextureCache, SRGB_TEXTURE_ROLES, BUILTIN_NAMES };
