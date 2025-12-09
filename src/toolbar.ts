import { KeyMapper } from "./utils.js";

/**
 * Feature flags for toolbar buttons.
 */
interface ToolbarFeatures {
  measureTools: boolean;
  selectTool: boolean;
  explodeTool: boolean;
}

/**
 * Options for configuring a Toolbar instance.
 */
interface ToolbarOptions {
  getVisibleWidth: () => number;
  getWidthThreshold: () => number;
  features: ToolbarFeatures;
}

/**
 * Manages a collapsible toolbar with buttons and ellipsis indicators.
 */
class Toolbar {
  id: string;
  container: HTMLElement;
  getVisibleWidth: () => number;
  getWidthThreshold: () => number;
  features: ToolbarFeatures;
  buttons: Record<string, BaseButton>;
  ellipses: Ellipsis[];
  toggles: Record<number, BaseButton[]>;

  /**
   * Create a Toolbar instance.
   * @param container - The container element for the toolbar.
   * @param id - Unique identifier for the toolbar.
   * @param options - Configuration options.
   */
  constructor(container: HTMLElement, id: string, options: ToolbarOptions) {
    this.id = id;
    this.container = container;
    this.getVisibleWidth = options.getVisibleWidth;
    this.getWidthThreshold = options.getWidthThreshold;
    this.features = options.features;

    this.container.addEventListener("mouseleave", this._onMouseLeave);
    this.buttons = {};
    this.ellipses = [];
    this.toggles = { 0: [], 1: [], 2: [], 3: [] };
  }

  private _onMouseLeave = (): void => {
    if (this.getVisibleWidth() < this.getWidthThreshold()) {
      this.minimize();
    }
  };

  addButton(button: BaseButton, tag: number): void {
    button.setId(this.id);
    this.buttons[button.name] = button;
    if (tag != -1) {
      this.toggles[tag].push(button);
    }
    this.container.appendChild(button.html);
  }

  addSeparator(): void {
    const html = document.createElement("span");
    html.className = "tcv_separator";
    this.container.appendChild(html);
  }

  addEllipsis(ellipsis: Ellipsis): void {
    this.container.appendChild(ellipsis.html);
    this.ellipses.push(ellipsis);
  }

  defineGroup(buttons: ClickButton[]): void {
    for (const button of buttons) {
      for (const button2 of buttons) {
        if (button2 != button) {
          button.addGroupMember(button2);
        }
      }
    }
  }

  private _toggle(flag: boolean, id: number | null = null): void {
    let toggles: Record<number, BaseButton[]>;
    let ellipses: Ellipsis[];
    if (id == null) {
      toggles = this.toggles;
      ellipses = this.ellipses;
    } else {
      toggles = {};
      toggles[id] = this.toggles[id];
      ellipses = [this.ellipses[id]];
    }
    for (const ellipsis of ellipses) {
      if (flag) {
        ellipsis.html.classList.remove("tcv_unvisible");
      } else {
        ellipsis.html.classList.add("tcv_unvisible");
      }
    }
    for (const tag in toggles) {
      for (const button of toggles[tag]) {
        if (
          !flag &&
          ((button.name === "distance" && !this.features.measureTools) ||
            (button.name === "properties" && !this.features.measureTools) ||
            (button.name === "select" && !this.features.selectTool) ||
            (button.name === "explode" && !this.features.explodeTool))
        ) {
          continue;
        }
        button.show(!flag);
      }
    }
  }

  minimize = (id: number | null = null): void => {
    this._toggle(true, id);
  };

  maximize = (id: number | null = null): void => {
    this._toggle(true);
    this._toggle(false, id);
  };

  dispose(): void {
    this.container.removeEventListener("mouseleave", this._onMouseLeave);
    for (const button of Object.values(this.buttons)) {
      button.dispose();
    }
    for (const ellipsis of this.ellipses) {
      ellipsis.dispose();
    }
  }
}

class Ellipsis {
  id: number;
  action: (id: number) => void;
  html: HTMLSpanElement;

  constructor(id: number, action: (id: number) => void) {
    this.id = id;
    this.action = action;
    const html = document.createElement("span");
    html.innerHTML = "...";
    html.className = "tcv_ellipsis tcv_unvisible";
    this.html = html;
    this.html.addEventListener("mouseenter", this._onMouseEnter);
  }

  private _onMouseEnter = (): void => {
    this.action(this.id);
  };

  dispose(): void {
    this.html.removeEventListener("mouseenter", this._onMouseEnter);
  }
}

class BaseButton {
  name: string;
  html: HTMLSpanElement;
  frame: HTMLSpanElement;
  containerId: string;

  constructor(_theme: string, icon: string, tooltip: string) {
    this.name = icon;
    this.containerId = "";

    const html = document.createElement("span");
    html.className = "tcv_tooltip";
    html.setAttribute("data-tooltip", tooltip);

    const frame = document.createElement("span");
    frame.className = "tcv_button_frame";
    html.appendChild(frame);

    const input = document.createElement("input");
    input.className = "tcv_reset tcv_btn";
    input.type = "button";
    input.classList.add(`tcv_button_${icon}`);
    frame.appendChild(input);

    this.html = html;
    this.frame = frame;

    this.html.addEventListener("click", this._onClick);
  }

  private _onClick = (e: Event): void => {
    this.handler(e);
  };

  dispose(): void {
    this.html.removeEventListener("click", this._onClick);
  }

  setId(id: string): void {
    this.containerId = id;
  }

  handler = (_e: Event): void => {
    console.log("not implemented yet");
  };

  alignRight(): void {
    this.html.classList.add("tcv_align_right");
  }

  show(flag: boolean): void {
    this.html.style.display = flag ? "inline-block" : "none";
  }
}

class Button extends BaseButton {
  action: (name: string, shift: boolean) => void;

  constructor(
    theme: string,
    svg: string,
    tooltip: string,
    action: (name: string, shift: boolean) => void
  ) {
    super(theme, svg, tooltip);
    this.action = action;
  }

  handler = (e: Event): void => {
    const shift = e instanceof MouseEvent ? KeyMapper.get(e, "shift") : false;
    this.action(this.name, shift);
  };

  highlight = (flag: boolean): void => {
    this.frame.classList.toggle("tcv_btn_highlight", flag);
  };
}

class ClickButton extends BaseButton {
  action: (name: string, state: boolean) => void;
  state: boolean;
  dropdown: string[] | null;
  sameGroup: ClickButton[];
  checkElems: Record<string, HTMLInputElement>;

  constructor(
    theme: string,
    svg: string,
    tooltip: string,
    action: (name: string, state: boolean) => void,
    defaultState: boolean = false,
    dropdown: string[] | null = null,
  ) {
    super(theme, svg, tooltip);
    this.action = action;
    this.state = defaultState;
    this.dropdown = dropdown;
    this.sameGroup = [];

    this.checkElems = {};
    if (dropdown != null) {
      const d = document.createElement("span");
      d.classList.add("tcv_grid-content");
      d.classList.add("tcv_dropdown-content");
      d.classList.add("tcv_round");
      for (const p of dropdown) {
        const dp = document.createElement("div");
        dp.className = "tcv_tooltip";
        dp.setAttribute("data-tooltip", `${tooltip} ${p}`);

        const checkbox = document.createElement("input");
        checkbox.className = `tcv_grid-${p} tcv_check tcv_dropdown-entry`;
        checkbox.id = `tcv_grid-${p}_${this.containerId}`;
        checkbox.type = "checkbox";
        dp.appendChild(checkbox);

        const label = document.createElement("label");
        label.htmlFor = checkbox.id;
        label.className = "tcv_label tcv_dropdown-entry";
        label.textContent = p;
        dp.appendChild(label);

        d.appendChild(dp);
        this.checkElems[p] = checkbox;
      }
      this.frame.appendChild(d);
      this.frame.classList.add("tcv_grid-dropdown");
    }
  }

  get = (): boolean => {
    return this.state;
  };

  set = (state: boolean): void => {
    this.state = state;
    this.frame.classList.toggle("tcv_btn_click2", this.state);
  };

  clearGroup = (): void => {
    for (const button of this.sameGroup) {
      if (button.state) {
        button.state = false;
        button.frame.classList.remove("tcv_btn_click2");
        button.action(this.name, false);
      }
    }
  };

  extractIdFromName = (name: string): string => {
    const match = "grid-";
    const start = name.indexOf(match) + match.length;
    const end = name.indexOf("_", start);
    const result = name.slice(start, end);
    return result;
  };

  handler = (e: Event): void => {
    if (!(e.target instanceof HTMLInputElement)) return;
    const target = e.target;
    const id = this.extractIdFromName(target.id || "");
    if (this.dropdown != null && id && this.dropdown.includes(id)) {
      const newstate = target.checked;
      this.action(`grid-${id}`, newstate);
      this.checkElems[id].checked = newstate;
    } else if (target.type === "button") {
      if (!this.state) {
        this.clearGroup();
      }
      this.set(!this.state);
      this.action(this.name, this.state);
    }
  };

  addGroupMember(button: ClickButton): void {
    this.sameGroup.push(button);
  }
}

export { Toolbar, Button, ClickButton, Ellipsis };
