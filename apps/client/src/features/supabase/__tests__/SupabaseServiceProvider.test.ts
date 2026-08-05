import { describe, expect, it } from 'vitest';

import { resolveSupabaseRuntimeUrl } from '../SupabaseServiceProvider';

describe('resolveSupabaseRuntimeUrl', () => {
  it('same-origin 标记在 HTTPS 域名下使用浏览器当前 origin', () => {
    expect(
      resolveSupabaseRuntimeUrl(
        'http://dolphincloud.invalid',
        'https://dc.90016.top',
      ),
    ).toBe('https://dc.90016.top');
  });

  it('same-origin 标记在 IP 访问下保留端口', () => {
    expect(
      resolveSupabaseRuntimeUrl(
        'http://dolphincloud.invalid',
        'http://125.208.22.63:8800',
      ),
    ).toBe('http://125.208.22.63:8800');
  });

  it('真实 Supabase 地址不被浏览器 origin 覆盖', () => {
    expect(
      resolveSupabaseRuntimeUrl(
        'https://project.supabase.co',
        'https://dc.90016.top',
      ),
    ).toBe('https://project.supabase.co');
  });
});
