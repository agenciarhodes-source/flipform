import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { setZapSignAllowed, zapSignSettings } from '@/lib/contracts/zapsign';

const bodySchema = z.object({ allowed: z.boolean() }).strict();

/** Releases (or not) contracts by ZapSign for one company. */
export const GET = withPlatformAdmin(async (_req, _session, ctx: { params: { id: string } }) => {
  const settings = await zapSignSettings(ctx.params.id);
  return NextResponse.json({ ready: settings.ready, allowed: settings.allowed, enabled: settings.enabled, hasToken: settings.hasToken });
});

export const PUT = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  const settings = await zapSignSettings(ctx.params.id);
  if (!settings.ready) return NextResponse.json({ error: 'As tabelas de contratos ainda não foram criadas no banco.' }, { status: 409 });
  await setZapSignAllowed({ tenantId: ctx.params.id, allowed: parsed.data.allowed, userId: session.userId });
  await logPlatformAudit({
    tenantId: ctx.params.id, userId: session.userId, entityType: 'tenant', entityId: ctx.params.id,
    action: parsed.data.allowed ? 'platform.contracts_allowed' : 'platform.contracts_blocked', metadata: {},
  });
  return NextResponse.json({ ok: true });
});
