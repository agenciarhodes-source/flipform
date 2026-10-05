import 'server-only';

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isValidBrazilianPhone } from '@/lib/leads';
import { dispatchFlipAiQualifiedLeadTracking } from '@/lib/tracking';
import { classifyBrainAssessment, type BrainAssessment } from './brain-profiles';
import type { PublicFlipAiRuntime } from './public-agent';

const QUALIFICATION_DISPATCH_STALE_MS = 2 * 60_000;

export const flipAiFinalQualificationSchema = z.object({
  classification: z.enum(['qualified', 'nurture', 'disqualified', 'insufficient']),
  fitScore: z.number().int().min(0).max(100),
  intentScore: z.number().int().min(0).max(100),
  awarenessLevel: z.number().int().min(1).max(5),
  journeyStage: z.enum(['discovery', 'consideration', 'decision']),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(4_000),
  reasons: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  nextAction: z.string().trim().min(1).max(1_000),
}).strict();

export type FlipAiFinalQualification = z.infer<typeof flipAiFinalQualificationSchema>;

// Keep final qualification consistent with the tenant's deterministic rubric.
export function applyBrainFinalQualification(
  qualification: FlipAiFinalQualification | null,
  assessment?: BrainAssessment,
): FlipAiFinalQualification | null {
  if (!qualification || !assessment) return qualification;
  const complete = assessment.status === 'complete' && assessment.score !== null;
  const score = assessment.score ?? 0;
  return {
    ...qualification,
    classification: classifyBrainAssessment(assessment),
    fitScore: score,
    confidence: complete ? Math.min(assessment.confidence, ...assessment.criteria.map((item) => item.confidence)) : 0,
    reasons: [
      `Perfil: ${assessment.profileLabel || 'ainda não identificado'}.`,
      ...assessment.criteria.map((item) => `${item.label}: ${item.interpretation || 'ainda não confirmado'}.`),
    ].slice(0, 10),
  };
}

type LockedConversation = {
  id: string;
  lead_id: string | null;
};

function publicQualification(row: {
  id: string;
  classification: string;
  fitScore: number;
  intentScore: number;
  awarenessLevel: number;
  journeyStage: string;
  confidence: number;
  summary: string;
  reasons: string[];
  nextAction: string;
}) {
  return {
    id: row.id,
    classification: row.classification,
    fitScore: row.fitScore,
    intentScore: row.intentScore,
    awarenessLevel: row.awarenessLevel,
    journeyStage: row.journeyStage,
    confidence: row.confidence,
    summary: row.summary,
    reasons: row.reasons,
    nextAction: row.nextAction,
  };
}

async function dispatchQualifiedLeadOnce(input: {
  qualificationId: string;
  tenantId: string;
  conversationId: string;
  eventId: string;
}) {
  const claimed = await prisma.flipAiQualification.updateMany({
    where: {
      id: input.qualificationId,
      tenantId: input.tenantId,
      qualifiedLeadTrackingStatus: 'pending',
    },
    data: { qualifiedLeadTrackingStatus: 'processing' },
  });
  if (claimed.count !== 1) return;

  try {
    const qualification = await prisma.flipAiQualification.findFirst({
      where: { id: input.qualificationId, tenantId: input.tenantId },
      select: {
        leadId: true,
        lead: {
          select: {
            tenantId: true,
            pipelineId: true,
            stageId: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    if (!qualification?.leadId || qualification.lead?.tenantId !== input.tenantId
      || !qualification.lead.name.trim() || !qualification.lead.phone
      || !isValidBrazilianPhone(qualification.lead.phone)) {
      await prisma.flipAiQualification.updateMany({
        where: { id: input.qualificationId, tenantId: input.tenantId, qualifiedLeadTrackingStatus: 'processing' },
        data: { qualifiedLeadTrackingStatus: 'ambiguous', qualifiedLeadDispatchedAt: new Date() },
      });
      return;
    }

    const results = await dispatchFlipAiQualifiedLeadTracking({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      leadId: qualification.leadId,
      pipelineId: qualification.lead.pipelineId,
      toStageId: qualification.lead.stageId,
      source: 'flip_ai',
      lead: {
        name: qualification.lead.name,
        email: qualification.lead.email,
        phone: qualification.lead.phone,
      },
      metaQualifiedLeadEventId: input.eventId,
      metaRequestTimeoutMs: 8_000,
    });
    const meta = results.filter((result) => result.provider === 'meta');
    const status = meta.some((result) => result.status === 'sent')
      ? 'sent'
      : meta.some((result) => result.status === 'failed')
        ? 'ambiguous'
        : 'skipped';
    await prisma.flipAiQualification.updateMany({
      where: { id: input.qualificationId, tenantId: input.tenantId, qualifiedLeadTrackingStatus: 'processing' },
      data: { qualifiedLeadTrackingStatus: status, qualifiedLeadDispatchedAt: new Date() },
    });
  } catch {
    // The request may have reached the provider. Mark ambiguous and never retry blindly.
    await prisma.flipAiQualification.updateMany({
      where: { id: input.qualificationId, tenantId: input.tenantId, qualifiedLeadTrackingStatus: 'processing' },
      data: { qualifiedLeadTrackingStatus: 'ambiguous', qualifiedLeadDispatchedAt: new Date() },
    }).catch(() => undefined);
  }
}

export async function finalizeFlipAiQualification(input: {
  runtime: PublicFlipAiRuntime;
  conversationId: string;
  decision: FlipAiFinalQualification | null;
  model: string;
  evidenceMessageIds: string[];
}) {
  if (!input.decision) return null;
  const parsed = flipAiFinalQualificationSchema.safeParse(input.decision);
  if (!parsed.success) return null;

  const stored = await prisma.$transaction(async (db) => {
    const locked = await db.$queryRaw<LockedConversation[]>(Prisma.sql`
      SELECT c.id, c.lead_id
      FROM conversations c
      INNER JOIN flip_ai_conversation_states s
        ON s.tenant_id = c.tenant_id AND s.conversation_id = c.id
      WHERE c.tenant_id = ${input.runtime.tenantId}
        AND c.id = ${input.conversationId}
        AND c.provider = 'flip_ai'
        AND c.channel = 'web'
        AND s.agent_id = ${input.runtime.id}
      FOR UPDATE OF c
    `);
    const conversation = locked[0];
    if (!conversation) return null;

    const existing = await db.flipAiQualification.findFirst({
      where: { tenantId: input.runtime.tenantId, conversationId: input.conversationId },
    });
    if (existing) return existing;

    const evidence = [...new Set(input.evidenceMessageIds)].slice(-20);
    if (!evidence.length) return null;
    const validEvidenceCount = await db.message.count({
      where: {
        tenantId: input.runtime.tenantId,
        conversationId: input.conversationId,
        id: { in: evidence },
        type: 'text',
      },
    });
    if (validEvidenceCount !== evidence.length) return null;

    let leadId: string | null = null;
    if (conversation.lead_id) {
      const lead = await db.lead.findFirst({
        where: { id: conversation.lead_id, tenantId: input.runtime.tenantId },
        select: { id: true, name: true, phone: true },
      });
      if (lead?.name.trim() && lead.phone && isValidBrazilianPhone(lead.phone)) leadId = lead.id;
    }
    if (parsed.data.classification === 'qualified' && !leadId) return null;

    const qualifiedLeadEventId = parsed.data.classification === 'qualified'
      ? `flip-ai-qualified:${input.conversationId}`
      : null;
    const qualification = await db.flipAiQualification.create({
      data: {
        tenantId: input.runtime.tenantId,
        agentId: input.runtime.id,
        conversationId: input.conversationId,
        leadId,
        knowledgeIndexId: input.runtime.knowledgeIndexId,
        classification: parsed.data.classification,
        fitScore: parsed.data.fitScore,
        intentScore: parsed.data.intentScore,
        awarenessLevel: parsed.data.awarenessLevel,
        journeyStage: parsed.data.journeyStage,
        confidence: parsed.data.confidence,
        summary: parsed.data.summary,
        reasons: parsed.data.reasons,
        nextAction: parsed.data.nextAction,
        evidenceMessageIds: evidence,
        model: input.model.slice(0, 200),
        qualifiedLeadEventId,
        qualifiedLeadTrackingStatus: qualifiedLeadEventId ? 'pending' : 'not_applicable',
      },
    });
    await db.flipAiConversationState.updateMany({
      where: {
        tenantId: input.runtime.tenantId,
        agentId: input.runtime.id,
        conversationId: input.conversationId,
      },
      data: { summary: parsed.data.summary, summaryUpdatedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        tenantId: input.runtime.tenantId,
        userId: null,
        entityType: 'flip_ai_qualification',
        entityId: qualification.id,
        action: 'flip_ai.qualification.completed',
        metadata: {
          agentId: input.runtime.id,
          conversationId: input.conversationId,
          leadId,
          classification: parsed.data.classification,
          fitScore: parsed.data.fitScore,
          intentScore: parsed.data.intentScore,
          awarenessLevel: parsed.data.awarenessLevel,
          journeyStage: parsed.data.journeyStage,
          knowledgeIndexId: input.runtime.knowledgeIndexId,
        },
      },
    });
    return qualification;
  });

  if (!stored) return null;
  if (stored.qualifiedLeadEventId && stored.qualifiedLeadTrackingStatus === 'processing'
    && stored.updatedAt.getTime() < Date.now() - QUALIFICATION_DISPATCH_STALE_MS) {
    // A terminated serverless invocation leaves delivery outcome unknown. Close the
    // abandoned claim as ambiguous; never turn a stale lease into an external retry.
    await prisma.flipAiQualification.updateMany({
      where: {
        id: stored.id,
        tenantId: input.runtime.tenantId,
        qualifiedLeadTrackingStatus: 'processing',
        updatedAt: { lt: new Date(Date.now() - QUALIFICATION_DISPATCH_STALE_MS) },
      },
      data: { qualifiedLeadTrackingStatus: 'ambiguous', qualifiedLeadDispatchedAt: new Date() },
    });
  } else if (stored.qualifiedLeadEventId && stored.qualifiedLeadTrackingStatus === 'pending') {
    await dispatchQualifiedLeadOnce({
      qualificationId: stored.id,
      tenantId: input.runtime.tenantId,
      conversationId: input.conversationId,
      eventId: stored.qualifiedLeadEventId,
    });
  }
  return publicQualification(stored);
}
