import { getIconBackground } from './icons.js'

// Some helpers

function tag(name, classList, options) {
  var el = document.createElement(name);
  if (typeof (classList) != "undefined") {
    for (var i in classList) {
      el.classList.add(classList[i]);
    }
  }
  if (typeof (options) != "undefined") {
    for (var t in options) {
      el[t] = options[t];
    }
  }
  return el;
};

const States = {
  unselected: 0,
  selected: 1,
  mixed: 2,
  empty: 3
};


class TreeView {

  constructor(states, tree, cad_handler, theme) {
    this.states = states;
    this.tree = tree;
    this.cad_handler = cad_handler;
    this.theme = theme;

    this.setupIcons(theme);
    this.treeModel = this.toModel(tree);
  }

  setupIcons(theme) {
    var shapes = {};
    shapes[States.unselected] = getIconBackground(theme, "shape_no");
    shapes[States.selected] = getIconBackground(theme, "shape");
    shapes[States.mixed] = getIconBackground(theme, "shape_mix");
    shapes[States.empty] = getIconBackground(theme, "shape_empty");

    var meshes = {};
    meshes[States.unselected] = getIconBackground(theme, "mesh_no");
    meshes[States.selected] = getIconBackground(theme, "mesh");
    meshes[States.mixed] = getIconBackground(theme, "mesh_mix");
    meshes[States.empty] = getIconBackground(theme, "mesh_empty");

    this.icons = [shapes, meshes];
  }

  toModel(tree) {
    var model = {
      id: tree.id,
      type: tree.type,
      name: tree.name,
      color: tree.color,
      imgs: [],
      states: []
    };
    var i = 0;

    if (tree.type === "node") {
      for (i in this.icons) {
        model.states.push(States.selected);
      }
      model.children = [];
      for (i in tree.children) {
        model.children.push(this.toModel(tree.children[i]));
      }
    } else if (tree.type === "leaf") {
      var state = this.states[tree.id];
      for (i in this.icons) {
        model.states.push(state[i]);
      }
    } else {
      console.error(`Error, unknown type '${tree.type}'`);
    }
    return model;
  }

  toHtml(model) {
    var icon_id = 0;
    var img_button;

    var li = tag("li");
    var lbl = tag("span", ["tcv_tree_label"]);
    lbl.innerHTML = model.name;
    var entry = tag("span", ["tcv_node_entry"])
    if (model.type === "node") {
      var span = tag("span", ["tcv_node_entry_wrap"])
      span.appendChild(tag("span", ["tcv_t-caret", "tcv_t-caret-down"]));
      for (icon_id in this.icons) {
        img_button = tag("input", ["tcv_icon"], {
          type: "button",
          style: `background-image: ${this.getIcon(icon_id, 1)}`
        });
        img_button.setAttribute("icon_id", icon_id);
        img_button.addEventListener("click", e => { // jshint ignore:line
          this.handle(model.type, model.id, e.srcElement.getAttribute("icon_id"));
        });
        entry.appendChild(img_button);
        model.imgs.push(img_button);
      }
      entry.appendChild(lbl);
      span.appendChild(entry);
      li.append(span);
      var lu = tag("ul", ["tcv_nested", "tcv_active"]);
      for (var i in model.children) {
        lu.appendChild(this.toHtml(model.children[i]));
      }
      li.appendChild(lu);

    } else {
      for (icon_id in this.icons) {
        img_button = tag("input", ["tcv_icon"], {
          type: "button",
          style: `background-image: ${this.getIcon(icon_id, model.states[icon_id])}`
        });
        img_button.setAttribute("icon_id", icon_id);
        if (icon_id == 0) {
          img_button.classList.add("indent");
        }
        if (model.states[icon_id] != States.empty) { // no events on empty icon
          img_button.addEventListener("click", e => { // jshint ignore:line
            this.handle(model.type, model.id, e.srcElement.getAttribute("icon_id"));
          });
        }
        entry.appendChild(img_button);
        model.imgs.push(img_button);
      }
      entry.appendChild(lbl);
      li.appendChild(entry);
    }
    return li;
  }

  render() {
    this.container = tag("ul", ["tcv_toplevel"]);
    this.container.appendChild(this.toHtml(this.treeModel));

    for (var icon_id in this.icons) {
      this.updateNodes(this.treeModel, icon_id);
    }

    var toggler = this.container.getElementsByClassName("tcv_t-caret");
    for (var i = 0; i < toggler.length; i++) {
      toggler[i].addEventListener("click", e => { // jshint ignore:line
        e.target.parentElement.parentElement.querySelector(".nested").classList.toggle("tcv_active");
        e.target.classList.toggle("tcv_t-caret-down");
      });
    }
    return this.container;
  }

  getNode(node, id) {
    if (node.id == id) return node;
    for (var i in node.children) {
      var result = this.getNode(node.children[i], id);
      if (result != null) return result;
    }
    return null;
  }

  updateState(node, icon_id, state) {
    if (node.states[icon_id] != States.empty) { // ignore empty
      this.states[node.id][icon_id] = state;
      node.states[icon_id] = state;
      this.setIcon(node.imgs[icon_id], icon_id, state);
    }
  }

  propagateChange(node, icon_id, state) {
    for (var i in node.children) {
      var subNode = node.children[i];
      if (subNode.type == "leaf") {
        this.updateState(subNode, icon_id, state);
      } else {
        this.propagateChange(subNode, icon_id, state);
      }
    }
  }

  updateNodes(model, icon_id) {
    var state = 0;
    if (model.type === "node") {
      var states = [];
      for (var i in model.children) {
        states.push(this.updateNodes(model.children[i], icon_id));
      }
      var filtered_states = states.filter(e => e != 3)
      if (filtered_states.length == 0) {
        state = 3;
      } else {
        state = filtered_states.reduce((s1, s2) => (s1 == s2) ? s1 : States.mixed,
          filtered_states[0]);
      }
      model.states[icon_id] = state;
      this.setIcon(model.imgs[icon_id], icon_id, state);
    } else {
      state = model.states[icon_id];
    }
    return state;
  }

  getIcon(icon_id, state) {
    return this.icons[icon_id][state];
  }

  setIcon(img, icon_id, state) {
    img.setAttribute("style", `background-image: ${this.getIcon(icon_id, state)}`);
  }

  handle(type, id, icon_id) {
    var node = this.getNode(this.treeModel, id);
    var newState = (node.states[icon_id] == States.selected) ? States.unselected : States.selected;
    if (type == "leaf") {
      this.updateState(node, icon_id, newState);
      this.updateNodes(this.treeModel, icon_id);
      this.cad_handler(this.states);
    } else if (type == "node") {
      this.propagateChange(node, icon_id, newState);
      this.updateNodes(this.treeModel, icon_id);
      this.cad_handler(this.states);
    } else {
      console.error(`Error, unknown type '${type}'`);
    }
  }
}

export { TreeView };