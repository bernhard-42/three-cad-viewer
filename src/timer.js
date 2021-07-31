class Timer {
  constructor(prefix, timeit) {
    this.prefix = prefix;
    this.timeit = timeit;
    this.start = performance.now();
    if (timeit) {
      console.warn(`${prefix}:start`);
    }
  }

  split(msg) {
    if (this.timeit) {
      const t = performance.now();
      console.warn(`${this.prefix}:${msg} ${t - this.start} ms`);
    }
  }

  stop() {
    if (this.timeit) {
      const t = performance.now();
      console.warn(`${this.prefix}:stop ${t - this.start} ms`);
    }
  }
}

export { Timer };
