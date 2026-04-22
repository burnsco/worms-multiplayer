import { Bomb, Target } from 'lucide-react';
import type { WeaponType } from '../../types';
import { POWER_MAX, POWER_MIN, WEAPON_CONFIG } from '../../game/constants';

export type TurnControlsProps = {
  selectedWeapon: WeaponType;
  power: number;
  onWeaponChange: (weapon: WeaponType) => void;
  onPowerChange: (value: number) => void;
  onFire: () => void;
};

const WEAPONS: WeaponType[] = ['bazooka', 'grenade'];

export function TurnControls({
  selectedWeapon,
  power,
  onWeaponChange,
  onPowerChange,
  onFire,
}: TurnControlsProps) {
  return (
    <div
      data-arena-controls
      className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-zinc-950/[0.82] px-3 py-3 shadow-2xl shadow-black/45 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        {WEAPONS.map((weapon) => {
          const active = selectedWeapon === weapon;
          const Icon = weapon === 'bazooka' ? Target : Bomb;
          return (
            <button
              type="button"
              key={weapon}
              onClick={() => onWeaponChange(weapon)}
              className={`h-10 w-10 rounded-md border flex items-center justify-center transition-all ${
                active
                  ? 'bg-emerald-400 text-zinc-950 border-emerald-200 shadow-lg shadow-emerald-950/30'
                  : 'bg-white/5 text-zinc-300 border-white/10 hover:border-white/25 hover:bg-white/10'
              }`}
              title={`${WEAPON_CONFIG[weapon].label} (${weapon === 'bazooka' ? '1' : '2'})`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>
      <div className="h-9 w-px bg-white/10 hidden sm:block" />
      <div className="min-w-44 space-y-2">
        <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
          <span>Power</span>
          <span className="text-zinc-100 tabular-nums">{power}%</span>
        </div>
        <input
          type="range"
          min={POWER_MIN}
          max={POWER_MAX}
          value={power}
          onChange={(e) => onPowerChange(parseInt(e.target.value, 10))}
          className="w-44 accent-emerald-400"
          title="Shot power (scroll wheel on arena, or hold click to charge)"
        />
      </div>
      <div className="h-9 w-px bg-white/10 hidden sm:block" />
      <button
        type="button"
        onClick={onFire}
        className="h-12 w-12 bg-emerald-500 hover:bg-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
        title="Fire at current power (Space). Hold left mouse on arena to charge, release to fire."
      >
        <Target className="w-6 h-6 text-zinc-950" />
      </button>
    </div>
  );
}
