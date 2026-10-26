/** No queue. Work offered while busy is dropped. Invalidated results never escape. */
export class SingleFlight {
  busy = false;
  private epoch = 0;
  invalidate() {
    this.epoch++;
  }
  async run<T>(work: () => Promise<T>, apply: (value: T) => void): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const epoch = this.epoch;
    try {
      const value = await work();
      if (epoch === this.epoch) apply(value);
    } finally {
      this.busy = false;
    }
    return true;
  }
}
