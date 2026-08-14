import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import {
  listMetaAccessibleAdAccounts,
  listMetaAdAccountPixels,
  validateMetaAdAccountPixelSelection,
} from '@/lib/meta/assets';

const tenantIdSchema = z.string().trim().uuid();
const resourceSchema = z.enum(['connection', 'ad_accounts', 'pixels']);
const numericIdSchema = z.string().trim().regex(/^\d{1,64}$/);
const adAccountIdSchema = z.string().trim().regex(/^(?:act_)?\d{1,64}$/);
const bindingSchema = z.object({
  tenantId: tenantIdSchema,
  adAccountId: adAccountIdSchema,
  pixelId: numericIdSchema,
}).strict();

class MetaBindingChangedError extends Error {
  constructor() {
    super('META_BINDING_CONNECTION_CHANGED');
    this.name = 'MetaBindingChangedError';
  }
}

type ConnectionRecord = {
  id: string;
  status: string;
  metaUserName: string | null;
  tokenExpiresAt: Date | null;
  connectedAt: Date;
  accessTokenEncrypted: string;
  metaAdAccountId: string | null;
  metaAdAccountName: string | null;
  metaPixelId: string | null;
  metaPixelName: string | null;
  assetsSelectedAt: Date | null;
};

async function getLatestAuthorizedConnection(tenantId: string): Promise<ConnectionRecord | null> {
  return prisma.tenantMetaConnection.findFirst({
    where: { tenantId, status: 'authorized' },
    orderBy: { connectedAt: 'desc' },
    select: {
      id: true,
      status: true,
      metaUserName: true,
      tokenExpiresAt: true,
      connectedAt: true,
      accessTokenEncrypted: true,
      metaAdAccountId: true,
      metaAdAccountName: true,
      metaPixelId: true,
      metaPixelName: true,
      assetsSelectedAt: true,
    },
  });
}

function toSafeConnection(connection: ConnectionRecord | null) {
  if (!connection) return null;
  const expired = Boolean(connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date());
  return {
    id: connection.id,
    status: expired ? 'expired' : connection.status,
    metaUserName: connection.metaUserName,
    connectedAt: connection.connectedAt,
    tokenExpiresAt: connection.tokenExpiresAt,
    assetSelection: connection.metaAdAccountId && connection.metaPixelId ? {
      adAccountId: connection.metaAdAccountId,
      adAccountName: connection.metaAdAccountName,
      pixelId: connection.metaPixelId,
      pixelName: connection.metaPixelName,
      selectedAt: connection.assetsSelectedAt,
    } : null,
  };
}

async function getDiscoveryContext(tenantId: string) {
  const [tenant, credentials, connection] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } }),
    getPlatformMetaOAuthCredentials(),
    getLatestAuthorizedConnection(tenantId),
  ]);
  if (!tenant) return { error: 'Tenant não encontrado.', status: 404 as const };
  if (!credentials) return { error: 'A integração Meta da plataforma não está configurada.', status: 503 as const };
  if (!connection) return { error: 'Este tenant ainda não possui uma conta Meta autorizada.', status: 409 as const };
  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) {
    return { error: 'A autorização Meta deste tenant expirou. Autorize novamente antes de vincular ativos.', status: 409 as const };
  }
  const accessToken = decryptIntegrationSecret(connection.accessTokenEncrypted);
  if (!accessToken) return { error: 'A autorização Meta deste tenant não está disponível.', status: 409 as const };
  return { tenant, credentials, connection, accessToken };
}

export const GET = withPlatformAdmin(async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `admin-meta-tenant-assets-read:${session.userId}:${getClientIp(req)}`, limit: 120, windowMs: 10 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas consultas de ativos Meta. Tente novamente em instantes.' }, { status: 429 });

  const tenantParsed = tenantIdSchema.safeParse(req.nextUrl.searchParams.get('tenantId'));
  const resourceParsed = resourceSchema.safeParse(req.nextUrl.searchParams.get('resource') || 'connection');
  if (!tenantParsed.success || !resourceParsed.success) return NextResponse.json({ error: 'Consulta inválida.' }, { status: 400 });

  if (resourceParsed.data === 'connection') {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantParsed.data }, select: { id: true, name: true, slug: true } });
    if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
    const connection = await getLatestAuthorizedConnection(tenant.id);
    return NextResponse.json({ tenant, connection: toSafeConnection(connection) });
  }

  const context = await getDiscoveryContext(tenantParsed.data);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });

  try {
    const adAccounts = await listMetaAccessibleAdAccounts({
      accessToken: context.accessToken,
      appSecret: context.credentials.appSecret,
    });
    if (resourceParsed.data === 'ad_accounts') {
      return NextResponse.json({ tenant: context.tenant, connection: toSafeConnection(context.connection), adAccounts });
    }

    const adAccountParsed = adAccountIdSchema.safeParse(req.nextUrl.searchParams.get('adAccountId'));
    if (!adAccountParsed.success) return NextResponse.json({ error: 'Conta de anúncios inválida.' }, { status: 400 });
    const normalized = adAccountParsed.data.startsWith('act_') ? adAccountParsed.data : `act_${adAccountParsed.data}`;
    const adAccount = adAccounts.find(item => item.id === normalized);
    if (!adAccount) return NextResponse.json({ error: 'A conta de anúncios informada não está acessível pela autorização Meta deste tenant.' }, { status: 403 });

    const pixels = await listMetaAdAccountPixels({
      accessToken: context.accessToken,
      appSecret: context.credentials.appSecret,
      adAccountId: adAccount.id,
    });
    return NextResponse.json({ tenant: context.tenant, connection: toSafeConnection(context.connection), adAccount, pixels });
  } catch (error) {
    console.error('Admin Meta tenant asset discovery failed', {
      tenantId: tenantParsed.data,
      resource: resourceParsed.data,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível consultar os ativos Meta deste tenant.' }, { status: 502 });
  }
});

export const PUT = withPlatformAdmin(async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `admin-meta-tenant-assets-write:${session.userId}:${getClientIp(req)}`, limit: 30, windowMs: 10 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas alterações de ativos Meta. Tente novamente em instantes.' }, { status: 429 });

  const parsed = bindingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Vinculação Meta inválida.', issues: parsed.error.flatten() }, { status: 400 });

  const context = await getDiscoveryContext(parsed.data.tenantId);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });

  try {
    const selection = await validateMetaAdAccountPixelSelection({
      accessToken: context.accessToken,
      appSecret: context.credentials.appSecret,
      adAccountId: parsed.data.adAccountId,
      pixelId: parsed.data.pixelId,
    });
    const now = new Date();

    // SECURITY: the binding and its platform audit entry are one atomic write.
    // If the audit insert fails, Prisma rolls back the binding instead of
    // leaving an unaudited cross-tenant security-sensitive change behind.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.tenantMetaConnection.updateMany({
        where: { id: context.connection.id, tenantId: parsed.data.tenantId, status: 'authorized' },
        data: {
          metaBusinessId: null,
          metaBusinessName: null,
          metaAdAccountId: selection.adAccount.id,
          metaAdAccountName: selection.adAccount.name,
          metaPixelId: selection.pixel.id,
          metaPixelName: selection.pixel.name,
          assetsSelectedAt: now,
          lastValidatedAt: now,
        },
      });
      if (updated.count !== 1) throw new MetaBindingChangedError();

      await tx.auditLog.create({
        data: {
          tenantId: parsed.data.tenantId,
          userId: session.userId,
          entityType: 'tenant_meta_connection',
          entityId: context.connection.id,
          action: 'META_ASSETS_BOUND_BY_PLATFORM_ADMIN',
          metadata: {
            adAccountId: selection.adAccount.id,
            adAccountName: selection.adAccount.name,
            pixelId: selection.pixel.id,
            pixelName: selection.pixel.name,
          } as any,
        },
      });
    });

    return NextResponse.json({
      tenant: context.tenant,
      selection: {
        adAccountId: selection.adAccount.id,
        adAccountName: selection.adAccount.name,
        pixelId: selection.pixel.id,
        pixelName: selection.pixel.name,
        selectedAt: now,
      },
    });
  } catch (error) {
    if (error instanceof MetaBindingChangedError) {
      return NextResponse.json({ error: 'A conexão Meta mudou durante a vinculação. Recarregue a página.' }, { status: 409 });
    }

    console.error('Admin Meta tenant asset binding failed', {
      tenantId: parsed.data.tenantId,
      operation: 'validate_and_bind',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível validar e vincular os ativos Meta deste tenant.' }, { status: 502 });
  }
});
