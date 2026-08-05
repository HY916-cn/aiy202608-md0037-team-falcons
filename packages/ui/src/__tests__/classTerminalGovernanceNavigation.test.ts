import { describe, expect, it } from 'vitest';

import { ROLE_NAVIGATION_KEYS } from '../roleNavigation';

describe('class terminal governance navigation', () => {
  it('does not expose dolphin coin or account routes', () => {
    expect(ROLE_NAVIGATION_KEYS.class_terminal).not.toContain('coins');
    expect(ROLE_NAVIGATION_KEYS.class_terminal).not.toContain('accounts');
    expect(ROLE_NAVIGATION_KEYS.class_terminal).not.toContain('transactions');
  });
});
