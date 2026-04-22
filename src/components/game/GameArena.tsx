import type { PointerEvent, RefObject, WheelEvent, ReactNode } from 'react';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../types';

export type GameArenaProps = {
  gameCanvasRef: RefObject<HTMLCanvasElement | null>;
  terrainCanvasRef: RefObject<HTMLCanvasElement | null>;
  crosshair: boolean;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onWheel: (e: WheelEvent<HTMLDivElement>) => void;
  controls?: ReactNode;
};

export function GameArena({
  gameCanvasRef,
  terrainCanvasRef,
  crosshair,
  onPointerMove,
  onPointerDown,
  onWheel,
  controls,
}: GameArenaProps) {
  return (
    <div className="flex-1 relative bg-[#08090d] flex items-center justify-center p-4">
      <div
        className={`relative shadow-2xl shadow-black/50 rounded-lg overflow-hidden border border-white/10 bg-slate-950 ${
          crosshair ? 'cursor-crosshair' : ''
        }`}
        style={{
          width: `min(100%, ${CANVAS_WIDTH}px, calc((100vh - 7rem) * ${CANVAS_WIDTH / CANVAS_HEIGHT}))`,
          aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
        }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onWheel={onWheel}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(14,165,233,0.24),transparent_25%),linear-gradient(180deg,#10283d_0%,#0b1d2e_46%,#07121e_100%)]" />
        <div className="pointer-events-none absolute right-[10%] top-[9%] h-14 w-14 rounded-full bg-amber-100/90 shadow-[0_0_34px_rgba(253,230,138,0.38)]" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-slate-900/[0.45]"
          style={{
            clipPath: 'polygon(0 58%, 9% 41%, 18% 55%, 31% 28%, 43% 47%, 55% 22%, 67% 50%, 79% 31%, 91% 48%, 100% 24%, 100% 100%, 0 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[39%] bg-cyan-950/[0.45]"
          style={{
            clipPath: 'polygon(0 42%, 13% 20%, 24% 48%, 36% 18%, 49% 42%, 60% 26%, 72% 51%, 84% 23%, 100% 43%, 100% 100%, 0 100%)',
          }}
        />

        <canvas
          ref={terrainCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        />

        <canvas
          ref={gameCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        />

        {controls}
      </div>
    </div>
  );
}
