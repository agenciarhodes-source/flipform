import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import {
  getWhatsAppAgentSignatureSettings,
  isWhatsAppAgentSignatureSchemaUnavailable,
  WHATSAPP_AGENT_SIGNATURE_MODES,
} from '@/lib/meta/whatsapp-agent-signature';

const updateSchema = z.object({
  mode: z.enum(WHATSAPP_AGENT_SIGNATURE_MODES),
}).strict();

export const GET = withPermission('INTEGRATIONS_VIEW', async (_req: NextRequest, session) => {
  const settings = await getWhatsAppAgentSignatureSettings(session.tenantId);
  return NextResponse.json({ settings });
});

export const PUT = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-agent-signature:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Configuração de identificação inválida.' }, { status: 400 });
  }

  try {
    const settings = await prisma.tenantWhatsAppSettings.upsert({
      where: { tenantId: session.tenantId },
      create: {
        tenantId: session.tenantId,
        agentSignatureMode: parsed.data.mode,
      },
      update: {
        agentSignatureMode: parsed.data.mode,
      },
      select: {
        agentSignatureMode: true,
      },
    });

    await logPlatformAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'tenant_whatsapp_settings',
      entityId: session.tenantId,
      action: 'whatsapp.agent_signature_mode_updated',
      metadata: { mode: settings.agentSignatureMode },
    });

    return NextResponse.json({
      ok: true,
      settings: {
        mode: settings.agentSignatureMode,
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
