import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { ColorValue } from "../core/types.js";
import { gpuTracker } from "../utils/gpu-tracker.js";

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
      visible: visible,
    });

    if (vertexColors) {
      material.vertexColors = "VertexColors";
    } else {
      material.color = new THREE.Color(color ?? this.edgeColor);
    }

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
export type { MaterialFactoryOptions, UpdateOptions };
