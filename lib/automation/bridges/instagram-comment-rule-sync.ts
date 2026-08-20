import 'server-only';

import { Prisma } from '@prisma/client';
import { upsertAutomationDefinitionMirrorInTransaction } from '../definition-store';

const INSTAGRAM_COMMENT_KEYWORD_TRIGGER = 'instagram.comment.keyword';
const INSTAGRAM_PRIVATE_REPLY_ACTION = 'instagram.private_reply';
const INSTAGRAM_PRIVATE_REPLY_ACTION_ID = 'private-reply';

type InstagramCommentRuleMirrorInput = {
  tenantId: string;
  userId: string;
  ruleId: string;
  name: string;
  keyword: string;
  matchType: 'exact' | 'contains';
  replyText: string;
  enabled: boolean;
  orderIndex: number;
};

/**
 * Mirrors the client-facing Instagram comment rule into Automation Core v1.
 * The legacy rule remains the active runtime source until an explicit cutover.
 */
export async function syncInstagramCommentAutomationRuleToCore(
  tx: Prisma.TransactionClient,
  input: InstagramCommentRuleMirrorInput,
) {
  return upsertAutomationDefinitionMirrorInTransaction(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    definitionId: input.ruleId,
    name: input.name,
    enabled: input.enabled,
    orderIndex: input.orderIndex,
    trigger: {
      type: INSTAGRAM_COMMENT_KEYWORD_TRIGGER,
      config: {
        keyword: input.keyword,
        matchType: input.matchType,
        sourceRuleId: input.ruleId,
      },
    },
    actions: [
      {
        id: INSTAGRAM_PRIVATE_REPLY_ACTION_ID,
        type: INSTAGRAM_PRIVATE_REPLY_ACTION,
        config: {
          replyText: input.replyText,
          sourceRuleId: input.ruleId,
        },
      },
    ],
  });
}
