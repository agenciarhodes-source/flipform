import 'server-only';

import { Prisma } from '@prisma/client';
import { listEnabledAutomationDefinitionsByTrigger } from '../definition-store';
import { enqueueAutomationExecution } from '../execution-engine';
import type { AutomationDefinitionSnapshot } from '../types';

export const INSTAGRAM_MESSAGE_KEYWORD_TRIGGER = 'instagram.message.keyword';
export const INSTAGRAM_SEND_TEXT_ACTION = 'instagram.send_text';

export type InstagramMessageCoreMatchType = 'exact' | 'contains';

type ParsedInstagramMessageTrigger = {
  keywordNormalized: string;
  matchType: InstagramMessageCoreMatchType;
};

export type PreparedInstagramMessageCoreAutomation = {
  definition: AutomationDefinitionSnapshot;
  keywordNormalized: string;
  matchType: InstagramMessageCoreMatchType;
};

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeInstagramMessageAutomationText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function instagramMessageAutomationMatches(input: {
  normalizedMessage: string;
  normalizedKeyword: string;
  matchType: InstagramMessageCoreMatchType;
}) {
  if (!input.normalizedMessage || !input.normalizedKeyword) return false;
  if (input.matchType === 'exact') return input.normalizedMessage === input.normalizedKeyword;
  return ` ${input.normalizedMessage} `.includes(` ${input.normalizedKeyword} `);
}

function parseTriggerConfig(
  definition: AutomationDefinitionSnapshot,
): ParsedInstagramMessageTrigger | null {
  if (definition.trigger.type !== INSTAGRAM_MESSAGE_KEYWORD_TRIGGER) return null;
  const keyword = stringField(definition.trigger.config.keyword);
  const rawMatchType = definition.trigger.config.matchType;
  const matchType: InstagramMessageCoreMatchType | null = rawMatchType === 'exact' || rawMatchType === 'contains'
    ? rawMatchType
    : null;
  if (!keyword || !matchType) return null;
  const keywordNormalized = normalizeInstagramMessageAutomationText(keyword);
  if (!keywordNormalized) return null;
  return { keywordNormalized, matchType };
}

export async function prepareInstagramMessageCoreAutomation(input: {
  tenantId: string;
  text: string;
}): Promise<PreparedInstagramMessageCoreAutomation | null> {
  const normalizedMessage = normalizeInstagramMessageAutomationText(input.text);
  if (!normalizedMessage) return null;

  const definitions = await listEnabledAutomationDefinitionsByTrigger({
    tenantId: input.tenantId,
    triggerType: INSTAGRAM_MESSAGE_KEYWORD_TRIGGER,
  });

  for (const definition of definitions) {
    const trigger = parseTriggerConfig(definition);
    if (!trigger) continue;
    if (!instagramMessageAutomationMatches({
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

export async function enqueueInstagramMessageCoreAutomation(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    sourceEventKey: string;
    sourceMessageId: string;
    conversationId: string;
    messageText: string;
    prepared: PreparedInstagramMessageCoreAutomation;
  },
) {
  const sourceEventKey = input.sourceEventKey.trim();
  const sourceMessageId = input.sourceMessageId.trim();
  const conversationId = input.conversationId.trim();
  const messageText = input.messageText.trim();
  if (!sourceEventKey || !sourceMessageId || !conversationId || !messageText) {
    throw new Error('Instagram message automation source is invalid');
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
