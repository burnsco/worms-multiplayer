import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Game State
  const rooms = new Map();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, username }) => {
      let room = rooms.get(roomId);
      
      if (!room) {
        room = {
          id: roomId,
          players: [],
          gameState: 'lobby',
          turnIndex: 0,
          worms: [],
          terrainSeed: Math.random(),
          lastUpdate: Date.now()
        };
        rooms.set(roomId, room);
      }

      if (room.gameState !== 'lobby') {
        socket.emit('error', 'Game already in progress');
        return;
      }

      const player = {
        id: socket.id,
        username,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
      };

      room.players.push(player);
      socket.join(roomId);
      io.to(roomId).emit('room-update', room);
    });

    socket.on('start-game', (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.players.length >= 2) {
        room.gameState = 'playing';
        room.turnIndex = 0;
        
        // Initialize worms
        room.worms = room.players.map((p, i) => ({
          id: uuidv4(),
          playerId: p.id,
          x: 100 + (i * 200),
          y: 0, // Will be adjusted by client terrain
          vy: 0,
          hp: 100,
          name: p.username,
          color: p.color
        }));

        io.to(roomId).emit('game-started', room);
      }
    });

    socket.on('action', ({ roomId, action }) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== 'playing') return;
      const current = room.players[room.turnIndex];
      if (!current || current.id !== socket.id) return;
      socket.to(roomId).emit('remote-action', { playerId: socket.id, action });
    });

    socket.on('sync-state', ({ roomId, state }) => {
      // Simple sync for now - the active player sends their state to others
      socket.to(roomId).emit('state-update', state);
    });

    socket.on('end-turn', (roomId) => {
      const room = rooms.get(roomId);
      if (!room || room.gameState !== 'playing') return;
      const current = room.players[room.turnIndex];
      if (!current || current.id !== socket.id) return;
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      io.to(roomId).emit('turn-change', room.turnIndex);
    });

    socket.on('disconnect', () => {
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit('room-update', room);
          }
        }
      });
    });
  });

  if (process.env.NODE_ENV !== 'production') {
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
