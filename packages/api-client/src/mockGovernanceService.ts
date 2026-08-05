import type { AuthRoleScope, RoleCode } from '@dolphincloud/auth';

import { ApiClientError } from './apiError';
import type {
  ClassScoreAppeal,
  ClassScoreCategory,
  ClassScoreEntry,
  DolphinAccount,
  DolphinAmountInput,
  DolphinTransaction,
  FineOrder,
  FineRule,
  FineRuleInput,
  GovernanceClass,
  GovernanceService,
  GovernanceSnapshot,
  GovernanceStudent,
  StudentCategoryInput,
  StudentRankingRow,
  StudentScoreCategory,
  StudentScoreEntry,
  StudentScoreInput,
} from './governanceService';

const SCHOOL_ID = '10000000-0000-0000-0000-000000000001';
const CLASS_ONE = '20000000-0000-0000-0000-000000000001';
const CLASS_TWO = '20000000-0000-0000-0000-000000000002';
const STUDENT_ONE = '50000000-0000-0000-0000-000000000001';
const STUDENT_OTHER = '50000000-0000-0000-0000-000000000002';
const STUDENT_TWO = '50000000-0000-0000-0000-000000000009';

const CLASSES: GovernanceClass[] = [
  { id: CLASS_ONE, name: '海豚一班', schoolId: SCHOOL_ID },
  { id: CLASS_TWO, name: '海豚二班', schoolId: SCHOOL_ID },
];

const STUDENTS: GovernanceStudent[] = [
  { classId: CLASS_ONE, id: STUDENT_ONE, name: '演示学生 01' },
  { classId: CLASS_ONE, id: STUDENT_OTHER, name: '演示学生 02' },
  { classId: CLASS_TWO, id: STUDENT_TWO, name: '演示学生 09' },
];

function roleAllowed(scope: AuthRoleScope, allowed: readonly RoleCode[]): void {
  if (!allowed.includes(scope.role)) throw new ApiClientError('FORBIDDEN');
}

export class MockGovernanceService implements GovernanceService {
  private studentCategories: StudentScoreCategory[] = [
    { defaultDelta: 2, description: '课堂主动发言', displayName: '积极发言', id: '31000000-0000-0000-0000-000000000001', isActive: true, kind: 'positive', schoolId: SCHOOL_ID, slug: 'active_answer' },
    { defaultDelta: -1, description: '课堂纪律提醒', displayName: '纪律提醒', id: '31000000-0000-0000-0000-000000000002', isActive: true, kind: 'negative', schoolId: SCHOOL_ID, slug: 'discipline' },
  ];
  private readonly classCategories: ClassScoreCategory[] = [
    { description: '班级卫生检查', displayName: '卫生检查', id: '32000000-0000-0000-0000-000000000001', isActive: true, schoolId: SCHOOL_ID, slug: 'hygiene' },
  ];
  private studentEntries: StudentScoreEntry[] = [
    { appliedAt: '2026-08-05T07:45:00.000Z', categoryId: '31000000-0000-0000-0000-000000000001', delta: 2, id: '41000000-0000-0000-0000-000000000001', isReversed: false, operationId: '91000000-0000-0000-0000-000000000001', reason: '主动回答问题', studentId: STUDENT_ONE },
    { appliedAt: '2026-08-05T07:50:00.000Z', categoryId: '31000000-0000-0000-0000-000000000001', delta: 5, id: '41000000-0000-0000-0000-000000000002', isReversed: false, operationId: '91000000-0000-0000-0000-000000000002', reason: '帮助同学完成任务', studentId: STUDENT_OTHER },
  ];
  private classEntries: ClassScoreEntry[] = [
    { appliedAt: '2026-08-05T08:00:00.000Z', categoryId: '32000000-0000-0000-0000-000000000001', classId: CLASS_ONE, delta: 5, id: '42000000-0000-0000-0000-000000000001', isReversed: false, operationId: '92000000-0000-0000-0000-000000000001', reason: '卫生检查优秀' },
  ];
  private appeals: ClassScoreAppeal[] = [];
  private accounts: DolphinAccount[] = [
    { balance: 120, id: '61000000-0000-0000-0000-000000000001', studentId: STUDENT_ONE, version: 0 },
    { balance: 80, id: '61000000-0000-0000-0000-000000000002', studentId: STUDENT_OTHER, version: 0 },
    { balance: 95, id: '61000000-0000-0000-0000-000000000009', studentId: STUDENT_TWO, version: 0 },
  ];
  private transactions: DolphinTransaction[] = [];
  private fineRules: FineRule[] = [
    { defaultAmount: 10, description: '演示用合成罚款规则', displayName: '物品损坏', id: '71000000-0000-0000-0000-000000000001', isActive: true, schoolId: SCHOOL_ID, slug: 'item_damage' },
  ];
  private fineOrders: FineOrder[] = [];
  private sequence = 1;

  async load(scope: AuthRoleScope): Promise<GovernanceSnapshot> {
    const classIds = scope.type === 'class' ? [scope.id] : CLASSES.map((item) => item.id);
    let students = STUDENTS.filter((item) => classIds.includes(item.classId));
    if (scope.role === 'family') students = STUDENTS.filter((item) => item.id === STUDENT_ONE);
    if (scope.role === 'council') students = [];
    if (scope.role === 'admin') return this.emptySnapshot();
    const visibleStudentIds = students.map((item) => item.id);
    const visibleClassIds = scope.role === 'family'
      ? [...new Set(students.map((item) => item.classId))]
      : classIds;
    const classes = CLASSES.filter((item) => visibleClassIds.includes(item.id));
    const ranking = this.computeRanking(visibleClassIds).filter((row) =>
      scope.role === 'family' ? visibleStudentIds.includes(row.studentId) : true,
    ).map((row) => scope.role === 'family' ? { ...row, displayName: null } : row);
    const classScores = CLASSES.map((item) => ({ ...item, score: this.classEntries.filter((entry) => entry.classId === item.id && !entry.isReversed).reduce((sum, entry) => sum + entry.delta, 0), rank: 0 }))
      .sort((left, right) => right.score - left.score)
      .map((item, index, all) => ({ ...item, rank: index > 0 && all[index - 1]?.score === item.score ? all[index - 1]!.rank : index + 1 }))
      .filter((item) => visibleClassIds.includes(item.id));
    const accounts = ['bank_operator', 'family'].includes(scope.role)
      ? this.accounts.filter((item) => scope.role === 'bank_operator' || visibleStudentIds.includes(item.studentId))
      : [];
    const accountIds = accounts.map((item) => item.id);
    return {
      accounts,
      appeals: ['teacher', 'class_terminal', 'council'].includes(scope.role) ? this.appeals : [],
      classCategories: ['teacher', 'class_terminal', 'council'].includes(scope.role) ? this.classCategories : [],
      classEntries: ['teacher', 'class_terminal', 'council'].includes(scope.role) ? this.classEntries.filter((entry) => visibleClassIds.includes(entry.classId)) : [],
      classScores: ['teacher', 'class_terminal', 'council'].includes(scope.role) ? classScores : [],
      classes,
      fineOrders: ['teacher', 'bank_operator', 'family'].includes(scope.role) ? this.fineOrders.filter((order) => scope.role !== 'family' || visibleStudentIds.includes(order.studentId)) : [],
      fineRules: ['teacher', 'bank_operator', 'family'].includes(scope.role) ? this.fineRules : [],
      isDemo: true,
      studentCategories: ['teacher', 'class_terminal', 'family'].includes(scope.role) ? this.studentCategories : [],
      studentEntries: ['teacher', 'class_terminal', 'family'].includes(scope.role) ? this.studentEntries.filter((entry) => visibleStudentIds.includes(entry.studentId)) : [],
      studentRanking: ['teacher', 'class_terminal', 'family'].includes(scope.role) ? ranking : [],
      students,
      transactions: this.transactions.filter((item) => accountIds.includes(item.accountId)),
    };
  }

  async manageStudentCategory(scope: AuthRoleScope, input: StudentCategoryInput): Promise<void> {
    roleAllowed(scope, ['teacher']);
    const existingIndex = this.studentCategories.findIndex((item) => item.id === input.categoryId || item.slug === input.slug);
    const next: StudentScoreCategory = { ...input, id: input.categoryId ?? `31000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, schoolId: SCHOOL_ID };
    this.studentCategories = existingIndex < 0 ? [...this.studentCategories, next] : this.studentCategories.map((item, index) => index === existingIndex ? next : item);
  }

  async applyStudentScore(scope: AuthRoleScope, input: StudentScoreInput): Promise<void> {
    roleAllowed(scope, ['teacher', 'class_terminal']);
    const student = STUDENTS.find((item) => item.id === input.studentId);
    if (student === undefined || (scope.type === 'class' && student.classId !== scope.id)) throw new ApiClientError('FORBIDDEN');
    const category = this.studentCategories.find((item) => item.id === input.categoryId && item.isActive);
    if (category === undefined || !Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 1000 || input.reason.trim() === '') throw new ApiClientError('VALIDATION_ERROR');
    this.studentEntries = [...this.studentEntries, { appliedAt: new Date().toISOString(), categoryId: category.id, delta: input.delta, id: `41000000-0000-0000-0000-${String(this.sequence).padStart(12, '0')}`, isReversed: false, operationId: `91000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, reason: input.reason.trim(), studentId: input.studentId }];
  }

  async applyClassScore(scope: AuthRoleScope, input: { readonly categoryId: string; readonly classId: string; readonly delta: number; readonly reason: string }): Promise<void> {
    roleAllowed(scope, ['council']);
    this.classEntries = [...this.classEntries, { appliedAt: new Date().toISOString(), categoryId: input.categoryId, classId: input.classId, delta: input.delta, id: `42000000-0000-0000-0000-${String(this.sequence).padStart(12, '0')}`, isReversed: false, operationId: `92000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, reason: input.reason }];
  }

  async createAppeal(scope: AuthRoleScope, entryId: string, reason: string): Promise<void> {
    roleAllowed(scope, ['teacher', 'class_terminal']);
    if (reason.trim().length < 5) throw new ApiClientError('VALIDATION_ERROR');
    this.appeals = [...this.appeals, { createdAt: new Date().toISOString(), entryId, id: `43000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, reason, resolutionNote: null, status: 'pending' }];
  }

  async resolveAppeal(scope: AuthRoleScope, appealId: string, accept: boolean, note: string): Promise<void> {
    roleAllowed(scope, ['council']);
    if (note.trim() === '') throw new ApiClientError('VALIDATION_ERROR');
    this.appeals = this.appeals.map((item) => item.id === appealId ? { ...item, resolutionNote: note, status: accept ? 'accepted' : 'rejected' } : item);
  }

  async grantDolphin(scope: AuthRoleScope, input: DolphinAmountInput): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    this.applyTransaction(input.studentId, input.amount, 'grant', input.reason);
  }

  async deductDolphin(scope: AuthRoleScope, input: DolphinAmountInput): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    this.applyTransaction(input.studentId, -input.amount, 'deduct', input.reason);
  }

  async adjustDolphin(scope: AuthRoleScope, input: { readonly delta: number; readonly reason: string; readonly studentId: string }): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    this.applyTransaction(input.studentId, input.delta, 'adjust', input.reason);
  }

  async manageFineRule(scope: AuthRoleScope, input: FineRuleInput): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    const existing = this.fineRules.find((item) => item.slug === input.slug);
    const next: FineRule = { ...input, id: existing?.id ?? `71000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, schoolId: SCHOOL_ID };
    this.fineRules = existing === undefined ? [...this.fineRules, next] : this.fineRules.map((item) => item.id === existing.id ? next : item);
  }

  async createFine(scope: AuthRoleScope, input: { readonly amount: number; readonly reason: string; readonly ruleId: string; readonly studentId: string }): Promise<void> {
    roleAllowed(scope, ['teacher']);
    const student = STUDENTS.find((item) => item.id === input.studentId);
    if (student === undefined || (scope.type === 'class' && student.classId !== scope.id)) throw new ApiClientError('FORBIDDEN');
    this.fineOrders = [...this.fineOrders, { amount: input.amount, createOperationId: `93000000-0000-0000-0000-${String(this.sequence).padStart(12, '0')}`, createdAt: new Date().toISOString(), id: `73000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, reason: input.reason, ruleId: input.ruleId, status: 'pending', studentId: input.studentId }];
  }

  async settleFine(scope: AuthRoleScope, orderId: string): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    const order = this.requiredOrder(orderId, 'pending');
    this.applyTransaction(order.studentId, -order.amount, 'fine_settle', `结算罚款：${order.reason}`);
    this.setOrderStatus(orderId, 'settled');
  }

  async cancelFine(scope: AuthRoleScope, orderId: string, note: string): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    this.requiredOrder(orderId, 'pending');
    if (note.trim() === '') throw new ApiClientError('VALIDATION_ERROR');
    this.setOrderStatus(orderId, 'cancelled');
  }

  async reverseFine(scope: AuthRoleScope, orderId: string, reason: string): Promise<void> {
    roleAllowed(scope, ['bank_operator']);
    const order = this.requiredOrder(orderId, 'settled');
    if (reason.trim().length < 5) throw new ApiClientError('VALIDATION_ERROR');
    this.applyTransaction(order.studentId, order.amount, 'reversal', reason);
    this.setOrderStatus(orderId, 'reversed');
  }

  private applyTransaction(studentId: string, delta: number, kind: DolphinTransaction['kind'], reason: string): void {
    if (!Number.isInteger(delta) || delta === 0 || reason.trim() === '') throw new ApiClientError('VALIDATION_ERROR');
    const account = this.accounts.find((item) => item.studentId === studentId);
    if (account === undefined || account.balance + delta < 0) throw new ApiClientError('CONFLICT');
    const balanceAfter = account.balance + delta;
    this.accounts = this.accounts.map((item) => item.id === account.id ? { ...item, balance: balanceAfter, version: item.version + 1 } : item);
    this.transactions = [{ accountId: account.id, balanceAfter, createdAt: new Date().toISOString(), delta, id: `62000000-0000-0000-0000-${String(this.sequence).padStart(12, '0')}`, isReversed: false, kind, operationId: `94000000-0000-0000-0000-${String(this.sequence++).padStart(12, '0')}`, reason }, ...this.transactions];
  }

  private computeRanking(classIds: readonly string[]): StudentRankingRow[] {
    return classIds.flatMap((classId) => {
      const ranked = STUDENTS.filter((student) => student.classId === classId)
        .map((student) => ({ student, score: this.studentEntries.filter((entry) => entry.studentId === student.id && !entry.isReversed).reduce((sum, entry) => sum + entry.delta, 0) }))
        .sort((left, right) => right.score - left.score || left.student.name.localeCompare(right.student.name));
      return ranked.map((item, index, all) => ({ classId, displayName: item.student.name, rank: index > 0 && all[index - 1]?.score === item.score ? index : index + 1, score: item.score, studentId: item.student.id }));
    });
  }

  private requiredOrder(orderId: string, status: FineOrder['status']): FineOrder {
    const order = this.fineOrders.find((item) => item.id === orderId);
    if (order === undefined || order.status !== status) throw new ApiClientError('CONFLICT');
    return order;
  }

  private setOrderStatus(orderId: string, status: FineOrder['status']): void {
    this.fineOrders = this.fineOrders.map((item) => item.id === orderId ? { ...item, status } : item);
  }

  private emptySnapshot(): GovernanceSnapshot {
    return { accounts: [], appeals: [], classCategories: [], classEntries: [], classScores: [], classes: [], fineOrders: [], fineRules: [], isDemo: true, studentCategories: [], studentEntries: [], studentRanking: [], students: [], transactions: [] };
  }
}

export const GOVERNANCE_DEMO_IDS = { CLASS_ONE, CLASS_TWO, SCHOOL_ID, STUDENT_ONE, STUDENT_OTHER, STUDENT_TWO } as const;
