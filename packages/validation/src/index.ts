import { z } from 'zod';

export const nonEmptyStringSchema = z.string().trim().min(1);

export * from './assignmentSchemas';
export * from './coursewareSchemas';
export * from './databaseIdSchema';
