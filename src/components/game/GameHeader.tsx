import { Clock, Wind, Zap } from 'lucide-react';
import type { GameRoom } from '../../types';
import { windFromTerrainSeed } from '../../types';

export type GameHeaderProps = {
  room: GameRoom;
  timeLeft: number;
  isMyTurn: boolean;
  isFiring: boolean;
};

export function GameHeader({ room, timeLeft, isMyTurn, isFiring }: GameHeaderProps) {
  const wind = room.terrainSeed != null ? windFromTerrainSeed(room.terrainSeed) : null;

  return (
    <div className="h-16 bg-[#17181f]/95 border-b border-white/10 flex items-center justify-between px-6 shrink-0 shadow-lg shadow-black/20">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-500" />
          <span className="font-bold tracking-tight">WORMS ARENA</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        {wind != null && (
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-md bg-sky-500/[0.12] border border-sky-300/20 text-sky-100 shadow-inner shadow-sky-950/40"
            title="Wind pushes shots each frame; same for every player in this match."
          >
            <Wind
              className="w-4 h-4 shrink-0"
              style={{ transform: `scaleX(${wind >= 0 ? 1 : -1})` }}
            />
            <span className="text-[11px] font-semibold tabular-nums">{(wind * 1000).toFixed(1)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.07] border border-white/10 text-zinc-100 shadow-inner shadow-black/20">
          <Clock className="w-4 h-4 text-amber-300" />
          <span className="text-[11px] font-semibold tabular-nums">{timeLeft}s</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-4">
          {room.players.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 px-3 py-1 rounded-md transition-all ${
                room.turnIndex === i ? 'bg-emerald-400/[0.16] ring-1 ring-emerald-300/60 text-white' : 'opacity-55'
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-sm font-medium">{p.username}</span>
            </div>
          ))}
        </div>
      </div>

      {isMyTurn && !isFiring && (
        <div className="flex items-center gap-4 px-4 py-1.5 bg-emerald-400 rounded-full text-zinc-950 font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-950/30">
          Your Turn
        </div>
      )}
    </div>
  );
}
