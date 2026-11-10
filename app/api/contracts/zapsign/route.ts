import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { saveZapSignSettings, zapSignSettings, zapSignTemplates } from '@/lib/contracts/zapsign';

const bodySchema = z.object({
  enabled: z.boolean(),
  apiToken: z.string().trim().max(200).nullable(),
  templates: z.array(z.object({ checklistId: z.string().min(1).max(64), templateId: z.string().trim().max(100) })).max(50),
}).strict();

/** Contracts by ZapSign of this company. The token is never returned, only whether there is one. */
export const GET = withPermission('CONTRACTS_MANAGE', async (_req: NextRequest, session) => {
  const settings = await zapSignSettings(session.tenantId);
  if (!settings.ready || !settings.allowed) return NextResponse.json({ allowed: false });
  const [templates, checklists] = await Promise.all([
    zapSignTemplates(session.tenantId),
    prisma.documentChecklist.findMany({ where: { tenantId: session.tenantId, enabled: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({ allowed: true, enabled: settings.enabled, hasToken: settings.hasToken, checklists, templates });
});

export const PUT = withPermission('CONTRACTS_MANAGE', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  const settings = await zapSignSettings(session.tenantId);
  if (!settings.ready || !settings.allowed) return NextResponse.json({ error: 'Contratos não liberados para esta empresa.' }, { status: 403 });
  if (parsed.data.enabled && !settings.hasToken && !parsed.data.apiToken) {
    return NextResponse.json({ error: 'Cole o token da API do ZapSign para ligar o envio de contratos.' }, { status: 400 });
  }
  try {
    await saveZapSignSettings({ tenantId: session.tenantId, userId: session.userId, ...parsed.data });
  } catch (error) {
    console.error('ZapSign settings failed', { errorType: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
});
