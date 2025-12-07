/**
 * Type augmentations for THREE.js types that are incomplete or have undocumented properties.
 * This allows type-safe access to internal/undocumented THREE.js APIs.
 */

import "three";

declare module "three" {
  /**
   * Raycaster.params includes Line2 threshold for fat line picking,
   * but this is not in the default type definitions.
   */
  interface Raycaster {
    params: {
      Line2?: { threshold: number };
      Line?: { threshold: number };
      Points?: { threshold: number };
      Mesh?: Record<string, unknown>;
    };
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  interface OrbitControls {
    /**
     * Enable/disable keyboard controls (deprecated in recent THREE.js but still present)
     */
    enableKeys: boolean;
    /**
     * When true, panning is in screen space (XY) rather than camera plane
     */
    screenSpacePanning: boolean;
  }
}

declare module "three/examples/jsm/controls/TrackballControls.js" {
  interface TrackballControls {
    /**
     * Enable/disable keyboard controls
     */
    enableKeys: boolean;
  }
}

declare module "three/examples/jsm/lines/LineMaterial.js" {
  interface LineMaterial {
    /**
     * Legacy vertex colors property (string-based in older THREE.js versions)
     */
    vertexColors: boolean | string;
  }
}
