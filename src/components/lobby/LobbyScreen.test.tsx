import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameRoom } from '../../types';
import { LobbyScreen } from './LobbyScreen';

afterEach(() => {
  cleanup();
});

function makeRoom(players: GameRoom['players']): GameRoom {
  return {
    id: 'test-room',
    players,
    gameState: 'lobby',
    turnIndex: 0,
    worms: [],
    terrainSeed: 0.5,
  };
}

describe('LobbyScreen', () => {
  it('disables start with fewer than two players', () => {
    const room = makeRoom([{ id: 'p1', username: 'A', color: '#f00' }]);
    render(<LobbyScreen room={room} selfId="p1" onStart={vi.fn()} />);
    expect(screen.getByRole('button', { name: /start game/i })).toBeDisabled();
  });

  it('enables start with two players and calls onStart', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const room = makeRoom([
      { id: 'p1', username: 'A', color: '#f00' },
      { id: 'p2', username: 'B', color: '#0f0' },
    ]);
    render(<LobbyScreen room={room} selfId="p1" onStart={onStart} />);
    const btn = screen.getByRole('button', { name: /start game/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
