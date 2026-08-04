import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseCoursewareService } from '../coursewareService';

const USER_ID = '30000000-0000-0000-0000-000000000001';
const CLASS_ID = '20000000-0000-0000-0000-000000000001';
const TEACHER_ID = '30000000-0000-0000-0000-000000000002';
const OBJECT_ID = '65000000-0000-0000-0000-000000000001';

function createFailingPersistenceClient() {
  const persistenceError = new Error('business row insert failed');
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const single = vi
    .fn()
    .mockResolvedValue({ data: null, error: persistenceError });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({ insert }),
    storage: {
      from: vi.fn().mockReturnValue({ remove, upload }),
    },
  } as unknown as SupabaseClient;

  return { client, persistenceError, remove, upload };
}

describe('SupabaseCoursewareService upload compensation', () => {
  it('课件对象上传后业务登记失败会删除同一路径对象', async () => {
    const { client, remove, upload } = createFailingPersistenceClient();
    const service = new SupabaseCoursewareService({
      client,
      createId: () => OBJECT_ID,
    });
    const expectedPath = `courseware/${USER_ID}/${OBJECT_ID}`;

    await expect(
      service.createCourseware({
        body: new Uint8Array([1]),
        file: {
          mimeType: 'application/pdf',
          originalFilename: '合成课件.pdf',
          sizeBytes: 1,
        },
        subject: '数学',
        title: '合成课件',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(upload).toHaveBeenCalledWith(expectedPath, expect.any(Uint8Array), {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false,
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith([expectedPath]);
  });

  it('班级回传对象登记失败也执行补偿删除', async () => {
    const { client, remove } = createFailingPersistenceClient();
    const service = new SupabaseCoursewareService({
      client,
      createId: () => OBJECT_ID,
    });
    const expectedPath = `returns/${CLASS_ID}/${TEACHER_ID}/${OBJECT_ID}`;

    await expect(
      service.createReturn({
        body: new Uint8Array([1]),
        classId: CLASS_ID,
        file: {
          mimeType: 'image/png',
          originalFilename: '合成回传.png',
          sizeBytes: 1,
        },
        teacherId: TEACHER_ID,
        title: '合成回传',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith([expectedPath]);
  });
});
