import { POINTER_CHARGE_MS, POWER_MAX, POWER_MIN } from './constants';

export function chargePowerPercent(elapsedMs: number, chargeMs = POINTER_CHARGE_MS): number {
  const t = Math.min(1, elapsedMs / chargeMs);
  return Math.round(POWER_MIN + t * (POWER_MAX - POWER_MIN));
}
