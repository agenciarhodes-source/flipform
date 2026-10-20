import 'server-only';

import { prisma } from '@/lib/prisma';
import { normalizeBrazilianLeadPhone } from '@/lib/leads';
import { startWhatsAppConversationForLead } from '@/lib/conversations/whatsapp-lead-linking';
import { loadSendableWhatsAppTemplates } from '@/lib/meta/whatsapp-sendable-templates';
import { fillTemplateVariables } from '@/lib/meta/whatsapp-templates';
import { resolveWhatsAppTemplateValues } from '@/lib/meta/whatsapp-template-values';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { isWithinSendingHours, nextPostSaleMessage, parseTemplateRef } from './rules';

const MAX_SENDS_PER_COMPANY_PER_RUN = 30;

/** The phone as kept in the opt-out list: digits of the normalized Brazilian number. */
export function optOutPhone(value: string | null | undefined) {
  return (normalizeBrazilianLeadPhone(value) || value || '').replace(/\D/g, '');
}

/** Someone wrote SAIR (or similar), or the team marked it: no more automatic messages. */
export async function recordContactOptOut(input: { tenantId: string; phone: string; source: 'keyword' | 'team'; userId?: string | null }) {
  const phone = optOutPhone(input.phone);
  if (!phone) return;
  await prisma.contactOptOut.upsert({
    where: { tenantId_phone: { tenantId: input.tenantId, phone } },
    create: { tenantId: input.tenantId, phone, source: input.source, createdBy: input.userId || null },
    update: {},
  });
}

/**
 * Hourly: closed clients get the progress update or the review request each company set up, with an
 * approved template, only in the allowed hours, at most once a week, never to who asked to stop.
 */
export async function runPostSaleMessages(now = new Date()) {
  if (!isWithinSendingHours(now)) return { companies: 0, sent: 0, skipped: 'outside_hours' as const };
  const companies = await prisma.postSaleSettings.findMany({
    where: { OR: [{ progressEnabled: true }, { reviewEnabled: true }] },
  });
  let sent = 0;
  for (const settings of companies) {
    const templates = await loadSendableWhatsAppTemplates(settings.tenantId).catch(() => []);
    const findTemplate = (ref: string | null) => {
      const parsed = parseTemplateRef(ref);
      return parsed ? templates.find((template) => template.name === parsed.name && template.language === parsed.language) || null : null;
    };
    const progressTemplate = settings.progressEnabled ? findTemplate(settings.progressTemplate) : null;
    const reviewTemplate = settings.reviewEnabled ? findTemplate(settings.reviewTemplate) : null;
    if (!progressTemplate && !reviewTemplate) continue;

    const [won, optOuts] = await Promise.all([
      prisma.lead.findMany({
        where: { tenantId: settings.tenantId, status: 'won', phone: { not: null } },
        select: {
          id: true, phone: true, stageId: true, updatedAt: true,
          history: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
        take: 2_000,
      }),
      prisma.contactOptOut.findMany({ where: { tenantId: settings.tenantId }, select: { phone: true } }),
    ]);
    const blocked = new Set(optOuts.map((item) => item.phone));
    let sentHere = 0;
    for (const lead of won) {
      if (sentHere >= MAX_SENDS_PER_COMPANY_PER_RUN) break;
      if (blocked.has(optOutPhone(lead.phone))) continue;
      const sends = await prisma.postSaleSend.findMany({
        where: { tenantId: settings.tenantId, leadId: lead.id, status: 'sent' },
        orderBy: { createdAt: 'desc' },
        select: { kind: true, createdAt: true },
      });
      const kind = nextPostSaleMessage({
        wonAt: lead.history[0]?.createdAt || lead.updatedAt,
        now,
        history: {
          lastAnySendAt: sends[0]?.createdAt || null,
          lastProgressAt: sends.find((send) => send.kind === 'progress')?.createdAt || null,
          reviewSentAt: sends.find((send) => send.kind === 'review')?.createdAt || null,
        },
        progress: { enabled: Boolean(progressTemplate), intervalDays: settings.progressIntervalDays },
        review: { enabled: Boolean(reviewTemplate), afterDays: settings.reviewAfterDays },
      });
      if (!kind) continue;
      const template = kind === 'review' ? reviewTemplate! : progressTemplate!;

      const conversation = await startWhatsAppConversationForLead({ tenantId: settings.tenantId, leadId: lead.id, userId: null })
        .catch(() => ({ conversationId: null }));
      if (!conversation.conversationId) {
        await prisma.postSaleSend.create({ data: { tenantId: settings.tenantId, leadId: lead.id, kind, status: 'skipped' } });
        continue;
      }
      const values = template.variables ? await resolveWhatsAppTemplateValues(settings.tenantId, conversation.conversationId) : [];
      const parameters = (values || []).slice(0, template.variables);
      const result = await enqueueAndDispatchWhatsAppTextMessage({
        tenantId: settings.tenantId,
        conversationId: conversation.conversationId,
        requestedByUserId: '',
        text: fillTemplateVariables(template.body, parameters),
        idempotencyKey: `post-sale-${kind}-${lead.id}-${now.toISOString().slice(0, 10)}`,
        template: { name: template.name, language: template.language, ...(parameters.length ? { parameters } : {}) },
        systemSender: { label: kind === 'review' ? 'Pós-venda · avaliação' : 'Pós-venda · andamento' },
      }).catch(() => null);
      const ok = Boolean(result && result.status !== 'failed');
      await prisma.postSaleSend.create({
        data: { tenantId: settings.tenantId, leadId: lead.id, kind, messageId: result?.messageId || null, status: ok ? 'sent' : 'failed' },
      });
      if (ok) {
        sent += 1;
        sentHere += 1;
      }
    }
  }
  return { companies: companies.length, sent };
}
