export const CONTENT_STATUSES = [
  'draft',
  'published',
  'withdrawn',
  'expired',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];
