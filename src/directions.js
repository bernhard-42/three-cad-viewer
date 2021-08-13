import * as THREE from "three";

// see https://en.wikipedia.org/wiki/Isometricprojection
const s2 = Math.sqrt(2);
const s3 = Math.sqrt(3);
const s6 = Math.sqrt(6);

const isoM = new THREE.Matrix4()
  .set(
    -(s3 / s6),
    s3 / s6,
    0,
    0,
    -1 / s6,
    -1 / s6,
    2 / s6,
    0,
    s2 / s6,
    s2 / s6,
    s2 / s6,
    0,
    1,
    1,
    1,
    1
  )
  .transpose();

const isoP = new THREE.Vector3();
const isoQ = new THREE.Quaternion();
const isoS = new THREE.Vector3();
isoM.decompose(isoP, isoQ, isoS);

const frontQ = new THREE.Quaternion(0.5, 0.5, 0.5, 0.5);
const rearQ = new THREE.Quaternion(0.5, -0.5, -0.5, 0.5);
const leftQ = new THREE.Quaternion(0, 1 / s2, 1 / s2, 0);
const rightQ = new THREE.Quaternion(1 / s2, 0, 0, 1 / s2);
const topQ = new THREE.Quaternion(0, 0, 0, 1);
const bottomQ = new THREE.Quaternion(1, 0, 0, 0);

function toUp(q) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(q).toArray();
}

const defaultDirections = {
  iso: {
    position: [1, 1, 1],
    up: toUp(isoQ)
  },
  front: {
    position: [1, 0, 0],
    up: toUp(frontQ)
  },
  rear: {
    position: [-1, 0, 0],
    up: toUp(rearQ)
  },
  left: {
    position: [0, 1, 0],
    up: toUp(leftQ)
  },
  right: {
    position: [0, -1, 0],
    up: toUp(rightQ)
  },
  top: {
    position: [0, 0, 1],
    up: toUp(topQ)
  },
  bottom: {
    position: [0, 0, -1],
    up: toUp(bottomQ)
  }
};

export { defaultDirections };
