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
const PH_BASE = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr";

/**
 * Default HDR preset slugs (Poly Haven asset names).
 *
 * All maps from Poly Haven (CC0 license, permissive CORS).
 * Resolution is selected at runtime via `use4kEnvMaps`.
 * Host applications can override URLs via the `presetUrls` constructor option.
 *
 * Curated for CAD/product visualization: neutral white studios that make
 * every material look good, plus two overcast outdoor options for context.
 */
const DEFAULT_PRESET_SLUGS: string[] = [
  // --- Studio: Soft / neutral ---
  "studio_small_08",
  "white_studio_05",
  "white_studio_03",
  "photo_studio_01",
  "studio_small_09",
  "cyclorama_hard_light",

  // --- Outdoor ---
  "canary_wharf",
  "kiara_1_dawn",
  "empty_warehouse_01",
];

/** Build preset URL map for the given resolution tier. */
function _buildPresetUrls(use4k: boolean): Record<string, string> {
  const res = use4k ? "4k" : "2k";
  const urls: Record<string, string> = {};
  for (const slug of DEFAULT_PRESET_SLUGS) {
    urls[slug] = `${PH_BASE}/${res}/${slug}_${res}.hdr`;
  }
  return urls;
}

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

  /** Whether 4K env maps are enabled (default false = 2K) */
  private _use4k: boolean = false;

  /** User-provided URL overrides from constructor */
  private _userOverrides: Record<string, string> = {};

  /** HDRLoader instance (created lazily on first HDR load) */
  private _hdrLoader: HDRLoader | null = null;

  /** The last loaded PMREM texture (stateful — used by apply() for IBL) */
  private _currentTexture: THREE.Texture | null = null;

  /** Whether this manager has been disposed */
  private _disposed = false;

  /**
   * Ortho env background workaround.
   *
   * Three.js cannot render PMREM/cubemap textures as scene.background with
   * orthographic cameras (renders as a tiny rectangle). We work around this by
   * rendering the env map to a render target using a virtual perspective camera,
   * then setting that 2D texture as scene.background. A 2D texture background
   * renders as a fullscreen quad regardless of camera projection, and the
   * transmission pass (glass refraction) also sees it correctly.
   */
  private _bgScene: THREE.Scene | null = null;
  private _bgCamera: THREE.PerspectiveCamera | null = null;
  private _bgRenderTarget: THREE.WebGLRenderTarget | null = null;
  private _orthoEnvMainScene: THREE.Scene | null = null;

  /** Whether the current state requires env background rendering to a 2D target */
  needsEnvBackgroundUpdate: boolean = false;

  /**
   * Deferred-apply state: if apply() was called with backgroundMode "environment"
   * while _currentTexture was null, store the arguments so loadEnvironment() can
   * re-apply once the texture is ready.
   */
  private _deferredApply: {
    scene: THREE.Scene;
    envIntensity: number;
    upIsZ: boolean;
    ortho: boolean;
  } | null = null;

  constructor(options: EnvironmentManagerOptions = {}) {
    this._userOverrides = (options.presetUrls as Record<string, string> | undefined) ?? {};
    this._presetUrls = {
      ..._buildPresetUrls(false),
      ...this._userOverrides,
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
        const { scene, envIntensity, upIsZ, ortho } = this._deferredApply;
        this._deferredApply = null;
        this.apply(scene, envIntensity, "environment", upIsZ, ortho);
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
   * @param ortho - Whether the camera is orthographic (env background falls back to gradient)
   */
  apply(
    scene: THREE.Scene,
    envIntensity: number,
    backgroundMode: StudioBackground = "grey",
    upIsZ: boolean = true,
    ortho: boolean = false,
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
        this._teardownEnvBackground();
        break;
      case "gradient":
        scene.background = _getGradientTexture();
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        this._teardownEnvBackground();
        break;
      case "environment":
        if (this._currentTexture) {
          // Render env map to a 2D render target via a fixed-FOV virtual camera,
          // then use that texture as scene.background. This gives a consistent
          // "distant" background for both ortho and perspective cameras, and
          // avoids the main camera's narrow FOV making the env appear too close.
          this._setupEnvBackground(scene, this._currentTexture, upIsZ);
          this._deferredApply = null;
        } else {
          // No environment loaded — fall back to grey.
          // Record deferred-apply so loadEnvironment() can re-apply once ready.
          this._deferredApply = { scene, envIntensity, upIsZ, ortho };
          scene.background = STUDIO_BACKGROUND_GREY;
          scene.backgroundIntensity = 1.0;
          scene.backgroundBlurriness = 0;
          this._teardownEnvBackground();
        }
        break;
      case "transparent":
        scene.background = null;
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        this._teardownEnvBackground();
        break;
      case "grey":
      default:
        scene.background = STUDIO_BACKGROUND_GREY;
        scene.backgroundIntensity = 1.0;
        scene.backgroundBlurriness = 0;
        this._teardownEnvBackground();
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
    this._teardownEnvBackground();
    scene.environment = null;
    scene.background = null;
    scene.environmentIntensity = 1.0;
    scene.environmentRotation.set(0, 0, 0);
    scene.backgroundIntensity = 1.0;
    scene.backgroundBlurriness = 0;
    scene.backgroundRotation.set(0, 0, 0);
  }

  /**
   * Switch between 2K and 4K environment map resolution.
   *
   * Rebuilds preset URLs, evicts cached HDR presets (so they reload at
   * the new resolution), and reloads the current environment if one is
   * active.
   *
   * @param use4k - True for 4K, false for 2K
   * @param currentEnvName - The currently active environment name (to reload)
   * @param renderer - WebGL renderer (needed for reload)
   * @returns Promise that resolves when the new texture is ready
   */
  async setUse4kEnvMaps(
    use4k: boolean,
    currentEnvName: string,
    renderer: THREE.WebGLRenderer,
  ): Promise<THREE.Texture | null> {
    if (use4k === this._use4k) return this._currentTexture;
    this._use4k = use4k;

    // Rebuild preset URLs at the new resolution
    this._presetUrls = {
      ..._buildPresetUrls(use4k),
      ...this._userOverrides,
    };

    // Evict cached HDR presets (they point to the old resolution).
    // "studio" (RoomEnvironment) is procedural and unaffected.
    for (const slug of DEFAULT_PRESET_SLUGS) {
      const cached = this._cache.get(slug);
      if (cached) {
        gpuTracker.untrack("texture", cached.texture);
        cached.dispose();
        this._cache.delete(slug);
        logger.debug(`Evicted cached environment "${slug}" for resolution switch`);
      }
    }

    // Reload the current environment at the new resolution
    if (currentEnvName && currentEnvName !== "none" && currentEnvName !== "studio") {
      return this.loadEnvironment(currentEnvName, renderer);
    }

    return this._currentTexture;
  }

  /** Whether 4K env maps are currently enabled. */
  get use4kEnvMaps(): boolean {
    return this._use4k;
  }

  /**
   * Whether an environment name is a Poly Haven preset (resolution-switchable).
   * Returns false for "studio", "none", and custom URLs.
   */
  isPreset(name: string): boolean {
    return DEFAULT_PRESET_SLUGS.includes(name);
  }

  /**
   * Update the env background render target.
   *
   * Renders the PMREM env map to a 2D render target using a fixed-FOV virtual
   * perspective camera that matches the active camera's orientation. The
   * resulting 2D texture is set as the main scene's background, giving a
   * consistent "distant" environment look regardless of camera projection
   * (the main perspective camera's narrow 22° FOV would otherwise make the
   * env appear too close / zoomed in).
   *
   * Call this before the main `renderer.render()` each frame while
   * `needsEnvBackgroundUpdate` is true.
   *
   * @param renderer - WebGL renderer
   * @param camera - The active camera (orientation is copied)
   */
  updateEnvBackground(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ): void {
    if (
      !this.needsEnvBackgroundUpdate ||
      !this._bgScene ||
      !this._bgCamera ||
      !this._orthoEnvMainScene
    ) {
      return;
    }

    // Match viewport size for the render target
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = size.x;
    const h = size.y;

    if (!this._bgRenderTarget || this._bgRenderTarget.width !== w || this._bgRenderTarget.height !== h) {
      this._bgRenderTarget?.dispose();
      this._bgRenderTarget = new THREE.WebGLRenderTarget(w, h);
    }

    // Match viewport aspect ratio
    const aspect = w / h;
    if (this._bgCamera.aspect !== aspect) {
      this._bgCamera.aspect = aspect;
      this._bgCamera.updateProjectionMatrix();
    }

    // Sync virtual perspective camera with the active camera's orientation
    this._bgCamera.position.copy(camera.position);
    this._bgCamera.quaternion.copy(camera.quaternion);
    this._bgCamera.updateMatrixWorld();

    // Render env background to the render target
    renderer.setRenderTarget(this._bgRenderTarget);
    renderer.clear();
    renderer.render(this._bgScene, this._bgCamera);
    renderer.setRenderTarget(null);

    // Set the 2D texture as the main scene's background
    this._orthoEnvMainScene.background = this._bgRenderTarget.texture;
    this._orthoEnvMainScene.backgroundIntensity = 1.0;
    this._orthoEnvMainScene.backgroundBlurriness = 0;
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
    this._teardownEnvBackground();
    this._bgScene = null;
    this._bgCamera = null;
    if (this._bgRenderTarget) {
      this._bgRenderTarget.dispose();
      this._bgRenderTarget = null;
    }

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
   * Set up the env background: a separate scene with the PMREM texture
   * as background and a fixed-FOV virtual perspective camera for rendering
   * to a 2D target. Used for both ortho and perspective cameras.
   */
  private _setupEnvBackground(
    mainScene: THREE.Scene,
    texture: THREE.Texture,
    upIsZ: boolean,
  ): void {
    if (!this._bgScene) {
      this._bgScene = new THREE.Scene();
    }
    if (!this._bgCamera) {
      this._bgCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    }

    this._bgScene.background = texture;
    this._bgScene.backgroundIntensity = 1.0;
    this._bgScene.backgroundBlurriness = 0;
    if (upIsZ) {
      this._bgScene.backgroundRotation.set(Math.PI / 2, 0, 0);
    } else {
      this._bgScene.backgroundRotation.set(0, 0, 0);
    }

    this._orthoEnvMainScene = mainScene;
    this.needsEnvBackgroundUpdate = true;
  }

  /**
   * Tear down the env background state.
   */
  private _teardownEnvBackground(): void {
    this.needsEnvBackgroundUpdate = false;
    this._orthoEnvMainScene = null;
  }

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

    // Dispose the source equirectangular texture (PMREM is now in GPU memory).
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
