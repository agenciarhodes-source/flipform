export type AutomationTriggerDefinition = {
  type: string;
  config: Record<string, unknown>;
};

export type AutomationActionDefinition = {
  id: string;
  type: string;
  config: Record<string, unknown>;
};

export type AutomationDefinitionSnapshot = {
  id: string;
  versionId: string;
  versionNumber: number;
  configuredByUserId: string | null;
  name: string;
  enabled: boolean;
  orderIndex: number;
  trigger: AutomationTriggerDefinition;
  actions: AutomationActionDefinition[];
  updatedAt: Date;
};

export type AutomationExecutionState =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'delivery_unknown'
  | 'skipped';

export type AutomationActionHandlerResult =
  | { status: 'completed' }
  | { status: 'retry'; code: string }
  | { status: 'failed'; code: string }
  | { status: 'delivery_unknown'; code: string }
  | { status: 'skipped'; code: string };

export type AutomationActionHandlerContext = {
  executionId: string;
  tenantId: string;
  definitionId: string;
  definitionVersionId: string;
  configuredByUserId: string | null;
  sourceEventKey: string;
  trigger: AutomationTriggerDefinition;
  action: AutomationActionDefinition;
  input: Record<string, unknown>;
  attempt: number;
  idempotencyKey: string;
};

export type AutomationActionHandler = (
  context: AutomationActionHandlerContext,
) => Promise<AutomationActionHandlerResult>;

export type AutomationActionHandlers = Record<string, AutomationActionHandler>;

export class AutomationCoreError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'INVALID_REQUEST' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'AutomationCoreError';
  }
}
