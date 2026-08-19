import 'server-only';

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  asObject,
  assertAutomationId,
  assertAutomationType,
  integerField,
  jsonByteLength,
  nonEmptyString,
  normalizeJsonObject,
  toJson,
} from './json';
import {
  AutomationActionDefinition,
  AutomationCoreError,
  AutomationDefinitionSnapshot,
  AutomationTriggerDefinition,
} from './types';

export const AUTOMATION_DEFINITION_ENTITY_TYPE = 'automation_definition_v1';
const AUTOMATION_DEFINITION_CREATED_ACTION = 'AUTOMATION_DEFINITION_CREATED';
const AUTOMATION_DEFINITION_UPDATED_ACTION = 'AUTOMATION_DEFINITION_UPDATED';
const MAX_TRIGGER_OR_ACTION_CONFIG_BYTES = 16 * 1024;
const MAX_DEFINITION_BYTES = 64 * 1024;
const MAX_AUTOMATION_ACTIONS = 20;

function parseTrigger(value: unknown): AutomationTriggerDefinition | null {
  const raw = asObject(value);
  const type = nonEmptyString(raw?.type);
  const config = asObject(raw?.config);
  if (!type || !config) return null;
  return { type, config };
}

function parseActions(value: unknown): AutomationActionDefinition[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_AUTOMATION_ACTIONS) return null;
  const actions: AutomationActionDefinition[] = [];
  for (const item of value) {
    const raw = asObject(item);
    const id = nonEmptyString(raw?.id);
    const type = nonEmptyString(raw?.type);
    const config = asObject(raw?.config);
    if (!id || !type || !config) return null;
    actions.push({ id, type, config });
  }
  return actions;
}

function parseDefinitionSnapshot(record: {
  id: string;
  entityId: string;
  userId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): AutomationDefinitionSnapshot | null {
  const raw = asObject(record.metadata);
  if (!raw) return null;
  const versionNumber = integerField(raw.versionNumber);
  const name = nonEmptyString(raw.name);
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : null;
  const orderIndex = integerField(raw.orderIndex);
  const trigger = parseTrigger(raw.trigger);
  const actions = parseActions(raw.actions);
  if (
    versionNumber === null || versionNumber < 1
    || !name || enabled === null || orderIndex === null
    || !trigger || !actions
  ) return null;

  return {
    id: record.entityId,
    versionId: record.id,
    versionNumber,
    configuredByUserId: record.userId,
    name,
    enabled,
    orderIndex,
    trigger,
    actions,
    updatedAt: record.createdAt,
  };
}

function validateDefinitionFields(input: {
  name: string;
  enabled: boolean;
  orderIndex: number;
  trigger: { type: string; config?: Record<string, unknown> };
  actions: Array<{ id?: string; type: string; config?: Record<string, unknown> }>;
}) {
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Automation name is invalid');
  }
  if (!Number.isInteger(input.orderIndex) || input.orderIndex < 0 || input.orderIndex > 10000) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Automation order is invalid');
  }
  if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > MAX_AUTOMATION_ACTIONS) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Automation actions are invalid');
  }

  const trigger: AutomationTriggerDefinition = {
    type: assertAutomationType(input.trigger.type, 'Trigger'),
    config: normalizeJsonObject(input.trigger.config ?? {}, 'Trigger config', MAX_TRIGGER_OR_ACTION_CONFIG_BYTES),
  };

  const ids = new Set<string>();
  const actions = input.actions.map((action, index): AutomationActionDefinition => {
    const id = assertAutomationId(action.id?.trim() || randomUUID(), `Action ${index + 1}`);
    if (ids.has(id)) {
      throw new AutomationCoreError('INVALID_REQUEST', `Automation action ${index + 1} has a duplicate id`);
    }
    ids.add(id);
    return {
      id,
      type: assertAutomationType(action.type, `Action ${index + 1}`),
      config: normalizeJsonObject(
        action.config ?? {},
        `Action ${index + 1} config`,
        MAX_TRIGGER_OR_ACTION_CONFIG_BYTES,
      ),
    };
  });

  if (jsonByteLength({ name, enabled: input.enabled, orderIndex: input.orderIndex, trigger, actions }) > MAX_DEFINITION_BYTES) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Automation definition is too large');
  }
  return { name, trigger, actions };
}

async function loadLatestDefinitions(tx: Prisma.TransactionClient, tenantId: string) {
  const records = await tx.auditLog.findMany({
    where: {
      tenantId,
      entityType: AUTOMATION_DEFINITION_ENTITY_TYPE,
      action: { in: [AUTOMATION_DEFINITION_CREATED_ACTION, AUTOMATION_DEFINITION_UPDATED_ACTION] },
    },
    select: { id: true, entityId: true, userId: true, metadata: true, createdAt: true },
  });

  const latest = new Map<string, AutomationDefinitionSnapshot>();
  for (const record of records) {
    const parsed = parseDefinitionSnapshot(record);
    if (!parsed) continue;
    const current = latest.get(parsed.id);
    if (!current || parsed.versionNumber > current.versionNumber) latest.set(parsed.id, parsed);
  }

  const definitions = [...latest.values()];
  definitions.sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id));
  return definitions;
}

function definitionMetadata(input: {
  versionNumber: number;
  name: string;
  enabled: boolean;
  orderIndex: number;
  trigger: AutomationTriggerDefinition;
  actions: AutomationActionDefinition[];
}) {
  return {
    versionNumber: input.versionNumber,
    name: input.name,
    enabled: input.enabled,
    orderIndex: input.orderIndex,
    trigger: input.trigger,
    actions: input.actions,
  };
}

export async function assertAutomationDefinitionVersionInTenant(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; definitionId: string; definitionVersionId: string },
) {
  const persisted = await tx.auditLog.findFirst({
    where: {
      id: input.definitionVersionId,
      tenantId: input.tenantId,
      entityType: AUTOMATION_DEFINITION_ENTITY_TYPE,
      entityId: input.definitionId,
      action: { in: [AUTOMATION_DEFINITION_CREATED_ACTION, AUTOMATION_DEFINITION_UPDATED_ACTION] },
    },
    select: { id: true },
  });
  if (!persisted) {
    throw new AutomationCoreError('INVALID_REQUEST', 'Automation definition does not belong to this tenant');
  }
}

export async function listAutomationDefinitions(tenantId: string) {
  return prisma.$transaction((tx: Prisma.TransactionClient) => loadLatestDefinitions(tx, tenantId));
}

export async function listEnabledAutomationDefinitionsByTrigger(input: {
  tenantId: string;
  triggerType: string;
}) {
  const triggerType = assertAutomationType(input.triggerType, 'Trigger');
  const definitions = await listAutomationDefinitions(input.tenantId);
  return definitions.filter((definition: AutomationDefinitionSnapshot) => definition.enabled && definition.trigger.type === triggerType);
}

export async function createAutomationDefinition(input: {
  tenantId: string;
  userId: string;
  name: string;
  enabled: boolean;
  orderIndex: number;
  trigger: { type: string; config?: Record<string, unknown> };
  actions: Array<{ id?: string; type: string; config?: Record<string, unknown> }>;
}) {
  const fields = validateDefinitionFields(input);
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE`;
    const definitionId = randomUUID();
    const versionNumber = 1;
    const log = await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: AUTOMATION_DEFINITION_ENTITY_TYPE,
        entityId: definitionId,
        action: AUTOMATION_DEFINITION_CREATED_ACTION,
        metadata: toJson(definitionMetadata({
          versionNumber,
          name: fields.name,
          enabled: input.enabled,
          orderIndex: input.orderIndex,
          trigger: fields.trigger,
          actions: fields.actions,
        })),
      },
      select: { id: true, createdAt: true },
    });
    return {
      id: definitionId,
      versionId: log.id,
      versionNumber,
      configuredByUserId: input.userId,
      name: fields.name,
      enabled: input.enabled,
      orderIndex: input.orderIndex,
      trigger: fields.trigger,
      actions: fields.actions,
      updatedAt: log.createdAt,
    } satisfies AutomationDefinitionSnapshot;
  });
}

export async function updateAutomationDefinition(input: {
  tenantId: string;
  userId: string;
  definitionId: string;
  name: string;
  enabled: boolean;
  orderIndex: number;
  trigger: { type: string; config?: Record<string, unknown> };
  actions: Array<{ id?: string; type: string; config?: Record<string, unknown> }>;
}) {
  const fields = validateDefinitionFields(input);
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE`;
    const definitions = await loadLatestDefinitions(tx, input.tenantId);
    const current = definitions.find((definition: AutomationDefinitionSnapshot) => definition.id === input.definitionId);
    if (!current) throw new AutomationCoreError('NOT_FOUND', 'Automation definition not found');

    const versionNumber = current.versionNumber + 1;
    const log = await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: AUTOMATION_DEFINITION_ENTITY_TYPE,
        entityId: input.definitionId,
        action: AUTOMATION_DEFINITION_UPDATED_ACTION,
        metadata: toJson(definitionMetadata({
          versionNumber,
          name: fields.name,
          enabled: input.enabled,
          orderIndex: input.orderIndex,
          trigger: fields.trigger,
          actions: fields.actions,
        })),
      },
      select: { id: true, createdAt: true },
    });
    return {
      id: input.definitionId,
      versionId: log.id,
      versionNumber,
      configuredByUserId: input.userId,
      name: fields.name,
      enabled: input.enabled,
      orderIndex: input.orderIndex,
      trigger: fields.trigger,
      actions: fields.actions,
      updatedAt: log.createdAt,
    } satisfies AutomationDefinitionSnapshot;
  });
}
