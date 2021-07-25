import * as THREE from "three";

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
  constructor(root, delim) {
    this.root = root;
    this.delim = delim;
    this.tracks = [];
    this.mixer = null;
    this.clipAction = null;
    this.clock = new THREE.Clock();
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
          newValues = values.map((v) => position.clone().add(v));
          break;
        case "tx":
          newValues = values.map((v) =>
            position.clone().add(new THREE.Vector3(v, 0, 0))
          );
          break;
        case "ty":
          newValues = values.map((v) =>
            position.clone().add(new THREE.Vector3(0, v, 0))
          );
          break;
        case "tz":
          newValues = values.map((v) =>
            position.clone().add(new THREE.Vector3(0, 0, v))
          );
          break;
        default:
          console.error(`action ${action} is not supported`);
          return;
      }

      this.tracks.push(
        new THREE.NumberKeyframeTrack(selector + ".position", times, newValues)
      );
    } else {
      const quaternion = group.quaternion;

      if (action.startsWith("r")) {
        const quatValues = values.map((angle) =>
          fromAxisAngle(action.slice(1), angle)
        );
        newValues = quatValues.map((rot) =>
          quaternion.clone().multiply(rot).toArray()
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
          newValues.flat()
        )
      );
    }
  }

  animate(duration, speed) {
    const clip = new THREE.AnimationClip("track", duration, this.tracks);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.mixer.timeScale = speed;
    // this.mixer.addEventListener('finished', (e) => { console.log("finished", e) });
    // this.mixer.addEventListener('loop', (e) => { console.log("loop", e) });

    this.clipAction = this.mixer.clipAction(clip);

    return this.clipAction;
  }

  update() {
    if (this.mixer) {
      this.mixer.update(this.clock.getDelta());
    }
  }
}

export { Animation };
