import { describe, expect, it } from 'vitest';

import { MockAiExperienceAdapter } from '../aiExperience';
import { MockTeachingDemoAdapter } from '../teachingDemo';

const TEACHER_SCOPE = {
  assignmentId: 'assignment-teacher',
  id: 'school-1',
  label: '演示学校',
  role: 'teacher',
  type: 'school',
} as const;

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
    const teachingAdapter = new MockTeachingDemoAdapter();

    await adapter.submit('发送课件');
    await teachingAdapter.createAssignmentDraft({
      classId: '20000000-0000-0000-0000-000000000001',
      content: 'AI 离线时创建的合成作业',
      dueAt: '2026-08-10T18:00:00.000Z',
      subject: '数学',
      title: '离线教学流程',
    });

    expect(adapter.getSnapshot().state).toBe('offline');
    await expect(teachingAdapter.load(TEACHER_SCOPE)).resolves.toMatchObject({
      assignments: [{ title: '离线教学流程' }],
    });
  });
});
