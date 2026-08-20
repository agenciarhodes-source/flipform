import 'server-only';

import { Prisma } from '@prisma/client';
import { listEnabledAutomationDefinitionsByTrigger } from '../definition-store';
import { enqueueAutomationExecution } from '../execution-engine';
import type { AutomationDefinitionSnapshot } from '../types';

export const WHATSAPP_MESSAGE_KEYWORD_TRIGGER = 'whatsapp.message.keyword';
export const WHATSAPP_SEND_TEXT_ACTION = 'whatsapp.send_text';

export type WhatsAppMessageCoreMatchType = 'exact' | 'contains';

type ParsedWhatsAppMessageTrigger = {
  keywordNormalized: string;
  matchType: WhatsAppMessageCoreMatchType;
};

export type PreparedWhatsAppMessageCoreAutomation = {
  definition: AutomationDefinitionSnapshot;
  keywordNormalized: string;
  matchType: WhatsAppMessageCoreMatchType;
};

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeWhatsAppAutomationText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function whatsappMessageAutomationMatches(input: {
  normalizedMessage: string;
  normalizedKeyword: string;
  matchType: WhatsAppMessageCoreMatchType;
}) {
  if (!input.normalizedMessage || !input.normalizedKeyword) return false;
  if (input.matchType === 'exact') return input.normalizedMessage === input.normalizedKeyword;
  return ` ${input.normalizedMessage} `.includes(` ${input.normalizedKeyword} `);
}

function parseTriggerConfig(
  definition: AutomationDefinitionSnapshot,
): ParsedWhatsAppMessageTrigger | null {
  if (definition.trigger.type !== WHATSAPP_MESSAGE_KEYWORD_TRIGGER) return null;
  const keyword = stringField(definition.trigger.config.keyword);
  const rawMatchType = definition.trigger.config.matchType;
  const matchType: WhatsAppMessageCoreMatchType | null = rawMatchType === 'exact' || rawMatchType === 'contains'
    ? rawMatchType
    : null;
  if (!keyword || !matchType) return null;
  const keywordNormalized = normalizeWhatsAppAutomationText(keyword);
  if (!keywordNormalized) return null;
  return { keywordNormalized, matchType };
}

export async function prepareWhatsAppMessageCoreAutomation(input: {
  tenantId: string;
  text: string;
}): Promise<PreparedWhatsAppMessageCoreAutomation | null> {
  const normalizedMessage = normalizeWhatsAppAutomationText(input.text);
  if (!normalizedMessage) return null;

  const definitions = await listEnabledAutomationDefinitionsByTrigger({
    tenantId: input.tenantId,
    triggerType: WHATSAPP_MESSAGE_KEYWORD_TRIGGER,
  });

  for (const definition of definitions) {
    const trigger = parseTriggerConfig(definition);
    if (!trigger) continue;
    if (!whatsappMessageAutomationMatches({
      normalizedMessage,
      normalizedKeyword: trigger.keywordNormalized,
      matchType: trigger.matchType,
    })) continue;

    return {
      definition,
      keywordNormalized: trigger.keywordNormalized,
      matchType: trigger.matchType,
    };
  }

  return null;
}

export async function enqueueWhatsAppMessageCoreAutomation(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    sourceEventKey: string;
    sourceMessageId: string;
    conversationId: string;
    messageText: string;
    prepared: PreparedWhatsAppMessageCoreAutomation;
  },
) {
  const sourceEventKey = input.sourceEventKey.trim();
  const sourceMessageId = input.sourceMessageId.trim();
  const conversationId = input.conversationId.trim();
  const messageText = input.messageText.trim();
  if (!sourceEventKey || !sourceMessageId || !conversationId || !messageText) {
    throw new Error('WhatsApp message automation source is invalid');
  }

  return enqueueAutomationExecution(tx, {
    tenantId: input.tenantId,
    definition: input.prepared.definition,
    sourceEventKey,
    executionInput: {
      sourceMessageId,
      conversationId,
      messageText,
      keywordNormalized: input.prepared.keywordNormalized,
      matchType: input.prepared.matchType,
    },
  });
}
