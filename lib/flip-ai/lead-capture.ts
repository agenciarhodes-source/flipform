import 'server-only';

import { prisma } from '@/lib/prisma';
import { ensureLeadFromConversation, type LeadAttributionSnapshot } from '@/lib/leads/ensure-from-conversation';
import { isValidBrazilianPhone, normalizeBrazilianPhone } from '@/lib/leads';
import { dispatchFormSubmissionTracking, getTrackingConfig, type MetaSubmissionAttribution } from '@/lib/tracking';
import { resolveMetaRuntimeConfig, toPublicMetaPixelConfig } from '@/lib/meta/runtime';
import type { PublicFlipAiRuntime } from './public-agent';

export type FlipAiIdentityDecision = { name: string | null; phone: string | null };

function normalizedWords(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function digits(value: string) {
  return value.replace(/\D/g, '');
}

async function hasUserEvidence(input: {
  tenantId: string;
  conversationId: string;
  name: string;
  phone: string;
}) {
  const messages = await prisma.message.findMany({
    where: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: 'inbound',
      provider: 'flip_ai',
      channel: 'web',
      type: 'text',
      text: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { text: true },
  });
  const expectedName = normalizedWords(input.name);
  const localPhone = input.phone.startsWith('55') ? input.phone.slice(2) : input.phone;
  const nameSeen = expectedName.length >= 2
    && messages.some((message) => normalizedWords(message.text || '').includes(expectedName));
  const phoneSeen = messages.some((message) => {
    const seen = digits(message.text || '');
    return seen.includes(input.phone) || seen.includes(localPhone);
  });
  return nameSeen && phoneSeen;
}

export async function captureFlipAiLead(input: {
  runtime: PublicFlipAiRuntime;
  conversationId: string;
  decision: FlipAiIdentityDecision;
  attribution: LeadAttributionSnapshot;
 }): Promise<{ meta?: { pixelId: string; eventId: string }; gtmContainerId?: string } | null> {
  const name = input.decision.name?.trim().slice(0, 160) || '';
  const phone = normalizeBrazilianPhone(input.decision.phone);
  if (!name || !phone || !isValidBrazilianPhone(phone)) return null;
  if (!(await hasUserEvidence({
    tenantId: input.runtime.tenantId,
    conversationId: input.conversationId,
    name,
    phone,
  }))) return null;

  const outcome = await ensureLeadFromConversation({
    tenantId: input.runtime.tenantId,
    conversationId: input.conversationId,
    pipelineId: input.runtime.pipelineId,
    stageId: input.runtime.initialStageId,
    rotationId: input.runtime.rotationId,
    source: 'flip_ai',
    temperature: 'warm',
    requireValidPhone: true,
    identity: { displayName: name, phone },
    attribution: input.attribution,
    audit: {
      userId: null,
      createdAction: 'lead.flip_ai_created',
      linkedAction: 'lead.flip_ai_linked',
      metadata: { agentId: input.runtime.id },
    },
  });
  if (outcome.kind !== 'created' && outcome.kind !== 'linked_existing') return null;

  const eventId = `flip-ai-lead:${input.conversationId}`;
  const metaAttribution: MetaSubmissionAttribution = {
    fbc: input.attribution.fbc,
    fbp: input.attribution.fbp,
    clientIpAddress: input.attribution.clientIp,
    clientUserAgent: input.attribution.clientUserAgent,
    landingPage: input.attribution.landingPage,
  };

  // CRM commit is already complete. Tracking failures can never roll it back or
  // block the valid Lead; this action is not retried blindly on later chat turns.
  try {
    await dispatchFormSubmissionTracking({
      tenantId: input.runtime.tenantId,
      leadId: outcome.leadId,
      pipelineId: outcome.pipelineId,
      toStageId: outcome.stageId,
      source: 'flip_ai',
      lead: { name: outcome.name, phone: outcome.phone },
      metaLeadEventId: eventId,
      metaAttribution,
      metaRequestTimeoutMs: 8_000,
    });
  } catch {
    // The Tracking Hub records its delivery result. The conversation continues.
  }

  try {
    const [metaRuntime, settings] = await Promise.all([
      resolveMetaRuntimeConfig({ tenantId: input.runtime.tenantId }),
      getTrackingConfig(input.runtime.tenantId),
    ]);
    const meta = toPublicMetaPixelConfig(metaRuntime, eventId);
    const gtmContainerId = settings?.gtmEnabled && settings.gtmContainerId
      ? settings.gtmContainerId : undefined;
    return { ...(meta ? { meta } : {}), ...(gtmContainerId ? { gtmContainerId } : {}) };
  } catch {
    return {};
  }
}
