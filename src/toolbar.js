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

export { Toolbar, Button, ClickButton };

