import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COURSEWARE_BUCKET,
  COURSEWARE_SIGNED_URL_TTL_SECONDS,
  type CoursewareFileMetadata,
  type CoursewareItem,
  type CoursewareReceipt,
  type CoursewareReceiptState,
  type CoursewareReturn,
  type CoursewareTarget,
} from '@dolphincloud/domain';
import {
  createCoursewareReturnSchema,
  createCoursewareSchema,
  sendCoursewareSchema,
} from '@dolphincloud/validation';

import { ApiClientError } from './apiError';

export type CoursewareUploadBody = ArrayBuffer | Blob | Uint8Array;

export type CreateCoursewareInput = {
  readonly body: CoursewareUploadBody;
  readonly file: CoursewareFileMetadata;
  readonly subject: string;
  readonly title: string;
};

export type CreateCoursewareReturnInput = {
  readonly body: CoursewareUploadBody;
  readonly classId: string;
  readonly file: CoursewareFileMetadata;
  readonly teacherId: string;
  readonly title: string;
};

export interface CoursewareService {
  createCourseware(input: CreateCoursewareInput): Promise<CoursewareItem>;
  createDownloadUrl(coursewareId: string): Promise<string>;
  createReturn(input: CreateCoursewareReturnInput): Promise<CoursewareReturn>;
  createReturnDownloadUrl(coursewareReturnId: string): Promise<string>;
  listForClass(classId: string): Promise<readonly CoursewareItem[]>;
  recordReceipt(
    targetId: string,
    state: CoursewareReceiptState,
  ): Promise<CoursewareReceipt>;
  sendToClasses(
    coursewareId: string,
    classIds: readonly string[],
  ): Promise<readonly CoursewareTarget[]>;
}

type CoursewareItemRow = {
  readonly created_at: string;
  readonly id: string;
  readonly mime_type: string;
  readonly original_filename: string;
  readonly size_bytes: number;
  readonly status: CoursewareItem['status'];
  readonly storage_path: string;
  readonly subject: string;
  readonly teacher_id: string;
  readonly title: string;
};

type CoursewareTargetRow = {
  readonly class_id: string;
  readonly courseware_id: string;
  readonly id: string;
  readonly sent_at: string;
  readonly withdrawn_at: string | null;
};

type CoursewareReceiptRow = {
  readonly device_id: string;
  readonly downloaded_at: string | null;
  readonly received_at: string;
  readonly target_id: string;
};

type CoursewareReturnRow = {
  readonly class_id: string;
  readonly created_at: string;
  readonly id: string;
  readonly mime_type: string;
  readonly operator_id: string;
  readonly original_filename: string;
  readonly size_bytes: number;
  readonly storage_path: string;
  readonly teacher_id: string;
  readonly title: string;
};

type SupabaseCoursewareServiceOptions = {
  readonly client: SupabaseClient;
  readonly createId?: () => string;
};

function mapCoursewareItem(row: CoursewareItemRow): CoursewareItem {
  return {
    createdAt: row.created_at,
    id: row.id,
    mimeType: row.mime_type as CoursewareItem['mimeType'],
    originalFilename: row.original_filename,
    sizeBytes: row.size_bytes,
    status: row.status,
    storagePath: row.storage_path,
    subject: row.subject,
    teacherId: row.teacher_id,
    title: row.title,
  };
}

function mapCoursewareTarget(row: CoursewareTargetRow): CoursewareTarget {
  return {
    classId: row.class_id,
    coursewareId: row.courseware_id,
    id: row.id,
    sentAt: row.sent_at,
    withdrawnAt: row.withdrawn_at,
  };
}

function mapCoursewareReceipt(row: CoursewareReceiptRow): CoursewareReceipt {
  return {
    deviceId: row.device_id,
    downloadedAt: row.downloaded_at,
    receivedAt: row.received_at,
    targetId: row.target_id,
  };
}

function mapCoursewareReturn(row: CoursewareReturnRow): CoursewareReturn {
  return {
    classId: row.class_id,
    createdAt: row.created_at,
    id: row.id,
    mimeType: row.mime_type as CoursewareReturn['mimeType'],
    operatorId: row.operator_id,
    originalFilename: row.original_filename,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    teacherId: row.teacher_id,
    title: row.title,
  };
}

export class SupabaseCoursewareService implements CoursewareService {
  private readonly client: SupabaseClient;
  private readonly createId: () => string;

  constructor({
    client,
    createId = () => globalThis.crypto.randomUUID(),
  }: SupabaseCoursewareServiceOptions) {
    this.client = client;
    this.createId = createId;
  }

  async createCourseware(
    input: CreateCoursewareInput,
  ): Promise<CoursewareItem> {
    const parsed = createCoursewareSchema.safeParse(input);

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const userId = await this.getAuthenticatedUserId();
    const storagePath = `courseware/${userId}/${this.createId()}`;

    await this.uploadObject(storagePath, input.body, parsed.data.file);

    const { data, error } = await this.client
      .from('courseware_items')
      .insert({
        mime_type: parsed.data.file.mimeType,
        original_filename: parsed.data.file.originalFilename,
        size_bytes: parsed.data.file.sizeBytes,
        storage_path: storagePath,
        subject: parsed.data.subject,
        title: parsed.data.title,
      })
      .select(
        'id, teacher_id, title, subject, original_filename, storage_path, mime_type, size_bytes, status, created_at',
      )
      .single();

    if (error !== null || data === null) {
      const cleanupError = await this.removeUploadedObject(storagePath);
      throw new ApiClientError('INTERNAL_ERROR', {
        cause: { cleanupError, persistenceError: error },
      });
    }

    return mapCoursewareItem(data as CoursewareItemRow);
  }

  async createDownloadUrl(coursewareId: string): Promise<string> {
    const { data, error } = await this.client
      .from('courseware_items')
      .select('storage_path')
      .eq('id', coursewareId)
      .single();

    if (error !== null || data === null) {
      throw new ApiClientError('NOT_FOUND', { cause: error });
    }

    return this.createSignedUrl(data.storage_path as string);
  }

  async createReturn(
    input: CreateCoursewareReturnInput,
  ): Promise<CoursewareReturn> {
    const parsed = createCoursewareReturnSchema.safeParse(input);

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const storagePath = `returns/${parsed.data.classId}/${parsed.data.teacherId}/${this.createId()}`;

    await this.uploadObject(storagePath, input.body, parsed.data.file);

    const { data, error } = await this.client
      .from('courseware_returns')
      .insert({
        class_id: parsed.data.classId,
        mime_type: parsed.data.file.mimeType,
        original_filename: parsed.data.file.originalFilename,
        size_bytes: parsed.data.file.sizeBytes,
        storage_path: storagePath,
        teacher_id: parsed.data.teacherId,
        title: parsed.data.title,
      })
      .select(
        'id, class_id, teacher_id, operator_id, title, original_filename, storage_path, mime_type, size_bytes, created_at',
      )
      .single();

    if (error !== null || data === null) {
      const cleanupError = await this.removeUploadedObject(storagePath);
      throw new ApiClientError('INTERNAL_ERROR', {
        cause: { cleanupError, persistenceError: error },
      });
    }

    return mapCoursewareReturn(data as CoursewareReturnRow);
  }

  async createReturnDownloadUrl(coursewareReturnId: string): Promise<string> {
    const { data, error } = await this.client
      .from('courseware_returns')
      .select('storage_path')
      .eq('id', coursewareReturnId)
      .single();

    if (error !== null || data === null) {
      throw new ApiClientError('NOT_FOUND', { cause: error });
    }

    return this.createSignedUrl(data.storage_path as string);
  }

  async listForClass(classId: string): Promise<readonly CoursewareItem[]> {
    const { data, error } = await this.client
      .from('courseware_targets')
      .select(
        'courseware_items(id, teacher_id, title, subject, original_filename, storage_path, mime_type, size_bytes, status, created_at)',
      )
      .eq('class_id', classId)
      .is('withdrawn_at', null)
      .order('sent_at', { ascending: false });

    if (error !== null || data === null) {
      throw new ApiClientError('INTERNAL_ERROR', { cause: error });
    }

    return data.map((target) => {
      const nestedItem = Array.isArray(target.courseware_items)
        ? target.courseware_items[0]
        : target.courseware_items;

      if (nestedItem === undefined || nestedItem === null) {
        throw new ApiClientError('INTERNAL_ERROR');
      }

      return mapCoursewareItem(nestedItem as CoursewareItemRow);
    });
  }

  async recordReceipt(
    targetId: string,
    state: CoursewareReceiptState,
  ): Promise<CoursewareReceipt> {
    const { data, error } = await this.client.rpc(
      'record_courseware_receipt',
      {
        receipt_state: state,
        target_courseware_target_id: targetId,
      },
    );

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return mapCoursewareReceipt(data as CoursewareReceiptRow);
  }

  async sendToClasses(
    coursewareId: string,
    classIds: readonly string[],
  ): Promise<readonly CoursewareTarget[]> {
    const parsed = sendCoursewareSchema.safeParse({ classIds, coursewareId });

    if (!parsed.success) {
      throw new ApiClientError('VALIDATION_ERROR', { cause: parsed.error });
    }

    const { data, error } = await this.client.rpc('send_courseware', {
      target_class_ids: parsed.data.classIds,
      target_courseware_id: parsed.data.coursewareId,
    });

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return (data as CoursewareTargetRow[]).map(mapCoursewareTarget);
  }

  private async createSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(COURSEWARE_BUCKET)
      .createSignedUrl(storagePath, COURSEWARE_SIGNED_URL_TTL_SECONDS);

    if (error !== null || data === null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }

    return data.signedUrl;
  }

  private async getAuthenticatedUserId(): Promise<string> {
    const {
      data: { user },
      error,
    } = await this.client.auth.getUser();

    if (error !== null || user === null) {
      throw new ApiClientError('UNAUTHENTICATED', { cause: error });
    }

    return user.id;
  }

  private async uploadObject(
    storagePath: string,
    body: CoursewareUploadBody,
    file: CoursewareFileMetadata,
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(COURSEWARE_BUCKET)
      .upload(storagePath, body, {
        cacheControl: '3600',
        contentType: file.mimeType,
        upsert: false,
      });

    if (error !== null) {
      throw new ApiClientError('FORBIDDEN', { cause: error });
    }
  }

  private async removeUploadedObject(storagePath: string): Promise<unknown> {
    try {
      const { error } = await this.client.storage
        .from(COURSEWARE_BUCKET)
        .remove([storagePath]);

      return error;
    } catch (error) {
      return error;
    }
  }
}
