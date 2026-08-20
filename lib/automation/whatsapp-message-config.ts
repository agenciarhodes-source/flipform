import 'server-only';

import {
  createAutomationDefinition,
  listAutomationDefinitions,
  updateAutomationDefinition,
} from './definition-store';
import {
  normalizeWhatsAppAutomationText,
  WHATSAPP_MESSAGE_KEYWORD_TRIGGER,
  WHATSAPP_SEND_TEXT_ACTION,
  type WhatsAppMessageCoreMatchType,
} from './adapters/whatsapp-message';
import type { AutomationDefinitionSnapshot } from './types';

export type WhatsAppMessageAutomationRule = {
  id: string;
  versionId: string;
  versionNumber: number;
  configuredByUserId: string | null;
  name: string;
  orderIndex: number;
  keyword: string;
  keywordNormalized: string;
  matchType: WhatsAppMessageCoreMatchType;
  replyText: string;
  enabled: boolean;
  actionId: string;
  updatedAt: Date;
};

export class WhatsAppMessageAutomationConfigError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'WhatsAppMessageAutomationConfigError';
  }
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseRule(definition: AutomationDefinitionSnapshot): WhatsAppMessageAutomationRule | null {
  if (definition.trigger.type !== WHATSAPP_MESSAGE_KEYWORD_TRIGGER) return null;
  if (definition.actions.length !== 1) return null;

  const keyword = stringField(definition.trigger.config.keyword);
  const matchType = definition.trigger.config.matchType === 'exact' || definition.trigger.config.matchType === 'contains'
    ? definition.trigger.config.matchType
    : null;
  const action = definition.actions[0];
  const replyText = action.type === WHATSAPP_SEND_TEXT_ACTION ? stringField(action.config.text) : null;
  if (!keyword || !matchType || !replyText) return null;

  const keywordNormalized = normalizeWhatsAppAutomationText(keyword);
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
    actionId: action.id,
    updatedAt: definition.updatedAt,
  };
}

function validateFields(input: {
  name: string;
  keyword: string;
  matchType: WhatsAppMessageCoreMatchType;
  replyText: string;
  orderIndex: number;
}) {
  const name = input.name.trim();
  const keyword = input.keyword.trim();
  const keywordNormalized = normalizeWhatsAppAutomationText(keyword);
  const replyText = input.replyText.trim();

  if (!name || name.length > 120) {
    throw new WhatsAppMessageAutomationConfigError('INVALID_REQUEST', 'Automation name is invalid');
  }
  if (!keyword || keyword.length > 160 || !keywordNormalized) {
    throw new WhatsAppMessageAutomationConfigError('INVALID_REQUEST', 'Automation keyword is invalid');
  }
  if (!replyText || replyText.length > 4096) {
    throw new WhatsAppMessageAutomationConfigError('INVALID_REQUEST', 'Automation reply is invalid');
  }
  if (!Number.isInteger(input.orderIndex) || input.orderIndex < 0 || input.orderIndex > 10000) {
    throw new WhatsAppMessageAutomationConfigError('INVALID_REQUEST', 'Automation order is invalid');
  }

  return { name, keyword, keywordNormalized, replyText };
}

export async function listWhatsAppMessageAutomations(tenantId: string) {
  const definitions = await listAutomationDefinitions(tenantId);
  return definitions
    .map(parseRule)
    .filter((rule): rule is WhatsAppMessageAutomationRule => Boolean(rule));
}

export async function createWhatsAppMessageAutomation(input: {
  tenantId: string;
  userId: string;
  name: string;
  keyword: string;
  matchType: WhatsAppMessageCoreMatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
}) {
  const fields = validateFields(input);
  const definition = await createAutomationDefinition({
    tenantId: input.tenantId,
    userId: input.userId,
    name: fields.name,
    enabled: input.enabled,
    orderIndex: input.orderIndex,
    trigger: {
      type: WHATSAPP_MESSAGE_KEYWORD_TRIGGER,
      config: {
        keyword: fields.keyword,
        matchType: input.matchType,
      },
    },
    actions: [{
      type: WHATSAPP_SEND_TEXT_ACTION,
      config: { text: fields.replyText },
    }],
  });

  const rule = parseRule(definition);
  if (!rule) throw new WhatsAppMessageAutomationConfigError('INVALID_REQUEST', 'Automation definition is invalid');
  return rule;
}

export async function updateWhatsAppMessageAutomation(input: {
  tenantId: string;
  userId: string;
  ruleId: string;
  name: string;
  keyword: string;
  matchType: WhatsAppMessageCoreMatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
}) {
  const fields = validateFields(input);
  const rules = await listWhatsAppMessageAutomations(input.tenantId);
  const current = rules.find(rule => rule.id === input.ruleId);
  if (!current) {
    throw new WhatsAppMessageAutomationConfigError('NOT_FOUND', 'Automation not found');
  }

  const definition = await updateAutomationDefinition({
    tenantId: input.tenantId,
    userId: input.userId,
    definitionId: current.id,
    name: fields.name,
    enabled: input.enabled,
    orderIndex: input.orderIndex,
    trigger: {
      type: WHATSAPP_MESSAGE_KEYWORD_TRIGGER,
      config: {
        keyword: fields.keyword,
        matchType: input.matchType,
      },
    },
    actions: [{
      id: current.actionId,
      type: WHATSAPP_SEND_TEXT_ACTION,
      config: { text: fields.replyText },
    }],
  });

  const rule = parseRule(definition);
  if (!rule) throw new WhatsAppMessageAutomationConfigError('INVALID_REQUEST', 'Automation definition is invalid');
  return rule;
}
