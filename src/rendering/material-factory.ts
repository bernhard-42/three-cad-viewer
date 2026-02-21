import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ColorValue, MaterialAppearance } from "../core/types.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { getColorSpaceForMap } from "./texture-cache.js";

/** materialx-db param keys that hold [r,g,b] color arrays (linear RGB). */
const COLOR_ARRAY_KEYS = new Set([
  "color", "specularColor", "sheenColor", "emissive", "attenuationColor",
]);

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

    if (def.baseColor) {
      // MaterialAppearance baseColor is sRGB [R, G, B, A?] (0-1).
      // Convert to linear working space for Three.js.
      baseColor = new THREE.Color().setRGB(
        def.baseColor[0], def.baseColor[1], def.baseColor[2],
        THREE.SRGBColorSpace,
      );
      opacity = def.baseColor[3] ?? 1.0;
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
      if (def.baseColorTexture && textureCache) {
        const tex = await textureCache.get(def.baseColorTexture, "baseColorTexture");
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
      metalness: def.metallic ?? 0.0,
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
    if (def.emissiveStrength !== undefined) {
      material.emissiveIntensity = def.emissiveStrength;
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
   * Create a Studio mode material from a materialx-db format entry.
   *
   * materialx-db `params` uses Three.js MeshPhysicalMaterial property names
   * directly with colors in **linear RGB** (not sRGB). Texture references in
   * params are keys into the textures dict (data URIs).
   *
   * @param params - MeshPhysicalMaterial params (Three.js property names)
   * @param textureMap - Texture data URIs keyed by texture path references
   * @param colorOverride - Optional linear RGB color override (replaces params.color and removes params.map)
   * @param textureRepeat - Optional [u, v] texture tiling applied to all loaded textures
   * @param textureCache - TextureCache for resolving data URI textures
   * @param label - Optional label for GPU tracking
   * @returns Configured MeshPhysicalMaterial
   */
  async createStudioMaterialFromMaterialX(
    params: Record<string, unknown>,
    textureMap: Record<string, string>,
    colorOverride: [number, number, number] | undefined,
    textureRepeat: [number, number] | undefined,
    textureCache: TextureCacheInterface | null,
    label?: string,
  ): Promise<THREE.MeshPhysicalMaterial> {
    // Clone params to avoid mutating the input
    const p = { ...params };

    // Apply colorOverride: replace params.color and remove base color texture
    if (colorOverride) {
      p.color = colorOverride;
      delete p.map;
    }

    // Separate scalar/color params from texture params (strings referencing textures/)
    const scalarParams: Record<string, unknown> = {};
    const textureParams: Record<string, string> = {};

    for (const [key, value] of Object.entries(p)) {
      if (typeof value === "string" && value.startsWith("textures/")) {
        textureParams[key] = value;
      } else {
        scalarParams[key] = value;
      }
    }

    // --- Build material options ---
    const matOptions: Record<string, unknown> = {
      flatShading: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1.0,
      polygonOffsetUnits: 1.0,
      depthTest: true,
    };

    // Color arrays → THREE.Color (already linear, no sRGB conversion)
    for (const [key, value] of Object.entries(scalarParams)) {
      if (COLOR_ARRAY_KEYS.has(key) && Array.isArray(value)) {
        const [r, g, b] = value as number[];
        matOptions[key] = new THREE.Color(r, g, b);
      } else if (key === "iridescenceThicknessRange" && Array.isArray(value)) {
        matOptions[key] = value;
      } else {
        matOptions[key] = value;
      }
    }

    // --- Handle transmission ---
    if (typeof scalarParams.transmission === "number" && scalarParams.transmission > 0) {
      matOptions.transparent = false;
      matOptions.opacity = 1.0;
      matOptions.depthWrite = true;
    } else if (scalarParams.transparent === true || (typeof scalarParams.opacity === "number" && scalarParams.opacity < 1.0)) {
      matOptions.transparent = true;
      matOptions.depthWrite = false;
    } else {
      matOptions.transparent = false;
      matOptions.depthWrite = true;
    }

    const material = new THREE.MeshPhysicalMaterial(matOptions);

    // --- Resolve texture params ---
    if (textureCache) {
      for (const [mapName, texturePath] of Object.entries(textureParams)) {
        const dataUri = textureMap[texturePath];
        if (!dataUri) continue;

        // Determine color space from the Three.js map property name.
        // TextureCache.get() expects a MaterialAppearance role name to decide
        // colorSpace (e.g., "baseColorTexture" → sRGB). We bridge from the
        // Three.js map name → colorSpace → a proxy role name that triggers
        // the correct colorSpace inside TextureCache.
        const colorSpace = getColorSpaceForMap(mapName);
        const roleForCache = colorSpace === THREE.SRGBColorSpace
          ? "baseColorTexture"
          : "normalTexture";
        const tex = await textureCache.get(dataUri, roleForCache);
        if (tex) {
          if (textureRepeat) {
            tex.repeat.set(textureRepeat[0], textureRepeat[1]);
          }
          // Assign the texture to the correct material property
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (material as any)[mapName] = tex;
        }
      }
    }

    // Force shader recompile if textures were assigned post-construction
    if (Object.keys(textureParams).length > 0) {
      material.needsUpdate = true;
    }

    gpuTracker.track("material", material, label ?? "MeshPhysicalMaterial (materialx-db)");
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
    const baseColorTex = await resolve(def.baseColorTexture, "baseColorTexture");
    if (baseColorTex) material.map = baseColorTex;

    const emissiveTex = await resolve(def.emissiveTexture, "emissiveTexture");
    if (emissiveTex) material.emissiveMap = emissiveTex;

    const sheenColorTex = await resolve(def.sheenColorTexture, "sheenColorTexture");
    if (sheenColorTex) material.sheenColorMap = sheenColorTex;

    const specularColorTex = await resolve(def.specularColorTexture, "specularColorTexture");
    if (specularColorTex) material.specularColorMap = specularColorTex;

    // --- Linear non-color data textures ---
    const normalTex = await resolve(def.normalTexture, "normalTexture");
    if (normalTex) material.normalMap = normalTex;

    const occlusionTex = await resolve(def.occlusionTexture, "occlusionTexture");
    if (occlusionTex) material.aoMap = occlusionTex;

    // metallicRoughnessTexture: single texture -> two material properties
    // B channel = metalness, G channel = roughness
    const metalRoughTex = await resolve(def.metallicRoughnessTexture, "metallicRoughnessTexture");
    if (metalRoughTex) {
      material.metalnessMap = metalRoughTex;
      material.roughnessMap = metalRoughTex;
    }

    const transmissionTex = await resolve(def.transmissionTexture, "transmissionTexture");
    if (transmissionTex) material.transmissionMap = transmissionTex;

    const thicknessTex = await resolve(def.thicknessTexture, "thicknessTexture");
    if (thicknessTex) material.thicknessMap = thicknessTex;

    const clearcoatTex = await resolve(def.clearcoatTexture, "clearcoatTexture");
    if (clearcoatTex) material.clearcoatMap = clearcoatTex;

    const clearcoatRoughnessTex = await resolve(def.clearcoatRoughnessTexture, "clearcoatRoughnessTexture");
    if (clearcoatRoughnessTex) material.clearcoatRoughnessMap = clearcoatRoughnessTex;

    const clearcoatNormalTex = await resolve(def.clearcoatNormalTexture, "clearcoatNormalTexture");
    if (clearcoatNormalTex) material.clearcoatNormalMap = clearcoatNormalTex;

    const specularIntensityTex = await resolve(def.specularIntensityTexture, "specularIntensityTexture");
    if (specularIntensityTex) material.specularIntensityMap = specularIntensityTex;

    const sheenRoughnessTex = await resolve(def.sheenRoughnessTexture, "sheenRoughnessTexture");
    if (sheenRoughnessTex) material.sheenRoughnessMap = sheenRoughnessTex;

    const anisotropyTex = await resolve(def.anisotropyTexture, "anisotropyTexture");
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
