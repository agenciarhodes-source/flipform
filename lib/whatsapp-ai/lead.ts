import 'server-only';

import { prisma } from '@/lib/prisma';
import { parseFlipAiPilotTenantIds } from '@/lib/flip-ai/pilot-access';
import { ensureLeadFromConversation } from '@/lib/leads/ensure-from-conversation';
import { dispatchFormSubmissionTracking } from '@/lib/tracking';
import { enqueueGoogleConversionEvents } from '@/lib/tracking/google-funnel-outbox';
import { scheduleGoogleConversionDelivery } from '@/lib/tracking/google-funnel-processor';
import type { PublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import { finalizeFlipAiQualification, type FlipAiFinalQualification } from '@/lib/flip-ai/qualification';

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

/** Whether this lead's conversion (Meta Lead + Google Ads) still has to go out: once, at qualification. */
async function conversionPending(tenantId: string, leadId: string) {
  // Leads created before C1 were only ever created already qualified, with the events sent then.
  const createdAtContact = await prisma.auditLog.count({
    where: {
      tenantId, entityType: 'lead', entityId: leadId, action: 'lead.whatsapp_ai_created',
      metadata: { path: ['captureStage'], equals: 'contact' },
    },
  });
  if (!createdAtContact) return false;
  const sent = await prisma.auditLog.count({
    where: { tenantId, entityType: 'lead', entityId: leadId, action: 'lead.whatsapp_ai_conversion_sent' },
  });
  return sent === 0;
}

/** One Lead event to Meta (with the ad click) and the Google Ads conversion, recorded so it never repeats. */
async function sendWhatsAppLeadConversion(input: {
  tenantId: string;
  conversationId: string;
  leadId: string;
  referral: WhatsAppAdReferral | null;
  whatsappBusinessAccountId: string | null;
  agentId: string;
}) {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, tenantId: input.tenantId },
    select: { name: true, phone: true, pipelineId: true, stageId: true },
  });
  if (!lead) return;
  // The record goes first: a crash in the middle never sends the same conversion twice.
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: null, entityType: 'lead', entityId: input.leadId,
      action: 'lead.whatsapp_ai_conversion_sent', metadata: { agentId: input.agentId, conversationId: input.conversationId },
    },
  });
  // The CRM is already committed; tracking failures never undo the lead.
  try {
    await dispatchFormSubmissionTracking({
      tenantId: input.tenantId,
      leadId: input.leadId,
      pipelineId: lead.pipelineId,
      toStageId: lead.stageId,
      source: 'whatsapp_ai',
      conversationId: input.conversationId,
      lead: { name: lead.name, phone: lead.phone },
      metaLeadEventId: `whatsapp-ai-lead:${input.conversationId}`,
      metaAttribution: {
        ctwaClid: input.referral?.ctwaClid || null,
        whatsappBusinessAccountId: input.whatsappBusinessAccountId,
      },
      metaRequestTimeoutMs: 8_000,
    });
  } catch {
    // The Tracking Hub records its own delivery result.
  }
  try {
    const transition = await prisma.leadStageHistory.findFirst({
      where: { leadId: input.leadId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true },
    });
    if (transition && lead.pipelineId && lead.stageId) {
      const google = await enqueueGoogleConversionEvents({
        tenantId: input.tenantId,
        leadId: input.leadId,
        pipelineId: lead.pipelineId,
        stageId: lead.stageId,
        transitionId: transition.id,
        occurredAt: transition.createdAt,
        triggeredById: null,
      });
      if (google.some((event) => event.status === 'queued')) scheduleGoogleConversionDelivery();
    }
  } catch {
    // Google delivery is best-effort and never affects the conversation.
  }
}

/**
 * Called after each AI reply (pilot companies only):
 * 1. As soon as the person says how they want to be called, the conversation becomes a lead with that
 *    name and the WhatsApp number, at the first stage of the funnel. No ad event yet.
 * 2. The AI's verdict is recorded like in the site chat (score, summary, lead temperature).
 * 3. When the conversation is qualified, one Lead event goes to Meta and Google Ads.
 * Later, the name the person prefers replaces the WhatsApp profile name while the team has not edited it.
 */
export async function handleWhatsAppAiQualification(input: {
  tenantId: string;
  conversationId: string;
  runtime: PublicFlipAiRuntime;
  classification: string | null | undefined;
  preferredName: string | null | undefined;
  whatsappBusinessAccountId: string | null;
  qualification?: FlipAiFinalQualification | null;
  model?: string;
  evidenceMessageIds?: string[];
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
  const qualified = input.classification === 'qualified';
  const referral = (conversation.adReferral && typeof conversation.adReferral === 'object'
    ? conversation.adReferral : null) as WhatsAppAdReferral | null;

  let leadId = conversation.leadId;
  let kind: string = 'already_lead';
  if (leadId) {
    // Only the name the AI gave from the WhatsApp profile is replaced; a name the team wrote stays.
    if (preferredName && profileName && preferredName !== profileName) {
      const renamed = await prisma.lead.updateMany({
        where: { id: leadId, tenantId: input.tenantId, name: profileName },
        data: { name: preferredName },
      });
      if (renamed.count) {
        await prisma.auditLog.create({
          data: {
            tenantId: input.tenantId, userId: null, entityType: 'lead', entityId: leadId,
            action: 'lead.whatsapp_ai_renamed', metadata: { agentId: input.runtime.id },
          },
        }).catch(() => undefined);
      }
    }
  } else {
    // Name + WhatsApp number are enough to open the lead; a qualified conversation also opens it.
    if (!preferredName && !qualified) return { kind: 'not_identified' as const };
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
        metadata: { agentId: input.runtime.id, adSourceId: referral?.sourceId || null, captureStage: 'contact' },
      },
    });
    kind = outcome.kind;
    if (!('leadId' in outcome)) return { kind: outcome.kind };
    // An existing lead with this phone is only linked: it is not a new lead, so no ad event ever goes out
    // (conversionPending only accepts leads this flow created).
    leadId = outcome.leadId;
  }

  // The verdict is kept like in the site chat: score, summary and the lead temperature.
  if (input.qualification) {
    await finalizeFlipAiQualification({
      runtime: input.runtime,
      conversationId: input.conversationId,
      decision: input.qualification,
      model: input.model || 'unknown',
      evidenceMessageIds: input.evidenceMessageIds || [],
      channel: 'whatsapp',
    }).catch((error) => console.error('WhatsApp AI qualification failed', { errorType: error instanceof Error ? error.name : 'unknown' }));
  }

  if (qualified && leadId && await conversionPending(input.tenantId, leadId)) {
    await sendWhatsAppLeadConversion({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      leadId,
      referral,
      whatsappBusinessAccountId: input.whatsappBusinessAccountId,
      agentId: input.runtime.id,
    });
    return { kind: 'qualified' as const, leadId };
  }
  return { kind, leadId };
}

/** The name the AI may use: the lead's name, or the WhatsApp profile name to confirm. Clean text only. */
export function whatsappContactName(value: string | null | undefined) {
  const clean = (value || '').replace(/[^\p{L}\p{M}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean.length >= 2 ? clean : null;
}
