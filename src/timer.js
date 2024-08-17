class Timer {
  constructor(prefix, timeit) {
    this.prefix = prefix;
    this.timeit = timeit;
    this.start = performance.now();
    this.last = this.start;
    if (timeit) {
      console.info(`three-cad-viewer: ${prefix}:timer start`);
    }
  }

  split(msg) {
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

  stop() {
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
