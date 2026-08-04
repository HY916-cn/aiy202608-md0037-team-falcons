import { describe, expect, it } from 'vitest';

import { MockAiExperienceAdapter } from '../aiExperience';

describe('MockAiExperienceAdapter', () => {
  it('覆盖 idle、listening、thinking、preview、success、error、offline 七种状态', async () => {
    const adapter = new MockAiExperienceAdapter();
    const states = [adapter.getSnapshot().state];
    const unsubscribe = adapter.subscribe((snapshot) => {
      states.push(snapshot.state);
    });

    adapter.startListening();
    const submitPromise = adapter.submit('整理今日教学信息');
    expect(adapter.getSnapshot().state).toBe('thinking');
    await submitPromise;
    adapter.succeed();
    adapter.fail();
    adapter.setOffline(true);
    unsubscribe();

    expect(states).toEqual([
      'idle',
      'listening',
      'thinking',
      'preview',
      'success',
      'error',
      'offline',
    ]);
  });

  it('离线时提供明确反馈且不阻塞普通业务代码', async () => {
    const adapter = new MockAiExperienceAdapter({ isOffline: true });
    let teachingOperationCount = 0;

    await adapter.submit('发送课件');
    teachingOperationCount += 1;

    expect(adapter.getSnapshot().state).toBe('offline');
    expect(teachingOperationCount).toBe(1);
  });
});
