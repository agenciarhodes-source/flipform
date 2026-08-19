import 'server-only';

import { Prisma } from '@prisma/client';
import {
  instagramCommentAutomationMatches,
  normalizeInstagramCommentAutomationText,
} from '@/lib/meta/instagram-comment-automation';
import { listEnabledAutomationDefinitionsByTrigger } from '../definition-store';
import { enqueueAutomationExecution } from '../execution-engine';
import type { AutomationDefinitionSnapshot } from '../types';

export const INSTAGRAM_COMMENT_KEYWORD_TRIGGER = 'instagram.comment.keyword';
export const INSTAGRAM_PRIVATE_REPLY_ACTION = 'instagram.private_reply';

export type InstagramCommentCoreMatchType = 'exact' | 'contains';

export type PreparedInstagramCommentCoreAutomation = {
  definition: AutomationDefinitionSnapshot;
  keywordNormalized: string;
  matchType: InstagramCommentCoreMatchType;
};

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseTriggerConfig(definition: AutomationDefinitionSnapshot) {
  if (definition.trigger.type !== INSTAGRAM_COMMENT_KEYWORD_TRIGGER) return null;
  const keyword = stringField(definition.trigger.config.keyword);
  const matchType = definition.trigger.config.matchType === 'exact' || definition.trigger.config.matchType === 'contains'
    ? definition.trigger.config.matchType
    : null;
  if (!keyword || !matchType) return null;
  const keywordNormalized = normalizeInstagramCommentAutomationText(keyword);
  if (!keywordNormalized) return null;
  return { keywordNormalized, matchType };
}

export async function prepareInstagramCommentCoreAutomation(input: {
  tenantId: string;
  text: string;
}): Promise<PreparedInstagramCommentCoreAutomation | null> {
  const normalizedComment = normalizeInstagramCommentAutomationText(input.text);
  if (!normalizedComment) return null;

  const definitions = await listEnabledAutomationDefinitionsByTrigger({
    tenantId: input.tenantId,
    triggerType: INSTAGRAM_COMMENT_KEYWORD_TRIGGER,
  });

  for (const definition of definitions) {
    const trigger = parseTriggerConfig(definition);
    if (!trigger) continue;
    if (!instagramCommentAutomationMatches({
      normalizedComment,
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

export async function enqueueInstagramCommentCoreAutomation(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    sourceEventKey: string;
    sourceCommentEventId: string;
    commentText: string;
    prepared: PreparedInstagramCommentCoreAutomation;
  },
) {
  const sourceEventKey = input.sourceEventKey.trim();
  const sourceCommentEventId = input.sourceCommentEventId.trim();
  const commentText = input.commentText.trim();
  if (!sourceEventKey || !sourceCommentEventId || !commentText) {
    throw new Error('Instagram comment automation source is invalid');
  }

  return enqueueAutomationExecution(tx, {
    tenantId: input.tenantId,
    definition: input.prepared.definition,
    sourceEventKey,
    executionInput: {
      sourceCommentEventId,
      commentText,
      keywordNormalized: input.prepared.keywordNormalized,
      matchType: input.prepared.matchType,
    },
  });
}
