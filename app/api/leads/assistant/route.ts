import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { LeadAssistantError, leadAssistantContext, previewLeadCommand } from '@/lib/lead-assistant/service';

const bodySchema = z.object({ command: z.string().trim().min(3).max(400) }).strict();

/** The attendants, their open leads and the last changes; also tells the page the assistant is available. */
export const GET = withPermission('LEADS_EDIT_ALL', async (_req: NextRequest, session) => (
  NextResponse.json(await leadAssistantContext(session))
));

/** Turns a command into a preview. Nothing changes here. */
export const POST = withPermission('LEADS_EDIT_ALL', async (req: NextRequest, session) => {
  const rl = await rateLimit({ key: `lead-assistant:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Escreva um comando de 3 a 400 caracteres.' }, { status: 400 });
  try {
    return NextResponse.json(await previewLeadCommand(session, parsed.data.command));
  } catch (error) {
    if (error instanceof LeadAssistantError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Lead assistant preview failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível entender o comando agora. Tente de novo.' }, { status: 502 });
  }
});
