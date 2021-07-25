class Timer {
  constructor(prefix, measure) {
    this.prefix = prefix;
    this.measure = measure;
    this.start = performance.now();
    if (measure) {
      console.warn(`${prefix}:start`);
    }
  }

  split(msg) {
    if (this.measure) {
      const t = performance.now();
      console.warn(`${this.prefix}:${msg} ${t - this.start} ms`);
    }
  }

  stop() {
    if (this.measure) {
      const t = performance.now();
      console.warn(`${this.prefix}:stop ${t - this.start} ms`);
    }
  }
}

export { Timer };
