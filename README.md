# Worms Multiplayer

Standalone multiplayer Worms-style battle game with destructible terrain, turn-based physics, and real-time Socket.IO sync. No Google services, just the game.

## Highlights

- Destructible terrain with procedural map generation
- Turn-based multiplayer over WebSockets
- Bazooka and grenade weapons
- Worm movement, jumping, aiming, and timed turns
- Responsive canvas UI with lobby, match, and winner screens

## Getting Started

### Prerequisites

- Node.js 20+ or Bun

### Install

```bash
bun install
```

### Run locally

```bash
bun run dev
```

The app runs on `http://localhost:3000` by default.

## Controls

### Lobby

- Enter a username and room code
- Join an existing room or create a new one by using a new room code
- Start the match once at least 2 players have joined

### During a match

- `Left` / `Right`: move your active worm
- `W`: jump
- `Up` / `Down`: coarse aim adjustment
- `Q` / `E`: fine aim adjustment
- `1` / `2`: switch between bazooka and grenade
- Mouse wheel: adjust shot power
- Hold left mouse button on the arena: charge a shot
- Release left mouse button: fire
- `Space`: fire at the current power level

## Scripts

- `bun run dev`: start the game server in development mode
- `bun run build`: build the client for production
- `bun run preview`: preview the production build
- `bun run lint`: run TypeScript type-checking
- `bun run clean`: remove the `dist` directory

## Tech Stack

- React 19
- Vite
- Express
- Socket.IO
- Canvas API
- TypeScript

## Notes

- The game server is defined in [`server.ts`](./server.ts)
- Shared gameplay constants and types live in [`src/types.ts`](./src/types.ts)
- The browser title is set in [`index.html`](./index.html)
