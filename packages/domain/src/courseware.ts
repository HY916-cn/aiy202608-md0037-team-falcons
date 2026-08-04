import type { ContentStatus } from './contentStatus';

export const COURSEWARE_BUCKET = 'courseware-private';
export const COURSEWARE_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const COURSEWARE_SIGNED_URL_TTL_SECONDS = 5 * 60;

export const COURSEWARE_FILE_RULES = {
  doc: ['application/msword'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  jpeg: ['image/jpeg'],
  jpg: ['image/jpeg'],
  pdf: ['application/pdf'],
  png: ['image/png'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  webp: ['image/webp'],
  zip: ['application/zip', 'application/x-zip-compressed'],
} as const;

export type CoursewareFileExtension = keyof typeof COURSEWARE_FILE_RULES;
export type CoursewareMimeType =
  (typeof COURSEWARE_FILE_RULES)[CoursewareFileExtension][number];

export type CoursewareFileMetadata = {
  readonly mimeType: CoursewareMimeType;
  readonly originalFilename: string;
  readonly sizeBytes: number;
};

export type CoursewareItem = CoursewareFileMetadata & {
  readonly createdAt: string;
  readonly id: string;
  readonly status: ContentStatus;
  readonly storagePath: string;
  readonly subject: string;
  readonly teacherId: string;
  readonly title: string;
};

export type CoursewareTarget = {
  readonly classId: string;
  readonly coursewareId: string;
  readonly id: string;
  readonly sentAt: string;
  readonly withdrawnAt: string | null;
};

export type CoursewareReceiptState = 'downloaded' | 'received';

export type CoursewareReceipt = {
  readonly deviceId: string;
  readonly downloadedAt: string | null;
  readonly receivedAt: string;
  readonly targetId: string;
};

export type CoursewareReturn = CoursewareFileMetadata & {
  readonly classId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly operatorId: string;
  readonly storagePath: string;
  readonly teacherId: string;
  readonly title: string;
};
