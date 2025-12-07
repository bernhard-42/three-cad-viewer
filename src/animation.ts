import * as THREE from "three";

/**
 * Valid transform action types for animation tracks.
 * - t: full translation vector
 * - tx, ty, tz: single-axis translation
 * - q: quaternion rotation
 * - rx, ry, rz: rotation around single axis
 */
const valid_transforms = ["t", "tx", "ty", "tz", "q", "rx", "ry", "rz"];

/**
 * Create a quaternion from an axis letter and angle in degrees.
 */
function fromAxisAngle(axisLetter: string, angle: number): THREE.Quaternion {
  let axis: THREE.Vector3;
  switch (axisLetter) {
    case "x":
      axis = new THREE.Vector3(1, 0, 0);
      break;
    case "y":
      axis = new THREE.Vector3(0, 1, 0);
      break;
    case "z":
      axis = new THREE.Vector3(0, 0, 1);
      break;
    default:
      axis = new THREE.Vector3(0, 0, 1);
  }
  const q = new THREE.Quaternion();
  q.setFromAxisAngle(axis, (angle / 180) * Math.PI);
  return q;
}

interface AnimationBackup {
  tracks: THREE.KeyframeTrack[];
  root: THREE.Object3D | null;
  duration: number | null;
  speed: number | null;
  repeat: boolean | null;
}

/**
 * Manages keyframe animations for CAD objects.
 * Supports translation (t, tx, ty, tz) and rotation (q, rx, ry, rz) transforms.
 */
class Animation {
  delim: string;
  tracks: THREE.KeyframeTrack[];
  mixer: THREE.AnimationMixer | null;
  clip: THREE.AnimationClip | null;
  clipAction: THREE.AnimationAction | null;
  clock: THREE.Clock;
  duration: number | null;
  speed: number | null;
  repeat: boolean | null;
  root: THREE.Object3D | null;
  _backup: AnimationBackup | null;

  /**
   * Create an Animation manager.
   * @param delim - Path delimiter used in object selectors.
   */
  constructor(delim: string) {
    this.delim = delim;
    this.tracks = [];
    this.mixer = null;
    this.clip = null;
    this.clipAction = null;
    this.clock = new THREE.Clock();
    this.duration = null;
    this._backup = null;
    this.root = null;
    this.speed = null;
    this.repeat = null;
  }

  /**
   * Add an animation track for an object.
   * @param selector - Object path selector (using "/" delimiter).
   * @param group - The object to animate.
   * @param action - Transform type ("t", "tx", "ty", "tz", "q", "rx", "ry", "rz").
   * @param times - Array of keyframe times.
   * @param values - Array of values corresponding to each time.
   */
  addTrack(
    selector: string,
    group: THREE.Object3D,
    action: string,
    times: number[],
    values: number[] | number[][]
  ): void {
    selector = selector.replaceAll("/", this.delim);

    if (valid_transforms.indexOf(action) === -1) {
      console.error(`Unknown action: "${action}" not in ${valid_transforms}`);
      return;
    }

    if (times.length != values.length) {
      console.error("times and values arrays need to have the same length");
      return;
    }

    let newValues: number[][];
    if (action.startsWith("t")) {
      const position = group.position;
      switch (action) {
        case "t":
          newValues = (values as number[][]).map((v) =>
            position
              .clone()
              .add(new THREE.Vector3(...v))
              .toArray(),
          );
          break;
        case "tx":
          newValues = (values as number[]).map((v) =>
            position.clone().add(new THREE.Vector3(v, 0, 0)).toArray(),
          );
          break;
        case "ty":
          newValues = (values as number[]).map((v) =>
            position.clone().add(new THREE.Vector3(0, v, 0)).toArray(),
          );
          break;
        case "tz":
          newValues = (values as number[]).map((v) =>
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
        const quatValues = (values as number[]).map((angle) =>
          fromAxisAngle(action.slice(1), angle),
        );
        newValues = quatValues.map((rot) =>
          quaternion.clone().multiply(rot).toArray(),
        );
      } else if (action == "q") {
        newValues = (values as number[][]).map((q) =>
          quaternion.clone().multiply(new THREE.Quaternion(...q)).toArray(),
        );
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
  backup(): void {
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
   */
  restore(): { duration: number | null; speed: number | null; repeat: boolean | null } {
    if (this._backup === null) {
      return { duration: null, speed: null, repeat: null };
    }
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
  cleanBackup(): void {
    this._backup = null;
  }

  /**
   * Check if any animation tracks have been added.
   */
  hasTracks(): boolean {
    return this.tracks != null && this.tracks.length > 0;
  }

  /**
   * Check if a backup exists.
   */
  hasBackup(): boolean {
    return this._backup !== null;
  }

  /**
   * Create and start the animation.
   * @param root - Root object containing animated children.
   * @param duration - Animation duration in seconds.
   * @param speed - Playback speed multiplier.
   * @param repeat - Whether to loop (true) or ping-pong (false).
   * @returns The created animation action.
   */
  animate(
    root: THREE.Object3D,
    duration: number,
    speed: number,
    repeat: boolean = true
  ): THREE.AnimationAction {
    this.root = root;
    this.duration = duration;
    this.speed = speed;
    this.repeat = repeat;

    this.clip = new THREE.AnimationClip("track", duration, this.tracks);
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.timeScale = speed;

    this.clipAction = this.mixer.clipAction(this.clip);
    this.clipAction.setLoop(repeat ? THREE.LoopRepeat : THREE.LoopPingPong, Infinity);
    return this.clipAction;
  }

  /**
   * Set the animation to a specific relative time (0-1).
   * Pauses the animation at that point.
   */
  setRelativeTime(fraction: number): void {
    if (!this.clipAction || !this.duration) return;
    this.clipAction.play();
    this.clipAction.paused = true;
    const currentTime = this.duration * fraction;
    this.clipAction.time = currentTime;
  }

  /**
   * Get the current relative time (0-1).
   */
  getRelativeTime(): number {
    if (!this.clipAction || !this.duration) return 0;
    return this.clipAction.time / this.duration;
  }

  /**
   * Dispose of animation resources.
   */
  dispose(): void {
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
  update(): void {
    if (this.mixer) {
      this.mixer.update(this.clock.getDelta());
    }
  }
}

export { Animation };
