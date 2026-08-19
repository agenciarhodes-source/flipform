import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { asObject, assertAutomationType, normalizeJsonObject, toJson } from './json';
import { assertAutomationDefinitionVersionInTenant, listAutomationDefinitions } from './definition-store';
import {
  AutomationActionHandlerResult,
  AutomationActionHandlers,
  AutomationCoreError,
  AutomationDefinitionSnapshot,
  AutomationExecutionState,
} from './types';

const AUTOMATION_EXECUTION_PROVIDER = 'automation_execution_v1';
const AUTOMATION_EXECUTION_SOURCE = 'flipform_automation_core_v1';
const AUTOMATION_EXECUTION_EVENT_TYPE = 'execution';
const AUTOMATION_PROCESSING_LEASE_MS = 2 * 60_000;
const AUTOMATION_MAX_INTERNAL_ATTEMPTS = 3;
const AUTOMATION_WORKER_BATCH_SIZE = 10;
const MAX_EXECUTION_INPUT_BYTES = 32 * 1024;

type AutomationExecutionMetadata = {
  source: typeof AUTOMATION_EXECUTION_SOURCE;
  definitionId: string;
  definitionVersionId: string;
  triggerType: string;
  sourceEventKey: string;
  input: Record<string, unknown>;
  state: AutomationExecutionState;
  attempts: number;
  actionIndex: number;
  attemptStartedAt?: string;
  completedAt?: string;
  outcome?: string;
  lastErrorCode?: string;
};

type LockedAutomationExecution = {
  id: string;
  tenant_id: string | null;
  raw_payload: Prisma.JsonValue | null;
};

function parseExecutionMetadata(value: Prisma.JsonValue | null | undefined): AutomationExecutionMetadata | null {
  const raw = asObject(value);
  if (!raw || raw.source !== AUTOMATION_EXECUTION_SOURCE) return null;
  const input = asObject(raw.input);
  if (
    typeof raw.definitionId !== 'string'
    || typeof raw.definitionVersionId !== 'string'
    || typeof raw.triggerType !== 'string'
    || typeof raw.sourceEventKey !== 'string'
    || !input
    || typeof raw.state !== 'string'
    || !['queued', 'processing', 'completed', 'failed', 'delivery_unknown', 'skipped'].includes(raw.state)
    || typeof raw.attempts !== 'number'
    || !Number.isInteger(raw.attempts)
    || raw.attempts < 0
    || typeof raw.actionIndex !== 'number'
    || !Number.isInteger(raw.actionIndex)
    || raw.actionIndex < 0
  ) return null;
  return raw as unknown as AutomationExecutionMetadata;
}

export function automationExecutionEventId(input: {
  tenantId: string;
  definitionId: string;
  sourceEventKey: string;
}) {
  return createHash('sha256')
    .update([
      'flipform-automation-execution-v1',
      input.tenantId,
      input.definitionId,
      input.sourceEventKey,
    ].join('\n'))
    .digest('hex');
}

export async function enqueueAutomationExecution(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    definition: AutomationDefinitionSnapshot;
    sourceEventKey: string;
    executionInput?: Record<string, unknown>;
  },
) {
  if (!input.definition.enabled) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Disabled automations cannot be enqueued');
  }
  const sourceEventKey = input.sourceEventKey.trim();
  if (!sourceEventKey || sourceEventKey.length > 512) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Automation source event key is invalid');
  }
  assertAutomationType(input.definition.trigger.type, 'Trigger');
  await assertAutomationDefinitionVersionInTenant(tx, {
    tenantId: input.tenantId,
    definitionId: input.definition.id,
    definitionVersionId: input.definition.versionId,
  });
  const executionInput = normalizeJsonObject(
    input.executionInput ?? {},
    'Automation execution input',
    MAX_EXECUTION_INPUT_BYTES,
  );
  const eventId = automationExecutionEventId({
    tenantId: input.tenantId,
    definitionId: input.definition.id,
    sourceEventKey,
  });
  const metadata: AutomationExecutionMetadata = {
    source: AUTOMATION_EXECUTION_SOURCE,
    definitionId: input.definition.id,
    definitionVersionId: input.definition.versionId,
    triggerType: input.definition.trigger.type,
    sourceEventKey,
    input: executionInput,
    state: 'queued',
    attempts: 0,
    actionIndex: 0,
  };

  const executionId = randomUUID();
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public.webhook_events (
      id, provider, event_id, event_type, raw_payload, tenant_id, created_at
    )
    VALUES (
      ${executionId},
      ${AUTOMATION_EXECUTION_PROVIDER},
      ${eventId},
      ${AUTOMATION_EXECUTION_EVENT_TYPE},
      ${JSON.stringify(metadata)}::jsonb,
      ${input.tenantId},
      NOW()
    )
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id
  `;
  if (inserted[0]) return { id: inserted[0].id, eventId, duplicate: false as const };

  const existing = await tx.webhookEvent.findFirst({
    where: { provider: AUTOMATION_EXECUTION_PROVIDER, eventId },
    select: { id: true },
  });
  if (!existing) {
    throw new AutomationCoreError('CONFLICT', 'Automation execution deduplication failed');
  }
  return { id: existing.id, eventId, duplicate: true as const };
}

function processingLeaseIsStale(metadata: AutomationExecutionMetadata, now = Date.now()) {
  if (!metadata.attemptStartedAt) return true;
  const startedAt = new Date(metadata.attemptStartedAt).getTime();
  return !Number.isFinite(startedAt) || now - startedAt >= AUTOMATION_PROCESSING_LEASE_MS;
}

async function finalizeExecution(input: {
  executionId: string;
  metadata: AutomationExecutionMetadata;
  state: 'completed' | 'failed' | 'delivery_unknown' | 'skipped';
  outcome: string;
  lastErrorCode?: string;
  actionIndex?: number;
}) {
  const nextMetadata: AutomationExecutionMetadata = {
    ...input.metadata,
    state: input.state,
    actionIndex: input.actionIndex ?? input.metadata.actionIndex,
    completedAt: new Date().toISOString(),
    outcome: input.outcome,
    ...(input.lastErrorCode ? { lastErrorCode: input.lastErrorCode } : {}),
  };
  await prisma.webhookEvent.update({
    where: { id: input.executionId },
    data: { rawPayload: toJson(nextMetadata), processedAt: new Date() },
  });
}

async function releaseExecution(input: {
  executionId: string;
  metadata: AutomationExecutionMetadata;
  actionIndex: number;
  lastErrorCode: string;
}) {
  const { attemptStartedAt: _attemptStartedAt, completedAt: _completedAt, outcome: _outcome, ...rest } = input.metadata;
  const nextMetadata: AutomationExecutionMetadata = {
    ...rest,
    state: 'queued',
    actionIndex: input.actionIndex,
    lastErrorCode: input.lastErrorCode,
  };
  await prisma.webhookEvent.update({
    where: { id: input.executionId },
    data: { rawPayload: toJson(nextMetadata), processedAt: null },
  });
}

async function claimAutomationExecutions(batchSize = AUTOMATION_WORKER_BATCH_SIZE) {
  const safeBatchSize = Math.max(1, Math.min(50, Math.trunc(batchSize)));
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<LockedAutomationExecution[]>`
      SELECT id, tenant_id, raw_payload
      FROM public.webhook_events
      WHERE provider = ${AUTOMATION_EXECUTION_PROVIDER}
        AND processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${safeBatchSize}
      FOR UPDATE SKIP LOCKED
    `;

    const claimed: Array<{ id: string; tenantId: string; metadata: AutomationExecutionMetadata }> = [];
    for (const row of rows) {
      const metadata = parseExecutionMetadata(row.raw_payload);
      if (!row.tenant_id || !metadata) {
        await tx.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
        continue;
      }
      if (metadata.state === 'processing' && !processingLeaseIsStale(metadata)) continue;
      if (metadata.state !== 'queued' && metadata.state !== 'processing') {
        await tx.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
        continue;
      }
      if (metadata.attempts >= AUTOMATION_MAX_INTERNAL_ATTEMPTS) {
        await tx.webhookEvent.update({
          where: { id: row.id },
          data: {
            rawPayload: toJson({
              ...metadata,
              state: 'failed',
              completedAt: new Date().toISOString(),
              outcome: 'internal_retry_limit',
              lastErrorCode: metadata.lastErrorCode || 'INTERNAL_ERROR',
            }),
            processedAt: new Date(),
          },
        });
        continue;
      }

      const nextMetadata: AutomationExecutionMetadata = {
        ...metadata,
        state: 'processing',
        attempts: metadata.attempts + 1,
        attemptStartedAt: new Date().toISOString(),
      };
      await tx.webhookEvent.update({ where: { id: row.id }, data: { rawPayload: toJson(nextMetadata) } });
      claimed.push({ id: row.id, tenantId: row.tenant_id, metadata: nextMetadata });
    }
    return claimed;
  });
}

async function persistExecutionActionCursor(input: {
  executionId: string;
  metadata: AutomationExecutionMetadata;
  actionIndex: number;
}) {
  await prisma.webhookEvent.update({
    where: { id: input.executionId },
    data: { rawPayload: toJson({ ...input.metadata, actionIndex: input.actionIndex }) },
  });
}

async function processClaimedExecution(
  execution: { id: string; tenantId: string; metadata: AutomationExecutionMetadata },
  handlers: AutomationActionHandlers,
) {
  const definitions = await listAutomationDefinitions(execution.tenantId);
  const definition = definitions.find((item: AutomationDefinitionSnapshot) => item.id === execution.metadata.definitionId);
  if (!definition || !definition.enabled || definition.versionId !== execution.metadata.definitionVersionId) {
    await finalizeExecution({
      executionId: execution.id,
      metadata: execution.metadata,
      state: 'skipped',
      outcome: !definition ? 'definition_missing' : !definition.enabled ? 'definition_disabled' : 'definition_version_changed',
    });
    return 'skipped' as const;
  }
  if (definition.trigger.type !== execution.metadata.triggerType) {
    await finalizeExecution({
      executionId: execution.id,
      metadata: execution.metadata,
      state: 'skipped',
      outcome: 'trigger_type_changed',
    });
    return 'skipped' as const;
  }
  if (execution.metadata.actionIndex > definition.actions.length) {
    await finalizeExecution({
      executionId: execution.id,
      metadata: execution.metadata,
      state: 'failed',
      outcome: 'invalid_action_cursor',
      lastErrorCode: 'INVALID_ACTION_CURSOR',
    });
    return 'failed' as const;
  }

  let actionIndex = execution.metadata.actionIndex;
  while (actionIndex < definition.actions.length) {
    const action = definition.actions[actionIndex];
    const handler = handlers[action.type];
    if (!handler) {
      await finalizeExecution({
        executionId: execution.id,
        metadata: execution.metadata,
        state: 'failed',
        outcome: 'action_handler_missing',
        lastErrorCode: `MISSING_HANDLER:${action.type}`,
        actionIndex,
      });
      return 'failed' as const;
    }

    let result: AutomationActionHandlerResult;
    try {
      result = await handler({
        executionId: execution.id,
        tenantId: execution.tenantId,
        definitionId: definition.id,
        definitionVersionId: definition.versionId,
        configuredByUserId: definition.configuredByUserId,
        sourceEventKey: execution.metadata.sourceEventKey,
        trigger: definition.trigger,
        action,
        input: execution.metadata.input,
        attempt: execution.metadata.attempts,
        idempotencyKey: `automation:${execution.id}:action:${action.id}`,
      });
    } catch {
      if (execution.metadata.attempts >= AUTOMATION_MAX_INTERNAL_ATTEMPTS) {
        await finalizeExecution({
          executionId: execution.id,
          metadata: execution.metadata,
          state: 'failed',
          outcome: 'action_handler_exception_retry_limit',
          lastErrorCode: 'ACTION_HANDLER_EXCEPTION',
          actionIndex,
        });
        return 'failed' as const;
      }
      await releaseExecution({
        executionId: execution.id,
        metadata: execution.metadata,
        actionIndex,
        lastErrorCode: 'ACTION_HANDLER_EXCEPTION',
      });
      return 'deferred' as const;
    }

    if (result.status === 'completed') {
      actionIndex += 1;
      await persistExecutionActionCursor({ executionId: execution.id, metadata: execution.metadata, actionIndex });
      continue;
    }
    if (result.status === 'retry') {
      if (execution.metadata.attempts >= AUTOMATION_MAX_INTERNAL_ATTEMPTS) {
        await finalizeExecution({
          executionId: execution.id,
          metadata: execution.metadata,
          state: 'failed',
          outcome: 'action_retry_limit',
          lastErrorCode: result.code,
          actionIndex,
        });
        return 'failed' as const;
      }
      await releaseExecution({ executionId: execution.id, metadata: execution.metadata, actionIndex, lastErrorCode: result.code });
      return 'deferred' as const;
    }
    if (result.status === 'delivery_unknown') {
      await finalizeExecution({
        executionId: execution.id,
        metadata: execution.metadata,
        state: 'delivery_unknown',
        outcome: 'action_delivery_unknown',
        lastErrorCode: result.code,
        actionIndex,
      });
      return 'delivery_unknown' as const;
    }
    if (result.status === 'skipped') {
      await finalizeExecution({
        executionId: execution.id,
        metadata: execution.metadata,
        state: 'skipped',
        outcome: 'action_skipped',
        lastErrorCode: result.code,
        actionIndex,
      });
      return 'skipped' as const;
    }

    await finalizeExecution({
      executionId: execution.id,
      metadata: execution.metadata,
      state: 'failed',
      outcome: 'action_failed',
      lastErrorCode: result.code,
      actionIndex,
    });
    return 'failed' as const;
  }

  await finalizeExecution({
    executionId: execution.id,
    metadata: execution.metadata,
    state: 'completed',
    outcome: 'all_actions_completed',
    actionIndex,
  });
  return 'completed' as const;
}

export async function drainAutomationExecutionQueue(input: {
  handlers: AutomationActionHandlers;
  batchSize?: number;
}) {
  const executions = await claimAutomationExecutions(input.batchSize);
  const outcomes = await Promise.allSettled(
    executions.map((execution: { id: string; tenantId: string; metadata: AutomationExecutionMetadata }) => processClaimedExecution(execution, input.handlers)),
  );
  return outcomes.reduce((summary, outcome) => {
    if (outcome.status === 'rejected') summary.errors += 1;
    else if (outcome.value === 'completed') summary.completed += 1;
    else if (outcome.value === 'delivery_unknown') summary.deliveryUnknown += 1;
    else if (outcome.value === 'failed') summary.failed += 1;
    else if (outcome.value === 'skipped') summary.skipped += 1;
    else summary.deferred += 1;
    return summary;
  }, {
    claimed: executions.length,
    completed: 0,
    deliveryUnknown: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
    errors: 0,
  });
}
