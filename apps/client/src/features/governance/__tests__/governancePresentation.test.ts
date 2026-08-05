import { describe, expect, it } from 'vitest';

import {
  resolveGovernanceExperienceMode,
  resolveGovernanceLayout,
} from '../governancePresentation';

describe('governance presentation', () => {
  it('班级端导航没有海豚币入口且不会解析钱包工作区', () => {
    expect(resolveGovernanceExperienceMode('class_terminal', 'class')).toBe('student_score');
    expect(resolveGovernanceExperienceMode('class_terminal', 'coins')).toBeNull();
  });

  it('六端治理页面映射保持角色边界', () => {
    expect(resolveGovernanceExperienceMode('teacher', 'class')).toBe('student_score');
    expect(resolveGovernanceExperienceMode('family', 'growth')).toBe('family_growth');
    expect(resolveGovernanceExperienceMode('family', 'coins')).toBe('family_wallet');
    expect(resolveGovernanceExperienceMode('bank_operator', 'fines')).toBe('wallet');
    expect(resolveGovernanceExperienceMode('council', 'appeals')).toBe('class_score');
    expect(resolveGovernanceExperienceMode('admin', 'audit')).toBeNull();
  });

  it('390px 布局使用紧凑模式且内容宽度不超过视口', () => {
    const layout = resolveGovernanceLayout(390);
    expect(layout.compact).toBe(true);
    expect(layout.maxItemWidth).toBeLessThanOrEqual(390);
    expect(layout.maxItemWidth).toBe(358);
  });
});
