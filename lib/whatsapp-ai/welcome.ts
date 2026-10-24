import 'server-only';

import { prisma } from '@/lib/prisma';
import { startWhatsAppConversationForLead } from '@/lib/conversations/whatsapp-lead-linking';
import { loadSendableWhatsAppTemplates } from '@/lib/meta/whatsapp-sendable-templates';
import { fillTemplateVariables } from '@/lib/meta/whatsapp-templates';
import { resolveWhatsAppTemplateValues } from '@/lib/meta/whatsapp-template-values';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { isValidBrazilMobilePhone } from '@/lib/form-field-validation';
import { optOutPhone } from '@/lib/post-sale/runner';
import { parseTemplateRef } from '@/lib/post-sale/rules';
import {
  customerAlreadyWrote,
  WELCOME_MAX_PER_COMPANY_PER_RUN,
  welcomeSkipReason,
  welcomeWindow,
  type WelcomeSkipReason,
} from './welcome-rules';

const CONSENT_ACTION = 'lead.contact_consent_recorded';

async function finish(id: string, status: 'sent' | 'failed' | 'skipped', reason: WelcomeSkipReason | string | null, messageId?: string | null) {
  await prisma.whatsAppWelcomeSend.update({ where: { id }, data: { status, reason, messageId: messageId || null } }).catch(() => undefined);
}

/**
 * Called every minute: leads that came from a form, authorized WhatsApp contact and did not write
 * on WhatsApp within the delay set by the company get one approved template (once per lead). When
 * the person answers, the 24-hour window opens and the AI takes over with the registration context.
 */
export async function sweepWhatsAppWelcomes(now = new Date()) {
  const companies = await prisma.whatsAppWelcomeSettings.findMany({
    where: { enabled: true, template: { not: null }, enabledAt: { not: null } },
  });
  let sent = 0;
  for (const settings of companies) {
    const ref = parseTemplateRef(settings.template);
    if (!ref || !settings.enabledAt) continue;
    const window = welcomeWindow({ enabledAt: settings.enabledAt, delayMinutes: settings.delayMinutes, now });
    if (window.from >= window.until) continue;

    const leads = await prisma.lead.findMany({
      where: {
        tenantId: settings.tenantId, formId: { not: null }, phone: { not: null },
        createdAt: { gte: window.from, lte: window.until },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, phone: true },
    });
    if (!leads.length) continue;
    const done = new Set((await prisma.whatsAppWelcomeSend.findMany({
      where: { tenantId: settings.tenantId, leadId: { in: leads.map((lead) => lead.id) } },
      select: { leadId: true },
    })).map((row) => row.leadId));
    const pending = leads.filter((lead) => !done.has(lead.id)).slice(0, WELCOME_MAX_PER_COMPANY_PER_RUN);
    if (!pending.length) continue;

    const template = (await loadSendableWhatsAppTemplates(settings.tenantId).catch(() => []))
      .find((item) => item.name === ref.name && item.language === ref.language);
    if (!template) continue;
    const [consents, optOuts] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId: settings.tenantId, entityType: 'lead', action: CONSENT_ACTION, entityId: { in: pending.map((lead) => lead.id) } },
        select: { entityId: true },
      }),
      prisma.contactOptOut.findMany({ where: { tenantId: settings.tenantId }, select: { phone: true } }),
    ]);
    const consented = new Set(consents.map((row) => row.entityId));
    const blocked = new Set(optOuts.map((row) => row.phone));

    for (const lead of pending) {
      // The row is the lock: a lead is handled once, even if two runs overlap.
      let row: { id: string };
      try {
        row = await prisma.whatsAppWelcomeSend.create({
          data: { tenantId: settings.tenantId, leadId: lead.id, status: 'pending' },
          select: { id: true },
        });
      } catch {
        continue;
      }
      const skip = welcomeSkipReason({
        consent: consented.has(lead.id),
        optedOut: blocked.has(optOutPhone(lead.phone)),
        validMobile: isValidBrazilMobilePhone(lead.phone),
      });
      if (skip) {
        await finish(row.id, 'skipped', skip);
        continue;
      }
      const conversation = await startWhatsAppConversationForLead({ tenantId: settings.tenantId, leadId: lead.id, userId: null })
        .catch(() => ({ conversationId: null }));
      if (!conversation.conversationId) {
        await finish(row.id, 'skipped', 'no_conversation');
        continue;
      }
      const current = await prisma.conversation.findFirst({
        where: { id: conversation.conversationId, tenantId: settings.tenantId },
        select: { lastInboundAt: true },
      });
      // The person already wrote (for example, through the form's WhatsApp button): the AI answers.
      if (customerAlreadyWrote(current?.lastInboundAt, now)) {
        await finish(row.id, 'skipped', 'customer_wrote');
        continue;
      }
      const values = template.variables ? await resolveWhatsAppTemplateValues(settings.tenantId, conversation.conversationId) : [];
      const parameters = (values || []).slice(0, template.variables);
      const result = await enqueueAndDispatchWhatsAppTextMessage({
        tenantId: settings.tenantId,
        conversationId: conversation.conversationId,
        requestedByUserId: '',
        text: fillTemplateVariables(template.body, parameters),
        idempotencyKey: `whatsapp-welcome-${lead.id}`,
        template: { name: template.name, language: template.language, ...(parameters.length ? { parameters } : {}) },
        systemSender: { label: 'Boas-vindas' },
      }).catch(() => null);
      const ok = Boolean(result && result.status !== 'failed');
      await finish(row.id, ok ? 'sent' : 'failed', ok ? null : 'send_failed', result?.messageId);
      if (ok) sent += 1;
    }
  }
  return { companies: companies.length, sent };
}
