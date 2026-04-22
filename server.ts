import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  CANVAS_WIDTH,
  TURN_TIME_SECONDS,
  WORMS_PER_PLAYER,
} from './src/types';

const SHOT_RESOLVE_SECONDS = 22;

type Room = {
  id: string;
  players: Array<{ id: string; username: string; color: string }>;
  gameState: 'lobby' | 'playing' | 'gameover';
  turnIndex: number;
  worms: Array<{
    id: string;
    playerId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    hp: number;
    name: string;
    color: string;
    facing: -1 | 1;
  }>;
  terrainSeed: number;
  activeWormId?: string;
  turnEndsAt?: number;
  winnerId?: string;
  wormTurnCursors: Record<string, number>;
  lastUpdate: number;
};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT ?? 3000);

  // Game State
  const rooms = new Map<string, Room>();
  const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTurnTimer = (roomId: string) => {
    const timer = turnTimers.get(roomId);
    if (timer) clearTimeout(timer);
    turnTimers.delete(roomId);
  };

  const livingPlayerIds = (room: Room) => {
    const ids = new Set<string>();
    for (const worm of room.worms) {
      if (worm.hp > 0) ids.add(worm.playerId);
    }
    return ids;
  };

  const chooseActiveWorm = (room: Room, playerId: string) => {
    const worms = room.worms.filter((worm) => worm.playerId === playerId && worm.hp > 0);
    if (worms.length === 0) return undefined;
    const previousCursor = room.wormTurnCursors[playerId] ?? -1;
    const nextCursor = (previousCursor + 1) % worms.length;
    room.wormTurnCursors[playerId] = nextCursor;
    return worms[nextCursor]?.id;
  };

  const findNextTurnIndex = (room: Room, fromIndex: number) => {
    const alive = livingPlayerIds(room);
    if (alive.size === 0) return -1;
    for (let offset = 1; offset <= room.players.length; offset++) {
      const idx = (fromIndex + offset) % room.players.length;
      if (alive.has(room.players[idx]?.id)) return idx;
    }
    return -1;
  };

  const emitGameOverIfNeeded = (roomId: string, room: Room) => {
    const alive = livingPlayerIds(room);
    if (alive.size !== 1 || room.players.length <= 1) return false;

    room.gameState = 'gameover';
    room.winnerId = [...alive][0];
    clearTurnTimer(roomId);
    io.to(roomId).emit('game-over', room);
    io.to(roomId).emit('room-update', room);
    return true;
  };

  const scheduleTurnTimer = (roomId: string, room: Room) => {
    clearTurnTimer(roomId);
    room.turnEndsAt = Date.now() + TURN_TIME_SECONDS * 1000;
    turnTimers.set(roomId, setTimeout(() => {
      const latest = rooms.get(roomId);
      if (!latest || latest.gameState !== 'playing') return;
      advanceTurn(roomId, latest);
    }, TURN_TIME_SECONDS * 1000 + 250));
  };

  const advanceTurn = (roomId: string, room: Room) => {
    if (emitGameOverIfNeeded(roomId, room)) return;

    const nextTurnIndex = findNextTurnIndex(room, room.turnIndex);
    if (nextTurnIndex < 0) return;

    room.turnIndex = nextTurnIndex;
    room.activeWormId = chooseActiveWorm(room, room.players[nextTurnIndex].id);
    scheduleTurnTimer(roomId, room);
    io.to(roomId).emit('turn-change', {
      turnIndex: room.turnIndex,
      activeWormId: room.activeWormId,
      turnEndsAt: room.turnEndsAt,
    });
    io.to(roomId).emit('room-update', room);
  };

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, username }) => {
      const cleanRoomId = String(roomId ?? '').trim().slice(0, 32);
      const cleanUsername = String(username ?? '').trim().slice(0, 20);
      if (!cleanRoomId || !cleanUsername) {
        socket.emit('error', 'Room ID and username are required');
        return;
      }

      let room = rooms.get(cleanRoomId);
      
      if (!room) {
        room = {
          id: cleanRoomId,
          players: [],
          gameState: 'lobby',
          turnIndex: 0,
          worms: [],
          terrainSeed: Math.random(),
          wormTurnCursors: {},
          lastUpdate: Date.now()
        };
        rooms.set(cleanRoomId, room);
      }

      if (room.gameState !== 'lobby') {
        socket.emit('error', 'Game already in progress');
        return;
      }

      const existingPlayer = room.players.find((player) => player.id === socket.id);
      if (existingPlayer) {
        existingPlayer.username = cleanUsername;
        socket.join(cleanRoomId);
        io.to(cleanRoomId).emit('room-update', room);
        return;
      }

      const player = {
        id: socket.id,
        username: cleanUsername,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
      };

      room.players.push(player);
      socket.join(cleanRoomId);
      io.to(cleanRoomId).emit('room-update', room);
    });

    socket.on('start-game', (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.players.length >= 2) {
        room.gameState = 'playing';
        room.turnIndex = 0;
        room.winnerId = undefined;
        room.wormTurnCursors = {};
        
        // Initialize worms
        const totalWorms = room.players.length * WORMS_PER_PLAYER;
        room.worms = room.players.flatMap((p, playerIndex) =>
          Array.from({ length: WORMS_PER_PLAYER }, (_, wormIndex) => {
            const slot = wormIndex * room.players.length + playerIndex;
            const t = totalWorms === 1 ? 0.5 : slot / (totalWorms - 1);
            const x = 130 + t * (CANVAS_WIDTH - 260);

            return {
              id: uuidv4(),
              playerId: p.id,
              x,
              y: 0, // Will be adjusted by client terrain
              vx: 0,
              vy: 0,
              hp: 100,
              name: WORMS_PER_PLAYER === 1 ? p.username : `${p.username} ${wormIndex + 1}`,
              color: p.color,
              facing: playerIndex % 2 === 0 ? 1 : -1,
            };
          })
        );

        room.activeWormId = chooseActiveWorm(room, room.players[room.turnIndex].id);
        scheduleTurnTimer(roomId, room);

        io.to(roomId).emit('game-started', room);
      }
    });

    socket.on('action', ({ roomId, action }) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== 'playing') return;
      const current = room.players[room.turnIndex];
      if (!current || current.id !== socket.id) return;
      if ((action.type === 'move' || action.type === 'jump') && action.wormId !== room.activeWormId) return;
      if (action.type === 'fire') {
        clearTurnTimer(roomId);
        room.turnEndsAt = Date.now() + SHOT_RESOLVE_SECONDS * 1000;
        turnTimers.set(roomId, setTimeout(() => {
          const latest = rooms.get(roomId);
          if (!latest || latest.gameState !== 'playing') return;
          advanceTurn(roomId, latest);
        }, SHOT_RESOLVE_SECONDS * 1000 + 250));
        io.to(roomId).emit('room-update', room);
      }
      socket.to(roomId).emit('remote-action', { playerId: socket.id, action });
    });

    socket.on('sync-state', ({ roomId, state }: { roomId: string; state?: { worms?: Room['worms'] } }) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== 'playing') return;
      const current = room.players[room.turnIndex];
      if (!current || current.id !== socket.id) return;

      if (Array.isArray(state?.worms)) {
        const byId = new Map(state.worms.map((worm) => [worm.id, worm]));
        room.worms = room.worms.map((worm) => {
          const synced = byId.get(worm.id);
          return synced ? { ...worm, ...synced } : worm;
        });
      }

      socket.to(roomId).emit('state-update', state);
      emitGameOverIfNeeded(roomId, room);
    });

    socket.on('end-turn', (roomId) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== 'playing') return;
      const current = room.players[room.turnIndex];
      if (!current || current.id !== socket.id) return;
      advanceTurn(roomId, room);
    });

    socket.on('disconnect', () => {
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            clearTurnTimer(roomId);
            rooms.delete(roomId);
          } else {
            room.worms = room.worms.map((worm) =>
              worm.playerId === socket.id ? { ...worm, hp: 0 } : worm
            );
            if (room.gameState === 'playing' && playerIndex === room.turnIndex) {
              room.turnIndex = (room.turnIndex + room.players.length - 1) % room.players.length;
              advanceTurn(roomId, room);
            }
            io.to(roomId).emit('room-update', room);
          }
        }
      });
    });
  });

  if (process.env.NODE_ENV === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
