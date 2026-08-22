import 'server-only';

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
import type { AutomationDefinitionSnapshot } from './types';

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
  if (definition.actions.length !== 1) return null;

  const keyword = stringField(definition.trigger.config.keyword);
  const matchType = definition.trigger.config.matchType === 'exact' || definition.trigger.config.matchType === 'contains'
    ? definition.trigger.config.matchType
    : null;
  const replyAction = definition.actions[0];
  const replyText = replyAction.type === INSTAGRAM_SEND_TEXT_ACTION
    ? stringField(replyAction.config.text)
    : null;
  if (!keyword || !matchType || !replyText) return null;

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
    updatedAt: definition.updatedAt,
  };
}

function validateFields(input: {
  name: string;
  keyword: string;
  matchType: InstagramMessageCoreMatchType;
  replyText: string;
  orderIndex: number;
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

  return { name, keyword, keywordNormalized, replyText };
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
}) {
  const fields = validateFields(input);
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
    actions: [{
      type: INSTAGRAM_SEND_TEXT_ACTION,
      config: { text: fields.replyText },
    }],
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
}) {
  const fields = validateFields(input);
  const rules = await listInstagramMessageAutomations(input.tenantId);
  const current = rules.find(rule => rule.id === input.ruleId);
  if (!current) {
    throw new InstagramMessageAutomationConfigError('NOT_FOUND', 'Automation not found');
  }
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
    actions: [{
      id: current.replyActionId,
      type: INSTAGRAM_SEND_TEXT_ACTION,
      config: { text: fields.replyText },
    }],
  });

  const rule = parseRule(definition);
  if (!rule) {
    throw new InstagramMessageAutomationConfigError('INVALID_REQUEST', 'Automation definition is invalid');
  }
  return rule;
}
