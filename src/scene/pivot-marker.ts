import * as THREE from "three";

/** Base color of the pivot sphere. */
const COLOR = 0x000000;
/** Low roughness, so the black sphere shows a highlight and reads as a sphere. */
const ROUGHNESS = 0.3;

/**
 * A small lit sphere at the pivot of a rotate drag, drawn on top of the model.
 *
 * It lives in a scene of its own, rendered after the main scene (and after the
 * Studio composer) once the depth buffer is cleared, so the model never hides it
 * and the id picker, AO and tone mapping never see it. The caller gives its world
 * radius per frame to keep its size on screen constant.
 */
class PivotMarker {
  private readonly scene: THREE.Scene;
  private readonly sphere: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly light: THREE.DirectionalLight;

  constructor() {
    this.scene = new THREE.Scene();
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshStandardMaterial({
        color: COLOR,
        roughness: ROUGHNESS,
        metalness: 0,
      }),
    );
    this.sphere.name = "pivotMarker";
    this.scene.add(this.sphere);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1));
    // Placed at the camera on every render, like the CAD mode's directional light.
    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.scene.add(this.light);
  }

  /**
   * Draw the sphere at `pivot` over what the renderer holds.
   * @param renderer - the renderer that just drew the frame.
   * @param camera - the camera of that frame.
   * @param pivot - world position of the sphere.
   * @param radius - world radius of the sphere.
   */
  render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    pivot: THREE.Vector3,
    radius: number,
  ): void {
    this.sphere.position.copy(pivot);
    this.sphere.scale.setScalar(radius);
    this.light.position.copy(camera.position);
    this.light.target.position.copy(pivot);
    this.light.target.updateMatrixWorld();
    renderer.clearDepth();
    renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.sphere.geometry.dispose();
    this.sphere.material.dispose();
    this.light.dispose();
  }
}

export { PivotMarker };
