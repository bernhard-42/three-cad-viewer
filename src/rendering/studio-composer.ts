/**
 * StudioComposer -- postprocessing pipeline for Studio mode.
 *
 * Wraps the pmndrs EffectComposer to provide:
 * - Scene rendering (RenderPass)
 * - Screen-space ambient occlusion (N8AOPostPass)
 * - Screen-space shadow mask (BasicShadowMap + KawaseBlurPass)
 * - Tone mapping + sRGB output + antialiasing (ToneMappingEffect + SMAAEffect)
 *
 * Tone mapping is handled by the postprocessing ToneMappingEffect, which uses
 * Three.js's own GLSL tone mapping functions (via #include <tonemapping_pars_fragment>).
 * The renderer's toneMapping must be set to NoToneMapping (the postprocessing
 * library's documented requirement). Exposure is controlled via
 * renderer.toneMappingExposure, which the GLSL functions read automatically.
 *
 * Background protection: solid-color backgrounds are excluded from tone mapping.
 * The RenderPass skips the background (ignoreBackground), the FBO is cleared to
 * transparent, and the EffectPass alpha-blends its output onto a pre-cleared
 * canvas that already has the correct background color.
 *
 * Shadow mask: BasicShadowMap produces sharp shadow boundaries at 4096×4096.
 * A half-resolution ShadowMaterial override pass captures the mask, which is
 * then blurred via KawaseBlurPass and composited by ShadowMaskEffect before
 * tone mapping. The floor keeps its own ShadowMaterial reading the shadow map
 * directly (sharp but clean).
 *
 * Only instantiated when Studio mode is active. Non-Studio rendering
 * bypasses this entirely and uses direct `renderer.render()`.
 */

import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
  SMAAPreset,
  KawaseBlurPass,
  KernelSize,
  Effect,
  EffectAttribute,
  BlendFunction,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import * as THREE from "three";
import type { StudioToneMapping } from "../core/types.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Tone-mapping: maps viewer strings to Three.js renderer.toneMapping constants.
//
// Tone mapping is applied per-fragment in the main render pass (via
// renderer.toneMapping) rather than as a post-process effect. This is
// critical for AA quality: with HDR + post-process tone mapping, MSAA
// resolves in linear HDR space, then the tone curve compresses high-contrast
// pixels non-linearly, producing visible aliasing on bright specular edges.
// Per-fragment tone mapping puts the resolve in tone-mapped (LDR) space so
// edges blend smoothly. The postprocessing library's docs say it expects
// renderer.toneMapping=NoToneMapping, but that's for HDR pipelines with
// bloom or other linear-space effects — we only have shadow compositing
// and SMAA, both of which are happy in tone-mapped space.
// ---------------------------------------------------------------------------

const TONE_MAP_MODE: Record<StudioToneMapping, THREE.ToneMapping> = {
  "neutral": THREE.NeutralToneMapping,
  "ACES": THREE.ACESFilmicToneMapping,
  "none": THREE.LinearToneMapping,
};

// Scratch color to avoid per-frame allocation
const _savedClearColor = new THREE.Color();

// ---------------------------------------------------------------------------
// ShadowMaskEffect — composites blurred shadow mask onto the scene
// ---------------------------------------------------------------------------

const _shadowMaskFragmentShader = /* glsl */ `
uniform sampler2D shadowMaskObjects;
uniform sampler2D shadowMaskFloor;
uniform float shadowIntensity;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float objects = texture2D(shadowMaskObjects, uv).a;
    float floorShadow = texture2D(shadowMaskFloor, uv).a;
    // Floor is hidden in the main render, so pixels at depth ≈ 1.0 are where
    // the floor would be (background/clear depth). Pixels with depth < 1.0
    // are objects — don't apply floor shadow there (prevents bleed-through).
    float isFloorArea = step(0.9999, depth);
    float shadowAmount = max(objects, floorShadow * isFloorArea);
    float attenuation = 1.0 - shadowIntensity * shadowAmount;

    if (inputColor.a < 0.001) {
        // Background-protect mode: FBO is transparent, canvas has bg color.
        // Output shadow as alpha — NormalBlending composites:
        // (0,0,0)*a + bgColor*(1-a) = bgColor darkened by shadow.
        outputColor = vec4(0.0, 0.0, 0.0, shadowIntensity * shadowAmount);
    } else {
        outputColor = vec4(inputColor.rgb * clamp(attenuation, 0.0, 1.0), inputColor.a);
    }
}
`;

class ShadowMaskEffect extends Effect {
  constructor() {
    super("ShadowMaskEffect", _shadowMaskFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["shadowMaskObjects", new THREE.Uniform(null)],
        ["shadowMaskFloor", new THREE.Uniform(null)],
        ["shadowIntensity", new THREE.Uniform(0.5)],
      ]),
    });
  }
}

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
  private _effectPass: EffectPass;
  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _camera: THREE.Camera;

  /** Solid background color to protect from tone mapping, or null. */
  private _bgProtectColor: THREE.Color | null = null;

  // Shadow mask pipeline — two separate masks to avoid depth-discontinuity halos
  private _shadowMaskRT: THREE.WebGLRenderTarget | null = null;
  private _blurredObjectMaskRT: THREE.WebGLRenderTarget | null = null;
  private _blurredFloorMaskRT: THREE.WebGLRenderTarget | null = null;
  private _blurPass: KawaseBlurPass | null = null;
  private _shadowMaskMaterial: THREE.ShadowMaterial | null = null;
  private _shadowMaskEffect: ShadowMaskEffect;
  private _shadowMaskEnabled: boolean = false;
  private _width: number = 0;
  private _height: number = 0;

  // Scratch containers for shadow mask passes — hoisted to avoid per-frame GC
  private _receiveShadowState: Map<THREE.Mesh, boolean> = new Map();
  private _savedIntensities: Map<THREE.DirectionalLight, number> = new Map();
  private _savedVisibility: Map<THREE.Object3D, boolean> = new Map();

  /**
   * Create the postprocessing pipeline.
   *
   * @param renderer - WebGL renderer
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
    onSmaaReady?: () => void,
  ) {
    this._renderer = renderer;
    this._scene = scene;
    this._camera = camera;
    this._width = width;
    this._height = height;

    // Tone mapping is applied per-fragment in the main RenderPass via
    // renderer.toneMapping (see TONE_MAP_MODE comment for rationale).
    // setToneMapping() is called by StudioManager right after construction
    // to set the user-selected mode + exposure.

    // HDR pipeline with HalfFloat framebuffer.
    // multisampling = 4: WebGL2 MSAA on the composer's input RT. Most GPUs
    // clamp half-float MSAA to 4 samples anyway, and Studio mode applies
    // additional supersampling via renderer.setPixelRatio to compensate.
    this._composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 4,
    });

    // --- Pass 1: scene render ---
    this._renderPass = new RenderPass(scene, camera);
    // Shadow maps are generated in the manual shadow mask pass (Phase 1),
    // so the main RenderPass should not regenerate them.
    this._renderPass.skipShadowMapUpdate = true;
    this._composer.addPass(this._renderPass);

    // --- Pass 2: N8AO ambient occlusion ---
    this._n8aoPass = new N8AOPostPass(scene, camera, width, height);
    this._n8aoPass.configuration.aoRadius = 2.0;
    this._n8aoPass.configuration.distanceFalloff = 0.5;
    this._n8aoPass.configuration.intensity = 1.5;
    this._n8aoPass.configuration.halfRes = true;
    this._n8aoPass.configuration.depthAwareUpsampling = true;
    this._n8aoPass.configuration.gammaCorrection = false;
    this._n8aoPass.setQualityMode("Medium");
    this._n8aoPass.enabled = false; // off by default
    this._composer.addPass(this._n8aoPass);

    // --- Pass 3: shadow mask compositing + SMAA ---
    // Tone mapping is no longer in this pass — it's done per-fragment in the
    // main RenderPass to avoid HDR-resolve aliasing on high-contrast edges.
    const smaaEffect = new SMAAEffect({ preset: SMAAPreset.ULTRA });
    // SMAA loads its lookup textures (search/area) asynchronously via
    // `new Image(); image.src = "data:..."`. Even though the source is a
    // data URL, the `load` event fires in a microtask — so the very first
    // render after composer construction has no SMAA textures attached and
    // produces aliased edges. We notify on `load` so the caller can trigger
    // another render and the user sees AA without having to interact.
    if (onSmaaReady) {
      // postprocessing's TS types only declare "change"; SMAA dispatches
      // "load" at runtime when the lookup textures finish decoding.
      (smaaEffect as unknown as THREE.EventDispatcher<{ load: object }>)
        .addEventListener("load", () => onSmaaReady());
    }
    this._shadowMaskEffect = new ShadowMaskEffect();
    this._effectPass = new EffectPass(
      camera,
      this._shadowMaskEffect,
      smaaEffect,
    );
    this._composer.addPass(this._effectPass);

    logger.debug("StudioComposer: pipeline created");
  }

  // -----------------------------------------------------------------------
  // Background protection
  // -----------------------------------------------------------------------

  /**
   * Enable or disable solid-background protection.
   *
   * When a solid color is set, the RenderPass skips the scene background
   * (ignoreBackground=true), the FBO is cleared to transparent, and the
   * canvas is pre-cleared with the correct color. The EffectPass then
   * alpha-blends its output so background pixels (alpha=0) show the
   * canvas clear color underneath.
   *
   * Pass null to disable protection (for gradient/environment backgrounds).
   */
  setBackgroundProtect(color: THREE.Color | null): void {
    this._bgProtectColor = color;
    if (color) {
      this._renderPass.ignoreBackground = true;
      // Force the ClearPass to clear the FBO with transparent black
      this._renderPass.clearPass.overrideClearColor = new THREE.Color(0, 0, 0);
      (this._renderPass.clearPass as any).overrideClearAlpha = 0;
      // Alpha-blend the final output onto the pre-cleared canvas
      this._effectPass.fullscreenMaterial.blending = THREE.NormalBlending;
      this._effectPass.fullscreenMaterial.transparent = true;
    } else {
      this._renderPass.ignoreBackground = false;
      (this._renderPass.clearPass as any).overrideClearColor = null;
      (this._renderPass.clearPass as any).overrideClearAlpha = -1;
      // Opaque overwrite (default postprocessing behavior)
      this._effectPass.fullscreenMaterial.blending = THREE.NoBlending;
      this._effectPass.fullscreenMaterial.transparent = false;
    }
  }

  // -----------------------------------------------------------------------
  // Ambient Occlusion
  // -----------------------------------------------------------------------

  setAOEnabled(flag: boolean): void {
    this._n8aoPass.enabled = flag;
    logger.debug(`StudioComposer: AO ${flag ? "enabled" : "disabled"}`);
  }

  setAOIntensity(value: number): void {
    this._n8aoPass.configuration.intensity = value;
  }

  // -----------------------------------------------------------------------
  // Tone Mapping
  // -----------------------------------------------------------------------

  /**
   * Set the tone mapping algorithm and exposure.
   *
   * @param mode     - One of "neutral", "ACES", "none"
   * @param exposure - Exposure multiplier (0 to 2, default 1.0)
   */
  setToneMapping(mode: StudioToneMapping, exposure: number): void {
    const mapped = TONE_MAP_MODE[mode];
    if (mapped === undefined) {
      logger.warn(`StudioComposer: unknown tone mapping mode "${mode}", falling back to Neutral`);
      this._renderer.toneMapping = THREE.NeutralToneMapping;
    } else {
      this._renderer.toneMapping = mapped;
    }
    this._renderer.toneMappingExposure = exposure;
  }

  // -----------------------------------------------------------------------
  // Shadow Mask
  // -----------------------------------------------------------------------

  /**
   * Enable or disable the screen-space shadow mask pipeline.
   *
   * When enabled, creates half-resolution render targets and a KawaseBlurPass.
   * When disabled, disposes those resources and disables the mask effect.
   */
  setShadowMaskEnabled(enabled: boolean): void {
    this._shadowMaskEnabled = enabled;

    if (enabled) {
      const halfW = Math.max(1, Math.floor(this._width / 2));
      const halfH = Math.max(1, Math.floor(this._height / 2));

      this._shadowMaskRT = new THREE.WebGLRenderTarget(halfW, halfH, {
        type: THREE.UnsignedByteType,
        depthBuffer: true,
      });
      this._blurredObjectMaskRT = new THREE.WebGLRenderTarget(halfW, halfH, {
        type: THREE.UnsignedByteType,
        depthBuffer: false,
      });
      this._blurredFloorMaskRT = new THREE.WebGLRenderTarget(halfW, halfH, {
        type: THREE.UnsignedByteType,
        depthBuffer: false,
      });

      this._blurPass = new KawaseBlurPass({ kernelSize: KernelSize.HUGE });
      this._blurPass.setSize(halfW, halfH);

      this._shadowMaskMaterial = new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 1.0,
      });
      // Force opaque rendering with no blending. ShadowMaterial defaults to
      // transparent=true which uses alpha blending — a front lit surface
      // (alpha=0) won't overwrite a back shadowed surface (alpha=1), causing
      // the entire shadow footprint to bleed through to all objects.
      // With NoBlending, the depth test alone determines which surface writes.
      this._shadowMaskMaterial.transparent = false;
      this._shadowMaskMaterial.blending = THREE.NoBlending;

      logger.debug("StudioComposer: shadow mask enabled");
    } else {
      this._shadowMaskRT?.dispose();
      this._shadowMaskRT = null;
      this._blurredObjectMaskRT?.dispose();
      this._blurredObjectMaskRT = null;
      this._blurredFloorMaskRT?.dispose();
      this._blurredFloorMaskRT = null;
      this._blurPass?.dispose();
      this._blurPass = null;
      this._shadowMaskMaterial?.dispose();
      this._shadowMaskMaterial = null;

      this._shadowMaskEffect.uniforms.get("shadowMaskObjects")!.value = null;
      this._shadowMaskEffect.uniforms.get("shadowMaskFloor")!.value = null;
      this._shadowMaskEffect.uniforms.get("shadowIntensity")!.value = 0;
      logger.debug("StudioComposer: shadow mask disabled");
    }
  }

  /**
   * Set shadow blur softness. Uses a fixed HUGE kernel with continuous scale.
   *
   * @param softness - 0 (sharpest) to 1 (softest)
   */
  setShadowSoftness(softness: number): void {
    if (!this._blurPass) return;
    // Continuous scale on a fixed large kernel avoids discrete jumps.
    // Range 0.05–1.0 gives sharp-to-very-soft; clamped so scale never hits 0
    // (which would collapse all iterations to a single pixel).
    this._blurPass.scale = 0.05 + softness * 0.95;
  }

  /**
   * Set the intensity of the object shadow mask overlay.
   *
   * @param intensity - 0 (no shadow) to 1 (full shadow)
   */
  setShadowMaskIntensity(intensity: number): void {
    this._shadowMaskEffect.uniforms.get("shadowIntensity")!.value = intensity;
  }

  // -----------------------------------------------------------------------
  // Camera
  // -----------------------------------------------------------------------

  setCamera(camera: THREE.Camera): void {
    this._camera = camera;
    this._renderPass.mainCamera = camera;
    this._n8aoPass.camera = camera;
    this._effectPass.mainCamera = camera;
  }

  // -----------------------------------------------------------------------
  // Resize
  // -----------------------------------------------------------------------

  setSize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._composer.setSize(width, height, false);
    this._n8aoPass.setSize(width, height);

    // Resize shadow mask RTs at half resolution
    if (this._shadowMaskRT && this._blurredObjectMaskRT && this._blurredFloorMaskRT) {
      const halfW = Math.max(1, Math.floor(width / 2));
      const halfH = Math.max(1, Math.floor(height / 2));
      this._shadowMaskRT.setSize(halfW, halfH);
      this._blurredObjectMaskRT.setSize(halfW, halfH);
      this._blurredFloorMaskRT.setSize(halfW, halfH);
      this._blurPass?.setSize(halfW, halfH);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  /**
   * Render one frame through the postprocessing pipeline.
   *
   * When shadow mask is enabled, runs a 3-phase pipeline:
   * 1. Render shadow mask (ShadowMaterial override) to half-res RT
   * 2. Blur via KawaseBlurPass
   * 3. Composite via ShadowMaskEffect in the main EffectPass
   *
   * When background protection is active, pre-clears the canvas with the
   * solid background color before compositing the tone-mapped scene on top
   * via alpha blending.
   */
  render(deltaTime?: number): void {
    // Two-pass shadow mask: objects and floor are blurred separately to
    // avoid depth-discontinuity halos at their boundary.
    if (this._shadowMaskEnabled && this._shadowMaskRT && this._blurPass
        && this._blurredObjectMaskRT && this._blurredFloorMaskRT) {
      this._renderer.shadowMap.autoUpdate = false;
      this._renderer.shadowMap.needsUpdate = true;

      // Pass 1: object shadow mask (floor hidden, generates shadow map)
      this._renderShadowMask("objects");
      this._blurPass.render(this._renderer, this._shadowMaskRT, this._blurredObjectMaskRT);

      // Pass 2: floor shadow mask (objects hidden, reuses shadow map)
      this._renderer.shadowMap.needsUpdate = false;
      this._renderShadowMask("floor");
      this._blurPass.render(this._renderer, this._shadowMaskRT, this._blurredFloorMaskRT);

      // Feed both blurred masks to the compositing effect
      this._shadowMaskEffect.uniforms.get("shadowMaskObjects")!.value = this._blurredObjectMaskRT.texture;
      this._shadowMaskEffect.uniforms.get("shadowMaskFloor")!.value = this._blurredFloorMaskRT.texture;

      this._renderer.shadowMap.autoUpdate = true;
    }

    // Hide floor during main render — blurred shadow mask provides floor shadow
    let floor: THREE.Object3D | undefined;
    let floorWasVisible = false;
    if (this._shadowMaskEnabled) {
      floor = this._scene.getObjectByName("studioFloor") ?? undefined;
      if (floor) {
        floorWasVisible = floor.visible;
        floor.visible = false;
      }
    }

    // Phase 3: main composer pipeline
    if (this._bgProtectColor) {
      this._renderer.getClearColor(_savedClearColor);
      const savedAlpha = this._renderer.getClearAlpha();

      this._renderer.setRenderTarget(null);
      this._renderer.setClearColor(this._bgProtectColor, 1.0);
      this._renderer.clear(true, false, false);

      this._renderer.setClearColor(_savedClearColor, savedAlpha);

      this._composer.render(deltaTime);
    } else {
      this._composer.render(deltaTime);
    }

    // Restore floor visibility for next frame's mask pass
    if (floor) floor.visible = floorWasVisible;
  }

  /**
   * Render a shadow mask to the half-resolution render target.
   *
   * @param mode - "objects" renders only objects (floor hidden),
   *               "floor" renders only the floor (objects hidden)
   * @internal
   */
  private _renderShadowMask(mode: "objects" | "floor"): void {
    if (!this._shadowMaskRT || !this._shadowMaskMaterial) return;

    // Save state
    const savedOverrideMaterial = this._scene.overrideMaterial;
    const savedBackground = this._scene.background;
    const floor = this._scene.getObjectByName("studioFloor");
    const floorWasVisible = floor ? floor.visible : false;

    this._renderer.getClearColor(_savedClearColor);
    const savedClearAlpha = this._renderer.getClearAlpha();

    this._receiveShadowState.clear();
    this._savedIntensities.clear();
    this._savedVisibility.clear();

    try {
      if (mode === "objects") {
        // Hide floor, show objects with receiveShadow=true
        if (floor) floor.visible = false;
        this._scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.castShadow) {
            this._receiveShadowState.set(obj, obj.receiveShadow);
            obj.receiveShadow = true;
          }
        });
      } else {
        // Show floor, hide all non-floor meshes
        if (floor) floor.visible = true;
        this._scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.castShadow) {
            this._savedVisibility.set(obj, obj.visible);
            obj.visible = false;
          }
        });
      }

      this._scene.overrideMaterial = this._shadowMaskMaterial;
      this._scene.background = null;

      // Temporarily set shadow intensity to 1.0 (mask captures full shadow)
      this._scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
          this._savedIntensities.set(obj, obj.shadow.intensity);
          obj.shadow.intensity = 1.0;
        }
      });

      this._renderer.setRenderTarget(this._shadowMaskRT);
      this._renderer.setClearColor(0x000000, 0);
      this._renderer.clear(true, true, false);
      this._renderer.render(this._scene, this._camera);
    } finally {
      for (const [light, intensity] of this._savedIntensities) {
        light.shadow.intensity = intensity;
      }

      if (mode === "objects") {
        for (const [mesh, wasReceiving] of this._receiveShadowState) {
          mesh.receiveShadow = wasReceiving;
        }
      } else {
        for (const [obj, wasVisible] of this._savedVisibility) {
          obj.visible = wasVisible;
        }
      }

      this._scene.overrideMaterial = savedOverrideMaterial;
      this._scene.background = savedBackground;
      if (floor) floor.visible = floorWasVisible;

      this._renderer.setRenderTarget(null);
      this._renderer.setClearColor(_savedClearColor, savedClearAlpha);
    }
  }

  // -----------------------------------------------------------------------
  // Disposal
  // -----------------------------------------------------------------------

  dispose(): void {
    this._shadowMaskRT?.dispose();
    this._shadowMaskRT = null;
    this._blurredObjectMaskRT?.dispose();
    this._blurredObjectMaskRT = null;
    this._blurredFloorMaskRT?.dispose();
    this._blurredFloorMaskRT = null;
    this._blurPass?.dispose();
    this._blurPass = null;
    this._shadowMaskMaterial?.dispose();
    this._shadowMaskMaterial = null;

    this._composer.dispose();
    logger.debug("StudioComposer: disposed");
  }
}

export { StudioComposer };
