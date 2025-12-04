import * as THREE from "three";

/**
 * Valid transform action types for animation tracks.
 * - t: full translation vector
 * - tx, ty, tz: single-axis translation
 * - q: quaternion rotation
 * - rx, ry, rz: rotation around single axis
 * @type {string[]}
 */
const valid_transforms = ["t", "tx", "ty", "tz", "q", "rx", "ry", "rz"];

/**
 * Create a quaternion from an axis letter and angle in degrees.
 * @param {string} axis - Axis letter ("x", "y", or "z").
 * @param {number} angle - Rotation angle in degrees.
 * @returns {THREE.Quaternion} The resulting quaternion.
 * @private
 */
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

/**
 * Manages keyframe animations for CAD objects.
 * Supports translation (t, tx, ty, tz) and rotation (q, rx, ry, rz) transforms.
 */
class Animation {
  /**
   * Create an Animation manager.
   * @param {string} delim - Path delimiter used in object selectors.
   */
  constructor(delim) {
    this.delim = delim;
    this.tracks = [];
    this.mixer = null;
    this.clip = null;
    this.clipAction = null;
    this.clock = new THREE.Clock();
    this.duration = 0;
    this._backup = [];
    this.root = null;
    this.duration = null;
    this.speed = null;
    this.repeat = null;
  }

  /**
   * Add an animation track for an object.
   * @param {string} selector - Object path selector (using "/" delimiter).
   * @param {THREE.Object3D} group - The object to animate.
   * @param {string} action - Transform type ("t", "tx", "ty", "tz", "q", "rx", "ry", "rz").
   * @param {number[]} times - Array of keyframe times.
   * @param {number[]|number[][]} values - Array of values corresponding to each time.
   */
  addTrack(selector, group, action, times, values) {
    selector = selector.replaceAll("/", this.delim);

    if (valid_transforms.indexOf(action) === -1) {
      console.error(`Unknown action: "${action}" not in ${valid_transforms}`);
      return;
    }

    if (times.length != values.length) {
      console.error("times and values arrays need to have the same length");
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
            position.clone().add(new THREE.Vector3(v, 0, 0)).toArray(),
          );
          break;
        case "ty":
          newValues = values.map((v) =>
            position.clone().add(new THREE.Vector3(0, v, 0)).toArray(),
          );
          break;
        case "tz":
          newValues = values.map((v) =>
            position.clone().add(new THREE.Vector3(0, 0, v)).toArray(),
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

  /**
   * Store current animation state for later restoration.
   */
  backup() {
    this._backup = {
      tracks: this.tracks,
      root: this.root,
      duration: this.duration,
      speed: this.speed,
      repeat: this.repeat,
    };
  }

  /**
   * Restore previously backed up animation state.
   * @returns {{duration: number, speed: number, repeat: boolean}} The restored settings.
   */
  restore() {
    this.tracks = this._backup.tracks;
    return {
      duration: this._backup.duration,
      speed: this._backup.speed,
      repeat: this._backup.repeat,
    };
  }

  /**
   * Clear the backup state.
   */
  cleanBackup() {
    this._backup = [];
  }

  /**
   * Check if any animation tracks have been added.
   * @returns {boolean} True if tracks exist.
   */
  hasTracks() {
    return this.tracks != null && this.tracks.length > 0;
  }

  /**
   * Check if a backup exists.
   * @returns {boolean} True if backup state is stored.
   */
  hasBackup() {
    return this._backup != null && Object.keys(this._backup).length > 0;
  }

  /**
   * Create and start the animation.
   * @param {THREE.Object3D} root - Root object containing animated children.
   * @param {number} duration - Animation duration in seconds.
   * @param {number} speed - Playback speed multiplier.
   * @param {boolean} [repeat=true] - Whether to loop (true) or ping-pong (false).
   * @returns {THREE.AnimationAction} The created animation action.
   */
  animate(root, duration, speed, repeat = true) {
    this.root = root;
    this.duration = duration;
    this.speed = speed;
    this.repeat = repeat;

    this.clip = new THREE.AnimationClip("track", duration, this.tracks);
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.timeScale = speed;

    // this.mixer.addEventListener('finished', (e) => { console.log("finished", e) });
    // this.mixer.addEventListener('loop', (e) => { console.log("loop", e) });

    this.clipAction = this.mixer.clipAction(this.clip);
    this.clipAction.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopPingPong);
    return this.clipAction;
  }

  /**
   * Set the animation to a specific relative time (0-1).
   * Pauses the animation at that point.
   * @param {number} fraction - Time fraction (0 = start, 1 = end).
   */
  setRelativeTime(fraction) {
    this.clipAction.play();
    this.clipAction.paused = true;
    var currentTime = this.duration * fraction;
    this.clipAction.time = currentTime;
  }

  /**
   * Get the current relative time (0-1).
   * @returns {number} Current time fraction.
   */
  getRelativeTime() {
    return this.clipAction.time / this.duration;
  }

  /**
   * Dispose of animation resources.
   */
  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      if (this.clip) {
        this.mixer.uncacheClip(this.clip);
      }
      if (this.root) {
        this.mixer.uncacheRoot(this.root);
      }
    }
    this.mixer = null;
    this.clipAction = null;
    this.clip = null;
    this.tracks = [];
    this.root = null;
  }

  /**
   * Update the animation mixer (call each frame when animating).
   */
  update() {
    if (this.mixer) {
      this.mixer.update(this.clock.getDelta());
    }
  }
}

export { Animation };
