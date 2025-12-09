import * as THREE from "three";
import { deepDispose } from "../utils/utils.js";
import { CompoundGroup } from "./nestedgroup.js";
import type { Theme } from "../core/types";
import type { BoundingBox } from "./bbox.js";

/**
 * Linear interpolation with capping at boundaries
 * @param px1 - X coordinate of first point
 * @param py1 - Y coordinate of first point (output when x <= px1)
 * @param px2 - X coordinate of second point
 * @param py2 - Y coordinate of second point (output when x >= px2)
 * @param x - Input value to interpolate
 * @returns Interpolated value, capped at py1 or py2 if outside range
 */
function cappedLinear(px1: number, py1: number, px2: number, py2: number, x: number): number {
  const m = (py2 - py1) / (px2 - px1);
  return x < px1 ? py1 : x > px2 ? py2 : m * (x - px1) + py1;
}

/**
 * Format a number string by removing trailing zeros while keeping at least one decimal
 * @param str - Number string to format
 * @returns Formatted string (e.g., "1.500" -> "1.5", "2.000" -> "2.0", "-0" -> "0")
 */
function trimTrailingZeros(str: string): string {
  let result = str
    .replace(/(\.\d*[1-9])0+$/, "$1") // Remove zeros after nonzero decimals
    .replace(/\.0+$/, ""); // Remove .000... case
  if (result === "-0") result = "0"; // Handle negative zero case
  if (result.indexOf(".") < 0) result = `${result}.0`; // Ensure at least one decimal place
  return result;
}

/**
 * Creates a grid plane with dashed grid lines and solid colored centerlines.
 * Used internally by Grid to create XY, XZ, and YZ plane grids.
 */
class GridHelper extends THREE.Object3D {
  /**
   * Create a GridHelper
   * @param size - Total size of the grid (width and height)
   * @param divisions - Number of divisions (grid lines)
   * @param colorX - Color for the X-axis centerline
   * @param colorY - Color for the Y-axis centerline
   * @param colorGrid - Color for the dashed grid lines
   */
  constructor(
    size: number,
    divisions: number,
    colorX: number | string,
    colorY: number | string,
    colorGrid: number | string
  ) {
    super();

    const step = size / divisions;
    const halfSize = size / 2;
    const vertices: number[] = [];
    const gridColors: (number | string)[] = [];
    const solidVerticesX: number[] = [];
    const solidVerticesY: number[] = [];

    // Track whether centerlines have been added (should only happen once)
    let centerlineXAdded = false;
    let centerlineYAdded = false;

    // Create grid lines
    for (let i = 0; i <= divisions; i++) {
      const k = -halfSize + i * step;
      const isCenter = Math.abs(k) < 1e-10;

      // Vertical lines (parallel to Y axis)
      if (!isCenter) {
        // Dashed grid line
        vertices.push(-halfSize, 0, k, halfSize, 0, k);
        gridColors.push(colorGrid, colorGrid);
      } else if (!centerlineYAdded) {
        // Solid centerline Y (only add once)
        solidVerticesY.push(-halfSize, 0, 0, halfSize, 0, 0);
        centerlineYAdded = true;
      }

      // Horizontal lines (parallel to X axis)
      if (!isCenter) {
        // Dashed grid line
        vertices.push(k, 0, -halfSize, k, 0, halfSize);
        gridColors.push(colorGrid, colorGrid);
      } else if (!centerlineXAdded) {
        // Solid centerline X (only add once)
        solidVerticesX.push(0, 0, -halfSize, 0, 0, halfSize);
        centerlineXAdded = true;
      }
    }

    // Ensure centerlines exist even if grid doesn't pass through zero
    if (!centerlineYAdded) {
      solidVerticesY.push(-halfSize, 0, 0, halfSize, 0, 0);
    }
    if (!centerlineXAdded) {
      solidVerticesX.push(0, 0, -halfSize, 0, 0, halfSize);
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

interface GridOptions {
  bbox: BoundingBox;
  ticks?: number;
  gridFontSize: number;
  centerGrid?: boolean;
  axes0?: boolean;
  grid: [boolean, boolean, boolean];
  flipY?: boolean;
  theme: Theme;
  cadWidth: number;
  height: number;
  maxAnisotropy: number;
  tickValueElement?: HTMLElement;
  tickInfoElement?: HTMLElement;
  getCamera: () => THREE.OrthographicCamera | THREE.PerspectiveCamera | null;
  getAxes0: () => boolean;
  onGridChange?: (allGrid: boolean, grids: [boolean, boolean, boolean]) => void;
}

/**
 * Grid component for displaying coordinate grids in 3D space.
 * Supports XY, XZ, and YZ plane grids with labeled tick marks.
 */
class Grid extends THREE.Group {
  ticks: number;
  ticks0: number;
  gridFontSize: number;
  bbox: BoundingBox;
  centerGrid: boolean;
  axes0: boolean;
  grid: [boolean, boolean, boolean];
  allGrid: boolean;
  theme: Theme;
  flipY: boolean;
  lastZoomIndex: number;
  lastFontIndex: number;
  cadWidth: number;
  height: number;
  maxAnisotropy: number;
  tickValue: HTMLElement | null;
  info: HTMLElement | null;
  getCamera: () => THREE.OrthographicCamera | THREE.PerspectiveCamera | null;
  getAxes0: () => boolean;
  onGridChange: ((allGrid: boolean, grids: [boolean, boolean, boolean]) => void) | null;
  minFontIndex: number;
  minZoomIndex: number;
  zoomMaxIndex: number;
  canvasHeight: number;
  size: number;
  delta: number;
  geomCache: Record<string, THREE.CanvasTexture>;
  textureAspectRatios: Record<string, number>;
  labelCache: Record<string, THREE.Sprite>;
  materialCache: Record<string, THREE.SpriteMaterial>;
  colors: Record<Theme, string[]>;

  /**
   * Create a Grid instance
   * @param options - Configuration options
   */
  constructor(options: GridOptions) {
    super();

    // Validate required options
    const required: (keyof GridOptions)[] = [
      "bbox",
      "gridFontSize",
      "grid",
      "theme",
      "cadWidth",
      "height",
      "maxAnisotropy",
      "getCamera",
      "getAxes0",
    ];
    for (const key of required) {
      if (options[key] === undefined) {
        throw new Error(`Grid: required option "${key}" is missing`);
      }
    }

    const {
      bbox,
      ticks = 5,
      gridFontSize,
      centerGrid,
      axes0,
      grid,
      flipY,
      theme,
      cadWidth,
      height,
      maxAnisotropy,
      tickValueElement,
      tickInfoElement,
      getCamera,
      getAxes0,
      onGridChange,
    } = options;

    this.ticks = ticks;
    this.ticks0 = ticks;
    this.gridFontSize = gridFontSize;
    this.bbox = bbox;
    this.centerGrid = centerGrid || false;
    this.axes0 = axes0 || false;
    this.grid = grid;
    this.allGrid = !!(grid[0] || grid[1] || grid[2]);
    this.theme = theme;
    this.flipY = flipY || false;
    this.lastZoomIndex = 0;
    this.lastFontIndex = 50;

    // Store dimensions and renderer capability
    this.cadWidth = cadWidth;
    this.height = height;
    this.maxAnisotropy = maxAnisotropy;

    // Store DOM elements (optional)
    this.tickValue = tickValueElement || null;
    this.info = tickInfoElement || null;

    // Store callbacks for dynamic values
    this.getCamera = getCamera;
    this.getAxes0 = getAxes0;
    this.onGridChange = onGridChange || null;

    // Heuristics, experimentally determined
    const size = bbox.max_dist_from_center();
    const canvasSize = Math.min(cadWidth, height);
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

    this.size = 0;
    this.delta = 0;

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

  /**
   * Calculate text scale based on camera mode and canvas size
   */
  private calculateTextScale(pixel: number): number {
    const camera = this.getCamera();
    // Guard against disposed viewer (camera may be null during cleanup)
    if (!camera) {
      return pixel;
    }
    const height = this.height;

    // Decrease fontsize for small canvases
    // 300px and below 80%
    // 800px and above 100%
    // linear in between
    const fontSize = cappedLinear(300, 0.8, 800, 1.0, height) * pixel;

    if (camera instanceof THREE.OrthographicCamera) {
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

  /**
   * Update scale of all grid labels
   */
  scaleLabels(): void {
    for (const child of this.children) {
      if (!(child instanceof THREE.Group)) continue;
      for (let i = 1; i < child.children.length; i++) {
        const label = child.children[i];
        if (!(label instanceof THREE.Sprite)) continue;
        const s = this.calculateTextScale(this.gridFontSize);
        // Sprites need to maintain their individual aspect ratios
        const aspectRatio = label.userData.aspectRatio || 4; // fallback default
        label.scale.set(s * aspectRatio, s, 1);
      }
    }
  }

  /**
   * Show or hide all grid labels
   */
  private showLabels(flag: boolean): void {
    for (const child of this.children) {
      if (!(child instanceof THREE.Group)) continue;
      for (let i = 1; i < child.children.length; i++) {
        child.children[i].visible = flag;
      }
    }
  }

  /**
   * Update grid based on zoom level
   * @param zoom - Current zoom level
   * @param force - Force update regardless of zoom change
   * @param theme - Optional new theme to apply
   */
  async update(zoom: number, force: boolean = false, theme: Theme | null = null): Promise<void> {
    if (!this.getVisible()) return;

    // We got called from the change theme handler
    if (theme) this.theme = theme;

    let zoomIndex = Math.round(Math.log2(0.4 * zoom));

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
    if (force || fontIndex != this.lastFontIndex) {
      if (fontIndex < this.minFontIndex) {
        this.showLabels(false);
      } else {
        // Only update scale in ortho mode
        // In perspective, sizeAttenuation handles scaling automatically
        if (this.getCamera() instanceof THREE.OrthographicCamera) {
          this.scaleLabels();
        }
        this.showLabels(true);
      }
      this.lastFontIndex = fontIndex;
    }
  }

  /**
   * Create the grid geometry and labels
   * @param nice - Whether to use nice bounds calculation
   */
  async create(nice: boolean = true): Promise<void> {
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
      const [axisStart, axisEnd, niceTick] = this.niceBounds(
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
    this.setTickInfo();

    for (let i = 0; i < 3; i++) {
      const group = new CompoundGroup();
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

      let label: THREE.Sprite;
      for (let x = -this.size / 2; x <= this.size / 2; x += this.delta / 2) {
        if (Math.abs(x) < 1e-6) {
          continue;
        } // skip center label

        let x_fixed = trimTrailingZeros(x.toFixed(4));
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
    this.setCenter(this.getAxes0(), this.flipY);
    this.setVisible();
  }

  /**
   * Create a text texture for grid labels
   */
  private createTextTexture(text: string): THREE.CanvasTexture {
    if (this.geomCache[text]) {
      return this.geomCache[text];
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {
      alpha: true,
      desynchronized: false,
      willReadFrequently: false,
    })!;

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
    texture.anisotropy = this.maxAnisotropy;
    texture.premultiplyAlpha = false;

    // Clamp to edge to prevent sampling artifacts at borders
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    // Store texture and its aspect ratio
    this.geomCache[text] = texture;
    this.textureAspectRatios[text] = canvasWidth / canvasHeight;

    return texture;
  }

  /**
   * Create a label sprite for grid axis
   */
  private createLabel(tick: string, x: number, i: number, horizontal: boolean): THREE.Sprite {
    const key = `${tick}_${i}_${horizontal}`;
    if (this.labelCache[key]) {
      const cached = this.labelCache[key];
      // Clone sprite - materials are shared per texture+plane+orientation
      // Sprite.material is typed as SpriteMaterial in THREE.js
      const sprite = new THREE.Sprite(cached.material);
      sprite.position.copy(cached.position);
      sprite.scale.copy(cached.scale);
      sprite.userData.aspectRatio = cached.userData.aspectRatio;
      return sprite;
    }

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
    let dir: number;
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

  /**
   * Calculate nice symmetric grid bounds centered at zero
   */
  private niceBounds(axisStart: number, axisEnd: number, numTicks: number): [number, number, number] {
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
    let niceFactor: number;
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

  /**
   * Compute grid visibility and notify UI
   */
  computeGrid(): void {
    this.allGrid = !!(this.grid[0] || this.grid[1] || this.grid[2]);

    if (this.onGridChange) {
      this.onGridChange(this.allGrid, this.grid);
    }

    this.setVisible();
  }

  /**
   * Toggle grid visibility by action
   * @param action - Action type ("grid", "grid-xy", "grid-xz", "grid-yz")
   * @param flag - Optional explicit flag for "grid" action
   */
  setGrid(action: string, flag: boolean | null = null): void {
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

  /**
   * Set grid visibility for all planes
   * @param xy - XY plane visibility
   * @param xz - XZ plane visibility
   * @param yz - YZ plane visibility
   */
  setGrids(xy: boolean, xz: boolean, yz: boolean): void {
    this.grid[0] = xy;
    this.grid[1] = xz;
    this.grid[2] = yz;
    this.computeGrid();
  }

  /**
   * Set grid center position
   * @param axes0 - Whether to center at origin
   * @param flipY - Whether Y axis is flipped
   */
  setCenter(axes0: boolean, flipY: boolean): void {
    const c = axes0 ? [0, 0, 0] : this.bbox.center();

    this.children.forEach((ch) => ch.position.set(c[0], c[1], c[2]));

    if (!this.centerGrid) {
      this.children[0].position.z -= this.size / 2;
      this.children[1].position.y -= ((flipY ? -1 : 1) * this.size) / 2;
      this.children[2].position.x -= this.size / 2;
    }
  }

  /**
   * Update visibility of grid planes and tick info
   */
  setVisible(): void {
    this.children.forEach((ch, i) => {
      ch.visible = this.grid[i];
    });
    if (this.info) {
      this.info.style.display = this.allGrid ? "block" : "none";
    }
  }

  /**
   * Update tick info display
   */
  private setTickInfo(): void {
    if (this.tickValue) {
      this.tickValue.innerText = trimTrailingZeros((this.delta / 2).toFixed(4));
    }
  }

  /**
   * Get overall grid visibility
   * @returns Whether any grid plane is visible
   */
  getVisible(): boolean {
    return this.allGrid;
  }

  /**
   * Clear all caches (textures, materials, labels)
   */
  clearCache(): void {
    // Dispose textures from geomCache
    if (Object.keys(this.geomCache).length > 0) {
      for (const key of Object.keys(this.geomCache)) {
        const texture = this.geomCache[key];
        texture.dispose();
      }
      this.geomCache = {};
    }

    // Clear texture aspect ratios
    this.textureAspectRatios = {};

    // Dispose materials from materialCache
    if (this.materialCache && Object.keys(this.materialCache).length > 0) {
      for (const key of Object.keys(this.materialCache)) {
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

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clearCache();
  }
}

export { Grid };
