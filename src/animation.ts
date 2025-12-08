import * as THREE from "three";
import { AXIS_VECTORS } from "./utils.js";
import type { Axis } from "./types.js";

/**
 * Create a quaternion from an axis and angle in degrees.
 */
function fromAxisAngle(axis: Axis, angle: number): THREE.Quaternion {
  const q = new THREE.Quaternion();
  q.setFromAxisAngle(AXIS_VECTORS[axis], (angle / 180) * Math.PI);
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
   * Prepare selector by replacing path delimiter.
   */
  private _prepareSelector(selector: string): string {
    return selector.replaceAll("/", this.delim);
  }

  /**
   * Validate that times and values arrays have the same length.
   */
  private _validateArrayLengths(times: number[], values: unknown[]): boolean {
    if (times.length !== values.length) {
      console.error("times and values arrays need to have the same length");
      return false;
    }
    return true;
  }

  /**
   * Add a position track (full 3D translation).
   * @param selector - Object path selector (using "/" delimiter).
   * @param group - The object to animate.
   * @param times - Array of keyframe times.
   * @param positions - Array of [x, y, z] position offsets.
   */
  addPositionTrack(
    selector: string,
    group: THREE.Object3D,
    times: number[],
    positions: number[][],
  ): void {
    if (!this._validateArrayLengths(times, positions)) return;

    const basePosition = group.position;
    const newValues = positions.map((v) =>
      basePosition
        .clone()
        .add(new THREE.Vector3(...v))
        .toArray(),
    );

    this.tracks.push(
      new THREE.VectorKeyframeTrack(
        this._prepareSelector(selector) + ".position",
        times,
        newValues.flat(),
      ),
    );
  }

  /**
   * Add a single-axis translation track.
   * @param selector - Object path selector (using "/" delimiter).
   * @param group - The object to animate.
   * @param axis - Which axis to translate along ("x", "y", or "z").
   * @param times - Array of keyframe times.
   * @param values - Array of translation values along the axis.
   */
  addTranslationTrack(
    selector: string,
    group: THREE.Object3D,
    axis: Axis,
    times: number[],
    values: number[],
  ): void {
    if (!this._validateArrayLengths(times, values)) return;

    const basePosition = group.position;
    const offsets: Record<Axis, (v: number) => THREE.Vector3> = {
      x: (v) => new THREE.Vector3(v, 0, 0),
      y: (v) => new THREE.Vector3(0, v, 0),
      z: (v) => new THREE.Vector3(0, 0, v),
    };

    const newValues = values.map((v) =>
      basePosition.clone().add(offsets[axis](v)).toArray(),
    );

    this.tracks.push(
      new THREE.VectorKeyframeTrack(
        this._prepareSelector(selector) + ".position",
        times,
        newValues.flat(),
      ),
    );
  }

  /**
   * Add a quaternion rotation track.
   * @param selector - Object path selector (using "/" delimiter).
   * @param group - The object to animate.
   * @param times - Array of keyframe times.
   * @param quaternions - Array of [x, y, z, w] quaternion values.
   */
  addQuaternionTrack(
    selector: string,
    group: THREE.Object3D,
    times: number[],
    quaternions: number[][],
  ): void {
    if (!this._validateArrayLengths(times, quaternions)) return;

    const baseQuaternion = group.quaternion;
    const newValues = quaternions.map((q) =>
      baseQuaternion
        .clone()
        .multiply(new THREE.Quaternion(...q))
        .toArray(),
    );

    this.tracks.push(
      new THREE.QuaternionKeyframeTrack(
        this._prepareSelector(selector) + ".quaternion",
        times,
        newValues.flat(),
      ),
    );
  }

  /**
   * Add a single-axis rotation track.
   * @param selector - Object path selector (using "/" delimiter).
   * @param group - The object to animate.
   * @param axis - Which axis to rotate around ("x", "y", or "z").
   * @param times - Array of keyframe times.
   * @param angles - Array of rotation angles in degrees.
   */
  addRotationTrack(
    selector: string,
    group: THREE.Object3D,
    axis: Axis,
    times: number[],
    angles: number[],
  ): void {
    if (!this._validateArrayLengths(times, angles)) return;

    const baseQuaternion = group.quaternion;
    const newValues = angles.map((angle) =>
      baseQuaternion.clone().multiply(fromAxisAngle(axis, angle)).toArray(),
    );

    this.tracks.push(
      new THREE.QuaternionKeyframeTrack(
        this._prepareSelector(selector) + ".quaternion",
        times,
        newValues.flat(),
      ),
    );
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
  restore(): {
    duration: number | null;
    speed: number | null;
    repeat: boolean | null;
  } {
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
    repeat: boolean = true,
  ): THREE.AnimationAction {
    this.root = root;
    this.duration = duration;
    this.speed = speed;
    this.repeat = repeat;

    this.clip = new THREE.AnimationClip("track", duration, this.tracks);
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.timeScale = speed;

    this.clipAction = this.mixer.clipAction(this.clip);
    this.clipAction.setLoop(
      repeat ? THREE.LoopRepeat : THREE.LoopPingPong,
      Infinity,
    );
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
