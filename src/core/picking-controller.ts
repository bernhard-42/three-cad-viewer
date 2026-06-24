import * as THREE from "three";
import { KeyMapper } from "../utils/utils.js";
import { ObjectGroup } from "../scene/objectgroup.js";
import {
  TopoFilter,
  pickerTopoFilter,
  leafPath,
  type IdPicker,
  type ComponentInfo,
} from "../rendering/id-picking.js";
import { IdPicked, type PickedComponent } from "../rendering/picked.js";
import { hoverStatusText } from "../tools/cad_tools/mesh-measure.js";
import type { Shapes } from "./types.js";
import type { RenderedState } from "./viewer.js";
import type { Display } from "../ui/display.js";
import type { Tools } from "../tools/cad_tools/tools.js";

/**
 * The narrow surface {@link PickingController} needs from its host (the Viewer).
 * Keeps the controller decoupled from the rest of the Viewer god-object and
 * unit-testable. `rendered` is a lazy getter that throws before render() — the
 * controller must always read through it (never cache `nestedGroup`/`highlight`,
 * which are rebuilt every render()).
 */
export interface PickHost {
  readonly idPicker: IdPicker | null;
  readonly ready: boolean;
  readonly hasAnimationLoop: boolean;
  /** True while the Studio (presentation) tab owns the render. */
  readonly studioActive: boolean;
  readonly shapes: Shapes | null;
  readonly renderer: THREE.WebGLRenderer;
  readonly rendered: RenderedState;
  readonly display: Display;
  readonly cadTools: Tools;
  update(updateMarker: boolean, notify: boolean): void;
  handlePick(
    path: string,
    name: string,
    meta: boolean,
    shift: boolean,
    alt: boolean,
    point: THREE.Vector3 | null,
    nodeType?: string | null,
    tree?: boolean,
  ): void;
}

/**
 * Owns all pointer-driven picking on the compact graph: hover preselection
 * (highlight + status line), left-click selection commit, right-click/key removal,
 * and double-click pick. Hover proposes the component under the cursor
 * ({@link lastObject}); a left-click commits it ({@link lastSelection}) — one state
 * machine, so both fields live here.
 *
 * Listener lifecycle: hover (pointermove/leave) is always-on and added at
 * construction; selection (mousedown/mouseup + document keydown) is tool-scoped via
 * {@link setSelectionInput}; double-click via {@link setPickHandler}. {@link dispose}
 * tears them all down.
 */
export class PickingController {
  private readonly host: PickHost;

  /** Component under the cursor (hover); committed on left-click. */
  lastObject: PickedComponent | null = null;
  /** Last committed selection. */
  lastSelection: PickedComponent | null = null;

  // Cursor position (client px) from the independent pointermove listener.
  private idHoverClientX = 0;
  private idHoverClientY = 0;
  private idHoverInside = false;
  private idHoverRenderQueued = false;
  /** Per-component hover status text (fixed per mesh; cleared on reload / z-scale). */
  private hoverStatusCache = new Map<string, string>();

  // Selection input. `selectDownPosition` is the camera position at mousedown,
  // distinguishing a click from an orbit drag (fire only if the camera did not move).
  private selectionInputActive = false;
  private selectDownPosition: THREE.Vector3 | null = null;
  private pickHandlerActive = false;

  constructor(host: PickHost) {
    this.host = host;
    // Always-on hover tracking (independent of any tool).
    this.host.renderer.domElement.addEventListener(
      "pointermove",
      this.onIdHoverMove,
    );
    this.host.renderer.domElement.addEventListener(
      "pointerleave",
      this.onIdHoverLeave,
    );
  }

  /** Remove every listener this controller owns. */
  dispose(): void {
    this.host.renderer.domElement.removeEventListener(
      "pointermove",
      this.onIdHoverMove,
    );
    this.host.renderer.domElement.removeEventListener(
      "pointerleave",
      this.onIdHoverLeave,
    );
    this.setSelectionInput(false);
    this.setPickHandler(false);
  }

  // --- Hover preselection ---

  /** Record the cursor position over the canvas. */
  private onIdHoverMove = (e: PointerEvent): void => {
    this.idHoverClientX = e.clientX;
    this.idHoverClientY = e.clientY;
    this.idHoverInside = true;
    // Always-on hover: with no animation loop running (no active tool), the viewer
    // only re-renders on camera change, so a bare mouse-move wouldn't update the
    // preselection. Drive a render here, throttled to one per frame. During a tool the
    // RAF loop already pumps update(), so skip then.
    if (
      this.hoverPreselectActive() &&
      this.host.ready &&
      !this.host.hasAnimationLoop &&
      !this.idHoverRenderQueued &&
      !this.host.rendered.controls.isInteracting() // during a drag the controls listener renders
    ) {
      this.idHoverRenderQueued = true;
      requestAnimationFrame(() => {
        this.idHoverRenderQueued = false;
        // updateMarker=true: every render clears the frame, so the orientation marker
        // must be redrawn or it vanishes on the first hover render. notify=false: a
        // hover changes no state.
        if (this.host.ready && !this.host.hasAnimationLoop)
          this.host.update(true, false);
      });
    }
  };

  /** Cursor left the canvas → clear any hover highlight. */
  private onIdHoverLeave = (): void => {
    this.idHoverInside = false;
    // The always-on leave listener outlives clear() (only dispose() removes it),
    // and `host.rendered` THROWS when not rendered (optional chaining can't catch a
    // throwing getter), so guard on `ready` first.
    if (!this.host.ready) return;
    this.host.rendered.nestedGroup?.highlight?.setHover(null);
  };

  /**
   * Whether hover preselection (highlight + status line) is active. Disabled for GDS:
   * dense, stacked, instance-unrolled layout data where per-pixel hover flickers
   * endlessly and the B-rep readout ("area ≈ …") is meaningless, so GDS is
   * double-click-identify only. Also disabled in Studio (presentation) mode: hover
   * tint/status is a CAD/analysis affordance, not wanted in Studio, and skipping it
   * means the id buffer is never re-rendered for a bare mouse-move there.
   */
  private hoverPreselectActive(): boolean {
    return this.host.shapes?.format !== "GDS" && !this.host.studioActive;
  }

  /**
   * Called once per render: drive hover preselection unless a model is GDS or the
   * camera is being dragged.
   */
  handleHover(): void {
    if (!this.hoverPreselectActive()) return;
    if (this.host.rendered.controls.isInteracting()) return;
    this.handleIdHover();
  }

  /**
   * Hover via the GPU id picker on the compact graph: resolve the component under the
   * cursor and drive the shader `HighlightController`. Sets {@link lastObject}
   * (committed on left-click by {@link commitSelection} when a tool is active).
   */
  private handleIdHover(): void {
    const highlight = this.host.rendered?.nestedGroup?.highlight ?? null;
    if (this.host.idPicker === null || highlight === null) return;
    // Clear hover (keeping any selection), the status line, and the hover target.
    const release = (): void => {
      this.releaseLastSelected();
      this.lastObject = null;
      this.host.display.setStatusLine("");
    };
    if (!this.idHoverInside) {
      release();
      return;
    }
    const rect = this.host.renderer.domElement.getBoundingClientRect();
    const x = this.idHoverClientX - rect.left;
    const y = this.idHoverClientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      release();
      return;
    }
    const filter = this.host.display.shapeFilterDropDownMenu.currentFilter;
    const fromSolid = filter.includes(TopoFilter.solid);
    const topoFilter = pickerTopoFilter(filter);
    const hit = this.host.idPicker.pickAt(
      x,
      y,
      topoFilter === undefined ? {} : { topoFilter },
    );
    // The vertex/edge pick layers stay active even when the owning solid is hidden
    // (visibility lives on the mesh material, not the pick layer), so gate the pick on
    // visibility — otherwise a hidden component could be hovered AND selected.
    if (hit === null || !this.pickVisible(hit.info)) {
      release();
      return;
    }
    const picked: PickedComponent = new IdPicked(
      hit.info,
      fromSolid,
      hit.point,
      highlight,
    );
    if (!picked.equals(this.lastObject)) {
      this.releaseLastSelected();
      picked.highlight(true);
      // committed on left-click by commitSelection (toggleSelection)
      this.lastObject = picked;
      // Cache only the COORD-FREE texts (face `area`, solid `counts`+`vol`): these are
      // invariant under rigid motion (explode/animation), so they never go stale from a
      // part moving — only z-scale (changes area/volume) + model reload clear the cache.
      // Edge/vertex texts carry WORLD-space coords, so recompute them live each time the
      // hovered component changes (correct after explode/animation without invalidation).
      const cacheable = fromSolid || hit.info.topo === "face";
      const provider = this.host.rendered.nestedGroup.meshGeometry;
      let text: string;
      if (cacheable) {
        const key =
          fromSolid && hit.info.solidPath !== null
            ? `S:${hit.info.solidPath}`
            : hit.info.path;
        const cached = this.hoverStatusCache.get(key);
        if (cached !== undefined) {
          text = cached;
        } else {
          text = hoverStatusText(hit.info, fromSolid, provider);
          this.hoverStatusCache.set(key, text);
        }
      } else {
        text = hoverStatusText(hit.info, fromSolid, provider);
      }
      this.host.display.setStatusLine(text);
    }
  }

  /** Drop the cached hover texts (e.g. on z-scale change — world lengths change). */
  invalidateHoverCache(): void {
    this.hoverStatusCache.clear();
  }

  /**
   * Drop any lingering hover highlight + status line (keeping the committed selection).
   * Called when entering Studio mode: hover preselection is disabled there, so the
   * per-render {@link handleHover} no longer runs its own release and a stale tint/status
   * from CAD mode would otherwise persist.
   */
  clearHover(): void {
    this.releaseLastSelected();
    this.lastObject = null;
    if (this.host.ready)
      this.host.rendered.nestedGroup?.highlight?.setHover(null);
    this.host.display.setStatusLine("");
  }

  /**
   * Whether the component a pick resolved to is currently visible — used to drop picks
   * of hidden geometry. Visibility is the owning group's material `visible` flag
   * (faces for solids/standalone faces; edge/vertex materials for standalone leaves).
   */
  private pickVisible(info: ComponentInfo): boolean {
    const ng = this.host.rendered.nestedGroup;
    const ownerPath = leafPath(info);
    const g = ng.groups[ownerPath];
    if (!(g instanceof ObjectGroup)) return true; // unknown owner → don't block
    const vis = (
      m: THREE.Material | THREE.Material[] | null | undefined,
    ): boolean =>
      m == null ? false : Array.isArray(m) ? m.some((x) => x.visible) : m.visible;
    if (info.topo === "vertex") {
      // a solid's vertices are pick-only (no visual) → follow the solid's faces/edges;
      // a standalone vertex node has its own material.
      if (info.solidPath !== null) {
        return vis(g.front?.material) || vis(g.edgeMaterial);
      }
      return vis(g.vertices?.material);
    }
    if (info.topo === "edge") {
      return vis(g.edgeMaterial) || vis(g.front?.material);
    }
    return vis(g.front?.material);
  }

  // --- Selection state ---

  clearSelection = (): void => {
    this.host.rendered.nestedGroup.clearSelection();
    this.host.cadTools.handleResetSelection();
    this.lastObject = null;
    this.lastSelection = null;
  };

  private releaseLastSelected(): void {
    if (this.lastObject != null) {
      this.lastObject.unhighlight(true);
    }
  }

  removeLastSelected(): void {
    if (this.lastSelection != null) {
      this.lastSelection.unhighlight(false);
      this.host.rendered.treeview.toggleLabelColor(
        null,
        this.lastSelection.backendId,
      );
      this.lastSelection = null;
      this.lastObject = null;
    }
    this.host.cadTools.handleRemoveLastSelection(true);
  }

  /** Drop selection state + hover cache + status line (on model reload). */
  reset(): void {
    this.lastObject = null;
    this.lastSelection = null;
    this.hoverStatusCache.clear();
    this.host.display.setStatusLine("");
  }

  // --- Selection input (click + key, tool-scoped) ---

  /**
   * Add/remove the canvas mousedown+mouseup and document keydown listeners
   * (idempotent, guarded on `selectionInputActive`). Hover maintains
   * {@link lastObject}; these handlers commit it on left-click and handle the key +
   * right-click actions.
   */
  setSelectionInput(flag: boolean): void {
    if (flag === this.selectionInputActive) return;
    const el = this.host.renderer.domElement;
    if (flag) {
      el.addEventListener("mousedown", this.onSelectMouseDown, false);
      el.addEventListener("mouseup", this.onSelectMouseUp, false);
      // Keyboard listener is on document (canvas doesn't receive focus).
      document.addEventListener("keydown", this.onSelectKeyDown, false);
      this.selectionInputActive = true;
    } else {
      el.removeEventListener("mousedown", this.onSelectMouseDown);
      el.removeEventListener("mouseup", this.onSelectMouseUp);
      document.removeEventListener("keydown", this.onSelectKeyDown);
      this.selectDownPosition = null;
      this.selectionInputActive = false;
    }
  }

  // Record the camera position at mousedown for LEFT/RIGHT (used at mouseup to
  // distinguish a click from an orbit drag).
  private onSelectMouseDown = (e: MouseEvent): void => {
    if (e.button === THREE.MOUSE.LEFT || e.button === THREE.MOUSE.RIGHT) {
      this.selectDownPosition = this.host.rendered.camera.getPosition().clone();
    }
  };

  // On mouseup, fire only if the camera did not move (a click, not an orbit drag).
  // LEFT → commit the hovered object; RIGHT → remove the last selection.
  private onSelectMouseUp = (e: MouseEvent): void => {
    if (this.selectDownPosition == null) return;
    const camera = this.host.rendered.camera;
    if (e.button === THREE.MOUSE.LEFT) {
      if (this.selectDownPosition.distanceTo(camera.getPosition()) < 1e-6) {
        this.commitSelection(KeyMapper.get(e, "shift"));
      }
    } else if (e.button === THREE.MOUSE.RIGHT) {
      if (this.selectDownPosition.distanceTo(camera.getPosition()) < 1e-6) {
        this.removeLastSelected();
      }
    }
  };

  // Escape → clear selection; Backspace → remove last selection.
  private onSelectKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.clearSelection();
    } else if (e.key === "Backspace") {
      this.removeLastSelected();
    }
  };

  // Commit the currently-hovered object as a selection.
  private commitSelection(shift: boolean): void {
    if (this.lastObject == null) return;
    // one object for a selected vertex, edge and face and multiple faces for a solid
    this.lastObject.toggleSelection();
    this.host.cadTools.handleSelectedObj(
      this.lastObject,
      !this.lastObject.equals(this.lastSelection),
      shift,
    );
    this.lastSelection = this.lastObject;
  }

  // --- Double-click pick ---

  setPickHandler(flag: boolean): void {
    if (flag === this.pickHandlerActive) return;
    const el = this.host.renderer.domElement;
    if (flag) {
      el.addEventListener("dblclick", this.onDoubleClick, false);
      this.pickHandlerActive = true;
    } else {
      el.removeEventListener("dblclick", this.onDoubleClick, false);
      this.pickHandlerActive = false;
    }
  }

  /**
   * Double-click pick via the GPU id picker: `idPicker.pickAt` resolves the component
   * under the cursor, the registry gives its owning tree-leaf path ({@link leafPath}),
   * and the readback world-space `point` feeds `handlePick` (the `shift && meta` camera
   * target, with a bbox-center fallback when `point` is null). No topo filter: a
   * double-click selects whatever is under the cursor and resolves it to its leaf.
   */
  private onDoubleClick = (e: PointerEvent | MouseEvent): void => {
    if (this.host.idPicker === null) return;
    // Studio is presentation mode — no id-buffer picking at all.
    if (this.host.studioActive) return;
    const rect = this.host.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    const hit = this.host.idPicker.pickAt(x, y);
    // A hidden solid's edge/vertex pick layers stay active — gate on visibility so a
    // hidden component cannot be double-click picked (matches hover/select).
    if (hit === null || !this.pickVisible(hit.info)) return;
    const leaf = leafPath(hit.info);
    const slash = leaf.lastIndexOf("/");
    if (slash < 0) return;
    this.host.handlePick(
      leaf.slice(0, slash),
      leaf.slice(slash + 1),
      KeyMapper.get(e, "meta"),
      KeyMapper.get(e, "shift"),
      KeyMapper.get(e, "alt"),
      hit.point,
      null,
      false,
    );
  };
}
