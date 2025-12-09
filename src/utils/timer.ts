/**
 * Performance timing utility for measuring execution time.
 *
 * @example
 * ```typescript
 * const timer = new Timer("render", true);
 * // ... do some work ...
 * timer.split("tessellation complete");
 * // ... do more work ...
 * timer.stop();
 * ```
 *
 * @public
 */
class Timer {
  private prefix: string;
  private timeit: boolean;
  private start: number;
  private last: number;

  /**
   * Create a new Timer instance.
   *
   * @param prefix - Label prefix for log messages
   * @param timeit - If false, all timing operations are no-ops
   */
  constructor(prefix: string, timeit: boolean) {
    this.prefix = prefix;
    this.timeit = timeit;
    this.start = performance.now();
    this.last = this.start;
    if (timeit) {
      console.info(`three-cad-viewer: ${prefix}:timer start`);
    }
  }

  /**
   * Log a split time (time since last split or start).
   *
   * @param msg - Message to include in the log output
   */
  split(msg: string): void {
    if (this.timeit) {
      const t = performance.now();
      console.info(
        `three-cad-viewer: ${this.prefix}:${msg}:timer split ${(
          t - this.last
        ).toFixed(1)} ms`,
      );
      this.last = t;
    }
  }

  /**
   * Log total elapsed time and stop the timer.
   */
  stop(): void {
    if (this.timeit) {
      const t = performance.now();
      console.info(
        `three-cad-viewer: ${this.prefix}:timer stop ${(t - this.start).toFixed(
          1,
        )} ms:`,
      );
    }
  }
}

export { Timer };
