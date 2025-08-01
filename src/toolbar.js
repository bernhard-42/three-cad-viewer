import { getIconBackground } from "./icons.js";

class Toolbar {
  constructor(container, id, display) {
    this.id = id;
    this.container = container;
    this.display = display;
    this.container.addEventListener("mouseleave", (e) => {
      const width = this.display.glass
        ? this.display.cadWidth
        : this.display.cadWidth + this.display.treeWidth;
      if (width < this.display.widthThreshold) {
        this.minimize();
      }
    });
    this.buttons = {};
    this.ellipses = [];
    this.toggles = { 0: [], 1: [], 2: [], 3: [] };
  }

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
    this.ellipses.push(ellipsis.html);
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
        ellipsis.classList.remove("tcv_unvisible");
      } else {
        ellipsis.classList.add("tcv_unvisible");
      }
    }
    for (var tag in toggles) {
      for (var button of toggles[tag]) {
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
}

class Ellipsis {
  constructor(id, action) {
    this.id = id;
    this.action = action;
    var html = document.createElement("span");
    html.innerHTML = "...";
    html.className = "tcv_ellipsis tcv_unvisible";
    this.html = html;
    this.html.addEventListener("mouseenter", (e) => {
      this.action(this.id);
    });
  }
}
class BaseButton {
  constructor(theme, icon, tooltip) {
    this.svg = getIconBackground(theme, icon);
    this.name = icon;

    var html = document.createElement("span");
    html.className = "tcv_tooltip";
    html.setAttribute("data-tooltip", tooltip);

    // html.appendChild(document.createElement("span"));
    // html.children[0].className = "tcv_click_btn_marker";
    var frame = html.appendChild(document.createElement("span"));
    frame.className = "tcv_button_frame";
    frame.appendChild(document.createElement("input"));
    frame.children[0].className = "tcv_reset tcv_btn";

    frame.children[0].type = "button";
    frame.children[0].style.backgroundImage = this.svg;
    this.html = html;

    this.html.addEventListener("click", (e) => {
      this.handler(e);
    });
  }

  dispose() {
    this.html = "";
    this.container.removeEventListener("click", this.handler);
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
    this.action(this.name);
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
