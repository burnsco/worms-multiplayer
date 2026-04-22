import type { WeaponType } from '../types';
import { BAZOOKA_DAMAGE, GRENADE_DAMAGE } from '../types';

export const AIM_COARSE = 0.08;
export const AIM_FINE = 0.025;
export const MIN_AIM = -Math.PI + 0.08;
export const MAX_AIM = -0.08;
export const POINTER_CHARGE_MS = 2100;
export const POWER_MIN = 10;
export const POWER_MAX = 100;
export const TURN_END_DELAY_MS = 900;
export const GRENADE_FUSE_FRAMES = 145;
export const PROJECTILE_RADIUS = 5;

export const WEAPON_CONFIG: Record<
  WeaponType,
  { label: string; damage: number; fuse: number | null; speedScale: number }
> = {
  bazooka: { label: 'Bazooka', damage: BAZOOKA_DAMAGE, fuse: null, speedScale: 1 },
  grenade: { label: 'Grenade', damage: GRENADE_DAMAGE, fuse: GRENADE_FUSE_FRAMES, speedScale: 0.82 },
};
