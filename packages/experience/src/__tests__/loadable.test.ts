import { describe, expect, it, vi } from 'vitest';

import { LOADING_STATE, resolveLoadableState } from '../loadable';

describe('loadable states', () => {
  it('覆盖加载、空数据、错误和重试成功状态', async () => {
    expect(LOADING_STATE.status).toBe('loading');
    await expect(
      resolveLoadableState(async () => [] as string[], (data) => data.length === 0),
    ).resolves.toMatchObject({ status: 'empty' });

    const load = vi
      .fn<() => Promise<readonly string[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(['已恢复']);
    await expect(
      resolveLoadableState(load, (data) => data.length === 0),
    ).resolves.toMatchObject({ status: 'error' });
    await expect(
      resolveLoadableState(load, (data) => data.length === 0),
    ).resolves.toMatchObject({ data: ['已恢复'], status: 'ready' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
