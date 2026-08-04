import { z } from 'zod';

import { databaseIdSchema } from './databaseIdSchema';

export const createAssessmentDraftSchema = z.object({
  classId: databaseIdSchema,
  subject: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
});

export const gradeDraftSchema = z.object({
  comment: z.string().max(1000),
  score: z.number().min(0).max(99999.99),
  studentId: databaseIdSchema,
});

export const saveGradeDraftsSchema = z.object({
  assessmentId: databaseIdSchema,
  grades: z.array(gradeDraftSchema).min(1).max(100),
});

export const reviseGradeSchema = z.object({
  comment: z.string().max(1000),
  gradeId: databaseIdSchema,
  reason: z.string().trim().min(1).max(500),
  score: z.number().min(0).max(99999.99),
});
