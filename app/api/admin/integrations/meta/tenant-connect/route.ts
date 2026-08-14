import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getMetaOAuthRedirectUri, getPlatformMetaOAuthCredentials } from '@/lib/meta/platform-settings';
import { buildMetaAuthorizationUrl } from '@/lib/meta/oauth';
import { META_ADS_ONBOARDING_PURPOSE } from '@/lib/meta/onboarding';
import {
  createPlatformManagedMetaOAuthStateForPurpose,
  META_OAUTH_STATE_COOKIE,
  META_OAUTH_STATE_COOKIE_PATH,
  META_OAUTH_STATE_TTL_SECONDS,
} from '@/lib/meta/oauth-state';

const bodySchema = z.object({ tenantId: z.string().trim().uuid() }).strict();

export const POST = withPlatformAdmin(async (req: NextRequest, session) => {
  const rl = rateLimit({
    key: `admin-meta-oauth-connect:${session.userId}:${getClientIp(req)}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tenant inválido.' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 });

  const credentials = await getPlatformMetaOAuthCredentials();
  if (!credentials?.businessLoginConfigId) {
    return NextResponse.json({ error: 'A conexão empresarial da Meta ainda não foi configurada pela plataforma.' }, { status: 503 });
  }

  const oauthState = createPlatformManagedMetaOAuthStateForPurpose(
    tenant.id,
    session.userId,
    META_ADS_ONBOARDING_PURPOSE,
  );
  const authorizationUrl = buildMetaAuthorizationUrl({
    appId: credentials.appId,
    redirectUri: getMetaOAuthRedirectUri(),
    state: oauthState.state,
    businessLoginConfigId: credentials.businessLoginConfigId,
  });

  const response = NextResponse.json({ authorizationUrl, tenant });
  response.cookies.set(META_OAUTH_STATE_COOKIE, oauthState.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: META_OAUTH_STATE_COOKIE_PATH,
    maxAge: META_OAUTH_STATE_TTL_SECONDS,
  });
  return response;
});
