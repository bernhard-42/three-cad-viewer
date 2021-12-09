class Timer {
  constructor(prefix, timeit) {
    this.prefix = prefix;
    this.timeit = timeit;
    this.start = performance.now();
    if (timeit) {
      console.info(`three-cad-viewer: ${prefix}:start`);
    }
  }

  split(msg) {
    if (this.timeit) {
      const t = performance.now();
      console.info(
        `three-cad-viewer: ${this.prefix}:${msg} ${t - this.start} ms`
      );
    }
  }

  stop() {
    if (this.timeit) {
      const t = performance.now();
      console.info(
        `three-cad-viewer: ${this.prefix}:stop ${t - this.start} ms`
      );
    }
  }
}

export { Timer };
