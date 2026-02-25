/**
 * Triplanar texture mapping for MeshPhysicalMaterial.
 *
 * Replaces standard UV-based texture sampling with model-space triplanar
 * projection via `material.onBeforeCompile`. Eliminates seams on curved
 * surfaces (cylinders, cones, etc.) and maintains uniform texture scale
 * regardless of object proportions.
 *
 * All coordinates are in **model space** to match the geometry's bounding box.
 * `transformed` (model-space position) and `objectNormal` (model-space normal)
 * are used — NOT the view-space `transformedNormal`.
 *
 * NOTE: `onBeforeCompile` receives shaders BEFORE `#include` resolution.
 * Therefore we replace `#include <chunk_name>` directives with inline GLSL
 * that uses triplanar sampling, rather than replacing expanded texture2D calls.
 *
 * Handles: map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap.
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// GLSL: Varyings (shared between vertex & fragment)
// ---------------------------------------------------------------------------

const TRIPLANAR_VARYINGS = /* glsl */ `
varying vec3 vTriplanarPos;
varying vec3 vTriplanarNormal;
`;

// ---------------------------------------------------------------------------
// GLSL: Fragment header (uniforms + helper functions)
// ---------------------------------------------------------------------------

const TRIPLANAR_FRAGMENT_HEADER = /* glsl */ `
varying vec3 vTriplanarPos;
varying vec3 vTriplanarNormal;
uniform vec3 triplanarOffset;
uniform float triplanarScale;
uniform vec2 triplanarRepeat;

vec4 triplanarSample(sampler2D tex) {
  vec3 blend = abs(vTriplanarNormal);
  blend = pow(blend, vec3(3.0));
  blend /= (blend.x + blend.y + blend.z);
  vec3 p = (vTriplanarPos - triplanarOffset) * triplanarScale;
  vec2 r = triplanarRepeat;
  return texture2D(tex, p.yz * r) * blend.x
       + texture2D(tex, p.xz * r) * blend.y
       + texture2D(tex, p.xy * r) * blend.z;
}
`;

// ---------------------------------------------------------------------------
// GLSL: Replacement chunks (inline GLSL replacing #include directives)
// ---------------------------------------------------------------------------

/** Replaces #include <map_fragment> */
const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = triplanarSample( map );
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
`;

/** Replaces #include <roughnessmap_fragment> */
const ROUGHNESSMAP_FRAGMENT = /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = triplanarSample( roughnessMap );
  roughnessFactor *= texelRoughness.g;
#endif
`;

/** Replaces #include <metalnessmap_fragment> */
const METALNESSMAP_FRAGMENT = /* glsl */ `
float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
  vec4 texelMetalness = triplanarSample( metalnessMap );
  metalnessFactor *= texelMetalness.b;
#endif
`;

/** Replaces #include <emissivemap_fragment> */
const EMISSIVEMAP_FRAGMENT = /* glsl */ `
#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = triplanarSample( emissiveMap );
  #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
    emissiveColor = sRGBTransferEOTF( emissiveColor );
  #endif
  totalEmissiveRadiance *= emissiveColor.rgb;
#endif
`;

/** Replaces #include <aomap_fragment> */
const AOMAP_FRAGMENT = /* glsl */ `
#ifdef USE_AOMAP
  float ambientOcclusion = ( triplanarSample( aoMap ).r - 1.0 ) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
#endif
`;

/**
 * Replaces #include <normal_fragment_maps>.
 * Object-space and bumpmap paths kept as-is.
 * Tangent-space path: SKIPPED for triplanar. CAD tessellation provides smooth,
 * correct geometric normals. Triplanar normal mapping creates box-like lighting
 * because the three projection axes produce incompatible bump directions at
 * boundaries. The geometric `normal` (set in normal_fragment_begin from vNormal)
 * is kept unchanged.
 */
const NORMAL_FRAGMENT_MAPS = /* glsl */ `
#ifdef USE_NORMALMAP_OBJECTSPACE
  normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  #ifdef FLIP_SIDED
    normal = - normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );

#elif defined( USE_NORMALMAP_TANGENTSPACE )
  // Triplanar: skip tangent-space normal map. Geometric normals from CAD
  // tessellation are already smooth and correct. Keep normal as-is.

#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );

#endif
`;

// ---------------------------------------------------------------------------
// Chunk replacement table
// ---------------------------------------------------------------------------

const CHUNK_REPLACEMENTS: [string, string][] = [
  ["#include <map_fragment>", MAP_FRAGMENT],
  ["#include <roughnessmap_fragment>", ROUGHNESSMAP_FRAGMENT],
  ["#include <metalnessmap_fragment>", METALNESSMAP_FRAGMENT],
  ["#include <emissivemap_fragment>", EMISSIVEMAP_FRAGMENT],
  ["#include <aomap_fragment>", AOMAP_FRAGMENT],
  ["#include <normal_fragment_maps>", NORMAL_FRAGMENT_MAPS],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply triplanar texture mapping to a MeshPhysicalMaterial.
 *
 * Modifies the material's shader via `onBeforeCompile` so that all texture
 * lookups use model-space triplanar projection instead of UV coordinates.
 * The material should be a **clone** (not shared) because `onBeforeCompile`
 * and `customProgramCacheKey` are set on it.
 *
 * Bounding box of the geometry determines coordinate normalization: the
 * texture tiles once across the largest dimension with uniform scale,
 * preserving aspect ratio. `textureRepeat` on the material's textures
 * (if set) is respected via the triplanarRepeat uniform.
 *
 * @param material - Material clone to modify
 * @param geometry - Geometry for bounding box computation
 */
export function applyTriplanarMapping(
  material: THREE.MeshPhysicalMaterial,
  geometry: THREE.BufferGeometry,
): void {
  // Compute bounding box for coordinate normalization (model space)
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);

  // Uniform values (captured by closure, per-object)
  const offset = bb.min.clone();
  const scale = 1.0 / maxDim;

  // Read texture repeat from the material's map (all textures share same repeat)
  const repeat = material.map?.repeat?.clone() ?? new THREE.Vector2(1, 1);

  material.onBeforeCompile = (shader) => {
    // Custom uniforms
    shader.uniforms.triplanarOffset = { value: offset };
    shader.uniforms.triplanarScale = { value: scale };
    shader.uniforms.triplanarRepeat = { value: repeat };

    // --- Vertex shader ---
    // Declare varyings
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${TRIPLANAR_VARYINGS}`,
    );

    // Pass model-space position and normal to fragment shader.
    // `transformed` = model-space position (after morphing, before view transform)
    // `objectNormal` = model-space normal (before normalMatrix)
    // Both match the geometry's bounding box coordinate space.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
      vTriplanarPos = transformed;
      vTriplanarNormal = normalize(objectNormal);`,
    );

    // --- Fragment shader ---
    // Inject varyings, uniforms, and the triplanarSample helper
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${TRIPLANAR_FRAGMENT_HEADER}`,
    );

    // Replace texture-sampling #include chunks with triplanar versions
    for (const [from, to] of CHUNK_REPLACEMENTS) {
      shader.fragmentShader = shader.fragmentShader.replace(from, to);
    }
  };

  // All triplanar materials share the same compiled WebGL program
  // (uniform values differ per instance). Appended to Three.js's standard
  // program cache key, so materials with different maps/flags still get
  // separate programs.
  material.customProgramCacheKey = () => "triplanar";
}
