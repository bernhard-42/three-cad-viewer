import { getIconBackground } from "./icons.js";


class Toolbar {
    constructor(container, id) {
        this.id = id;
        console.log(this.id);
        this.container = container;
        this.buttons = {};
    }

    addButton(button) {
        button.setId(this.id);
        this.buttons[button.name] = button;
        this.container.appendChild(button.html);
    }

    addSeparator() {
        var html = document.createElement("span");
        html.className = "tcv_separator";
        this.container.appendChild(html);
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
    constructor(theme, svg, tooltip, action, defaultState = false) {
        super(theme, svg, tooltip);
        this.action = action;
        this.state = defaultState;
        this.sameGroup = [];
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

    // eslint-disable-next-line no-unused-vars
    handler = (e) => {
        if (!this.state) {
            this.clearGroup();
        }
        this.set(!this.state);
        this.action(this.name, this.state);
    };

    addGroupMember(button) {
        this.sameGroup.push(button);
    }
}

class FilterByDropDownMenu {

    /**
     * Initialize a new filter drop down menu, it needs the raycast to update interactively the filter mode
     */
    constructor() {
        this.selectElement = document.getElementById("shape_filter");
        this.selectElement.addEventListener("change", this.handleSelection);
        this.selectElement.style.display = "none";
    }

    /** 
     * Set the raycaster to update the filter mode
    * @param {import ("./viewer.js").Viewer} viewer
    */
    setViewer(viewer) {
        this.viewer = viewer;
    }

    handleSelection = () => {
        this.viewer.checkChanges({ topoFilterType: this.selectElement.value });
    };

    _keybindSelect = (e) => {
        const validKeys = ["n", "v", "e", "f", "s"];
        if (validKeys.indexOf(e.key) === -1)
            return;
        if (e.key == "n")
            this.selectElement.value = "none";
        else if (e.key == "v")
            this.selectElement.value = "vertex";
        else if (e.key == "e")
            this.selectElement.value = "edge";
        else if (e.key == "f")
            this.selectElement.value = "face";
        else if (e.key == "s")
            this.selectElement.value = "solid";

        this.selectElement.dispatchEvent(new Event("change"));
    };


    /**
     * Show or hide the drop down menu
     * @param {boolean} flag 
     */
    show(flag) {
        if (flag)
            document.addEventListener("keydown", this._keybindSelect);
        else
            document.removeEventListener("keydown", this._keybindSelect);
        this._keybindSelect({ key: "n" });
        this.selectElement.style.display = flag ? "block" : "none";
    }
}

export { Toolbar, Button, ClickButton, FilterByDropDownMenu };

