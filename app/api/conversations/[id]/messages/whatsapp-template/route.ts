import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { enqueueAndDispatchWhatsAppTextMessage, WhatsAppOutboundError } from '@/lib/meta/whatsapp-outbound';
import { loadSendableWhatsAppTemplates, WhatsAppSendableTemplatesError } from '@/lib/meta/whatsapp-sendable-templates';
import { fillTemplateVariables } from '@/lib/meta/whatsapp-templates';
import { resolveWhatsAppTemplateValues } from '@/lib/meta/whatsapp-template-values';

const bodySchema = z.object({
  templateName: z.string().trim().min(1).max(512).regex(/^[a-z0-9_]+$/),
  language: z.string().trim().min(2).max(10).regex(/^[a-z]{2,3}(_[A-Z]{2})?$/),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();

// Sends an approved template: the only message Meta accepts for someone who has not written
// in the last 24 hours. The browser only names the template; its text always comes from Meta.
export const POST = withPermission('LEADS_CONTACT_WHATSAPP', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({
    key: `whatsapp-template-send:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Modelo ou chave de idempotência inválida.' }, { status: 400 });

  try {
    const templates = await loadSendableWhatsAppTemplates(session.tenantId);
    const template = templates.find(item => item.name === parsed.data.templateName && item.language === parsed.data.language);
    if (!template) {
      return NextResponse.json({ error: 'Este modelo não está aprovado pela Meta ou exige campos que ainda não são suportados.' }, { status: 409 });
    }

    // The variables are filled by the server from the conversation's lead and the company.
    const values = template.variables ? await resolveWhatsAppTemplateValues(session.tenantId, ctx.params.id) : [];
    if (!values) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
    const parameters = values.slice(0, template.variables);

    const result = await enqueueAndDispatchWhatsAppTextMessage({
      tenantId: session.tenantId,
      conversationId: ctx.params.id,
      requestedByUserId: session.userId,
      text: fillTemplateVariables(template.body, parameters),
      idempotencyKey: parsed.data.idempotencyKey,
      template: { name: template.name, language: template.language, ...(parameters.length ? { parameters } : {}) },
    });
    if (result.status === 'failed') {
      return NextResponse.json({ error: 'A Meta recusou o envio do modelo ou a conexão do WhatsApp não está disponível.', result }, { status: 502 });
    }
    if (result.status === 'delivery_unknown' || result.status === 'in_progress') {
      return NextResponse.json({
        result,
        warning: 'O envio não será repetido automaticamente para evitar mensagem duplicada.',
      }, { status: 202 });
    }
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    if (error instanceof WhatsAppSendableTemplatesError) {
      if (error.code === 'NOT_CONNECTED') return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });
      return NextResponse.json({ error: 'Não foi possível consultar os modelos do WhatsApp agora.' }, { status: 502 });
    }
    if (error instanceof WhatsAppOutboundError) {
      if (error.code === 'NOT_FOUND') return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });
      if (error.code === 'FORBIDDEN') return NextResponse.json({ error: 'Você não pode enviar mensagens nesta conversa.' }, { status: 403 });
      if (error.code === 'NOT_CONNECTED') return NextResponse.json({ error: 'WhatsApp não conectado para esta empresa.' }, { status: 409 });
      if (error.code === 'IDEMPOTENCY_CONFLICT') return NextResponse.json({ error: 'A chave de idempotência já foi usada com outro conteúdo.' }, { status: 409 });
      if (error.code === 'INVALID_RECIPIENT' || error.code === 'INVALID_REQUEST') {
        return NextResponse.json({ error: 'Não foi possível preparar este modelo para envio.' }, { status: 400 });
      }
    }
    console.error('WhatsApp template endpoint failed', {
      tenantId: session.tenantId,
      userId: session.userId,
      conversationId: ctx.params.id,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível enviar o modelo agora.' }, { status: 500 });
  }
});
