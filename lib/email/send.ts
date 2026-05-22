import { logAudit } from '@/lib/audit';
import { renderEmailTemplate } from './render';
import type { SendTransactionalEmailInput, SendTransactionalEmailResult } from './types';

type Provider = 'resend' | 'smtp' | 'none';

function getProvider(): Provider {
  const configured = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (configured === 'resend') return 'resend';
  if (configured === 'smtp') return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && (process.env.SMTP_PASSWORD || process.env.SMTP_PASS)) return 'smtp';
  return 'none';
}

function getFromAddress() {
  return process.env.EMAIL_FROM || 'atendimento@flipform.com.br';
}

function getReplyTo() {
  return process.env.EMAIL_REPLY_TO || 'atendimento@flipform.com.br';
}

async function sendWithResend(input: { to: string; subject: string; html: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Missing RESEND_API_KEY');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: getReplyTo(),
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${raw.slice(0, 250)}`);
  }
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput & { tenantId?: string; userId?: string | null }): Promise<SendTransactionalEmailResult> {
  const rendered = renderEmailTemplate(input.template, input.params);

  await logAudit({
    tenantId: input.tenantId || 'unknown',
    userId: input.userId || null,
    entityType: 'email',
    entityId: input.to,
    action: 'email.transactional.queued',
    metadata: { template: input.template, to: input.to, subject: rendered.subject },
  });

  const provider = getProvider();

  if (provider === 'none') {
    console.warn('Transactional email skipped: provider not configured');
    await logAudit({
      tenantId: input.tenantId || 'unknown',
      userId: input.userId || null,
      entityType: 'email',
      entityId: input.to,
      action: 'email.transactional.skipped',
      metadata: { template: input.template, reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' },
    });
    return { ok: false, skipped: true, reason: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
  }

  try {
    if (provider === 'resend') {
      await sendWithResend({ to: input.to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    } else {
      throw new Error('SMTP provider selected but SMTP transport is not enabled in this build yet. Configure EMAIL_PROVIDER=resend or add SMTP transport implementation.');
    }

    await logAudit({
      tenantId: input.tenantId || 'unknown',
      userId: input.userId || null,
      entityType: 'email',
      entityId: input.to,
      action: 'email.transactional.sent',
      metadata: { template: input.template, provider },
    });

    return { ok: true };
  } catch (e: any) {
    await logAudit({
      tenantId: input.tenantId || 'unknown',
      userId: input.userId || null,
      entityType: 'email',
      entityId: input.to,
      action: 'email.transactional.failed',
      metadata: { template: input.template, provider, message: e?.message || 'unknown' },
    });

    return { ok: false, reason: 'SEND_FAILED', error: e?.message || 'unknown' };
  }
}
