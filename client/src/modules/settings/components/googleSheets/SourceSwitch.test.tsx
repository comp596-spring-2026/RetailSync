import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SourceSwitch } from './SourceSwitch';

describe('SourceSwitch', () => {
  it('ignores null unselect when clicking the currently selected option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<SourceSwitch value="oauth" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /oauth/i }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /shared/i }));
    expect(onChange).toHaveBeenCalledWith('shared');
  });
});

