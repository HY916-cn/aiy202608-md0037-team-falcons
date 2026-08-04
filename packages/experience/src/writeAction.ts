import type { RoleCode } from '@dolphincloud/auth';

export type WriteActionPreview = {
  readonly id: string;
  readonly impact: readonly string[];
  readonly isDangerous: boolean;
  readonly operationType: string;
  readonly parameterSummary: readonly string[];
  readonly permissionScope: string;
  readonly role: RoleCode;
  readonly targets: readonly string[];
};

export interface WriteActionExecutionAdapter {
  execute(previewId: string): Promise<void>;
}

export type WriteActionConfirmationState =
  | 'awaiting_confirmation'
  | 'awaiting_second_confirmation'
  | 'cancelled'
  | 'pending'
  | 'success'
  | 'error';

export class WriteActionConfirmationController {
  private state: WriteActionConfirmationState = 'awaiting_confirmation';

  constructor(
    private readonly preview: WriteActionPreview,
    private readonly adapter: WriteActionExecutionAdapter,
  ) {}

  cancel(): void {
    if (this.state !== 'pending' && this.state !== 'success') {
      this.state = 'cancelled';
    }
  }

  getState(): WriteActionConfirmationState {
    return this.state;
  }

  async confirm(): Promise<void> {
    if (
      this.state === 'pending' ||
      this.state === 'success' ||
      this.state === 'cancelled'
    ) {
      return;
    }

    if (
      this.preview.isDangerous &&
      this.state === 'awaiting_confirmation'
    ) {
      this.state = 'awaiting_second_confirmation';
      return;
    }

    this.state = 'pending';
    try {
      await this.adapter.execute(this.preview.id);
      this.state = 'success';
    } catch {
      this.state = 'error';
    }
  }
}
