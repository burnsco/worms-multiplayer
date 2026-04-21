import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Play, Target, Zap, Trophy, ArrowRight, Wind } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  GameRoom,
  Player,
  Worm,
  Projectile,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRAVITY,
  WORM_RADIUS,
  EXPLOSION_RADIUS,
  windFromTerrainSeed,
  makeLCG,
} from './types';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Star = { x: number; y: number; r: number; a: number };

const AIM_COARSE = 0.08;
const AIM_FINE = 0.12;

function drawWorm(
  ctx: CanvasRenderingContext2D,
  w: Worm,
  opts: { aimAngle?: number; isActive?: boolean }
) {
  const { aimAngle = 0, isActive } = opts;
  const r = WORM_RADIUS;
  const g = ctx.createRadialGradient(w.x - 4, w.y - 5, 1, w.x, w.y, r + 4);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.45, w.color);
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (isActive) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
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
}

const socket: Socket = io();

export default function App() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);

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
  const aimAngleRef = useRef(0);
  const powerRef = useRef(50);
  const isFiringRef = useRef(false);
  const fireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const shakeRef = useRef(0);
  const terrainSeedRef = useRef(0);

  const setIsMyTurnSynced = (v: boolean) => { isMyTurnRef.current = v; setIsMyTurn(v); };
  const setIsFiringSynced = (v: boolean) => { isFiringRef.current = v; setIsFiring(v); };

  const generateTerrain = useCallback((seed: number) => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rand = makeLCG(seed * 1000000);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);

    for (let x = 0; x <= CANVAS_WIDTH; x++) {
      const y = CANVAS_HEIGHT * 0.7 +
                Math.sin(x * 0.01 + seed) * 50 +
                Math.sin(x * 0.005 + seed * 2) * 100;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#78350f';
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(rand() * CANVAS_WIDTH, rand() * CANVAS_HEIGHT + 400, 50, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    gameStateRef.current.terrainData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    terrainSeedRef.current = seed;
    const rand2 = makeLCG(seed * 76543.13);
    starsRef.current = Array.from({ length: 140 }, () => ({
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

  const explode = useCallback((ex: number, ey: number) => {
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
    for (let i = 0; i < 32; i++) {
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
      const dist = Math.sqrt((w.x - ex) ** 2 + (w.y - ey) ** 2);
      if (dist < EXPLOSION_RADIUS + WORM_RADIUS) {
        const damage = Math.max(0, 100 * (1 - dist / (EXPLOSION_RADIUS + WORM_RADIUS)));
        return { ...w, hp: Math.max(0, w.hp - damage) };
      }
      return w;
    });

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
  }, []);

  useEffect(() => {
    socket.on('room-update', (updatedRoom: GameRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('game-started', (startedRoom: GameRoom) => {
      setRoom(startedRoom);
      roomIdRef.current = startedRoom.id;
      gameStateRef.current.worms = startedRoom.worms.map(w => ({ ...w, vy: w.vy ?? 0 }));
      particlesRef.current = [];
      setIsMyTurnSynced(startedRoom.players[startedRoom.turnIndex].id === socket.id);
    });

    socket.on('turn-change', (newTurnIndex: number) => {
      // Use functional updater so we always have current players list
      setRoom(prev => {
        if (!prev) return null;
        const updated = { ...prev, turnIndex: newTurnIndex };
        setIsMyTurnSynced(updated.players[newTurnIndex].id === socket.id);
        return updated;
      });
      setIsFiringSynced(false);
    });

    socket.on('remote-action', ({ action }) => {
      if (action.type === 'fire') {
        const proj: Projectile = {
          x: action.x,
          y: action.y,
          vx: action.vx,
          vy: action.vy,
          radius: 5,
          type: 'bazooka'
        };
        gameStateRef.current.projectiles.push(proj);
      }
      if (action.type === 'move') {
        gameStateRef.current.worms = gameStateRef.current.worms.map(w =>
          w.id === action.wormId ? { ...w, x: action.x, y: action.y } : w
        );
      }
      if (action.type === 'jump') {
        gameStateRef.current.worms = gameStateRef.current.worms.map(w =>
          w.id === action.wormId ? { ...w, vy: action.vy } : w
        );
      }
    });

    return () => {
      socket.off('room-update');
      socket.off('game-started');
      socket.off('turn-change');
      socket.off('remote-action');
    };
  }, []);

  // Terrain generation must be deferred until this component mounts — the canvas isn't in the DOM inside socket handlers
  useEffect(() => {
    if (room?.gameState !== 'playing' || room.terrainSeed == null) return;
    generateTerrain(room.terrainSeed);
    gameStateRef.current.worms = gameStateRef.current.worms.map(w => {
      for (let y = 0; y < CANVAS_HEIGHT; y++) {
        if (checkTerrainCollision(w.x, y + WORM_RADIUS)) {
          return { ...w, y, vy: 0 };
        }
      }
      return { ...w, vy: w.vy ?? 0 };
    });
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
        p.vy += GRAVITY;
        p.vx += wind;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > CANVAS_WIDTH || p.y > CANVAS_HEIGHT) return false;
        if (p.y > 0 && checkTerrainCollision(p.x, p.y)) {
          explode(p.x, p.y);
          return false;
        }

        for (const w of gameStateRef.current.worms) {
          if (w.hp <= 0) continue;
          const dist = Math.sqrt((w.x - p.x) ** 2 + (w.y - p.y) ** 2);
          if (dist < WORM_RADIUS + p.radius) {
            explode(p.x, p.y);
            return false;
          }
        }

        return true;
      });

      gameStateRef.current.worms = gameStateRef.current.worms.map(w => {
        if (w.hp <= 0) return w;
        let vy = w.vy ?? 0;
        let newY = w.y;
        const newX = w.x;
        vy += GRAVITY * 0.9;
        newY += vy;
        let guard = 0;
        while (checkTerrainCollision(newX, newY + WORM_RADIUS) && newY > 0 && guard++ < 64) {
          newY -= 1;
          vy = 0;
        }
        guard = 0;
        while (checkTerrainCollision(newX, newY - WORM_RADIUS) && newY < CANVAS_HEIGHT - WORM_RADIUS && guard++ < 64) {
          newY += 1;
          vy = Math.max(vy, 0);
        }
        if (newY > CANVAS_HEIGHT - WORM_RADIUS) {
          return { ...w, x: newX, y: CANVAS_HEIGHT - WORM_RADIUS, vy: 0 };
        }
        return { ...w, x: newX, y: newY, vy };
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
        for (const st of bucket) ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const myWorm = gameStateRef.current.worms.find(w => w.playerId === socket.id);

      gameStateRef.current.worms.forEach(w => {
        if (w.hp <= 0) return;
        const isMe = myWorm?.id === w.id;
        const showAim = isMyTurnRef.current && isMe && !isFiringRef.current;
        drawWorm(ctx, w, {
          aimAngle: showAim ? aimAngleRef.current : 0,
          isActive: showAim,
        });

        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(w.x - 16, w.y - 28, 32, 5);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(w.x - 16, w.y - 28, 32 * (w.hp / 100), 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(w.x - 16, w.y - 28, 32, 5);

        ctx.fillStyle = 'rgba(248,250,252,0.95)';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.fillText(w.name, w.x, w.y - 34);
        ctx.shadowBlur = 0;

        if (showAim) {
          const ax = Math.cos(aimAngleRef.current);
          const ay = Math.sin(aimAngleRef.current);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(w.x, w.y);
          ctx.lineTo(w.x + ax * powerRef.current, w.y + ay * powerRef.current);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
          ctx.beginPath();
          ctx.arc(w.x + ax * (powerRef.current + 6), w.y + ay * (powerRef.current + 6), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      gameStateRef.current.projectiles.forEach(p => {
        ctx.shadowColor = 'rgba(254, 243, 199, 0.9)';
        ctx.shadowBlur = 12;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius + 4);
        g.addColorStop(0, '#fffbeb');
        g.addColorStop(0.5, '#fde68a');
        g.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fffef0';
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
  }, [room?.gameState, explode]);

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

    const myWorm = gameStateRef.current.worms.find(w => w.playerId === socket.id);
    if (!myWorm) return;

    const vx = Math.cos(aimAngleRef.current) * (powerRef.current / 5);
    const vy = Math.sin(aimAngleRef.current) * (powerRef.current / 5);

    const proj: Projectile = {
      x: myWorm.x,
      y: myWorm.y - 15,
      vx,
      vy,
      radius: 5,
      type: 'bazooka'
    };

    gameStateRef.current.projectiles.push(proj);
    setIsFiringSynced(true);

    socket.emit('action', {
      roomId: currentRoomId,
      action: { type: 'fire', x: proj.x, y: proj.y, vx, vy }
    });

    if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
    fireTimeoutRef.current = setTimeout(() => {
      socket.emit('end-turn', currentRoomId);
      fireTimeoutRef.current = null;
    }, 3000);
  }, []);

  const handleMove = useCallback((dir: number) => {
    if (!isMyTurnRef.current || isFiringRef.current) return;
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;

    const myWorm = gameStateRef.current.worms.find(w => w.playerId === socket.id);
    if (!myWorm) return;

    const newX = myWorm.x + dir * 5;
    if (newX > WORM_RADIUS && newX < CANVAS_WIDTH - WORM_RADIUS) {
      if (!checkTerrainCollision(newX + dir * WORM_RADIUS, myWorm.y)) {
        myWorm.x = newX;
        socket.emit('action', {
          roomId: currentRoomId,
          action: { type: 'move', wormId: myWorm.id, x: myWorm.x, y: myWorm.y },
        });
      }
    }
  }, []);

  const handleJump = useCallback(() => {
    if (!isMyTurnRef.current || isFiringRef.current) return;
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId) return;
    const myWorm = gameStateRef.current.worms.find(w => w.playerId === socket.id);
    if (!myWorm) return;
    const vy = myWorm.vy ?? 0;
    if (vy < -0.5) return;
    if (!checkTerrainCollision(myWorm.x, myWorm.y + WORM_RADIUS + 2)) return;

    const impulse = -6.8;
    gameStateRef.current.worms = gameStateRef.current.worms.map(w =>
      w.id === myWorm.id ? { ...w, vy: impulse } : w
    );
    socket.emit('action', {
      roomId: currentRoomId,
      action: { type: 'jump', wormId: myWorm.id, vy: impulse },
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handleMove(-1);
      if (e.key === 'ArrowRight') handleMove(1);
      if (e.key === 'ArrowUp') aimAngleRef.current -= AIM_COARSE;
      if (e.key === 'ArrowDown') aimAngleRef.current += AIM_COARSE;
      if (e.key === 'q' || e.key === 'Q') aimAngleRef.current -= AIM_FINE;
      if (e.key === 'e' || e.key === 'E') aimAngleRef.current += AIM_FINE;
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleJump();
      }
      if (e.key === ' ') {
        e.preventDefault();
        handleFire();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, handleFire, handleJump]);

  const handlePowerChange = (v: number) => {
    powerRef.current = v;
    setPower(v);
  };

  useEffect(() => {
    if (room?.id) roomIdRef.current = room.id;
  }, [room?.id]);

  useEffect(() => {
    return () => {
      if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden">
      {/* Game Header */}
      <div className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-500" />
            <span className="font-bold tracking-tight">WORMS CLONE</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          {room?.terrainSeed != null && (() => {
            const wind = windFromTerrainSeed(room.terrainSeed);
            return (
              <div
                className="flex items-center gap-2 px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-200"
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
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-4">
            {room?.players.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all ${room.turnIndex === i ? 'bg-emerald-500/20 ring-1 ring-emerald-500' : 'opacity-50'}`}
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
            className="flex items-center gap-4 px-4 py-1.5 bg-emerald-500 rounded-full text-zinc-950 font-bold text-xs uppercase tracking-widest"
          >
            Your Turn
          </motion.div>
        )}
      </div>

      {/* Game Area */}
      <div className="flex-1 relative bg-[#0c0c0e] flex items-center justify-center p-4">
        <div className="relative shadow-2xl rounded-lg overflow-hidden border border-zinc-800" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
          {/* Background Layer */}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-900 to-sky-950 opacity-50" />

          {/* Terrain Layer */}
          <canvas
            ref={terrainCanvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="absolute inset-0"
          />

          {/* Game Objects Layer */}
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="absolute inset-0"
          />

          {/* Controls Overlay */}
          {isMyTurn && !isFiring && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-8 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-6 rounded-2xl shadow-2xl">
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  <span>Power</span>
                  <span>{power}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={power}
                  onChange={(e) => handlePowerChange(parseInt(e.target.value))}
                  className="w-48 accent-emerald-500"
                />
              </div>
              <div className="h-12 w-px bg-zinc-800" />
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={handleFire}
                  className="w-16 h-16 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                >
                  <Target className="w-8 h-8 text-white" />
                </button>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Fire</span>
              </div>
              <div className="h-12 w-px bg-zinc-800" />
              <div className="text-zinc-400 text-[10px] font-medium leading-relaxed space-y-0.5">
                <p>← → Move · ↑ ↓ Aim</p>
                <p>Q / E Fine aim · W Jump</p>
                <p>Space Fire</p>
              </div>
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
