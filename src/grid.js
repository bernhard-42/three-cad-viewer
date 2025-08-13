import * as THREE from "three";
import { Font } from "./fontloader/FontLoader.js";
import { helvetiker } from "./font.js";

class Grid extends THREE.Group {
  constructor(display, bbox, ticks, centerGrid, axes0, grid, flipY, theme) {
    super();

    if (ticks === undefined) {
      ticks = 10;
    }
    this.display = display;
    this.bbox = bbox;
    this.centerGrid = centerGrid;
    this.grid = grid;
    this.allGrid = grid[0] | grid[1] | grid[2];
    const s = new THREE.Vector3();
    bbox.getSize(s);
    const s2 = Math.max(s.x, s.y, s.z);
    // const s2 = bbox.boundingSphere().radius;

    // in case the bbox has the same siez as the nice grid there should be
    // a margin bewteen grid and object. Hence factor 1.1
    var [axisStart, axisEnd, niceTick] = this.niceBounds(
      -s2 * 1.05,
      s2 * 1.05,
      2 * ticks,
    );
    this.size = axisEnd - axisStart;

    const font = new Font(helvetiker);

    this.ticks = niceTick;

    for (var i = 0; i < 3; i++) {
      var group = new THREE.Group();
      group.name = `GridHelper-${i}`;
      group.add(
        new THREE.GridHelper(
          this.size,
          this.size / this.ticks,
          theme === "dark" ? 0xcccccc : 0x777777,
          theme == "dark" ? 0x999999 : 0xbbbbbb,
        ),
      );
      const mat = new THREE.LineBasicMaterial({
        color:
          theme === "dark"
            ? new THREE.Color(0.5, 0.5, 0.5)
            : new THREE.Color(0.4, 0.4, 0.4),
        side: THREE.DoubleSide,
      });
      var dir;
      var geom;
      for (var x = -this.size / 2; x <= this.size / 2; x += this.ticks) {
        geom = this.createNumber(x, font);
        if (i == 0) {
          geom.rotateX(-Math.PI / 2);
          geom.rotateY(Math.PI / 2);
        } else if (i == 1) {
          geom.rotateX(Math.PI / 2);
          geom.rotateY(-Math.PI / 2);
        } else {
          geom.rotateX(Math.PI / 2);
          geom.rotateY(-Math.PI / 2);
        }
        const label = new THREE.Mesh(geom, mat);
        dir = i == 1 ? -1 : 1;
        label.position.set(dir * x, 0, 0);
        group.add(label);

        if (Math.abs(x) < 1e-6) continue;

        geom = this.createNumber(x, font);
        if (i == 0) {
          geom.rotateX(-Math.PI / 2);
        } else if (i == 1) {
          geom.rotateX(-Math.PI / 2);
          geom.rotateZ(Math.PI);
        } else {
          geom.rotateX(Math.PI / 2);
        }
        const label2 = new THREE.Mesh(geom, mat);
        dir = i == 0 ? -1 : 1;
        label2.position.set(0, 0, dir * x);
        group.add(label2);
      }
      this.add(group);
    }

    this.children[0].rotateX(Math.PI / 2);
    this.children[1].rotateY(Math.PI / 2);
    this.children[2].rotateZ(Math.PI / 2);

    this.setCenter(axes0, flipY);

    this.setVisible();
  }

  createNumber(x, font) {
    // experimentally detected: p1=(size=640, font_size=7.1) p2=(size=2.2, font_size=0.035)
    const m = (0.035 - 7.1) / (2.2 - 640);
    const fontSize = m * (this.size - 640) + 7.1;

    const shape = font.generateShapes(x.toFixed(1), fontSize);
    var geom = new THREE.ShapeGeometry(shape);

    geom.computeBoundingBox();
    var xMid = -0.5 * (geom.boundingBox.max.x - geom.boundingBox.min.x);
    var yMid = -0.5 * (geom.boundingBox.max.y - geom.boundingBox.min.y);
    geom.translate(xMid, yMid, 0);
    return geom;
  }

  // https://stackoverflow.com/questions/4947682/intelligently-calculating-chart-tick-positions
  niceNumber(value, round) {
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

  niceBounds(axisStart, axisEnd, numTicks) {
    var niceTick;
    var niceRange;

    if (!numTicks) {
      numTicks = 10;
    }

    var axisWidth = axisEnd - axisStart;

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

  computeGrid() {
    this.allGrid = this.grid[0] | this.grid[1] | this.grid[2];

    this.display.toolbarButtons["grid"].set(this.allGrid);
    this.display.checkElement("tcv_grid-xy", this.grid[0]);
    this.display.checkElement("tcv_grid-xz", this.grid[1]);
    this.display.checkElement("tcv_grid-yz", this.grid[2]);

    this.setVisible();
  }

  setGrid(action, flag = null) {
    switch (action) {
      case "grid":
        this.allGrid = flag == null ? !this.allGrid : flag;
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
    this.computeGrid();
  }

  setGrids(xy, xz, yz) {
    this.grid[0] = xy;
    this.grid[1] = xz;
    this.grid[2] = yz;
    this.computeGrid();
  }

  setCenter(axes0, flipY) {
    const c = axes0 ? [0, 0, 0] : this.bbox.center();

    this.children.forEach((ch) => ch.position.set(...c));

    if (!this.centerGrid) {
      this.children[0].position.z -= this.size / 2;
      this.children[1].position.y -= ((flipY ? -1 : 1) * this.size) / 2;
      this.children[2].position.x -= this.size / 2;
    }
  }

  setVisible() {
    this.children.forEach((ch, i) => (ch.visible = this.grid[i]));
  }
}

export { Grid };
