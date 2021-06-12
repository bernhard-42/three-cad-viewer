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
    <input class='reset btn btn_light_reset' type="button" />
    <input class='resize btn btn_light_fit' type="button" />
    <input class='iso btn btn_light_isometric' type="button" />
    <input class='front btn btn_light_front' type="button" />
    <input class='rear btn btn_light_rear' type="button" />
    <input class='top btn btn_light_top' type="button" />
    <input class='bottom btn btn_light_bottom' type="button" />
    <input class='left btn btn_light_left' type="button" />
    <input class='right btn btn_light_right' type="button" />
    <span class="label">Transparent</span><input class='transparent check' type="checkbox" />
    <span class="label">Black edges</span><input class='black_edges check' type="checkbox" />
    </div>
    <div class="cad_body">
    <div class="cad_navigation">
        <div class="cad_tree round">
            <div class="cad_tree_container box_content mac-scrollbar"></div>
        </div>
        <div class="cad_info round mac-scrollbar">
            <div class="cad_info_container box_content mac-scrollbar"></div>
        </div>
    </div>
    <div class="cad_view">
        <div class="cad_inset"></div>
    </div>
    </div>
`;

class Display {
    constructor(container) {
        this.container = container;

        this.container.innerHTML = TEMPLATE;
        this.cadView = this.container.getElementsByClassName("cad_view")[0];
        this.cadInset = this.container.getElementsByClassName('cad_inset')[0];
        this.cadTree = this.container.getElementsByClassName('cad_tree_container')[0];
        this.cadInfo = this.container.getElementsByClassName('cad_info_container')[0];

        this.viewer = null;
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
        ["front", "rear", "top", "bottom", "left", "right", "iso"].forEach((name) => {
            this.setupClickEvent(name, this.setView);
        })
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
        this.viewer.axesHelper.setVisible(flag);
    }

    setGrid = (e) => {
        const action = e.target.className.split(" ")[0]
        this.viewer.gridHelper.setGrid(action);
    }

    setAxes0 = (e) => {
        const flag = !!e.target.checked;
        this.viewer.gridHelper.setCenter(flag);
        this.viewer.axesHelper.setCenter(flag);
    }

    setOrtho = (e) => {
        const flag = !!e.target.checked;
        this.viewer.setOrthoCamera(flag);
    }

    setTransparency = (e) => {
        const flag = !!e.target.checked;
        this.viewer.assembly.setTransparent(flag);
    }

    setBlackEdges = (e) => {
        const flag = !!e.target.checked;
        this.viewer.assembly.setBlackEdges(flag);
    }

    reset = () => {
        this.viewer.setCamera(this.viewer.bbox.center, "iso")
        this.viewer.camera.setZoom(this.viewer.zoom);
        this.viewer.camera.lookAt(this.viewer.bbox.center);
        this.viewer.controls.reset();
    }

    resize = () => {
        self.viewer.resize();
    }

    setView = (e) => {
        const btn = e.target.className.split(" ")[0];
        this.viewer.setCamera(this.viewer.bbox.center, btn);
    }
}

export { Display }