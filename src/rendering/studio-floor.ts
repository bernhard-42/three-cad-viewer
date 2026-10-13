import * as THREE from "three";

/**
 * Studio floor — shadow-catching ground plane for Studio mode.
 *
 * Uses ShadowMaterial which is fully transparent except where shadows
 * are cast, providing a natural grounding effect without obscuring
 * the background (like KeyShot's Ground material or Fusion 360's
 * ground plane).
 *
 * The floor is added to the scene via its `group` property.
 * Shadow plane visibility is toggled via `setShadowsEnabled()`.
 */
class StudioFloor {
  /** The Group to add to the scene. Contains the shadow plane. */
  readonly group: THREE.Group;

  /** Shadow-receiving plane (ShadowMaterial) */
  private _shadowPlane: THREE.Mesh | null = null;

  /** Whether shadows are currently enabled */
  private _shadowsEnabled: boolean = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "studioFloor";
    this.group.visible = false;
  }

  /**
   * Create or recreate the floor for the given scene bounds.
   *
   * Call this when the bounding box changes (new shapes loaded).
   *
   * @param zPosition - Z coordinate for the floor (typically bbox.min.z)
   * @param sceneSize - Approximate scene size (max extent) for sizing the floor
   */
  configure(zPosition: number, sceneSize: number): void {
    this._clearCurrent();
    this._createShadowPlane(zPosition, sceneSize);
  }

  /**
   * Toggle shadow plane visibility.
   *
   * @param enabled - Whether to show the shadow plane
   */
  setShadowsEnabled(enabled: boolean): void {
    this._shadowsEnabled = enabled;
    if (this._shadowPlane) this._shadowPlane.visible = enabled;
    this.group.visible = this._shadowsEnabled;
  }

  /**
   * Set the ground shadow opacity (how dark the shadow appears on the floor).
   * This supplements `light.shadow.intensity` which controls shadow darkness
   * on lit materials; the ground plane ShadowMaterial needs its own opacity.
   *
   * @param intensity - Shadow intensity 0-1
   */
  setShadowIntensity(intensity: number): void {
    if (this._shadowPlane) {
      (this._shadowPlane.material as THREE.ShadowMaterial).opacity =
        intensity * 1.0;
    }
  }

  /** Dispose all GPU resources. */
  dispose(): void {
    this._clearCurrent();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Create a shadow-receiving plane at the floor position.
   */
  private _createShadowPlane(zPosition: number, sceneSize: number): void {
    const floorSize = sceneSize * 6;

    const geometry = new THREE.PlaneGeometry(floorSize, floorSize);
    const material = new THREE.ShadowMaterial({
      opacity: 0.5,
      depthWrite: false,
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.position.z = zPosition;
    plane.receiveShadow = true;
    plane.name = "studioShadowPlane";

    // Start hidden; setShadowsEnabled() controls visibility
    plane.visible = this._shadowsEnabled;

    this._shadowPlane = plane;
    this.group.add(plane);
  }

  /** Remove and dispose the current shadow plane. */
  private _clearCurrent(): void {
    if (this._shadowPlane) {
      this.group.remove(this._shadowPlane);
      this._shadowPlane.geometry.dispose();
      (this._shadowPlane.material as THREE.Material).dispose();
      this._shadowPlane = null;
    }
  }
}

export { StudioFloor };

// ---------------------------------------------------------------------------
// RadiosityFloor — lightmapped ground plane for the radiosity pipeline
// ---------------------------------------------------------------------------

/** How the radiosity floor is drawn. */
export type StudioFloorMode = "shadow" | "grid" | "none";

/** Side of the lightmapped inner square, in multiples of the scene extent. */
const FLOOR_INNER = 4;
/** Side of the whole plane, in multiples of the scene extent. */
const FLOOR_OUTER = 60;

const FLOOR_VERTEX = /* glsl */ `
  attribute vec2 uv1;
  varying vec2 vUv1;
  varying vec2 vLocal;
  void main() {
    vUv1 = uv1;
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const FLOOR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uLightmap;
  uniform float uWeight;
  uniform float uShadow;
  uniform float uEnvIntensity;
  uniform vec3 uBaseColor;
  uniform vec3 uGridColor;
  uniform float uGridMinor;
  uniform float uGridMajor;
  uniform vec3 uFogColor;
  uniform float uFogStart;
  uniform float uFogEnd;
  uniform vec2 uCenter;
  varying vec2 vUv1;
  varying vec2 vLocal;

  float gridLine( vec2 coord ) {
    vec2 fw = fwidth( coord );
    vec2 g = abs( fract( coord - 0.5 ) - 0.5 ) / fw;
    float line = 1.0 - min( min( g.x, g.y ), 1.0 );
    // Lines merge into a grey haze at grazing angles: fade them out instead.
    return line * ( 1.0 - smoothstep( 0.3, 0.8, max( fw.x, fw.y ) ) );
  }

  void main() {
    vec4 lm = texture2D( uLightmap, vUv1 );
    float valid = lm.a > 1e-6 ? uWeight : 0.0;
    float lum = dot( lm.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    float vis = valid > 0.0 ? clamp( lum / lm.a, 0.0, 1.0 ) : 1.0;
    float shadowVis = 1.0 - uShadow * ( 1.0 - vis );
    #ifdef FLOOR_SHADOW
      // Shadow catcher: multiply the background by the (tinted) visibility and
      // emit the shadow as alpha so a protected solid background darkens too.
      vec3 tint = valid > 0.0 ? clamp( lm.rgb / max( lum, 1e-6 ), 0.0, 4.0 ) : vec3( 1.0 );
      vec3 mul = mix( vec3( 1.0 ), tint * shadowVis, valid );
      float fog = smoothstep( uFogStart, uFogEnd, length( vLocal - uCenter ) );
      mul = mix( mul, vec3( 1.0 ), fog );
      gl_FragColor = vec4( mul, ( 1.0 - dot( mul, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
    #else
      // Fade from the unoccluded irradiance (flat) to the occluded result
      // with the solver's fade-in weight, like the display materials.
      vec3 open = lm.a > 1e-6 ? vec3( lm.a ) : vec3( 1.0 );
      vec3 occluded = lm.rgb + vec3( max( lm.a - lum, 0.0 ) * ( 1.0 - uShadow ) );
      vec3 lifted = mix( open, occluded, valid );
      vec3 lit = lifted * uEnvIntensity;
      float dist = length( vLocal - uCenter );
      float minor = gridLine( vLocal / uGridMinor );
      float major = gridLine( vLocal / uGridMajor );
      float line = max( minor * 0.35, major * 0.7 );
      line *= 1.0 - 0.7 * smoothstep( 0.0, uFogEnd * 0.5, dist );
      vec3 albedo = mix( uBaseColor, uGridColor, line );
      vec3 color = albedo * lit;
      float fog = smoothstep( uFogStart, uFogEnd, dist );
      color = mix( color, uFogColor, fog );
      gl_FragColor = vec4( color, 1.0 );
    #endif
  }
`;

/** Palette for the opaque grid floor. */
interface FloorPalette {
  base: THREE.Color;
  grid: THREE.Color;
}

const FLOOR_PALETTES: Record<"dark" | "light", FloorPalette> = {
  dark: {
    base: new THREE.Color().setRGB(0.25, 0.27, 0.32, THREE.SRGBColorSpace),
    grid: new THREE.Color().setRGB(0.42, 0.45, 0.52, THREE.SRGBColorSpace),
  },
  light: {
    base: new THREE.Color().setRGB(0.82, 0.83, 0.85, THREE.SRGBColorSpace),
    grid: new THREE.Color().setRGB(0.58, 0.6, 0.64, THREE.SRGBColorSpace),
  },
};

/** Pick a "nice" grid step (1, 2 or 5 × 10^n) close to `target`. */
function niceStep(target: number): number {
  if (!(target > 0)) return 1;
  const exp = Math.floor(Math.log10(target));
  const base = Math.pow(10, exp);
  const f = target / base;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * base;
}

/**
 * Ground plane lit by the radiosity lightmap.
 *
 * The plane's inner square (`FLOOR_INNER` × scene extent) owns a fixed region
 * of the lightmap atlas; the outer ring extends to the horizon and repeats the
 * inner edge's lighting (its `uv1` is clamped to the chart border), which is
 * unoccluded out there anyway. Two looks:
 *
 * - `shadow`: invisible shadow catcher — multiplies whatever background is
 *   behind it by the lightmap visibility (tinted by the environment colour).
 * - `grid`: opaque dark/light floor with a world-unit grid, lit by the
 *   lightmap (colour bleeding and soft contact shadows included).
 */
class RadiosityFloor {
  /** Group to add to the scene (separate from the shadow-map floor). */
  readonly group: THREE.Group;

  private _mesh: THREE.Mesh | null = null;
  private _geometry: THREE.BufferGeometry | null = null;
  private _shadowMaterial: THREE.ShaderMaterial;
  private _gridMaterial: THREE.ShaderMaterial;
  private _mode: StudioFloorMode = "shadow";
  private _palette: FloorPalette = FLOOR_PALETTES.dark;
  private _background: THREE.Color | null = null;
  private _albedo = new THREE.Color(0.35, 0.35, 0.35);
  private _emissive = new THREE.Color(0, 0, 0);
  private _innerSize = 1;
  /** Corner flags (0/1 per vertex) of the inner square, the source for `setAtlasRect`. */
  private _cornerUv: Float32Array | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "studioRadiosityFloor";
    this.group.visible = false;

    const uniforms = (): Record<string, THREE.IUniform> => ({
      uLightmap: { value: null },
      uWeight: { value: 0 },
      uShadow: { value: 0.5 },
      uEnvIntensity: { value: 1 },
      uBaseColor: { value: this._palette.base.clone() },
      uGridColor: { value: this._palette.grid.clone() },
      uGridMinor: { value: 1 },
      uGridMajor: { value: 10 },
      uFogColor: { value: this._palette.base.clone() },
      uFogStart: { value: 1 },
      uFogEnd: { value: 2 },
      uCenter: { value: new THREE.Vector2() },
    });

    this._shadowMaterial = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERTEX,
      fragmentShader: FLOOR_FRAGMENT,
      uniforms: uniforms(),
      defines: { FLOOR_SHADOW: 1 },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // rgb: multiply the background; alpha: add the shadow amount so a
      // transparent (background-protected) frame darkens the canvas colour.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this._shadowMaterial.name = "radiosityFloorShadow";

    this._gridMaterial = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERTEX,
      fragmentShader: FLOOR_FRAGMENT,
      uniforms: uniforms(),
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });
    this._gridMaterial.name = "radiosityFloorGrid";
    // fwidth() needs standard derivatives (core in WebGL2).
    this._gridMaterial.extensions = { derivatives: true } as never;
  }

  /** The floor mesh (null before `configure`). */
  get mesh(): THREE.Mesh | null {
    return this._mesh;
  }

  /** Geometry carrying the floor's `uv1`. */
  get geometry(): THREE.BufferGeometry | null {
    return this._geometry;
  }

  /** World size of the lightmapped inner square. */
  get innerSize(): number {
    return this._innerSize;
  }

  get mode(): StudioFloorMode {
    return this._mode;
  }

  /** Diffuse albedo used for the bounce (grid colour, or mid grey for the catcher). */
  albedo(): THREE.Color {
    return this._mode === "grid"
      ? this._albedo.copy(this._palette.base)
      : this._albedo.setRGB(0.35, 0.35, 0.35);
  }

  emissive(): THREE.Color {
    return this._emissive;
  }

  /**
   * Build the plane for the given scene bounds.
   *
   * @param center - World center of the model bounds
   * @param level  - Floor coordinate along the up axis
   * @param extent - Max extent of the model bounds
   * @param up     - "Y" or "Z"
   */
  configure(
    center: THREE.Vector3,
    level: number,
    extent: number,
    up: "Y" | "Z",
  ): void {
    this._clear();
    const inner = FLOOR_INNER * extent;
    const outer = FLOOR_OUTER * extent;
    this._innerSize = inner;

    // The plane lies in the local XY plane (normal +Z) and is rotated for
    // Y-up scenes; its vertices are offset so the inner square sits under the
    // model while the grid stays aligned with the world axes.
    const cx = center.x;
    const cy = up === "Y" ? -center.z : center.y;

    // 4x4 vertex grid: inner square plus a ring to the horizon. The ring's
    // uv1 repeats the inner border so the lightmap extrapolates outward.
    const xs = [-outer, -inner / 2, inner / 2, outer];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const uv1: number[] = [];
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        positions.push(xs[i] + cx, xs[j] + cy, 0);
        normals.push(0, 0, 1);
        const u = i <= 1 ? 0 : 1;
        const v = j <= 1 ? 0 : 1;
        uvs.push(u, v);
        uv1.push(u, v);
      }
    }
    const index: number[] = [];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const a = j * 4 + i;
        const b = a + 1;
        const c = a + 4;
        const d = c + 1;
        index.push(a, b, d, a, d, c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(uv1, 2));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    this._geometry = geometry;
    this._cornerUv = Float32Array.from(uv1);

    const mesh = new THREE.Mesh(geometry, this._currentMaterial());
    mesh.name = "studioRadiosityFloorPlane";
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    this._mesh = mesh;
    if (up === "Y") {
      mesh.rotation.x = -Math.PI / 2; // local (x, y, z) → world (x, -z, y)
      mesh.position.set(0, level, 0);
    } else {
      mesh.position.set(0, 0, level);
    }
    this.group.add(mesh);
    mesh.updateMatrixWorld(true);

    // Grid spacing from the model size; fog from the inner square outward.
    const minor = niceStep(extent / 8);
    for (const mat of [this._shadowMaterial, this._gridMaterial]) {
      const u = mat.uniforms;
      u.uGridMinor.value = minor;
      u.uGridMajor.value = minor * 5;
      u.uFogStart.value = inner * 0.5;
      u.uFogEnd.value = inner * 3;
      (u.uCenter.value as THREE.Vector2).set(cx, cy);
    }
    this._applyPalette();
  }

  /** Map the inner square's uv1 to a packed atlas rect (texels). */
  setAtlasRect(
    x: number,
    y: number,
    w: number,
    h: number,
    resolution: number,
  ): void {
    if (!this._geometry || !this._cornerUv) return;
    const attr = this._geometry.getAttribute("uv1") as THREE.BufferAttribute;
    // Always map from the original corner flags: the attribute itself holds
    // atlas coordinates after the first call, so it cannot be re-derived.
    for (let i = 0; i < attr.count; i++) {
      const u = this._cornerUv[i * 2];
      const v = this._cornerUv[i * 2 + 1];
      attr.setXY(i, (x + u * w) / resolution, (y + v * h) / resolution);
    }
    attr.needsUpdate = true;
  }

  setLightmap(texture: THREE.Texture | null, weight: number): void {
    for (const mat of [this._shadowMaterial, this._gridMaterial]) {
      mat.uniforms.uLightmap.value = texture;
      mat.uniforms.uWeight.value = weight;
    }
  }

  setMode(mode: StudioFloorMode): void {
    this._mode = mode;
    if (this._mesh) this._mesh.material = this._currentMaterial();
    this.group.visible = mode !== "none" && this._mesh !== null;
  }

  setShadowIntensity(value: number): void {
    for (const mat of [this._shadowMaterial, this._gridMaterial]) {
      mat.uniforms.uShadow.value = value;
    }
  }

  setEnvIntensity(value: number): void {
    this._gridMaterial.uniforms.uEnvIntensity.value = value;
  }

  /**
   * Choose the floor palette and the colour the far floor fades into.
   *
   * @param light      - Light palette (for white/light backgrounds)
   * @param background - Solid background colour to fade into, or null
   */
  setAppearance(light: boolean, background: THREE.Color | null): void {
    this._palette = light ? FLOOR_PALETTES.light : FLOOR_PALETTES.dark;
    this._background = background;
    this._applyPalette();
  }

  dispose(): void {
    this._clear();
    this._shadowMaterial.dispose();
    this._gridMaterial.dispose();
  }

  private _currentMaterial(): THREE.ShaderMaterial {
    return this._mode === "grid" ? this._gridMaterial : this._shadowMaterial;
  }

  private _applyPalette(): void {
    const u = this._gridMaterial.uniforms;
    (u.uBaseColor.value as THREE.Color).copy(this._palette.base);
    (u.uGridColor.value as THREE.Color).copy(this._palette.grid);
    (u.uFogColor.value as THREE.Color).copy(
      this._background ?? this._palette.base,
    );
  }

  private _clear(): void {
    if (this._mesh) {
      this.group.remove(this._mesh);
      this._mesh = null;
    }
    if (this._geometry) {
      this._geometry.dispose();
      this._geometry = null;
    }
    this._cornerUv = null;
  }
}

export { RadiosityFloor };
