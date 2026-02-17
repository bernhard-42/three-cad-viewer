/**
 * Built-in material presets for Studio mode.
 *
 * 31 presets organized by category: metals (polished & matte/brushed),
 * plastics, glass & transparent, rubber & elastomers, painted surfaces,
 * and natural/other materials.
 *
 * These are pure data definitions — no textures, no runtime cost.
 * The `preset` field is intentionally omitted; it is used by user-defined
 * materials to reference these presets, not by presets themselves.
 *
 * All baseColor values are in linear color space.
 * Presets with neutral baseColor (plastics, paints) rely on the leaf node's
 * color field for the actual tint via fallback in the material factory.
 */

import type { MaterialAppearance } from "../core/types.js";

// =============================================================================
// Preset Dictionary
// =============================================================================

/**
 * Built-in material presets keyed by preset name.
 *
 * Usage: look up a preset by the `material` tag on a leaf node, or by
 * the `preset` field on a user-defined `MaterialAppearance`.
 */
export const MATERIAL_PRESETS: Record<string, MaterialAppearance> = {
  // ---------------------------------------------------------------------------
  // Metals -- Polished
  // ---------------------------------------------------------------------------

  "chrome": {
    name: "Chrome",
    baseColor: [0.95, 0.95, 0.95, 1],
    metallic: 1.0,
    roughness: 0.05,
  },

  "polished-steel": {
    name: "Polished Steel",
    baseColor: [0.8, 0.8, 0.82, 1],
    metallic: 1.0,
    roughness: 0.1,
  },

  "polished-aluminum": {
    name: "Polished Aluminum",
    baseColor: [0.91, 0.92, 0.93, 1],
    metallic: 1.0,
    roughness: 0.1,
  },

  "gold": {
    name: "Gold",
    baseColor: [1.0, 0.84, 0.0, 1],
    metallic: 1.0,
    roughness: 0.1,
  },

  "copper": {
    name: "Copper",
    baseColor: [0.95, 0.64, 0.54, 1],
    metallic: 1.0,
    roughness: 0.15,
  },

  "brass": {
    name: "Brass",
    baseColor: [0.89, 0.79, 0.45, 1],
    metallic: 1.0,
    roughness: 0.15,
  },

  // ---------------------------------------------------------------------------
  // Metals -- Matte / Brushed
  // ---------------------------------------------------------------------------

  "stainless-steel": {
    name: "Stainless Steel",
    baseColor: [0.8, 0.8, 0.82, 1],
    metallic: 1.0,
    roughness: 0.4,
  },

  "brushed-aluminum": {
    name: "Brushed Aluminum",
    baseColor: [0.91, 0.92, 0.93, 1],
    metallic: 1.0,
    roughness: 0.35,
    anisotropy: 0.5,
  },

  "cast-iron": {
    name: "Cast Iron",
    baseColor: [0.42, 0.42, 0.43, 1],
    metallic: 0.9,
    roughness: 0.7,
  },

  "titanium": {
    name: "Titanium",
    baseColor: [0.62, 0.58, 0.55, 1],
    metallic: 1.0,
    roughness: 0.45,
  },

  "galvanized": {
    name: "Galvanized",
    baseColor: [0.75, 0.75, 0.78, 1],
    metallic: 0.8,
    roughness: 0.5,
  },

  // ---------------------------------------------------------------------------
  // Plastics
  // ---------------------------------------------------------------------------

  "plastic-glossy": {
    name: "Plastic (Glossy)",
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0.0,
    roughness: 0.15,
  },

  "plastic-matte": {
    name: "Plastic (Matte)",
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0.0,
    roughness: 0.6,
  },

  "abs-black": {
    name: "ABS Black",
    baseColor: [0.05, 0.05, 0.05, 1],
    metallic: 0.0,
    roughness: 0.4,
  },

  "nylon": {
    name: "Nylon",
    baseColor: [0.9, 0.87, 0.82, 1],
    metallic: 0.0,
    roughness: 0.55,
  },

  "acrylic-clear": {
    name: "Acrylic (Clear)",
    baseColor: [1.0, 1.0, 1.0, 1],
    metallic: 0.0,
    roughness: 0.0,
    transmission: 0.95,
    ior: 1.49,
  },

  // ---------------------------------------------------------------------------
  // Glass & Transparent
  // ---------------------------------------------------------------------------

  "glass-clear": {
    name: "Glass (Clear)",
    baseColor: [1.0, 1.0, 1.0, 1],
    metallic: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 2.0,
  },

  "glass-tinted": {
    name: "Glass (Tinted)",
    baseColor: [0.6, 0.8, 0.9, 1],
    metallic: 0.0,
    roughness: 0.0,
    transmission: 0.9,
    ior: 1.52,
    thickness: 3.0,
  },

  "glass-frosted": {
    name: "Glass (Frosted)",
    baseColor: [1.0, 1.0, 1.0, 1],
    metallic: 0.0,
    roughness: 0.3,
    transmission: 0.85,
    ior: 1.52,
    thickness: 2.0,
  },

  // ---------------------------------------------------------------------------
  // Rubber & Elastomers
  // ---------------------------------------------------------------------------

  "rubber-black": {
    name: "Rubber (Black)",
    baseColor: [0.08, 0.08, 0.08, 1],
    metallic: 0.0,
    roughness: 0.9,
  },

  "rubber-gray": {
    name: "Rubber (Gray)",
    baseColor: [0.35, 0.35, 0.35, 1],
    metallic: 0.0,
    roughness: 0.85,
  },

  "rubber-red": {
    name: "Rubber (Red)",
    baseColor: [0.7, 0.1, 0.1, 1],
    metallic: 0.0,
    roughness: 0.8,
  },

  // ---------------------------------------------------------------------------
  // Painted Surfaces
  // ---------------------------------------------------------------------------

  "paint-matte": {
    name: "Paint (Matte)",
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0.0,
    roughness: 0.7,
  },

  "paint-glossy": {
    name: "Paint (Glossy)",
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0.0,
    roughness: 0.15,
  },

  "paint-metallic": {
    name: "Paint (Metallic)",
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0.5,
    roughness: 0.25,
  },

  "car-paint": {
    name: "Car Paint",
    baseColor: [0.8, 0.0, 0.0, 1],
    metallic: 0.5,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  },

  // ---------------------------------------------------------------------------
  // Natural / Other
  // ---------------------------------------------------------------------------

  "wood-light": {
    name: "Wood (Light)",
    baseColor: [0.76, 0.60, 0.42, 1],
    metallic: 0.0,
    roughness: 0.6,
  },

  "wood-dark": {
    name: "Wood (Dark)",
    baseColor: [0.35, 0.22, 0.12, 1],
    metallic: 0.0,
    roughness: 0.55,
  },

  "ceramic-white": {
    name: "Ceramic (White)",
    baseColor: [0.95, 0.95, 0.93, 1],
    metallic: 0.0,
    roughness: 0.1,
  },

  "carbon-fiber": {
    name: "Carbon Fiber",
    baseColor: [0.05, 0.05, 0.05, 1],
    metallic: 0.3,
    roughness: 0.35,
    anisotropy: 0.3,
  },

  "concrete": {
    name: "Concrete",
    baseColor: [0.65, 0.63, 0.60, 1],
    metallic: 0.0,
    roughness: 0.85,
  },
};

// =============================================================================
// Sorted Name List
// =============================================================================

/**
 * Sorted list of all built-in material preset names.
 *
 * Useful for UI dropdowns, validation, and programmatic enumeration.
 * Derived from MATERIAL_PRESETS keys at module load time.
 */
export const MATERIAL_PRESET_NAMES: string[] = Object.keys(MATERIAL_PRESETS).sort();
