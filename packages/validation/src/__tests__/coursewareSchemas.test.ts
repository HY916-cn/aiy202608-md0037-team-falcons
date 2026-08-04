import { COURSEWARE_MAX_FILE_BYTES } from '@dolphincloud/domain';
import { describe, expect, it } from 'vitest';

import { coursewareFileMetadataSchema } from '../coursewareSchemas';

describe('coursewareFileMetadataSchema', () => {
  it('接受扩展名、MIME 和大小均合法的课件', () => {
    expect(
      coursewareFileMetadataSchema.parse({
        mimeType: 'application/pdf',
        originalFilename: '七年级数学课件.pdf',
        sizeBytes: 4096,
      }),
    ).toEqual({
      mimeType: 'application/pdf',
      originalFilename: '七年级数学课件.pdf',
      sizeBytes: 4096,
    });
  });

  it('拒绝扩展名白名单之外的文件', () => {
    expect(() =>
      coursewareFileMetadataSchema.parse({
        mimeType: 'application/javascript',
        originalFilename: '脚本.js',
        sizeBytes: 1024,
      }),
    ).toThrow('不支持此文件类型');
  });

  it('拒绝伪装成 PDF 的不匹配 MIME', () => {
    expect(() =>
      coursewareFileMetadataSchema.parse({
        mimeType: 'application/zip',
        originalFilename: '伪装课件.pdf',
        sizeBytes: 1024,
      }),
    ).toThrow('文件扩展名与 MIME 类型不匹配');
  });

  it('拒绝超出 50 MiB 上限的文件', () => {
    expect(() =>
      coursewareFileMetadataSchema.parse({
        mimeType: 'image/png',
        originalFilename: '课堂图片.png',
        sizeBytes: COURSEWARE_MAX_FILE_BYTES + 1,
      }),
    ).toThrow();
  });

  it('接受恰好等于 50 MiB 上限的文件', () => {
    expect(
      coursewareFileMetadataSchema.parse({
        mimeType: 'image/png',
        originalFilename: '边界课堂图片.png',
        sizeBytes: COURSEWARE_MAX_FILE_BYTES,
      }).sizeBytes,
    ).toBe(COURSEWARE_MAX_FILE_BYTES);
  });

  it('拒绝包含路径分隔符的原文件名', () => {
    expect(() =>
      coursewareFileMetadataSchema.parse({
        mimeType: 'image/png',
        originalFilename: '../课堂图片.png',
        sizeBytes: 1024,
      }),
    ).toThrow('文件名包含非法字符');
  });
});
