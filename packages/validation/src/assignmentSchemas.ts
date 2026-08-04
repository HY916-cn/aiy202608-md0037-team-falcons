import { z } from 'zod';

import { databaseIdSchema } from './databaseIdSchema';

export const createAssignmentDraftSchema = z.object({
  classId: databaseIdSchema,
  content: z.string().trim().min(1).max(5000),
  dueAt: z.iso.datetime({ offset: true }),
  subject: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
});

export const updateAssignmentDraftSchema = createAssignmentDraftSchema
  .omit({ classId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, '至少提供一个修改字段');
