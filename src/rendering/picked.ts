import type * as THREE from "three";
import type { ComponentInfo, TopoType } from "./id-picking.js";
import type { HighlightController } from "./highlight.js";

/**
 * A picked component, so the viewer's selection state and the measure/select
 * tools consume ONE interface. {@link IdPicked} wraps a registry `ComponentInfo`
 * + the shader `HighlightController` (the GPU id-pick path) — NO dependency on the
 * exploded scene graph.
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
