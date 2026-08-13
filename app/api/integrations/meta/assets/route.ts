import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import {
  listMetaAdAccountPixels,
  listMetaBusinessAdAccounts,
  listMetaBusinesses,
  validateMetaAssetSelection,
} from '@/lib/meta/assets';

const resourceSchema = z.enum(['businesses', 'ad_accounts', 'pixels']);
const numericIdSchema = z.string().trim().regex(/^\d{1,64}$/);
const adAccountIdSchema = z.string().trim().regex(/^(?:act_)?\d{1,64}$/);
const selectionSchema = z.object({
  businessId: numericIdSchema,
  adAccountId: adAccountIdSchema,
  pixelId: numericIdSchema,
}).strict();

type MetaContext = {
  connection: {
    id: string;
    tokenExpiresAt: Date | null;
    accessTokenEncrypted: string;
  };
  accessToken: string;
  appSecret: string;
};

async function getMetaContext(tenantId: string): Promise<MetaContext | null> {
  const [credentials, connection] = await Promise.all([
    getPlatformMetaOAuthCredentials(),
    prisma.tenantMetaConnection.findFirst({
      where: { tenantId, status: 'authorized' },
      orderBy: { connectedAt: 'desc' },
      select: { id: true, tokenExpiresAt: true, accessTokenEncrypted: true },
    }),
  ]);
  if (!credentials || !connection) return null;
  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) return null;
  const accessToken = decryptIntegrationSecret(connection.accessTokenEncrypted);
  if (!accessToken) return null;
  return { connection, accessToken, appSecret: credentials.appSecret };
}

async function getAuthorizedBusiness(context: MetaContext, businessId: string) {
  const businesses = await listMetaBusinesses({ accessToken: context.accessToken, appSecret: context.appSecret });
  return businesses.find(item => item.id === businessId) ?? null;
}

export const GET = withPermission('INTEGRATIONS_VIEW', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `meta-assets-read:${session.tenantId}:${getClientIp(req)}`, limit: 60, windowMs: 10 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas consultas de ativos Meta. Tente novamente em instantes.' }, { status: 429 });

  const parsedResource = resourceSchema.safeParse(req.nextUrl.searchParams.get('resource') || 'businesses');
  if (!parsedResource.success) return NextResponse.json({ error: 'Recurso Meta inválido.' }, { status: 400 });

  const context = await getMetaContext(session.tenantId);
  if (!context) return NextResponse.json({ error: 'Autorize novamente a conta Meta antes de selecionar ativos.' }, { status: 409 });

  try {
    if (parsedResource.data === 'businesses') {
      const businesses = await listMetaBusinesses({ accessToken: context.accessToken, appSecret: context.appSecret });
      return NextResponse.json({ businesses });
    }

    const businessParsed = numericIdSchema.safeParse(req.nextUrl.searchParams.get('businessId'));
    if (!businessParsed.success) return NextResponse.json({ error: 'Empresa Meta inválida.' }, { status: 400 });
    const business = await getAuthorizedBusiness(context, businessParsed.data);
    if (!business) return NextResponse.json({ error: 'Esta empresa não foi autorizada para esta conexão.' }, { status: 403 });

    const adAccounts = await listMetaBusinessAdAccounts({
      accessToken: context.accessToken,
      appSecret: context.appSecret,
      businessId: business.id,
    });
    if (parsedResource.data === 'ad_accounts') return NextResponse.json({ business, adAccounts });

    const adAccountParsed = adAccountIdSchema.safeParse(req.nextUrl.searchParams.get('adAccountId'));
    if (!adAccountParsed.success) return NextResponse.json({ error: 'Conta de anúncios Meta inválida.' }, { status: 400 });
    const normalizedAccountId = adAccountParsed.data.startsWith('act_') ? adAccountParsed.data : `act_${adAccountParsed.data}`;
    const adAccount = adAccounts.find(item => item.id === normalizedAccountId);
    if (!adAccount) return NextResponse.json({ error: 'Esta conta de anúncios não pertence aos ativos autorizados da empresa.' }, { status: 403 });

    const pixels = await listMetaAdAccountPixels({
      accessToken: context.accessToken,
      appSecret: context.appSecret,
      adAccountId: adAccount.id,
    });
    return NextResponse.json({ business, adAccount, pixels });
  } catch (error) {
    console.error('Meta asset discovery failed', {
      tenantId: session.tenantId,
      resource: parsedResource.data,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível consultar os ativos autorizados na Meta.' }, { status: 502 });
  }
});

export const PUT = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `meta-assets-write:${session.tenantId}:${getClientIp(req)}`, limit: 20, windowMs: 10 * 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Muitas alterações de ativos Meta. Tente novamente em instantes.' }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Seleção de ativos Meta inválida.' }, { status: 400 });

  const context = await getMetaContext(session.tenantId);
  if (!context) return NextResponse.json({ error: 'Autorize novamente a conta Meta antes de selecionar ativos.' }, { status: 409 });

  try {
    const selection = await validateMetaAssetSelection({
      accessToken: context.accessToken,
      appSecret: context.appSecret,
      ...parsed.data,
    });
    const now = new Date();
    const updated = await prisma.tenantMetaConnection.updateMany({
      where: { id: context.connection.id, tenantId: session.tenantId, status: 'authorized' },
      data: {
        metaBusinessId: selection.business.id,
        metaBusinessName: selection.business.name,
        metaAdAccountId: selection.adAccount.id,
        metaAdAccountName: selection.adAccount.name,
        metaPixelId: selection.pixel.id,
        metaPixelName: selection.pixel.name,
        assetsSelectedAt: now,
        lastValidatedAt: now,
      },
    });
    if (updated.count !== 1) return NextResponse.json({ error: 'A conexão Meta mudou durante a seleção. Recarregue a página.' }, { status: 409 });

    return NextResponse.json({
      selection: {
        businessId: selection.business.id,
        businessName: selection.business.name,
        adAccountId: selection.adAccount.id,
        adAccountName: selection.adAccount.name,
        pixelId: selection.pixel.id,
        pixelName: selection.pixel.name,
        selectedAt: now,
      },
    });
  } catch (error) {
    console.error('Meta asset selection failed', {
      tenantId: session.tenantId,
      operation: 'validate_and_persist',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível validar e salvar os ativos selecionados na Meta.' }, { status: 502 });
  }
});
