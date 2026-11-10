import 'server-only';

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { loadSendableWhatsAppTemplates } from '@/lib/meta/whatsapp-sendable-templates';
import { fillTemplateVariables } from '@/lib/meta/whatsapp-templates';
import { resolveWhatsAppTemplateValues } from '@/lib/meta/whatsapp-template-values';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { optOutPhone } from '@/lib/post-sale/runner';
import { parseTemplateRef } from '@/lib/post-sale/rules';
import { createUrgentTeamTask } from '@/lib/tasks/team-task';
import { isOutcomeStageName } from './stage-rules';
import {
  dueFollowupStep, FOLLOWUP_CALL_DUE_MINUTES, FOLLOWUP_MAX_PER_COMPANY_PER_RUN, followupCallTask, followupSkipReason, parseFollowupSteps,
} from './followup-rules';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br';

type SettingsRow = { tenant_id: string; steps: unknown; call_after_step: number };
type CandidateRow = {
  id: string; status: string; last_inbound_at: Date; last_outbound_at: Date; ai_pause_reason: string | null;
  lead_id: string | null; lead_status: string | null; lead_name: string | null; lead_assigned_to: string | null; assigned_to: string | null;
  stage_name: string | null; wa_id: string | null; display_name: string | null;
};
type SendRow = { conversation_id: string; cycle_at: Date; step: number; created_at: Date };

async function finish(id: string, status: 'sent' | 'failed' | 'skipped', reason: string | null, messageId?: string | null) {
  await prisma.$executeRaw`UPDATE whatsapp_followup_sends SET status = ${status}, reason = ${reason}, message_id = ${messageId || null} WHERE id = ${id}`
    .catch(() => undefined);
}

/**
 * Called every minute: conversations where the customer stopped answering get the next template of
 * the company's sequence, and after the chosen step the lead's attendant gets a task to call.
 */
export async function sweepWhatsAppFollowups(now = new Date()) {
  const companies = await prisma.$queryRaw<SettingsRow[]>`
    SELECT tenant_id, steps, call_after_step FROM whatsapp_followup_settings WHERE enabled = true`.catch(() => []);
  let sent = 0;
  for (const settings of companies) {
    const steps = parseFollowupSteps(settings.steps);
    if (!steps.length) continue;
    const days = steps.map((step) => step.days);
    const oldest = new Date(now.getTime() - (days[days.length - 1] + 2) * 86_400_000);

    const candidates = await prisma.$queryRaw<CandidateRow[]>`
      SELECT c.id, c.status, c.last_inbound_at, c.last_outbound_at, c.ai_pause_reason, c.assigned_to,
        l.id AS lead_id, l.status::text AS lead_status, l.name AS lead_name, l.assigned_to AS lead_assigned_to,
        s.name AS stage_name, e.external_user_id AS wa_id, e.display_name
      FROM conversations c
      LEFT JOIN leads l ON l.id = c.lead_id
      LEFT JOIN pipeline_stages s ON s.id = l.stage_id
      LEFT JOIN external_contact_identities e ON e.id = c.external_contact_identity_id
      WHERE c.tenant_id = ${settings.tenant_id} AND c.provider = 'meta' AND c.channel = 'whatsapp'
        AND c.last_inbound_at IS NOT NULL AND c.last_outbound_at > c.last_inbound_at
        AND c.last_inbound_at < ${new Date(now.getTime() - 24 * 3_600_000)} AND c.last_inbound_at > ${oldest}
      ORDER BY c.last_inbound_at ASC
      LIMIT 300`.catch(() => []);
    if (!candidates.length) continue;

    const sends = await prisma.$queryRaw<SendRow[]>`
      SELECT conversation_id, cycle_at, step, created_at FROM whatsapp_followup_sends
      WHERE tenant_id = ${settings.tenant_id} AND conversation_id = ANY(${candidates.map((row) => row.id)}::text[])`.catch(() => []);
    const optOuts = new Set((await prisma.contactOptOut.findMany({ where: { tenantId: settings.tenant_id }, select: { phone: true } })).map((row) => row.phone));
    const templates = await loadSendableWhatsAppTemplates(settings.tenant_id).catch(() => []);

    let sentHere = 0;
    for (const conversation of candidates) {
      if (sentHere >= FOLLOWUP_MAX_PER_COMPANY_PER_RUN) break;
      const cycle = sends.filter((row) => row.conversation_id === conversation.id && row.cycle_at.getTime() === conversation.last_inbound_at.getTime());
      const step = dueFollowupStep({
        lastInboundAt: conversation.last_inbound_at,
        lastOutboundAt: conversation.last_outbound_at,
        sentSteps: cycle.map((row) => row.step),
        lastSentAt: cycle.length ? new Date(Math.max(...cycle.map((row) => row.created_at.getTime()))) : null,
      }, days, now);
      if (!step) continue;

      // The row is the lock: one template per step and silence, even if two runs overlap.
      const rowId = randomUUID();
      const claimed = await prisma.$executeRaw`
        INSERT INTO whatsapp_followup_sends (id, tenant_id, conversation_id, cycle_at, step, status, created_at)
        VALUES (${rowId}, ${settings.tenant_id}, ${conversation.id}, ${conversation.last_inbound_at}, ${step}, 'pending', NOW())
        ON CONFLICT DO NOTHING`.catch(() => 0);
      if (claimed !== 1) continue;

      const skip = followupSkipReason({
        optedOut: !!conversation.wa_id && optOuts.has(optOutPhone(conversation.wa_id)),
        leadStatus: conversation.lead_status,
        outcomeStage: isOutcomeStageName(conversation.stage_name),
        conversationResolved: conversation.status === 'resolved',
        pauseReason: conversation.ai_pause_reason,
      });
      if (skip) { await finish(rowId, 'skipped', skip); continue; }
      const ref = parseTemplateRef(steps[step - 1].template);
      const template = ref ? templates.find((item) => item.name === ref.name && item.language === ref.language) : null;
      if (!template) { await finish(rowId, 'failed', 'template_unavailable'); continue; }

      const values = template.variables ? await resolveWhatsAppTemplateValues(settings.tenant_id, conversation.id) : [];
      const parameters = (values || []).slice(0, template.variables);
      const result = await enqueueAndDispatchWhatsAppTextMessage({
        tenantId: settings.tenant_id,
        conversationId: conversation.id,
        requestedByUserId: '',
        text: fillTemplateVariables(template.body, parameters),
        idempotencyKey: `followup-${conversation.id}-${conversation.last_inbound_at.getTime()}-${step}`,
        template: { name: template.name, language: template.language, ...(parameters.length ? { parameters } : {}) },
        systemSender: { label: 'Retomada' },
      }).catch(() => null);
      const ok = Boolean(result && result.status !== 'failed');
      await finish(rowId, ok ? 'sent' : 'failed', ok ? null : 'send_failed', result?.messageId);
      if (!ok) continue;
      sent += 1;
      sentHere += 1;

      // The chosen step went out without an answer before: a person calls the customer.
      if (settings.call_after_step > 0 && step === settings.call_after_step) {
        const task = followupCallTask({
          customerName: (conversation.lead_name || conversation.display_name || 'Cliente').trim(),
          stageName: conversation.stage_name,
          daysSilent: Math.floor((now.getTime() - conversation.last_inbound_at.getTime()) / 86_400_000),
          stepsSent: step,
          conversationId: conversation.id,
          leadId: conversation.lead_id,
          appUrl: APP_URL(),
        });
        await createUrgentTeamTask({
          tenantId: settings.tenant_id, leadId: conversation.lead_id,
          assignee: conversation.lead_assigned_to || conversation.assigned_to,
          title: task.title, description: task.description, dueInMinutes: FOLLOWUP_CALL_DUE_MINUTES,
        }).catch(() => 0);
      }
    }
  }
  return { companies: companies.length, sent };
}

/** The numbers of the last 30 days for the settings screen. */
export async function followupStats(tenantId: string) {
  const rows = await prisma.$queryRaw<Array<{ sent: bigint; answered: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE f.status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE f.status = 'sent' AND c.last_inbound_at > f.created_at) AS answered
    FROM whatsapp_followup_sends f JOIN conversations c ON c.id = f.conversation_id
    WHERE f.tenant_id = ${tenantId} AND f.created_at > ${new Date(Date.now() - 30 * 86_400_000)}`.catch(() => []);
  return { sent30d: Number(rows[0]?.sent || 0), answered30d: Number(rows[0]?.answered || 0) };
}
