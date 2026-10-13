/**
 * RadiosityStudio — connects the viewer's scene graph to the radiosity solver.
 *
 * Responsibilities:
 * - Chart every ObjectGroup's face geometry into the shared lightmap atlas
 *   (`lightmap-uv.ts`), adding a `uv1` attribute. Meshes whose vertices are
 *   shared across charts get a split copy of their geometry for the duration
 *   of Studio mode (restored on teardown).
 * - Reserve a large atlas region for the floor and feed the floor's chart
 *   corner to the solver as the unoccluded-ground reference.
 * - Patch the Studio PBR materials so they read the lightmap
 *   (`applyRadiosityPatch`), and keep their `lightMap` pointing at the
 *   solver's current ping-pong texture.
 * - Detect changes that invalidate the bake (visibility, transforms, material
 *   colours → reset; added/removed parts or geometry → rebuild).
 */

import * as THREE from "three";
import {
  chartMesh,
  packCharts,
  writeAtlasUv,
  type ChartedMesh,
  type LightmapChart,
} from "./lightmap-uv.js";
import {
  RadiosityLightmap,
  applyRadiosityPatch,
  removeRadiosityPatch,
  type RadiosityObject,
  type RadiosityOptions,
  type RadiosityQuality,
} from "./radiosity.js";
import type { RadiosityFloor } from "./studio-floor.js";
import type { NestedGroup } from "../scene/nestedgroup.js";
import { ObjectGroup } from "../scene/objectgroup.js";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { logger } from "../utils/logger.js";

interface BakedEntry {
  group: ObjectGroup;
  /** Geometry the front/back meshes had before Studio. */
  originalGeometry: THREE.BufferGeometry;
  /** Split copy swapped in (null when `uv1` was added in place). */
  swapped: THREE.BufferGeometry | null;
  albedo: THREE.Color;
  emissive: THREE.Color;
}

/** Result of a successful build, for logging/UI. */
export interface RadiosityBuildInfo {
  objects: number;
  charts: number;
  uvFaces: number;
  planarFaces: number;
  split: number;
  fill: number;
  texelsPerUnit: number;
}

/** Fraction of the atlas side reserved for the floor's chart. */
const FLOOR_ATLAS_FRACTION = 0.5;

/** Chart gutter (texels) on each side. */
const PADDING = 2;

function worldVisible(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

/** Diffuse albedo of a display material for the bounce (linear). */
function materialAlbedo(mat: THREE.Material, out: THREE.Color): THREE.Color {
  if (mat instanceof THREE.MeshStandardMaterial) {
    out.copy(mat.color).multiplyScalar(1 - mat.metalness * 0.9);
    // A texture usually darkens the base colour; approximate its average.
    if (mat.map) out.multiplyScalar(0.7);
    return out;
  }
  const color = (mat as { color?: THREE.Color }).color;
  if (color instanceof THREE.Color) return out.copy(color);
  return out.setRGB(0.5, 0.5, 0.5);
}

function materialEmissive(mat: THREE.Material, out: THREE.Color): THREE.Color {
  if (mat instanceof THREE.MeshStandardMaterial) {
    return out.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity);
  }
  return out.setRGB(0, 0, 0);
}

/** Surfaces that should not block light (glass, mostly transparent). */
function isOccluder(mat: THREE.Material): boolean {
  if (mat instanceof THREE.MeshPhysicalMaterial && mat.transmission > 0.5) {
    return false;
  }
  if (mat.transparent && mat.opacity < 0.5) return false;
  return true;
}

/** Build a vertex-split copy of `src` following the chart result. */
function buildSplitGeometry(
  src: THREE.BufferGeometry,
  charted: ChartedMesh,
  uv1: Float32Array,
): THREE.BufferGeometry {
  const remap = charted.remap!;
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const attr = src.attributes[name];
    if (!(attr instanceof THREE.BufferAttribute)) continue;
    const itemSize = attr.itemSize;
    const SrcArray = attr.array.constructor as {
      new (n: number): THREE.TypedArray;
    };
    const arr = new SrcArray(charted.vertexCount * itemSize);
    const srcArr = attr.array;
    for (let v = 0; v < charted.vertexCount; v++) {
      const o = remap[v] * itemSize;
      const d = v * itemSize;
      for (let k = 0; k < itemSize; k++) arr[d + k] = srcArr[o + k];
    }
    g.setAttribute(
      name,
      new THREE.BufferAttribute(arr, itemSize, attr.normalized),
    );
  }
  g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  g.setIndex(new THREE.BufferAttribute(charted.index, 1));
  g.userData = { ...src.userData };
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Order-independent 32-bit hash helpers for change detection. */
function hashInt(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 16777619) >>> 0;
}
function hashFloat(h: number, v: number): number {
  return hashInt(h, Math.round(v * 4096));
}

class RadiosityStudio {
  readonly solver: RadiosityLightmap;
  readonly quality: RadiosityQuality;

  private _entries: BakedEntry[] = [];
  private _patched = new Set<THREE.MeshPhysicalMaterial>();
  private _floor: RadiosityFloor | null = null;
  private _stateHash = 0;
  private _topologyHash = 0;
  private _lastInfo: RadiosityBuildInfo | null = null;

  constructor(
    renderer: THREE.WebGLRenderer,
    quality: RadiosityQuality,
    options: RadiosityOptions = {},
  ) {
    this.quality = quality;
    this.solver = new RadiosityLightmap(renderer, quality, options);
  }

  get info(): RadiosityBuildInfo | null {
    return this._lastInfo;
  }

  /**
   * Chart and pack the scene, swap geometries, patch materials and hand the
   * surfaces to the solver. Returns null when the scene cannot be charted
   * (too many faces for the atlas); the caller then falls back to shadow maps.
   */
  build(
    nestedGroup: NestedGroup,
    floor: RadiosityFloor | null,
    up: THREE.Vector3,
  ): RadiosityBuildInfo | null {
    this._restoreGeometries();
    this._floor = floor;
    nestedGroup.rootGroup?.updateMatrixWorld(true);

    const resolution = this.solver.resolution;
    const charted: { group: ObjectGroup; result: ChartedMesh }[] = [];
    const allCharts: LightmapChart[] = [];
    let uvFaces = 0;
    let planarFaces = 0;

    for (const path in nestedGroup.groups) {
      const group = nestedGroup.groups[path];
      if (!(group instanceof ObjectGroup) || !group.front) continue;
      const mesh = group.front;
      const geometry = mesh.geometry;
      const pos = geometry.getAttribute("position");
      if (!(pos instanceof THREE.BufferAttribute) || pos.count === 0) continue;
      if (!isOccluder(mesh.material)) continue;
      const uvAttr = geometry.getAttribute("uv");
      const tpf = geometry.userData.trianglesPerFace as Uint32Array | undefined;
      let result: ChartedMesh;
      try {
        result = chartMesh({
          positions: pos.array as Float32Array,
          index: geometry.index
            ? (geometry.index.array as Uint32Array | Uint16Array)
            : null,
          uv:
            uvAttr instanceof THREE.BufferAttribute
              ? (uvAttr.array as Float32Array)
              : null,
          trianglesPerFace: tpf ?? null,
          matrixWorld: mesh.matrixWorld.elements,
        });
      } catch (err) {
        logger.warn(`radiosity: charting failed for "${path}", skipped`, err);
        continue;
      }
      charted.push({ group, result });
      for (const c of result.charts) allCharts.push(c);
      uvFaces += result.uvFaces;
      planarFaces += result.planarFaces;
    }

    let floorChart: LightmapChart | null = null;
    if (floor && floor.geometry) {
      const side = Math.floor(resolution * FLOOR_ATLAS_FRACTION) - 2 * PADDING;
      floorChart = { w: side, h: side, fixed: true, x: 0, y: 0, pw: 0, ph: 0 };
      allCharts.push(floorChart);
    }

    let pack = packCharts(allCharts, resolution, PADDING);
    if (!pack) pack = packCharts(allCharts, resolution, 1);
    if (!pack) {
      logger.warn(
        `radiosity: ${allCharts.length} charts do not fit a ${resolution}² lightmap; disabled`,
      );
      this._lastInfo = null;
      return null;
    }

    // Apply uv1 (in place or via a split copy).
    let split = 0;
    const objects: RadiosityObject[] = [];
    for (const { group, result } of charted) {
      const mesh = group.front!;
      const original = mesh.geometry;
      const uv1 = writeAtlasUv(result, resolution);
      let swapped: THREE.BufferGeometry | null = null;
      let geometry = original;
      if (result.remap) {
        swapped = gpuTracker.trackGeometry(
          buildSplitGeometry(original, result, uv1),
          `BufferGeometry (radiosity split) for ${group.name}`,
        );
        mesh.geometry = swapped;
        if (group.back) group.back.geometry = swapped;
        geometry = swapped;
        split++;
      } else {
        original.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
      }
      const entry: BakedEntry = {
        group,
        originalGeometry: original,
        swapped,
        albedo: new THREE.Color(),
        emissive: new THREE.Color(),
      };
      this._entries.push(entry);
      objects.push({
        mesh,
        geometry,
        albedo: () => materialAlbedo(mesh.material, entry.albedo),
        emissive: () => materialEmissive(mesh.material, entry.emissive),
      });
    }

    let floorObject: RadiosityObject | null = null;
    let floorRefUv: THREE.Vector2 | null = null;
    if (floor && floor.mesh && floor.geometry && floorChart) {
      floor.setAtlasRect(
        floorChart.x,
        floorChart.y,
        floorChart.pw,
        floorChart.ph,
        resolution,
      );
      floorObject = {
        mesh: floor.mesh,
        geometry: floor.geometry,
        albedo: () => floor.albedo(),
        emissive: () => floor.emissive(),
      };
      // Corner texel of the floor chart: far from the model → unoccluded.
      floorRefUv = new THREE.Vector2(
        (floorChart.x + 0.5) / resolution,
        (floorChart.y + 0.5) / resolution,
      );
    }

    this.solver.setObjects(objects, floorObject, up, floorRefUv);
    this.patchMaterials(nestedGroup);
    this._stateHash = this._computeStateHash();
    this._topologyHash = this._computeTopologyHash(nestedGroup);

    this._lastInfo = {
      objects: objects.length,
      charts: allCharts.length,
      uvFaces,
      planarFaces,
      split,
      fill: pack.fill,
      texelsPerUnit: pack.scale,
    };
    logger.debug(
      `radiosity: ${objects.length} objects, ${allCharts.length} charts ` +
        `(${uvFaces} uv faces, ${planarFaces} planar, ${split} split), ` +
        `fill ${(pack.fill * 100).toFixed(0)}%, ${pack.scale.toFixed(2)} texels/unit`,
    );
    return this._lastInfo;
  }

  /**
   * Patch every Studio PBR material in the scene (idempotent; call again
   * after the materials were rebuilt).
   */
  patchMaterials(nestedGroup: NestedGroup): void {
    for (const path in nestedGroup.groups) {
      const group = nestedGroup.groups[path];
      if (!(group instanceof ObjectGroup)) continue;
      for (const mesh of [group.front, group.back]) {
        if (mesh && mesh.material instanceof THREE.MeshPhysicalMaterial) {
          this.patchMaterial(mesh.material);
        }
      }
    }
  }

  /** Patch one material (e.g. a material-editor clone). */
  patchMaterial(material: THREE.MeshPhysicalMaterial): void {
    applyRadiosityPatch(
      material,
      this.solver.texture,
      this.solver.displayUniforms,
    );
    this._patched.add(material);
  }

  /**
   * Point every patched material at the solver's current lightmap and patch
   * materials that appeared since the build (material-editor clones).
   */
  syncLightmap(nestedGroup: NestedGroup): void {
    this.patchMaterials(nestedGroup);
    const tex = this.solver.texture;
    for (const mat of this._patched) {
      if (mat.lightMap !== tex) mat.lightMap = tex;
    }
    this._floor?.setLightmap(tex, this.solver.displayUniforms.uRadWeight.value);
  }

  /**
   * Compare the scene against the last bake. "rebuild" when parts or
   * geometries changed, "reset" when only visibility/transforms/colours did.
   */
  checkChanges(nestedGroup: NestedGroup): "none" | "reset" | "rebuild" {
    const topo = this._computeTopologyHash(nestedGroup);
    if (topo !== this._topologyHash) return "rebuild";
    const state = this._computeStateHash();
    if (state !== this._stateHash) {
      this._stateHash = state;
      return "reset";
    }
    return "none";
  }

  /** Restore geometries and materials; keeps the solver for a later rebuild. */
  teardown(): void {
    this._restoreGeometries();
    for (const mat of this._patched) removeRadiosityPatch(mat);
    this._patched.clear();
    this._floor?.setLightmap(null, 0);
    this._floor = null;
  }

  dispose(): void {
    this.teardown();
    this.solver.dispose();
  }

  // -------------------------------------------------------------------------

  private _restoreGeometries(): void {
    for (const e of this._entries) {
      const { group, originalGeometry, swapped } = e;
      if (swapped) {
        if (group.front && group.front.geometry === swapped) {
          group.front.geometry = originalGeometry;
        }
        if (group.back && group.back.geometry === swapped) {
          group.back.geometry = originalGeometry;
        }
        gpuTracker.untrack("geometry", swapped);
        swapped.dispose();
      } else if (originalGeometry.hasAttribute("uv1")) {
        originalGeometry.deleteAttribute("uv1");
      }
    }
    this._entries = [];
  }

  private _computeStateHash(): number {
    let h = 2166136261;
    for (const e of this._entries) {
      const mesh = e.group.front!;
      h = hashInt(h, worldVisible(mesh) ? 1 : 0);
      const m = mesh.matrixWorld.elements;
      for (let i = 0; i < 16; i++) h = hashFloat(h, m[i]);
      const mat = mesh.material;
      const color = (mat as { color?: THREE.Color }).color;
      if (color instanceof THREE.Color) h = hashInt(h, color.getHex());
      if (mat instanceof THREE.MeshStandardMaterial) {
        h = hashFloat(h, mat.metalness);
        h = hashFloat(h, mat.emissiveIntensity);
        h = hashInt(h, mat.emissive.getHex());
      }
      h = hashFloat(h, mat.opacity);
    }
    if (this._floor) {
      h = hashInt(h, this._floor.mode === "grid" ? 1 : 0);
    }
    return h;
  }

  private _computeTopologyHash(nestedGroup: NestedGroup): number {
    let h = 2166136261;
    for (const path in nestedGroup.groups) {
      const group = nestedGroup.groups[path];
      if (!(group instanceof ObjectGroup) || !group.front) continue;
      h = hashInt(h, group.front.geometry.id);
    }
    return h;
  }
}

export { RadiosityStudio };
