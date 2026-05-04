/**
 * Built-in material presets for Studio mode.
 *
 * 31 presets organized by category: metals (polished & matte/brushed),
 * plastics, glass & transparent, rubber & elastomers, painted surfaces,
 * and natural/other materials.
 *
 * These are pure data definitions — no textures, no runtime cost.
 * The `builtin` field is intentionally omitted; it is used by user-defined
 * materials to reference these presets, not by presets themselves.
 *
 * All color values are in sRGB color space (0-1 per channel).
 * The material factory converts sRGB to linear when creating Three.js materials.
 * Presets with neutral color (plastics, paints) rely on the leaf node's
 * color field for the actual tint via fallback in the material factory.
 *
 */

import type { MaterialAppearance } from "../core/types.js";

// =============================================================================
// Preset Dictionary
// =============================================================================

/**
 * Built-in material presets keyed by preset name.
 *
 * Usage: look up a preset by the `material` tag on a leaf node, or via
 * `"builtin:<name>"` strings in the materials table.
 */
export const MATERIAL_PRESETS: Record<string, MaterialAppearance> = {
  // ---------------------------------------------------------------------------
  // Metals -- Polished
  // ---------------------------------------------------------------------------

  chrome: {
    name: "Chrome",
    color: [0.98, 0.98, 0.98, 1],
    metalness: 1.0,
    roughness: 0.05,
  },

  "polished-steel": {
    name: "Polished Steel",
    color: [0.91, 0.91, 0.92, 1],
    metalness: 1.0,
    roughness: 0.1,
  },

  "polished-aluminum": {
    name: "Polished Aluminum",
    color: [0.916, 0.923, 0.924, 1],
    metalness: 1.0,
    roughness: 0.1,
  },

  gold: {
    name: "Gold",
    color: [1, 0.93, 0, 1],
    metalness: 1.0,
    roughness: 0.1,
  },

  copper: {
    name: "Copper",
    color: [0.98, 0.82, 0.76, 1],
    metalness: 1.0,
    roughness: 0.15,
  },

  brass: {
    name: "Brass",
    color: [0.95, 0.9, 0.7, 1],
    metalness: 1.0,
    roughness: 0.15,
  },

  // ---------------------------------------------------------------------------
  // Metals -- Matte / Brushed
  // ---------------------------------------------------------------------------

  "stainless-steel": {
    name: "Stainless Steel",
    color: [0.91, 0.91, 0.92, 1],
    metalness: 1.0,
    roughness: 0.4,
  },

  "brushed-aluminum": {
    name: "Brushed Aluminum",
    color: [0.916, 0.923, 0.924, 1],
    metalness: 1.0,
    roughness: 0.35,
    anisotropy: 0.5,
  },

  "cast-iron": {
    name: "Cast Iron",
    color: [0.68, 0.68, 0.69, 1],
    metalness: 0.9,
    roughness: 0.7,
  },

  titanium: {
    name: "Titanium",
    color: [0.81, 0.79, 0.77, 1],
    metalness: 1.0,
    roughness: 0.45,
  },

  galvanized: {
    name: "Galvanized",
    color: [0.88, 0.88, 0.9, 1],
    metalness: 0.8,
    roughness: 0.5,
  },

  // ---------------------------------------------------------------------------
  // Plastics
  // ---------------------------------------------------------------------------

  "plastic-glossy": {
    name: "Plastic (Glossy)",
    color: [0.91, 0.91, 0.91, 1],
    metalness: 0.0,
    roughness: 0.4,
  },

  "plastic-matte": {
    name: "Plastic (Matte)",
    color: [0.91, 0.91, 0.91, 1],
    metalness: 0.0,
    roughness: 0.6,
  },

  "abs-black": {
    name: "ABS Black",
    color: [0.25, 0.25, 0.25, 1],
    metalness: 0.0,
    roughness: 0.4,
  },

  nylon: {
    name: "Nylon",
    color: [0.95, 0.94, 0.92, 1],
    metalness: 0.0,
    roughness: 0.55,
  },

  "acrylic-clear": {
    name: "Acrylic (Clear)",
    color: [1, 1, 1, 1],
    metalness: 0.0,
    roughness: 0.0,
    transmission: 0.95,
    ior: 1.49,
  },

  // ---------------------------------------------------------------------------
  // Glass & Transparent
  // ---------------------------------------------------------------------------

  "glass-clear": {
    name: "Glass (Clear)",
    color: [1, 1, 1, 1],
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.52,
    thickness: 2.0,
  },

  "glass-tinted": {
    name: "Glass (Tinted)",
    color: [0.8, 0.91, 0.95, 1],
    metalness: 0.0,
    roughness: 0.0,
    transmission: 0.9,
    ior: 1.52,
    thickness: 3.0,
  },

  "glass-frosted": {
    name: "Glass (Frosted)",
    color: [1, 1, 1, 1],
    metalness: 0.0,
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
    color: [0.31, 0.31, 0.31, 1],
    metalness: 0.0,
    roughness: 0.9,
  },

  "rubber-gray": {
    name: "Rubber (Gray)",
    color: [0.63, 0.63, 0.63, 1],
    metalness: 0.0,
    roughness: 0.85,
  },

  "rubber-red": {
    name: "Rubber (Red)",
    color: [0.85, 0.35, 0.35, 1],
    metalness: 0.0,
    roughness: 0.8,
  },

  // ---------------------------------------------------------------------------
  // Painted Surfaces
  // ---------------------------------------------------------------------------

  "paint-matte": {
    name: "Paint (Matte)",
    color: [0.91, 0.91, 0.91, 1],
    metalness: 0.0,
    roughness: 0.7,
  },

  "paint-glossy": {
    name: "Paint (Glossy)",
    color: [0.91, 0.91, 0.91, 1],
    metalness: 0.0,
    roughness: 0.15,
  },

  "paint-metallic": {
    name: "Paint (Metallic)",
    color: [0.91, 0.91, 0.91, 1],
    metalness: 0.5,
    roughness: 0.25,
  },

  "car-paint": {
    name: "Car Paint",
    color: [0.91, 0, 0, 1],
    metalness: 0.5,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  },

  // ---------------------------------------------------------------------------
  // Natural / Other
  // ---------------------------------------------------------------------------

  "ceramic-white": {
    name: "Ceramic (White)",
    color: [0.98, 0.98, 0.97, 1],
    metalness: 0.0,
    roughness: 0.1,
  },

  "carbon-fiber": {
    name: "Carbon Fiber",
    color: [0.25, 0.25, 0.25, 1],
    metalness: 0.3,
    roughness: 0.35,
    anisotropy: 0.3,
  },

  concrete: {
    name: "Concrete",
    color: [0.83, 0.82, 0.8, 1],
    metalness: 0.0,
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
export const MATERIAL_PRESET_NAMES: string[] =
  Object.keys(MATERIAL_PRESETS).sort();
