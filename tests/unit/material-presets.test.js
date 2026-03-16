/**
 * Unit tests for material-presets.ts — pure data validation.
 */
import { describe, test, expect } from 'vitest';
import {
  MATERIAL_PRESETS,
  MATERIAL_PRESET_NAMES,
} from '../../src/rendering/material-presets.js';

describe('MATERIAL_PRESETS', () => {
  test('contains at least 10 presets', () => {
    expect(Object.keys(MATERIAL_PRESETS).length).toBeGreaterThanOrEqual(10);
  });

  test('every preset has required fields', () => {
    for (const [name, preset] of Object.entries(MATERIAL_PRESETS)) {
      expect(preset, `${name} missing name`).toHaveProperty('name');
      expect(typeof preset.name, `${name}.name not string`).toBe('string');
      expect(preset, `${name} missing metalness`).toHaveProperty('metalness');
      expect(preset, `${name} missing roughness`).toHaveProperty('roughness');
      expect(preset.metalness, `${name}.metalness out of range`).toBeGreaterThanOrEqual(0);
      expect(preset.metalness, `${name}.metalness out of range`).toBeLessThanOrEqual(1);
      expect(preset.roughness, `${name}.roughness out of range`).toBeGreaterThanOrEqual(0);
      expect(preset.roughness, `${name}.roughness out of range`).toBeLessThanOrEqual(1);
    }
  });

  test('presets with color have valid RGBA arrays', () => {
    for (const [name, preset] of Object.entries(MATERIAL_PRESETS)) {
      if (preset.color) {
        expect(Array.isArray(preset.color), `${name}.color not array`).toBe(true);
        expect(preset.color.length, `${name}.color wrong length`).toBe(4);
        for (const v of preset.color) {
          expect(v, `${name}.color value out of range`).toBeGreaterThanOrEqual(0);
          expect(v, `${name}.color value out of range`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  // Specific presets with special properties
  test('glass presets have transmission', () => {
    for (const name of ['glass-clear', 'glass-tinted', 'glass-frosted', 'acrylic-clear']) {
      const p = MATERIAL_PRESETS[name];
      expect(p, `${name} missing`).toBeDefined();
      expect(p.transmission, `${name} missing transmission`).toBeGreaterThan(0);
    }
  });

  test('metal presets have metalness=1', () => {
    for (const name of ['chrome', 'stainless-steel', 'brushed-aluminum', 'gold', 'copper']) {
      const p = MATERIAL_PRESETS[name];
      expect(p, `${name} missing`).toBeDefined();
      expect(p.metalness, `${name} should be fully metalness`).toBe(1.0);
    }
  });

  test('car-paint has clearcoat', () => {
    const p = MATERIAL_PRESETS['car-paint'];
    expect(p).toBeDefined();
    expect(p.clearcoat).toBeGreaterThan(0);
  });

  test('brushed-aluminum has anisotropy', () => {
    const p = MATERIAL_PRESETS['brushed-aluminum'];
    expect(p).toBeDefined();
    expect(p.anisotropy).toBeGreaterThan(0);
  });

  test('plastic presets are non-metalness', () => {
    for (const name of ['plastic-glossy', 'plastic-matte']) {
      const p = MATERIAL_PRESETS[name];
      expect(p, `${name} missing`).toBeDefined();
      expect(p.metalness, `${name} should be non-metalness`).toBe(0);
    }
  });
});

describe('MATERIAL_PRESET_NAMES', () => {
  test('matches MATERIAL_PRESETS keys', () => {
    const keys = Object.keys(MATERIAL_PRESETS).sort();
    expect(MATERIAL_PRESET_NAMES).toEqual(keys);
  });

  test('is sorted alphabetically', () => {
    const sorted = [...MATERIAL_PRESET_NAMES].sort();
    expect(MATERIAL_PRESET_NAMES).toEqual(sorted);
  });
});
