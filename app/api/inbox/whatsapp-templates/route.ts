import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { loadSendableWhatsAppTemplates, WhatsAppSendableTemplatesError } from '@/lib/meta/whatsapp-sendable-templates';
import { fillTemplateVariables } from '@/lib/meta/whatsapp-templates';
import { resolveWhatsAppTemplateValues } from '@/lib/meta/whatsapp-template-values';
import { findAccessibleInboxConversation } from '@/lib/inbox/access';

// The approved templates an attendant can send from the Inbox to start a conversation.
export const GET = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `inbox-whatsapp-templates:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const templates = await loadSendableWhatsAppTemplates(session.tenantId);
    // With a conversation, each template comes with the exact text this person would receive.
    const conversationId = req.nextUrl.searchParams.get('conversationId')?.trim() || '';
    const accessible = conversationId ? await findAccessibleInboxConversation(session, conversationId) : null;
    const values = accessible ? await resolveWhatsAppTemplateValues(session.tenantId, accessible.id) : null;
    const consent = accessible?.lead
      ? await prisma.auditLog.findFirst({
        where: { tenantId: session.tenantId, entityType: 'lead', entityId: accessible.lead.id, action: 'lead.contact_consent_recorded' },
        select: { createdAt: true },
      }).then((row) => (row ? 'granted' : 'not_recorded')).catch(() => 'not_recorded')
      : 'not_recorded';
    return NextResponse.json({
      consent,
      templates: templates.map((template) => ({
        ...template,
        preview: values ? fillTemplateVariables(template.body, values.slice(0, template.variables)) : template.body,
      })),
    });
  } catch (error) {
    if (error instanceof WhatsAppSendableTemplatesError && error.code === 'NOT_CONNECTED') {
      return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Não foi possível carregar os modelos do WhatsApp agora.' }, { status: 502 });
  }
});
