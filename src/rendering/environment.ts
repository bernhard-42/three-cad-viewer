import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import type { StudioEnvironment } from "../core/types.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";

/**
 * Default HDR preset URLs.
 *
 * Hosted on Poly Haven CDN (CC0 license, permissive CORS).
 * Host applications can override these via the `presetUrls` constructor option.
 */
const DEFAULT_PRESET_URLS: Record<string, string> = {
  neutral:
    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_03_1k.hdr",
  outdoor:
    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/royal_esplanade_1k.hdr",
};

/**
 * Configuration options for EnvironmentManager.
 */
interface EnvironmentManagerOptions {
  /** Override URLs for the "neutral" and "outdoor" HDR presets */
  presetUrls?: Partial<Record<string, string>>;
}

/**
 * Manages environment maps for Studio mode.
 *
 * Handles three tiers of environment sources:
 * - **Tier 1 "studio"**: Procedural RoomEnvironment (bundled, zero network)
 * - **Tier 2 "neutral"/"outdoor"**: HDR presets loaded from configurable CDN URLs
 * - **Tier 3 custom URL**: User-provided HDR URL (same loading path as Tier 2)
 *
 * Features:
 * - PMREM generation and caching for all tiers
 * - In-flight promise deduplication (prevents duplicate loads on rapid switching)
 * - Lazy PMREMGenerator creation
 * - Fallback to "studio" on HDR load failure
 * - GPU resource tracking via gpuTracker
 */
class EnvironmentManager {
  /** Cached PMREM render targets keyed by environment name or URL */
  private _cache: Map<string, THREE.WebGLRenderTarget> = new Map();

  /** In-flight load promises keyed by environment name or URL */
  private _inflight: Map<string, Promise<THREE.Texture>> = new Map();

  /** Lazily-created PMREMGenerator instance */
  private _pmremGenerator: THREE.PMREMGenerator | null = null;

  /** Resolved preset URLs (defaults merged with user overrides) */
  private _presetUrls: Record<string, string>;

  /** HDRLoader instance (created lazily on first HDR load) */
  private _hdrLoader: HDRLoader | null = null;

  /** The last loaded PMREM texture (stateful — used by apply()) */
  private _currentTexture: THREE.Texture | null = null;

  /** Whether this manager has been disposed */
  private _disposed = false;

  constructor(options: EnvironmentManagerOptions = {}) {
    this._presetUrls = {
      ...DEFAULT_PRESET_URLS,
      ...(options.presetUrls as Record<string, string> | undefined),
    };
  }

  /**
   * Load or retrieve an environment map.
   *
   * Resolves the environment name to a loading strategy:
   * - `"studio"` -- procedural RoomEnvironment via PMREMGenerator.fromScene()
   * - `"neutral"` / `"outdoor"` -- HDR preset from configured CDN URL
   * - `"none"` -- returns null (caller should call `remove()` instead)
   * - Any other string -- treated as a custom HDR URL
   *
   * Results are cached. If a load is already in flight for the same key,
   * the existing promise is returned (no duplicate loads).
   *
   * @param name - Environment preset name or custom HDR URL
   * @param renderer - WebGL renderer (needed for PMREMGenerator)
   * @returns PMREM texture, or null for "none"
   */
  async loadEnvironment(
    name: StudioEnvironment | string,
    renderer: THREE.WebGLRenderer,
  ): Promise<THREE.Texture | null> {
    if (this._disposed) {
      logger.warn("EnvironmentManager.loadEnvironment() called after dispose");
      return null;
    }

    if (name === "none") {
      this._currentTexture = null;
      return null;
    }

    // Check cache first (name is the cache key for presets; URL string for custom)
    const cacheKey = name;
    const cached = this._cache.get(cacheKey);
    if (cached) {
      logger.debug(`Environment "${cacheKey}" loaded from cache`);
      this._currentTexture = cached.texture;
      return cached.texture;
    }

    // Check in-flight promise — await and set _currentTexture
    const inflight = this._inflight.get(cacheKey);
    if (inflight) {
      logger.debug(`Environment "${cacheKey}" already loading, reusing promise`);
      const texture = await inflight;
      this._currentTexture = texture;
      return texture;
    }

    // Start new load
    const promise = this._load(name, renderer);
    this._inflight.set(cacheKey, promise);

    try {
      const texture = await promise;
      this._currentTexture = texture;
      return texture;
    } finally {
      this._inflight.delete(cacheKey);
    }
  }

  /**
   * Apply the current environment map to the scene.
   *
   * Uses the texture from the last `loadEnvironment()` call.
   * Sets `scene.environment` for PBR reflections. Optionally sets
   * `scene.background` to show the environment as a visible backdrop.
   * Sets `scene.environmentIntensity` to control reflection strength.
   *
   * @param scene - The Three.js scene to apply the environment to
   * @param envIntensity - Environment intensity multiplier (0-3, default 1.0)
   * @param showBackground - Whether to show the environment as the scene background
   */
  apply(
    scene: THREE.Scene,
    envIntensity: number,
    showBackground: boolean,
  ): void {
    if (this._currentTexture) {
      scene.environment = this._currentTexture;
      scene.environmentIntensity = envIntensity;
      scene.background = showBackground ? this._currentTexture : null;
    } else {
      this.remove(scene);
    }
  }

  /**
   * Remove environment map from the scene.
   *
   * Clears `scene.environment`, `scene.background`, and resets
   * `scene.environmentIntensity` to the default of 1.0.
   *
   * @param scene - The Three.js scene to clear
   */
  remove(scene: THREE.Scene): void {
    scene.environment = null;
    scene.background = null;
    scene.environmentIntensity = 1.0;
  }

  /**
   * Dispose all cached resources.
   *
   * Disposes all cached PMREM render targets (and their textures) and
   * the PMREMGenerator. After disposal, this manager cannot be used again.
   *
   * Call this on `viewer.dispose()`, NOT on `viewer.clear()` --
   * the EnvironmentManager survives shape data clearing because
   * environments are independent of shape data.
   */
  dispose(): void {
    this._disposed = true;
    this._currentTexture = null;

    // Dispose all cached PMREM render targets (disposes textures too)
    for (const [key, renderTarget] of this._cache) {
      gpuTracker.untrack("texture", renderTarget.texture);
      renderTarget.dispose();
      logger.debug(`Disposed cached environment render target: ${key}`);
    }
    this._cache.clear();

    // Clear in-flight promises (they'll resolve but won't be cached)
    this._inflight.clear();

    // Dispose PMREMGenerator
    if (this._pmremGenerator) {
      this._pmremGenerator.dispose();
      this._pmremGenerator = null;
      logger.debug("Disposed PMREMGenerator");
    }

    // Null HDR loader reference (no explicit dispose needed)
    this._hdrLoader = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve environment name to an HDR URL, if applicable.
   *
   * Returns null for "studio" (uses RoomEnvironment, no URL).
   * Returns the preset URL for "neutral"/"outdoor".
   * Returns the name itself for custom URLs.
   */
  private _resolveUrl(name: string): string | null {
    if (name === "studio") {
      return null;
    }
    const presetUrl = this._presetUrls[name];
    if (presetUrl) {
      return presetUrl;
    }
    return name;
  }

  /**
   * Get or create the PMREMGenerator (lazy initialization).
   */
  private _ensurePmremGenerator(
    renderer: THREE.WebGLRenderer,
  ): THREE.PMREMGenerator {
    if (!this._pmremGenerator) {
      this._pmremGenerator = new THREE.PMREMGenerator(renderer);
      logger.debug("Created PMREMGenerator");
    }
    return this._pmremGenerator;
  }

  /**
   * Get or create the HDRLoader (lazy initialization).
   */
  private _ensureHdrLoader(): HDRLoader {
    if (!this._hdrLoader) {
      this._hdrLoader = new HDRLoader();
      logger.debug("Created HDRLoader");
    }
    return this._hdrLoader;
  }

  /**
   * Internal load dispatcher.
   *
   * Routes to RoomEnvironment generation or HDR loading based on the name.
   * On HDR failure, falls back to "studio" (RoomEnvironment).
   */
  private async _load(
    name: string,
    renderer: THREE.WebGLRenderer,
  ): Promise<THREE.Texture> {
    if (name === "studio") {
      return this._loadRoomEnvironment(name, renderer);
    }

    const url = this._resolveUrl(name)!;

    try {
      return await this._loadHdr(url, name, renderer);
    } catch (error) {
      if (this._disposed) throw error;
      const displayName =
        name in this._presetUrls ? name : `custom URL (${url})`;
      logger.warn(
        `Could not load environment "${displayName}", using default "studio" environment.`,
        error instanceof Error ? error.message : error,
      );
      // Fall back to RoomEnvironment
      return this._loadRoomEnvironment("studio", renderer);
    }
  }

  /**
   * Generate PMREM texture from the procedural RoomEnvironment.
   *
   * This is synchronous (no network), fast (~70ms), and always available.
   */
  private _loadRoomEnvironment(
    cacheKey: string,
    renderer: THREE.WebGLRenderer,
  ): THREE.Texture {
    if (this._disposed) {
      throw new Error("EnvironmentManager was disposed");
    }

    // Check cache again (fallback path may re-enter with "studio" key)
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return cached.texture;
    }

    const pmremGenerator = this._ensurePmremGenerator(renderer);
    const roomScene = new RoomEnvironment();
    const renderTarget = pmremGenerator.fromScene(roomScene);

    // Dispose the intermediate scene (not needed after PMREM generation)
    roomScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    // Cache render target and track its texture
    this._cache.set(cacheKey, renderTarget);
    gpuTracker.trackTexture(renderTarget.texture, `PMREM environment: ${cacheKey}`);
    logger.debug(`Generated RoomEnvironment PMREM, cached as "${cacheKey}"`);

    return renderTarget.texture;
  }

  /**
   * Load an HDR file and generate a PMREM texture from it.
   *
   * Uses HDRLoader to fetch the .hdr file, then PMREMGenerator.fromEquirectangular()
   * to create the PMREM cubemap. The source equirectangular texture is disposed
   * immediately after PMREM generation to free memory.
   *
   * @param url - URL of the .hdr file
   * @param cacheKey - Cache key for the resulting PMREM render target
   * @param renderer - WebGL renderer for PMREMGenerator
   * @returns PMREM texture
   * @throws If the HDR file cannot be loaded
   */
  private async _loadHdr(
    url: string,
    cacheKey: string,
    renderer: THREE.WebGLRenderer,
  ): Promise<THREE.Texture> {
    const loader = this._ensureHdrLoader();
    const pmremGenerator = this._ensurePmremGenerator(renderer);

    logger.debug(`Loading HDR environment from: ${url}`);

    // Load HDR file (returns a DataTexture)
    const hdrTexture = await loader.loadAsync(url);

    // Bail out if disposed while loading
    if (this._disposed) {
      hdrTexture.dispose();
      throw new Error("EnvironmentManager was disposed during HDR load");
    }

    // Generate PMREM cubemap from equirectangular HDR
    const renderTarget = pmremGenerator.fromEquirectangular(hdrTexture);

    // Dispose the source HDR texture (PMREM is now in GPU memory)
    hdrTexture.dispose();

    // Cache render target and track its texture
    this._cache.set(cacheKey, renderTarget);
    gpuTracker.trackTexture(renderTarget.texture, `PMREM environment: ${cacheKey}`);
    logger.debug(
      `Loaded HDR environment from "${url}", cached as "${cacheKey}"`,
    );

    return renderTarget.texture;
  }
}

export { EnvironmentManager };
export type { EnvironmentManagerOptions };
