import * as THREE from "three";
import { LoopOnce } from "three";

const valid_transforms = ["t", "tx", "ty", "tz", "q", "rx", "ry", "rz"];

function fromAxisAngle(axis, angle) {
  switch (axis) {
    case "x":
      axis = new THREE.Vector3(1, 0, 0);
      break;
    case "y":
      axis = new THREE.Vector3(0, 1, 0);
      break;
    case "z":
      axis = new THREE.Vector3(0, 0, 1);
      break;
  }
  var q = new THREE.Quaternion();
  q.setFromAxisAngle(axis, (angle / 180) * Math.PI);
  return q;
}

class Animation {
  constructor(delim) {
    this.delim = delim;
    this.tracks = [];
    this.mixer = null;
    this.clip = null;
    this.clipAction = null;
    this.clock = new THREE.Clock();
    this.duration = 0;
  }

  addTrack(selector, group, action, times, values) {
    selector = selector.replaceAll("/", this.delim);

    if (valid_transforms.indexOf(action) === -1) {
      console.error(`Unknown action: "${action}" not in ${valid_transforms}`);
      return;
    }

    if (times.length != values.length) {
      console.error("times and values arrays need have the same lenght");
      return;
    }

    var newValues;
    if (action.startsWith("t")) {
      const position = group.position;
      switch (action) {
        case "t":
          newValues = values.map((v) =>
            position
              .clone()
              .add(new THREE.Vector3(...v))
              .toArray(),
          );
          break;
        case "tx":
          newValues = values.map((v) =>
            position.add(new THREE.Vector3(v, 0, 0)).toArray(),
          );
          break;
        case "ty":
          newValues = values.map((v) =>
            position.add(new THREE.Vector3(0, v, 0)).toArray(),
          );
          break;
        case "tz":
          newValues = values.map((v) =>
            position.add(new THREE.Vector3(0, 0, v)).toArray(),
          );
          break;
        default:
          console.error(`action ${action} is not supported`);
          return;
      }

      this.tracks.push(
        new THREE.VectorKeyframeTrack(
          selector + ".position",
          times,
          newValues.flat(),
        ),
      );
    } else {
      const quaternion = group.quaternion;

      if (action.startsWith("r")) {
        const quatValues = values.map((angle) =>
          fromAxisAngle(action.slice(1), angle),
        );
        newValues = quatValues.map((rot) =>
          quaternion.clone().multiply(rot).toArray(),
        );
      } else if (action == "q") {
        newValues = values.map((q) => quaternion.clone().multiply(q).toArray());
      } else {
        console.error(`action ${action} is not supported`);
        return;
      }

      this.tracks.push(
        new THREE.QuaternionKeyframeTrack(
          selector + ".quaternion",
          times,
          newValues.flat(),
        ),
      );
    }
  }

  animate(root, duration, speed, repeat = true) {
    this.clip = new THREE.AnimationClip("track", duration, this.tracks);
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.timeScale = speed;
    this.duration = duration;
    // this.mixer.addEventListener('finished', (e) => { console.log("finished", e) });
    // this.mixer.addEventListener('loop', (e) => { console.log("loop", e) });

    this.clipAction = this.mixer.clipAction(this.clip);
    this.clipAction.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopPingPong);
    return this.clipAction;
  }

  setRelativeTime(fraction) {
    this.clipAction.play();
    this.clipAction.paused = true;
    var currentTime = this.duration * fraction;
    this.clipAction.time = currentTime;
  }

  getRelativeTime() {
    return this.clipAction.time / this.duration;
  }

  dispose() {
    this.mixer = null;
    this.clipAction = null;
    this.clip = null;
    this.tracks = [];
    this.root = null;
  }

  update() {
    if (this.mixer) {
      this.mixer.update(this.clock.getDelta());
    }
  }
}

export { Animation };
