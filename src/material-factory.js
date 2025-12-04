import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Factory for creating THREE.js materials with consistent CAD viewer settings.
 * Centralizes material creation for testability and consistency.
 */
class MaterialFactory {
  /**
   * Create a MaterialFactory instance.
   * @param {Object} options - Default material options.
   * @param {number} options.defaultOpacity - Default opacity for transparent mode.
   * @param {number} options.metalness - Default metalness value (0-1).
   * @param {number} options.roughness - Default roughness value (0-1).
   * @param {number} options.edgeColor - Default edge color as hex.
   * @param {boolean} options.transparent - Whether transparent mode is active.
   */
  constructor(options = {}) {
    this.defaultOpacity = options.defaultOpacity ?? 1.0;
    this.metalness = options.metalness ?? 0.7;
    this.roughness = options.roughness ?? 0.7;
    this.edgeColor = options.edgeColor ?? 0x707070;
    this.transparent = options.transparent ?? false;
  }

  /**
   * Create base properties shared by all face materials.
   * @param {number} alpha - Transparency alpha value (0-1).
   * @returns {Object} Base material properties.
   * @private
   */
  _createBaseProps(alpha) {
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
   * @param {Object} options - Material options.
   * @param {number} options.color - Face color as hex.
   * @param {number} options.alpha - Transparency alpha (0-1).
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.MeshStandardMaterial} The created material.
   */
  createFrontFaceMaterial({ color, alpha, visible = true }) {
    return new THREE.MeshStandardMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      metalness: this.metalness,
      roughness: this.roughness,
      flatShading: false,
      side: THREE.FrontSide,
      visible: visible,
    });
  }

  /**
   * Create a standard material for back faces with PBR properties.
   * Used for polygon rendering where back faces need full shading.
   * @param {Object} options - Material options.
   * @param {number} options.color - Face color as hex.
   * @param {number} options.alpha - Transparency alpha (0-1).
   * @param {number} [options.polygonOffsetUnits=2.0] - Depth offset for back face.
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.MeshStandardMaterial} The created material.
   */
  createBackFaceStandardMaterial({ color, alpha, polygonOffsetUnits = 2.0, visible = true }) {
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
    return material;
  }

  /**
   * Create a basic material for back faces (no lighting/PBR).
   * Used for shape rendering where back faces are simple fills.
   * @param {Object} options - Material options.
   * @param {number} options.color - Face color as hex.
   * @param {number} options.alpha - Transparency alpha (0-1).
   * @param {number} [options.polygonOffsetUnits=2.0] - Depth offset for back face.
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.MeshBasicMaterial} The created material.
   */
  createBackFaceBasicMaterial({ color, alpha, polygonOffsetUnits = 2.0, visible = true }) {
    const material = new THREE.MeshBasicMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      side: THREE.BackSide,
      visible: visible,
    });
    material.polygonOffsetUnits = polygonOffsetUnits;
    return material;
  }

  /**
   * Create a basic front face material (no PBR, for simple shapes).
   * @param {Object} options - Material options.
   * @param {number} options.color - Face color as hex.
   * @param {number} options.alpha - Transparency alpha (0-1).
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.MeshBasicMaterial} The created material.
   */
  createBasicFaceMaterial({ color, alpha, visible = true }) {
    return new THREE.MeshBasicMaterial({
      ...this._createBaseProps(alpha),
      color: color,
      side: THREE.FrontSide,
      visible: visible,
    });
  }

  /**
   * Create a fat line material (LineMaterial from Three.js examples).
   * @param {Object} options - Material options.
   * @param {number} options.lineWidth - Line width in world units.
   * @param {number} [options.color] - Line color as hex (null for vertex colors).
   * @param {boolean} [options.vertexColors=false] - Whether to use vertex colors.
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @param {{width: number, height: number}} [options.resolution] - Viewport resolution.
   * @returns {LineMaterial} The created material.
   */
  createEdgeMaterial({ lineWidth, color, vertexColors = false, visible = true, resolution }) {
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

    return material;
  }

  /**
   * Create a basic line material for simple edges (e.g., polygon outlines).
   * @param {Object} options - Material options.
   * @param {number} [options.color] - Line color as hex.
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.LineBasicMaterial} The created material.
   */
  createSimpleEdgeMaterial({ color, visible = true }) {
    return new THREE.LineBasicMaterial({
      color: color ?? this.edgeColor,
      depthWrite: !this.transparent,
      depthTest: !this.transparent,
      visible: visible,
    });
  }

  /**
   * Create a point material for vertex rendering.
   * @param {Object} options - Material options.
   * @param {number} options.size - Point size in pixels.
   * @param {number} [options.color] - Point color as hex.
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.PointsMaterial} The created material.
   */
  createVertexMaterial({ size, color, visible = true }) {
    return new THREE.PointsMaterial({
      color: color ?? this.edgeColor,
      sizeAttenuation: false,
      size: size,
      transparent: true,
      clipIntersection: false,
      visible: visible,
    });
  }

  /**
   * Create a basic material for texture-mapped surfaces.
   * @param {Object} options - Material options.
   * @param {THREE.Texture} options.texture - The texture to apply.
   * @param {boolean} [options.visible=true] - Initial visibility.
   * @returns {THREE.MeshBasicMaterial} The created material.
   */
  createTextureMaterial({ texture, visible = true }) {
    return new THREE.MeshBasicMaterial({
      color: "#ffffff",
      map: texture,
      side: THREE.DoubleSide,
      visible: visible,
    });
  }

  /**
   * Update global settings.
   * @param {Object} options - Options to update.
   * @param {number} [options.metalness] - New metalness value.
   * @param {number} [options.roughness] - New roughness value.
   * @param {boolean} [options.transparent] - New transparent mode.
   * @param {number} [options.defaultOpacity] - New default opacity.
   * @param {number} [options.edgeColor] - New edge color.
   */
  update(options) {
    if (options.metalness !== undefined) this.metalness = options.metalness;
    if (options.roughness !== undefined) this.roughness = options.roughness;
    if (options.transparent !== undefined) this.transparent = options.transparent;
    if (options.defaultOpacity !== undefined) this.defaultOpacity = options.defaultOpacity;
    if (options.edgeColor !== undefined) this.edgeColor = options.edgeColor;
  }
}

export { MaterialFactory };
