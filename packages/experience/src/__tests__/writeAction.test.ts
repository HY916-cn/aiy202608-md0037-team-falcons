import { describe, expect, it, vi } from 'vitest';

import {
  WriteActionConfirmationController,
  type WriteActionExecutionAdapter,
  type WriteActionPreview,
} from '../writeAction';

const PREVIEW: WriteActionPreview = {
  id: 'preview-01',
  impact: ['向演示一班发布作业'],
  isDangerous: false,
  operationType: 'assignment.publish',
  parameterSummary: ['截止时间：明天 18:00'],
  permissionScope: '海豚云合成演示学校 / 演示一班',
  role: 'teacher',
  targets: ['演示一班'],
};

function createController(preview: WriteActionPreview = PREVIEW) {
  const execute = vi.fn().mockResolvedValue(undefined);
  const adapter: WriteActionExecutionAdapter = { execute };
  return {
    controller: new WriteActionConfirmationController(preview, adapter),
    execute,
  };
}

describe('WriteActionConfirmationController', () => {
  it('确认前不调用执行 adapter', () => {
    const { controller, execute } = createController();
    expect(controller.getState()).toBe('awaiting_confirmation');
    expect(execute).not.toHaveBeenCalled();
  });

  it('取消确认不产生写操作', async () => {
    const { controller, execute } = createController();
    controller.cancel();
    await controller.confirm();
    expect(execute).not.toHaveBeenCalled();
  });

  it('重复点击确认具有 pending 防护', async () => {
    let resolveExecution: (() => void) | undefined;
    const execute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveExecution = resolve;
        }),
    );
    const controller = new WriteActionConfirmationController(PREVIEW, {
      execute,
    });

    const first = controller.confirm();
    const second = controller.confirm();
    expect(execute).toHaveBeenCalledTimes(1);
    resolveExecution?.();
    await Promise.all([first, second]);
  });

  it('危险操作要求二次确认', async () => {
    const { controller, execute } = createController({
      ...PREVIEW,
      isDangerous: true,
    });

    await controller.confirm();
    expect(controller.getState()).toBe('awaiting_second_confirmation');
    expect(execute).not.toHaveBeenCalled();
    await controller.confirm();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
