import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CLIENT_ASSETS = join(ROOT, 'apps', 'client', 'assets');

function pngSize(filename: string): readonly [number, number] {
  const image = readFileSync(join(CLIENT_ASSETS, filename));
  expect(image.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

describe('DolphinCloud production brand assets', () => {
  it('保留唯一 SVG 母版及规定色值', () => {
    expect(
      readdirSync(join(ROOT, 'assets', 'brand')).filter((file) =>
        file.endsWith('.svg'),
      ),
    ).toEqual(['dolphincloud-logo.svg']);

    const source = readFileSync(
      join(ROOT, 'assets', 'brand', 'dolphincloud-logo.svg'),
      'utf8',
    ).toLowerCase();

    expect(source).toContain('viewbox="0 0 480 480"');
    expect(source).toContain('#1677fe');
    expect(source).toContain('#22d2ed');
    expect(source).toContain('#fefefe');
  });

  it('生成 Web 需要的等比例 PNG 尺寸', () => {
    expect(pngSize('app-icon-1024.png')).toEqual([1024, 1024]);
    expect(pngSize('pwa-icon-512.png')).toEqual([512, 512]);
    expect(pngSize('apple-touch-icon.png')).toEqual([180, 180]);
    expect(pngSize('favicon-32.png')).toEqual([32, 32]);
    expect(pngSize('favicon-16.png')).toEqual([16, 16]);
  });

  it('public 图标与规范客户端资产逐字节一致', () => {
    [
      'pwa-icon-512.png',
      'apple-touch-icon.png',
      'favicon-32.png',
      'favicon-16.png',
    ].forEach((filename) => {
      expect(
        readFileSync(join(ROOT, 'apps', 'client', 'public', filename)),
      ).toEqual(readFileSync(join(CLIENT_ASSETS, filename)));
    });
  });
});
