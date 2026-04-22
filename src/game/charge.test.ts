import { describe, expect, it } from 'vitest';
import { chargePowerPercent } from './charge';
import { POINTER_CHARGE_MS, POWER_MAX, POWER_MIN } from './constants';

describe('chargePowerPercent', () => {
  it('starts at minimum power', () => {
    expect(chargePowerPercent(0)).toBe(POWER_MIN);
  });

  it('reaches maximum at full charge duration', () => {
    expect(chargePowerPercent(POINTER_CHARGE_MS)).toBe(POWER_MAX);
    expect(chargePowerPercent(POINTER_CHARGE_MS * 2)).toBe(POWER_MAX);
  });

  it('respects custom charge duration', () => {
    expect(chargePowerPercent(500, 1000)).toBeGreaterThan(POWER_MIN);
    expect(chargePowerPercent(1000, 1000)).toBe(POWER_MAX);
  });
});
