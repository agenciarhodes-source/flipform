import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { FlipAiError } from '@/lib/flip-ai/access';
import {
  getWhatsAppAiWorkspace,
  saveWhatsAppAiSettings,
  whatsappAiSettingsInputSchema,
  WhatsAppAiSettingsError,
} from '@/lib/whatsapp-ai/settings';

function errorResponse(error: unknown) {
  if (error instanceof FlipAiError || error instanceof WhatsAppAiSettingsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  try {
    return NextResponse.json(await getWhatsAppAiWorkspace(session));
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const rl = await rateLimit({
    key: `whatsapp-ai-settings:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = whatsappAiSettingsInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Configuração inválida.' }, { status: 400 });
  }
  try {
    await saveWhatsAppAiSettings(session, parsed.data);
    return NextResponse.json(await getWhatsAppAiWorkspace(session));
  } catch (error) {
    return errorResponse(error);
  }
});
