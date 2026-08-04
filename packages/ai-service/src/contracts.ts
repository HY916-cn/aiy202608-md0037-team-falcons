export const AI_READ_SKILLS = [
  'get_today_summary',
  'list_courseware',
  'list_assignments',
  'get_grades',
] as const;

export type AiReadSkill = (typeof AI_READ_SKILLS)[number];

export const AI_WRITE_ACTION_TYPES = [
  'assignment_publish',
  'assessment_publish',
] as const;

export type AiWriteActionType = (typeof AI_WRITE_ACTION_TYPES)[number];

export type AiGatewayRequest = {
  readonly message: string;
  readonly sessionId?: string;
};

export type AiProviderResult =
  | { readonly text: string; readonly type: 'text' }
  | {
      readonly arguments: Readonly<Record<string, unknown>>;
      readonly skill: AiReadSkill;
      readonly type: 'skill_query';
    }
  | {
      readonly actionType: AiWriteActionType;
      readonly impact: readonly string[];
      readonly isDangerous: boolean;
      readonly parameters: Readonly<Record<string, unknown>>;
      readonly targets: readonly string[];
      readonly type: 'action_proposal';
    };

export type AiGatewayResponse =
  | { readonly sessionId: string; readonly text: string; readonly type: 'text' }
  | {
      readonly card: {
        readonly kind: AiReadSkill;
        readonly payload: unknown;
      };
      readonly sessionId: string;
      readonly type: 'data_card';
    }
  | {
      readonly draftId: string;
      readonly preview: {
        readonly actionType: AiWriteActionType;
        readonly expiresAt: string;
        readonly impact: readonly string[];
        readonly isDangerous: boolean;
        readonly parameters: Readonly<Record<string, unknown>>;
        readonly permissionScope: string;
        readonly targets: readonly string[];
      };
      readonly sessionId: string;
      readonly type: 'action_draft';
    };
