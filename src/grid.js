import * as THREE from 'three';

class Grid {
    constructor(bbox, ticks, axes0) {
        if (ticks === undefined) {
            ticks = 10;
        }

        this.grid = [false, false, false];
        this.allGrid = false;

        document.querySelector('.grid').addEventListener('change', this.setGrid);
        document.querySelector('.grid-xy').addEventListener('change', this.setGrid);
        document.querySelector('.grid-xz').addEventListener('change', this.setGrid);
        document.querySelector('.grid-yz').addEventListener('change', this.setGrid);

        var maxs = [
            Math.max(...[Math.abs(bbox.xmin), Math.abs(bbox.xmax), Math.abs(bbox.ymin), Math.abs(bbox.ymax)]),
            Math.max(...[Math.abs(bbox.xmin), Math.abs(bbox.xmax), Math.abs(bbox.zmin), Math.abs(bbox.zmax)]),
            Math.max(...[Math.abs(bbox.ymin), Math.abs(bbox.ymax), Math.abs(bbox.zmin), Math.abs(bbox.zmax)])
        ]

        this.gridHelper = [];
        for (var i = 0; i < 3; i++) {
            var [axisStart, axisEnd, niceTick] = this.niceBounds(-maxs[i], maxs[i], 2 * ticks);
            var size = axisEnd - axisStart
            this.gridHelper.push(
                new THREE.GridHelper(size, size / niceTick, 0x080808, 0xa0a0a0),
            )
            if (axes0 === undefined) {
                this.gridHelper[i].position.set(...bbox.center);
            } else {
                this.gridHelper[i].position.set(0, 0, 0);
            }
        }

        this.gridHelper[0].rotateX(Math.PI / 2);
        this.gridHelper[1].rotateY(Math.PI / 2);
        this.gridHelper[2].rotateZ(Math.PI / 2);

        this.setVisible();
    }


    // https://stackoverflow.com/questions/4947682/intelligently-calculating-chart-tick-positions
    niceNumber = (value, round) => {
        var exponent = Math.floor(Math.log10(value));
        var fraction = value / 10 ** exponent;

        var niceFraction;

        if (round) {
            if (fraction < 1.5) {
                niceFraction = 1.0;
            } else if (fraction < 3.0) {
                niceFraction = 2.0;
            } else if (fraction < 7.0) {
                niceFraction = 5.0;
            } else {
                niceFraction = 10.0;
            }
        } else {
            if (fraction <= 1) {
                niceFraction = 1.0;
            } else if (fraction <= 2) {
                niceFraction = 2.0;
            } else if (fraction <= 5) {
                niceFraction = 5.0;
            } else {
                niceFraction = 10.0;
            }
        }
        return niceFraction * 10 ** exponent;
    }

    niceBounds = (axisStart, axisEnd, numTicks) => {
        var niceTick;
        var niceRange;

        if (!numTicks) {
            numTicks = 10;
        }

        var axisWidth = axisEnd - axisStart

        if (axisWidth == 0) {
            niceTick = 0;
        } else {
            niceRange = this.niceNumber(axisWidth);
            niceTick = this.niceNumber(niceRange / (numTicks - 1), true);
            axisStart = Math.floor(axisStart / niceTick) * niceTick;
            axisEnd = Math.ceil(axisEnd / niceTick) * niceTick;
        }
        return [axisStart, axisEnd, niceTick];
    }

    computeGrid = () => {
        return (this.grid[0] | this.grid[1] | this.grid[2])
    }

    setGrid = (e) => {
        switch (e.target.className.split(" ")[0]) {
            case "grid":
                this.allGrid = !this.allGrid;
                this.grid[0] = this.allGrid;
                this.grid[1] = this.allGrid;
                this.grid[2] = this.allGrid;
                break;
            case "grid-xy":
                this.grid[0] = !this.grid[0];
                break;
            case "grid-xz":
                this.grid[1] = !this.grid[1];
                break;
            case "grid-yz":
                this.grid[2] = !this.grid[2];
                break;
        }
        this.allGrid = this.computeGrid();
        document.querySelector('.grid').checked = this.allGrid;
        document.querySelector('.grid-xy').checked = this.grid[0];
        document.querySelector('.grid-xz').checked = this.grid[1];
        document.querySelector('.grid-yz').checked = this.grid[2];
        this.setVisible();
    }

    showGrid = () => {
        for (var i = 0; i < 3; i++) {
            this.gridHelper[i].visibility = this.grid[i];
        }
    }

    setCenter(x, y, z) {
        for (var i = 0; i < 3; i++) {
            this.gridHelper[i].position.set(x, y, z)
        }
    }

    setVisible() {
        for (var i = 0; i < 3; i++) {
            this.gridHelper[i].visible = this.grid[i];
        }
    }
}

export { Grid }