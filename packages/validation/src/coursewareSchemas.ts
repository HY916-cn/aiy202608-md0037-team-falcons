import {
  COURSEWARE_FILE_RULES,
  COURSEWARE_MAX_FILE_BYTES,
  type CoursewareFileExtension,
  type CoursewareFileMetadata,
} from '@dolphincloud/domain';
import { z } from 'zod';

import { databaseIdSchema } from './databaseIdSchema';

const filenameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim() === value, '文件名首尾不能包含空格')
  .refine((value) => !/[\\/\u0000-\u001f\u007f]/u.test(value), '文件名包含非法字符');

function getExtension(filename: string): string | null {
  const dotIndex = filename.lastIndexOf('.');

  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return null;
  }

  return filename.slice(dotIndex + 1).toLowerCase();
}

export const coursewareFileMetadataSchema = z
  .object({
    mimeType: z.string().min(1),
    originalFilename: filenameSchema,
    sizeBytes: z.number().int().positive().max(COURSEWARE_MAX_FILE_BYTES),
  })
  .superRefine((value, context) => {
    const extension = getExtension(value.originalFilename);

    if (
      extension === null ||
      !Object.hasOwn(COURSEWARE_FILE_RULES, extension)
    ) {
      context.addIssue({
        code: 'custom',
        message: '不支持此文件类型',
        path: ['originalFilename'],
      });
      return;
    }

    const allowedMimeTypes = COURSEWARE_FILE_RULES[
      extension as CoursewareFileExtension
    ] as readonly string[];

    if (!allowedMimeTypes.includes(value.mimeType)) {
      context.addIssue({
        code: 'custom',
        message: '文件扩展名与 MIME 类型不匹配',
        path: ['mimeType'],
      });
    }
  })
  .transform((value) => value as CoursewareFileMetadata);

export const createCoursewareSchema = z.object({
  file: coursewareFileMetadataSchema,
  subject: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
});

export const sendCoursewareSchema = z.object({
  classIds: z.array(databaseIdSchema).min(1).max(20),
  coursewareId: databaseIdSchema,
});

export const createCoursewareReturnSchema = z.object({
  classId: databaseIdSchema,
  file: coursewareFileMetadataSchema,
  teacherId: databaseIdSchema,
  title: z.string().trim().min(1).max(120),
});
