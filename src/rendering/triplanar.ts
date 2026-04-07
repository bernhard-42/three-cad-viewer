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
 * Handles: map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap,
 *          clearcoatNormalMap, alphaMap.
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

// normalMatrix is only declared in the fragment shader for object-space
// normal maps. We need it for triplanar tangent-space normal mapping too.
#ifndef USE_NORMALMAP_OBJECTSPACE
uniform mat3 normalMatrix;
#endif

// --- Global triplanar state (computed once, reused by all samples) ---
vec2 tri_uvX, tri_uvY, tri_uvZ;
vec3 tri_blend;

// Initialize global triplanar UVs and blend weights from varyings.
// Must be called before any texture sampling.
void initTriplanarUVs() {
  tri_blend = abs(vTriplanarNormal);
  tri_blend = pow(tri_blend, vec3(3.0));
  tri_blend /= (tri_blend.x + tri_blend.y + tri_blend.z);
  vec3 p = (vTriplanarPos - triplanarOffset) * triplanarScale;
  vec2 r = triplanarRepeat;
  tri_uvX = p.yz * r;
  tri_uvY = p.xz * r;
  tri_uvZ = p.xy * r;
}

// Sample a texture using the global triplanar UVs and blend weights.
vec4 triplanarSample(sampler2D tex) {
  return texture2D(tex, tri_uvX) * tri_blend.x
       + texture2D(tex, tri_uvY) * tri_blend.y
       + texture2D(tex, tri_uvZ) * tri_blend.z;
}

// Surface-gradient triplanar normal mapping.
// Instead of constructing full 3D normals per axis (which creates faceted
// shading at axis boundaries), we extract the tangent-space perturbation (xy)
// from each axis sample, project it into model space as a gradient, blend
// the gradients, and add to the geometric normal. Gradients blend smoothly.
// Ref: Morten Mikkelsen, "Surface Gradient Based Bump Mapping Framework"
//
// normalScale is declared in normalmap_pars_fragment (after this header),
// so we accept it as a parameter to avoid forward-reference errors.
vec3 triplanarNormal(sampler2D normalTex, vec2 nScale) {
  vec3 N = vTriplanarNormal;

  // Sample tangent-space normals for each projection axis
  vec3 tnX = texture2D(normalTex, tri_uvX).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D(normalTex, tri_uvY).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D(normalTex, tri_uvZ).xyz * 2.0 - 1.0;

  // Apply normal scale to perturbation components
  tnX.xy *= nScale;
  tnY.xy *= nScale;
  tnZ.xy *= nScale;

  // Project each tangent-space perturbation (xy) into model space.
  // X proj: UV=(y,z) -> tangent=(0,1,0), bitangent=(0,0,1) -> grad=(0, tx, ty)
  // Y proj: UV=(x,z) -> tangent=(1,0,0), bitangent=(0,0,1) -> grad=(tx, 0, ty)
  // Z proj: UV=(x,y) -> tangent=(1,0,0), bitangent=(0,1,0) -> grad=(tx, ty, 0)
  vec3 surfGrad =
      vec3(0.0, tnX.x, tnX.y) * tri_blend.x +
      vec3(tnY.x, 0.0, tnY.y) * tri_blend.y +
      vec3(tnZ.x, tnZ.y, 0.0) * tri_blend.z;

  return normalize(N + surfGrad);
}
`;

// ---------------------------------------------------------------------------
// GLSL: UV initialization injection
// ---------------------------------------------------------------------------

/**
 * Injected after #include <logdepthbuf_fragment>.
 * This is the earliest reliable point in the fragment shader before any
 * texture sampling. Initializes global triplanar UVs.
 */
const UV_INIT = /* glsl */ `
#include <logdepthbuf_fragment>
initTriplanarUVs();
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
 * Tangent-space path: triplanar normal mapping samples the normal map 3x
 * (one per projection axis), swizzles each to model space, blends, and
 * transforms to view space via normalMatrix.
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
  // Triplanar normal mapping: sample normal map 3x (one per projection axis),
  // swizzle each to model space, blend, and transform to view space.
  normal = normalize(normalMatrix * triplanarNormal(normalMap, normalScale));

#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );

#endif
`;

/**
 * Replaces #include <clearcoat_normal_fragment_maps>.
 * Triplanar clearcoat normal mapping using surface gradient blending.
 */
const CLEARCOAT_NORMAL_FRAGMENT_MAPS = /* glsl */ `
#ifdef USE_CLEARCOAT_NORMALMAP
  // Reuse triplanarNormal with clearcoat normal map and scale
  vec3 clearcoatModelNormal = triplanarNormal(clearcoatNormalMap, clearcoatNormalScale);
  clearcoatNormal = normalize(normalMatrix * clearcoatModelNormal);
#endif
`;

/** Replaces #include <alphamap_fragment> */
const ALPHAMAP_FRAGMENT = /* glsl */ `
#ifdef USE_ALPHAMAP
  diffuseColor.a *= triplanarSample( alphaMap ).g;
#endif
`;

// ---------------------------------------------------------------------------
// Chunk replacement table
// ---------------------------------------------------------------------------

/** Fragment shader chunk replacements */
const FRAGMENT_CHUNK_REPLACEMENTS: [string, string][] = [
  ["#include <logdepthbuf_fragment>", UV_INIT],
  ["#include <map_fragment>", MAP_FRAGMENT],
  ["#include <roughnessmap_fragment>", ROUGHNESSMAP_FRAGMENT],
  ["#include <metalnessmap_fragment>", METALNESSMAP_FRAGMENT],
  ["#include <emissivemap_fragment>", EMISSIVEMAP_FRAGMENT],
  ["#include <aomap_fragment>", AOMAP_FRAGMENT],
  ["#include <normal_fragment_maps>", NORMAL_FRAGMENT_MAPS],
  ["#include <clearcoat_normal_fragment_maps>", CLEARCOAT_NORMAL_FRAGMENT_MAPS],
  ["#include <alphamap_fragment>", ALPHAMAP_FRAGMENT],
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

  // Read texture repeat from the first available texture map
  const repeat = (
    material.map ?? material.roughnessMap ?? material.normalMap ??
    material.metalnessMap ?? material.emissiveMap ?? material.aoMap
  )?.repeat?.clone() ?? new THREE.Vector2(1, 1);

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
    for (const [from, to] of FRAGMENT_CHUNK_REPLACEMENTS) {
      shader.fragmentShader = shader.fragmentShader.replace(from, to);
    }
  };

  // All triplanar materials share the same compiled WebGL program
  // (uniform values differ per instance). Appended to Three.js's standard
  // program cache key, so materials with different maps/flags still get
  // separate programs.
  material.customProgramCacheKey = () => "triplanar";
}
