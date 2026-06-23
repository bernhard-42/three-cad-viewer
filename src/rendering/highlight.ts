import * as THREE from "three";
import { gpuTracker } from "../utils/gpu-tracker.js";
import { COMPONENT_ID_ATTRIBUTE, BACKGROUND_ID } from "./id-picking.js";
import type { ComponentRegistry } from "./id-picking.js";

/**
 * Shader-based component highlight (compact graph).
 *
 * Design:
 * - Per-component highlight state lives in ONE `R8UI` data texture indexed by
 *   `componentId` (the attribute already on the compact geometry). The texture is
 *   shared by every compact visual material via `onBeforeCompile`, so a state
 *   write is reflected by all materials with no recompile.
 * - State is BIT FLAGS ({@link HighlightFlag}); SELECTED wins over HOVER.
 * - `selectSolid` sets the flag for every registry component sharing a `solidPath`.
 *
 * Driven by the live event loop via `IdPicker.pickAt → registry → controller`.
 */

/** Highlight color for a selected component (was `ObjectGroup.HIGHLIGHT_COLOR_SELECTED`). */
export const HIGHLIGHT_COLOR_SELECTED = 0x53a0e3;

/** Highlight color for a hovered, not-selected component (was `HIGHLIGHT_COLOR_HOVER`). */
export const HIGHLIGHT_COLOR_HOVER = 0x89b9e3;

/**
 * Per-topo FOCUS BASE sizes (was `ObjectGroup.vertexFocusSize` / `edgeFocusWidth`).
 * These are injected PER-MATERIAL by the `patch*Material` methods (a `#define` /
 * material-local uniform), NOT via the shared {@link HighlightUniforms} — edges
 * (5) and vertices (8) need different values, and the hover-vs-selected `−2` delta
 * (`objectgroup.ts:285-298 widen()`) is resolved in-shader from the {@link
 * HighlightFlag} bits: `HOVER → base`, `SELECTED && !HOVER → base − 2`, else the
 * material's authored size.
 */
export const VERTEX_FOCUS_SIZE = 6;
export const EDGE_FOCUS_WIDTH = 5;

/**
 * Per-component highlight state, stored as bit flags in one texel of the state
 * texture. SELECTED takes precedence over HOVER when both are set, so hovering an
 * already-selected component keeps the selected color (matches the old
 * `_getHighlightColor` / `unhighlight(true)`).
 */
export const HighlightFlag = {
  NONE: 0,
  SELECTED: 1 << 0,
  HOVER: 1 << 1,
} as const;

export type HighlightFlagValue =
  (typeof HighlightFlag)[keyof typeof HighlightFlag];

/**
 * Width of the highlight-state data texture in texels. Height grows with the
 * component count: `height = ceil((maxId + 1) / WIDTH)`. A component's texel is at
 * `(id % WIDTH, floor(id / WIDTH))` — the same mapping the shader recomputes.
 */
export const HIGHLIGHT_STATE_TEXTURE_WIDTH = 2048;

// --- GLSL identifiers injected via onBeforeCompile (kept in sync with HighlightUniforms) ---

/** Uniform: the shared `usampler2D` highlight-state texture (R8UI). */
export const U_HIGHLIGHT_STATE = "uHighlightState";
/** Uniform: texture width, for `id -> ivec2` texel coordinates. */
export const U_HIGHLIGHT_TEX_WIDTH = "uHighlightTexWidth";
/** Uniform: selected color (linear RGB vec3). */
export const U_HIGHLIGHT_SELECTED_COLOR = "uHighlightSelectedColor";
/** Uniform: hover color (linear RGB vec3). */
export const U_HIGHLIGHT_HOVER_COLOR = "uHighlightHoverColor";

/**
 * The shared `THREE.IUniform` set bound into every patched compact material. One
 * instance per {@link HighlightController}; the same object is referenced by all
 * materials so a single write updates them together. Property names MUST match the
 * `U_HIGHLIGHT_*` GLSL identifier constants above.
 *
 * Intentionally TOPO-AGNOSTIC: focus sizes are per-topo and the original (authored)
 * size is per-material, so those are injected by `patch*Material` per material —
 * NOT here. See {@link VERTEX_FOCUS_SIZE} / {@link EDGE_FOCUS_WIDTH}.
 */
export interface HighlightUniforms {
  uHighlightState: { value: THREE.DataTexture | null };
  uHighlightTexWidth: { value: number };
  uHighlightSelectedColor: { value: THREE.Color };
  uHighlightHoverColor: { value: THREE.Color };
}

// ---------------------------------------------------------------------------
// GLSL injected via onBeforeCompile (shared by the three patch* methods)
//
// three upgrades stock materials to GLSL ES 3.00 on WebGL2 via `#define attribute
// in` / `#define varying out|in` macros (WebGLProgram.js), so writing `attribute` /
// `flat varying` here is converted automatically; `usampler2D` / `texelFetch` /
// integer attributes are then available.
// ---------------------------------------------------------------------------

/**
 * Shared state-fetch GLSL, injected into BOTH stages: the vertex stage needs it for
 * widening / point size, the fragment for color. Declares the sampler + texWidth +
 * the flat varying and a helper returning the component's {@link HighlightFlag} bits
 * (0 for background / nothing).
 */
const HL_STATE_GLSL = `
flat varying uint vHighlightId;
uniform highp usampler2D ${U_HIGHLIGHT_STATE};
uniform int ${U_HIGHLIGHT_TEX_WIDTH};
uint highlightState() {
  if (vHighlightId == 0u) return 0u;
  ivec2 hlUv = ivec2(
    int(vHighlightId) % ${U_HIGHLIGHT_TEX_WIDTH},
    int(vHighlightId) / ${U_HIGHLIGHT_TEX_WIDTH}
  );
  return texelFetch(${U_HIGHLIGHT_STATE}, hlUv, 0).r;
}`;

/**
 * Vertex header: the integer component-id attribute (per-vertex on faces/points,
 * instanced on edges — three binds both by name) + the shared state fetch.
 */
const HL_VERTEX_HEADER = `
attribute uint ${COMPONENT_ID_ATTRIBUTE};
${HL_STATE_GLSL}`;

/** Vertex main: forward the id. Injected right after `void main() {`. */
const HL_VERTEX_ASSIGN = `vHighlightId = ${COMPONENT_ID_ATTRIBUTE};`;

/** Fragment header: the shared state fetch + the two highlight colors. */
const HL_FRAGMENT_HEADER = `
${HL_STATE_GLSL}
uniform vec3 ${U_HIGHLIGHT_SELECTED_COLOR};
uniform vec3 ${U_HIGHLIGHT_HOVER_COLOR};`;

/**
 * Minimal material surface the patch methods need. Declared structurally because
 * three's examples-jsm `LineMaterial` has a `vertexColors: string | boolean` field
 * that is not assignable to the nominal `THREE.Material` type.
 */
type PatchableMaterial = Pick<
  THREE.Material,
  "onBeforeCompile" | "customProgramCacheKey" | "needsUpdate" | "userData"
>;

/**
 * Fragment color override, injected after `#include <color_fragment>` in all three
 * materials: replace the base/lit color with the highlight color — SELECTED wins
 * over HOVER (matches `ObjectGroup._getHighlightColor`).
 */
const HL_COLOR_OVERRIDE = `
  {
    uint hlColorState = highlightState();
    if ((hlColorState & ${HighlightFlag.SELECTED}u) != 0u) {
      diffuseColor.rgb = ${U_HIGHLIGHT_SELECTED_COLOR};
    } else if ((hlColorState & ${HighlightFlag.HOVER}u) != 0u) {
      diffuseColor.rgb = ${U_HIGHLIGHT_HOVER_COLOR};
    }
  }`;

/**
 * GLSL ternary choosing the focus size from the flag bits, matching the old
 * `widen()`: HOVER → `hover`; SELECTED && !HOVER → `selected`; else `none`.
 */
function focusSizeExpr(
  stateVar: string,
  hover: number,
  selected: number,
  none: string,
): string {
  return (
    `((${stateVar} & ${HighlightFlag.HOVER}u) != 0u ? ${hover.toFixed(1)} : ` +
    `((${stateVar} & ${HighlightFlag.SELECTED}u) != 0u ? ${selected.toFixed(1)} : ${none}))`
  );
}

/**
 * `String.replace` that throws when the anchor is absent. The Option-A edge patch
 * (and the others) string-match private three shader text; a `three` upgrade that
 * renames an anchor must fail LOUDLY here, not silently drop the highlight (build
 * would otherwise stay green). One guard test asserts each anchor still exists.
 */
function replaceOrThrow(
  src: string,
  anchor: string,
  replacement: string,
  where: string,
): string {
  if (!src.includes(anchor)) {
    throw new Error(
      `HighlightController.${where}: shader anchor not found: ${JSON.stringify(anchor)}`,
    );
  }
  return src.replace(anchor, replacement);
}

/**
 * Owns the per-component highlight state texture and patches compact visual
 * materials to read it. Created by the compact `NestedGroup` alongside its
 * `ComponentRegistry`.
 *
 * Lifecycle: construct → `patch*Material` on each compact face/edge/vertex visual
 * material as it is built → `resize(registry.maxId)` once all components are
 * registered → `setHover` / `setSelected` / `selectSolid` / `clear` to drive
 * highlight → `dispose`.
 */
export class HighlightController {
  /** The registry whose ids index the state texture. */
  readonly registry: ComponentRegistry;

  /** Shared uniforms bound into every patched material. */
  readonly uniforms: HighlightUniforms;

  /** Backing R8UI state texture (one byte = {@link HighlightFlag} bits per id). */
  private texture: THREE.DataTexture;

  /** CPU-side mirror of the texture data (length = `capacity`). */
  private data: Uint8Array;

  /** Number of texels currently allocated (= width * height ≥ maxId + 1). */
  private capacity: number;

  /** Ids currently carrying the HOVER flag (one component, or a whole solid). */
  private hoverIds: number[];

  /** Cheap identity of the current hover target so a repeat is a no-op. */
  private hoverKey: string;

  /**
   * @param registry - the compact group's component registry; sizes the texture
   *   and resolves `solidPath` for {@link selectSolid}.
   */
  constructor(registry: ComponentRegistry) {
    this.registry = registry;
    this.hoverIds = [];
    this.hoverKey = "";

    const texelCount = Math.max(1, registry.maxId + 1);
    const { texture, data, capacity } = this._allocate(texelCount);
    this.texture = texture;
    this.data = data;
    this.capacity = capacity;

    this.uniforms = {
      uHighlightState: { value: this.texture },
      uHighlightTexWidth: { value: HIGHLIGHT_STATE_TEXTURE_WIDTH },
      uHighlightSelectedColor: {
        value: new THREE.Color(HIGHLIGHT_COLOR_SELECTED),
      },
      uHighlightHoverColor: { value: new THREE.Color(HIGHLIGHT_COLOR_HOVER) },
    };
  }

  /**
   * Allocate an R8UI data texture (+ CPU mirror) holding at least `texelCount`
   * texels. `NearestFilter`, no mips — the shader reads exact integer flags via
   * `texelFetch`. This is the FROZEN texture format.
   */
  private _allocate(texelCount: number): {
    texture: THREE.DataTexture;
    data: Uint8Array;
    capacity: number;
  } {
    const width = HIGHLIGHT_STATE_TEXTURE_WIDTH;
    const height = Math.max(1, Math.ceil(texelCount / width));
    const capacity = width * height;
    const data = new Uint8Array(capacity);

    const texture = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RedIntegerFormat,
      THREE.UnsignedByteType,
    );
    texture.internalFormat = "R8UI";
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    gpuTracker.track("texture", texture, "HighlightController state texture");

    return { texture, data, capacity };
  }

  /** The shared state texture (re-created by {@link resize}). */
  get stateTexture(): THREE.DataTexture {
    return this.texture;
  }

  /**
   * Set or clear `bit` on a component's texel and flag the texture for re-upload
   * on change. The linear data index equals the id (row-major, width-W texels), so
   * texel `(id % W, floor(id / W))` is `data[id]`. Ignores background (0) and ids
   * past the current capacity (caller must {@link resize} first).
   */
  private _setBit(id: number, bit: number, on: boolean): void {
    if (id <= 0 || id >= this.capacity) return;
    const prev = this.data[id];
    const next = on ? prev | bit : prev & ~bit;
    if (next !== prev) {
      this.data[id] = next;
      this.texture.needsUpdate = true;
    }
  }

  /**
   * Move the HOVER flag onto exactly the given `ids` (clearing it from the
   * previously hovered set). `key` is a cheap identity so a repeat target is a
   * no-op — without it, re-hovering the same target every mouse-move would toggle
   * the bits off→on and re-upload the texture each frame. Does not touch SELECTED.
   */
  private _applyHover(key: string, ids: number[]): void {
    if (key === this.hoverKey) return;
    for (const id of this.hoverIds) this._setBit(id, HighlightFlag.HOVER, false);
    this.hoverIds = ids;
    this.hoverKey = key;
    for (const id of ids) this._setBit(id, HighlightFlag.HOVER, true);
  }

  /**
   * Move the HOVER flag onto a single component `id` (clearing the previous hover),
   * or clear hover entirely when `id` is `null`/background.
   */
  setHover(id: number | null): void {
    const empty = id == null || id === BACKGROUND_ID;
    this._applyHover(empty ? "" : `i${id}`, empty ? [] : [id]);
  }

  /**
   * HOVER a whole solid (its FACES only — see {@link selectSolid}), or clear hover
   * when `null`. Mirrors {@link selectSolid} for the transient hover state.
   */
  setHoverSolid(solidPath: string | null): void {
    if (solidPath == null) {
      this._applyHover("", []);
      return;
    }
    const ids: number[] = [];
    for (const info of this.registry.entries()) {
      if (info.solidPath === solidPath && info.topo === "face") ids.push(info.id);
    }
    this._applyHover(`s${solidPath}`, ids);
  }

  /** Set or clear the SELECTED flag for a single component id. */
  setSelected(id: number, flag: boolean): void {
    this._setBit(id, HighlightFlag.SELECTED, flag);
  }

  /** Whether a component currently carries the SELECTED flag. */
  isSelected(id: number): boolean {
    if (id <= 0 || id >= this.capacity) return false;
    return (this.data[id] & HighlightFlag.SELECTED) !== 0;
  }

  /**
   * Whether a solid is selected — every one of its faces carries SELECTED (false if it
   * has no faces). Used for solid toggle, so a solid that is only partially selected
   * (e.g. one face previously single-selected) is treated as not-selected and a click
   * selects the whole solid rather than clearing it.
   */
  isSolidSelected(solidPath: string): boolean {
    let any = false;
    for (const info of this.registry.entries()) {
      if (info.solidPath === solidPath && info.topo === "face") {
        any = true;
        if ((this.data[info.id] & HighlightFlag.SELECTED) === 0) return false;
      }
    }
    return any;
  }

  /**
   * Set or clear SELECTED for a whole solid. Flags only the solid's **faces**
   * (`topo === "face"`) — the body tints while edges keep their colour and corners
   * stay hidden. Iterates {@link ComponentRegistry.entries}.
   */
  selectSolid(solidPath: string, flag: boolean): void {
    for (const info of this.registry.entries()) {
      if (info.solidPath === solidPath && info.topo === "face") {
        this._setBit(info.id, HighlightFlag.SELECTED, flag);
      }
    }
  }

  /** Clear all highlight state (hover + selection) for every component. */
  clear(): void {
    this.data.fill(0);
    this.hoverIds = [];
    this.hoverKey = "";
    this.texture.needsUpdate = true;
  }

  /**
   * Grow the state texture to hold at least `maxId + 1` texels, preserving existing
   * state, and re-bind the new texture object into {@link uniforms}. No-op when the
   * current capacity already suffices.
   */
  resize(maxId: number): void {
    const need = maxId + 1;
    if (need <= this.capacity) return;
    const next = this._allocate(need);
    next.data.set(this.data);
    gpuTracker.untrack("texture", this.texture);
    this.texture.dispose();
    this.texture = next.texture;
    this.data = next.data;
    this.capacity = next.capacity;
    this.texture.needsUpdate = true;
    this.uniforms.uHighlightState.value = this.texture;
  }

  /**
   * Shared `onBeforeCompile` installer: binds the shared uniforms, prepends the
   * common vertex/fragment headers, forwards the component id, then runs the
   * topo-specific `customize` (color override / widening). Idempotent per material.
   */
  private _install(
    material: PatchableMaterial,
    where: string,
    customize: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
    variant: string = "",
  ): void {
    if (material.userData.highlightPatched === true) return;
    material.userData.highlightPatched = true;

    const prev = material.onBeforeCompile;

    // three.js keys a shader program on the material params + `customProgramCacheKey`,
    // whose DEFAULT is `onBeforeCompile.toString()`. Our `onBeforeCompile` is the same
    // arrow literal for every patch, and the per-variant shader differences (the vertex
    // `cullUnhighlighted` discard, the topo-specific injection, any chained `prev` like
    // triplanar) live in CLOSURES that `.toString()` can't see. Without a distinct key,
    // two materials with identical params (e.g. a culled vs a non-culled vertex
    // `PointsMaterial`) collide on one shared program → whichever compiles first wins
    // (no-cull → the face's hidden corner points render as "ghost" vertices). Append a
    // key that reflects topo + variant + chained prev so each shader variant compiles
    // its own program. (customProgramCacheKey is ADDITIVE — standard params like USE_MAP
    // still disambiguate, so this only ever splits programs, never merges distinct ones.)
    const prevKey = typeof prev === "function" ? prev.toString() : "";
    const cacheKey = `hl:${where}:${variant}:${prevKey}`;
    material.customProgramCacheKey = () => cacheKey;

    material.onBeforeCompile = (shader, renderer) => {
      prev?.call(material, shader, renderer);

      // Bind the SHARED uniform objects (same references → one write updates all).
      shader.uniforms[U_HIGHLIGHT_STATE] = this.uniforms.uHighlightState;
      shader.uniforms[U_HIGHLIGHT_TEX_WIDTH] = this.uniforms.uHighlightTexWidth;
      shader.uniforms[U_HIGHLIGHT_SELECTED_COLOR] =
        this.uniforms.uHighlightSelectedColor;
      shader.uniforms[U_HIGHLIGHT_HOVER_COLOR] =
        this.uniforms.uHighlightHoverColor;

      // Common: forward the component id as a flat varying.
      shader.vertexShader =
        HL_VERTEX_HEADER +
        "\n" +
        replaceOrThrow(
          shader.vertexShader,
          "void main() {",
          `void main() {\n  ${HL_VERTEX_ASSIGN}`,
          where,
        );
      shader.fragmentShader = HL_FRAGMENT_HEADER + "\n" + shader.fragmentShader;

      // Topo-specific color / size injection.
      customize(shader);
    };
    material.needsUpdate = true;
  }

  /**
   * Install `onBeforeCompile` on a face (`MeshStandardMaterial`) visual material.
   * Overwrites `diffuseColor.rgb` with the highlight color BEFORE lighting (after
   * the base color/map is applied) so a highlighted face is lit exactly as the old
   * `material.color` swap was — selected wins over hover.
   */
  patchFaceMaterial(material: PatchableMaterial): void {
    this._install(material, "patchFaceMaterial", (shader) => {
      shader.fragmentShader = replaceOrThrow(
        shader.fragmentShader,
        "#include <color_fragment>",
        `#include <color_fragment>${HL_COLOR_OVERRIDE}`,
        "patchFaceMaterial",
      );
    });
  }

  /**
   * Install `onBeforeCompile` on an edge (`LineMaterial`) visual material (Option A).
   * Widens the screen-space half-width for flagged segments by patching the stock
   * LineMaterial expansion (`offset *= linewidth;`, screen-space branch) and recolors
   * via the shared fragment override. `vertexColors` axes/trihedron carry no
   * registry id (state 0) so they stay inert.
   */
  patchEdgeMaterial(material: PatchableMaterial): void {
    this._install(material, "patchEdgeMaterial", (shader) => {
      shader.vertexShader = replaceOrThrow(
        shader.vertexShader,
        "offset *= linewidth;",
        `uint hlEdgeState = highlightState();
				offset *= ${focusSizeExpr("hlEdgeState", EDGE_FOCUS_WIDTH, EDGE_FOCUS_WIDTH - 2, "linewidth")};`,
        "patchEdgeMaterial",
      );
      shader.fragmentShader = replaceOrThrow(
        shader.fragmentShader,
        "#include <color_fragment>",
        `#include <color_fragment>${HL_COLOR_OVERRIDE}`,
        "patchEdgeMaterial",
      );
    });
  }

  /**
   * Install `onBeforeCompile` on a vertex (`PointsMaterial`) visual material.
   * Flagged points widen to the focus size and recolor. When `cullUnhighlighted`
   * (the solid highlight-Points cloud, invisible until selected), non-flagged points
   * are culled — `gl_PointSize = 0` AND a fragment `discard` (the discard is the
   * real guard; size-0 rasterization is driver-defined). Standalone visible vertices
   * (default) keep their authored `size` and color when unflagged.
   */
  patchVertexMaterial(
    material: PatchableMaterial,
    options: { cullUnhighlighted?: boolean } = {},
  ): void {
    const cull = options.cullUnhighlighted === true;
    const none = cull ? "0.0" : "size";
    this._install(
      material,
      "patchVertexMaterial",
      (shader) => {
        shader.vertexShader = replaceOrThrow(
          shader.vertexShader,
          "gl_PointSize = size;",
          `uint hlPtState = highlightState();
	gl_PointSize = ${focusSizeExpr("hlPtState", VERTEX_FOCUS_SIZE, VERTEX_FOCUS_SIZE - 2, none)};`,
          "patchVertexMaterial",
        );
        const discard = cull
          ? "\n    if (highlightState() == 0u) discard;"
          : "";
        shader.fragmentShader = replaceOrThrow(
          shader.fragmentShader,
          "#include <color_fragment>",
          `#include <color_fragment>${discard}${HL_COLOR_OVERRIDE}`,
          "patchVertexMaterial",
        );
      },
      // The cull discard is the variant that must NOT share a program with the
      // standalone (always-visible) vertex cloud — the ghost-vertex bug.
      cull ? "cull" : "nocull",
    );
  }

  /** Dispose the state texture and release tracking. */
  dispose(): void {
    gpuTracker.untrack("texture", this.texture);
    this.texture.dispose();
  }
}
