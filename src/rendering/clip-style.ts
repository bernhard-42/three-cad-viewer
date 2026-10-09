/**
 * Section hatching for clip caps (CAD mode, shader-only). The per-solid cap quads
 * draw hatch lines anchored to the plane (stable while rotating/panning) whose
 * spacing is kept at a constant pixel distance by a per-frame world-per-pixel
 * uniform. The outline of the caps is drawn separately (see cap-outline.ts); for its
 * id pass the same cap shader can output the cap's id instead of its color.
 *
 * All shared uniforms are plain `{ value }` objects held by reference, so a single
 * write (e.g. the per-frame hatch spacing) updates every patched material without a
 * recompile.
 */
import * as THREE from "three";

/** Distance between hatch lines in pixels. */
export const HATCH_SPACING_PX = 8;
/** Width of a hatch line in pixels. */
export const HATCH_LINE_WIDTH_PX = 1;
/**
 * Hatch angle (radians) and spacing factor per solid, cycled by the solid's index
 * so that neighbouring solids are told apart (drawing convention: alternate the
 * hatch direction between adjacent parts).
 */
const HATCH_VARIANTS: ReadonlyArray<{ angle: number; scale: number }> = [
  { angle: Math.PI / 4, scale: 1.0 },
  { angle: (3 * Math.PI) / 4, scale: 1.0 },
  { angle: Math.PI / 4, scale: 1.6 },
  { angle: (3 * Math.PI) / 4, scale: 1.6 },
];

/** Uniforms shared by all hatch patched cap materials of one clipping setup. */
export interface HatchUniforms {
  /** World units between hatch lines (before the per-solid scale); set per frame. */
  uHatchSpacing: { value: number };
  /** Half the cap quad size: maps the quad's [-1, 1] geometry to plane units. */
  uCapHalfSize: { value: number };
  uHatchLineWidth: { value: number };
  uHatchOn: { value: number };
  /** 1 while the cap outline id pass renders: caps output their id, not a color. */
  uCapIdPass: { value: number };
}

export function createHatchUniforms(capHalfSize: number): HatchUniforms {
  return {
    uHatchSpacing: { value: 1 },
    uCapHalfSize: { value: capHalfSize },
    uHatchLineWidth: { value: HATCH_LINE_WIDTH_PX },
    uHatchOn: { value: 1 },
    uCapIdPass: { value: 0 },
  };
}

/**
 * World units covered by one screen pixel at the given point (exact for an
 * orthographic camera; at the point's distance for a perspective camera).
 */
export function worldPerPixel(
  camera: THREE.Camera,
  point: THREE.Vector3,
  height: number,
): number {
  if (height <= 0) return 1;
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / height;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const dist = camera.position.distanceTo(point);
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    return (2 * dist * Math.tan(halfFov)) / camera.zoom / height;
  }
  return 1;
}

function replaceOrThrow(
  source: string,
  anchor: string,
  replacement: string,
  where: string,
): string {
  if (!source.includes(anchor)) {
    throw new Error(`${where}: shader anchor "${anchor}" not found`);
  }
  return source.replace(anchor, replacement);
}

/**
 * Patch a cap quad material to draw section hatching. `index` is the solid's index
 * among the caps of its plane; it selects the hatch direction and spacing. `capId`
 * is the cap's unique id color for the outline id pass (see `capIdColor`).
 */
export function patchHatchMaterial(
  material: THREE.Material,
  uniforms: HatchUniforms,
  index: number,
  capId: THREE.Vector3,
): void {
  if (material.userData.hatchPatched === true) return;
  material.userData.hatchPatched = true;
  const variant = HATCH_VARIANTS[index % HATCH_VARIANTS.length];
  const uHatchAngle = { value: variant.angle };
  const uHatchScale = { value: variant.scale };
  const uCapId = { value: capId };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uHatchSpacing = uniforms.uHatchSpacing;
    shader.uniforms.uCapHalfSize = uniforms.uCapHalfSize;
    shader.uniforms.uHatchLineWidth = uniforms.uHatchLineWidth;
    shader.uniforms.uHatchOn = uniforms.uHatchOn;
    shader.uniforms.uHatchAngle = uHatchAngle;
    shader.uniforms.uHatchScale = uHatchScale;
    shader.uniforms.uCapIdPass = uniforms.uCapIdPass;
    shader.uniforms.uCapId = uCapId;
    shader.vertexShader =
      "uniform float uCapHalfSize;\nvarying vec2 vTcvCapUV;\n" +
      replaceOrThrow(
        shader.vertexShader,
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vTcvCapUV = position.xy * uCapHalfSize;",
        "patchHatchMaterial",
      );
    shader.fragmentShader =
      "uniform float uHatchSpacing;\nuniform float uHatchLineWidth;\nuniform float uHatchOn;\n" +
      "uniform float uHatchAngle;\nuniform float uHatchScale;\nvarying vec2 vTcvCapUV;\n" +
      "uniform float uCapIdPass;\nuniform vec3 uCapId;\n" +
      shader.fragmentShader;
    // Hatch the unlit base color, before lighting: the ink (dark lines on light
    // parts, light lines on dark parts) is then fixed per part, and lines and cap
    // darken together when the cap turns away from the light.
    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      "#include <color_fragment>",
      /* glsl */ `#include <color_fragment>
  if ( uHatchOn > 0.5 ) {
    vec2 tcvAcross = vec2( - sin( uHatchAngle ), cos( uHatchAngle ) );
    float t = dot( vTcvCapUV, tcvAcross ) / max( uHatchSpacing * uHatchScale, 1e-9 );
    float tw = max( fwidth( t ), 1e-6 );
    float dpx = ( 0.5 - abs( fract( t ) - 0.5 ) ) / tw;
    float line = 1.0 - smoothstep( 0.5 * uHatchLineWidth - 0.5, 0.5 * uHatchLineWidth + 0.5, dpx );
    // Seen edge-on the lines crowd below a few pixels apart and would merge into
    // solid ink: fade them out between 4 and 2 px spacing (1 / tw = px per line).
    line *= smoothstep( 2.0, 4.0, 1.0 / tw );
    float lum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    vec3 ink = lum > 0.2 ? diffuseColor.rgb * 0.3 : mix( diffuseColor.rgb, vec3( 1.0 ), 0.6 );
    diffuseColor.rgb = mix( diffuseColor.rgb, ink, line );
  }`,
      "patchHatchMaterial",
    );
    shader.fragmentShader = replaceOrThrow(
      shader.fragmentShader,
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
  if ( uCapIdPass > 0.5 ) gl_FragColor = vec4( uCapId, 1.0 );`,
      "patchHatchMaterial",
    );
  };
  material.needsUpdate = true;
}
