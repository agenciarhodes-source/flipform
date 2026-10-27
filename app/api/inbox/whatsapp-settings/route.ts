import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { getUnassignedViewerUserIds } from '@/lib/inbox/unassigned-viewers';
import {
  getWhatsAppAgentSignatureSettings,
  isWhatsAppAgentSignatureSchemaUnavailable,
  WHATSAPP_AGENT_SIGNATURE_MODES,
} from '@/lib/meta/whatsapp-agent-signature';

const updateSchema = z.object({
  mode: z.enum(WHATSAPP_AGENT_SIGNATURE_MODES).optional(),
  unassignedViewerUserIds: z.array(z.string().trim().min(1).max(128)).max(200).optional(),
}).strict().refine((value) => value.mode !== undefined || value.unassignedViewerUserIds !== undefined);

/** The active attendants of the company, who can be chosen to see conversations nobody has. */
async function listAttendants(tenantId: string) {
  const rows = await prisma.tenantUser.findMany({
    where: { tenantId, role: 'agent', status: 'active' },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({ id: row.userId, name: row.user.name, email: row.user.email }));
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req: NextRequest, session) => {
  const [settings, attendants, unassignedViewerUserIds] = await Promise.all([
    getWhatsAppAgentSignatureSettings(session.tenantId),
    listAttendants(session.tenantId),
    getUnassignedViewerUserIds(session.tenantId),
  ]);
  return NextResponse.json({ settings: { ...settings, unassignedViewerUserIds }, attendants });
});

export const PUT = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = await rateLimit({
    key: `whatsapp-agent-signature:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Configuração de identificação inválida.' }, { status: 400 });
  }

  // Only active attendants of this company can be chosen.
  let viewers: string[] | undefined;
  if (parsed.data.unassignedViewerUserIds !== undefined) {
    const allowed = new Set((await listAttendants(session.tenantId)).map((attendant) => attendant.id));
    viewers = Array.from(new Set(parsed.data.unassignedViewerUserIds)).filter((id) => allowed.has(id));
  }

  try {
    const settings = await prisma.tenantWhatsAppSettings.upsert({
      where: { tenantId: session.tenantId },
      create: {
        tenantId: session.tenantId,
        ...(parsed.data.mode ? { agentSignatureMode: parsed.data.mode } : {}),
        ...(viewers ? { unassignedViewerUserIds: viewers } : {}),
      },
      update: {
        ...(parsed.data.mode ? { agentSignatureMode: parsed.data.mode } : {}),
        ...(viewers ? { unassignedViewerUserIds: viewers } : {}),
      },
      select: {
        agentSignatureMode: true,
        unassignedViewerUserIds: true,
      },
    });

    await logPlatformAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'tenant_whatsapp_settings',
      entityId: session.tenantId,
      action: viewers ? 'whatsapp.unassigned_viewers_updated' : 'whatsapp.agent_signature_mode_updated',
      metadata: viewers ? { unassignedViewerUserIds: settings.unassignedViewerUserIds } : { mode: settings.agentSignatureMode },
    });

    return NextResponse.json({
      ok: true,
      settings: {
        mode: settings.agentSignatureMode,
        unassignedViewerUserIds: settings.unassignedViewerUserIds,
        schemaReady: true,
      },
    });
  } catch (error) {
    if (isWhatsAppAgentSignatureSchemaUnavailable(error)) {
      return NextResponse.json({
        code: 'WHATSAPP_AGENT_SIGNATURE_SCHEMA_NOT_READY',
        error: 'A configuração ainda aguarda a atualização segura do banco.',
      }, { status: 503 });
    }
    throw error;
  }
});
