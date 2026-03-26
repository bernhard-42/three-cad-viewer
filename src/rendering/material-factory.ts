import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ColorValue, MaterialAppearance } from "../core/types.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";
import { getColorSpaceForMap } from "./texture-cache.js";

/** threejs-materials property keys that hold [r,g,b] color arrays (linear RGB). */
const COLOR_ARRAY_KEYS = new Set([
  "color", "specularColor", "sheenColor", "emissive", "attenuationColor",
]);

/** Map from threejs-materials property names to Three.js texture map property names. */
const PROPERTY_TO_MAP: Record<string, string> = {
  color: "map",
  metalness: "metalnessMap",
  roughness: "roughnessMap",
  normal: "normalMap",
  emissive: "emissiveMap",
  specularIntensity: "specularIntensityMap",
  specularColor: "specularColorMap",
  clearcoat: "clearcoatMap",
  clearcoatRoughness: "clearcoatRoughnessMap",
  clearcoatNormal: "clearcoatNormalMap",
  transmission: "transmissionMap",
  sheenColor: "sheenColorMap",
  sheenRoughness: "sheenRoughnessMap",
  anisotropy: "anisotropyMap",
  iridescence: "iridescenceMap",
  iridescenceThickness: "iridescenceThicknessMap",
  ao: "aoMap",
  occlusion: "aoMap",
  thickness: "thicknessMap",
  opacity: "alphaMap",
};

/**
 * Options for MaterialFactory constructor
 */
interface MaterialFactoryOptions {
  defaultOpacity?: number;
  metalness?: number;
  roughness?: number;
  edgeColor?: number;
  transparent?: boolean;
}

/**
 * Base material properties
 */
interface BaseProps {
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  depthTest: boolean;
  clipIntersection: boolean;
}

/**
 * Options for face materials
 */
interface FaceMaterialOptions {
  color: ColorValue;
  alpha: number;
  visible?: boolean;
}

/**
 * Options for back face materials
 */
interface BackFaceMaterialOptions extends FaceMaterialOptions {
  polygonOffsetUnits?: number;
}

/**
 * Options for edge materials
 */
interface EdgeMaterialOptions {
  lineWidth: number;
  color?: ColorValue | null;
  vertexColors?: boolean;
  visible?: boolean;
  resolution?: { width: number; height: number };
}

/**
 * Options for simple edge materials
 */
interface SimpleEdgeMaterialOptions {
  color?: ColorValue | null;
  visible?: boolean;
}

/**
 * Options for vertex materials
 */
interface VertexMaterialOptions {
  size: number;
  color?: ColorValue | null;
  visible?: boolean;
}

/**
 * Options for texture materials
 */
interface TextureMaterialOptions {
  texture: THREE.Texture;
  visible?: boolean;
}

/**
 * Interface for the TextureCache dependency.
 * The actual TextureCache class is defined in texture-cache.ts.
 * We depend only on its get() method for loose coupling.
 */
interface TextureCacheInterface {
  get(ref: string, textureRole: string): Promise<THREE.Texture | null>;
}

/**
 * Options for Studio mode materials.
 */
interface StudioMaterialOptions {
  /** Resolved MaterialAppearance definition (already looked up from materials table / presets) */
  materialDef: MaterialAppearance;
  /** Fallback CSS hex color from the leaf node (e.g., "#cc0000") */
  fallbackColor: ColorValue;
  /** Fallback alpha from the leaf node (0-1) */
  fallbackAlpha: number;
  /** TextureCache for resolving texture references */
  textureCache: TextureCacheInterface | null;
}

/**
 * Options for updating factory settings
 */
interface UpdateOptions {
  metalness?: number;
  roughness?: number;
  transparent?: boolean;
  defaultOpacity?: number;
  edgeColor?: number;
}

/**
 * Factory for creating THREE.js materials with consistent CAD viewer settings.
 * Centralizes material creation for testability and consistency.
 */
class MaterialFactory {
  defaultOpacity: number;
  metalness: number;
  roughness: number;
  edgeColor: number;
  transparent: boolean;

  /**
   * Create a MaterialFactory instance.
   */
  constructor(options: MaterialFactoryOptions = {}) {
    this.defaultOpacity = options.defaultOpacity ?? 1.0;
    this.metalness = options.metalness ?? 0.3;
    this.roughness = options.roughness ?? 0.65;
    this.edgeColor = options.edgeColor ?? 0x707070;
    this.transparent = options.transparent ?? false;
  }

  /**
   * Create base properties shared by all face materials.
   */
  private _createBaseProps(alpha: number): BaseProps {
    return {
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      transparent: true,
      opacity: this.transparent ? this.defaultOpacity * alpha : alpha,
      depthWrite: !this.transparent,
      depthTest: true,
      clipIntersection: false,
    };
  }

  /**
   * Create a standard material for front faces with PBR properties.
   */
  createFrontFaceMaterial({ color, alpha, visible = true }: FaceMaterialOptions, label?: string): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      metalness: this.metalness,
      roughness: this.roughness,
      flatShading: false,
      side: THREE.FrontSide,
      visible: visible,
    });
    gpuTracker.track("material", material, label ?? "MeshStandardMaterial (front face)");
    return material;
  }

  /**
   * Create a standard material for back faces with PBR properties.
   * Used for polygon rendering where back faces need full shading.
   */
  createBackFaceStandardMaterial({ color, alpha, polygonOffsetUnits = 2.0, visible = true }: BackFaceMaterialOptions, label?: string): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      metalness: this.metalness,
      roughness: this.roughness,
      flatShading: false,
      side: THREE.BackSide,
      visible: visible,
    });
    material.polygonOffsetUnits = polygonOffsetUnits;
    gpuTracker.track("material", material, label ?? "MeshStandardMaterial (back face)");
    return material;
  }

  /**
   * Create a basic material for back faces (no lighting/PBR).
   * Used for shape rendering where back faces are simple fills.
   */
  createBackFaceBasicMaterial({ color, alpha, polygonOffsetUnits = 2.0, visible = true }: BackFaceMaterialOptions, label?: string): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      side: THREE.BackSide,
      visible: visible,
    });
    material.polygonOffsetUnits = polygonOffsetUnits;
    gpuTracker.track("material", material, label ?? "MeshBasicMaterial (back face)");
    return material;
  }

  /**
   * Create a basic front face material (no PBR, for simple shapes).
   */
  createBasicFaceMaterial({ color, alpha, visible = true }: FaceMaterialOptions, label?: string): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      side: THREE.FrontSide,
      visible: visible,
    });
    gpuTracker.track("material", material, label ?? "MeshBasicMaterial (front face)");
    return material;
  }

  /**
   * Create a fat line material (LineMaterial from Three.js examples).
   */
  createEdgeMaterial({ lineWidth, color, vertexColors = false, visible = true, resolution }: EdgeMaterialOptions, label?: string): LineMaterial {
    const material = new LineMaterial({
      linewidth: lineWidth,
      transparent: true,
      depthWrite: !this.transparent,
      depthTest: !this.transparent,
      clipIntersection: false,
      vertexColors: vertexColors,  // boolean, not string "VertexColors"
      toneMapped: false,           // critical for correct vertex colors
    });

    if (!vertexColors) {
      material.color = new THREE.Color(color ?? this.edgeColor);
    }
    material.visible = visible;

    if (resolution) {
      material.resolution.set(resolution.width, resolution.height);
    }

    gpuTracker.track("material", material, label ?? "LineMaterial (edges)");
    return material;
  }

  /**
   * Create a basic line material for simple edges (e.g., polygon outlines).
   */
  createSimpleEdgeMaterial({ color, visible = true }: SimpleEdgeMaterialOptions, label?: string): THREE.LineBasicMaterial {
    const material = new THREE.LineBasicMaterial({
      color: color ?? this.edgeColor,
      depthWrite: !this.transparent,
      depthTest: !this.transparent,
      visible: visible,
    });
    gpuTracker.track("material", material, label ?? "LineBasicMaterial (simple edges)");
    return material;
  }

  /**
   * Create a point material for vertex rendering.
   */
  createVertexMaterial({ size, color, visible = true }: VertexMaterialOptions, label?: string): THREE.PointsMaterial {
    const material = new THREE.PointsMaterial({
      color: color ?? this.edgeColor,
      sizeAttenuation: false,
      size: size,
      transparent: true,
      clipIntersection: false,
      visible: visible,
    });
    gpuTracker.track("material", material, label ?? "PointsMaterial (vertices)");
    return material;
  }

  /**
   * Create a basic material for texture-mapped surfaces.
   */
  createTextureMaterial({ texture, visible = true }: TextureMaterialOptions, label?: string): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: texture,
      side: THREE.DoubleSide,
      visible: visible,
    });
    gpuTracker.track("material", material, label ?? "MeshBasicMaterial (textured)");
    return material;
  }

  /**
   * Create a Studio mode material from a resolved MaterialAppearance.
   *
   * Always creates MeshPhysicalMaterial (except when `unlit: true`, which
   * uses MeshBasicMaterial). MeshPhysicalMaterial is a superset of
   * MeshStandardMaterial; when advanced features are off (transmission=0,
   * clearcoat=0, sheen=0, etc.), the shader compiles to essentially the
   * same cost.
   *
   * @param options - Studio material options
   * @param label - Optional label for GPU tracking
   * @returns Configured MeshPhysicalMaterial (or MeshBasicMaterial if unlit)
   */
  async createStudioMaterial(
    { materialDef, fallbackColor, fallbackAlpha, textureCache }: StudioMaterialOptions,
    label?: string,
  ): Promise<THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial> {
    const def = materialDef;
    const side = def.doubleSided ? THREE.DoubleSide : THREE.FrontSide;

    // --- Resolve base color and opacity ---
    let baseColor: THREE.Color;
    let opacity: number;

    if (def.color) {
      if (typeof def.color === "string") {
        // CSS hex string (e.g. "#55a0e3") — THREE.Color parses as sRGB
        baseColor = new THREE.Color(def.color);
        opacity = 1.0;
      } else {
        // sRGB RGBA tuple [R, G, B, A?] (0-1)
        baseColor = new THREE.Color().setRGB(
          def.color[0], def.color[1], def.color[2],
          THREE.SRGBColorSpace,
        );
        opacity = def.color[3] ?? 1.0;
      }
    } else {
      // Fall back to leaf node's CSS hex color + alpha.
      // THREE.Color constructor with a hex number or CSS string produces
      // linear-space values in Three.js r152+.
      baseColor = new THREE.Color(fallbackColor);
      opacity = fallbackAlpha;
    }

    // --- Unlit path: MeshBasicMaterial ---
    if (def.unlit) {
      const basicMat = new THREE.MeshBasicMaterial({
        ...this._createBaseProps(opacity),
        color: baseColor,
        side,
      });
      // Apply alpha mode to basic material too
      this._applyAlphaMode(basicMat, def, opacity);
      // Resolve base color texture
      if (def.map && textureCache) {
        const tex = await textureCache.get(def.map, "baseColorTexture");
        if (tex) basicMat.map = tex;
      }
      gpuTracker.track("material", basicMat, label ?? "MeshBasicMaterial (studio unlit)");
      return basicMat;
    }

    // --- PBR path: MeshPhysicalMaterial ---
    // Studio materials default to opaque (transparent: false). Unlike CAD
    // mode, Studio mode has no clipping and doesn't need the global
    // transparent:true flag. Only BLEND alpha mode enables transparency.
    const isBlend = def.alphaMode === "BLEND" || (!def.alphaMode && opacity < 1.0);
    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      metalness: def.metalness ?? 0.0,
      roughness: def.roughness ?? 0.5,
      flatShading: false,
      side,
      transparent: isBlend,
      opacity: opacity,
      depthWrite: !isBlend,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
    });

    // --- Alpha mode ---
    this._applyAlphaMode(material, def, opacity);

    // --- Emissive ---
    if (def.emissive) {
      material.emissive = new THREE.Color(def.emissive[0], def.emissive[1], def.emissive[2]);
    }
    if (def.emissiveIntensity !== undefined) {
      material.emissiveIntensity = def.emissiveIntensity;
    }

    // --- Transmission (glass, water) ---
    // Transmission uses a separate render target in Three.js and must NOT
    // be combined with alpha blending (transparent: true). Override here
    // so users don't need to set alphaMode: "OPAQUE" manually.
    if (def.transmission !== undefined) {
      material.transmission = def.transmission;
      if (def.transmission > 0) {
        material.transparent = false;
        material.opacity = 1.0;
        material.depthWrite = true;
      }
    }

    // --- Clearcoat (car paint, varnish) ---
    if (def.clearcoat !== undefined) {
      material.clearcoat = def.clearcoat;
    }
    if (def.clearcoatRoughness !== undefined) {
      material.clearcoatRoughness = def.clearcoatRoughness;
    }

    // --- Volume (subsurface: jade, wax, skin) ---
    if (def.thickness !== undefined) {
      material.thickness = def.thickness;
    }
    if (def.attenuationDistance !== undefined) {
      material.attenuationDistance = def.attenuationDistance;
    }
    if (def.attenuationColor) {
      material.attenuationColor = new THREE.Color(
        def.attenuationColor[0], def.attenuationColor[1], def.attenuationColor[2],
      );
    }

    // --- IOR ---
    if (def.ior !== undefined) {
      material.ior = def.ior;
    }

    // --- Specular ---
    if (def.specularIntensity !== undefined) {
      material.specularIntensity = def.specularIntensity;
    }
    if (def.specularColor) {
      material.specularColor = new THREE.Color(
        def.specularColor[0], def.specularColor[1], def.specularColor[2],
      );
    }

    // --- Sheen (fabric, velvet) ---
    // sheen > 0 enables the sheen layer in Three.js
    if (def.sheen !== undefined && def.sheen > 0) {
      material.sheen = def.sheen;
      if (def.sheenColor) {
        material.sheenColor = new THREE.Color(
          def.sheenColor[0], def.sheenColor[1], def.sheenColor[2],
        );
      }
      if (def.sheenRoughness !== undefined) {
        material.sheenRoughness = def.sheenRoughness;
      }
    }

    // --- Anisotropy (brushed metal) ---
    if (def.anisotropy !== undefined) {
      material.anisotropy = def.anisotropy;
    }
    if (def.anisotropyRotation !== undefined) {
      material.anisotropyRotation = def.anisotropyRotation;
    }

    // --- Textures ---
    // Resolve all texture references via TextureCache.
    // The TextureCache determines colorSpace internally from the texture role name.
    if (textureCache) {
      await this._applyStudioTextures(material, def, textureCache);
    }

    gpuTracker.track("material", material, label ?? "MeshPhysicalMaterial (studio)");
    return material;
  }

  /**
   * Create a Studio mode material from a threejs-materials format entry.
   *
   * threejs-materials `properties` uses simplified property names (e.g., "color",
   * "roughness", "normal") where each entry has an optional `value` (scalar or
   * [r,g,b] array in **linear RGB**) and/or `texture` (inline data URI).
   *
   * @param properties - Material properties from threejs-materials
   * @param textureRepeat - Optional [u, v] texture tiling applied to all loaded textures
   * @param textureCache - TextureCache for resolving data URI textures
   * @param label - Optional label for GPU tracking
   * @returns Configured MeshPhysicalMaterial
   */
  async createStudioMaterialFromMaterialX(
    properties: Record<string, { value?: unknown; texture?: string }>,
    textureRepeat: [number, number] | undefined,
    textureCache: TextureCacheInterface | null,
    label?: string,
  ): Promise<THREE.MeshPhysicalMaterial> {
    // --- Build material options from scalar values ---
    const matOptions: Record<string, unknown> = {
      flatShading: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      depthTest: true,
    };

    // Warn once if displacement data is present (not supported in Studio)
    if (properties.displacement?.texture || properties.displacementScale?.value !== undefined) {
      logger.warn("Displacement not supported by the Studio");
    }

    for (const [key, prop] of Object.entries(properties)) {
      if (prop.value === undefined) continue;

      // Skip displacement properties (not supported, would waste GPU memory)
      if (key === "displacement" || key === "displacementScale" || key === "displacementBias") continue;

      // Color arrays → THREE.Color (already linear, no sRGB conversion)
      if (COLOR_ARRAY_KEYS.has(key) && Array.isArray(prop.value)) {
        const [r, g, b] = prop.value as number[];
        matOptions[key] = new THREE.Color(r, g, b);
      } else if ((key === "normalScale" || key === "clearcoatNormalScale") && Array.isArray(prop.value)) {
        matOptions[key] = new THREE.Vector2(prop.value[0], prop.value[1]);
      } else if (key === "iridescenceThicknessRange" && Array.isArray(prop.value)) {
        matOptions[key] = prop.value;
      } else {
        matOptions[key] = prop.value;
      }
    }

    // --- Handle transmission ---
    const transmissionVal = properties.transmission?.value;
    const opacityVal = properties.opacity?.value;
    const transparentVal = properties.transparent?.value;
    if (typeof transmissionVal === "number" && transmissionVal > 0) {
      matOptions.transparent = false;
      matOptions.opacity = 1.0;
      matOptions.depthWrite = true;
    } else if (transparentVal === true || (typeof opacityVal === "number" && opacityVal < 1.0)) {
      matOptions.transparent = true;
      matOptions.depthWrite = false;
    } else {
      matOptions.transparent = false;
      matOptions.depthWrite = true;
    }

    const material = new THREE.MeshPhysicalMaterial(matOptions);

    // --- Resolve textures ---
    let hasTextures = false;
    if (textureCache) {
      for (const [key, prop] of Object.entries(properties)) {
        if (!prop.texture) continue;

        const mapName = PROPERTY_TO_MAP[key];
        if (!mapName) continue;

        // Determine color space from the Three.js map property name.
        // TextureCache.get() expects a role name to decide colorSpace.
        // Bridge from Three.js map name → colorSpace → a proxy role name.
        const colorSpace = getColorSpaceForMap(mapName);
        const roleForCache = colorSpace === THREE.SRGBColorSpace
          ? "baseColorTexture"
          : "normalTexture";
        const tex = await textureCache.get(prop.texture, roleForCache);
        if (tex) {
          if (textureRepeat) {
            tex.repeat.set(textureRepeat[0], textureRepeat[1]);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (material as any)[mapName] = tex;
          hasTextures = true;
        }
      }

    }

    // Enable alpha cutout when an alphaMap is present
    if (material.alphaMap) {
      material.alphaTest = 0.5;
      material.side = THREE.DoubleSide;
    }

    // Force shader recompile if textures were assigned post-construction
    if (hasTextures) {
      material.needsUpdate = true;
    }

    gpuTracker.track("material", material, label ?? "MeshPhysicalMaterial (threejs-materials)");
    return material;
  }

  /**
   * Apply alpha mode settings to a material.
   *
   * - OPAQUE: fully opaque, no transparency
   * - MASK: alpha testing with cutoff threshold
   * - BLEND: standard alpha blending
   * - Default (no alphaMode): transparent: true (current viewer behavior)
   */
  private _applyAlphaMode(
    material: THREE.Material & { opacity: number },
    def: MaterialAppearance,
    opacity: number,
  ): void {
    switch (def.alphaMode) {
      case "OPAQUE":
        material.transparent = false;
        material.opacity = 1.0;
        material.depthWrite = true;
        break;
      case "MASK":
        material.transparent = false;
        material.alphaTest = def.alphaCutoff ?? 0.5;
        material.opacity = opacity;
        material.depthWrite = true;
        break;
      case "BLEND":
        material.transparent = true;
        material.opacity = opacity;
        material.depthWrite = false;
        break;
      // default: no alphaMode set -- keep _createBaseProps defaults (transparent: true)
    }
  }

  /**
   * Resolve and apply texture references from a MaterialAppearance onto a
   * MeshPhysicalMaterial via the TextureCache.
   *
   * Color-data textures (base color, emissive, sheen color, specular color)
   * are requested with SRGBColorSpace. All other textures (normal, metallic-
   * roughness, occlusion, roughness maps, transmission, thickness) are
   * requested with LinearSRGBColorSpace (the default).
   *
   * The metallicRoughnessTexture is a single combined texture where
   * B channel = metalness and G channel = roughness. It is assigned to
   * both metalnessMap and roughnessMap on the material.
   */
  private async _applyStudioTextures(
    material: THREE.MeshPhysicalMaterial,
    def: MaterialAppearance,
    textureCache: TextureCacheInterface,
  ): Promise<void> {
    // Helper to resolve a texture reference. The TextureCache determines
    // colorSpace internally from the textureRole name (sRGB for color-data
    // textures like baseColorTexture, linear for non-color data like normalTexture).
    const resolve = async (key: string | undefined, textureRole: string): Promise<THREE.Texture | null> => {
      if (!key) return null;
      return textureCache.get(key, textureRole);
    };

    // --- sRGB color-data textures ---
    const baseColorTex = await resolve(def.map, "baseColorTexture");
    if (baseColorTex) material.map = baseColorTex;

    const emissiveTex = await resolve(def.emissiveMap, "emissiveTexture");
    if (emissiveTex) material.emissiveMap = emissiveTex;

    const sheenColorTex = await resolve(def.sheenColorMap, "sheenColorTexture");
    if (sheenColorTex) material.sheenColorMap = sheenColorTex;

    const specularColorTex = await resolve(def.specularColorMap, "specularColorTexture");
    if (specularColorTex) material.specularColorMap = specularColorTex;

    // --- Linear non-color data textures ---
    const normalTex = await resolve(def.normalMap, "normalTexture");
    if (normalTex) material.normalMap = normalTex;

    const occlusionTex = await resolve(def.aoMap, "occlusionTexture");
    if (occlusionTex) material.aoMap = occlusionTex;

    const metalnessTex = await resolve(def.metalnessMap, "metallicRoughnessTexture");
    if (metalnessTex) material.metalnessMap = metalnessTex;

    const roughnessTex = await resolve(def.roughnessMap, "metallicRoughnessTexture");
    if (roughnessTex) material.roughnessMap = roughnessTex;

    const transmissionTex = await resolve(def.transmissionMap, "transmissionTexture");
    if (transmissionTex) material.transmissionMap = transmissionTex;

    const thicknessTex = await resolve(def.thicknessMap, "thicknessTexture");
    if (thicknessTex) material.thicknessMap = thicknessTex;

    const clearcoatTex = await resolve(def.clearcoatMap, "clearcoatTexture");
    if (clearcoatTex) material.clearcoatMap = clearcoatTex;

    const clearcoatRoughnessTex = await resolve(def.clearcoatRoughnessMap, "clearcoatRoughnessTexture");
    if (clearcoatRoughnessTex) material.clearcoatRoughnessMap = clearcoatRoughnessTex;

    const clearcoatNormalTex = await resolve(def.clearcoatNormalMap, "clearcoatNormalTexture");
    if (clearcoatNormalTex) material.clearcoatNormalMap = clearcoatNormalTex;

    const specularIntensityTex = await resolve(def.specularIntensityMap, "specularIntensityTexture");
    if (specularIntensityTex) material.specularIntensityMap = specularIntensityTex;

    const sheenRoughnessTex = await resolve(def.sheenRoughnessMap, "sheenRoughnessTexture");
    if (sheenRoughnessTex) material.sheenRoughnessMap = sheenRoughnessTex;

    const anisotropyTex = await resolve(def.anisotropyMap, "anisotropyTexture");
    if (anisotropyTex) material.anisotropyMap = anisotropyTex;
  }

  /**
   * Update global settings.
   */
  update(options: UpdateOptions): void {
    if (options.metalness !== undefined) this.metalness = options.metalness;
    if (options.roughness !== undefined) this.roughness = options.roughness;
    if (options.transparent !== undefined) this.transparent = options.transparent;
    if (options.defaultOpacity !== undefined) this.defaultOpacity = options.defaultOpacity;
    if (options.edgeColor !== undefined) this.edgeColor = options.edgeColor;
  }
}

export { MaterialFactory };
export type { MaterialFactoryOptions, UpdateOptions, StudioMaterialOptions, TextureCacheInterface };
