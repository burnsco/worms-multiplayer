import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { GameRoom } from '../../types';
import { GameHeader } from './GameHeader';

afterEach(() => {
  cleanup();
});

function playingRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    id: 'r1',
    players: [
      { id: 'a', username: 'Alice', color: '#f00' },
      { id: 'b', username: 'Bob', color: '#00f' },
    ],
    gameState: 'playing',
    turnIndex: 0,
    worms: [],
    terrainSeed: 0.25,
    ...overrides,
  };
}

describe('GameHeader', () => {
  it('shows timer and marks active turn', () => {
    render(<GameHeader room={playingRoom()} timeLeft={12} isMyTurn={false} isFiring={false} />);
    expect(screen.getByText('12s')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows Your Turn when it is the local turn and not firing', () => {
    render(<GameHeader room={playingRoom()} timeLeft={5} isMyTurn isFiring={false} />);
    expect(screen.getByText(/your turn/i)).toBeInTheDocument();
  });

  it('hides Your Turn while firing', () => {
    render(<GameHeader room={playingRoom()} timeLeft={5} isMyTurn isFiring />);
    expect(screen.queryByText(/your turn/i)).not.toBeInTheDocument();
  });
});
