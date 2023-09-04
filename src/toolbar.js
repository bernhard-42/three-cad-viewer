import { getIconBackground } from "./icons.js";


class Toolbar {
    constructor(containerName) {
        this.id = containerName;
        this.container = document
            .getElementById(containerName)
            .getElementsByClassName("tcv_cad_toolbar")[0];
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
    constructor(icon, tooltip) {
        this.svg = getIconBackground(icon);
        this.name = icon;

        var html = document.createElement("span");
        html.className = "tcv_tooltip";
        html.setAttribute("data-tooltip", tooltip);

        html.appendChild(document.createElement("span"));
        html.children[0].className = "tcv_click_btn_marker";

        html.appendChild(document.createElement("input"));
        html.children[1].className = "tcv_reset tcv_btn";

        html.children[1].type = "button";
        html.children[1].style.backgroundImage = getIconBackground(icon);
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

    handler = (e) => {
        console.log("not implemented yet");
    };
}

class Button extends BaseButton {
    constructor(svg, tooltip, action) {
        super(svg, tooltip);
        this.action = action;
    }

    handler = (e) => {
        this.action(this, e.button);
    };
}

class ClickButton extends BaseButton {
    constructor(svg, tooltip, action, defaultState = false) {
        super(svg, tooltip);
        this.action = action;
        this.default = defaultState;
        this.sameGroup = [];
    }

    handler = (e) => {
        if (!this.default) {
            for (var button of this.sameGroup) {
                if (button.default) {
                    button.default = false;
                    button.html.children[0].classList.remove("tcv_btn_click");
                    button.action(button, e.button, false);
                }
            }
        }
        this.default = !this.default;
        this.html.children[0].classList.toggle("tcv_btn_click", this.default);
        this.action(this, e.button, this.default);
    };

    addGroupMember(button) {
        this.sameGroup.push(button);
    }
}

export { Toolbar, Button, ClickButton };


// function resetHandler(button, mouseButton) {
//     console.log("reset", button.containerId, mouseButton);
// }

// function resizeHandler(button, mouseButton, state) {
//     console.log("resize", button.containerId, mouseButton, state);
// }

// function isoHandler(button, mouseButton, state) {
//     console.log("iso", button.containerId, mouseButton, state);
// }

// function init() {
//     console.log("init");
//     document.documentElement.setAttribute("data-theme", "light");

//     var toolbar = new Toolbar("cad01");

//     const resetBtn = new Button("reset", "Reset View", resetHandler);
//     toolbar.addButton(resetBtn);

//     toolbar.addSeparator();

//     const resizeBtn = new ClickButton("resize", "Resize View", resizeHandler);
//     toolbar.addButton(resizeBtn);

//     const isoBtn = new ClickButton("iso", "Iso View", isoHandler);
//     toolbar.addButton(isoBtn);

//     var toolbar2 = new Toolbar("cad02");

//     const resetBtn2 = new Button("reset", "Reset View", resetHandler);
//     toolbar2.addButton(resetBtn2);

//     toolbar2.addSeparator();

//     const resizeBtn2 = new ClickButton("resize", "Resize View", resizeHandler);
//     toolbar2.addButton(resizeBtn2);

//     const isoBtn2 = new ClickButton("iso", "Iso View", isoHandler);
//     toolbar2.addButton(isoBtn2);

//     toolbar2.addSeparator();

//     toolbar2.defineGroup([resizeBtn2, isoBtn2]);

//     console.log(toolbar);
//     console.log(toolbar2);
// }
