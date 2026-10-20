import 'server-only';

import { prisma } from '@/lib/prisma';
import { parseFlipAiPilotTenantIds } from '@/lib/flip-ai/pilot-access';
import { ensureLeadFromConversation } from '@/lib/leads/ensure-from-conversation';
import { dispatchFormSubmissionTracking } from '@/lib/tracking';
import { enqueueGoogleConversionEvents } from '@/lib/tracking/google-funnel-outbox';
import { scheduleGoogleConversionDelivery } from '@/lib/tracking/google-funnel-processor';
import type { PublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';

/**
 * Companies where the Flip AI turns a qualified WhatsApp conversation into a lead and tells Meta
 * and Google Ads. A pilot: only the tenants listed in WHATSAPP_AI_LEAD_TENANT_IDS.
 */
export function isWhatsAppAiLeadTenant(tenantId: string, raw = process.env.WHATSAPP_AI_LEAD_TENANT_IDS) {
  const allowlist = parseFlipAiPilotTenantIds(raw);
  return allowlist.valid && allowlist.tenantIds.has(tenantId.toLowerCase());
}

/** The ad a conversation came from (click-to-WhatsApp), as Meta sends it with the first message. */
export type WhatsAppAdReferral = {
  ctwaClid?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
  headline?: string;
  capturedAt: string;
};

export function parseWhatsAppReferral(raw: unknown, now = new Date()): WhatsAppAdReferral | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const text = (key: string, max = 300) => (typeof value[key] === 'string' && value[key] ? String(value[key]).slice(0, max) : undefined);
  const referral: WhatsAppAdReferral = {
    ctwaClid: text('ctwa_clid', 500),
    sourceId: text('source_id', 100),
    sourceType: text('source_type', 40),
    sourceUrl: text('source_url', 500),
    headline: text('headline', 200),
    capturedAt: now.toISOString(),
  };
  return referral.ctwaClid || referral.sourceId ? referral : null;
}

function cleanName(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Called after each AI reply. A qualified conversation becomes a lead once, with the WhatsApp
 * number and name, and a single Lead event goes to Meta and Google Ads. Later, the name the person
 * says they prefer replaces the WhatsApp profile name, while the team has not edited it.
 */
export async function handleWhatsAppAiQualification(input: {
  tenantId: string;
  conversationId: string;
  runtime: PublicFlipAiRuntime;
  classification: string | null | undefined;
  preferredName: string | null | undefined;
  whatsappBusinessAccountId: string | null;
}) {
  if (!isWhatsAppAiLeadTenant(input.tenantId)) return { kind: 'pilot_off' as const };

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId, provider: 'meta', channel: 'whatsapp' },
    select: {
      leadId: true,
      adReferral: true,
      externalContactIdentity: { select: { externalUserId: true, displayName: true } },
    },
  });
  if (!conversation) return { kind: 'conversation_missing' as const };
  const profileName = cleanName(conversation.externalContactIdentity.displayName);
  const preferredName = cleanName(input.preferredName);

  if (conversation.leadId) {
    // Only the name the AI gave from the WhatsApp profile is replaced; a name the team wrote stays.
    if (preferredName && profileName) {
      const renamed = await prisma.lead.updateMany({
        where: { id: conversation.leadId, tenantId: input.tenantId, name: profileName },
        data: { name: preferredName },
      });
      if (renamed.count) {
        await prisma.auditLog.create({
          data: {
            tenantId: input.tenantId, userId: null, entityType: 'lead', entityId: conversation.leadId,
            action: 'lead.whatsapp_ai_renamed', metadata: { agentId: input.runtime.id },
          },
        }).catch(() => undefined);
      }
    }
    return { kind: 'already_lead' as const };
  }

  if (input.classification !== 'qualified') return { kind: 'not_qualified' as const };

  const referral = (conversation.adReferral && typeof conversation.adReferral === 'object'
    ? conversation.adReferral : null) as WhatsAppAdReferral | null;
  const outcome = await ensureLeadFromConversation({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    pipelineId: input.runtime.pipelineId,
    stageId: input.runtime.initialStageId,
    rotationId: input.runtime.rotationId,
    source: referral?.ctwaClid ? 'Anúncio Meta — WhatsApp' : 'WhatsApp',
    temperature: 'warm',
    requireValidPhone: true,
    identity: {
      displayName: preferredName || profileName || null,
      phone: conversation.externalContactIdentity.externalUserId,
    },
    audit: {
      userId: null,
      createdAction: 'lead.whatsapp_ai_created',
      linkedAction: 'lead.whatsapp_ai_linked',
      metadata: { agentId: input.runtime.id, adSourceId: referral?.sourceId || null },
    },
  });
  // An existing lead with this phone is only linked: it is not a new lead, so no event goes out.
  if (outcome.kind !== 'created') return { kind: outcome.kind };

  // The CRM is already committed; tracking failures never undo the lead.
  try {
    await dispatchFormSubmissionTracking({
      tenantId: input.tenantId,
      leadId: outcome.leadId,
      pipelineId: outcome.pipelineId,
      toStageId: outcome.stageId,
      source: 'whatsapp_ai',
      conversationId: input.conversationId,
      lead: { name: outcome.name, phone: outcome.phone },
      metaLeadEventId: `whatsapp-ai-lead:${input.conversationId}`,
      metaAttribution: {
        ctwaClid: referral?.ctwaClid || null,
        whatsappBusinessAccountId: input.whatsappBusinessAccountId,
      },
      metaRequestTimeoutMs: 8_000,
    });
  } catch {
    // The Tracking Hub records its own delivery result.
  }
  try {
    const transition = await prisma.leadStageHistory.findFirst({
      where: { leadId: outcome.leadId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true },
    });
    if (transition) {
      const google = await enqueueGoogleConversionEvents({
        tenantId: input.tenantId,
        leadId: outcome.leadId,
        pipelineId: outcome.pipelineId,
        stageId: outcome.stageId,
        transitionId: transition.id,
        occurredAt: transition.createdAt,
        triggeredById: null,
      });
      if (google.some((event) => event.status === 'queued')) scheduleGoogleConversionDelivery();
    }
  } catch {
    // Google delivery is best-effort and never affects the conversation.
  }
  return { kind: 'created' as const, leadId: outcome.leadId };
}
