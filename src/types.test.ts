import { describe, expect, it } from 'vitest';
import { windFromTerrainSeed } from './types';

describe('windFromTerrainSeed', () => {
  it('is deterministic for the same seed', () => {
    expect(windFromTerrainSeed(1.234)).toBe(windFromTerrainSeed(1.234));
  });

  it('returns a bounded horizontal drift value', () => {
    for (const seed of [0, 0.5, 12.345, -3.7]) {
      const w = windFromTerrainSeed(seed);
      expect(w).toBeGreaterThanOrEqual(-0.1);
      expect(w).toBeLessThanOrEqual(0.1);
    }
  });
});
