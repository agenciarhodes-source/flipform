import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { withPermission } from '@/lib/rbac-server';
import { getPlatformWhatsAppRuntimeCredentials } from '@/lib/meta/platform-settings';
import { validateWhatsAppSystemUserToken } from '@/lib/meta/whatsapp';
import { connectionAccessToken } from '@/lib/meta/whatsapp-connection-token';
import {
  createWhatsAppMessageTemplate,
  deleteWhatsAppMessageTemplate,
  listWhatsAppMessageTemplates,
  templateBodyVariables,
  WHATSAPP_TEMPLATE_CATEGORIES,
  WHATSAPP_TEMPLATE_LANGUAGES,
} from '@/lib/meta/whatsapp-templates';

const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(512).regex(/^[a-z0-9_]+$/, 'Use apenas letras minúsculas, números e _.'),
  category: z.enum(WHATSAPP_TEMPLATE_CATEGORIES),
  language: z.enum(WHATSAPP_TEMPLATE_LANGUAGES),
  header: z.string().trim().max(60).optional().default(''),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().max(60).optional().default(''),
}).strict().superRefine((value, ctx) => {
  if ([value.header, value.footer].some(text => text.includes('{{') || text.includes('}}'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use variáveis apenas na mensagem, não no cabeçalho ou no rodapé.' });
    return;
  }
  try {
    templateBodyVariables(value.body);
  } catch (error) {
    const message = error instanceof Error && /start or end/.test(error.message)
      ? 'A mensagem não pode começar nem terminar com uma variável.'
      : error instanceof Error && /next to each other/.test(error.message)
        ? 'Separe as variáveis com texto entre elas.'
        : 'Use apenas {{1}} (nome do lead), {{2}} (data do cadastro) e {{3}} (nome da empresa), em ordem.';
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});

const DeleteTemplateSchema = z.object({
  id: z.string().trim().regex(/^\d{1,32}$/),
  name: z.string().trim().min(1).max(512).regex(/^[a-z0-9_]+$/),
}).strict();

class WhatsAppTemplateContextError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function getTenantTemplateContext(tenantId: string) {
  const [connection, credentials] = await Promise.all([
    prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId, status: 'connected' },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        wabaId: true,
        systemUserAssignedAt: true,
        accessTokenEncrypted: true,
      },
    }),
    getPlatformWhatsAppRuntimeCredentials(),
  ]);

  if (!connection) {
    throw new WhatsAppTemplateContextError('Conecte o WhatsApp desta empresa antes de gerenciar modelos.', 409);
  }
  if (!credentials) {
    throw new WhatsAppTemplateContextError('A integração universal do WhatsApp ainda não está pronta para gerenciar modelos.', 503);
  }
  if (!connection.systemUserAssignedAt) {
    throw new WhatsAppTemplateContextError('A conexão do WhatsApp ainda está concluindo a autorização da plataforma.', 409);
  }

  const accessToken = connectionAccessToken(connection.accessTokenEncrypted) || credentials.systemUserAccessToken;
  await validateWhatsAppSystemUserToken({
    accessToken,
    debugAccessToken: credentials.systemUserAccessToken,
    appId: credentials.appId,
    wabaId: connection.wabaId,
  });

  return {
    connectionId: connection.id,
    wabaId: connection.wabaId,
    accessToken,
    appSecret: credentials.appSecret,
  };
}

function safeProviderError(error: unknown) {
  if (error instanceof WhatsAppTemplateContextError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const provider = error as Error & { status?: number; providerCode?: string | number | null };
  if (provider?.status === 429) {
    return NextResponse.json({ error: 'A Meta limitou temporariamente as consultas. Tente novamente em instantes.' }, { status: 429 });
  }
  if (provider?.status === 401 || provider?.status === 403) {
    return NextResponse.json({ error: 'A autorização do WhatsApp precisa ser revalidada antes de gerenciar modelos.' }, { status: 502 });
  }

  console.error('WhatsApp template operation failed', {
    providerStatus: provider?.status ?? null,
    providerCode: provider?.providerCode ?? null,
    message: provider instanceof Error ? provider.message : 'unknown',
  });
  return NextResponse.json({ error: 'Não foi possível concluir a operação de modelos na Meta.' }, { status: 502 });
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-templates-list:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const context = await getTenantTemplateContext(session.tenantId);
    const after = req.nextUrl.searchParams.get('after');
    if (after && after.length > 500) {
      return NextResponse.json({ error: 'Cursor de paginação inválido.' }, { status: 400 });
    }

    const result = await listWhatsAppMessageTemplates({
      accessToken: context.accessToken,
      appSecret: context.appSecret,
      wabaId: context.wabaId,
      after,
    });

    return NextResponse.json(result);
  } catch (error) {
    return safeProviderError(error);
  }
});

export const POST = withPermission('INTEGRATIONS_MANAGE', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-templates-create:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const parsed = CreateTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || 'Revise os dados do modelo.',
    }, { status: 400 });
  }

  try {
    const context = await getTenantTemplateContext(session.tenantId);
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true } });
    const template = await createWhatsAppMessageTemplate({
      accessToken: context.accessToken,
      appSecret: context.appSecret,
      wabaId: context.wabaId,
      template: parsed.data,
      companyName: tenant?.name,
    });

    // The template itself lives at Meta. We intentionally do not duplicate its
    // content in FlipForm's database, which keeps customer data surface smaller.
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          userId: session.userId,
          entityType: 'whatsapp_message_template',
          entityId: template.id || template.name,
          action: 'WHATSAPP_TEMPLATE_CREATED',
        },
      });
    } catch (auditError) {
      console.warn('WhatsApp template created but audit write failed', {
        tenantId: session.tenantId,
        connectionId: context.connectionId,
        templateName: template.name,
        message: auditError instanceof Error ? auditError.message : 'unknown',
      });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return safeProviderError(error);
  }
});

// Deleting is permanent at Meta: owners and admins only (INTEGRATIONS_MANAGE), after confirming.
export const DELETE = withPermission('INTEGRATIONS_MANAGE', async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `whatsapp-templates-delete:${session.tenantId}:${session.userId}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = DeleteTemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });

  try {
    const context = await getTenantTemplateContext(session.tenantId);
    const result = await deleteWhatsAppMessageTemplate({
      accessToken: context.accessToken,
      appSecret: context.appSecret,
      wabaId: context.wabaId,
      id: parsed.data.id,
      name: parsed.data.name,
    });
    if (!result.deleted) return NextResponse.json({ error: 'A Meta não confirmou a exclusão do modelo.' }, { status: 502 });

    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        entityType: 'whatsapp_message_template',
        entityId: parsed.data.id,
        action: 'WHATSAPP_TEMPLATE_DELETED',
        metadata: { name: parsed.data.name },
      },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return safeProviderError(error);
  }
});
