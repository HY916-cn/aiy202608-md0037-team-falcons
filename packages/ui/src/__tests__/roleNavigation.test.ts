import { ROLE_CODES } from '@dolphincloud/auth';
import { describe, expect, it } from 'vitest';

import {
  resolveRoleNavigationKey,
  resolveRolePageHeader,
  ROLE_NAVIGATION_KEYS,
} from '../roleNavigation';

describe('role navigation', () => {
  it('为六类角色提供唯一页面键，且首页为默认项', () => {
    expect(Object.keys(ROLE_NAVIGATION_KEYS).sort()).toEqual([...ROLE_CODES].sort());
    for (const role of ROLE_CODES) {
      expect(ROLE_NAVIGATION_KEYS[role][0]).toBe('home');
      expect(new Set(ROLE_NAVIGATION_KEYS[role]).size).toBe(
        ROLE_NAVIGATION_KEYS[role].length,
      );
    }
  });

  it('仅接受当前角色支持的 URL section', () => {
    expect(resolveRoleNavigationKey('teacher', 'courseware')).toBe('courseware');
    expect(resolveRoleNavigationKey('teacher', 'coins')).toBe('coins');
    expect(resolveRoleNavigationKey('class_terminal', 'coins')).toBe('home');
    expect(resolveRoleNavigationKey('family', 'growth')).toBe('growth');
    expect(resolveRoleNavigationKey('family', 'courseware')).toBe('home');
    expect(resolveRoleNavigationKey('admin', 'ai')).toBe('home');
    expect(resolveRoleNavigationKey('teacher', undefined)).toBe('home');
  });

  it('六端每个导航项都驱动独立页头文案', () => {
    for (const role of ROLE_CODES) {
      const homeHeader = resolveRolePageHeader(role, 'home');
      expect(homeHeader.eyebrow).toBeDefined();
      for (const navigation of ROLE_NAVIGATION_KEYS[role]) {
        const header = resolveRolePageHeader(role, navigation);
        expect(header.eyebrow.length).toBeGreaterThan(0);
        expect(header.title.length).toBeGreaterThan(0);
        expect(header.description.length).toBeGreaterThan(0);
        if (navigation !== 'home') {
          expect(header).not.toEqual(homeHeader);
          expect(header.eyebrow).not.toBe(homeHeader.eyebrow);
          expect(header.title).not.toBe(homeHeader.title);
        }
      }
    }
  });

  it('家庭端从首页点击成长后同步更新导航与页头', () => {
    const homeNavigation = resolveRoleNavigationKey('family', undefined);
    expect(resolveRolePageHeader('family', homeNavigation)).toEqual({
      description: '查看孩子今天的任务、成长记录与海豚币。',
      eyebrow: '家庭端',
      title: '家庭首页',
    });

    const clickedNavigation = resolveRoleNavigationKey('family', 'growth');
    expect(clickedNavigation).toBe('growth');
    expect(resolveRolePageHeader('family', clickedNavigation)).toEqual({
      description: '查看当前学生的成绩单与成长记录。',
      eyebrow: '家庭端 · 成长记录',
      title: '成长记录',
    });
  });
});
