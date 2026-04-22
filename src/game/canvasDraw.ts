import type { Worm } from '../types';
import { WORM_RADIUS } from '../types';

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawWorm(
  ctx: CanvasRenderingContext2D,
  w: Worm,
  opts: { aimAngle?: number; isActive?: boolean }
) {
  const { aimAngle = 0, isActive } = opts;
  const r = WORM_RADIUS;
  ctx.save();
  ctx.fillStyle = 'rgba(3, 7, 18, 0.28)';
  ctx.beginPath();
  ctx.ellipse(w.x, w.y + r + 4, r * 1.15, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(w.x - 4, w.y - 5, 1, w.x, w.y, r + 4);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.45, w.color);
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (isActive) {
    ctx.shadowColor = 'rgba(16, 185, 129, 0.65)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(236,253,245,0.88)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const lx = Math.cos(aimAngle) * 2.5;
  const ly = Math.sin(aimAngle) * 1.2;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(w.x - 4 + lx, w.y - 3 + ly, 2.4, 0, Math.PI * 2);
  ctx.arc(w.x + 4 + lx, w.y - 3 + ly, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(w.x - 4 + lx * 1.3, w.y - 3 + ly * 1.1, 1.1, 0, Math.PI * 2);
  ctx.arc(w.x + 4 + lx * 1.3, w.y - 3 + ly * 1.1, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
