/**
 * Screen-space outline of the clip caps (CAD mode).
 *
 * The caps carry no geometry of their own outline, and the faces next to a cut may
 * face away from the camera or belong to a touching solid, so the outline is found
 * in screen space instead:
 *
 * 1. Id pass into an offscreen target (color + depth + stencil):
 *    - visible faces as black occluders (face pick layer + override material), so a
 *      cap hidden behind another part gets no outline; face pixels within the line
 *      width of a clip plane write {@link CUT_EDGE_ID} instead, which draws the cut
 *      contour on the faces themselves (needed when the caps are behind the faces),
 *    - the stencil meshes and caps (on {@link CAP_LAYER}) with each cap writing its
 *      own id instead of its shaded color — the same stencil sequence as the main
 *      render, since three orders them identically (material creation order).
 * 2. Composite over the canvas: a pixel is drawn in the edge color when its id is
 *    larger than a neighbour's id, which yields a line on one side of every boundary
 *    cap↔cap, cap↔surface and cap↔background. Cut-edge pixels are the largest id, so
 *    where they meet a cap only they are drawn — one line, not two.
 */
import * as THREE from "three";
import { PICK_LAYER } from "./id-picking.js";

/** Render layer of the clip stencil meshes and cap quads (pick layers use 1-3). */
export const CAP_LAYER = 4;

/** Id of face pixels on the cut contour (larger than any cap id). */
export const CUT_EDGE_ID = 0xffffff;

/** Encode a cap id (1..2^24-1) as an exact 8-bit RGB color (0 = no cap). */
export function capIdColor(id: number): THREE.Vector3 {
  return new THREE.Vector3(
    (id & 0xff) / 255,
    ((id >> 8) & 0xff) / 255,
    ((id >> 16) & 0xff) / 255,
  );
}

// Occluder: a face fragment lies on the cut contour when it is within uCutWidth
// pixels of a clip plane that bounds the visible part, mirroring three's
// clipping_planes_fragment (kept fragments have d >= 0). Skipped where the face is
// (nearly) parallel to the plane: there d barely changes across the pixel, and a
// face lying in the plane would otherwise become one big edge.
const CUT_EDGE_GLSL = /* glsl */ `
bool tcvCut = false;
#if NUM_CLIPPING_PLANES > 0
  {
    float tcvPosGrad = length( fwidth( vClipPosition ) );
    float tcvD[ NUM_CLIPPING_PLANES ];
    bool tcvNear[ NUM_CLIPPING_PLANES ];
    for ( int i = 0; i < NUM_CLIPPING_PLANES; i ++ ) {
      vec4 p = clippingPlanes[ i ];
      float d = p.w - dot( vClipPosition, p.xyz );
      // Step of d per pixel along the dominant screen axis — the same 1-pixel
      // convention as the composite's horizontal/vertical neighbour test.
      float g = max( abs( dFdx( d ) ), abs( dFdy( d ) ) );
      tcvD[ i ] = d;
      tcvNear[ i ] = g > 0.05 * tcvPosGrad && d >= 0.0 && d < uCutWidth * g;
    }
    for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
      tcvCut = tcvCut || tcvNear[ i ];
    }
    #if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
      // Intersection planes: plane i bounds the visible part only where every
      // other intersection plane clips.
      for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
        bool othersClip = true;
        for ( int j = UNION_CLIPPING_PLANES; j < NUM_CLIPPING_PLANES; j ++ ) {
          if ( j != i && tcvD[ j ] >= 0.0 ) othersClip = false;
        }
        if ( othersClip && tcvNear[ i ] ) tcvCut = true;
      }
    #endif
  }
#endif
`;

const COMPOSITE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tId;
uniform vec2 uTexel;
uniform float uWidth;
uniform vec3 uColor;
varying vec2 vUv;

float idAt( vec2 uv ) {
  vec3 c = floor( texture2D( tId, uv ).rgb * 255.0 + 0.5 );
  return c.r + 256.0 * c.g + 65536.0 * c.b;
}

void main() {
  float c = idAt( vUv );
  bool edge = c == ${CUT_EDGE_ID.toFixed(1)};
  for ( int k = 1; k <= 4; k ++ ) {
    if ( float( k ) > uWidth ) break;
    vec2 o = uTexel * float( k );
    edge = edge
      || c > idAt( vUv + vec2( o.x, 0.0 ) ) || c > idAt( vUv - vec2( o.x, 0.0 ) )
      || c > idAt( vUv + vec2( 0.0, o.y ) ) || c > idAt( vUv - vec2( 0.0, o.y ) );
  }
  if ( ! edge ) discard;
  gl_FragColor = vec4( uColor, 1.0 );
  #include <colorspace_fragment>
}
`;

/** Per-frame inputs of {@link CapOutlinePass.render}. */
export interface CapOutlineOptions {
  /** Clip planes and mode of the face materials (for the occluders). */
  planes: THREE.Plane[];
  intersection: boolean;
  /** Draw faces as occluders (off in transparent mode: caps show through faces). */
  occlude: boolean;
  /** Outline color (sRGB hex). */
  color: number;
  /** Switch the cap materials between shaded output and id output. */
  setCapIdPass: (flag: boolean) => void;
}

export class CapOutlinePass {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly occluder: THREE.MeshBasicMaterial;
  /** Width of the cut contour on the faces, in device pixels (= outline width). */
  private readonly cutWidth = { value: 1 };
  private readonly composite: THREE.ShaderMaterial;
  private readonly quadScene: THREE.Scene;
  private readonly quadCamera: THREE.OrthographicCamera;
  private readonly quad: THREE.Mesh;
  private readonly size = new THREE.Vector2();
  private readonly savedClearColor = new THREE.Color();
  private readonly savedViewport = new THREE.Vector4();

  constructor() {
    // One depth unit behind the caps (polygonOffset 1/1), so a face coplanar with a
    // cap does not hide it; same slope factor, so steep faces in front still occlude.
    this.occluder = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    this.occluder.onBeforeCompile = (shader) => {
      const clipAnchor = "#include <clipping_planes_fragment>";
      const opaqueAnchor = "#include <opaque_fragment>";
      for (const anchor of [clipAnchor, opaqueAnchor]) {
        if (!shader.fragmentShader.includes(anchor)) {
          throw new Error(
            `CapOutlinePass: shader anchor "${anchor}" not found`,
          );
        }
      }
      shader.uniforms.uCutWidth = this.cutWidth;
      shader.fragmentShader =
        "uniform float uCutWidth;\n" +
        shader.fragmentShader
          .replace(clipAnchor, `${clipAnchor}\n${CUT_EDGE_GLSL}`)
          .replace(
            opaqueAnchor,
            `${opaqueAnchor}\n  if ( tcvCut ) gl_FragColor = vec4( 1.0 );`,
          );
    };
    this.composite = new THREE.ShaderMaterial({
      uniforms: {
        tId: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uWidth: { value: 1 },
        uColor: { value: new THREE.Color() },
      },
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  private ensureTarget(width: number, height: number): THREE.WebGLRenderTarget {
    if (this.target === null) {
      this.target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
        depthBuffer: true,
        stencilBuffer: true,
      });
    } else if (this.target.width !== width || this.target.height !== height) {
      this.target.setSize(width, height);
    }
    return this.target;
  }

  /**
   * Render the id pass and draw the outline over the current (canvas) framebuffer.
   * Call right after the main scene render.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: CapOutlineOptions,
  ): void {
    renderer.getDrawingBufferSize(this.size);
    const width = Math.floor(this.size.x);
    const height = Math.floor(this.size.y);
    if (width < 1 || height < 1) return;
    const target = this.ensureTarget(width, height);
    // Line width in device pixels, shared by the cut contour and the cap outline.
    const lineWidth = Math.max(1, Math.round(renderer.getPixelRatio()));
    this.cutWidth.value = lineWidth;

    const savedMask = camera.layers.mask;
    const savedOverride = scene.overrideMaterial;
    const savedBackground = scene.background;
    const savedTarget = renderer.getRenderTarget();
    const savedAutoClear = renderer.autoClear;
    const savedAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.savedClearColor);
    renderer.getViewport(this.savedViewport);

    try {
      renderer.autoClear = false;
      scene.background = null;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0); // id 0 = no cap
      renderer.clear(true, true, true);

      if (options.occlude) {
        this.occluder.clippingPlanes = options.planes;
        this.occluder.clipIntersection = options.intersection;
        camera.layers.set(PICK_LAYER.FACE);
        scene.overrideMaterial = this.occluder;
        renderer.render(scene, camera);
        scene.overrideMaterial = savedOverride;
      }

      options.setCapIdPass(true);
      try {
        camera.layers.set(CAP_LAYER);
        renderer.render(scene, camera);
      } finally {
        options.setCapIdPass(false);
      }

      renderer.setRenderTarget(savedTarget);
      renderer.setViewport(this.savedViewport);
      const u = this.composite.uniforms;
      u.tId.value = target.texture;
      (u.uTexel.value as THREE.Vector2).set(1 / width, 1 / height);
      u.uWidth.value = lineWidth;
      (u.uColor.value as THREE.Color).set(options.color);
      renderer.render(this.quadScene, this.quadCamera);
    } finally {
      camera.layers.mask = savedMask;
      scene.overrideMaterial = savedOverride;
      scene.background = savedBackground;
      renderer.setRenderTarget(savedTarget);
      renderer.setClearColor(this.savedClearColor, savedAlpha);
      renderer.setViewport(this.savedViewport);
      renderer.autoClear = savedAutoClear;
    }
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
    this.occluder.dispose();
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}
