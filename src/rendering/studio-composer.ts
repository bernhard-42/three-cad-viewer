/**
 * StudioComposer -- postprocessing pipeline for Studio mode.
 *
 * Wraps the pmndrs EffectComposer to provide:
 * - Scene rendering (RenderPass)
 * - Screen-space ambient occlusion (N8AOPostPass)
 * - Tone mapping + antialiasing (ToneMappingEffect + SMAAEffect in EffectPass)
 *
 * Only instantiated when Studio mode is active. Non-Studio rendering
 * bypasses this entirely and uses direct `renderer.render()`.
 *
 * The caller must set `renderer.toneMapping = THREE.NoToneMapping` before
 * using this composer (to avoid double tone mapping) and restore the
 * previous value when Studio mode deactivates.
 */

import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import * as THREE from "three";
import type { StudioToneMapping } from "../core/types.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Tone-mapping mode mapping
// ---------------------------------------------------------------------------

/** Maps viewer StudioToneMapping strings to postprocessing ToneMappingMode. */
const TONE_MAPPING_MODE_MAP: Record<StudioToneMapping, ToneMappingMode> = {
  "neutral": ToneMappingMode.NEUTRAL,
  "AgX": ToneMappingMode.AGX,
  "ACES": ToneMappingMode.ACES_FILMIC,
  "none": ToneMappingMode.LINEAR,
};

// ---------------------------------------------------------------------------
// StudioComposer
// ---------------------------------------------------------------------------

class StudioComposer {
  private _composer: EffectComposer;
  private _renderPass: RenderPass;
  // N8AOPostPass doesn't formally extend the postprocessing Pass class,
  // so EffectComposer.addPass() needs an `any` cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _n8aoPass: any;
  private _toneMappingEffect: ToneMappingEffect;
  private _effectPass: EffectPass;
  private _renderer: THREE.WebGLRenderer;

  /**
   * Create the postprocessing pipeline.
   *
   * @param renderer - WebGL renderer (must have toneMapping set to NoToneMapping)
   * @param scene    - Scene to render
   * @param camera   - Active camera (perspective or orthographic)
   * @param width    - Canvas width in pixels
   * @param height   - Canvas height in pixels
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    this._renderer = renderer;

    // HDR pipeline with HalfFloat framebuffer.
    // multisampling = 0: MSAA conflicts with depth-based AO passes;
    // antialiasing is handled by SMAAEffect instead.
    this._composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    });

    // --- Pass 1: scene render ---
    this._renderPass = new RenderPass(scene, camera);
    this._composer.addPass(this._renderPass);

    // --- Pass 2: N8AO ambient occlusion ---
    this._n8aoPass = new N8AOPostPass(scene, camera, width, height);
    this._n8aoPass.configuration.aoRadius = 2.0;
    this._n8aoPass.configuration.distanceFalloff = 0.5;
    this._n8aoPass.configuration.intensity = 1.5;
    this._n8aoPass.configuration.halfRes = true;
    this._n8aoPass.configuration.depthAwareUpsampling = true;
    // Disable gamma correction -- ToneMappingEffect handles the
    // linear-to-sRGB conversion as the final pass in the pipeline.
    this._n8aoPass.configuration.gammaCorrection = false;
    this._n8aoPass.setQualityMode("Medium");
    this._n8aoPass.enabled = false; // off by default
    this._composer.addPass(this._n8aoPass);

    // --- Pass 3: tone mapping + SMAA antialiasing ---
    this._toneMappingEffect = new ToneMappingEffect({
      mode: ToneMappingMode.AGX,
    });
    const smaaEffect = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this._effectPass = new EffectPass(camera, this._toneMappingEffect, smaaEffect);
    this._composer.addPass(this._effectPass);

    logger.debug("StudioComposer: pipeline created");
  }

  // -----------------------------------------------------------------------
  // Ambient Occlusion
  // -----------------------------------------------------------------------

  /**
   * Enable or disable the N8AO ambient occlusion pass.
   */
  setAOEnabled(flag: boolean): void {
    this._n8aoPass.enabled = flag;
    logger.debug(`StudioComposer: AO ${flag ? "enabled" : "disabled"}`);
  }

  /**
   * Set the AO intensity (artistic multiplier).
   *
   * Typical range: 0.5 (subtle) to 5.0 (heavy). Default is 1.5.
   */
  setAOIntensity(value: number): void {
    this._n8aoPass.configuration.intensity = value;
  }

  // -----------------------------------------------------------------------
  // Tone Mapping
  // -----------------------------------------------------------------------

  /**
   * Set the tone mapping algorithm and exposure.
   *
   * Maps the viewer's StudioToneMapping string to the postprocessing
   * ToneMappingMode enum. Exposure is set on `renderer.toneMappingExposure`
   * which ToneMappingEffect reads automatically.
   *
   * @param mode     - One of "neutral", "AgX", "ACES", "none"
   * @param exposure - Exposure multiplier (0 to 2, default 1.0)
   */
  setToneMapping(mode: StudioToneMapping, exposure: number): void {
    const mappedMode = TONE_MAPPING_MODE_MAP[mode];
    if (mappedMode === undefined) {
      logger.warn(`StudioComposer: unknown tone mapping mode "${mode}", falling back to AGX`);
      this._toneMappingEffect.mode = ToneMappingMode.AGX;
    } else {
      this._toneMappingEffect.mode = mappedMode;
    }
    this._renderer.toneMappingExposure = exposure;
  }

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  /**
   * Update the camera reference on all passes.
   *
   * Must be called when switching between orthographic and perspective
   * cameras. The viewer keeps two camera instances and swaps them.
   */
  setCamera(camera: THREE.Camera): void {
    this._renderPass.mainCamera = camera;
    // N8AOPostPass exposes a .camera property (untyped)
    this._n8aoPass.camera = camera;
    this._effectPass.mainCamera = camera;
  }

  // -----------------------------------------------------------------------
  // Resize
  // -----------------------------------------------------------------------

  /**
   * Update the pipeline dimensions on canvas resize.
   *
   * The EffectComposer handles its own render targets. N8AOPostPass needs
   * an explicit setSize call for its internal buffers.
   */
  setSize(width: number, height: number): void {
    this._composer.setSize(width, height, false);
    this._n8aoPass.setSize(width, height);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  /**
   * Render one frame through the postprocessing pipeline.
   *
   * @param deltaTime - Time since last frame in seconds (for temporal effects)
   */
  render(deltaTime?: number): void {
    this._composer.render(deltaTime);
  }

  // -----------------------------------------------------------------------
  // Disposal
  // -----------------------------------------------------------------------

  /**
   * Dispose all GPU resources held by the composer and its passes.
   *
   * Call when Studio mode is deactivated or the viewer is destroyed.
   */
  dispose(): void {
    this._composer.dispose();
    logger.debug("StudioComposer: disposed");
  }
}

export { StudioComposer };
