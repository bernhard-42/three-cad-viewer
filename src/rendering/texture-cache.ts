import * as THREE from "three";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// Constants
// =============================================================================

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

/**
 * Three.js MeshPhysicalMaterial map property names that carry sRGB color data.
 *
 * Used by threejs-materials integration where texture params use Three.js property
 * names directly (e.g., "map", "emissiveMap") instead of MaterialAppearance
 * role names (e.g., "baseColorTexture", "emissiveTexture").
 */
const THREEJS_SRGB_MAPS = new Set([
  "map",
  "emissiveMap",
  "sheenColorMap",
  "specularColorMap",
]);

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
 * 1. `data:` prefix -- treat as data URI, load directly
 * 2. Otherwise -- treat as URL, resolve relative to HTML page
 *
 * Features:
 * - In-flight promise deduplication (no duplicate loads for the same key)
 * - Correct colorSpace assignment per texture semantic role
 * - GPU resource tracking via gpuTracker
 */
class TextureCache {
  /** Textures cache (disposed on clear/dispose, rebuilt per shape data) */
  private _cache: Map<string, THREE.Texture> = new Map();

  /** In-flight load promises keyed by cache key */
  private _inflight: Map<string, Promise<THREE.Texture>> = new Map();

  /** THREE.TextureLoader instance (created lazily) */
  private _textureLoader: THREE.TextureLoader | null = null;

  /** Whether this cache has been fully disposed */
  private _disposed = false;

  /** Max anisotropic filtering level.
   *  Default 16 covers most GPUs; clamped by the driver if unsupported. */
  maxAnisotropy = 16;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Resolve a texture reference string and return a cached or newly loaded
   * THREE.Texture with the correct colorSpace set.
   *
   * @param ref - Texture reference string (table key, data URI, or URL)
   * @param textureRole - The texture role name (MaterialAppearance field name or proxy role)
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

    // 1. data: prefix (data URI)
    if (ref.startsWith("data:")) {
      return this._getFromDataUri(ref, colorSpace);
    }

    // 2. URL (relative to HTML page)
    return this._getFromUrl(ref, colorSpace);
  }

  /**
   * Dispose textures (called on viewer.clear() when shape data is replaced).
   *
   * Disposes all textures in the cache and clears in-flight promises.
   */
  dispose(): void {
    for (const [key, texture] of this._cache) {
      gpuTracker.untrack("texture", texture);
      texture.dispose();
      logger.debug(`Disposed texture: ${key}`);
    }
    this._cache.clear();

    // Clear in-flight promises (they may resolve but won't be used)
    this._inflight.clear();
  }

  /**
   * Dispose all textures.
   *
   * Called on viewer.dispose() when the viewer is fully torn down.
   * After this call, the TextureCache cannot be used again.
   */
  disposeFull(): void {
    this._disposed = true;
    this.dispose();
    this._textureLoader = null;
    logger.debug("TextureCache fully disposed");
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
          texture.anisotropy = this.maxAnisotropy;
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

}

/**
 * Get the correct color space for a Three.js material map property name.
 *
 * sRGB maps (color data): map, emissiveMap, sheenColorMap, specularColorMap
 * Linear maps (non-color data): everything else (normalMap, roughnessMap, etc.)
 *
 * @param mapName - Three.js material property name (e.g., "map", "normalMap")
 * @returns THREE.SRGBColorSpace or THREE.LinearSRGBColorSpace
 */
function getColorSpaceForMap(mapName: string): THREE.ColorSpace {
  return THREEJS_SRGB_MAPS.has(mapName) ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
}

export { TextureCache, SRGB_TEXTURE_ROLES, getColorSpaceForMap };
