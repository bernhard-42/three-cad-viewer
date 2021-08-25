import { getIconBackground } from "./icons.js";

const TEMPLATE = `
<div class="tcv_cad_viewer">
    <div class="tcv_cad_toolbar tcv_round">
    <span class="tcv_tooltip"  data-tooltip="Show coordinate axis">
        <span class="tcv_label">Axes</span><input class='tcv_axes tcv_check' type="checkbox" />
    </span>
    <div class="tcv_grid-dropdown">
        <span class="tcv_label">Grid</span><input class='tcv_grid tcv_check' type="checkbox" />
            <span class="tcv_tooltip"  data-tooltip="Show selective grids">
            <div class="tcv_grid-content">
                <div class="tcv_label">- xy</span><input class='tcv_grid-xy tcv_check' type="checkbox"></div>
                <div class="tcv_label">- xz</span><input class='tcv_grid-xz tcv_check' type="checkbox"></div>
                <div class="tcv_label">- yz</span><input class='tcv_grid-yz tcv_check' type="checkbox"></div>
            </div>
        </span>
    </div>
    <span class="tcv_tooltip"  data-tooltip="Move center of axis and grid to (0,0,0)">
        <span class="tcv_label">@0</span><input class='tcv_axes0 tcv_check' type="checkbox" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Toggle camera between orthographic and perspective view">
        <span class="tcv_label">Ortho</span><input class='tcv_ortho tcv_check' type="checkbox" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Reset view">
        <input class='tcv_reset tcv_btn' type="button"/>
    </span>
    <span class="tcv_tooltip"  data-tooltip="Fit view">
        <input class='tcv_resize tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to iso view">
        <input class='tcv_iso tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to front view">
        <input class='tcv_front tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to back view">
        <input class='tcv_rear tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to top view">
        <input class='tcv_top tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to bottom view">
        <input class='tcv_bottom tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to left view">
        <input class='tcv_left tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Switch to right view">
        <input class='tcv_right tcv_btn' type="button" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Toggle transparent objects">
        <span class="tcv_label">Transparent</span><input class='tcv_transparent tcv_check' type="checkbox" />
    </span>
    <span class="tcv_tooltip"  data-tooltip="Toggle black edges">
        <span class="tcv_label">Black edges</span><input class='tcv_black_edges tcv_check' type="checkbox" />
    </span>
    </div>
    <div class="tcv_cad_body">
    <div class="tcv_cad_navigation">
    <div class="tcv_cad_tree tcv_round">
        <div class="tcv_tabnav">
            <input class='tcv_tab_tree tcv_tab tcv_tab-left tcv_tab-selected' value="Tree" type="button"/>
            <input class='tcv_tab_clip tcv_tab tcv_tab-right tcv_tab-unselected' value="Clipping" type="button"/>
        </div>
        <div class="tcv_box_content tcv_mac-scrollbar tcv_scroller">
            <div class="tcv_cad_tree_container"></div>
            <div class="tcv_cad_clip_container">
                <div class="tcv_slider_group">
                    <div>
                        <span class="tcv_tooltip"  data-tooltip="Set red clipping plane to view direction">
                            <input class='tcv_btn_norm_plane1 tcv_btn tcv_plane' type="button" />
                        </span>
                        <span class="tcv_lbl_norm_plane1 tcv_label">N1 = (n/a, n/a, n/a)</span>
                    </div>
                    <div>
                        <input type="range" min="1" max="100" value="50" class="tcv_sld_value_plane1 tcv_clip_slider">
                        <input value=50 class="tcv_inp_value_plane1 tcv_clip_input"></input>
                    </div>
                </div>
                <div class="tcv_slider_group">
                    <div>
                        <span class="tooltip"  data-tooltip="Set green clipping plane to view direction">
                            <input class='tcv_btn_norm_plane2 tcv_btn tcv_plane' type="button" />
                        </span>
                        <span class="tcv_lbl_norm_plane2 tcv_label">N2 = (n/a, n/a, n/a)</span>
                    </div>
                    <div>
                        <input type="range" min="1" max="100" value="50" class="tcv_sld_value_plane2 tcv_clip_slider">
                        <input value=50 class="tcv_inp_value_plane2 tcv_clip_input"></input>
                    </div>
                </div>
                <div class="tcv_slider_group">
                    <div>
                        <span class="tooltip"  data-tooltip="Set blue clipping plane to view direction">
                            <input class='tcv_btn_norm_plane3 tcv_btn tcv_plane' type="button" />
                        </span>
                        <span class="tcv_lbl_norm_plane3 tcv_label">N3 = (n/a, n/a, n/a)</span>
                    </div>
                    <div>
                        <input type="range" min="1" max="100" value="50" class="tcv_sld_value_plane3 tcv_clip_slider">
                        <input value=50 class="tcv_inp_value_plane3 tcv_clip_input"></input>
                    </div>
                </div>
                <div class="tcv_clip_checks">
                    <span class="tcv_tooltip"  data-tooltip="Use intersection clipping">
                        <span class="tcv_label">Intersection</span><input  class='tcv_clip_intersection tcv_check' type="checkbox" />
                    </span>
                    <span class="tcv_tooltip"  data-tooltip="Show clipping planes">
                        <span class="tcv_label">Planes</span><input class='tcv_clip_plane_helpers tcv_axes0 tcv_check' type="checkbox" />
                    </span>
                </div>
            </div>
        </div>
    </div>
    <div class="tcv_cad_info tcv_round">
        <div class="tcv_box_content tcv_mac-scrollbar tcv_scroller">
            <div class="tcv_cad_info_container"></div>
        </div>
    </div>
    </div>
    <div class="tcv_cad_view">
        <div class="tcv_cad_inset"></div>
        <div class="tcv_cad_animation tcv_round">
            <span class="tcv_tooltip"  data-tooltip="Play animation"><input class='tcv_play tcv_btn' type="button" /></span>
            <span class="tcv_tooltip"  data-tooltip="Pause animation"><input class='tcv_pause tcv_btn' type="button" /></span>
            <span class="tcv_tooltip"  data-tooltip="Stop and reset animation"><input class='tcv_stop tcv_btn' type="button" /></span>
        </div>
    </div>
    </div>
</div>
`;

function px(val) {
  return `${val}px`;
}

const buttons = [
  "reset",
  "resize",
  "iso",
  "front",
  "rear",
  "top",
  "bottom",
  "left",
  "right",
  "plane",
  "play",
  "pause",
  "stop"
];
class Slider {
  constructor(index, min, max, display) {
    this.index = index;
    this.display = display;

    this.slider = display.container.getElementsByClassName(
      `tcv_sld_value_plane${index}`
    )[0];
    this.slider.min = min;
    this.slider.max = max;
    this.input = display.container.getElementsByClassName(
      `tcv_inp_value_plane${index}`
    )[0];
    this.input.value = max;
    this.slider.oninput = this.sliderChange;
    this.input.addEventListener("change", this.inputChange);
  }

  _notify = (value) => {
    const change = {};
    change[`clip_slider_${this.index - 1}`] = parseFloat(value);
    this.display.viewer.checkChanges(change);
  };

  sliderChange = (e) => {
    const value = e.target.value;
    this.input.value = Math.round(1000 * value) / 1000;
    this.display.refreshPlane(this.index, this.input.value);
    this._notify(value);
  };

  inputChange = (e) => {
    const value = Math.max(
      Math.min(e.target.value, this.slider.max),
      this.slider.min
    );
    // if (value != e.target.value) {
    //     this.input.value = Math.round(1000 * value) / 1000;
    // }
    this.slider.value = value;
    this.display.refreshPlane(this.index, this.input.value);
    this._notify(value);
  };

  setSlider(limit) {
    const exp = Math.abs(Math.round(Math.log10(2 * limit)));
    this.slider.min = -limit;
    this.slider.max = limit;
    this.slider.step = Math.pow(10, -(3 - exp));
    this.slider.value = limit;
    this.input.value = Math.round(1000 * this.slider.max) / 1000;
    this.display.refreshPlane(this.index, this.input.value);
  }
}

class Display {
  constructor(container, options) {
    this.container = container;

    this.container.innerHTML = TEMPLATE;
    this.cadTool = this.container.getElementsByClassName("tcv_cad_toolbar")[0];
    this.cadView = this.container.getElementsByClassName("tcv_cad_view")[0];
    this.cadInset = this.container.getElementsByClassName("tcv_cad_inset")[0];
    this.cadTree = this.container.getElementsByClassName(
      "tcv_cad_tree_container"
    )[0];
    this.cadClip = this.container.getElementsByClassName(
      "tcv_cad_clip_container"
    )[0];
    this.tabTree = this.container.getElementsByClassName("tcv_tab_tree")[0];
    this.tabClip = this.container.getElementsByClassName("tcv_tab_clip")[0];
    this.cadInfo = this.container.getElementsByClassName(
      "tcv_cad_info_container"
    )[0];
    this.cadAnim =
      this.container.getElementsByClassName("tcv_cad_animation")[0];

    this.planeLabels = [];
    for (var i = 1; i < 4; i++) {
      this.planeLabels.push(
        this.container.getElementsByClassName(`tcv_lbl_norm_plane${i}`)[0]
      );
    }

    this.viewer = null;

    this.cadWidth = options.cadWidth;
    this.height = options.height;
    this.treeWidth = options.treeWidth;
    this.setSizes(options);

    this.activeTab = "tab_tree";
    this.cadTree.style.display = "block";
    this.cadClip.style.display = "none";
    this.clipSliders = null;

    if (options.theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }

    for (var btn of buttons) {
      var elements = this.container.getElementsByClassName(`tcv_${btn}`);
      for (i = 0; i < elements.length; i++) {
        var el = elements[i];
        el.setAttribute(
          "style",
          `background-image: ${getIconBackground(options.theme, btn)}`
        );
      }
    }
  }

  setSizes(options) {
    if (options.cadWidth) {
      this.cadWidth = options.cadWidth;
      this.cadView.style.width = px(options.cadWidth);
    }
    if (options.height) {
      this.height = options.height;
      this.cadView.style.height = px(options.height);
    }
    if (options.treeWidth) {
      this.treeWidth = options.treeWidth;
      this.cadTree.parentElement.parentElement.style.width = px(
        options.treeWidth
      );
      this.cadInfo.parentElement.parentElement.style.width = px(
        options.treeWidth
      );
    }
    const treeHeight = Math.round((this.height * 2) / 3);
    this.cadTree.parentElement.parentElement.style.height = px(treeHeight);
    this.cadInfo.parentElement.parentElement.style.height = px(
      this.height - treeHeight - 4
    );
    this.cadTool.style.width = px(this.treeWidth + this.cadWidth);
  }

  setupCheckEvent(name, fn, flag) {
    const el = this.getElement(name);
    el.addEventListener("change", fn);
    if (flag != undefined) {
      el.checked = flag;
    }
  }

  // eslint-disable-next-line no-unused-vars
  setupClickEvent(name, fn, flag) {
    const el = this.getElement(name);
    el.addEventListener("click", fn);
  }

  getElement(name) {
    return this.container.getElementsByClassName(name)[0];
  }

  checkElement(name, flag) {
    this.getElement(name).checked = flag;
  }

  setupUI(viewer) {
    this.viewer = viewer;

    this.setupCheckEvent("tcv_axes", this.setAxes, viewer.axes);
    this.setupCheckEvent("tcv_grid", this.setGrid, viewer.grid);
    this.setupCheckEvent("tcv_grid-xy", this.setGrid, viewer.grid);
    this.setupCheckEvent("tcv_grid-xz", this.setGrid, viewer.grid);
    this.setupCheckEvent("tcv_grid-yz", this.setGrid, viewer.grid);
    this.setupCheckEvent("tcv_axes0", this.setAxes0, viewer.axes0);
    this.setupCheckEvent("tcv_ortho", this.setOrtho, viewer.ortho);
    this.setupCheckEvent(
      "tcv_transparent",
      this.setTransparent,
      viewer.transparent
    );
    this.setupCheckEvent(
      "tcv_black_edges",
      this.setBlackEdges,
      viewer.black_edges
    );

    this.setupClickEvent("tcv_reset", this.reset);
    this.setupClickEvent("tcv_resize", this.resize);

    const buttons = [
      "tcv_front",
      "tcv_rear",
      "tcv_top",
      "tcv_bottom",
      "tcv_left",
      "tcv_right",
      "tcv_iso"
    ];
    buttons.forEach((name) => {
      this.setupClickEvent(name, this.setView);
    });

    const tabs = ["tcv_tab_tree", "tcv_tab_clip"];
    tabs.forEach((name) => {
      this.setupClickEvent(name, this.selectTab);
    });

    this.clipSliders = [];
    for (var i = 1; i < 4; i++) {
      this.clipSliders.push(new Slider(i, 0, 100, this));
    }

    this.setupCheckEvent(
      "tcv_clip_plane_helpers",
      this.setClipPlaneHelpers,
      false
    );
    this.setupCheckEvent(
      "tcv_clip_intersection",
      this.setClipIntersection,
      false
    );

    for (i = 1; i < 4; i++) {
      this.setupClickEvent(`tcv_btn_norm_plane${i}`, this.setClipNormal, false);
    }

    this.setupClickEvent("tcv_play", this.controlAnimation, false);
    this.setupClickEvent("tcv_pause", this.controlAnimation, false);
    this.setupClickEvent("tcv_stop", this.controlAnimation, false);
    this.setAnimationControl(false);
  }

  // setup functions

  addCadView(cadView) {
    this.cadView.appendChild(cadView);
  }

  addCadInset(cadInset) {
    this.cadInset.appendChild(cadInset);
  }

  addCadTree(cadTree) {
    this.cadTree.appendChild(cadTree);
  }

  // handler (bound to Display instance)

  setAxes = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setAxes(flag);
  };

  setAxesCheck = (flag) => {
    this.checkElement("tcv_axes", flag);
  };

  setGrid = (e) => {
    const action = e.target.className.split(" ")[0].slice(4);
    this.viewer.setGrid(action);
  };

  setGridCheck = (flag) => {
    this.checkElement("tcv_grid", flag);
  };

  setAxes0 = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setAxes0(flag);
  };

  setAxes0Check = (flag) => {
    this.checkElement("tcv_axes0", flag);
  };

  setOrtho = (e) => {
    const flag = !!e.target.checked;
    this.viewer.switchCamera(flag);
  };

  setOrthoCheck = (flag) => {
    this.checkElement("tcv_ortho", flag);
  };

  setTransparent = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setTransparent(flag);
  };

  setTransparentCheck = (flag) => {
    this.checkElement("tcv_transparent", flag);
  };

  setBlackEdges = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setBlackEdges(flag);
  };

  setBlackEdgesCheck = (flag) => {
    this.checkElement("tcv_black_edges", flag);
  };

  setClipPlaneHelpers = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setClipPlaneHelpers(flag);
  };

  setClipPlaneHelpersCheck = (flag) => {
    this.checkElement("tcv_clip_plane_helpers", flag);
  };

  setTools = (flag) => {
    var tb = this.getElement("tcv_cad_toolbar");
    var cn = this.getElement("tcv_cad_navigation");
    for (var el of [cn, tb]) {
      if (flag) {
        el.style.height = "36px";
        el.style.display = "block";
      } else {
        el.style.height = "0px";
        el.style.display = "none";
      }
    }
  };

  setClipIntersection = (e) => {
    const flag = !!e.target.checked;
    this.viewer.setClipIntersection(flag);
  };

  setClipIntersectionCheck = (flag) => {
    const el = this.getElement("tcv_clip_intersection");
    el.checked = flag;
  };

  reset = () => {
    this.viewer.reset();
  };

  resize = () => {
    this.viewer.resize();
  };

  setView = (e) => {
    const btn = e.target.className.split(" ")[0].slice(4);
    this.viewer.presetCamera(btn);
  };

  setNormalLabel = (index, normal) => {
    this.planeLabels[index].innerHTML = `N=(${normal[0].toFixed(
      2
    )}, ${normal[1].toFixed(2)}, ${normal[2].toFixed(2)})`;
  };

  setClipNormal = (e) => {
    const index = parseInt(e.target.classList[0].slice(-1));
    this.viewer.setClipNormal(index - 1);
  };

  selectTab = (e) => {
    const tab = e.target.className.split(" ")[0];
    this.selectTabByName(tab.slice(8));
  };

  selectTabByName(tab) {
    var changed = false;
    if (tab === "tree" && this.activeTab !== "tree") {
      this.cadTree.style.display = "block";
      this.cadClip.style.display = "none";
      this.viewer.nestedGroup.setBackVisible(false);
      this.viewer.setLocalClipping(false);
      changed = true;
    }
    if (tab === "clip" && this.activeTab !== "clip") {
      this.cadTree.style.display = "none";
      this.cadClip.style.display = "block";
      this.viewer.nestedGroup.setBackVisible(true);
      this.viewer.setLocalClipping(true);
      changed = true;
    }
    this.activeTab = tab;
    this.viewer.checkChanges({ tab: tab });
    if (changed) {
      this.tabTree.classList.toggle("tcv_tab-selected");
      this.tabTree.classList.toggle("tcv_tab-unselected");
      this.tabClip.classList.toggle("tcv_tab-selected");
      this.tabClip.classList.toggle("tcv_tab-unselected");
    }
  }

  setSliders(limit) {
    for (var i = 0; i < 3; i++) {
      this.clipSliders[i].setSlider(limit);
    }
  }

  refreshPlane(index, value) {
    this.viewer.refreshPlane(index - 1, parseFloat(value));
  }

  setAnimationControl = (flag) => {
    this.cadAnim.style.display = flag ? "block" : "none";
  };

  controlAnimation = (e) => {
    const btn = e.target.className.split(" ")[0].slice(4);
    this.viewer.controlAnimation(btn);
  };
}

export { Display };
