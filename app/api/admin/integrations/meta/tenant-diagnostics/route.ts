import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { getClientIp, rateLimit } from '@/lib/rate-limit';
import { getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import { getMetaAdsReadOnlyDiagnostics } from '@/lib/meta/ads-diagnostics';

const tenantIdSchema = z.string().trim().uuid();

export const GET = withPlatformAdmin(async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `admin-meta-ads-diagnostics:${session.userId}:${getClientIp(req)}`,
    limit: 60,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Muitas consultas de diagnóstico Meta. Tente novamente em instantes.' }, { status: 429 });
  }

  const tenantParsed = tenantIdSchema.safeParse(req.nextUrl.searchParams.get('tenantId'));
  if (!tenantParsed.success) return NextResponse.json({ error: 'Tenant inválido.' }, { status: 400 });

  const now = new Date();
  const [tenant, credentials, connection] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantParsed.data },
      select: { id: true, name: true, slug: true },
    }),
    getPlatformMetaOAuthCredentials(),
    prisma.tenantMetaConnection.findFirst({
      where: { tenantId: tenantParsed.data, status: 'authorized' },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        accessTokenEncrypted: true,
        tokenExpiresAt: true,
        metaAdAccountId: true,
        metaAdAccountName: true,
        metaPixelId: true,
        metaPixelName: true,
        connectedAt: true,
        lastValidatedAt: true,
      },
    }),
  ]);

  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });
  if (!credentials) return NextResponse.json({ error: 'A integração Meta da plataforma não está configurada.' }, { status: 503 });
  if (!connection) return NextResponse.json({ error: 'Este tenant não possui uma conexão Meta autorizada.' }, { status: 409 });
  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= now) {
    return NextResponse.json({ error: 'A autorização Meta deste tenant expirou.' }, { status: 409 });
  }
  if (!connection.metaAdAccountId || !connection.metaPixelId) {
    return NextResponse.json({ error: 'Este tenant ainda não possui conta de anúncios e Pixel / Dataset vinculados.' }, { status: 409 });
  }

  const accessToken = decryptIntegrationSecret(connection.accessTokenEncrypted);
  if (!accessToken) return NextResponse.json({ error: 'O token Meta deste tenant não está disponível.' }, { status: 409 });

  try {
    const diagnostics = await getMetaAdsReadOnlyDiagnostics({
      accessToken,
      appSecret: credentials.appSecret,
      adAccountId: connection.metaAdAccountId,
    });

    return NextResponse.json({
      tenant,
      binding: {
        adAccountId: connection.metaAdAccountId,
        adAccountName: connection.metaAdAccountName,
        pixelId: connection.metaPixelId,
        pixelName: connection.metaPixelName,
        connectedAt: connection.connectedAt,
        lastValidatedAt: connection.lastValidatedAt,
      },
      diagnostics,
      readOnly: true,
    });
  } catch (error) {
    console.error('Meta Ads read-only tenant diagnostics failed', {
      tenantId: tenant.id,
      operation: 'read_only_diagnostics',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Não foi possível consultar o diagnóstico da conta Meta.' }, { status: 502 });
  }
});
