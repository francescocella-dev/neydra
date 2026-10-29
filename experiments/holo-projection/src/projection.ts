import tokens from '../spec/holo.tokens.json';

/** One continuous progress value; reversals sample before changing direction. */
export class Projection {
  private from = 0;
  private target = 0;
  private started = 0;
  private duration = 0;
  reducedMotion = false;

  sample(now: number): number {
    if (!Number.isFinite(now)) throw new Error('Invalid clock');
    if (this.duration === 0) return this.target;
    const t = Math.min(1, Math.max(0, (now - this.started) / this.duration));
    return this.from + (this.target - this.from) * t;
  }

  to(visible: boolean, now: number): void {
    this.from = this.sample(now);
    this.target = visible ? 1 : 0;
    this.started = now;
    const full = this.reducedMotion ? 180 : visible
      ? tokens.motion.durationsMs.materialize : tokens.motion.durationsMs.dissolve;
    this.duration = full * Math.abs(this.target - this.from);
  }

  setReducedMotion(enabled: boolean, now: number): void {
    const destination = this.target === 1;
    this.reducedMotion = enabled;
    this.to(destination, now);
  }

  seek(progress: number): void {
    if (!Number.isFinite(progress)) throw new Error('Invalid progress');
    this.from = this.target = Math.max(0, Math.min(1, progress));
    this.duration = 0;
  }
}
