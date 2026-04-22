import { motion } from 'motion/react';
import { Play, Users } from 'lucide-react';
import type { GameRoom } from '../../types';

export type LobbyScreenProps = {
  room: GameRoom;
  selfId: string | undefined;
  onStart: () => void;
};

export function LobbyScreen({ room, selfId, onStart }: LobbyScreenProps) {
  const canStart = room.players.length >= 2;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-emerald-500" />
            <h2 className="text-xl font-bold">Lobby: {room.id}</h2>
          </div>
          <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-bold uppercase tracking-widest">
            Waiting for Players
          </div>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 gap-4 mb-8">
            {room.players.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-4 bg-zinc-950 border border-zinc-800 rounded-xl"
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="font-medium">{p.username}</span>
                {p.id === selfId && (
                  <span className="ml-auto text-[10px] text-zinc-500 font-bold uppercase">You</span>
                )}
              </motion.div>
            ))}
          </div>

          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            Start Game
          </button>
          {!canStart && (
            <p className="text-center text-zinc-500 text-sm mt-4">Need at least 2 players to start</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
