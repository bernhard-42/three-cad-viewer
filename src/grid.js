import * as THREE from "three";
import { Font } from "./fontloader/FontLoader.js";
import { helvetiker } from "./font.js";
import { deepDispose } from "./utils.js";

function capped_linear(px1, py1, px2, py2, x) {
  const m = (py2 - py1) / (px2 - px1);
  return x < px1 ? py1 : x > px2 ? py2 : m * (x - px1) + py1;
}

function trimTrailingZeros(str) {
  var result = str
    .replace(/(\.\d*[1-9])0+$/, "$1") // Remove zeros after nonzero decimals
    .replace(/\.0+$/, ""); // Remove .000... case
  if (result === "-0") result = "0"; // Handle negative zero case
  if (result.indexOf(".") < 0) result = `${result}.0`; // Ensure at least one decimal place
  return result;
}

class GridHelper extends THREE.Object3D {
  constructor(size, divisions, colorX, colorY, colorGrid) {
    super();

    const step = size / divisions;
    const halfSize = size / 2;
    const vertices = [];
    const gridColors = [];
    const solidVerticesX = [];
    const solidVerticesY = [];

    // Create grid lines (dashed)
    var centerline = false;
    for (let i = 0; i <= divisions; i++) {
      const k = -halfSize + i * step;
      // Vertical (Y) lines
      if (Math.abs(k) > 1e-10) {
        vertices.push(-halfSize, 0, k, halfSize, 0, k);
        gridColors.push(colorGrid, colorGrid);
      } else {
        // Centerline Y
        solidVerticesY.push(-halfSize, 0, k, halfSize, 0, k);
        centerline = true;
      }

      if (!centerline) {
        // Ensure centerline Y is drawn only once
        solidVerticesY.push(-halfSize, 0, 0, halfSize, 0, 0);
      }
      centerline = false;
      // Horizontal (X) lines
      if (Math.abs(k) > 1e-10) {
        vertices.push(k, 0, -halfSize, k, 0, halfSize);
        gridColors.push(colorGrid, colorGrid);
      } else {
        // Centerline X
        solidVerticesX.push(k, 0, -halfSize, k, 0, halfSize);
      }
      if (!centerline) {
        // Ensure centerline X is drawn only once
        solidVerticesX.push(0, 0, -halfSize, 0, 0, halfSize);
      }
    }

    // Dashed grid lines
    const dashedGeometry = new THREE.BufferGeometry();
    dashedGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    // Compute line distances for dashed lines
    const position = dashedGeometry.getAttribute("position");
    const lineDistances = new Float32Array(position.count);
    for (let i = 0; i < position.count; i += 2) {
      const x1 = position.getX(i),
        y1 = position.getY(i),
        z1 = position.getZ(i);
      const x2 = position.getX(i + 1),
        y2 = position.getY(i + 1),
        z2 = position.getZ(i + 1);
      lineDistances[i] = 0;
      lineDistances[i + 1] = Math.sqrt(
        (x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2,
      );
    }
    dashedGeometry.setAttribute(
      "lineDistance",
      new THREE.BufferAttribute(lineDistances, 1),
    );

    const dashedMaterial = new THREE.LineDashedMaterial({
      color: colorGrid,
      dashSize: step / 20,
      gapSize: step / 20,
      opacity: 1,
      transparent: false,
      vertexColors: false,
    });

    const dashedLines = new THREE.LineSegments(dashedGeometry, dashedMaterial);
    this.add(dashedLines);

    // Centerline X (solid)
    const xGeometry = new THREE.BufferGeometry();
    xGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(solidVerticesX, 3),
    );
    const xMaterial = new THREE.LineBasicMaterial({ color: colorX });
    this.add(new THREE.LineSegments(xGeometry, xMaterial));

    // Centerline Y (solid)
    const yGeometry = new THREE.BufferGeometry();
    yGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(solidVerticesY, 3),
    );
    const yMaterial = new THREE.LineBasicMaterial({ color: colorY });
    this.add(new THREE.LineSegments(yGeometry, yMaterial));
  }
}

class Grid extends THREE.Group {
  constructor(
    viewer,
    bbox,
    ticks,
    tickFontSize,
    centerGrid,
    axes0,
    grid,
    flipY,
    theme,
  ) {
    super();

    if (ticks === undefined) {
      ticks = 10;
    }
    this.ticks = ticks / 2;
    this.tickFontSize = tickFontSize;
    this.viewer = viewer;
    this.bbox = bbox;
    this.centerGrid = centerGrid;
    this.axes0 = axes0;
    this.grid = grid;
    this.allGrid = grid[0] | grid[1] | grid[2];
    this.theme = theme;
    this.flipY = flipY;
    this.lastZoomIndex = 0;
    this.lastFontIndex = 50;
    this.tickValue = this.viewer.display._getElement("tcv_tick_size_value");
    this.info = this.viewer.display._getElement("tcv_tick_size");

    // The bounding box size is used to caclulate the font index from which
    // on the labels are shown. For small objects the font size is reduced
    // to avoid that the labels are larger than the object.
    const size = bbox.max_dist_from_center();
    this.minFontIndex = Math.round(capped_linear(2, 14, 2000, 5, size));
    this.minZoomIndex = size < 10 ? -4 : -3; // zoomIndex from which on the labels are shown

    this.geomCache = {};

    this.colors = {
      dark: [
        "#ff4500", // x
        "#32cd32", // y
        "#3b9eff", // z
      ],
      light: [
        "#ff4500", // x
        "#32cd32", // y
        "#3b9eff", // z
      ],
    };

    this.create();
  }

  calculateTextScale(pixel) {
    const camera = this.viewer.camera.getCamera();
    const height = this.viewer.height;
    if (this.viewer.ortho) {
      // Decrease fontsize for small canvases
      // 300px and below 70%
      // 800px and above 100%
      // linear in between
      const fontsize = capped_linear(300, 0.7, 800, 1.0, height) * pixel;

      const visibleWorldHeight = (camera.top - camera.bottom) / camera.zoom;
      const pixelsPerWorldUnit = height / visibleWorldHeight;
      return fontsize / pixelsPerWorldUnit;
    } else {
      const fontSize = pixel;
      const camera = this.viewer.camera.getCamera();

      // Calculate distance from camera to mesh
      const pos = this.viewer.axes0
        ? new THREE.Vector3()
        : new THREE.Vector3(...this.bbox.center());

      const camPos = camera.getWorldPosition(new THREE.Vector3());
      var d = camPos.distanceTo(pos);
      if (!this.viewer.centerGrid) {
        d += 2 * this.bbox.max_dist_from_center();
      }

      // Compute visible world height at that distance
      const fovRad = (camera.fov * Math.PI) / 180; // convert to radians
      const visibleWorldHeight = 2 * d * Math.tan(fovRad / 2);

      // Pixels per world unit
      const pixelsPerUnit = height / visibleWorldHeight;

      // Return the scale needed for desired screen height
      return fontSize / pixelsPerUnit;
    }
  }

  scaleLabels() {
    for (var axis in this.children) {
      var group = this.children[axis];
      for (var i = 1; i < group.children.length; i++) {
        const label = group.children[i];
        var s = this.calculateTextScale(this.tickFontSize);
        label.scale.setScalar(s);
      }
    }
  }

  showLabels(flag) {
    for (var axis in this.children) {
      var group = this.children[axis];
      for (var i = 1; i < group.children.length; i++) {
        const label = group.children[i];
        label.visible = flag;
      }
    }
  }

  update(zoom, force = false) {
    if (!this.getVisible()) return;

    var zoomIndex = Math.round(Math.log2(zoom));
    if (Math.abs(zoomIndex) < 1e-6) zoomIndex = 0;

    const threshold = this.viewer.ortho || this.viewer.centerGrid ? 5 : 3;

    if (
      force ||
      (zoomIndex != this.lastZoomIndex &&
        zoomIndex < threshold &&
        zoomIndex > this.minZoomIndex)
    ) {
      deepDispose(this.children);
      this.children = [];

      const halfTicks = (this.ticks0 / 2) * 2 ** zoomIndex;
      this.ticks = 2 * halfTicks;

      this.create(false);

      this.lastZoomIndex = zoomIndex;
      force = true; // when grid is created newly, ensure font sizing is executed, too
    }

    const fontIndex = Math.round(zoom * 50);
    if (force || fontIndex != this.lastFontIndex) {
      // console.log("fontIndex", fontIndex, zoom);
      if (fontIndex < this.minFontIndex) {
        this.showLabels(false);
      } else {
        this.scaleLabels();
        this.showLabels(true);
      }
      this.lastFontIndex = fontIndex;
    }
  }

  async create(nice = true) {
    // in case the bbox has the same size as the nice grid there should be
    // a margin bewteen grid and object. Hence factor 1.05
    if (nice) {
      const s2 = Math.max(
        Math.abs(this.bbox.max.x),
        Math.abs(this.bbox.max.y),
        Math.abs(this.bbox.max.z),
        Math.abs(this.bbox.min.x),
        Math.abs(this.bbox.min.y),
        Math.abs(this.bbox.min.z),
      );
      var [axisStart, axisEnd, niceTick] = this.niceBounds(
        -s2 * 1.05,
        s2 * 1.05,
        2 * this.ticks,
      );
      this.size = axisEnd - axisStart;
      this.ticks = this.size / niceTick;
      this.ticks0 = this.ticks;
      this.delta = niceTick;
    } else {
      this.delta = this.size / this.ticks;
    }
    this.setTickInfo(this.delta / 2);
    const font = new Font(helvetiker);

    for (var i = 0; i < 3; i++) {
      var group = new THREE.Group();
      group.name = `GridHelper-${i}`;
      group.add(
        new GridHelper(
          this.size,
          2 * this.ticks,
          this.colors[this.theme][i === 0 ? 1 : i === 1 ? 0 : 2],
          this.colors[this.theme][i === 0 ? 0 : i === 1 ? 2 : 1],
          this.theme == "dark" ? 0x7777777 : 0xbbbbbb,
        ),
      );
      const mat = new THREE.LineBasicMaterial({
        color:
          this.theme === "dark"
            ? new THREE.Color(0.5, 0.5, 0.5)
            : new THREE.Color(0.3, 0.3, 0.3),
        side: THREE.DoubleSide,
      });
      var dir;
      var geom;
      for (var x = -this.size / 2; x <= this.size / 2; x += this.delta / 2) {
        geom = this.createNumber(x, font);
        const geom2 = geom.clone();
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

        if (i == 0) {
          geom2.rotateX(-Math.PI / 2);
        } else if (i == 1) {
          geom2.rotateX(-Math.PI / 2);
          geom2.rotateZ(Math.PI);
        } else {
          geom2.rotateX(Math.PI / 2);
        }
        const label2 = new THREE.Mesh(geom2, mat);
        dir = i == 0 ? -1 : 1;
        label2.position.set(0, 0, dir * x);
        group.add(label2);
      }
      this.add(group);
    }
    this.children[0].rotateX(Math.PI / 2);
    this.children[1].rotateY(Math.PI / 2);
    this.children[2].rotateZ(Math.PI / 2);

    this.setCenter(this.axes0, this.flipY);
    this.scaleLabels();
    this.setCenter(this.viewer.axes0, this.flipY);
    this.setVisible();
  }

  createNumber(x, font) {
    const label = trimTrailingZeros(x.toFixed(4));

    if (this.geomCache[label]) {
      return this.geomCache[label].clone();
    }

    const shape = font.generateShapes(label, 1);
    var geom = new THREE.ShapeGeometry(shape);

    geom.computeBoundingBox();
    var xMid = -0.5 * (geom.boundingBox.max.x - geom.boundingBox.min.x);
    var yMid = -0.5 * (geom.boundingBox.max.y - geom.boundingBox.min.y);
    geom.translate(xMid, yMid, 0);
    this.geomCache[label] = geom.clone();
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

    this.viewer.display.toolbarButtons["grid"].set(this.allGrid);
    this.viewer.display.checkElement("tcv_grid-xy", this.grid[0]);
    this.viewer.display.checkElement("tcv_grid-xz", this.grid[1]);
    this.viewer.display.checkElement("tcv_grid-yz", this.grid[2]);

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
    this.children.forEach((ch, i) => {
      ch.visible = this.grid[i];
    });
    if (this.allGrid) {
      this.info.style.display = "block";
    } else {
      this.info.style.display = "none";
    }
  }

  setTickInfo() {
    this.tickValue.innerText = trimTrailingZeros((this.delta / 2).toFixed(4));
  }

  getVisible() {
    return this.allGrid;
  }

  clearCache() {
    if (Object.keys(this.geomCache).length > 0) {
      for (var key of Object.keys(this.geomCache)) {
        const geom = this.geomCache[key];
        geom.dispose();
      }
      this.geomCache = [];
    }
  }

  dispose() {
    this.clearCache();
  }
}

export { Grid };
