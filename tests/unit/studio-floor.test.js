/**
 * Unit tests for StudioFloor — simple state management.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { StudioFloor } from '../../src/rendering/studio-floor.js';

describe('StudioFloor', () => {
  let floor;

  beforeEach(() => {
    floor = new StudioFloor();
  });

  test('constructor creates a hidden group named studioFloor', () => {
    expect(floor.group).toBeInstanceOf(THREE.Group);
    expect(floor.group.name).toBe('studioFloor');
    expect(floor.group.visible).toBe(false);
  });

  test('configure creates a shadow plane at correct position', () => {
    floor.configure(-1.5, 10);

    expect(floor.group.children).toHaveLength(1);
    const plane = floor.group.children[0];
    expect(plane.name).toBe('studioShadowPlane');
    expect(plane.position.z).toBe(-1.5);
    expect(plane.receiveShadow).toBe(true);
    expect(plane.visible).toBe(false); // shadows not enabled yet
  });

  test('configure sizes floor to 4x scene size', () => {
    floor.configure(0, 5);

    const plane = floor.group.children[0];
    const params = plane.geometry.parameters;
    expect(params.width).toBe(20);  // 5 * 4
    expect(params.height).toBe(20);
  });

  test('reconfigure replaces the previous plane', () => {
    floor.configure(0, 10);
    const firstPlane = floor.group.children[0];

    floor.configure(-2, 20);
    expect(floor.group.children).toHaveLength(1);
    expect(floor.group.children[0]).not.toBe(firstPlane);
    expect(floor.group.children[0].position.z).toBe(-2);
  });

  test('setShadowsEnabled toggles plane and group visibility', () => {
    floor.configure(0, 10);

    floor.setShadowsEnabled(true);
    expect(floor.group.visible).toBe(true);
    expect(floor.group.children[0].visible).toBe(true);

    floor.setShadowsEnabled(false);
    expect(floor.group.visible).toBe(false);
    expect(floor.group.children[0].visible).toBe(false);
  });

  test('setShadowsEnabled before configure is safe', () => {
    // No plane yet — should not throw
    expect(() => floor.setShadowsEnabled(true)).not.toThrow();
    expect(floor.group.visible).toBe(true);
  });

  test('enabling shadows then configuring respects enabled state', () => {
    floor.setShadowsEnabled(true);
    floor.configure(0, 10);

    // Plane should be visible because shadows were enabled first
    expect(floor.group.children[0].visible).toBe(true);
  });

  test('setShadowIntensity sets ShadowMaterial opacity', () => {
    floor.configure(0, 10);

    floor.setShadowIntensity(0.8);
    expect(floor.group.children[0].material.opacity).toBeCloseTo(0.8);

    floor.setShadowIntensity(0.3);
    expect(floor.group.children[0].material.opacity).toBeCloseTo(0.3);
  });

  test('dispose removes plane from group', () => {
    floor.configure(0, 10);
    expect(floor.group.children).toHaveLength(1);

    floor.dispose();
    expect(floor.group.children).toHaveLength(0);
  });

  test('dispose is safe to call without configure', () => {
    expect(() => floor.dispose()).not.toThrow();
  });

  test('dispose is safe to call twice', () => {
    floor.configure(0, 10);
    floor.dispose();
    expect(() => floor.dispose()).not.toThrow();
  });
});
