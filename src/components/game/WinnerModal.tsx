import { AnimatePresence, motion } from 'motion/react';
import { Trophy } from 'lucide-react';
import type { Player } from '../../types';

export type WinnerModalProps = {
  winner: Player | null;
  onPlayAgain: () => void;
};

export function WinnerModal({ winner, onPlayAgain }: WinnerModalProps) {
  return (
    <AnimatePresence>
      {winner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-zinc-900 border border-zinc-800 p-12 rounded-3xl text-center shadow-2xl max-w-sm w-full"
          >
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Victory!</h2>
            <p className="text-zinc-400 mb-8">
              <span className="font-bold text-zinc-100" style={{ color: winner.color }}>
                {winner.username}
              </span>{' '}
              is the last worm standing!
            </p>
            <button
              type="button"
              onClick={onPlayAgain}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all"
            >
              Play Again
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
