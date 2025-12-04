import { KeyMapper } from "./utils.js";

/**
 * Manages a collapsible toolbar with buttons and ellipsis indicators.
 */
class Toolbar {
  /**
   * Create a Toolbar instance.
   * @param {HTMLElement} container - The container element for the toolbar.
   * @param {string} id - Unique identifier for the toolbar.
   * @param {Object} options - Configuration options.
   * @param {Function} options.getVisibleWidth - Returns current visible width for collapse detection.
   * @param {Function} options.getWidthThreshold - Returns threshold below which toolbar collapses.
   * @param {Object} options.features - Feature flags for tool buttons.
   * @param {boolean} options.features.measureTools - Whether measure tools are enabled.
   * @param {boolean} options.features.selectTool - Whether select tool is enabled.
   * @param {boolean} options.features.explodeTool - Whether explode tool is enabled.
   */
  constructor(container, id, options) {
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

  _onMouseLeave = () => {
    if (this.getVisibleWidth() < this.getWidthThreshold()) {
      this.minimize();
    }
  };

  addButton(button, tag) {
    button.setId(this.id);
    this.buttons[button.name] = button;
    if (tag != -1) {
      this.toggles[tag].push(button);
    }
    this.container.appendChild(button.html);
  }

  addSeparator() {
    var html = document.createElement("span");
    html.className = "tcv_separator";
    this.container.appendChild(html);
  }

  addEllipsis(ellipsis) {
    this.container.appendChild(ellipsis.html);
    this.ellipses.push(ellipsis);
  }

  defineGroup(buttons) {
    for (var button of buttons) {
      for (var button2 of buttons) {
        if (button2 != button) {
          button.addGroupMember(button2);
        }
      }
    }
  }

  _toggle(flag, id = null) {
    var toggles, ellipses;
    if (id == null) {
      toggles = this.toggles;
      ellipses = this.ellipses;
    } else {
      toggles = {};
      toggles[id] = this.toggles[id];
      ellipses = [this.ellipses[id]];
    }
    for (var ellipsis of ellipses) {
      if (flag) {
        ellipsis.html.classList.remove("tcv_unvisible");
      } else {
        ellipsis.html.classList.add("tcv_unvisible");
      }
    }
    for (var tag in toggles) {
      for (var button of toggles[tag]) {
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

  minimize = (id = null) => {
    this._toggle(true, id);
  };

  maximize = (id = null) => {
    this._toggle(true);
    this._toggle(false, id);
  };

  dispose() {
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
  constructor(id, action) {
    this.id = id;
    this.action = action;
    var html = document.createElement("span");
    html.innerHTML = "...";
    html.className = "tcv_ellipsis tcv_unvisible";
    this.html = html;
    this.html.addEventListener("mouseenter", this._onMouseEnter);
  }

  _onMouseEnter = () => {
    this.action(this.id);
  };

  dispose() {
    this.html.removeEventListener("mouseenter", this._onMouseEnter);
  }
}
class BaseButton {
  constructor(theme, icon, tooltip) {
    this.name = icon;

    var html = document.createElement("span");
    html.className = "tcv_tooltip";
    html.setAttribute("data-tooltip", tooltip);

    var frame = html.appendChild(document.createElement("span"));
    frame.className = "tcv_button_frame";
    frame.appendChild(document.createElement("input"));
    frame.children[0].className = "tcv_reset tcv_btn";

    frame.children[0].type = "button";
    frame.children[0].classList.add(`tcv_button_${icon}`);
    this.html = html;

    this.html.addEventListener("click", this._onClick);
  }

  _onClick = (e) => {
    this.handler(e);
  };

  dispose() {
    this.html.removeEventListener("click", this._onClick);
  }

  setId(id) {
    this.containerId = id;
  }

  // eslint-disable-next-line no-unused-vars
  handler = (e) => {
    console.log("not implemented yet");
  };

  alignRight() {
    this.html.classList.add("tcv_align_right");
  }

  show(flag) {
    this.html.style.display = flag ? "inline-block" : "none";
  }
}

class Button extends BaseButton {
  constructor(theme, svg, tooltip, action) {
    super(theme, svg, tooltip);
    this.action = action;
  }

  // eslint-disable-next-line no-unused-vars
  handler = (e) => {
    this.action(this.name, KeyMapper.get(e, "shift"));
  };

  highlight = (flag) => {
    if (flag) {
      this.html.firstChild.classList.add("tcv_btn_highlight");
    } else {
      this.html.firstChild.classList.remove("tcv_btn_highlight");
    }
  };
}

class ClickButton extends BaseButton {
  constructor(
    theme,
    svg,
    tooltip,
    action,
    defaultState = false,
    dropdown = null,
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
      for (var p of dropdown) {
        const dp = document.createElement("div");
        dp.className = "tcv_tooltip";
        dp.setAttribute("data-tooltip", `${tooltip} ${p}`);
        dp.innerHTML =
          `<input class='tcv_grid-${p} tcv_check tcv_dropdown-entry' id='tcv_grid-${p}_${this.containerId}' type="checkbox">` +
          `<label for='tcv_grid-${p}_${this.containerId}' class="tcv_label tcv_dropdown-entry">${p}</label>`;
        d.appendChild(dp);
        this.checkElems[p] = dp.children[0];
      }
      this.html.children[0].appendChild(d);
      this.html.children[0].classList.add("tcv_grid-dropdown");
    }
  }
  get = () => {
    return this.state;
  };

  set = (state) => {
    this.state = state;
    this.html.children[0].classList.toggle("tcv_btn_click2", this.state);
  };

  clearGroup = () => {
    for (var button of this.sameGroup) {
      if (button.state) {
        button.state = false;
        button.html.children[0].classList.remove("tcv_btn_click2");
        button.action(this.name, false);
      }
    }
  };

  extractIdFromName = (name) => {
    const match = "grid-";
    const start = name.indexOf(match) + match.length;
    const end = name.indexOf("_", start);
    const result = name.slice(start, end);
    return result;
  };

  handler = (e) => {
    const id = this.extractIdFromName(e.target.id);
    if (this.dropdown != null && id && this.dropdown.includes(id)) {
      const newstate = e.target.checked;
      this.action(`grid-${id}`, newstate);
      this.checkElems[id].checked = newstate;
    } else if (e.target.type === "button") {
      if (!this.state) {
        this.clearGroup();
      }
      this.set(!this.state);
      this.action(this.name, this.state);
    }
  };

  addGroupMember(button) {
    this.sameGroup.push(button);
  }
}

export { Toolbar, Button, ClickButton, Ellipsis };
