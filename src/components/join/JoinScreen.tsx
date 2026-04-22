import { motion } from 'motion/react';
import { ArrowRight, Zap } from 'lucide-react';

export type JoinScreenProps = {
  username: string;
  roomId: string;
  onUsernameChange: (value: string) => void;
  onRoomIdChange: (value: string) => void;
  onJoin: () => void;
};

export function JoinScreen({
  username,
  roomId,
  onUsernameChange,
  onRoomIdChange,
  onJoin,
}: JoinScreenProps) {
  const canJoin = Boolean(username && roomId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <Zap className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Worms Multiplayer</h1>
            <p className="text-zinc-500 text-sm">Destructible terrain battle</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              placeholder="Enter your name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              Room ID
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => onRoomIdChange(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              placeholder="Enter room code"
            />
          </div>
          <button
            type="button"
            onClick={onJoin}
            disabled={!canJoin}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 group"
          >
            Join Battle
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
