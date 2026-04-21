import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Play, Target, Zap, Trophy, ArrowRight, Wind, Clock, Bomb } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  GameRoom,
  Player,
  Worm,
  Projectile,
  WeaponType,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRAVITY,
  WORM_RADIUS,
  EXPLOSION_RADIUS,
  MAX_STEP_HEIGHT,
  MOVE_SPEED,
  JUMP_IMPULSE,
  BAZOOKA_DAMAGE,
  GRENADE_DAMAGE,
  windFromTerrainSeed,
  makeLCG,
} from './types';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Star = { x: number; y: number; r: number; a: number };

const AIM_COARSE = 0.08;
const AIM_FINE = 0.025;
const MIN_AIM = -Math.PI + 0.08;
const MAX_AIM = -0.08;
const TURN_END_DELAY_MS = 900;
const GRENADE_FUSE_FRAMES = 145;
const PROJECTILE_RADIUS = 5;
const WEAPON_CONFIG: Record<WeaponType, { label: string; damage: number; fuse: number | null; speedScale: number }> = {
  bazooka: { label: 'Bazooka', damage: BAZOOKA_DAMAGE, fuse: null, speedScale: 1 },
  grenade: { label: 'Grenade', damage: GRENADE_DAMAGE, fuse: GRENADE_FUSE_FRAMES, speedScale: 0.82 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function drawWorm(
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

const socket: Socket = io();

export default function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>('bazooka');
  const [timeLeft, setTimeLeft] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<{
    worms: Worm[];
    projectiles: Projectile[];
    terrainData: Uint8ClampedArray | null;
  }>({
    worms: [],
    projectiles: [],
    terrainData: null
  });

  const [power, setPower] = useState(50);
  const [isFiring, setIsFiring] = useState(false);

  const isMyTurnRef = useRef(false);
  const aimAngleRef = useRef(-0.78);
  const powerRef = useRef(50);
  const isFiringRef = useRef(false);
  const fireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const shakeRef = useRef(0);
  const terrainSeedRef = useRef(0);
  const activeWormIdRef = useRef<string | null>(null);
  const selectedWeaponRef = useRef<WeaponType>('bazooka');
  const pendingTurnEndRef = useRef(false);
  const lastSyncRef = useRef(0);

  const setIsMyTurnSynced = (v: boolean) => { isMyTurnRef.current = v; setIsMyTurn(v); };
  const setIsFiringSynced = (v: boolean) => { isFiringRef.current = v; setIsFiring(v); };
  const setSelectedWeaponSynced = (v: WeaponType) => { selectedWeaponRef.current = v; setSelectedWeapon(v); };

  const currentPlayerId = () => socket.id;

  const getActiveWorm = () => {
    const activeId = activeWormIdRef.current;
    return gameStateRef.current.worms.find(w => w.id === activeId && w.hp > 0) ?? null;
  };

  const setActiveTurn = useCallback((turnIndex: number, activeWormId?: string, turnEndsAt?: number) => {
    activeWormIdRef.current = activeWormId ?? null;
    pendingTurnEndRef.current = false;
    setIsFiringSynced(false);

    setRoom(prev => {
      if (!prev) return null;
      const updated = { ...prev, turnIndex, activeWormId, turnEndsAt };
      setIsMyTurnSynced(updated.players[turnIndex]?.id === currentPlayerId());
      return updated;
    });

    const active = gameStateRef.current.worms.find(w => w.id === activeWormId);
    if (active) {
      aimAngleRef.current = active.facing === 1 ? -0.78 : -2.36;
    }
  }, []);

  const generateTerrain = useCallback((seed: number) => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rand = makeLCG(seed * 1000000);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const terrainGradient = ctx.createLinearGradient(0, CANVAS_HEIGHT * 0.55, 0, CANVAS_HEIGHT);
    terrainGradient.addColorStop(0, '#7cc51d');
    terrainGradient.addColorStop(0.11, '#5d9d16');
    terrainGradient.addColorStop(0.18, '#496c18');
    terrainGradient.addColorStop(1, '#2f2418');
    ctx.fillStyle = terrainGradient;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);

    const surface: Array<{ x: number; y: number }> = [];
    for (let x = 0; x <= CANVAS_WIDTH; x++) {
      const y = CANVAS_HEIGHT * 0.7 +
                Math.sin(x * 0.01 + seed) * 50 +
                Math.sin(x * 0.005 + seed * 2) * 100;
      surface.push({ x, y });
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-atop';
    const soilGradient = ctx.createLinearGradient(0, CANVAS_HEIGHT * 0.62, 0, CANVAS_HEIGHT);
    soilGradient.addColorStop(0, 'rgba(120, 53, 15, 0.18)');
    soilGradient.addColorStop(0.55, 'rgba(64, 39, 18, 0.42)');
    soilGradient.addColorStop(1, 'rgba(17, 24, 39, 0.38)');
    ctx.fillStyle = soilGradient;
    ctx.fillRect(0, CANVAS_HEIGHT * 0.58, CANVAS_WIDTH, CANVAS_HEIGHT * 0.42);

    for (let i = 0; i < 28; i++) {
      ctx.beginPath();
      ctx.fillStyle = i % 3 === 0 ? 'rgba(146, 64, 14, 0.42)' : 'rgba(68, 64, 60, 0.24)';
      ctx.ellipse(
        rand() * CANVAS_WIDTH,
        rand() * CANVAS_HEIGHT + 380,
        26 + rand() * 52,
        16 + rand() * 42,
        rand() * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(20, 83, 45, 0.5)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    surface.forEach((pt, index) => {
      if (index === 0) ctx.moveTo(pt.x, pt.y + 4);
      else ctx.lineTo(pt.x, pt.y + 4);
    });
    ctx.stroke();

    ctx.strokeStyle = '#9be33a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    surface.forEach((pt, index) => {
      if (index === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    ctx.strokeStyle = 'rgba(236, 252, 203, 0.52)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    surface.forEach((pt, index) => {
      if (index === 0) ctx.moveTo(pt.x, pt.y - 2);
      else ctx.lineTo(pt.x, pt.y - 2);
    });
    ctx.stroke();

    gameStateRef.current.terrainData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    terrainSeedRef.current = seed;
    const rand2 = makeLCG(seed * 76543.13);
    starsRef.current = Array.from({ length: 95 }, () => ({
      x: rand2() * CANVAS_WIDTH,
      y: rand2() * CANVAS_HEIGHT * 0.52,
      r: 0.35 + rand2() * 1.4,
      a: 0.25 + rand2() * 0.7,
    }));
  }, []);

  const checkTerrainCollision = (x: number, y: number): boolean => {
    const data = gameStateRef.current.terrainData;
    if (!data) return false;
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 0 || px >= CANVAS_WIDTH || py < 0 || py >= CANVAS_HEIGHT) return false;
    return data[(py * CANVAS_WIDTH + px) * 4 + 3] > 0;
  };

  const circleHitsTerrain = (x: number, y: number, radius: number): boolean => {
    const samples = 12;
    if (checkTerrainCollision(x, y)) return true;
    for (let i = 0; i < samples; i++) {
      const angle = (Math.PI * 2 * i) / samples;
      if (checkTerrainCollision(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) {
        return true;
      }
    }
    return false;
  };

  const isGrounded = (w: Worm) =>
    checkTerrainCollision(w.x, w.y + WORM_RADIUS + 2) ||
    checkTerrainCollision(w.x - WORM_RADIUS * 0.7, w.y + WORM_RADIUS + 1) ||
    checkTerrainCollision(w.x + WORM_RADIUS * 0.7, w.y + WORM_RADIUS + 1);

  const settleWormOnTerrain = (w: Worm): Worm => {
    let y = w.y;
    let guard = 0;
    while (circleHitsTerrain(w.x, y, WORM_RADIUS - 1) && y > WORM_RADIUS && guard++ < 80) {
      y -= 1;
    }
    guard = 0;
    while (!checkTerrainCollision(w.x, y + WORM_RADIUS + 1) && y < CANVAS_HEIGHT - WORM_RADIUS && guard++ < 120) {
      y += 1;
    }
    return { ...w, y, vx: 0, vy: 0 };
  };

  const syncWormState = useCallback((force = false) => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId || !isMyTurnRef.current) return;
    const now = performance.now();
    if (!force && now - lastSyncRef.current < 350) return;
    lastSyncRef.current = now;
    socket.emit('sync-state', {
      roomId: currentRoomId,
      state: {
        worms: gameStateRef.current.worms.map(w => ({ ...w })),
      },
    });
  }, []);

  const requestTurnEnd = useCallback(() => {
    if (!isMyTurnRef.current || !roomIdRef.current) return;
    if (turnEndTimeoutRef.current) return;
    syncWormState(true);
    turnEndTimeoutRef.current = setTimeout(() => {
      if (roomIdRef.current) socket.emit('end-turn', roomIdRef.current);
      turnEndTimeoutRef.current = null;
      pendingTurnEndRef.current = false;
    }, TURN_END_DELAY_MS);
  }, [syncWormState]);

  const explode = useCallback((ex: number, ey: number, damage = BAZOOKA_DAMAGE) => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(ex, ey, EXPLOSION_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    gameStateRef.current.terrainData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;

    const pr = makeLCG(ex * 17.17 + ey * 31.97);
    for (let i = 0; i < 44; i++) {
      const ang = pr() * Math.PI * 2;
      const spd = 1.8 + pr() * 7;
      particlesRef.current.push({
        x: ex,
        y: ey,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.65 + pr() * 0.55,
        color: pr() > 0.55 ? '#fbbf24' : pr() > 0.25 ? '#fb923c' : '#fef9c3',
      });
    }
    shakeRef.current = Math.max(shakeRef.current, 11);

    gameStateRef.current.worms = gameStateRef.current.worms.map(w => {
      if (w.hp <= 0) return w;
      const dist = distance(w.x, w.y, ex, ey);
      const blastReach = EXPLOSION_RADIUS + WORM_RADIUS + 18;
      if (dist < blastReach) {
        const t = 1 - dist / blastReach;
        const appliedDamage = Math.max(4, damage * t);
        const nx = dist > 0 ? (w.x - ex) / dist : 0;
        const ny = dist > 0 ? (w.y - ey) / dist : -1;
        const force = 7.5 * t;
        return {
          ...w,
          hp: Math.max(0, w.hp - appliedDamage),
          vx: (w.vx ?? 0) + nx * force,
          vy: Math.min((w.vy ?? 0) + ny * force - 3.2 * t, -1.2),
        };
      }
      return w;
    });

    syncWormState(true);

    // Use ref worms here — room state is stale inside this useCallback closure
    const alive = gameStateRef.current.worms.filter(w => w.hp > 0);
    if (alive.length > 0 && alive.every(w => w.playerId === alive[0].playerId)) {
      const winnerId = alive[0].playerId;
      setRoom(prev => {
        if (!prev || prev.players.length <= 1) return prev;
        const winPlayer = prev.players.find((p: Player) => p.id === winnerId);
        if (winPlayer) {
          setWinner(winPlayer);
          confetti();
        }
        return prev;
      });
    }
  }, [syncWormState]);

  useEffect(() => {
    socket.on('room-update', (updatedRoom: GameRoom) => {
      setRoom(updatedRoom);
      if (updatedRoom.activeWormId) activeWormIdRef.current = updatedRoom.activeWormId;
      if (updatedRoom.gameState === 'gameover' && updatedRoom.winnerId) {
        const winPlayer = updatedRoom.players.find(p => p.id === updatedRoom.winnerId);
        if (winPlayer) setWinner(winPlayer);
      }
    });

    socket.on('game-started', (startedRoom: GameRoom) => {
      setRoom(startedRoom);
      roomIdRef.current = startedRoom.id;
      activeWormIdRef.current = startedRoom.activeWormId ?? null;
      gameStateRef.current.worms = startedRoom.worms.map(w => ({
        ...w,
        vx: w.vx ?? 0,
        vy: w.vy ?? 0,
        facing: w.facing ?? 1,
      }));
      gameStateRef.current.projectiles = [];
      particlesRef.current = [];
      pendingTurnEndRef.current = false;
      setIsMyTurnSynced(startedRoom.players[startedRoom.turnIndex].id === socket.id);
      const active = gameStateRef.current.worms.find(w => w.id === startedRoom.activeWormId);
      if (active) aimAngleRef.current = active.facing === 1 ? -0.78 : -2.36;
    });

    socket.on('turn-change', (payload: number | { turnIndex: number; activeWormId?: string; turnEndsAt?: number }) => {
      const turnIndex = typeof payload === 'number' ? payload : payload.turnIndex;
      const activeWormId = typeof payload === 'number' ? undefined : payload.activeWormId;
      const turnEndsAt = typeof payload === 'number' ? undefined : payload.turnEndsAt;
      if (turnEndTimeoutRef.current) {
        clearTimeout(turnEndTimeoutRef.current);
        turnEndTimeoutRef.current = null;
      }
      setActiveTurn(turnIndex, activeWormId, turnEndsAt);
    });

    socket.on('remote-action', ({ action }) => {
      if (action.type === 'fire') {
        const proj: Projectile = {
          id: action.id,
          ownerId: action.ownerId,
          x: action.x,
          y: action.y,
          vx: action.vx,
          vy: action.vy,
          radius: action.radius ?? PROJECTILE_RADIUS,
          type: action.weapon ?? 'bazooka',
          fuse: action.fuse ?? null,
          age: 0,
          bounces: 0,
        };
        gameStateRef.current.projectiles.push(proj);
      }
      if (action.type === 'move') {
        gameStateRef.current.worms = gameStateRef.current.worms.map(w =>
          w.id === action.wormId ? { ...w, x: action.x, y: action.y, vx: action.vx ?? 0, vy: action.vy ?? 0, facing: action.facing ?? w.facing } : w
        );
      }
      if (action.type === 'jump') {
        gameStateRef.current.worms = gameStateRef.current.worms.map(w =>
          w.id === action.wormId ? { ...w, vx: action.vx ?? w.vx, vy: action.vy, facing: action.facing ?? w.facing } : w
        );
      }
    });

    socket.on('state-update', (state: { worms?: Worm[] }) => {
      if (!Array.isArray(state?.worms)) return;
      const byId = new Map(state.worms.map(w => [w.id, w]));
      gameStateRef.current.worms = gameStateRef.current.worms.map(w => byId.get(w.id) ?? w);
    });

    socket.on('game-over', (endedRoom: GameRoom) => {
      setRoom(endedRoom);
      const winPlayer = endedRoom.players.find(p => p.id === endedRoom.winnerId);
      if (winPlayer) {
        setWinner(winPlayer);
        confetti();
      }
    });

    return () => {
      socket.off('room-update');
      socket.off('game-started');
      socket.off('turn-change');
      socket.off('remote-action');
      socket.off('state-update');
      socket.off('game-over');
    };
  }, [setActiveTurn]);

  // Terrain generation must be deferred until this component mounts — the canvas isn't in the DOM inside socket handlers
  useEffect(() => {
    if (room?.gameState !== 'playing' || room.terrainSeed == null) return;
    generateTerrain(room.terrainSeed);
    gameStateRef.current.worms = gameStateRef.current.worms.map(w => settleWormOnTerrain({
      ...w,
      vx: w.vx ?? 0,
      vy: w.vy ?? 0,
      facing: w.facing ?? 1,
    }));
  }, [room?.gameState, room?.terrainSeed, generateTerrain]);

  useEffect(() => {
    if (!room || room.gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const wind = windFromTerrainSeed(terrainSeedRef.current);

      if (particlesRef.current.length > 0) {
        particlesRef.current = particlesRef.current.filter(pt => {
          pt.life -= 0.018;
          if (pt.life <= 0) return false;
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.1;
          pt.vx *= 0.99;
          return true;
        });
      }

      gameStateRef.current.projectiles = gameStateRef.current.projectiles.filter(p => {
        const config = WEAPON_CONFIG[p.type];
        const fuseDone = p.fuse != null && p.age >= p.fuse;
        p.age += 1;
        p.vy += GRAVITY;
        p.vx += p.type === 'grenade' ? wind * 0.45 : wind;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -40 || p.x > CANVAS_WIDTH + 40 || p.y > CANVAS_HEIGHT + 80) return false;

        const terrainHit = p.y > 0 && circleHitsTerrain(p.x, p.y, p.radius);
        let wormHit = false;
        for (const w of gameStateRef.current.worms) {
          if (w.hp <= 0) continue;
          if (distance(w.x, w.y, p.x, p.y) < WORM_RADIUS + p.radius) {
            wormHit = true;
            break;
          }
        }

        if (p.type === 'grenade' && terrainHit && !fuseDone) {
          p.x -= p.vx;
          p.y -= p.vy;
          p.vx *= 0.72;
          p.vy = -Math.abs(p.vy) * 0.58;
          p.bounces += 1;
          let guard = 0;
          while (circleHitsTerrain(p.x, p.y, p.radius) && guard++ < 24) {
            p.y -= 1;
          }
          if (Math.abs(p.vy) < 0.6) p.vy = -0.6;
          return true;
        }

        if (terrainHit || (wormHit && p.type === 'bazooka') || fuseDone) {
          explode(p.x, p.y, config.damage);
          return false;
        }

        return true;
      });

      if (pendingTurnEndRef.current && gameStateRef.current.projectiles.length === 0) {
        requestTurnEnd();
      }

      gameStateRef.current.worms = gameStateRef.current.worms.map(w => {
        if (w.hp <= 0) return w;
        let vx = w.vx ?? 0;
        let vy = w.vy ?? 0;
        let newX = w.x + vx;
        let newY = w.y + vy;
        const wasGrounded = isGrounded(w);
        const impactVy = vy;

        vy += GRAVITY * 0.9;
        vx *= wasGrounded ? 0.78 : 0.992;

        if (newX < WORM_RADIUS) {
          newX = WORM_RADIUS;
          vx = Math.abs(vx) * 0.2;
        }
        if (newX > CANVAS_WIDTH - WORM_RADIUS) {
          newX = CANVAS_WIDTH - WORM_RADIUS;
          vx = -Math.abs(vx) * 0.2;
        }

        let guard = 0;
        let landed = false;
        while (circleHitsTerrain(newX, newY, WORM_RADIUS - 1) && newY > WORM_RADIUS && guard++ < 96) {
          newY -= 1;
          landed = impactVy > 0.8;
          vy = 0;
        }

        if (newY > CANVAS_HEIGHT - WORM_RADIUS) {
          newY = CANVAS_HEIGHT - WORM_RADIUS;
          landed = true;
          vy = 0;
        }

        const fallDamage = landed && impactVy > 8.5 ? (impactVy - 8.5) * 7 : 0;
        const hp = Math.max(0, w.hp - fallDamage);
        if (landed && fallDamage > 0) syncWormState();

        if (Math.abs(vx) < 0.04) vx = 0;
        return { ...w, x: newX, y: newY, vx, vy, hp };
      });

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.save();
      const sk = shakeRef.current;
      if (sk > 0.2) {
        ctx.translate((Math.random() - 0.5) * sk * 0.45, (Math.random() - 0.5) * sk * 0.45);
        shakeRef.current *= 0.9;
      }

      const starsByAlpha = new Map<number, Star[]>();
      for (const st of starsRef.current) {
        const key = Math.round(st.a * 10) / 10;
        let bucket = starsByAlpha.get(key);
        if (!bucket) { bucket = []; starsByAlpha.set(key, bucket); }
        bucket.push(st);
      }
      for (const [alpha, bucket] of starsByAlpha) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        for (const st of bucket) {
          ctx.moveTo(st.x + st.r, st.y);
          ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      const activeWorm = gameStateRef.current.worms.find(w => w.id === activeWormIdRef.current && w.hp > 0);

      gameStateRef.current.worms.forEach(w => {
        if (w.hp <= 0) return;
        const isActiveWorm = activeWorm?.id === w.id;
        const showAim = isMyTurnRef.current && isActiveWorm && w.playerId === socket.id && !isFiringRef.current;
        drawWorm(ctx, w, {
          aimAngle: showAim ? aimAngleRef.current : 0,
          isActive: isActiveWorm,
        });

        ctx.save();
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const labelWidth = Math.max(46, ctx.measureText(w.name).width + 16);
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(12, 16, 24, 0.78)';
        roundedRect(ctx, w.x - labelWidth / 2, w.y - 45, labelWidth, 17, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(248,250,252,0.96)';
        ctx.fillText(w.name, w.x, w.y - 33);

        ctx.fillStyle = 'rgba(69, 10, 10, 0.9)';
        roundedRect(ctx, w.x - 18, w.y - 24, 36, 5, 2.5);
        ctx.fill();
        ctx.fillStyle = w.hp > 45 ? '#34d399' : w.hp > 20 ? '#fbbf24' : '#fb7185';
        roundedRect(ctx, w.x - 18, w.y - 24, 36 * (w.hp / 100), 5, 2.5);
        ctx.fill();
        ctx.restore();

        if (isActiveWorm) {
          ctx.strokeStyle = w.playerId === socket.id ? 'rgba(52, 211, 153, 0.95)' : 'rgba(250, 204, 21, 0.85)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(w.x - 9, w.y - 53);
          ctx.lineTo(w.x, w.y - 62);
          ctx.lineTo(w.x + 9, w.y - 53);
          ctx.stroke();
          ctx.lineWidth = 1;
        }

        if (showAim) {
          const ax = Math.cos(aimAngleRef.current);
          const ay = Math.sin(aimAngleRef.current);
          ctx.strokeStyle = 'rgba(240, 253, 250, 0.72)';
          ctx.setLineDash([7, 7]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(w.x, w.y);
          ctx.lineTo(w.x + ax * powerRef.current, w.y + ay * powerRef.current);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          ctx.fillStyle = 'rgba(251, 191, 36, 0.95)';
          ctx.beginPath();
          ctx.arc(w.x + ax * (powerRef.current + 6), w.y + ay * (powerRef.current + 6), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      gameStateRef.current.projectiles.forEach(p => {
        ctx.shadowColor = p.type === 'grenade' ? 'rgba(134, 239, 172, 0.9)' : 'rgba(254, 243, 199, 0.9)';
        ctx.shadowBlur = 12;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius + 4);
        g.addColorStop(0, p.type === 'grenade' ? '#dcfce7' : '#fffbeb');
        g.addColorStop(0.5, p.type === 'grenade' ? '#86efac' : '#fde68a');
        g.addColorStop(1, p.type === 'grenade' ? 'rgba(34, 197, 94, 0)' : 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.type === 'grenade' ? '#14532d' : '#fffef0';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.65, 0, Math.PI * 2);
        ctx.fill();
      });

      for (const pt of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pt.life));
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.2 + pt.life * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(animationFrameId);
  }, [room?.gameState, explode, requestTurnEnd, syncWormState]);

  const handleJoin = () => {
    if (username && roomId) {
      socket.emit('join-room', { roomId, username });
      setInRoom(true);
    }
  };

  const handleStart = () => {
    if (room) {
      socket.emit('start-game', room.id);
    }
  };

  const handleFire = useCallback(() => {
    if (!isMyTurnRef.current || isFiringRef.current) return;
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;

    const myWorm = getActiveWorm();
    if (!myWorm || myWorm.playerId !== socket.id) return;
    if (!isGrounded(myWorm)) return;

    const weapon = selectedWeaponRef.current;
    const config = WEAPON_CONFIG[weapon];
    const muzzleOffset = WORM_RADIUS + 6;
    const shotSpeed = (powerRef.current / 5) * config.speedScale;
    const startX = myWorm.x + Math.cos(aimAngleRef.current) * muzzleOffset;
    const startY = myWorm.y + Math.sin(aimAngleRef.current) * muzzleOffset;
    const vx = Math.cos(aimAngleRef.current) * shotSpeed;
    const vy = Math.sin(aimAngleRef.current) * shotSpeed;

    const proj: Projectile = {
      id: crypto.randomUUID(),
      ownerId: socket.id ?? '',
      x: startX,
      y: startY,
      vx,
      vy,
      radius: PROJECTILE_RADIUS,
      type: weapon,
      fuse: config.fuse,
      age: 0,
      bounces: 0,
    };

    gameStateRef.current.projectiles.push(proj);
    setIsFiringSynced(true);
    pendingTurnEndRef.current = true;

    socket.emit('action', {
      roomId: currentRoomId,
      action: {
        type: 'fire',
        id: proj.id,
        ownerId: proj.ownerId,
        weapon,
        x: proj.x,
        y: proj.y,
        vx,
        vy,
        radius: proj.radius,
        fuse: proj.fuse,
      }
    });
  }, []);

  const handleMove = useCallback((dir: number) => {
    if (!isMyTurnRef.current || isFiringRef.current) return;
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;

    const myWorm = getActiveWorm();
    if (!myWorm || myWorm.playerId !== socket.id || !isGrounded(myWorm)) return;

    const targetX = clamp(myWorm.x + dir * MOVE_SPEED, WORM_RADIUS, CANVAS_WIDTH - WORM_RADIUS);
    let moved: Worm | null = null;

    for (let stepUp = 0; stepUp <= MAX_STEP_HEIGHT; stepUp++) {
      let candidateY = myWorm.y - stepUp;
      if (circleHitsTerrain(targetX, candidateY, WORM_RADIUS - 1)) continue;

      let drop = 0;
      while (!checkTerrainCollision(targetX, candidateY + WORM_RADIUS + 1) && drop < MAX_STEP_HEIGHT + 18) {
        candidateY += 1;
        drop += 1;
      }

      moved = {
        ...myWorm,
        x: targetX,
        y: candidateY,
        vx: 0,
        vy: 0,
        facing: dir > 0 ? 1 : -1,
      };
      break;
    }

    if (!moved) return;

    gameStateRef.current.worms = gameStateRef.current.worms.map(w => w.id === moved.id ? moved : w);
    socket.emit('action', {
      roomId: currentRoomId,
      action: {
        type: 'move',
        wormId: moved.id,
        x: moved.x,
        y: moved.y,
        vx: moved.vx,
        vy: moved.vy,
        facing: moved.facing,
      },
    });
    syncWormState();

    if (moved.facing === 1 && aimAngleRef.current < -Math.PI / 2) {
      aimAngleRef.current = -0.78;
    }
    if (moved.facing === -1 && aimAngleRef.current > -Math.PI / 2) {
      aimAngleRef.current = -2.36;
    }
  }, [syncWormState]);

  const handleJump = useCallback(() => {
    if (!isMyTurnRef.current || isFiringRef.current) return;
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    const myWorm = getActiveWorm();
    if (!myWorm || myWorm.playerId !== socket.id) return;
    const vy = myWorm.vy ?? 0;
    if (vy < -0.5) return;
    if (!isGrounded(myWorm)) return;

    const impulse = JUMP_IMPULSE;
    const vx = myWorm.facing * 1.25;
    gameStateRef.current.worms = gameStateRef.current.worms.map(w =>
      w.id === myWorm.id ? { ...w, vx, vy: impulse } : w
    );
    socket.emit('action', {
      roomId: currentRoomId,
      action: { type: 'jump', wormId: myWorm.id, vx, vy: impulse, facing: myWorm.facing },
    });
    syncWormState();
  }, [syncWormState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handleMove(-1);
      if (e.key === 'ArrowRight') handleMove(1);
      if (e.key === 'ArrowUp') aimAngleRef.current = clamp(aimAngleRef.current - AIM_COARSE, MIN_AIM, MAX_AIM);
      if (e.key === 'ArrowDown') aimAngleRef.current = clamp(aimAngleRef.current + AIM_COARSE, MIN_AIM, MAX_AIM);
      if (e.key === 'q' || e.key === 'Q') aimAngleRef.current = clamp(aimAngleRef.current - AIM_FINE, MIN_AIM, MAX_AIM);
      if (e.key === 'e' || e.key === 'E') aimAngleRef.current = clamp(aimAngleRef.current + AIM_FINE, MIN_AIM, MAX_AIM);
      if (e.key === '1') setSelectedWeaponSynced('bazooka');
      if (e.key === '2') setSelectedWeaponSynced('grenade');
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleJump();
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) handleFire();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, handleFire, handleJump]);

  const handlePowerChange = (v: number) => {
    powerRef.current = v;
    setPower(v);
  };

  const handleWeaponChange = (weapon: WeaponType) => {
    setSelectedWeaponSynced(weapon);
  };

  useEffect(() => {
    if (room?.id) roomIdRef.current = room.id;
  }, [room?.id]);

  useEffect(() => {
    const tick = () => {
      if (!room?.turnEndsAt || room.gameState !== 'playing') {
        setTimeLeft(0);
        return;
      }
      setTimeLeft(Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000)));
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [room?.turnEndsAt, room?.gameState]);

  useEffect(() => {
    return () => {
      if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
      if (turnEndTimeoutRef.current) clearTimeout(turnEndTimeoutRef.current);
    };
  }, []);

  if (!inRoom) {
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
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="Enter your name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Room ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="Enter room code"
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!username || !roomId}
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

  if (room?.gameState === 'lobby') {
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
                  {p.id === socket.id && <span className="ml-auto text-[10px] text-zinc-500 font-bold uppercase">You</span>}
                </motion.div>
              ))}
            </div>

            <button
              onClick={handleStart}
              disabled={room.players.length < 2}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              Start Game
            </button>
            {room.players.length < 2 && (
              <p className="text-center text-zinc-500 text-sm mt-4">Need at least 2 players to start</p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans overflow-hidden">
      {/* Game Header */}
      <div className="h-16 bg-[#17181f]/95 border-b border-white/10 flex items-center justify-between px-6 shrink-0 shadow-lg shadow-black/20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-500" />
            <span className="font-bold tracking-tight">WORMS ARENA</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          {room?.terrainSeed != null && (() => {
            const wind = windFromTerrainSeed(room.terrainSeed);
            return (
              <div
                className="flex items-center gap-2 px-3 py-1 rounded-md bg-sky-500/[0.12] border border-sky-300/20 text-sky-100 shadow-inner shadow-sky-950/40"
                title="Wind pushes shots each frame; same for every player in this match."
              >
                <Wind
                  className="w-4 h-4 shrink-0"
                  style={{ transform: `scaleX(${wind >= 0 ? 1 : -1})` }}
                />
                <span className="text-[11px] font-semibold tabular-nums">
                  {(wind * 1000).toFixed(1)}
                </span>
              </div>
            );
          })()}
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.07] border border-white/10 text-zinc-100 shadow-inner shadow-black/20">
            <Clock className="w-4 h-4 text-amber-300" />
            <span className="text-[11px] font-semibold tabular-nums">{timeLeft}s</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-4">
            {room?.players.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-1 rounded-md transition-all ${room.turnIndex === i ? 'bg-emerald-400/[0.16] ring-1 ring-emerald-300/60 text-white' : 'opacity-55'}`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-sm font-medium">{p.username}</span>
              </div>
            ))}
          </div>
        </div>

        {isMyTurn && !isFiring && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 px-4 py-1.5 bg-emerald-400 rounded-full text-zinc-950 font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-950/30"
          >
            Your Turn
          </motion.div>
        )}
      </div>

      {/* Game Area */}
      <div className="flex-1 relative bg-[#08090d] flex items-center justify-center p-4">
        <div
          className="relative shadow-2xl shadow-black/50 rounded-lg overflow-hidden border border-white/10 bg-slate-950"
          style={{ width: `min(100%, ${CANVAS_WIDTH}px, calc((100vh - 7rem) * ${CANVAS_WIDTH / CANVAS_HEIGHT}))`, aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
        >
          {/* Background Layer */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(14,165,233,0.24),transparent_25%),linear-gradient(180deg,#10283d_0%,#0b1d2e_46%,#07121e_100%)]" />
          <div className="absolute right-[10%] top-[9%] h-14 w-14 rounded-full bg-amber-100/90 shadow-[0_0_34px_rgba(253,230,138,0.38)]" />
          <div
            className="absolute inset-x-0 bottom-0 h-[48%] bg-slate-900/[0.45]"
            style={{ clipPath: 'polygon(0 58%, 9% 41%, 18% 55%, 31% 28%, 43% 47%, 55% 22%, 67% 50%, 79% 31%, 91% 48%, 100% 24%, 100% 100%, 0 100%)' }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[39%] bg-cyan-950/[0.45]"
            style={{ clipPath: 'polygon(0 42%, 13% 20%, 24% 48%, 36% 18%, 49% 42%, 60% 26%, 72% 51%, 84% 23%, 100% 43%, 100% 100%, 0 100%)' }}
          />

          {/* Terrain Layer */}
          <canvas
            ref={terrainCanvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          />

          {/* Game Objects Layer */}
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          />

          {/* Controls Overlay */}
          {isMyTurn && !isFiring && (
            <div className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-zinc-950/[0.82] px-3 py-3 shadow-2xl shadow-black/45 backdrop-blur-md">
              <div className="flex items-center gap-2">
                {(['bazooka', 'grenade'] as WeaponType[]).map((weapon) => {
                  const active = selectedWeapon === weapon;
                  const Icon = weapon === 'bazooka' ? Target : Bomb;
                  return (
                    <button
                      key={weapon}
                      onClick={() => handleWeaponChange(weapon)}
                      className={`h-10 w-10 rounded-md border flex items-center justify-center transition-all ${active ? 'bg-emerald-400 text-zinc-950 border-emerald-200 shadow-lg shadow-emerald-950/30' : 'bg-white/5 text-zinc-300 border-white/10 hover:border-white/25 hover:bg-white/10'}`}
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
                  min="10"
                  max="100"
                  value={power}
                  onChange={(e) => handlePowerChange(parseInt(e.target.value))}
                  className="w-44 accent-emerald-400"
                  title="Shot power"
                />
              </div>
              <div className="h-9 w-px bg-white/10 hidden sm:block" />
              <button
                onClick={handleFire}
                className="h-12 w-12 bg-emerald-500 hover:bg-emerald-400 rounded-full flex items-center justify-center shadow-lg shadow-emerald-950/40 transition-all active:scale-95"
                title="Fire"
              >
                <Target className="w-6 h-6 text-zinc-950" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Winner Modal */}
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
                <span className="font-bold text-zinc-100" style={{ color: winner.color }}>{winner.username}</span> is the last worm standing!
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all"
              >
                Play Again
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
