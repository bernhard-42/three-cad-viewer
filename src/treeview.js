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

  constructor(states, tree, cad_handler) {
    this.states = states;
    this.tree = tree;
    this.cad_handler = cad_handler;

    this.setupClasses();
    this.treeModel = this.toModel(tree);
  }

  setupClasses() {
    var shapes = {};
    shapes[States.unselected] = "btn_light_no_shape";
    shapes[States.selected] = "btn_light_shape";
    shapes[States.mixed] = "btn_light_mix_shape";
    shapes[States.empty] = "btn_light_empty_shape";

    var meshes = {};
    meshes[States.unselected] = "btn_light_no_mesh";
    meshes[States.selected] = "btn_light_mesh";
    meshes[States.mixed] = "btn_light_mix_mesh";
    meshes[States.empty] = "btn_light_empty_mesh";

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
    var lbl = tag("span", ["tree_label"]);
    lbl.innerHTML = model.name;
    var entry = tag("span", ["node_entry"])
    if (model.type === "node") {
      var span = tag("span", ["node_entry_wrap"])
      span.appendChild(tag("span", ["t-caret", "t-caret-down"]));
      for (icon_id in this.icons) {
        img_button = tag("input", ["icon", this.getIcon(icon_id, 1)], { type: "button" })
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
      var lu = tag("ul", ["nested", "active"]);
      for (var i in model.children) {
        lu.appendChild(this.toHtml(model.children[i]));
      }
      li.appendChild(lu);

    } else {
      for (icon_id in this.icons) {
        img_button = tag("input", ["icon", this.getIcon(icon_id, model.states[icon_id])], { type: "button" });
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
    this.container = tag("ul", ["toplevel"]);
    this.container.appendChild(this.toHtml(this.treeModel));

    for (var icon_id in this.icons) {
      this.updateNodes(this.treeModel, icon_id);
    }

    var toggler = this.container.getElementsByClassName("t-caret");
    for (var i = 0; i < toggler.length; i++) {
      toggler[i].addEventListener("click", e => { // jshint ignore:line
        e.target.parentElement.parentElement.querySelector(".nested").classList.toggle("active");
        e.target.classList.toggle("t-caret-down");
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

  // updateAllStates ()  {
  //   console.log("updateAllStates")
  //   // var changes = false;
  //   for (var icon_id in this.icons) {
  //     for (var id in this.states) {
  //       var node = this.getNode(this.treeModel, id);
  //       var state = this.states[id][icon_id];
  //       if (node.states[icon_id] != state) {
  //         // changes = true;
  //         node.states[icon_id] = state;
  //         this.updateState(node, icon_id, state);
  //         this.setIcon(node.imgs[icon_id], icon_id, state);
  //         this.updateNodes(this.treeModel, icon_id);
  //       }
  //     }
  //   }
  //   this.cad_handler(this.states);
  // }

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
    var toRemove = -1;
    img.classList.forEach((value, key, listObj) => {
      if (value.startsWith("btn_")) {
        toRemove = key;
      }
      if (toRemove > 0) {
        img.classList.remove(img.classList[toRemove]);
        img.classList.add(this.getIcon(icon_id, state));
      }
    });
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