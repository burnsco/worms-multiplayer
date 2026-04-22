import { describe, expect, it, vi } from 'vitest';
import { aimAngleFromPointer, canvasPointFromClient, clamp, distance } from './math';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../types';

describe('clamp', () => {
  it('clamps to bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('distance', () => {
  it('returns hypot between points', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });
});

describe('canvasPointFromClient', () => {
  it('maps client coords through scaled canvas rect', () => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: CANVAS_WIDTH / 2,
      height: CANVAS_HEIGHT / 2,
      right: 0,
      bottom: 0,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    const p = canvasPointFromClient(canvas, 100, 50);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);

    const p2 = canvasPointFromClient(canvas, 100 + CANVAS_WIDTH / 4, 50 + CANVAS_HEIGHT / 4);
    expect(p2.x).toBeCloseTo(CANVAS_WIDTH / 2);
    expect(p2.y).toBeCloseTo(CANVAS_HEIGHT / 2);
  });
});

describe('aimAngleFromPointer', () => {
  it('returns upward angle for pointer above worm', () => {
    const a = aimAngleFromPointer(100, 100, 100, 0, -Math.PI + 0.08, -0.08);
    expect(a).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('always returns angles inside the firing arc', () => {
    const min = -Math.PI + 0.08;
    const max = -0.08;
    const samples: [number, number, number, number][] = [
      [0, 0, 200, 0],
      [0, 0, 0, -200],
      [100, 100, 400, 500],
      [50, 50, -200, -5],
    ];
    for (const [wx, wy, px, py] of samples) {
      const a = aimAngleFromPointer(wx, wy, px, py, min, max);
      expect(a).toBeGreaterThanOrEqual(min);
      expect(a).toBeLessThanOrEqual(max);
    }
  });
});
