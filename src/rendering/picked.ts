import type * as THREE from "three";
import type { PickedObject } from "./raycast.js";
import type { ComponentInfo, TopoType } from "./id-picking.js";
import type { HighlightController } from "./highlight.js";

/**
 * A picked component, abstracted over the two picking backends so the viewer's
 * selection state and the measure/select tools consume ONE interface:
 * - {@link RaycastPicked} wraps the legacy `PickedObject`/`ObjectGroup` (the dormant
 *   `"raycast"` fallback);
 * - {@link IdPicked} wraps a registry `ComponentInfo` + the shader `HighlightController`
 *   (the compact-graph `"idbuffer"` path) — NO dependency on the exploded scene graph.
 *
 * Replaces the consumers' previous reach into `PickedObject.objs()` → per-component
 * `ObjectGroup` (highlight/unhighlight/toggleSelection/clearHighlights) + `.obj.name`.
 */
export interface PickedComponent {
  /** Canonical "/"-path sent to the backend (component path, or solid path when
   *  {@link fromSolid}). Replaces measure's `getId` + tree-sync name munging. */
  readonly backendId: string;
  /** Leaf name, e.g. "faces_3" — source for select.ts's numeric sub-index. */
  readonly name: string;
  /** Topology type of the resolved component. */
  readonly topo: TopoType;
  /** Solid-selection mode (the topo filter is "solid"). */
  readonly fromSolid: boolean;
  /** World-space hit point, when the backend provides one (else null). */
  readonly point: THREE.Vector3 | null;
  /** Show the hover highlight (`true`) — selection is via {@link toggleSelection}. */
  highlight(asHover: boolean): void;
  /** Remove the hover highlight; `keepSelected` preserves the selected state. */
  unhighlight(keepSelected: boolean): void;
  /** Toggle the persistent selected highlight. */
  toggleSelection(): void;
  /** Clear all highlight (hover + selected) for this component. */
  clearHighlights(): void;
  /** Identity equality (same component / same solid), for hover + isNewObject dedup. */
  equals(other: PickedComponent | null): boolean;
}

/**
 * `PickedComponent` over the legacy raycaster result. Forwards to the per-component
 * `ObjectGroup` methods on the exploded graph, preserving the exact pre-migration
 * behavior (identity by `ObjectGroup.name`).
 */
export class RaycastPicked implements PickedComponent {
  constructor(
    private readonly picked: PickedObject,
    private readonly delim: string,
  ) {}

  get backendId(): string {
    const name = this.picked.obj.name;
    if (this.picked.fromSolid) {
      const solid = name
        .replace(/\|faces.*$/, "")
        .replace(/\|edges.*$/, "")
        .replace(/\|vertices.*$/, "");
      return solid.replaceAll(this.delim, "/");
    }
    return name.replaceAll(this.delim, "/");
  }

  get name(): string {
    const parts = this.picked.obj.name.split(this.delim);
    return parts[parts.length - 1];
  }

  get topo(): TopoType {
    return (this.picked.obj.shapeInfo?.topo ?? "face") as TopoType;
  }

  get fromSolid(): boolean {
    return this.picked.fromSolid;
  }

  get point(): THREE.Vector3 | null {
    return null; // the CPU raycaster path does not carry the hit point here
  }

  highlight(asHover: boolean): void {
    for (const o of this.picked.objs()) o.highlight(asHover);
  }

  unhighlight(keepSelected: boolean): void {
    for (const o of this.picked.objs()) o.unhighlight(keepSelected);
  }

  toggleSelection(): void {
    for (const o of this.picked.objs()) o.toggleSelection();
  }

  clearHighlights(): void {
    for (const o of this.picked.objs()) o.clearHighlights();
  }

  equals(other: PickedComponent | null): boolean {
    return (
      other instanceof RaycastPicked &&
      other.picked.obj.name === this.picked.obj.name
    );
  }
}

/**
 * `PickedComponent` over a GPU id-pick result. Drives the shader
 * `HighlightController` by `componentId` (faces of a solid via `*Solid`), with no
 * per-component `ObjectGroup` and no exploded graph.
 */
export class IdPicked implements PickedComponent {
  constructor(
    readonly info: ComponentInfo,
    readonly fromSolid: boolean,
    readonly point: THREE.Vector3 | null,
    private readonly highlightCtl: HighlightController,
  ) {}

  /** Whether to act on the whole solid (faces) rather than the single component. */
  private get asSolid(): boolean {
    return this.fromSolid && this.info.solidPath !== null;
  }

  get backendId(): string {
    return this.asSolid ? this.info.solidPath! : this.info.path;
  }

  get name(): string {
    return this.info.name;
  }

  get topo(): TopoType {
    return this.info.topo;
  }

  highlight(asHover: boolean): void {
    if (!asHover) return; // selection is driven via toggleSelection()
    if (this.asSolid) this.highlightCtl.setHoverSolid(this.info.solidPath);
    else this.highlightCtl.setHover(this.info.id);
  }

  unhighlight(keepSelected: boolean): void {
    // hover release: clear hover (the controller tracks a single hover target);
    // SELECTED is untouched by setHover, so it is preserved.
    this.highlightCtl.setHover(null);
    if (!keepSelected) this._setSelected(false);
  }

  toggleSelection(): void {
    const selected = this.asSolid
      ? this.highlightCtl.isSolidSelected(this.info.solidPath!)
      : this.highlightCtl.isSelected(this.info.id);
    this._setSelected(!selected);
  }

  clearHighlights(): void {
    this.highlightCtl.setHover(null);
    this._setSelected(false);
  }

  private _setSelected(flag: boolean): void {
    if (this.asSolid) this.highlightCtl.selectSolid(this.info.solidPath!, flag);
    else this.highlightCtl.setSelected(this.info.id, flag);
  }

  equals(other: PickedComponent | null): boolean {
    if (!(other instanceof IdPicked)) return false;
    if (this.asSolid || other.asSolid) {
      return this.info.solidPath === other.info.solidPath && this.asSolid === other.asSolid;
    }
    return this.info.id === other.info.id;
  }
}
