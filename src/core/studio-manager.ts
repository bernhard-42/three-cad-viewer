/**
 * StudioManager — orchestrates Studio mode rendering.
 *
 * Extracted from viewer.ts to reduce its complexity. Owns the Studio-specific
 * resources (composer, floor, shadow lights, environment manager) and handles
 * all Studio subscriptions and mode enter/leave logic.
 *
 * Communicates with the Viewer via the StudioManagerContext interface to avoid
 * a circular dependency.
 */
import * as THREE from "three";
import type { ClippingState } from "../scene/clipping.js";
import { EnvironmentManager } from "../rendering/environment.js";
import { StudioFloor, RadiosityFloor } from "../rendering/studio-floor.js";
import { StudioComposer } from "../rendering/studio-composer.js";
import { RadiosityStudio } from "../rendering/radiosity-scene.js";
import {
  radiositySupported,
  hasRadiosityPatch,
  hasTriplanarKey,
} from "../rendering/radiosity.js";
import { applyTriplanarMapping } from "../rendering/triplanar.js";
import { ViewerState } from "./viewer-state.js";
import { logger } from "../utils/logger.js";
import { scaleLight } from "../utils/utils.js";
import type { NestedGroup, ObjectGroup } from "../scene/nestedgroup.js";
import { isObjectGroup } from "../scene/nestedgroup.js";
import type { Camera } from "../camera/camera.js";
import type { Clipping } from "../scene/clipping.js";
import type { BoundingBox } from "../scene/bbox.js";
import type { LoopReason } from "./viewer.js";

// ---------------------------------------------------------------------------
// Context interface — what StudioManager needs from Viewer
// ---------------------------------------------------------------------------

/**
 * Abstraction over Viewer that StudioManager uses. Keeps the dependency
 * one-directional (StudioManager → context, never StudioManager → Viewer).
 */
export interface StudioManagerContext {
  renderer: THREE.WebGLRenderer;
  state: ViewerState;

  /** Whether viewer has rendered content. */
  isRendered(): boolean;

  // Scene graph access (throw if not rendered)
  getScene(): THREE.Scene;
  getCamera(): Camera;
  getAmbientLight(): THREE.AmbientLight;
  getDirectLight(): THREE.DirectionalLight;
  getNestedGroup(): NestedGroup;
  getClipping(): Clipping;
  getBbox(): BoundingBox | null;
  getLastBboxId(): string | null;

  // Viewer actions
  setAxes(flag: boolean, notify?: boolean): void;
  setGrids(grids: [boolean, boolean, boolean], notify?: boolean): void;
  setOrtho(flag: boolean, notify?: boolean): void;

  // Callbacks
  update(updateMarker: boolean, notify?: boolean): void;
  /** Keep the render loop running while the radiosity lightmap converges. */
  setLoopReason(reason: LoopReason, flag: boolean): void;
  dispatchEvent(event: Event): void;
  onSelectionChanged(id: string | null): void;
}

// ---------------------------------------------------------------------------
// StudioManager
// ---------------------------------------------------------------------------

class StudioManager {
  readonly envManager: EnvironmentManager;
  /** Shadow-map pipeline floor (ShadowMaterial plane). */
  readonly floor: StudioFloor;
  /** Radiosity pipeline floor (lightmapped shadow catcher / grid). */
  readonly radiosityFloor: RadiosityFloor;

  private _composer: StudioComposer | null = null;
  /** Radiosity bake (null while the shadow-map pipeline is active). */
  private _radiosity: RadiosityStudio | null = null;
  /** Set when the renderer or the model cannot use radiosity (falls back to shadow maps). */
  private _radiosityUnavailable = false;
  /** Pending deferred loop-reason update (see `_radiosityFrame`). */
  private _loopTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Display uniforms shared by every radiosity solver created in this
   * session: compiled material programs keep the uniform objects they were
   * patched with, so a new solver must write into the same objects.
   */
  private _radiosityUniforms = {
    uRadWeight: { value: 0 },
    uRadShadow: { value: 1 },
  };
  private _active: boolean = false;
  private _savedClippingState: ClippingState | null = null;
  private _shadowLights: THREE.DirectionalLight[] = [];
  private _ctx: StudioManagerContext;
  /**
   * Renderer pixel ratio saved on Studio entry, restored on leave.
   * Studio mode bumps the pixel ratio to apply supersampling, which
   * compensates for low DPR (e.g., VSCode webviews report DPR=1 even
   * on Retina displays) and improves AA on shallow-angle edges.
   */
  private _savedPixelRatio: number | null = null;

  constructor(ctx: StudioManagerContext) {
    this._ctx = ctx;
    this.envManager = new EnvironmentManager();
    this.floor = new StudioFloor();
    this.radiosityFloor = new RadiosityFloor();
    this._setupSubscriptions();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  get isActive(): boolean {
    return this._active && this._ctx.isRendered();
  }

  get hasComposer(): boolean {
    return this._composer !== null;
  }

  /** Render via composer (call from Viewer.update / _animate). */
  render(): void {
    if (!this._composer) return;
    this._radiosityFrame();
    this._composer.render();
  }

  /** Whether the radiosity pipeline is running for this Studio session. */
  get radiosityActive(): boolean {
    return this._radiosity !== null;
  }

  /** Radiosity convergence 0..1 (1 when converged or inactive). */
  get radiosityProgress(): number {
    const r = this._radiosity;
    if (!r) return 1;
    const max = r.solver.maxSamples;
    if (max <= 0) return r.solver.iteration > 0 ? 1 : 0;
    return Math.min(1, r.solver.samples / max);
  }

  /** Accumulated directions so far (0 when inactive). */
  get radiositySamples(): number {
    return this._radiosity?.solver.samples ?? 0;
  }

  /** Bounces accumulated so far (0 when inactive). */
  get radiosityIteration(): number {
    return this._radiosity?.solver.iteration ?? 0;
  }

  /**
   * Re-apply the Studio shader patches to a material clone: `Material.clone()`
   * copies `lightMap` but not `onBeforeCompile`, so without this a clone would
   * render the lightmap with three's default (additive) lightmap path.
   */
  prepareMaterialClone(
    original: THREE.MeshPhysicalMaterial,
    clone: THREE.MeshPhysicalMaterial,
    geometry: THREE.BufferGeometry | null | undefined,
  ): void {
    if (hasTriplanarKey(original) && geometry) {
      applyTriplanarMapping(clone, geometry);
    }
    if (this._radiosity && hasRadiosityPatch(original)) {
      this._radiosity.patchMaterial(clone);
    } else if (clone.lightMap) {
      clone.lightMap = null;
      clone.needsUpdate = true;
    }
  }

  /** Update composer camera (call from Viewer.switchCamera). */
  setCamera(camera: THREE.Camera): void {
    this._composer?.setCamera(camera);
  }

  /** Resize composer (call from Viewer.resize). */
  setSize(width: number, height: number): void {
    this._composer?.setSize(width, height);
  }

  /** Whether env background needs per-frame update. */
  get isEnvBackgroundActive(): boolean {
    return this.envManager.isEnvBackgroundActive;
  }

  /** Update env background (ortho workaround, call per frame). */
  updateEnvBackground(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
  ): void {
    this.envManager.updateEnvBackground(renderer, camera);
  }

  /** Check if an environment name is a Poly Haven preset. */
  isEnvPreset(name: string): boolean {
    return this.envManager.isPreset(name);
  }

  /**
   * Get the ObjectGroup and path for the currently selected object.
   * Returns null if nothing selected or Studio mode inactive.
   */
  getSelectedObjectGroup(): { object: ObjectGroup; path: string } | null {
    if (!this._active || this._ctx.getLastBboxId() == null) {
      return null;
    }
    const id = this._ctx.getLastBboxId()!;
    const entry = this._ctx.getNestedGroup().groups[id];
    if (!isObjectGroup(entry)) {
      return null;
    }
    return { object: entry, path: id };
  }

  // -------------------------------------------------------------------------
  // Mode enter/leave
  // -------------------------------------------------------------------------

  enterStudioMode = async (): Promise<void> => {
    if (!this._ctx.isRendered()) return;
    this._active = true;

    const { renderer, state } = this._ctx;

    try {
      // 1. Save and disable clipping
      const clipping = this._ctx.getClipping();
      this._savedClippingState = clipping.saveState();
      renderer.localClippingEnabled = false;
      clipping.setVisible(false);
      if (clipping.planeHelpers) {
        clipping.planeHelpers.visible = false;
      }

      // 2. Build/swap studio materials (async due to textures)
      const nestedGroup = this._ctx.getNestedGroup();
      const unresolvedTags = await nestedGroup.enterStudioMode(
        state.get("studioTextureMapping"),
      );
      if (!this._active) return;

      // Surface unresolved material tags to the UI
      if (unresolvedTags.length > 0) {
        this._ctx.dispatchEvent(
          new CustomEvent("tcv-material-warnings", { detail: unresolvedTags }),
        );
      }

      // 3. Load environment map
      const envName = state.get("studioEnvironment");

      // Sync envManager's 4K setting with state. updateStudioState() writes
      // studio4kEnvMaps silently (notify=false), so the subscription that
      // normally forwards this to envManager never fires on initial load.
      // Without this sync, envManager keeps its default (2K) and loads the
      // wrong URL even though the checkbox reads "checked".
      const want4k = state.get("studio4kEnvMaps");
      if (want4k !== this.envManager.use4kEnvMaps) {
        await this.envManager.setUse4kEnvMaps(want4k, envName, renderer);
      } else {
        await this.envManager.loadEnvironment(envName, renderer);
      }
      if (!this._active) return;

      // 4. Apply ALL rendering changes atomically
      const scene = this._ctx.getScene();
      const camera = this._ctx.getCamera();
      this.envManager.apply(
        scene,
        state.get("studioEnvIntensity"),
        state.get("studioBackground"),
        state.get("up") === "Z",
        camera.ortho,
        state.get("studioEnvRotation"),
      );

      // Lighting: disable CAD lights; environment IBL provides all illumination
      this._ctx.getAmbientLight().intensity = 0;
      this._ctx.getDirectLight().intensity = 0;

      // Floor
      this._configureFloor();

      // Studio-only supersampling. Bump pixel ratio so the renderer draws to
      // a higher-resolution buffer; the browser downsamples to the canvas
      // display size, giving smooth AA on shallow-angle silhouettes that
      // MSAA alone leaves stair-stepped. Especially important in webview
      // hosts (e.g., VSCode) where window.devicePixelRatio is reported as 1
      // even on Retina displays. Restored in leaveStudioMode.
      this._savedPixelRatio = renderer.getPixelRatio();
      const targetPixelRatio = Math.max(2, window.devicePixelRatio);
      if (targetPixelRatio !== this._savedPixelRatio) {
        renderer.setPixelRatio(targetPixelRatio);
        renderer.setSize(state.get("cadWidth"), state.get("height"));
      }

      // Create composer (must be before shadows)
      if (!this._composer) {
        this._composer = new StudioComposer(
          renderer,
          scene,
          camera.getCamera(),
          state.get("cadWidth"),
          state.get("height"),
          () => {
            // SMAA finished loading its async lookup textures. Re-render so
            // the first visible frame has anti-aliasing — without this the
            // user sees aliased edges until they interact with the scene.
            if (this._active && this._ctx.isRendered()) {
              this._ctx.update(true, false);
            }
          },
        );
      }

      // Lighting: radiosity lightmap or directional shadow map (requires composer)
      this._configureLighting();

      // Tone mapping
      this._composer.setToneMapping(
        state.get("studioToneMapping"),
        state.get("studioExposure"),
      );

      // Background protection
      const bg = scene.background;
      this._composer.setBackgroundProtect(
        bg instanceof THREE.Color ? bg : null,
      );

      // Ambient Occlusion (radius scaled to the model)
      const aoIntensity = state.get("studioAOIntensity");
      this._composer.setAOScale(this._sceneExtent());
      this._composer.setAOIntensity(aoIntensity);
      this._composer.setAOEnabled(aoIntensity > 0);

      // Edges are always hidden in Studio mode
      nestedGroup.setStudioShowEdges(false);

      this._ctx.update(true, false);
    } catch (err) {
      if (this._composer) {
        this._composer.dispose();
        this._composer = null;
      }
      // Restore pixel ratio if we bumped it before failure
      if (this._savedPixelRatio !== null) {
        renderer.setPixelRatio(this._savedPixelRatio);
        renderer.setSize(state.get("cadWidth"), state.get("height"));
        this._savedPixelRatio = null;
      }
      this._active = false;
      logger.error("Unexpected error entering studio mode", err);
    }
  };

  leaveStudioMode = (): void => {
    if (!this._ctx.isRendered()) return;

    const { renderer, state } = this._ctx;
    const nestedGroup = this._ctx.getNestedGroup();

    // 1. Restore materials and geometries
    this._stopRadiosity();
    nestedGroup.leaveStudioMode();

    // 2. Tear down composer
    if (this._composer) {
      this._composer.dispose();
      this._composer = null;
    }

    // Restore the renderer's pixel ratio that was bumped on Studio entry.
    if (this._savedPixelRatio !== null) {
      renderer.setPixelRatio(this._savedPixelRatio);
      renderer.setSize(state.get("cadWidth"), state.get("height"));
      this._savedPixelRatio = null;
    }

    // 3. Remove environment, disable shadows
    this.envManager.remove(this._ctx.getScene());
    this._setShadowsEnabled(false);

    // 4. Restore lighting
    this._ctx.getAmbientLight().intensity = scaleLight(
      state.get("ambientIntensity"),
    );
    this._ctx.getDirectLight().intensity = scaleLight(
      state.get("directIntensity"),
    );

    // 5. Disable tone mapping
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // 6. Restore clipping state
    if (this._savedClippingState) {
      this._ctx.getClipping().restoreState(this._savedClippingState);
      this._savedClippingState = null;
    }

    // 7. Clear active flag; edges restored by ObjectGroup.leaveStudioMode()
    this._active = false;

    this._ctx.update(true, false);
  };

  resetStudio = (): void => {
    const defaults = ViewerState.STUDIO_MODE_DEFAULTS;
    const state = this._ctx.state;
    state.set("studioEnvironment", defaults.studioEnvironment);
    state.set("studioEnvIntensity", defaults.studioEnvIntensity);
    state.set("studioBackground", defaults.studioBackground);
    state.set("studioToneMapping", defaults.studioToneMapping);
    state.set("studioExposure", defaults.studioExposure);
    state.set("studio4kEnvMaps", defaults.studio4kEnvMaps);
    state.set("studioTextureMapping", defaults.studioTextureMapping);
    state.set("studioEnvRotation", defaults.studioEnvRotation);
    state.set("studioShadowIntensity", defaults.studioShadowIntensity);
    state.set("studioShadowSoftness", defaults.studioShadowSoftness);
    state.set("studioAOIntensity", defaults.studioAOIntensity);
    state.set("studioLighting", defaults.studioLighting);
    state.set("studioFloor", defaults.studioFloor);
    state.set("studioRadiosityQuality", defaults.studioRadiosityQuality);
    state.set("studioRadiosityDirections", defaults.studioRadiosityDirections);
    state.set("studioRadiositySamples", defaults.studioRadiositySamples);
    state.set("studioRadiosityBias", defaults.studioRadiosityBias);
    state.set("studioRadiosityBounce", defaults.studioRadiosityBounce);
    state.set(
      "studioRadiosityEnvSampling",
      defaults.studioRadiosityEnvSampling,
    );
  };

  /**
   * Dispose all Studio resources. Called from Viewer.dispose().
   * Must be called BEFORE renderer.dispose().
   */
  dispose(): void {
    this._stopRadiosity();
    if (this._composer) {
      this._composer.dispose();
      this._composer = null;
    }
    this._removeShadowLights();
    this.envManager.dispose();
    this.floor.dispose();
    this.radiosityFloor.dispose();
    this._active = false;
    this._savedClippingState = null;
  }

  // -------------------------------------------------------------------------
  // Private — subscriptions
  // -------------------------------------------------------------------------

  private _setupSubscriptions(): void {
    const isActive = (): boolean => {
      return this._active && this._ctx.isRendered();
    };

    const reapplyEnv = (orthoOverride?: boolean): void => {
      this.envManager.apply(
        this._ctx.getScene(),
        this._ctx.state.get("studioEnvIntensity"),
        this._ctx.state.get("studioBackground"),
        this._ctx.state.get("up") === "Z",
        orthoOverride ?? this._ctx.getCamera().ortho,
        this._ctx.state.get("studioEnvRotation"),
      );
      if (this._composer) {
        const bg = this._ctx.getScene().background;
        this._composer.setBackgroundProtect(
          bg instanceof THREE.Color ? bg : null,
        );
      }
    };

    const state = this._ctx.state;

    state.subscribe("studioEnvironment", (change) => {
      if (!isActive()) return;
      this.envManager
        .loadEnvironment(change.new, this._ctx.renderer)
        .then(() => {
          if (!isActive()) return;
          reapplyEnv();
          this._syncRadiosityEnvironment();
          if (this._shadowMapActive()) {
            this._configureShadowLights();
          }
          this._ctx.update(true, false);
          this._ctx.dispatchEvent(new Event("tcv-studio-ready"));
        })
        .catch((err) => {
          logger.error("Unexpected error loading studio environment", err);
          this._ctx.dispatchEvent(new Event("tcv-studio-ready"));
        });
    });

    state.subscribe("studioEnvIntensity", (change) => {
      if (!isActive()) return;
      reapplyEnv();
      this.radiosityFloor.setEnvIntensity(change.new);
      this._ctx.update(true, false);
    });

    state.subscribe("studioEnvRotation", () => {
      if (!isActive()) return;
      reapplyEnv();
      this._syncRadiosityEnvironment();
      if (this._shadowMapActive()) {
        this._configureShadowLights();
      }
      this._ctx.update(true, false);
    });

    state.subscribe("studioShadowIntensity", (change) => {
      if (!isActive()) return;
      const intensity = change.new;
      if (this._radiosity) {
        this._radiosity.solver.displayUniforms.uRadShadow.value = intensity;
        this.radiosityFloor.setShadowIntensity(intensity);
        this._ctx.update(true, false);
        return;
      }
      const wasEnabled = change.old != null && change.old > 0;
      const nowEnabled = intensity > 0;

      if (nowEnabled && !wasEnabled) {
        this._setShadowsEnabled(true);
      } else if (!nowEnabled && wasEnabled) {
        this._setShadowsEnabled(false);
      }

      if (nowEnabled) {
        for (const light of this._shadowLights) {
          light.shadow.intensity = intensity;
        }
        this.floor.setShadowIntensity(intensity);
        if (this._composer) {
          this._composer.setShadowMaskIntensity(intensity * 0.75);
        }
      }
      this._ctx.update(true, false);
    });

    state.subscribe("studioShadowSoftness", (change) => {
      if (!isActive()) return;
      if (this._radiosity) {
        // Softness pre-blurs the light sources in the environment.
        this._syncRadiosityEnvironment();
        this._ctx.update(true, false);
        return;
      }
      if (state.get("studioShadowIntensity") <= 0) return;
      if (this._composer) {
        this._composer.setShadowSoftness(change.new);
      }
      this._ctx.update(true, false);
    });

    state.subscribe("studioAOIntensity", (change) => {
      if (!isActive()) return;
      if (this._composer) {
        const intensity = change.new;
        this._composer.setAOEnabled(intensity > 0);
        this._composer.setAOIntensity(intensity);
      }
      this._ctx.update(true, false);
    });

    state.subscribe("studioBackground", () => {
      if (!isActive()) return;
      reapplyEnv();
      this._applyFloorAppearance();
      this._ctx.update(true, false);
    });

    state.subscribe("studioLighting", () => {
      if (!isActive()) return;
      this._configureLighting();
      this._ctx.update(true, false);
    });

    state.subscribe("studioFloor", () => {
      if (!isActive()) return;
      if (this._radiosity) {
        // The floor is part of the bake (occluder + bounce): rebuild.
        this._buildRadiosity();
      }
      this._ctx.update(true, false);
    });

    state.subscribe("studioRadiosityQuality", () => {
      if (!isActive() || !this._radiosity) return;
      this._stopRadiosity();
      this._startRadiosity();
      this._ctx.update(true, false);
    });

    state.subscribe("studioRadiosityDirections", () => {
      if (!isActive() || !this._radiosity) return;
      // The direction count is baked into the illumination map layout and
      // the gather shader: rebuild the solver.
      this._stopRadiosity();
      this._startRadiosity();
      this._ctx.update(true, false);
    });

    state.subscribe("studioRadiositySamples", (change) => {
      if (!isActive() || !this._radiosity) return;
      this._radiosity.solver.maxSamples = Math.max(0, change.new);
      this._requestLoop(!this._radiosity.solver.converged);
      this._dispatchProgress();
    });

    state.subscribe("studioRadiosityBias", (change) => {
      if (!isActive() || !this._radiosity) return;
      this._radiosity.solver.setSelfBias(change.new);
      this._requestLoop(true);
      this._ctx.update(true, false);
    });

    state.subscribe("studioRadiosityBounce", (change) => {
      if (!isActive() || !this._radiosity) return;
      this._radiosity.solver.setBounce(change.new);
      this._requestLoop(true);
      this._ctx.update(true, false);
    });

    state.subscribe("studioRadiosityEnvSampling", (change) => {
      if (!isActive() || !this._radiosity) return;
      this._radiosity.solver.setEnvSampling(change.new);
      this._requestLoop(true);
      this._ctx.update(true, false);
    });

    state.subscribe("ortho", (change) => {
      if (!isActive()) return;
      reapplyEnv(change.new as boolean);
      this._ctx.update(true, false);
    });

    state.subscribe("studioToneMapping", () => {
      if (!isActive()) return;
      this._applyToneMapping();
      this._ctx.update(true, false);
    });

    state.subscribe("studioExposure", () => {
      if (!isActive()) return;
      this._applyToneMapping();
      this._ctx.update(true, false);
    });

    state.subscribe("studio4kEnvMaps", (change) => {
      if (!isActive()) return;
      const envName = state.get("studioEnvironment");
      this.envManager
        .setUse4kEnvMaps(change.new, envName, this._ctx.renderer)
        .then(() => {
          if (!isActive()) return;
          reapplyEnv();
          this._syncRadiosityEnvironment();
          if (this._shadowMapActive()) {
            this._configureShadowLights();
          }
          this._ctx.update(true, false);
          this._ctx.dispatchEvent(new Event("tcv-studio-ready"));
        });
    });

    state.subscribe("studioTextureMapping", () => {
      if (!isActive()) return;
      this._rebuildMaterials().finally(() => {
        this._ctx.dispatchEvent(new Event("tcv-studio-ready"));
      });
    });
  }

  // -------------------------------------------------------------------------
  // Private — floor, shadows, tone mapping, material rebuild
  // -------------------------------------------------------------------------

  /** Whether the shadow-map pipeline (not radiosity) should drive shadows. */
  private _shadowMapActive(): boolean {
    return (
      this._radiosity === null &&
      this._ctx.state.get("studioShadowIntensity") > 0
    );
  }

  /** Apply the selected lighting pipeline (called on entry and on change). */
  private _configureLighting(): void {
    const state = this._ctx.state;
    const wantRadiosity =
      state.get("studioLighting") === "radiosity" &&
      !this._radiosityUnavailable &&
      radiositySupported(this._ctx.renderer);
    if (wantRadiosity) {
      this._setShadowsEnabled(false);
      this._startRadiosity();
      if (this._radiosity) return;
      // Build failed → fall through to shadow maps for this session.
    } else {
      this._stopRadiosity();
    }
    if (state.get("studioShadowIntensity") > 0) {
      this._setShadowsEnabled(true);
    }
  }

  /** Largest side of the model's bounding box (1 when unknown). */
  private _sceneExtent(): number {
    const bbox = this._ctx.getBbox();
    if (!bbox) return 1;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    return Math.max(size.x, size.y, size.z, 1e-6);
  }

  /** Up axis of the model as a vector ("Y" or "Z"; legacy "L" is Z-up). */
  private _upAxis(): "Y" | "Z" {
    return this._ctx.state.get("up") === "Y" ? "Y" : "Z";
  }

  private _startRadiosity(): void {
    if (this._radiosity || !this._ctx.isRendered()) return;
    const renderer = this._ctx.renderer;
    const state = this._ctx.state;
    try {
      this._radiosity = new RadiosityStudio(
        renderer,
        state.get("studioRadiosityQuality"),
        {
          directions: state.get("studioRadiosityDirections"),
          maxSamples: state.get("studioRadiositySamples"),
          selfBias: state.get("studioRadiosityBias"),
          bounce: state.get("studioRadiosityBounce"),
          envSampling: state.get("studioRadiosityEnvSampling"),
          displayUniforms: this._radiosityUniforms,
        },
      );
    } catch (err) {
      logger.warn("radiosity: solver creation failed, using shadow maps", err);
      this._radiosityUnavailable = true;
      this._radiosity = null;
      return;
    }
    this._configureRadiosityFloor();
    this._applyFloorAppearance();
    this._buildRadiosity();
  }

  /** (Re)chart the scene and prime the solver. Falls back on failure. */
  private _buildRadiosity(): void {
    const r = this._radiosity;
    if (!r || !this._ctx.isRendered()) return;
    const state = this._ctx.state;
    const floorMode = state.get("studioFloor");
    this.radiosityFloor.setMode(floorMode);
    const floor = floorMode === "none" ? null : this.radiosityFloor;
    const upAxis = this._upAxis();
    const up =
      upAxis === "Y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    let info = null;
    try {
      info = r.build(this._ctx.getNestedGroup(), floor, up);
    } catch (err) {
      logger.warn("radiosity: build failed, using shadow maps", err);
    }
    if (!info) {
      this._radiosityUnavailable = true;
      this._stopRadiosity();
      return;
    }
    r.solver.displayUniforms.uRadShadow.value = state.get(
      "studioShadowIntensity",
    );
    this.radiosityFloor.setShadowIntensity(state.get("studioShadowIntensity"));
    this.radiosityFloor.setEnvIntensity(state.get("studioEnvIntensity"));
    this._syncRadiosityEnvironment();
    // Prime the lightmap so the first frame is not black/noisy.
    for (let i = 0; i < 4; i++) r.solver.bounce();
    r.syncLightmap(this._ctx.getNestedGroup());
    this._requestLoop(true);
  }

  private _stopRadiosity(): void {
    if (this._loopTimer !== null) {
      clearTimeout(this._loopTimer);
      this._loopTimer = null;
    }
    if (this._radiosity) {
      this._radiosity.dispose();
      this._radiosity = null;
      this._dispatchProgress();
    }
    this.radiosityFloor.setMode("none");
    if (this._ctx.isRendered()) {
      this._ctx.setLoopReason("radiosity", false);
    }
  }

  /** Feed the scene's current environment (and softness pre-blur) to the solver. */
  private _syncRadiosityEnvironment(): void {
    const r = this._radiosity;
    if (!r || !this._ctx.isRendered()) return;
    const scene = this._ctx.getScene();
    const blur = this._ctx.state.get("studioShadowSoftness") * 0.5;
    r.solver.setEnvironment(scene.environment, scene.environmentRotation, blur);
  }

  /** Position the radiosity floor under the model bounds. */
  private _configureRadiosityFloor(): void {
    const bbox = this._ctx.getBbox();
    if (!bbox) return;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxExtent = Math.max(size.x, size.y, size.z, 1e-6);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const upAxis = this._upAxis();
    const level =
      (upAxis === "Y" ? bbox.min.y : bbox.min.z) - maxExtent * 0.001;
    this.radiosityFloor.configure(center, level, maxExtent, upAxis);
  }

  /** Light/dark floor palette and horizon colour follow the background. */
  private _applyFloorAppearance(): void {
    if (!this._ctx.isRendered()) return;
    const bgMode = this._ctx.state.get("studioBackground");
    const light = bgMode === "white" || bgMode === "gradient";
    const bg = this._ctx.getScene().background;
    this.radiosityFloor.setAppearance(
      light,
      bg instanceof THREE.Color ? bg : null,
    );
  }

  /**
   * One bounce per rendered frame while the lightmap converges, plus change
   * detection (visibility/transforms → reset, parts/geometry → rebuild).
   */
  private _radiosityFrame(): void {
    const r = this._radiosity;
    if (!r || !this._active || !this._ctx.isRendered()) return;
    const nestedGroup = this._ctx.getNestedGroup();
    const change = r.checkChanges(nestedGroup);
    if (change === "rebuild") {
      this._buildRadiosity();
      if (!this._radiosity) return;
    } else if (change === "reset") {
      r.solver.reset();
    }
    const converged = r.solver.converged;
    if (!converged) r.solver.bounce();
    r.syncLightmap(nestedGroup);
    this._requestLoop(!r.solver.converged);
    const it = r.solver.iteration;
    if (it % 10 === 0 || r.solver.converged || it <= 4)
      this._dispatchProgress();
  }

  /** Tell the UI how far the bake is (`tcv-radiosity-progress`). */
  private _dispatchProgress(): void {
    const r = this._radiosity;
    this._ctx.dispatchEvent(
      new CustomEvent("tcv-radiosity-progress", {
        detail: {
          iteration: r ? r.solver.iteration : 0,
          samples: r ? r.solver.samples : 0,
          maxSamples: r ? r.solver.maxSamples : 0,
          directions: r ? r.solver.directions : 0,
          active: r !== null,
        },
      }),
    );
  }

  /**
   * Toggle the "radiosity" loop reason outside the render call: starting the
   * loop renders synchronously, which must not happen from inside a render.
   */
  private _requestLoop(flag: boolean): void {
    if (this._loopTimer !== null) return;
    this._loopTimer = setTimeout(() => {
      this._loopTimer = null;
      if (!this._ctx.isRendered()) return;
      const want = flag && this._radiosity !== null && this._active;
      this._ctx.setLoopReason("radiosity", want);
    }, 0);
  }

  private _configureFloor(): void {
    const bbox = this._ctx.getBbox();
    if (!bbox) return;
    const maxExtent = Math.max(
      bbox.max.x - bbox.min.x,
      bbox.max.y - bbox.min.y,
      bbox.max.z - bbox.min.z,
    );
    const zPosition = bbox.min.z - maxExtent * 0.001;
    this.floor.configure(zPosition, maxExtent);
  }

  private _configureShadowLights(): void {
    this._removeShadowLights();

    const bbox = this._ctx.getBbox();
    if (!bbox || !this._ctx.isRendered()) return;

    const state = this._ctx.state;
    const envName = state.get("studioEnvironment");
    const detection = this.envManager.getLightDetection(envName);
    if (!detection || detection.lights.length === 0) return;

    const bboxCenter = new THREE.Vector3(
      (bbox.min.x + bbox.max.x) / 2,
      (bbox.min.y + bbox.max.y) / 2,
      (bbox.min.z + bbox.max.z) / 2,
    );
    const maxExtent = Math.max(
      bbox.max.x - bbox.min.x,
      bbox.max.y - bbox.min.y,
      bbox.max.z - bbox.min.z,
    );

    const isZUp = state.get("up") === "Z";
    const envRotationRad = (state.get("studioEnvRotation") * Math.PI) / 180;

    this._ctx.renderer.shadowMap.enabled = true;
    this._ctx.renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this._ctx.getScene();

    for (const detected of detection.lights) {
      let [dx, dy, dz] = detected.direction;

      if (isZUp) {
        const oy = dy;
        const oz = dz;
        dy = -oz;
        dz = oy;
      }

      if (envRotationRad !== 0) {
        if (isZUp) {
          const cosR = Math.cos(envRotationRad);
          const sinR = Math.sin(envRotationRad);
          const nx = dx * cosR - dy * sinR;
          const ny = dx * sinR + dy * cosR;
          dx = nx;
          dy = ny;
        } else {
          const cosR = Math.cos(envRotationRad);
          const sinR = Math.sin(envRotationRad);
          const nx = dx * cosR + dz * sinR;
          const nz = -dx * sinR + dz * cosR;
          dx = nx;
          dz = nz;
        }
      }

      const dir = new THREE.Vector3(dx, dy, dz).normalize();
      const light = new THREE.DirectionalLight(0xffffff, 0.01);

      light.position.copy(bboxCenter).addScaledVector(dir, maxExtent * 3);
      light.target.position.copy(bboxCenter);

      light.castShadow = true;
      const frustumSize = maxExtent * 6.0;
      light.shadow.camera.left = -frustumSize;
      light.shadow.camera.right = frustumSize;
      light.shadow.camera.top = frustumSize;
      light.shadow.camera.bottom = -frustumSize;
      light.shadow.camera.near = maxExtent * 0.1;
      light.shadow.camera.far = maxExtent * 7;
      light.shadow.mapSize.set(4096, 4096);
      light.shadow.bias = -0.001;
      light.shadow.intensity = state.get("studioShadowIntensity");

      scene.add(light);
      scene.add(light.target);
      this._shadowLights.push(light);
    }

    if (this._composer) {
      this._composer.setShadowMaskEnabled(true);
      this._composer.setShadowSoftness(state.get("studioShadowSoftness"));
      this._composer.setShadowMaskIntensity(
        state.get("studioShadowIntensity") * 0.75,
      );
    }
  }

  private _removeShadowLights(): void {
    if (this._ctx.isRendered()) {
      const scene = this._ctx.getScene();
      for (const light of this._shadowLights) {
        scene.remove(light);
        scene.remove(light.target);
        light.shadow.map?.dispose();
        light.dispose();
      }
    } else {
      for (const light of this._shadowLights) {
        light.shadow.map?.dispose();
        light.dispose();
      }
    }
    this._shadowLights = [];

    if (this._composer) {
      this._composer.setShadowMaskEnabled(false);
    }
  }

  private _setShadowsEnabled(enabled: boolean): void {
    if (!this._ctx.isRendered()) return;

    const nestedGroup = this._ctx.getNestedGroup();

    if (enabled) {
      this._configureShadowLights();

      // Back-face meshes share geometry with front meshes but use a
      // MeshBasicMaterial without alphaMap/alphaTest, so letting them cast
      // shadows overrides the front mesh's alpha-tested silhouette with a
      // solid one. The front material is DoubleSide when alphaMap is set,
      // so its shadow pass already covers both sides of the geometry.
      nestedGroup.rootGroup?.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material.name !== "backMaterial") {
          obj.castShadow = true;
        }
      });

      this.floor.setShadowsEnabled(true);

      this._ctx.getScene().traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const m of mats) {
            m.needsUpdate = true;
          }
        }
      });
    } else {
      this._removeShadowLights();
      this._ctx.renderer.shadowMap.enabled = false;

      nestedGroup.rootGroup?.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
        }
      });

      this.floor.setShadowsEnabled(false);
    }
  }

  private _applyToneMapping(): void {
    if (this._composer) {
      this._composer.setToneMapping(
        this._ctx.state.get("studioToneMapping"),
        this._ctx.state.get("studioExposure"),
      );
    }
  }

  private _rebuildMaterials = async (): Promise<void> => {
    const nestedGroup = this._ctx.getNestedGroup();
    nestedGroup.leaveStudioMode();
    nestedGroup.clearStudioMaterialCache();
    const unresolvedTags = await nestedGroup.enterStudioMode(
      this._ctx.state.get("studioTextureMapping"),
    );
    if (this._active) {
      nestedGroup.setStudioShowEdges(false);
      this._radiosity?.patchMaterials(nestedGroup);
      if (unresolvedTags.length > 0) {
        this._ctx.dispatchEvent(
          new CustomEvent("tcv-material-warnings", { detail: unresolvedTags }),
        );
      }
      this._ctx.update(true, false);
    }
  };
}

export { StudioManager };
