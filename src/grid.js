import * as THREE from "three";
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
    gridFontSize,
    centerGrid,
    axes0,
    grid,
    flipY,
    theme,
  ) {
    super();

    if (ticks === undefined) {
      ticks = 5;
    }
    this.ticks = ticks;
    this.gridFontSize = gridFontSize;
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

    // Heuristics, experimentally determined
    const size = bbox.max_dist_from_center();
    const canvasSize = Math.min(this.viewer.cadWidth, this.viewer.height);
    const scale = Math.max(1.0, 6 - Math.log2(canvasSize / 100));
    this.minFontIndex = Math.round(
      (size < 2 ? 6 : size < 1000 ? 5 : 3) * scale,
    );
    this.minZoomIndex = -4;
    this.zoomMaxIndex = 5;

    this.canvasHeight = 128; // Fixed height for all label textures (higher = crisper)

    this.geomCache = {};
    this.textureAspectRatios = {}; // Store aspect ratio per texture
    this.labelCache = {};
    this.materialCache = {};

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

    // Decrease fontsize for small canvases
    // 300px and below 80%
    // 800px and above 100%
    // linear in between
    const fontSize = capped_linear(300, 0.8, 800, 1.0, height) * pixel;

    if (this.viewer.ortho) {
      // Ortho: convert pixel size to world units based on zoom
      const visibleWorldHeight = (camera.top - camera.bottom) / camera.zoom;
      const pixelsPerWorldUnit = height / visibleWorldHeight;

      const scaleFactor = 1.6; // Adjust this to change ortho label size (1.0 = default, 2.0 = double)
      return (fontSize / pixelsPerWorldUnit) * scaleFactor;
    } else {
      // Perspective with sizeAttenuation: false
      // Scale is in normalized device coordinates (screen space)
      // Scale of 1.0 = full viewport height
      const scaleFactor = 0.6; // Adjust this to change label size (0.1 = smaller, 2.0 = larger)
      return (fontSize / height) * scaleFactor;
    }
  }

  scaleLabels() {
    for (var axis in this.children) {
      var group = this.children[axis];
      for (var i = 1; i < group.children.length; i++) {
        const label = group.children[i];
        var s = this.calculateTextScale(this.gridFontSize);
        // Sprites need to maintain their individual aspect ratios
        const aspectRatio = label.userData.aspectRatio || 4; // fallback default
        label.scale.set(s * aspectRatio, s, 1);
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

  async update(zoom, force = false, theme = null) {
    if (!this.getVisible()) return;

    // We got called from the change theme handler
    if (theme) this.theme = theme;

    var zoomIndex = Math.round(Math.log2(0.4 * zoom));

    if (Math.abs(zoomIndex) < 1e-6) zoomIndex = 0;
    if (
      force ||
      (zoomIndex != this.lastZoomIndex &&
        zoomIndex < this.zoomMaxIndex &&
        zoomIndex > this.minZoomIndex)
    ) {
      deepDispose(this.children);
      this.children = [];

      const halfTicks = (this.ticks0 / 2) * 2 ** zoomIndex;
      this.ticks = Math.round(2 * halfTicks);

      await this.create(false);

      this.lastZoomIndex = zoomIndex;
      force = true; // when grid is created newly, ensure font sizing is executed, too
    }

    const fontIndex = Math.round(zoom * 50);
    // console.log(fontIndex, zoomIndex);
    if (force || fontIndex != this.lastFontIndex) {
      if (fontIndex < this.minFontIndex) {
        this.showLabels(false);
      } else {
        // Only update scale in ortho mode
        // In perspective, sizeAttenuation handles scaling automatically
        if (this.viewer.ortho) {
          this.scaleLabels();
        }
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
        this.ticks,
      );
      this.size = axisEnd - axisStart;
      this.ticks = this.size / niceTick;
      this.ticks0 = this.ticks;
      this.delta = niceTick;
    } else {
      this.delta = this.size / this.ticks;
    }
    this.setTickInfo(this.delta / 2);

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

      var label;
      for (var x = -this.size / 2; x <= this.size / 2; x += this.delta / 2) {
        if (Math.abs(x) < 1e-6) {
          continue;
        } // skip center label

        var x_fixed = trimTrailingZeros(x.toFixed(4));
        // Add '+' prefix for positive numbers
        if (x > 0) {
          x_fixed = "+" + x_fixed;
        }

        label = this.createLabel(x_fixed, x, i, true); //cached
        group.add(label);

        label = this.createLabel(x_fixed, x, i, false); //cached
        group.add(label);
      }
      this.add(group);
    }
    this.children[0].rotateX(Math.PI / 2);
    this.children[1].rotateY(Math.PI / 2);
    this.children[2].rotateZ(Math.PI / 2);

    this.setCenter(this.axes0, this.flipY);
    // Set initial scale (required for both modes)
    this.scaleLabels();
    this.setCenter(this.viewer.axes0, this.flipY);
    this.setVisible();
  }

  createTextTexture(text) {
    if (this.geomCache[text]) {
      return this.geomCache[text];
    }
    // console.log("texture cache miss", text);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {
      alpha: true,
      desynchronized: false,
      willReadFrequently: false,
    });

    // Use consistent high-quality settings regardless of text length
    const fontSize = 80;
    const strokeWidth = 12;

    const weight = this.theme === "dark" ? "500" : "560";
    const font = `${weight} ${fontSize}px Verdana, Arial, sans-serif`;
    ctx.font = font;

    // Measure text width to create appropriately sized canvas
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const padding = 20;

    // Dynamic width for long text, consistent height for quality
    const canvasWidth = Math.round(textWidth + padding * 2);
    const canvasHeight = this.canvasHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Need to reset context properties after canvas resize
    // ctx.imageSmoothingEnabled = true;
    // ctx.imageSmoothingQuality = "high";
    ctx.textRendering = "optimizeLegibility";

    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Clear with fully transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw outline/stroke using actual canvas background color
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = this.theme === "dark" ? "#444444" : "#ffffff";
    ctx.strokeText(text, centerX, centerY);

    // Draw main text on top
    ctx.fillStyle = this.theme === "dark" ? "#aaaaaa" : "#333333";
    ctx.fillText(text, centerX, centerY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Use LinearSRGBColorSpace for light theme, SRGBColorSpace for dark theme
    texture.colorSpace =
      this.theme === "dark" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;

    // Use nearest filtering for crisp text
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = this.viewer.renderer.capabilities.getMaxAnisotropy();
    texture.premultiplyAlpha = false;

    // Clamp to edge to prevent sampling artifacts at borders
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    // Store texture and its aspect ratio
    this.geomCache[text] = texture;
    this.textureAspectRatios[text] = canvasWidth / canvasHeight;

    return texture;
  }

  createLabel(tick, x, i, horizontal) {
    const key = `${tick}_${i}_${horizontal}`;
    if (this.labelCache[key]) {
      const cached = this.labelCache[key];
      // Clone sprite - materials are shared per texture+plane+orientation
      const sprite = new THREE.Sprite(cached.material);
      sprite.position.copy(cached.position);
      sprite.scale.copy(cached.scale);
      sprite.userData.aspectRatio = cached.userData.aspectRatio;
      return sprite;
    }
    // console.log("label cache miss", tick, i, horizontal);

    const texture = this.createTextTexture(tick);

    // Determine rotation based on plane and axis
    // All labels should be perpendicular to their axis to prevent overlap
    // Ensure consistent rotation for each physical axis across all planes
    let rotation = 0;
    if (i === 0) {
      // XY plane: X-axis (horizontal) = 0°, Y-axis (vertical) = 0° for perpendicular
      rotation = 0;
    } else if (i === 1) {
      // XZ plane: Z-axis (horizontal) = 90°, X-axis (vertical) = 0° for perpendicular
      rotation = horizontal ? Math.PI / 2 : 0;
    } else {
      // YZ plane: Y-axis (horizontal) = 0°, Z-axis (vertical) = 90° (match above)
      rotation = horizontal ? 0 : Math.PI / 2;
    }

    // Create or reuse material based on texture and orientation
    const materialKey = `${tick}_${i}_${horizontal}`;
    let material = this.materialCache[materialKey];
    if (!material) {
      material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        rotation: rotation,
        sizeAttenuation: false, // Disable distance scaling - maintain constant screen size
      });
      this.materialCache[materialKey] = material;
    }

    const sprite = new THREE.Sprite(material);

    // Adjust direction based on plane and axis to fix flipped labels
    let dir;
    if (i === 0) {
      // XY plane: vertical axis needs flip
      dir = horizontal ? 1 : -1;
    } else if (i === 1) {
      // XZ plane: horizontal axis needs flip (opposite of XY)
      dir = horizontal ? -1 : 1;
    } else {
      // YZ plane: no flip needed
      dir = 1;
    }

    if (horizontal) {
      sprite.position.set(dir * x, 0, 0);
    } else {
      sprite.position.set(0, 0, dir * x);
    }

    // Set initial scale using actual texture aspect ratio
    const aspectRatio = this.textureAspectRatios[tick] || 4; // fallback default
    sprite.scale.set(aspectRatio, 1, 1);

    // Store aspect ratio on sprite for scaleLabels to use
    sprite.userData.aspectRatio = aspectRatio;

    this.labelCache[key] = sprite;
    return sprite;
  }

  // Calculate nice symmetric grid bounds centered at zero
  // numTicks: desired number of ticks in one direction (from 0 to max)
  niceBounds(axisStart, axisEnd, numTicks) {
    if (!numTicks) {
      numTicks = 8;
    }

    // Calculate max absolute value (for symmetric grid)
    const maxAbsValue = Math.max(Math.abs(axisStart), Math.abs(axisEnd));

    if (maxAbsValue === 0) {
      return [0, 0, 0];
    }

    // Calculate rough delta
    const roughDelta = maxAbsValue / numTicks;

    // Find the order of magnitude
    const exponent = Math.floor(Math.log10(roughDelta));
    const magnitude = Math.pow(10, exponent);

    // Normalize to range [1, 10)
    const normalized = roughDelta / magnitude;

    // Round to nice number: 1, 2, 2.5, 5, or 10
    let niceFactor;
    if (normalized <= 1.0) {
      niceFactor = 1.0;
    } else if (normalized <= 2.0) {
      niceFactor = 2.0;
    } else if (normalized <= 2.5) {
      niceFactor = 2.5;
    } else if (normalized <= 5.0) {
      niceFactor = 5.0;
    } else {
      niceFactor = 10.0;
    }

    const niceDelta = niceFactor * magnitude;

    // Calculate how many ticks fit within the original bounds
    // Use Math.ceil to ensure we cover the full range
    const actualTicks = Math.ceil(maxAbsValue / niceDelta);

    // Calculate symmetric bounds based on actual ticks that fit
    const niceMax = niceDelta * actualTicks;
    const niceMin = -niceMax;

    return [niceMin, niceMax, niceDelta];
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
    // Dispose textures from geomCache
    if (Object.keys(this.geomCache).length > 0) {
      for (var key of Object.keys(this.geomCache)) {
        const texture = this.geomCache[key];
        texture.dispose();
      }
      this.geomCache = {};
    }

    // Clear texture aspect ratios
    this.textureAspectRatios = {};

    // Dispose materials from materialCache
    if (this.materialCache && Object.keys(this.materialCache).length > 0) {
      for (var key of Object.keys(this.materialCache)) {
        const material = this.materialCache[key];
        material.dispose();
      }
      this.materialCache = {};
    }

    // Clear labelCache (sprites reference shared materials, so no disposal needed here)
    if (Object.keys(this.labelCache).length > 0) {
      this.labelCache = {};
    }
  }

  dispose() {
    this.clearCache();
  }
}

export { Grid };
