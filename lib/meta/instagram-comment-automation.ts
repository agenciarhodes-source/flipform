import 'server-only';

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { syncInstagramCommentAutomationRuleToCore } from '@/lib/automation/bridges/instagram-comment-rule-sync';
import {
  enqueueAndDispatchInstagramPrivateReply,
  InstagramPrivateReplyError,
} from '@/lib/meta/instagram-private-reply';

const AUTOMATION_ENTITY_TYPE = 'instagram_comment_automation';
const AUTOMATION_CREATED_ACTION = 'INSTAGRAM_COMMENT_AUTOMATION_CREATED';
const AUTOMATION_UPDATED_ACTION = 'INSTAGRAM_COMMENT_AUTOMATION_UPDATED';
const AUTOMATION_JOB_PROVIDER = 'instagram_comment_automation';
const AUTOMATION_JOB_SOURCE = 'flipform_instagram_comment_automation';
const COMMENT_PROVIDER = 'instagram_comment';
const PROCESSING_LEASE_MS = 2 * 60_000;
const MAX_INTERNAL_ATTEMPTS = 3;
const WORKER_BATCH_SIZE = 5;

export type InstagramCommentAutomationMatchType = 'exact' | 'contains';

type AutomationRuleSnapshot = {
  id: string;
  versionId: string;
  versionNumber: number;
  configuredByUserId: string | null;
  name: string;
  orderIndex: number;
  keyword: string;
  keywordNormalized: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  enabled: boolean;
  updatedAt: Date;
};

export type PreparedInstagramCommentAutomation = {
  ruleId: string;
  ruleVersionId: string;
  keywordNormalized: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  configuredByUserId: string | null;
};

type AutomationJobState = 'queued' | 'processing' | 'sent' | 'failed' | 'delivery_unknown' | 'skipped';

type AutomationJobMetadata = {
  source: typeof AUTOMATION_JOB_SOURCE;
  ruleId: string;
  ruleVersionId: string;
  sourceCommentEventId: string;
  keywordNormalized: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  configuredByUserId?: string;
  state: AutomationJobState;
  attempts: number;
  attemptStartedAt?: string;
  completedAt?: string;
  outcome?: string;
  privateReplyEventId?: string;
  providerMessageId?: string;
  lastErrorCode?: string;
};

export class InstagramCommentAutomationError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'InstagramCommentAutomationError';
  }
}

function asObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerField(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function toJson(value: Record<string, unknown> | AutomationJobMetadata): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function parseRuleSnapshot(record: {
  id: string;
  entityId: string;
  userId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): AutomationRuleSnapshot | null {
  const raw = asObject(record.metadata);
  const versionNumber = integerField(raw.versionNumber);
  const name = stringField(raw.name);
  const keyword = stringField(raw.keyword);
  const keywordNormalized = stringField(raw.keywordNormalized);
  const matchType = raw.matchType === 'exact' || raw.matchType === 'contains' ? raw.matchType : null;
  const replyText = stringField(raw.replyText);
  const orderIndex = integerField(raw.orderIndex);
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : null;
  if (
    versionNumber === null || versionNumber < 1
    || !name || !keyword || !keywordNormalized || !matchType || !replyText
    || orderIndex === null || enabled === null
  ) return null;

  return {
    id: record.entityId,
    versionId: record.id,
    versionNumber,
    configuredByUserId: record.userId,
    name,
    orderIndex,
    keyword,
    keywordNormalized,
    matchType,
    replyText,
    enabled,
    updatedAt: record.createdAt,
  };
}

function parseJobMetadata(value: Prisma.JsonValue | null | undefined): AutomationJobMetadata | null {
  const raw = asObject(value);
  if (raw.source !== AUTOMATION_JOB_SOURCE) return null;
  if (
    typeof raw.ruleId !== 'string'
    || typeof raw.ruleVersionId !== 'string'
    || typeof raw.sourceCommentEventId !== 'string'
    || typeof raw.keywordNormalized !== 'string'
    || (raw.matchType !== 'exact' && raw.matchType !== 'contains')
    || typeof raw.replyText !== 'string'
    || typeof raw.state !== 'string'
    || typeof raw.attempts !== 'number'
  ) return null;
  return raw as unknown as AutomationJobMetadata;
}

export function normalizeInstagramCommentAutomationText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function instagramCommentAutomationMatches(input: {
  normalizedComment: string;
  normalizedKeyword: string;
  matchType: InstagramCommentAutomationMatchType;
}) {
  if (!input.normalizedComment || !input.normalizedKeyword) return false;
  if (input.matchType === 'exact') return input.normalizedComment === input.normalizedKeyword;
  return ` ${input.normalizedComment} `.includes(` ${input.normalizedKeyword} `);
}

function validateRuleFields(input: {
  name: string;
  keyword: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  orderIndex: number;
}) {
  const name = input.name.trim();
  const keyword = input.keyword.trim();
  const keywordNormalized = normalizeInstagramCommentAutomationText(keyword);
  const replyText = input.replyText.trim();
  if (!name || name.length > 120) {
    throw new InstagramCommentAutomationError('INVALID_REQUEST', 'Automation name is invalid');
  }
  if (!keyword || keyword.length > 160 || !keywordNormalized) {
    throw new InstagramCommentAutomationError('INVALID_REQUEST', 'Automation keyword is invalid');
  }
  if (!replyText || replyText.length > 4096) {
    throw new InstagramCommentAutomationError('INVALID_REQUEST', 'Automation reply is invalid');
  }
  if (!Number.isInteger(input.orderIndex) || input.orderIndex < 0 || input.orderIndex > 10000) {
    throw new InstagramCommentAutomationError('INVALID_REQUEST', 'Automation order is invalid');
  }
  return { name, keyword, keywordNormalized, replyText };
}

async function loadLatestRules(tx: Prisma.TransactionClient, tenantId: string) {
  const records = await tx.auditLog.findMany({
    where: {
      tenantId,
      entityType: AUTOMATION_ENTITY_TYPE,
      action: { in: [AUTOMATION_CREATED_ACTION, AUTOMATION_UPDATED_ACTION] },
    },
    select: { id: true, entityId: true, userId: true, metadata: true, createdAt: true },
  });

  const latest = new Map<string, AutomationRuleSnapshot>();
  for (const record of records) {
    const parsed = parseRuleSnapshot(record);
    if (!parsed) continue;
    const current = latest.get(parsed.id);
    if (!current || parsed.versionNumber > current.versionNumber) latest.set(parsed.id, parsed);
  }

  const rules = [...latest.values()];
  rules.sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id));
  return rules;
}

function ruleMetadata(input: {
  versionNumber: number;
  name: string;
  orderIndex: number;
  keyword: string;
  keywordNormalized: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  enabled: boolean;
}) {
  return {
    versionNumber: input.versionNumber,
    name: input.name,
    orderIndex: input.orderIndex,
    keyword: input.keyword,
    keywordNormalized: input.keywordNormalized,
    matchType: input.matchType,
    replyText: input.replyText,
    enabled: input.enabled,
  };
}

function assertNoRuleConflict(rules: AutomationRuleSnapshot[], input: {
  keywordNormalized: string;
  matchType: InstagramCommentAutomationMatchType;
  exceptRuleId?: string;
}) {
  const conflict = rules.some(rule => (
    rule.id !== input.exceptRuleId
    && rule.keywordNormalized === input.keywordNormalized
    && rule.matchType === input.matchType
  ));
  if (conflict) {
    throw new InstagramCommentAutomationError('CONFLICT', 'An automation already uses this keyword and match type');
  }
}

export async function listInstagramCommentAutomations(tenantId: string) {
  return prisma.$transaction(tx => loadLatestRules(tx, tenantId));
}

export async function createInstagramCommentAutomation(input: {
  tenantId: string;
  userId: string;
  name: string;
  keyword: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
}) {
  const fields = validateRuleFields(input);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE`;
    const rules = await loadLatestRules(tx, input.tenantId);
    assertNoRuleConflict(rules, {
      keywordNormalized: fields.keywordNormalized,
      matchType: input.matchType,
    });

    const ruleId = randomUUID();
    const versionNumber = 1;
    const log = await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: AUTOMATION_ENTITY_TYPE,
        entityId: ruleId,
        action: AUTOMATION_CREATED_ACTION,
        metadata: ruleMetadata({
          versionNumber,
          ...fields,
          orderIndex: input.orderIndex,
          matchType: input.matchType,
          enabled: input.enabled,
        }),
      },
      select: { id: true, createdAt: true },
    });

    await syncInstagramCommentAutomationRuleToCore(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      ruleId,
      name: fields.name,
      keyword: fields.keyword,
      matchType: input.matchType,
      replyText: fields.replyText,
      enabled: input.enabled,
      orderIndex: input.orderIndex,
    });

    return {
      id: ruleId,
      versionId: log.id,
      versionNumber,
      configuredByUserId: input.userId,
      ...fields,
      orderIndex: input.orderIndex,
      matchType: input.matchType,
      enabled: input.enabled,
      updatedAt: log.createdAt,
    } satisfies AutomationRuleSnapshot;
  });
}

export async function updateInstagramCommentAutomation(input: {
  tenantId: string;
  userId: string;
  ruleId: string;
  name: string;
  keyword: string;
  matchType: InstagramCommentAutomationMatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
}) {
  const fields = validateRuleFields(input);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE`;
    const rules = await loadLatestRules(tx, input.tenantId);
    const current = rules.find(rule => rule.id === input.ruleId);
    if (!current) throw new InstagramCommentAutomationError('NOT_FOUND', 'Automation not found');
    assertNoRuleConflict(rules, {
      keywordNormalized: fields.keywordNormalized,
      matchType: input.matchType,
      exceptRuleId: input.ruleId,
    });

    const versionNumber = current.versionNumber + 1;
    const log = await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        entityType: AUTOMATION_ENTITY_TYPE,
        entityId: input.ruleId,
        action: AUTOMATION_UPDATED_ACTION,
        metadata: ruleMetadata({
          versionNumber,
          ...fields,
          orderIndex: input.orderIndex,
          matchType: input.matchType,
          enabled: input.enabled,
        }),
      },
      select: { id: true, createdAt: true },
    });

    await syncInstagramCommentAutomationRuleToCore(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      ruleId: input.ruleId,
      name: fields.name,
      keyword: fields.keyword,
      matchType: input.matchType,
      replyText: fields.replyText,
      enabled: input.enabled,
      orderIndex: input.orderIndex,
    });

    return {
      id: input.ruleId,
      versionId: log.id,
      versionNumber,
      configuredByUserId: input.userId,
      ...fields,
      orderIndex: input.orderIndex,
      matchType: input.matchType,
      enabled: input.enabled,
      updatedAt: log.createdAt,
    } satisfies AutomationRuleSnapshot;
  });
}

export async function prepareInstagramCommentAutomationForComment(input: {
  tenantId: string;
  text: string;
}): Promise<PreparedInstagramCommentAutomation | null> {
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

  return {
    ruleId: rule.id,
    ruleVersionId: rule.versionId,
    keywordNormalized: rule.keywordNormalized,
    matchType: rule.matchType,
    replyText: rule.replyText,
    configuredByUserId: rule.configuredByUserId,
  };
}

export async function createInstagramCommentAutomationJob(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    sourceCommentEventId: string;
    prepared: PreparedInstagramCommentAutomation;
  },
) {
  const metadata: AutomationJobMetadata = {
    source: AUTOMATION_JOB_SOURCE,
    ruleId: input.prepared.ruleId,
    ruleVersionId: input.prepared.ruleVersionId,
    sourceCommentEventId: input.sourceCommentEventId,
    keywordNormalized: input.prepared.keywordNormalized,
    matchType: input.prepared.matchType,
    replyText: input.prepared.replyText,
    ...(input.prepared.configuredByUserId
      ? { configuredByUserId: input.prepared.configuredByUserId }
      : {}),
    state: 'queued',
    attempts: 0,
  };

  return tx.webhookEvent.create({
    data: {
      provider: AUTOMATION_JOB_PROVIDER,
      eventId: input.sourceCommentEventId,
      eventType: 'keyword_private_reply',
      tenantId: input.tenantId,
      rawPayload: toJson(metadata),
    },
    select: { id: true },
  });
}

type LockedAutomationJob = {
  id: string;
  tenant_id: string | null;
  raw_payload: Prisma.JsonValue | null;
};

function processingLeaseIsStale(metadata: AutomationJobMetadata, now = Date.now()) {
  if (!metadata.attemptStartedAt) return true;
  const startedAt = new Date(metadata.attemptStartedAt).getTime();
  return !Number.isFinite(startedAt) || now - startedAt >= PROCESSING_LEASE_MS;
}

async function claimAutomationJobs() {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<LockedAutomationJob[]>`
      SELECT id, tenant_id, raw_payload
      FROM public.webhook_events
      WHERE provider = ${AUTOMATION_JOB_PROVIDER}
        AND processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${WORKER_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    const claimed: Array<{ id: string; tenantId: string; metadata: AutomationJobMetadata }> = [];
    for (const row of rows) {
      const metadata = parseJobMetadata(row.raw_payload);
      if (!row.tenant_id || !metadata) {
        await tx.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
        continue;
      }
      if (metadata.state === 'processing' && !processingLeaseIsStale(metadata)) continue;
      if (metadata.state !== 'queued' && metadata.state !== 'processing') {
        await tx.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
        continue;
      }

      const nextMetadata: AutomationJobMetadata = {
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

async function findAuthorizedAutomationActor(input: {
  tenantId: string;
  preferredUserId?: string;
}) {
  if (input.preferredUserId) {
    const preferred = await prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, userId: input.preferredUserId, status: 'active' },
      select: { userId: true, role: true },
    });
    if (preferred && can(preferred.role, 'INTEGRATIONS_EDIT')) return preferred;
  }

  const memberships = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, role: true },
  });
  return memberships.find(membership => can(membership.role, 'INTEGRATIONS_EDIT')) || null;
}

async function currentRule(tenantId: string, ruleId: string) {
  const rules = await listInstagramCommentAutomations(tenantId);
  return rules.find(rule => rule.id === ruleId) || null;
}

async function finalizeAutomationJob(input: {
  jobId: string;
  metadata: AutomationJobMetadata;
  state: 'sent' | 'failed' | 'delivery_unknown' | 'skipped';
  outcome: string;
  privateReplyEventId?: string;
  providerMessageId?: string;
  lastErrorCode?: string;
}) {
  const nextMetadata: AutomationJobMetadata = {
    ...input.metadata,
    state: input.state,
    completedAt: new Date().toISOString(),
    outcome: input.outcome,
    ...(input.privateReplyEventId ? { privateReplyEventId: input.privateReplyEventId } : {}),
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    ...(input.lastErrorCode ? { lastErrorCode: input.lastErrorCode } : {}),
  };
  await prisma.webhookEvent.update({
    where: { id: input.jobId },
    data: { rawPayload: toJson(nextMetadata), processedAt: new Date() },
  });
}

async function releaseAutomationJob(input: {
  jobId: string;
  metadata: AutomationJobMetadata;
  lastErrorCode: string;
}) {
  const { attemptStartedAt: _attemptStartedAt, ...rest } = input.metadata;
  const nextMetadata: AutomationJobMetadata = {
    ...rest,
    state: 'queued',
    lastErrorCode: input.lastErrorCode,
  };
  await prisma.webhookEvent.update({
    where: { id: input.jobId },
    data: { rawPayload: toJson(nextMetadata) },
  });
}

async function processClaimedAutomationJob(job: {
  id: string;
  tenantId: string;
  metadata: AutomationJobMetadata;
}) {
  const rule = await currentRule(job.tenantId, job.metadata.ruleId);
  if (!rule || !rule.enabled || rule.versionId !== job.metadata.ruleVersionId) {
    await finalizeAutomationJob({
      jobId: job.id,
      metadata: job.metadata,
      state: 'skipped',
      outcome: !rule ? 'rule_missing' : !rule.enabled ? 'rule_disabled' : 'rule_version_changed',
    });
    return 'skipped';
  }

  const source = await prisma.webhookEvent.findFirst({
    where: {
      id: job.metadata.sourceCommentEventId,
      tenantId: job.tenantId,
      provider: COMMENT_PROVIDER,
      eventType: 'comments',
    },
    select: { id: true },
  });
  if (!source) {
    await finalizeAutomationJob({
      jobId: job.id,
      metadata: job.metadata,
      state: 'skipped',
      outcome: 'source_comment_missing_or_ineligible',
    });
    return 'skipped';
  }

  const actor = await findAuthorizedAutomationActor({
    tenantId: job.tenantId,
    preferredUserId: rule.configuredByUserId || job.metadata.configuredByUserId,
  });
  if (!actor) {
    await finalizeAutomationJob({
      jobId: job.id,
      metadata: job.metadata,
      state: 'skipped',
      outcome: 'no_authorized_actor',
    });
    return 'skipped';
  }

  try {
    const result = await enqueueAndDispatchInstagramPrivateReply({
      tenantId: job.tenantId,
      sourceCommentEventId: source.id,
      requestedByUserId: actor.userId,
      text: job.metadata.replyText,
      idempotencyKey: `automation:${job.metadata.ruleId}:${source.id}`,
    });

    if (result.status === 'in_progress') {
      await releaseAutomationJob({
        jobId: job.id,
        metadata: job.metadata,
        lastErrorCode: 'PRIVATE_REPLY_IN_PROGRESS',
      });
      return 'deferred';
    }

    await finalizeAutomationJob({
      jobId: job.id,
      metadata: job.metadata,
      state: result.status,
      outcome: `private_reply_${result.status}`,
      privateReplyEventId: result.eventId,
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    });
    return result.status;
  } catch (error) {
    if (error instanceof InstagramPrivateReplyError) {
      if (error.code === 'ALREADY_REPLIED') {
        await finalizeAutomationJob({
          jobId: job.id,
          metadata: job.metadata,
          state: 'skipped',
          outcome: 'private_reply_already_attempted',
          lastErrorCode: error.code,
        });
        return 'skipped';
      }
      await finalizeAutomationJob({
        jobId: job.id,
        metadata: job.metadata,
        state: 'failed',
        outcome: 'private_reply_rejected_before_or_during_dispatch',
        lastErrorCode: error.code,
      });
      return 'failed';
    }

    if (job.metadata.attempts >= MAX_INTERNAL_ATTEMPTS) {
      await finalizeAutomationJob({
        jobId: job.id,
        metadata: job.metadata,
        state: 'failed',
        outcome: 'internal_retry_limit',
        lastErrorCode: 'INTERNAL_ERROR',
      });
      return 'failed';
    }

    await releaseAutomationJob({
      jobId: job.id,
      metadata: job.metadata,
      lastErrorCode: 'INTERNAL_ERROR',
    });
    return 'deferred';
  }
}

export async function drainInstagramCommentAutomationQueue() {
  const jobs = await claimAutomationJobs();
  const outcomes = await Promise.allSettled(jobs.map(processClaimedAutomationJob));
  return outcomes.reduce((summary, outcome) => {
    if (outcome.status === 'rejected') {
      summary.errors += 1;
      return summary;
    }
    if (outcome.value === 'sent') summary.sent += 1;
    else if (outcome.value === 'delivery_unknown') summary.deliveryUnknown += 1;
    else if (outcome.value === 'failed') summary.failed += 1;
    else if (outcome.value === 'skipped') summary.skipped += 1;
    else summary.deferred += 1;
    return summary;
  }, {
    claimed: jobs.length,
    sent: 0,
    deliveryUnknown: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
    errors: 0,
  });
}
