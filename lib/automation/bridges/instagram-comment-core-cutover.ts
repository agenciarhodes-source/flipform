import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import {
  instagramCommentAutomationMatches,
  listInstagramCommentAutomations,
  normalizeInstagramCommentAutomationText,
} from '@/lib/meta/instagram-comment-automation';
import {
  AUTOMATION_DEFINITION_ENTITY_TYPE,
} from '../definition-store';
import {
  INSTAGRAM_COMMENT_KEYWORD_TRIGGER,
  INSTAGRAM_PRIVATE_REPLY_ACTION,
  type PreparedInstagramCommentCoreAutomation,
} from '../adapters/instagram-comment';
import type { AutomationDefinitionSnapshot } from '../types';
import { syncInstagramCommentAutomationRuleToCore } from './instagram-comment-rule-sync';

const INSTAGRAM_PRIVATE_REPLY_ACTION_ID = 'private-reply';

type LegacyRule = Awaited<ReturnType<typeof listInstagramCommentAutomations>>[number];

type MirrorRecord = {
  id: string;
  userId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mirrorMatchesRule(record: MirrorRecord, rule: LegacyRule) {
  const raw = asObject(record.metadata);
  const versionNumber = raw?.versionNumber;
  const trigger = asObject(raw?.trigger);
  const triggerConfig = asObject(trigger?.config);
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];
  const action = asObject(actions[0]);
  const actionConfig = asObject(action?.config);

  return (
    typeof versionNumber === 'number'
    && Number.isInteger(versionNumber)
    && versionNumber > 0
    && raw?.name === rule.name
    && raw.enabled === rule.enabled
    && raw.orderIndex === rule.orderIndex
    && trigger?.type === INSTAGRAM_COMMENT_KEYWORD_TRIGGER
    && triggerConfig?.keyword === rule.keyword
    && triggerConfig?.matchType === rule.matchType
    && triggerConfig?.sourceRuleId === rule.id
    && actions.length === 1
    && action?.id === INSTAGRAM_PRIVATE_REPLY_ACTION_ID
    && action.type === INSTAGRAM_PRIVATE_REPLY_ACTION
    && actionConfig?.replyText === rule.replyText
    && actionConfig?.sourceRuleId === rule.id
  );
}

function snapshotFromMirror(record: MirrorRecord, rule: LegacyRule): AutomationDefinitionSnapshot {
  const raw = asObject(record.metadata)!;
  return {
    id: rule.id,
    versionId: record.id,
    versionNumber: raw.versionNumber as number,
    configuredByUserId: record.userId,
    name: rule.name,
    enabled: rule.enabled,
    orderIndex: rule.orderIndex,
    trigger: {
      type: INSTAGRAM_COMMENT_KEYWORD_TRIGGER,
      config: {
        keyword: rule.keyword,
        matchType: rule.matchType,
        sourceRuleId: rule.id,
      },
    },
    actions: [
      {
        id: INSTAGRAM_PRIVATE_REPLY_ACTION_ID,
        type: INSTAGRAM_PRIVATE_REPLY_ACTION,
        config: {
          replyText: rule.replyText,
          sourceRuleId: rule.id,
        },
      },
    ],
    updatedAt: record.createdAt,
  };
}

async function fallbackAutomationActor(tx: Prisma.TransactionClient, tenantId: string) {
  const memberships = await tx.tenantUser.findMany({
    where: { tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => can(membership.role, 'INTEGRATIONS_EDIT'))?.userId || null;
}

async function ensureRuleMirror(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; rule: LegacyRule },
): Promise<AutomationDefinitionSnapshot | null> {
  await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE`;

  const current = await tx.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: AUTOMATION_DEFINITION_ENTITY_TYPE,
      entityId: input.rule.id,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, userId: true, metadata: true, createdAt: true },
  });

  if (current && mirrorMatchesRule(current, input.rule)) {
    return snapshotFromMirror(current, input.rule);
  }

  const userId = input.rule.configuredByUserId
    || await fallbackAutomationActor(tx, input.tenantId);
  if (!userId) return null;

  return syncInstagramCommentAutomationRuleToCore(tx, {
    tenantId: input.tenantId,
    userId,
    ruleId: input.rule.id,
    name: input.rule.name,
    keyword: input.rule.keyword,
    matchType: input.rule.matchType,
    replyText: input.rule.replyText,
    enabled: input.rule.enabled,
    orderIndex: input.rule.orderIndex,
  });
}

export async function prepareInstagramCommentCoreCutover(input: {
  tenantId: string;
  text: string;
}): Promise<PreparedInstagramCommentCoreAutomation | null> {
  const normalizedComment = normalizeInstagramCommentAutomationText(input.text);
  if (!normalizedComment) return null;

  const rules = await listInstagramCommentAutomations(input.tenantId);
  const rule = rules.find(candidate => (
    candidate.enabled
    && instagramCommentAutomationMatches({
      normalizedComment,
      normalizedKeyword: candidate.keywordNormalized,
      matchType: candidate.matchType,
    })
  ));
  if (!rule) return null;

  const definition = await prisma.$transaction(tx => ensureRuleMirror(tx, {
    tenantId: input.tenantId,
    rule,
  }));
  if (!definition) return null;

  return {
    definition,
    keywordNormalized: rule.keywordNormalized,
    matchType: rule.matchType,
  };
}
