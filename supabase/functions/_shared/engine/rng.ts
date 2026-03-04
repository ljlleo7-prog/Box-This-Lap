export class SeededRNG {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  /**
   * Returns a random float between 0 (inclusive) and 1 (exclusive).
   * Uses Mulberry32 algorithm.
   */
  next(): number {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /**
   * Returns a random float between min (inclusive) and max (exclusive).
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  
  /**
   * Returns a random integer between min (inclusive) and max (inclusive).
   */
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Returns true or false based on probability (0-1).
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Resets the seed.
   */
  reset(seed: number): void {
    this.seed = seed;
  }
}
