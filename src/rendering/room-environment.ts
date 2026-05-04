/**
 * Clean room environment for Studio mode PMREM generation.
 *
 * Based on Three.js RoomEnvironment (which is based on Google model-viewer's
 * EnvironmentScene), but with the 6 decorative boxes removed and an infinity
 * cove (quarter-cylinder) at all wall-floor junctions for a clean cyclorama.
 */
import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PointLight,
  Scene,
} from "three";

class CleanRoomEnvironment extends Scene {
  constructor() {
    super();

    this.name = "CleanRoomEnvironment";
    this.position.y = -3.5;
    // Pre-rotate 45° so the cleanest wall/floor edge faces the default camera
    this.rotation.y = (45 * Math.PI) / 180;

    const geometry = new BoxGeometry();
    geometry.deleteAttribute("uv");

    const roomMaterial = new MeshStandardMaterial({ side: BackSide });

    const mainLight = new PointLight(0xffffff, 900, 28, 2);
    mainLight.position.set(0.418, 16.199, 0.3);
    this.add(mainLight);

    const room = new Mesh(geometry, roomMaterial);
    room.position.set(-0.757, 13.219, 0.717);
    room.scale.set(31.713, 28.305, 28.591);
    this.add(room);

    // Infinity cove (quarter-cylinder sweep) at all 4 wall-floor junctions.
    // Eliminates the sharp 90° corner visible in reflections.
    //
    // Room bounds (inner faces of BackSide box):
    const cx = -0.757,
      cy = 13.219,
      cz = 0.717;
    const hx = 31.713 / 2,
      hy = 28.305 / 2,
      hz = 28.591 / 2;
    const floorY = cy - hy; // ≈ -0.93
    const wallMinX = cx - hx; // ≈ -16.61
    const wallMinZ = cz - hz; // ≈ -13.58
    const R = 6;

    // Single infinity cove on the -z wall (faces default camera after 45° rotation).
    const cove = new Mesh(createCove(hx * 2, R, 12, "-z"), roomMaterial);
    cove.position.set(wallMinX, floorY, wallMinZ + R);
    this.add(cove);

    // Area lights on walls and ceiling

    // -x right
    const light1 = new Mesh(geometry, createAreaLightMaterial(50));
    light1.position.set(-16.116, 14.37, 8.208);
    light1.scale.set(0.1, 2.428, 2.739);
    this.add(light1);

    // -x left
    const light2 = new Mesh(geometry, createAreaLightMaterial(50));
    light2.position.set(-16.109, 18.021, -8.207);
    light2.scale.set(0.1, 2.425, 2.751);
    this.add(light2);

    // +x
    const light3 = new Mesh(geometry, createAreaLightMaterial(17));
    light3.position.set(14.904, 12.198, -1.832);
    light3.scale.set(0.15, 4.265, 6.331);
    this.add(light3);

    // +z
    const light4 = new Mesh(geometry, createAreaLightMaterial(43));
    light4.position.set(-0.462, 8.89, 14.52);
    light4.scale.set(4.38, 5.441, 0.088);
    this.add(light4);

    // -z
    const light5 = new Mesh(geometry, createAreaLightMaterial(20));
    light5.position.set(3.235, 11.486, -12.541);
    light5.scale.set(2.5, 2.0, 0.1);
    this.add(light5);

    // +y (ceiling)
    const light6 = new Mesh(geometry, createAreaLightMaterial(100));
    light6.position.set(0.0, 20.0, 0.0);
    light6.scale.set(1.0, 0.1, 1.0);
    this.add(light6);
  }

  dispose(): void {
    const resources = new Set<{ dispose(): void }>();
    this.traverse((object) => {
      if ("isMesh" in object && object.isMesh) {
        const mesh = object as Mesh;
        resources.add(mesh.geometry);
        if (!Array.isArray(mesh.material)) {
          resources.add(mesh.material);
        }
      }
    });
    for (const resource of resources) {
      resource.dispose();
    }
  }
}

/**
 * Quarter-cylinder for infinity cove — no rotation needed.
 *
 * @param length   Extrusion length along the wall edge
 * @param radius   Cove radius
 * @param segments Arc subdivisions
 * @param wall     Which wall: "-x"|"+x"|"-z"|"+z"
 *
 * The arc sweeps from floor-tangent (horizontal) to wall-tangent (vertical).
 * Winding is set so BackSide material renders the concave interior.
 */
function createCove(
  length: number,
  radius: number,
  segments: number,
  wall: "-x" | "+x" | "-z" | "+z",
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // sign: which direction the arc curves toward the wall
  // axis: 0 = arc in XY extruded along Z, 1 = arc in ZY extruded along X
  const axis = wall === "-x" || wall === "+x" ? 0 : 1;
  const sign = wall === "-x" || wall === "-z" ? -1 : 1;

  for (let i = 0; i <= segments; i++) {
    const angle = ((i / segments) * Math.PI) / 2;
    const h = sign * radius * Math.sin(angle); // horizontal offset toward wall
    const y = radius * (1 - Math.cos(angle)); // vertical offset above floor
    const nh = sign * Math.sin(angle); // normal toward wall
    const ny = -Math.cos(angle); // normal downward

    if (axis === 0) {
      // Arc in XY, extruded along Z (for ±x walls)
      positions.push(h, y, 0);
      normals.push(nh, ny, 0);
      positions.push(h, y, length);
      normals.push(nh, ny, 0);
    } else {
      // Arc in ZY, extruded along X (for ±z walls)
      positions.push(0, y, h);
      normals.push(0, ny, nh);
      positions.push(length, y, h);
      normals.push(0, ny, nh);
    }
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    // Winding: front face must point toward corner for BackSide to show
    // concave interior. Extruding along X (axis=1) flips the cross product
    // vs extruding along Z (axis=0), so we XOR the conditions.
    const flip = sign > 0 !== (axis === 1);
    if (flip) {
      indices.push(a, c, b, b, c, d);
    } else {
      indices.push(a, b, c, b, d, c);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  return geom;
}

function createAreaLightMaterial(intensity: number): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: intensity,
  });
}

export { CleanRoomEnvironment };
