import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiClientError } from './apiError';

export type GovernanceClass = {
  readonly id: string;
  readonly name: string;
  readonly schoolId: string;
};

export type GovernanceStudent = {
  readonly classId: string;
  readonly id: string;
  readonly name: string;
};

export type StudentScoreCategory = {
  readonly defaultDelta: number;
  readonly description: string;
  readonly displayName: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly kind: 'negative' | 'positive';
  readonly schoolId: string;
  readonly slug: string;
};

export type StudentScoreEntry = {
  readonly appliedAt: string;
  readonly categoryId: string;
  readonly delta: number;
  readonly id: string;
  readonly isReversed: boolean;
  readonly operationId: string;
  readonly reason: string;
  readonly studentId: string;
};

export type StudentRankingRow = {
  readonly classId: string;
  readonly displayName: string | null;
  readonly rank: number;
  readonly score: number;
  readonly studentId: string;
};

export type ClassScoreCategory = {
  readonly description: string;
  readonly displayName: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly schoolId: string;
  readonly slug: string;
};

export type ClassScoreEntry = {
  readonly appliedAt: string;
  readonly categoryId: string;
  readonly classId: string;
  readonly delta: number;
  readonly id: string;
  readonly isReversed: boolean;
  readonly operationId: string;
  readonly reason: string;
};

export type ClassScoreSummary = GovernanceClass & {
  readonly rank: number;
  readonly score: number;
};

export type ClassScoreAppeal = {
  readonly createdAt: string;
  readonly entryId: string;
  readonly id: string;
  readonly reason: string;
  readonly resolutionNote: string | null;
  readonly status: 'accepted' | 'pending' | 'rejected';
};

export type DolphinAccount = {
  readonly balance: number;
  readonly id: string;
  readonly studentId: string;
  readonly version: number;
};

export type DolphinTransaction = {
  readonly accountId: string;
  readonly balanceAfter: number;
  readonly createdAt: string;
  readonly delta: number;
  readonly id: string;
  readonly isReversed: boolean;
  readonly kind: 'adjust' | 'deduct' | 'fine_settle' | 'grant' | 'reversal';
  readonly operationId: string;
  readonly reason: string;
};

export type FineRule = {
  readonly defaultAmount: number;
  readonly description: string;
  readonly displayName: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly schoolId: string;
  readonly slug: string;
};

export type FineOrder = {
  readonly amount: number;
  readonly createOperationId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly reason: string;
  readonly ruleId: string;
  readonly status: 'cancelled' | 'pending' | 'reversed' | 'settled';
  readonly studentId: string;
};

export type GovernanceSnapshot = {
  readonly accounts: readonly DolphinAccount[];
  readonly appeals: readonly ClassScoreAppeal[];
  readonly classCategories: readonly ClassScoreCategory[];
  readonly classEntries: readonly ClassScoreEntry[];
  readonly classScores: readonly ClassScoreSummary[];
  readonly classes: readonly GovernanceClass[];
  readonly fineOrders: readonly FineOrder[];
  readonly fineRules: readonly FineRule[];
  readonly isDemo: boolean;
  readonly studentCategories: readonly StudentScoreCategory[];
  readonly studentEntries: readonly StudentScoreEntry[];
  readonly studentRanking: readonly StudentRankingRow[];
  readonly students: readonly GovernanceStudent[];
  readonly transactions: readonly DolphinTransaction[];
};

export type StudentCategoryInput = {
  readonly categoryId?: string;
  readonly defaultDelta: number;
  readonly description: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly kind: 'negative' | 'positive';
  readonly schoolId: string;
  readonly slug: string;
};

export type StudentScoreInput = {
  readonly categoryId: string;
  readonly delta: number;
  readonly reason: string;
  readonly studentId: string;
};

export type DolphinAmountInput = {
  readonly amount: number;
  readonly reason: string;
  readonly studentId: string;
};

export type FineRuleInput = {
  readonly defaultAmount: number;
  readonly description: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly slug: string;
};

export interface GovernanceService {
  adjustDolphin(scope: AuthRoleScope, input: { readonly delta: number; readonly reason: string; readonly studentId: string }): Promise<void>;
  applyClassScore(scope: AuthRoleScope, input: { readonly categoryId: string; readonly classId: string; readonly delta: number; readonly reason: string }): Promise<void>;
  applyStudentScore(scope: AuthRoleScope, input: StudentScoreInput): Promise<void>;
  cancelFine(scope: AuthRoleScope, orderId: string, note: string): Promise<void>;
  createAppeal(scope: AuthRoleScope, entryId: string, reason: string): Promise<void>;
  createFine(scope: AuthRoleScope, input: { readonly amount: number; readonly reason: string; readonly ruleId: string; readonly studentId: string }): Promise<void>;
  deductDolphin(scope: AuthRoleScope, input: DolphinAmountInput): Promise<void>;
  grantDolphin(scope: AuthRoleScope, input: DolphinAmountInput): Promise<void>;
  load(scope: AuthRoleScope): Promise<GovernanceSnapshot>;
  manageFineRule(scope: AuthRoleScope, input: FineRuleInput): Promise<void>;
  manageStudentCategory(scope: AuthRoleScope, input: StudentCategoryInput): Promise<void>;
  resolveAppeal(scope: AuthRoleScope, appealId: string, accept: boolean, note: string): Promise<void>;
  reverseFine(scope: AuthRoleScope, orderId: string, reason: string): Promise<void>;
  settleFine(scope: AuthRoleScope, orderId: string): Promise<void>;
}

type QueryResult = { readonly data: unknown; readonly error: unknown };
type Row = Record<string, unknown>;

const SCORE_ROLES: readonly RoleCode[] = ['teacher', 'class_terminal', 'family'];
let requestSequence = 0;

function idempotencyKey(prefix: string): string {
  requestSequence += 1;
  return `${prefix}.${Date.now()}.${requestSequence}`;
}

function rows(result: QueryResult): Row[] {
  if (result.error !== null || !Array.isArray(result.data)) {
    throw new ApiClientError('INTERNAL_ERROR', { cause: result.error });
  }
  return result.data as Row[];
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ApiClientError('INTERNAL_ERROR');
  return parsed;
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') throw new ApiClientError('INTERNAL_ERROR');
  return value;
}

function assertRole(scope: AuthRoleScope, roles: readonly RoleCode[]): void {
  if (!roles.includes(scope.role)) throw new ApiClientError('FORBIDDEN');
}

export class SupabaseGovernanceService implements GovernanceService {
  constructor(private readonly client: SupabaseClient) {}

  async load(scope: AuthRoleScope): Promise<GovernanceSnapshot> {
    await this.assertActiveScope(scope);
    if (scope.role === 'admin') return this.emptySnapshot(false);

    const { classes, students } = await this.loadPeople(scope);
    const schoolIds = [...new Set(classes.map((item) => item.schoolId))];
    const classIds = classes.map((item) => item.id);
    const studentIds = students.map((item) => item.id);

    const [studentCategories, studentEntries, classCategories, classEntries, appeals, accounts, fineRules, fineOrders] = await Promise.all([
      SCORE_ROLES.includes(scope.role) ? this.selectByIds('student_score_categories', 'school_id', schoolIds, 'id, school_id, slug, display_name, description, kind, default_delta, is_active') : [],
      SCORE_ROLES.includes(scope.role) ? this.selectByIds('student_score_entries', 'student_id', studentIds, 'id, operation_id, student_id, category_id, delta, reason, applied_at, is_reversed') : [],
      ['teacher', 'class_terminal', 'council'].includes(scope.role) ? this.selectByIds('class_score_categories', 'school_id', schoolIds, 'id, school_id, slug, display_name, description, is_active') : [],
      ['teacher', 'class_terminal', 'council'].includes(scope.role) ? this.selectByIds('class_score_entries', 'class_id', classIds, 'id, operation_id, class_id, category_id, delta, reason, applied_at, is_reversed') : [],
      ['teacher', 'class_terminal', 'council'].includes(scope.role) ? this.selectAll('class_score_appeals', 'id, entry_id, reason, status, resolution_note, created_at') : [],
      ['bank_operator', 'family'].includes(scope.role) ? this.selectByIds('dolphin_accounts', 'student_id', studentIds, 'id, student_id, balance, version') : [],
      ['bank_operator', 'teacher', 'family'].includes(scope.role) ? this.selectByIds('fine_rules', 'school_id', schoolIds, 'id, school_id, slug, display_name, default_amount, description, is_active') : [],
      ['bank_operator', 'teacher', 'family'].includes(scope.role) ? this.selectAll('fine_orders', 'id, create_operation_id, student_id, rule_id, amount, reason, status, created_at') : [],
    ]);

    const rankingRows = SCORE_ROLES.includes(scope.role)
      ? (await Promise.all(classIds.map((classId) => this.rpcRows('compute_student_ranking', { ranking_scope: 'all_time', reference_time: new Date().toISOString(), target_class_id: classId })))).flat()
      : [];
    const totalRows = ['teacher', 'class_terminal', 'council'].includes(scope.role)
      ? await this.selectByIds('class_score_totals', 'class_id', classIds, 'class_id, school_id, total_score')
      : [];
    const accountIds = accounts.map((item) => stringValue(item.id));
    const transactionRows = ['bank_operator', 'family'].includes(scope.role)
      ? await this.selectByIds('dolphin_transactions', 'account_id', accountIds, 'id, operation_id, account_id, kind, delta, balance_after, reason, is_reversed, created_at')
      : [];
    const totals = new Map(totalRows.map((row) => [stringValue(row.class_id), numberValue(row.total_score)]));
    const classScores = classes
      .map((item) => ({ ...item, score: totals.get(item.id) ?? 0, rank: 0 }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((item, index, all) => ({ ...item, rank: index > 0 && all[index - 1]?.score === item.score ? all[index - 1]!.rank : index + 1 }));

    return {
      accounts: accounts.map((row) => ({ balance: numberValue(row.balance), id: stringValue(row.id), studentId: stringValue(row.student_id), version: numberValue(row.version) })),
      appeals: appeals.map((row) => ({ createdAt: stringValue(row.created_at), entryId: stringValue(row.entry_id), id: stringValue(row.id), reason: stringValue(row.reason), resolutionNote: row.resolution_note === null ? null : stringValue(row.resolution_note), status: row.status as ClassScoreAppeal['status'] })),
      classCategories: classCategories.map((row) => ({ description: stringValue(row.description), displayName: stringValue(row.display_name), id: stringValue(row.id), isActive: Boolean(row.is_active), schoolId: stringValue(row.school_id), slug: stringValue(row.slug) })),
      classEntries: classEntries.map((row) => ({ appliedAt: stringValue(row.applied_at), categoryId: stringValue(row.category_id), classId: stringValue(row.class_id), delta: numberValue(row.delta), id: stringValue(row.id), isReversed: Boolean(row.is_reversed), operationId: stringValue(row.operation_id), reason: stringValue(row.reason) })),
      classScores,
      classes,
      fineOrders: fineOrders.map((row) => ({ amount: numberValue(row.amount), createOperationId: stringValue(row.create_operation_id), createdAt: stringValue(row.created_at), id: stringValue(row.id), reason: stringValue(row.reason), ruleId: stringValue(row.rule_id), status: row.status as FineOrder['status'], studentId: stringValue(row.student_id) })),
      fineRules: fineRules.map((row) => ({ defaultAmount: numberValue(row.default_amount), description: stringValue(row.description), displayName: stringValue(row.display_name), id: stringValue(row.id), isActive: Boolean(row.is_active), schoolId: stringValue(row.school_id), slug: stringValue(row.slug) })),
      isDemo: false,
      studentCategories: studentCategories.map((row) => ({ defaultDelta: numberValue(row.default_delta), description: stringValue(row.description), displayName: stringValue(row.display_name), id: stringValue(row.id), isActive: Boolean(row.is_active), kind: row.kind as StudentScoreCategory['kind'], schoolId: stringValue(row.school_id), slug: stringValue(row.slug) })),
      studentEntries: studentEntries.map((row) => ({ appliedAt: stringValue(row.applied_at), categoryId: stringValue(row.category_id), delta: numberValue(row.delta), id: stringValue(row.id), isReversed: Boolean(row.is_reversed), operationId: stringValue(row.operation_id), reason: stringValue(row.reason), studentId: stringValue(row.student_id) })),
      studentRanking: rankingRows.map((row) => ({ classId: stringValue(row.class_id), displayName: row.display_name === null ? null : stringValue(row.display_name), rank: numberValue(row.rank_position), score: numberValue(row.score), studentId: stringValue(row.student_id) })),
      students,
      transactions: transactionRows.map((row) => ({ accountId: stringValue(row.account_id), balanceAfter: numberValue(row.balance_after), createdAt: stringValue(row.created_at), delta: numberValue(row.delta), id: stringValue(row.id), isReversed: Boolean(row.is_reversed), kind: row.kind as DolphinTransaction['kind'], operationId: stringValue(row.operation_id), reason: stringValue(row.reason) })),
    };
  }

  async manageStudentCategory(scope: AuthRoleScope, input: StudentCategoryInput): Promise<void> {
    await this.authorize(scope, ['teacher']);
    await this.call('manage_student_score_category', { default_delta: input.defaultDelta, description: input.description, display_name: input.displayName, idempotency_key: idempotencyKey('student-category'), is_active: input.isActive, kind: input.kind, slug: input.slug, target_category_id: input.categoryId ?? null, target_school_id: input.schoolId });
  }

  async applyStudentScore(scope: AuthRoleScope, input: StudentScoreInput): Promise<void> {
    await this.authorize(scope, ['teacher', 'class_terminal']);
    await this.call('apply_student_score', { delta: input.delta, idempotency_key: idempotencyKey('student-score'), reason: input.reason, target_category_id: input.categoryId, target_student_id: input.studentId });
  }

  async applyClassScore(scope: AuthRoleScope, input: { readonly categoryId: string; readonly classId: string; readonly delta: number; readonly reason: string }): Promise<void> {
    await this.authorize(scope, ['council']);
    await this.call('apply_class_score', { delta: input.delta, idempotency_key: idempotencyKey('class-score'), reason: input.reason, target_category_id: input.categoryId, target_class_id: input.classId });
  }

  async createAppeal(scope: AuthRoleScope, entryId: string, reason: string): Promise<void> {
    await this.authorize(scope, ['teacher', 'class_terminal']);
    await this.call('create_class_score_appeal', { appeal_reason: reason, idempotency_key: idempotencyKey('class-appeal'), target_entry_id: entryId });
  }

  async resolveAppeal(scope: AuthRoleScope, appealId: string, accept: boolean, note: string): Promise<void> {
    await this.authorize(scope, ['council']);
    await this.call('resolve_class_score_appeal', { accept, idempotency_key: idempotencyKey('appeal-resolution'), p_resolution_note: note, target_appeal_id: appealId });
  }

  async grantDolphin(scope: AuthRoleScope, input: DolphinAmountInput): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('apply_dolphin_grant', { amount: input.amount, idempotency_key: idempotencyKey('dolphin-grant'), reason: input.reason, target_student_id: input.studentId });
  }

  async deductDolphin(scope: AuthRoleScope, input: DolphinAmountInput): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('apply_dolphin_deduct', { amount: input.amount, idempotency_key: idempotencyKey('dolphin-deduct'), reason: input.reason, target_student_id: input.studentId });
  }

  async adjustDolphin(scope: AuthRoleScope, input: { readonly delta: number; readonly reason: string; readonly studentId: string }): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('apply_dolphin_adjust', { delta: input.delta, idempotency_key: idempotencyKey('dolphin-adjust'), reason: input.reason, target_student_id: input.studentId });
  }

  async manageFineRule(scope: AuthRoleScope, input: FineRuleInput): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('manage_fine_rule', { default_amount: input.defaultAmount, idempotency_key: idempotencyKey('fine-rule'), p_description: input.description, p_display_name: input.displayName, p_is_active: input.isActive, p_slug: input.slug, target_school_id: this.schoolScope(scope) });
  }

  async createFine(scope: AuthRoleScope, input: { readonly amount: number; readonly reason: string; readonly ruleId: string; readonly studentId: string }): Promise<void> {
    await this.authorize(scope, ['teacher']);
    await this.call('create_fine_order', { amount: input.amount, idempotency_key: idempotencyKey('fine-order'), reason: input.reason, target_rule_id: input.ruleId, target_student_id: input.studentId });
  }

  async settleFine(scope: AuthRoleScope, orderId: string): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('settle_fine_order', { idempotency_key: idempotencyKey('fine-settle'), target_order_id: orderId });
  }

  async cancelFine(scope: AuthRoleScope, orderId: string, note: string): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('cancel_fine_order', { idempotency_key: idempotencyKey('fine-cancel'), p_cancellation_note: note, target_order_id: orderId });
  }

  async reverseFine(scope: AuthRoleScope, orderId: string, reason: string): Promise<void> {
    await this.authorize(scope, ['bank_operator']);
    await this.call('reverse_fine_order', { idempotency_key: idempotencyKey('fine-reverse'), reversal_reason: reason, target_order_id: orderId });
  }

  private async assertActiveScope(scope: AuthRoleScope): Promise<void> {
    const result = await this.client.from('role_assignments').select('id').eq('id', scope.assignmentId).eq('role', scope.role).eq('scope_type', scope.type).eq('scope_id', scope.id).single();
    if (result.error !== null || typeof result.data?.id !== 'string') throw new ApiClientError('FORBIDDEN', { cause: result.error });
  }

  private async authorize(scope: AuthRoleScope, roles: readonly RoleCode[]): Promise<void> {
    assertRole(scope, roles);
    await this.assertActiveScope(scope);
  }

  private async loadPeople(scope: AuthRoleScope): Promise<{ readonly classes: GovernanceClass[]; readonly students: GovernanceStudent[] }> {
    if (scope.role === 'family') {
      const links = rows(await this.client.from('household_students').select('student_id').eq('household_id', scope.id));
      const studentRows = await this.selectByIds('students', 'id', links.map((row) => stringValue(row.student_id)), 'id, class_id, display_name');
      const classRows = await this.selectByIds('classes', 'id', [...new Set(studentRows.map((row) => stringValue(row.class_id)))], 'id, school_id, name');
      return { classes: this.mapClasses(classRows), students: this.mapStudents(studentRows) };
    }
    const classQuery = this.client.from('classes').select('id, school_id, name');
    const classResult = await (scope.type === 'class' ? classQuery.eq('id', scope.id) : classQuery.eq('school_id', scope.id)).order('name');
    const classRows = rows(classResult);
    const studentRows = scope.role === 'council' ? [] : await this.selectByIds('students', 'class_id', classRows.map((row) => stringValue(row.id)), 'id, class_id, display_name');
    return { classes: this.mapClasses(classRows), students: this.mapStudents(studentRows) };
  }

  private mapClasses(items: Row[]): GovernanceClass[] {
    return items.map((row) => ({ id: stringValue(row.id), name: stringValue(row.name), schoolId: stringValue(row.school_id) }));
  }

  private mapStudents(items: Row[]): GovernanceStudent[] {
    return items.map((row) => ({ classId: stringValue(row.class_id), id: stringValue(row.id), name: stringValue(row.display_name) }));
  }

  private async selectAll(table: string, columns: string): Promise<Row[]> {
    return rows(await this.client.from(table).select(columns).order('created_at', { ascending: false }));
  }

  private async selectByIds(table: string, column: string, ids: readonly string[], columns: string): Promise<Row[]> {
    if (ids.length === 0) return [];
    return rows(await this.client.from(table).select(columns).in(column, ids));
  }

  private async rpcRows(functionName: string, params: Record<string, unknown>): Promise<Row[]> {
    return rows(await this.client.rpc(functionName, params));
  }

  private async call(functionName: string, params: Record<string, unknown>): Promise<void> {
    const result = await this.client.rpc(functionName, params);
    if (result.error !== null) throw new ApiClientError('INTERNAL_ERROR', { cause: result.error });
  }

  private schoolScope(scope: AuthRoleScope): string {
    if (scope.type !== 'school') throw new ApiClientError('FORBIDDEN');
    return scope.id;
  }

  private emptySnapshot(isDemo: boolean): GovernanceSnapshot {
    return { accounts: [], appeals: [], classCategories: [], classEntries: [], classScores: [], classes: [], fineOrders: [], fineRules: [], isDemo, studentCategories: [], studentEntries: [], studentRanking: [], students: [], transactions: [] };
  }
}
