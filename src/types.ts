export interface Player {
  id: string;
  username: string;
  color: string;
}

export interface Worm {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vy: number;
  hp: number;
  name: string;
  color: string;
}

export interface GameRoom {
  id: string;
  players: Player[];
  gameState: 'lobby' | 'playing' | 'gameover';
  turnIndex: number;
  worms: Worm[];
  terrainSeed: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'bazooka' | 'grenade';
}

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 600;
export const GRAVITY = 0.2;
export const WORM_RADIUS = 10;
export const EXPLOSION_RADIUS = 40;

/** Horizontal acceleration applied to projectiles each frame; derived from room seed so all clients match. */
export function windFromTerrainSeed(seed: number): number {
  return Math.sin(seed * 12.9898) * 0.028 + Math.cos(seed * 78.233) * 0.018;
}

/** Returns a seeded LCG PRNG — call the returned function repeatedly for successive values in [0, 1). */
export function makeLCG(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
