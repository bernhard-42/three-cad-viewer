import * as THREE from 'three';

class Grid {
    constructor(bbox, ticks, axes0, visible) {
        if (ticks === undefined) {
            ticks = 10;
        }
        this.bbox = bbox;

        this.grid = visible;
        this.allGrid = visible[0] | visible[1] | visible[2];

        this.gridHelper = [];
        var [axisStart, axisEnd, niceTick] = this.niceBounds(-bbox.max, bbox.max, 2 * ticks);
        this.size = axisEnd - axisStart

        for (var i = 0; i < 3; i++) {
            this.gridHelper.push(
                new THREE.GridHelper(this.size, this.size / niceTick, 0x888888, 0xcccccc),
            )
        }

        this.gridHelper[0].rotateX(Math.PI / 2);
        this.gridHelper[1].rotateY(Math.PI / 2);
        this.gridHelper[2].rotateZ(Math.PI / 2);

        this.setCenter(axes0)

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

    setGrid = (action) => {
        switch (action) {
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

    setCenter = (axes0) => {
        if (axes0) {
            for (var i = 0; i < 3; i++) {
                this.gridHelper[i].position.set(0, 0, 0);
            }
            this.gridHelper[0].position.z = -this.size / 2;
            this.gridHelper[1].position.y = -this.size / 2;
            this.gridHelper[2].position.x = -this.size / 2;
        } else {
            for (var i = 0; i < 3; i++) {
                this.gridHelper[i].position.set(...this.bbox.center);
            }
            this.gridHelper[0].position.z = -this.size / 2 + this.bbox.center[2];
            this.gridHelper[1].position.y = -this.size / 2 + this.bbox.center[1];
            this.gridHelper[2].position.x = -this.size / 2 + this.bbox.center[0];
        }
    }

    setVisible() {
        for (var i = 0; i < 3; i++) {
            this.gridHelper[i].visible = this.grid[i];
        }
    }
}

export { Grid }