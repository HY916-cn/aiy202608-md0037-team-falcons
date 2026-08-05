import { describe, expect, it } from 'vitest';

import { shouldRenderLoginForm } from '../loginScreenState';

describe('login screen state', () => {
  it('renders the form only when the authentication service is available', () => {
    expect(shouldRenderLoginForm(null)).toBe(true);
    expect(shouldRenderLoginForm('missing')).toBe(false);
    expect(shouldRenderLoginForm('incomplete')).toBe(false);
  });
});
