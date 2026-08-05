import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('local Supabase authentication configuration', () => {
  it('allows seeded email users to sign in without opening public signup', async () => {
    const config = await readFile('supabase/config.toml', 'utf8');
    const authSection = config.match(/\[auth\]([\s\S]*?)\[auth\.email\]/)?.[1];
    const emailSection = config.match(/\[auth\.email\]([\s\S]*)$/)?.[1];

    expect(authSection).toContain('enable_signup = false');
    expect(emailSection).toContain('enable_signup = true');
  });
});
