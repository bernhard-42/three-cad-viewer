/**
 * PCSS (Percentage Closer Soft Shadows) for Studio mode.
 *
 * Patches Three.js's `shadowmap_pars_fragment` shader chunk to replace
 * the BasicShadowMap single-sample depth test with a multi-sample PCSS
 * algorithm that produces contact-hardening soft shadows:
 *
 * 1. **Blocker search**: Poisson-disk sample the shadow map to find average
 *    occluder depth near the current fragment.
 * 2. **Penumbra estimation**: Use parallel-plane approximation to compute
 *    how wide the shadow penumbra should be at this distance.
 * 3. **Variable-width PCF**: Apply a PCF filter whose radius matches the
 *    estimated penumbra — shadows are sharp near contact and soft far away.
 *
 * Requires `renderer.shadowMap.type = THREE.BasicShadowMap` so the shader
 * can read raw depth values (PCF/VSM types filter before the read).
 *
 * Based on the Three.js PCSS example (webgl_shadowmap_pcss).
 */

import * as THREE from "three";
import { logger } from "../utils/logger.js";

/** Saved original shadowmap_pars_fragment chunk for restoration. */
let _originalShadowmapChunk: string | null = null;

/** Saved original shadowmask_pars_fragment chunk for restoration. */
let _originalShadowmaskChunk: string | null = null;

/** Saved original opaque_fragment chunk for restoration. */
let _originalOutputChunk: string | null = null;

/** Whether PCSS is currently enabled. */
let _enabled = false;

// ---------------------------------------------------------------------------
// PCSS GLSL code
// ---------------------------------------------------------------------------

const PCSS_PARS = /* glsl */ `
#define PCSS_NUM_SAMPLES 17
#define PCSS_NUM_RINGS 11

float pcss_rand(vec2 uv) {
  const highp float a = 12.9898, b = 78.233, c = 43758.5453;
  highp float dt = dot(uv.xy, vec2(a, b));
  highp float sn = mod(dt, PI);
  return fract(sin(sn) * c);
}

vec2 pcss_poissonDisk[PCSS_NUM_SAMPLES];

void pcss_initPoisson(vec2 seed) {
  float angleStep = PI2 * float(PCSS_NUM_RINGS) / float(PCSS_NUM_SAMPLES);
  float invSamples = 1.0 / float(PCSS_NUM_SAMPLES);
  float angle = pcss_rand(seed) * PI2;
  float r = invSamples;
  float rStep = r;
  for (int i = 0; i < PCSS_NUM_SAMPLES; i++) {
    pcss_poissonDisk[i] = vec2(cos(angle), sin(angle)) * pow(r, 0.75);
    r += rStep;
    angle += angleStep;
  }
}

float pcss_blockerSearch(sampler2D shadowMap, vec2 uv, float zReceiver, float searchRadius) {
  float blockerSum = 0.0;
  float numBlockers = 0.0;
  for (int i = 0; i < PCSS_NUM_SAMPLES; i++) {
    float d = unpackRGBAToDepth(texture2D(shadowMap, uv + pcss_poissonDisk[i] * searchRadius));
    if (d < zReceiver) {
      blockerSum += d;
      numBlockers += 1.0;
    }
  }
  if (numBlockers < 1.0) return -1.0;
  return blockerSum / numBlockers;
}

float pcss_filter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterRadius) {
  float sum = 0.0;
  for (int i = 0; i < PCSS_NUM_SAMPLES; i++) {
    float d = unpackRGBAToDepth(texture2D(shadowMap, uv + pcss_poissonDisk[i] * filterRadius));
    sum += step(zReceiver, d);
  }
  for (int i = 0; i < PCSS_NUM_SAMPLES; i++) {
    float d = unpackRGBAToDepth(texture2D(shadowMap, uv - pcss_poissonDisk[i] * filterRadius));
    sum += step(zReceiver, d);
  }
  return sum / (2.0 * float(PCSS_NUM_SAMPLES));
}

float PCSS(sampler2D shadowMap, vec2 shadowMapSize, vec4 coords) {
  vec2 uv = coords.xy;
  float zReceiver = coords.z;
  pcss_initPoisson(uv);

  // Light size in UV space — controls overall shadow softness.
  float lightSizeUV = 0.005;
  // Tuning constant for distance-based softness scaling.
  float nearPlane = 9.5;

  // Step 1: blocker search
  float searchRadius = lightSizeUV * (zReceiver - nearPlane) / zReceiver;
  float avgBlockerDepth = pcss_blockerSearch(shadowMap, uv, zReceiver, searchRadius);
  if (avgBlockerDepth < 0.0) return 1.0;

  // Step 2: penumbra size
  float penumbra = (zReceiver - avgBlockerDepth) / avgBlockerDepth;
  float filterRadius = penumbra * lightSizeUV * nearPlane / zReceiver;

  // Step 3: variable-width PCF
  return pcss_filter(shadowMap, uv, zReceiver, filterRadius);
}
`;

/**
 * getShadowMask() — aggregates shadow factors from all shadow-casting lights.
 * Normally defined in shadowmask_pars_fragment (only included by ShadowMaterial).
 * We inject it into shadowmap_pars_fragment so lit materials (MeshPhysicalMaterial)
 * can use it in the opaque_fragment patch.
 *
 * Copied from Three.js shadowmask_pars_fragment.glsl.js.
 */
const GET_SHADOW_MASK = /* glsl */ `
float getShadowMask() {

	float shadow = 1.0;

	#if NUM_DIR_LIGHT_SHADOWS > 0

	DirectionalLightShadow directionalLight;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {

		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;

	}
	#pragma unroll_loop_end

	#endif

	#if NUM_SPOT_LIGHT_SHADOWS > 0

	SpotLightShadow spotLight;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {

		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;

	}
	#pragma unroll_loop_end

	#endif

	#if NUM_POINT_LIGHT_SHADOWS > 0

	PointLightShadow pointLight;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {

		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;

	}
	#pragma unroll_loop_end

	#endif

	return shadow;

}
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enable PCSS by patching the shadowmap shader chunk.
 *
 * Must be called BEFORE materials are compiled (or materials must be
 * invalidated via `material.needsUpdate = true` afterward).
 *
 * Requires `renderer.shadowMap.type = THREE.BasicShadowMap`.
 */
export function enablePCSS(): void {
  if (_enabled) return;

  // --- Patch 1: shadowmap_pars_fragment (PCSS algorithm) ---
  const shadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!shadowChunk) {
    logger.warn("PCSS: shadowmap_pars_fragment chunk not found");
    return;
  }

  _originalShadowmapChunk = shadowChunk;

  let patched = shadowChunk;

  // Injection 1a: add PCSS function definitions + a sentinel define after
  // #ifdef USE_SHADOWMAP. The sentinel (PCSS_HAS_SHADOW_MASK) lets the
  // opaque_fragment patch safely call getShadowMask() only in shaders that
  // include this chunk (lit materials), avoiding errors on LineBasicMaterial etc.
  patched = patched.replace(
    "#ifdef USE_SHADOWMAP",
    "#ifdef USE_SHADOWMAP\n#define PCSS_HAS_SHADOW_MASK\n" + PCSS_PARS,
  );

  // Injection 1b: replace BasicShadowMap's single-sample depth test with PCSS
  // This is the #else branch (no PCF/VSM defined = BasicShadowMap).
  patched = patched.replace(
    "shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );",
    "shadow = PCSS( shadowMap, shadowMapSize, shadowCoord );",
  );

  // Injection 1c: add getShadowMask() before closing #endif.
  // This function is normally only in shadowmask_pars_fragment (used by
  // ShadowMaterial). We need it in shadowmap_pars_fragment so MeshPhysicalMaterial
  // can call it from our opaque_fragment patch.
  // The chunk ends with "\n#endif" (no trailing newline), so match that at end-of-string.
  patched = patched.replace(
    /\n#endif$/,
    "\n" + GET_SHADOW_MASK + "\n#endif",
  );

  THREE.ShaderChunk.shadowmap_pars_fragment = patched;

  // --- Patch 2: empty shadowmask_pars_fragment ---
  // ShadowMaterial includes both shadowmap_pars_fragment and
  // shadowmask_pars_fragment. Since we injected getShadowMask() into
  // shadowmap_pars_fragment (patch 1c), we must remove the original
  // definition to avoid a "function already has a body" error.
  _originalShadowmaskChunk = THREE.ShaderChunk.shadowmask_pars_fragment;
  THREE.ShaderChunk.shadowmask_pars_fragment = "// getShadowMask() moved to shadowmap_pars_fragment by PCSS patch";

  // --- Patch 3: opaque_fragment (apply shadow to IBL) ---
  // MeshPhysicalMaterial applies shadow as directLight.color *= shadow, which
  // is proportional to light intensity. Our shadow lights have near-zero
  // intensity (0.001), so that modulation is imperceptible. Instead, apply
  // getShadowMask() directly to outgoingLight (which includes IBL) as an
  // independent darkening factor.
  const outputChunk = THREE.ShaderChunk.opaque_fragment;
  if (outputChunk) {
    _originalOutputChunk = outputChunk;
    THREE.ShaderChunk.opaque_fragment = outputChunk.replace(
      "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
      `#ifdef PCSS_HAS_SHADOW_MASK
  outgoingLight *= mix( 1.0, getShadowMask(), 0.35 );
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,
    );
  }

  _enabled = true;
  logger.debug("PCSS shadows enabled");
}

/**
 * Disable PCSS by restoring the original shader chunk.
 *
 * Materials should be invalidated afterward to recompile without PCSS.
 */
export function disablePCSS(): void {
  if (!_enabled) return;

  if (_originalShadowmapChunk !== null) {
    THREE.ShaderChunk.shadowmap_pars_fragment = _originalShadowmapChunk;
    _originalShadowmapChunk = null;
  }

  if (_originalShadowmaskChunk !== null) {
    THREE.ShaderChunk.shadowmask_pars_fragment = _originalShadowmaskChunk;
    _originalShadowmaskChunk = null;
  }

  if (_originalOutputChunk !== null) {
    THREE.ShaderChunk.opaque_fragment = _originalOutputChunk;
    _originalOutputChunk = null;
  }

  _enabled = false;
  logger.debug("PCSS shadows disabled");
}

/** Whether PCSS is currently active. */
export function isPCSSEnabled(): boolean {
  return _enabled;
}
