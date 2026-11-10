import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { followupStats } from '@/lib/whatsapp-ai/followups';
import { FOLLOWUP_DEFAULT_DAYS, followupSettingsSchema, parseFollowupSteps } from '@/lib/whatsapp-ai/followup-rules';

type Row = { enabled: boolean; steps: unknown; call_after_step: number; enabled_at: Date | null };

async function load(tenantId: string) {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT enabled, steps, call_after_step, enabled_at FROM whatsapp_followup_settings WHERE tenant_id = ${tenantId}`.catch(() => null);
  return rows;
}

/** "Sequência de retomada" of WhatsApp. */
export const GET = withPermission('INTEGRATIONS_MANAGE', async (_req: NextRequest, session) => {
  const rows = await load(session.tenantId);
  if (!rows) return NextResponse.json({ ready: false });
  const row = rows[0];
  return NextResponse.json({
    ready: true,
    settings: row
      ? { enabled: row.enabled, steps: parseFollowupSteps(row.steps), callAfterStep: row.call_after_step }
      : { enabled: false, steps: FOLLOWUP_DEFAULT_DAYS.map((days) => ({ days, template: '' })), callAfterStep: 2 },
    ...(await followupStats(session.tenantId)),
  });
});

export const PUT = withPermission('INTEGRATIONS_MANAGE', async (req: NextRequest, session) => {
  const parsed = followupSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Configuração inválida.' }, { status: 400 });
  const rows = await load(session.tenantId);
  if (!rows) return NextResponse.json({ error: 'A retomada ainda não foi instalada no banco.' }, { status: 409 });
  const data = parsed.data;
  // Switching on keeps the first moment it was switched on.
  const enabledAt = data.enabled ? (rows[0]?.enabled && rows[0].enabled_at ? rows[0].enabled_at : new Date()) : null;
  await prisma.$executeRaw`
    INSERT INTO whatsapp_followup_settings (tenant_id, enabled, steps, call_after_step, enabled_at, updated_by, created_at, updated_at)
    VALUES (${session.tenantId}, ${data.enabled}, ${JSON.stringify(data.steps)}::jsonb, ${data.callAfterStep}, ${enabledAt}, ${session.userId}, NOW(), NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, steps = EXCLUDED.steps, call_after_step = EXCLUDED.call_after_step,
      enabled_at = EXCLUDED.enabled_at, updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'whatsapp_followup_settings', entityId: session.tenantId,
      action: 'whatsapp_followup.settings_updated',
      metadata: { enabled: data.enabled, steps: data.steps.map((step) => step.days), callAfterStep: data.callAfterStep },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
