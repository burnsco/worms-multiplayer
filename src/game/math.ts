import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../types';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Map pointer position to logical canvas coordinates (handles CSS scaling). */
export function canvasPointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function aimAngleFromPointer(
  wormX: number,
  wormY: number,
  pointerX: number,
  pointerY: number,
  minAim: number,
  maxAim: number
): number {
  const ang = Math.atan2(pointerY - wormY, pointerX - wormX);
  return clamp(ang, minAim, maxAim);
}
