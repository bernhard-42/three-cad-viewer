/**
 * Minimal type declarations for n8ao.
 *
 * n8ao does not ship TypeScript types. This provides just enough
 * typing to suppress TS7016 during builds while keeping the actual
 * N8AOPostPass usage typed as `any` (the API is untyped upstream).
 */
declare module "n8ao" {
  import type { Scene, Camera } from "three";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class N8AOPostPass {
    enabled: boolean;
    camera: Camera;
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      gammaCorrection: boolean;
      [key: string]: unknown;
    };
    constructor(scene: Scene, camera: Camera, width: number, height: number);
    setQualityMode(mode: "Low" | "Medium" | "High" | "Ultra"): void;
    setSize(width: number, height: number): void;
  }
}
