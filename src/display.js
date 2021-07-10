const cssGlobal = require('../css/global.css').toString();
const cssUi = require('../css/ui.css').toString();

function getIconBackground(theme, name) {
    const icon = require(`../icons/${theme}/${name}.svg`);
    return `url(data:image/svg+xml;utf8,${escape(icon)});`;
}

const TEMPLATE = `
    <div class="cad_toolbar round">
    <span class="label">Axes</span><input class='axes check' type="checkbox" />
    <div class="grid-dropdown">
        <span class="label">Grid</span><input class='grid check' type="checkbox" />
        <div class="grid-content">
            <div class="label">- xy</span><input class='grid-xy check' type="checkbox"></div>
            <div class="label">- xz</span><input class='grid-xz check' type="checkbox"></div>
            <div class="label">- yz</span><input class='grid-yz check' type="checkbox"></div>
        </div>
    </div>
    <span class="label">@0</span><input class='axes0 check' type="checkbox" />
    <span class="label">Ortho</span><input class='ortho check' type="checkbox" />
    <input class='reset btn' type="button" />
    <input class='resize btn' type="button" />
    <input class='iso btn' type="button" />
    <input class='front btn' type="button" />
    <input class='rear btn' type="button" />
    <input class='top btn' type="button" />
    <input class='bottom btn' type="button" />
    <input class='left btn' type="button" />
    <input class='right btn' type="button" />
    <span class="label">Transparent</span><input class='transparent check' type="checkbox" />
    <span class="label">Black edges</span><input class='black_edges check' type="checkbox" />
    </div>
    <div class="cad_body">
    <div class="cad_navigation">
    <div class="cad_tree round">
        <div class="tabnav">
            <input class='tab_tree tab tab-left tab-selected' value="Tree" type="button"/>
            <input class='tab_clip tab tab-right tab-unselected' value="Clipping" type="button"/>
        </div>
        <div class="box_content mac-scrollbar scroller">
            <div class="cad_tree_container"></div>
            <div class="cad_clip_container">
                <div class="slider_group">
                    <div>
                        <input class='btn_norm_plane1 btn plane' type="button" />
                        <span class="lbl_norm_plane1 label">N1 = (n/a, n/a, n/a)</span>
                    </div>
                    <div>
                        <input type="range" min="1" max="100" value="50" class="sld_value_plane1 clip_slider">
                        <input value=50 class="inp_value_plane1 clip_input"></input>
                    </div>
                </div>
                <div class="slider_group">
                    <div>
                        <input class='btn_norm_plane2 btn plane' type="button" />
                        <span class="lbl_norm_plane2 label">N2 = (n/a, n/a, n/a)</span>
                    </div>
                    <div>
                        <input type="range" min="1" max="100" value="50" class="sld_value_plane2 clip_slider">
                        <input value=50 class="inp_value_plane2 clip_input"></input>
                    </div>
                </div>
                <div class="slider_group">
                    <div>
                    <input class='btn_norm_plane3 btn plane' type="button" />
                    <span class="lbl_norm_plane3 label">N3 = (n/a, n/a, n/a)</span>
                    </div>
                    <div>
                        <input type="range" min="1" max="100" value="50" class="sld_value_plane3 clip_slider">
                        <input value=50 class="inp_value_plane3 clip_input"></input>
                    </div>
                </div>
                <div class="clip_checks">
                    <span class="label">Intersection</span><input  class='clip_intersection check' type="checkbox" />
                    <span class="label">Planes</span><input class='clip_plane_helpers axes0 check' type="checkbox" />
                </div>
            </div>
        </div>
    </div>
    <div class="cad_info round">
        <div class="box_content mac-scrollbar scroller">
            <div class="cad_info_container"></div>
        </div>
    </div>
    </div>
    <div class="cad_view">
        <div class="cad_inset"></div>
        <div class="cad_animation round">
            <input class='play btn' type="button" />
            <input class='pause btn' type="button" />
            <input class='stop btn' type="button" />
        </div>
    </div>
    </div>
`;

function px(val) {
    return `${val}px`;
}

const buttons = [
    "reset", "resize", "iso", "front", "rear", "top", "bottom", "left", "right",
    "plane", "play", "pause", "stop",
];
class Slider {
    constructor(index, min, max, display) {
        this.index = index;
        this.display = display;

        this.slider = display.container.getElementsByClassName(`sld_value_plane${index}`)[0];
        this.slider.min = min;
        this.slider.max = max;
        this.input = display.container.getElementsByClassName(`inp_value_plane${index}`)[0];
        this.input.value = max;
        this.slider.oninput = this.sliderChange;
        this.input.addEventListener('change', this.inputChange);
    }

    sliderChange = (e) => {
        const value = e.target.value;
        this.input.value = Math.round(1000 * value) / 1000;
        this.display.refreshPlane(this.index, this.input.value);
    }

    inputChange = (e) => {
        const value = Math.max(Math.min(e.target.value, this.slider.max), this.slider.min);
        if (value != e.target.value) {
            this.input.value = Math.round(1000 * value) / 1000;
        }
        this.slider.value = value;
        this.display.refreshPlane(this.index, this.input.value);
    }

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
    constructor(container, theme) {
        this.container = container;

        this.container.innerHTML = TEMPLATE;
        this.cadTool = this.container.getElementsByClassName("cad_toolbar")[0];
        this.cadView = this.container.getElementsByClassName("cad_view")[0];
        this.cadInset = this.container.getElementsByClassName('cad_inset')[0];
        this.cadTree = this.container.getElementsByClassName('cad_tree_container')[0];
        this.cadClip = this.container.getElementsByClassName('cad_clip_container')[0];
        this.tabTree = this.container.getElementsByClassName('tab_tree')[0];
        this.tabClip = this.container.getElementsByClassName('tab_clip')[0];
        this.cadInfo = this.container.getElementsByClassName('cad_info_container')[0];
        this.cadAnim = this.container.getElementsByClassName('cad_animation')[0];

        this.planeLabels = []
        for (var i = 1; i < 4; i++) {
            this.planeLabels.push(
                this.container.getElementsByClassName(`lbl_norm_plane${i}`)[0]
            )
        }

        this.viewer = null;

        this.cadWidth = 600;
        this.height = 400;
        this.treeWidth = 240;

        this.activeTab = "tab_tree";
        this.cadTree.style.display = "block";
        this.cadClip.style.display = "none";
        this.clipSliders = null;

        if (theme === "dark") {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
        for (var btn of buttons) {
            var elements = this.container.getElementsByClassName(btn);
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                el.setAttribute("style", `background-image: ${getIconBackground(theme, btn)}`);
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
            this.cadTree.parentElement.parentElement.style.width = px(options.treeWidth);
            this.cadInfo.parentElement.parentElement.style.width = px(options.treeWidth);
        }
        const treeHeight = Math.round(this.height * 2 / 3);
        this.cadTree.parentElement.parentElement.style.height = px(treeHeight);
        this.cadInfo.parentElement.parentElement.style.height = px(this.height - treeHeight - 4);
        this.cadTool.style.width = px(this.treeWidth + this.cadWidth);
    }

    setupCheckEvent(name, fn, flag) {
        const el = this.getElement(name);
        el.addEventListener('change', fn);
        if (flag != undefined) {
            el.checked = flag;
        }
    }

    setupClickEvent(name, fn, flag) {
        const el = this.getElement(name);
        el.addEventListener('click', fn);
    }

    getElement(name) {
        return this.container.getElementsByClassName(name)[0];
    }

    checkElement(name, flag) {
        this.getElement(name).checked = flag;
    }

    setupUI(viewer) {
        this.viewer = viewer;

        this.setupCheckEvent('axes', this.setAxes, viewer.axes);
        this.setupCheckEvent('grid', this.setGrid, viewer.grid);
        this.setupCheckEvent('grid-xy', this.setGrid, viewer.grid);
        this.setupCheckEvent('grid-xz', this.setGrid, viewer.grid);
        this.setupCheckEvent('grid-yz', this.setGrid, viewer.grid);
        this.setupCheckEvent('axes0', this.setAxes0, viewer.axes0);
        this.setupCheckEvent('ortho', this.setOrtho, viewer.ortho);
        this.setupCheckEvent('transparent', this.setTransparency, viewer.transparent);
        this.setupCheckEvent('black_edges', this.setBlackEdges, viewer.black_edges);

        this.setupClickEvent('reset', this.reset);
        this.setupClickEvent('resize', this.resize);

        const buttons = ["front", "rear", "top", "bottom", "left", "right", "iso"];
        buttons.forEach((name) => {
            this.setupClickEvent(name, this.setView);
        })

        const tabs = ["tab_tree", "tab_clip"];
        tabs.forEach((name) => {
            this.setupClickEvent(name, this.selectTab);
        })

        this.clipSliders = [];
        for (var i = 1; i < 4; i++) {
            this.clipSliders.push(new Slider(i, 0, 100, this));
        }

        this.setupCheckEvent('clip_plane_helpers', this.setClipPlaneHelpers, false);
        this.setupCheckEvent('clip_intersection', this.setClipIntersection, false);

        for (var i = 1; i < 4; i++) {
            this.setupClickEvent(`btn_norm_plane${i}`, this.setClipNormal, false);
        }

        this.setupClickEvent("play", this.controlAnimation, false);
        this.setupClickEvent("pause", this.controlAnimation, false);
        this.setupClickEvent("stop", this.controlAnimation, false);
        this.setAnimationControl(false);
    }

    // setup functions

    getCadViewSize() {
        return [this.cadView.clientWidth, this.cadView.clientHeight];
    }

    getCadInsetSize() {
        return [this.cadInset.clientWidth, this.cadInset.clientHeight];
    }

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
    }

    setGrid = (e) => {
        const action = e.target.className.split(" ")[0]
        this.viewer.setGrid(action);
    }

    setAxes0 = (e) => {
        const flag = !!e.target.checked;
        this.viewer.setAxes0(flag);
    }

    setOrtho = (e) => {
        const flag = !!e.target.checked;
        this.viewer.switchCamera(flag);
    }

    setTransparency = (e) => {
        const flag = !!e.target.checked;
        this.viewer.setTransparent(flag);
    }

    setBlackEdges = (e) => {
        const flag = !!e.target.checked;
        this.viewer.setBlackEdges(flag);
    }

    setClipPlaneHelpers = (e) => {
        const flag = !!e.target.checked;
        this.viewer.setPlaneHelpers(flag);
    }

    setClipIntersection = (e) => {
        const flag = !!e.target.checked;
        this.viewer.setClipIntersection(flag);
    }

    reset = () => {
        this.viewer.reset();
    }

    resize = () => {
        self.viewer.resize();
    }

    setView = (e) => {
        const btn = e.target.className.split(" ")[0];
        this.viewer.setCamera(btn);
    }

    setNormalLabel = (index, normal) => {
        this.planeLabels[index].innerHTML = `N=(${normal[0].toFixed(2)}, ${normal[1].toFixed(2)}, ${normal[2].toFixed(2)})`
    }

    setClipNormal = (e) => {
        const index = parseInt(e.target.classList[0].slice(-1));
        this.viewer.setClipNormal(index - 1);
    }

    selectTab = (e) => {
        const tab = e.target.className.split(" ")[0];
        var changed = false;
        if ((tab === "tab_tree") && (this.activeTab !== "tab_tree")) {
            this.cadTree.style.display = "block";
            this.cadClip.style.display = "none";
            this.viewer.nestedGroup.setBackVisible(false);
            this.viewer.setLocalClipping(false);
            changed = true;
        };
        if ((tab === "tab_clip") && (this.activeTab !== "tab_clip")) {
            this.cadTree.style.display = "none";
            this.cadClip.style.display = "block";
            this.viewer.nestedGroup.setBackVisible(true);
            this.viewer.setLocalClipping(true);
            changed = true;
        }
        this.activeTab = tab;
        if (changed) {
            this.tabTree.classList.toggle("tab-selected");
            this.tabTree.classList.toggle("tab-unselected");
            this.tabClip.classList.toggle("tab-selected");
            this.tabClip.classList.toggle("tab-unselected");
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
    }

    controlAnimation = (e) => {
        const btn = e.target.className.split(" ")[0];
        this.viewer.controlAnimation(btn);
    }

}

export { Display }