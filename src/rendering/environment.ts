import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import type { StudioEnvironment, StudioBackground } from "../core/types.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";

/**
 * Neutral grey background color for Studio mode.
 * A medium grey that works for both light and dark objects, and provides
 * a sensible backdrop for transmission/glass materials.
 */
const STUDIO_BACKGROUND_GREY = new THREE.Color(0.18, 0.18, 0.18);

/** White background color for clean product shots. */
const STUDIO_BACKGROUND_WHITE = new THREE.Color(1.0, 1.0, 1.0);

/**
 * Lazy-created radial gradient texture for the "gradient" background mode.
 * Vignette style: light grey center fading to darker grey edges.
 */
let _gradientTexture: THREE.Texture | null = null;

function _getGradientTexture(): THREE.Texture {
  if (_gradientTexture) return _gradientTexture;

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Radial gradient: light center → darker edges (vignette)
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.7; // gradient covers ~70% radius, edges are the dark color
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, "#f0f0f0");   // light grey center
  gradient.addColorStop(1, "#c8c8c8");   // darker grey edges

  ctx.fillStyle = "#c8c8c8"; // fill entire canvas with edge color first
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  _gradientTexture = texture;
  return texture;
}

/**
 * Poly Haven CDN base URL for HDR files.
 * Pattern: {BASE}/{resolution}/{slug}_{resolution}.hdr
 */
const PH = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k";

/**
 * Default HDR preset URLs.
 *
 * All maps from Poly Haven (CC0 license, permissive CORS) at 2K resolution.
 * Host applications can override these via the `presetUrls` constructor option.
 *
 * Organized by category:
 * - Studio: top-down, side, soft/diffuse, product-viz
 * - Outdoor: overhead sun, side sun, low sun, overcast
 */
const DEFAULT_PRESET_URLS: Record<string, string> = {
  // --- Studio: Top-down / overhead key light ---
  studio_small_03:      `${PH}/studio_small_03_2k.hdr`,
  studio_small_05:      `${PH}/studio_small_05_2k.hdr`,
  studio_small_07:      `${PH}/studio_small_07_2k.hdr`,
  cyclorama_hard_light: `${PH}/cyclorama_hard_light_2k.hdr`,

  // --- Studio: Side / directional key light ---
  studio_small_04:        `${PH}/studio_small_04_2k.hdr`,
  studio_small_02:        `${PH}/studio_small_02_2k.hdr`,
  studio_small_06:        `${PH}/studio_small_06_2k.hdr`,
  photo_studio_loft_hall: `${PH}/photo_studio_loft_hall_2k.hdr`,
  studio_country_hall:    `${PH}/studio_country_hall_2k.hdr`,
  brown_photostudio_02:   `${PH}/brown_photostudio_02_2k.hdr`,
  brown_photostudio_06:   `${PH}/brown_photostudio_06_2k.hdr`,

  // --- Studio: Soft / diffuse / wraparound ---
  studio_small_08:            `${PH}/studio_small_08_2k.hdr`,
  studio_small_09:            `${PH}/studio_small_09_2k.hdr`,
  photo_studio_01:            `${PH}/photo_studio_01_2k.hdr`,
  provence_studio:            `${PH}/provence_studio_2k.hdr`,
  photo_studio_broadway_hall: `${PH}/photo_studio_broadway_hall_2k.hdr`,
  white_studio_05:            `${PH}/white_studio_05_2k.hdr`,

  // --- Studio: Product-viz (clean backgrounds) ---
  white_studio_01:      `${PH}/white_studio_01_2k.hdr`,
  white_studio_03:      `${PH}/white_studio_03_2k.hdr`,
  pav_studio_01:        `${PH}/pav_studio_01_2k.hdr`,
  monochrome_studio_01: `${PH}/monochrome_studio_01_2k.hdr`,
  ferndale_studio_01:   `${PH}/ferndale_studio_01_2k.hdr`,
  wooden_studio_01:     `${PH}/wooden_studio_01_2k.hdr`,

  // --- Outdoor: Overhead sun (midday) ---
  noon_grass:                              `${PH}/noon_grass_2k.hdr`,
  wide_street_01:                          `${PH}/wide_street_01_2k.hdr`,
  kloofendal_48d_partly_cloudy_puresky:    `${PH}/kloofendal_48d_partly_cloudy_puresky_2k.hdr`,
  rural_asphalt_road:                      `${PH}/rural_asphalt_road_2k.hdr`,

  // --- Outdoor: Side sun (morning / afternoon) ---
  meadow_2:             `${PH}/meadow_2_2k.hdr`,
  autumn_park:          `${PH}/autumn_park_2k.hdr`,
  autumn_field_puresky: `${PH}/autumn_field_puresky_2k.hdr`,
  spiaggia_di_mondello: `${PH}/spiaggia_di_mondello_2k.hdr`,

  // --- Outdoor: Low sun (sunrise / sunset) ---
  spruit_sunrise: `${PH}/spruit_sunrise_2k.hdr`,
  lilienstein:    `${PH}/lilienstein_2k.hdr`,
  venice_sunset:  `${PH}/venice_sunset_2k.hdr`,
  kloppenheim_06: `${PH}/kloppenheim_06_2k.hdr`,

  // --- Outdoor: Overcast / diffuse ---
  overcast_soil_puresky: `${PH}/overcast_soil_puresky_2k.hdr`,
  canary_wharf:          `${PH}/canary_wharf_2k.hdr`,
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
 * The environment map is used for IBL (image-based lighting) via
 * `scene.environment`. The scene background is configurable via the
 * `backgroundMode` parameter in `apply()` (grey, white, gradient,
 * blurred environment, or transparent).
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

  /**
   * Deferred-apply state: if apply() was called with backgroundMode "environment"
   * while _currentTexture was null, store the arguments so loadEnvironment() can
   * re-apply once the texture is ready.
   */
  private _deferredApply: {
    scene: THREE.Scene;
    envIntensity: number;
    upIsZ: boolean;
  } | null = null;

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

      // Self-healing: if apply() was called with "environment" background
      // while texture was null, re-apply now that the texture is ready.
      if (this._deferredApply) {
        const { scene, envIntensity, upIsZ } = this._deferredApply;
        this._deferredApply = null;
        this.apply(scene, envIntensity, "environment", upIsZ);
      }

      return texture;
    } finally {
      this._inflight.delete(cacheKey);
    }
  }

  /**
   * Apply the current environment map to the scene.
   *
   * Sets `scene.environment` for PBR/IBL reflections and configures
   * `scene.background` according to the selected background mode:
   * - `"grey"`: Neutral grey color (default, clean product-shot look)
   * - `"white"`: Pure white background (e-commerce / documentation style)
   * - `"gradient"`: Radial vignette gradient (light grey center → darker edges)
   * - `"environment"`: Blurred, dimmed PMREM environment as backdrop
   *   (color-matched to IBL, eliminates edge-glow artifacts on reflective objects)
   * - `"transparent"`: No background (canvas alpha shows through)
   *
   * @param scene - The Three.js scene to apply the environment to
   * @param envIntensity - Environment intensity multiplier (0-3, default 1.0)
   * @param backgroundMode - Background mode
   * @param upIsZ - Whether the scene uses Z-up coordinates (default true)
   */
  apply(
    scene: THREE.Scene,
    envIntensity: number,
    backgroundMode: StudioBackground = "grey",
    upIsZ: boolean = true,
  ): void {
    if (this._currentTexture) {
      scene.environment = this._currentTexture;
      scene.environmentIntensity = envIntensity;
      // HDR maps assume Y-up; rotate 90° around X to align with Z-up scenes
      if (upIsZ) {
        scene.environmentRotation.set(Math.PI / 2, 0, 0);
      } else {
        scene.environmentRotation.set(0, 0, 0);
      }
    } else {
      scene.environment = null;
      scene.environmentIntensity = 1.0;
      scene.environmentRotation.set(0, 0, 0);
    }

    // Clear deferred-apply if switching away from "environment" background
    if (backgroundMode !== "environment") {
      this._deferredApply = null;
    }

    // Configure background based on mode
    switch (backgroundMode) {
      case "white":
        scene.background = STUDIO_BACKGROUND_WHITE;
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        break;
      case "gradient":
        scene.background = _getGradientTexture();
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        break;
      case "environment":
        if (this._currentTexture) {
          // Use the PMREM texture directly as background.
          // CubeUVReflectionMapping is natively supported by the WebGLBackground
          // box-mesh shader. backgroundBlurriness selects a blurred MIP level
          // from the pre-filtered radiance map.
          scene.background = this._currentTexture;
          scene.backgroundIntensity = 0.4;
          scene.backgroundBlurriness = 0.8;
          // Apply the same Y→Z rotation to the background
          if (upIsZ) {
            scene.backgroundRotation.set(Math.PI / 2, 0, 0);
          } else {
            scene.backgroundRotation.set(0, 0, 0);
          }
          this._deferredApply = null;
        } else {
          // No environment loaded — fall back to grey.
          // Record deferred-apply so loadEnvironment() can re-apply once ready.
          this._deferredApply = { scene, envIntensity, upIsZ };
          scene.background = STUDIO_BACKGROUND_GREY;
          scene.backgroundIntensity = 1.0;
          scene.backgroundBlurriness = 0;
        }
        break;
      case "transparent":
        scene.background = null;
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        break;
      case "grey":
      default:
        scene.background = STUDIO_BACKGROUND_GREY;
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        break;
    }
  }

  /**
   * Remove environment map from the scene.
   *
   * Clears `scene.environment`, `scene.background`, and resets
   * environment/background properties to defaults.
   *
   * @param scene - The Three.js scene to clear
   */
  remove(scene: THREE.Scene): void {
    this._deferredApply = null;
    scene.environment = null;
    scene.background = null;
    scene.environmentIntensity = 1.0;
    scene.environmentRotation.set(0, 0, 0);
    scene.backgroundIntensity = 1.0;
    scene.backgroundBlurriness = 0;
    scene.backgroundRotation.set(0, 0, 0);
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
    this._deferredApply = null;

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
   * after PMREM generation. The PMREM texture itself serves as both the IBL
   * environment and the background (in "environment" mode).
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

    // Dispose the source HDR texture (PMREM is now in GPU memory).
    // For "environment" background mode, the PMREM texture itself is used directly.
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
