import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import {
  createHatchUniforms,
  patchHatchMaterial,
  worldPerPixel,
} from "../../src/rendering/clip-style.js";
import {
  CapOutlinePass,
  CUT_EDGE_ID,
  capIdColor,
} from "../../src/rendering/cap-outline.js";
import { Viewer } from "../../src/core/viewer.js";

/** A shader object as three.js passes it to onBeforeCompile (standard material). */
function standardShader() {
  return {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
}

describe("patchHatchMaterial", () => {
  it("adds plane coordinates and hatch lines with per-solid variants", () => {
    const shared = createHatchUniforms(5);
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    patchHatchMaterial(a, shared, 0, capIdColor(1));
    patchHatchMaterial(b, shared, 1, capIdColor(2));
    const sa = standardShader();
    const sb = standardShader();
    a.onBeforeCompile(sa, null);
    b.onBeforeCompile(sb, null);

    expect(sa.vertexShader).toContain(
      "vTcvCapUV = position.xy * uCapHalfSize;",
    );
    expect(sa.fragmentShader).toContain("float line = 1.0 - smoothstep(");
    // lines fade out instead of merging into solid ink when seen edge-on
    expect(sa.fragmentShader).toContain(
      "line *= smoothstep( 2.0, 4.0, 1.0 / tw );",
    );
    // hatched on the unlit base color, before lighting (ink fixed per part)
    const hatchAt = sa.fragmentShader.indexOf(
      "diffuseColor.rgb = mix( diffuseColor.rgb, ink, line );",
    );
    expect(hatchAt).toBeGreaterThan(-1);
    expect(hatchAt).toBeLessThan(
      sa.fragmentShader.indexOf("#include <lights_fragment_begin>"),
    );
    // shared uniforms are the same objects, per-solid angles differ
    expect(sa.uniforms.uHatchSpacing).toBe(shared.uHatchSpacing);
    expect(sb.uniforms.uHatchSpacing).toBe(shared.uHatchSpacing);
    expect(sa.uniforms.uHatchAngle.value).not.toBe(
      sb.uniforms.uHatchAngle.value,
    );
  });
});

describe("cap outline id output", () => {
  it("switches every cap to its id color through one shared uniform", () => {
    const shared = createHatchUniforms(1);
    const material = new THREE.MeshStandardMaterial();
    patchHatchMaterial(material, shared, 0, capIdColor(7));
    const shader = standardShader();
    material.onBeforeCompile(shader, null);
    expect(shader.fragmentShader).toContain(
      "if ( uCapIdPass > 0.5 ) gl_FragColor = vec4( uCapId, 1.0 );",
    );
    expect(shader.uniforms.uCapIdPass).toBe(shared.uCapIdPass);
    expect(shader.uniforms.uCapId.value.toArray()).toEqual([7 / 255, 0, 0]);
  });

  it("chains a previous onBeforeCompile and patches only once", () => {
    const material = new THREE.MeshStandardMaterial();
    const prev = vi.fn();
    material.onBeforeCompile = prev;
    const shared = createHatchUniforms(1);
    patchHatchMaterial(material, shared, 0, capIdColor(1));
    const hook = material.onBeforeCompile;
    patchHatchMaterial(material, shared, 0, capIdColor(1));
    expect(material.onBeforeCompile).toBe(hook);
    material.onBeforeCompile(standardShader(), null);
    expect(prev).toHaveBeenCalledTimes(1);
  });
});

describe("capIdColor", () => {
  it("encodes the id exactly in 8-bit RGB (low byte in R)", () => {
    const decode = (v) =>
      Math.round(v.x * 255) +
      256 * Math.round(v.y * 255) +
      65536 * Math.round(v.z * 255);
    for (const id of [1, 255, 256, 4097, 65535, 70000]) {
      expect(decode(capIdColor(id))).toBe(id);
    }
  });
});

describe("CapOutlinePass cut contour", () => {
  it("marks face pixels near a clip plane with the cut-edge id", () => {
    const pass = new CapOutlinePass();
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
    };
    pass.occluder.onBeforeCompile(shader, null);
    const frag = shader.fragmentShader;
    const clipAt = frag.indexOf("#include <clipping_planes_fragment>");
    expect(frag.indexOf("bool tcvCut = false;")).toBeGreaterThan(clipAt);
    expect(frag).toContain("if ( tcvCut ) gl_FragColor = vec4( 1.0 );");
    expect(shader.uniforms.uCutWidth).toBe(pass.cutWidth);
    // the composite draws cut-edge pixels directly
    expect(pass.composite.fragmentShader).toContain(
      `bool edge = c == ${CUT_EDGE_ID.toFixed(1)};`,
    );
    pass.dispose();
  });

  it("encodes the cut-edge id as white, above any cap id", () => {
    expect(CUT_EDGE_ID).toBe(0xffffff);
    expect(capIdColor(CUT_EDGE_ID).toArray()).toEqual([1, 1, 1]);
  });
});

describe("cap outline while the camera moves", () => {
  const moved = Viewer.prototype._cameraMovedSinceLastOutline;
  const schedule = Viewer.prototype._scheduleCapOutline;

  it("reports a camera change once, then a still camera", () => {
    const host = { _capOutlineCamera: [] };
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.updateMatrixWorld();
    expect(moved.call(host, camera)).toBe(true); // nothing recorded yet
    expect(moved.call(host, camera)).toBe(false);
    camera.position.x = 1;
    camera.updateMatrixWorld();
    expect(moved.call(host, camera)).toBe(true);
    expect(moved.call(host, camera)).toBe(false);
    camera.zoom = 2;
    camera.updateProjectionMatrix();
    expect(moved.call(host, camera)).toBe(true); // zoom changes the projection
  });

  it("redraws once after the camera has settled", () => {
    vi.useFakeTimers();
    try {
      const host = { ready: true, update: vi.fn(), _capOutlineSettle: null };
      schedule.call(host);
      vi.advanceTimersByTime(100);
      schedule.call(host); // still moving: restarts the delay
      vi.advanceTimersByTime(100);
      expect(host.update).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(host.update).toHaveBeenCalledTimes(1);
      expect(host.update).toHaveBeenCalledWith(true, false);
      expect(host._capOutlineSettle).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("worldPerPixel", () => {
  it("is exact for an orthographic camera", () => {
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    cam.zoom = 2;
    expect(worldPerPixel(cam, new THREE.Vector3(), 200)).toBeCloseTo(
      20 / 2 / 200,
    );
  });

  it("uses the distance to the point for a perspective camera", () => {
    const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    cam.position.set(0, 0, 10);
    // visible height at distance 10 with 90° fov = 2 * 10 * tan(45°) = 20
    expect(worldPerPixel(cam, new THREE.Vector3(), 100)).toBeCloseTo(0.2);
  });
});
