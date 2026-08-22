import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  createAutomationDefinition,
  listAutomationDefinitions,
  updateAutomationDefinition,
} from './definition-store';
import {
  INSTAGRAM_MESSAGE_KEYWORD_TRIGGER,
  INSTAGRAM_SEND_TEXT_ACTION,
  normalizeInstagramMessageAutomationText,
  type InstagramMessageCoreMatchType,
} from './adapters/instagram-message';
import {
  LEAD_ENSURE_FROM_CONVERSATION_ACTION,
  LEAD_MOVE_STAGE_ACTION,
} from './adapters/crm';
import type { AutomationDefinitionSnapshot } from './types';

export type InstagramLeadTemperature = 'cold' | 'warm' | 'hot';

export type InstagramEnsureLeadConfig = {
  pipelineId: string;
  stageId: string;
  temperature: InstagramLeadTemperature;
};

export type InstagramMoveLeadConfig = {
  pipelineId: string;
  stageId: string;
};

export type InstagramMessageAutomationRule = {
  id: string;
  versionId: string;
  versionNumber: number;
  configuredByUserId: string | null;
  name: string;
  orderIndex: number;
  keyword: string;
  keywordNormalized: string;
  matchType: InstagramMessageCoreMatchType;
  replyText: string;
  enabled: boolean;
  replyActionId: string;
  ensureLead: (InstagramEnsureLeadConfig & { actionId: string }) | null;
  moveLead: (InstagramMoveLeadConfig & { actionId: string }) | null;
  updatedAt: Date;
};

export class InstagramMessageAutomationConfigError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'InstagramMessageAutomationConfigError';
  }
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseRule(definition: AutomationDefinitionSnapshot): InstagramMessageAutomationRule | null {
  if (definition.trigger.type !== INSTAGRAM_MESSAGE_KEYWORD_TRIGGER) return null;
  if (definition.actions.length < 1 || definition.actions.length > 3) return null;

  const keyword = stringField(definition.trigger.config.keyword);
  const matchType = definition.trigger.config.matchType === 'exact' || definition.trigger.config.matchType === 'contains'
    ? definition.trigger.config.matchType
    : null;

  const supportedTypes = new Set([
    INSTAGRAM_SEND_TEXT_ACTION,
    LEAD_ENSURE_FROM_CONVERSATION_ACTION,
    LEAD_MOVE_STAGE_ACTION,
  ]);
  if (definition.actions.some(action => !supportedTypes.has(action.type))) return null;

  const replyActions = definition.actions.filter(action => action.type === INSTAGRAM_SEND_TEXT_ACTION);
  const ensureActions = definition.actions.filter(action => action.type === LEAD_ENSURE_FROM_CONVERSATION_ACTION);
  const moveActions = definition.actions.filter(action => action.type === LEAD_MOVE_STAGE_ACTION);
  if (replyActions.length !== 1 || ensureActions.length > 1 || moveActions.length > 1) return null;

  const replyAction = replyActions[0];
  const replyText = stringField(replyAction.config.text);
  if (!keyword || !matchType || !replyText) return null;

  let ensureLead: InstagramMessageAutomationRule['ensureLead'] = null;
  const ensureAction = ensureActions[0];
  if (ensureAction) {
    const pipelineId = stringField(ensureAction.config.pipelineId);
    const stageId = stringField(ensureAction.config.stageId);
    const rawTemperature = ensureAction.config.temperature;
    const temperature: InstagramLeadTemperature | null = rawTemperature === 'cold' || rawTemperature === 'warm' || rawTemperature === 'hot'
      ? rawTemperature
      : null;
    if (!pipelineId || !stageId || !temperature) return null;
    ensureLead = { actionId: ensureAction.id, pipelineId, stageId, temperature };
  }

  let moveLead: InstagramMessageAutomationRule['moveLead'] = null;
  const moveAction = moveActions[0];
  if (moveAction) {
    const pipelineId = stringField(moveAction.config.pipelineId);
    const stageId = stringField(moveAction.config.stageId);
    if (!pipelineId || !stageId) return null;
    moveLead = { actionId: moveAction.id, pipelineId, stageId };
  }

  const keywordNormalized = normalizeInstagramMessageAutomationText(keyword);
  if (!keywordNormalized) return null;

  return {
    id: definition.id,
    versionId: definition.versionId,
    versionNumber: definition.versionNumber,
    configuredByUserId: definition.configuredByUserId,
    name: definition.name,
    orderIndex: definition.orderIndex,
    keyword,
    keywordNormalized,
    matchType,
    replyText,
    enabled: definition.enabled,
    replyActionId: replyAction.id,
    ensureLead,
    moveLead,
    updatedAt: definition.updatedAt,
  };
}

function validateFields(input: {
  name: string;
  keyword: string;
  matchType: InstagramMessageCoreMatchType;
  replyText: string;
  orderIndex: number;
  ensureLead?: InstagramEnsureLeadConfig | null;
  moveLead?: InstagramMoveLeadConfig | null;
}) {
  const name = input.name.trim();
  const keyword = input.keyword.trim();
  const keywordNormalized = normalizeInstagramMessageAutomationText(keyword);
  const replyText = input.replyText.trim();

  if (!name || name.length > 120) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation name is invalid');
  }
  if (!keyword || keyword.length > 160 || !keywordNormalized) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation keyword is invalid');
  }
  if (!replyText || replyText.length > 4096) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation reply is invalid');
  }
  if (!Number.isInteger(input.orderIndex) || input.orderIndex < 0 || input.orderIndex > 10000) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation order is invalid');
  }

  const ensureLead = input.ensureLead
    ? {
        pipelineId: input.ensureLead.pipelineId.trim(),
        stageId: input.ensureLead.stageId.trim(),
        temperature: input.ensureLead.temperature,
      }
    : null;
  if (
    ensureLead
    && (
      !ensureLead.pipelineId
      || !ensureLead.stageId
      || !['cold', 'warm', 'hot'].includes(ensureLead.temperature)
    )
  ) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Lead creation config is invalid');
  }

  const moveLead = input.moveLead
    ? {
        pipelineId: input.moveLead.pipelineId.trim(),
        stageId: input.moveLead.stageId.trim(),
      }
    : null;
  if (moveLead && (!moveLead.pipelineId || !moveLead.stageId)) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Lead move config is invalid');
  }
  if (ensureLead && moveLead && ensureLead.pipelineId !== moveLead.pipelineId) {
    throw new InstagramMessageAutomationConfigError(
      'INVALID_REQUEST',
      'Lead creation and movement must use the same pipeline in one flow',
    );
  }

  return { name, keyword, keywordNormalized, replyText, ensureLead, moveLead };
}

async function assertCrmTargets(input: {
  tenantId: string;
  ensureLead: InstagramEnsureLeadConfig | null;
  moveLead: InstagramMoveLeadConfig | null;
}) {
  const targets = [
    input.ensureLead ? { pipelineId: input.ensureLead.pipelineId, stageId: input.ensureLead.stageId } : null,
    input.moveLead ? { pipelineId: input.moveLead.pipelineId, stageId: input.moveLead.stageId } : null,
  ].filter((target): target is { pipelineId: string; stageId: string } => Boolean(target));

  const uniqueTargets = [...new Map(targets.map(target => [`${target.pipelineId}:${target.stageId}`, target])).values()];
  for (const target of uniqueTargets) {
    const stage = await prisma.pipelineStage.findFirst({
      where: {
        id: target.stageId,
        pipelineId: target.pipelineId,
        isArchived: false,
        pipeline: { tenantId: input.tenantId, isArchived: false },
      },
      select: { id: true },
    });
    if (!stage) {
      throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Pipeline or stage is invalid');
    }
  }
}

type ConfigurableAction = {
  id?: string;
  type: string;
  config: Record<string, unknown>;
};

function buildActions(
  fields: {
    replyText: string;
    ensureLead: InstagramEnsureLeadConfig | null;
    moveLead: InstagramMoveLeadConfig | null;
  },
  current?: InstagramMessageAutomationRule,
) {
  const actions: ConfigurableAction[] = [{
    ...(current?.replyActionId ? { id: current.replyActionId } : {}),
    type: INSTAGRAM_SEND_TEXT_ACTION,
    config: { text: fields.replyText },
  }];

  if (fields.ensureLead) {
    actions.push({
      ...(current?.ensureLead?.actionId ? { id: current.ensureLead.actionId } : {}),
      type: LEAD_ENSURE_FROM_CONVERSATION_ACTION,
      config: {
        pipelineId: fields.ensureLead.pipelineId,
        stageId: fields.ensureLead.stageId,
        source: 'instagram_direct',
        temperature: fields.ensureLead.temperature,
      },
    });
  }

  if (fields.moveLead) {
    actions.push({
      ...(current?.moveLead?.actionId ? { id: current.moveLead.actionId } : {}),
      type: LEAD_MOVE_STAGE_ACTION,
      config: {
        pipelineId: fields.moveLead.pipelineId,
        stageId: fields.moveLead.stageId,
      },
    });
  }

  return actions;
}

function assertNoConflict(
  rules: InstagramMessageAutomationRule[],
  input: {
    keywordNormalized: string;
    matchType: InstagramMessageCoreMatchType;
    exceptRuleId?: string;
  },
) {
  const conflict = rules.some(rule => (
    rule.id !== input.exceptRuleId
    && rule.keywordNormalized === input.keywordNormalized
    && rule.matchType === input.matchType
  ));
  if (conflict) {
    throw new InstagramMessageAutomationConfigError(
      'CONFLICT',
      'An automation already uses this keyword and match type',
    );
  }
}

export async function listInstagramMessageAutomations(tenantId: string) {
  const definitions = await listAutomationDefinitions(tenantId);
  return definitions
    .map(parseRule)
    .filter((rule): rule is InstagramMessageAutomationRule => Boolean(rule));
}

export async function createInstagramMessageAutomation(input: {
  tenantId: string;
  userId: string;
  name: string;
  keyword: string;
  matchType: InstagramMessageCoreMatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
  ensureLead?: InstagramEnsureLeadConfig | null;
  moveLead?: InstagramMoveLeadConfig | null;
}) {
  const fields = validateFields(input);
  await assertCrmTargets({
    tenantId: input.tenantId,
    ensureLead: fields.ensureLead,
    moveLead: fields.moveLead,
  });

  const rules = await listInstagramMessageAutomations(input.tenantId);
  assertNoConflict(rules, {
    keywordNormalized: fields.keywordNormalized,
    matchType: input.matchType,
  });

  const definition = await createAutomationDefinition({
    tenantId: input.tenantId,
    userId: input.userId,
    name: fields.name,
    enabled: input.enabled,
    orderIndex: input.orderIndex,
    trigger: {
      type: INSTAGRAM_MESSAGE_KEYWORD_TRIGGER,
      config: {
        keyword: fields.keyword,
        matchType: input.matchType,
      },
    },
    actions: buildActions(fields),
  });

  const rule = parseRule(definition);
  if (!rule) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation definition is invalid');
  }
  return rule;
}

export async function updateInstagramMessageAutomation(input: {
  tenantId: string;
  userId: string;
  ruleId: string;
  name: string;
  keyword: string;
  matchType: InstagramMessageCoreMatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
  ensureLead?: InstagramEnsureLeadConfig | null;
  moveLead?: InstagramMoveLeadConfig | null;
}) {
  const fields = validateFields(input);
  const rules = await listInstagramMessageAutomations(input.tenantId);
  const current = rules.find(rule => rule.id === input.ruleId);
  if (!current) {
    throw new InstagramMessageAutomationConfigError('NOT_FOUND', 'Automation not found');
  }

  await assertCrmTargets({
    tenantId: input.tenantId,
    ensureLead: fields.ensureLead,
    moveLead: fields.moveLead,
  });

  assertNoConflict(rules, {
    keywordNormalized: fields.keywordNormalized,
    matchType: input.matchType,
    exceptRuleId: current.id,
  });

  const definition = await updateAutomationDefinition({
    tenantId: input.tenantId,
    userId: input.userId,
    definitionId: current.id,
    name: fields.name,
    enabled: input.enabled,
    orderIndex: input.orderIndex,
    trigger: {
      type: INSTAGRAM_MESSAGE_KEYWORD_TRIGGER,
      config: {
        keyword: fields.keyword,
        matchType: input.matchType,
      },
    },
    actions: buildActions(fields, current),
  });

  const rule = parseRule(definition);
  if (!rule) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation definition is invalid');
  }
  return rule;
}
