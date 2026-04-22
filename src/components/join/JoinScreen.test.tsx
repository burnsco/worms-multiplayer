import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoinScreen } from './JoinScreen';

afterEach(() => {
  cleanup();
});

describe('JoinScreen', () => {
  it('disables join until username and room are set', () => {
    const onJoin = vi.fn();
    render(
      <JoinScreen
        username=""
        roomId=""
        onUsernameChange={vi.fn()}
        onRoomIdChange={vi.fn()}
        onJoin={onJoin}
      />
    );
    expect(screen.getByRole('button', { name: /join battle/i })).toBeDisabled();
  });

  it('calls onJoin when fields are filled and button is clicked', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(
      <JoinScreen
        username="alice"
        roomId="room-a"
        onUsernameChange={vi.fn()}
        onRoomIdChange={vi.fn()}
        onJoin={onJoin}
      />
    );
    await user.click(screen.getByRole('button', { name: /join battle/i }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });
});
