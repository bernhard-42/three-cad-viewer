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
import { StudioFloor } from "../rendering/studio-floor.js";
import { StudioComposer } from "../rendering/studio-composer.js";
import { ViewerState } from "./viewer-state.js";
import { logger } from "../utils/logger.js";
import { scaleLight } from "../utils/utils.js";
import type { NestedGroup, ObjectGroup } from "../scene/nestedgroup.js";
import { isObjectGroup } from "../scene/nestedgroup.js";
import type { Camera } from "../camera/camera.js";
import type { Clipping } from "../scene/clipping.js";
import type { BoundingBox } from "../scene/bbox.js";

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

  // Callbacks
  update(updateMarker: boolean, notify?: boolean): void;
  dispatchEvent(event: Event): void;
  onSelectionChanged(id: string | null): void;
}

// ---------------------------------------------------------------------------
// StudioManager
// ---------------------------------------------------------------------------

class StudioManager {
  readonly envManager: EnvironmentManager;
  readonly floor: StudioFloor;

  private _composer: StudioComposer | null = null;
  private _active: boolean = false;
  private _savedClippingState: ClippingState | null = null;
  private _shadowLights: THREE.DirectionalLight[] = [];
  private _ctx: StudioManagerContext;

  constructor(ctx: StudioManagerContext) {
    this._ctx = ctx;
    this.envManager = new EnvironmentManager();
    this.floor = new StudioFloor();
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
    this._composer?.render();
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
  updateEnvBackground(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
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
      await nestedGroup.enterStudioMode(state.get("studioTextureMapping"));
      if (!this._active) return;

      // 3. Load environment map
      const envName = state.get("studioEnvironment");
      await this.envManager.loadEnvironment(envName, renderer);
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

      // Create composer (must be before shadows)
      if (!this._composer) {
        this._composer = new StudioComposer(
          renderer,
          scene,
          camera.getCamera(),
          state.get("cadWidth"),
          state.get("height"),
        );
      }

      // Shadows (requires composer)
      if (state.get("studioShadowIntensity") > 0) {
        this._setShadowsEnabled(true);
      }

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

      // Ambient Occlusion
      const aoIntensity = state.get("studioAOIntensity");
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
      this._active = false;
      logger.error("Unexpected error entering studio mode", err);
    }
  };

  leaveStudioMode = (): void => {
    if (!this._ctx.isRendered()) return;

    const { renderer, state } = this._ctx;
    const nestedGroup = this._ctx.getNestedGroup();

    // 1. Restore materials
    nestedGroup.leaveStudioMode();

    // 2. Tear down composer
    if (this._composer) {
      this._composer.dispose();
      this._composer = null;
    }

    // 3. Remove environment, disable shadows
    this.envManager.remove(this._ctx.getScene());
    this._setShadowsEnabled(false);

    // 4. Restore lighting
    this._ctx.getAmbientLight().intensity = scaleLight(state.get("ambientIntensity"));
    this._ctx.getDirectLight().intensity = scaleLight(state.get("directIntensity"));

    // 5. Disable tone mapping
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    // 6. Restore clipping state
    if (this._savedClippingState) {
      this._ctx.getClipping().restoreState(this._savedClippingState);
      this._savedClippingState = null;
    }

    // 7. Edges restored by ObjectGroup.leaveStudioMode()
    // 8. Clear active flag
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
  };

  /**
   * Dispose all Studio resources. Called from Viewer.dispose().
   * Must be called BEFORE renderer.dispose().
   */
  dispose(): void {
    if (this._composer) {
      this._composer.dispose();
      this._composer = null;
    }
    this._removeShadowLights();
    this.envManager.dispose();
    this.floor.dispose();
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
      this.envManager.loadEnvironment(change.new, this._ctx.renderer).then(() => {
        if (!isActive()) return;
        reapplyEnv();
        if (state.get("studioShadowIntensity") > 0) {
          this._configureShadowLights();
        }
        this._ctx.update(true, false);
        this._ctx.dispatchEvent(new Event("tcv-studio-ready"));
      }).catch((err) => {
        logger.error("Unexpected error loading studio environment", err);
        this._ctx.dispatchEvent(new Event("tcv-studio-ready"));
      });
    });

    state.subscribe("studioEnvIntensity", () => {
      if (!isActive()) return;
      reapplyEnv();
      this._ctx.update(true, false);
    });

    state.subscribe("studioEnvRotation", () => {
      if (!isActive()) return;
      reapplyEnv();
      if (state.get("studioShadowIntensity") > 0) {
        this._configureShadowLights();
      }
      this._ctx.update(true, false);
    });

    state.subscribe("studioShadowIntensity", (change) => {
      if (!isActive()) return;
      const intensity = change.new;
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
      this.envManager.setUse4kEnvMaps(change.new, envName, this._ctx.renderer).then(() => {
        if (!isActive()) return;
        reapplyEnv();
        if (state.get("studioShadowIntensity") > 0) {
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
      const frustumSize = maxExtent * 4.0;
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
      this._composer.setShadowMaskIntensity(state.get("studioShadowIntensity") * 0.75);
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

      nestedGroup.rootGroup?.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
        }
      });

      this.floor.setShadowsEnabled(true);

      this._ctx.getScene().traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
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
    await nestedGroup.enterStudioMode(this._ctx.state.get("studioTextureMapping"));
    if (this._active) {
      nestedGroup.setStudioShowEdges(false);
      this._ctx.update(true, false);
    }
  };
}

export { StudioManager };
