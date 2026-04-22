import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TurnControls } from './TurnControls';

describe('TurnControls', () => {
  it('switches weapon, updates power from slider, and fires', async () => {
    const user = userEvent.setup();
    const onWeaponChange = vi.fn();
    const onPowerChange = vi.fn();
    const onFire = vi.fn();

    const { container } = render(
      <TurnControls
        selectedWeapon="bazooka"
        power={50}
        onWeaponChange={onWeaponChange}
        onPowerChange={onPowerChange}
        onFire={onFire}
      />
    );

    await user.click(screen.getByTitle(/grenade \(2\)/i));
    expect(onWeaponChange).toHaveBeenCalledWith('grenade');

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '88' } });
    expect(onPowerChange).toHaveBeenCalledWith(88);

    await user.click(screen.getByTitle(/fire at current power/i));
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});
