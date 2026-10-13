import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { loadSendableWhatsAppTemplates, WhatsAppSendableTemplatesError } from '@/lib/meta/whatsapp-sendable-templates';

// The approved templates an attendant can send from the Inbox to start a conversation.
export const GET = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `inbox-whatsapp-templates:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    return NextResponse.json({ templates: await loadSendableWhatsAppTemplates(session.tenantId) });
  } catch (error) {
    if (error instanceof WhatsAppSendableTemplatesError && error.code === 'NOT_CONNECTED') {
      return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Não foi possível carregar os modelos do WhatsApp agora.' }, { status: 502 });
  }
});
