import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { runJevSyntheticReadinessProbe } from '@/lib/flip-ai/jev-decision-engine';
import { getClientIp, rateLimit, rateLimitResponse, withRateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };

function configuration() {
  return {
    apiKeyConfigured: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
    model: process.env.TYPESAFE_JEV_MODEL?.trim() || 'jev-latest',
    liveEnabled: process.env.FLIP_AI_JEV_ENABLED === 'true',
    tenantAllowlistConfigured: Boolean(process.env.FLIP_AI_JEV_TENANT_IDS?.trim()),
    realDataProcessingApproved: process.env.FLIP_AI_JEV_DATA_PROCESSING_APPROVED === 'true',
  };
}

export const GET = withPlatformAdmin(async () => NextResponse.json({
  configuration: configuration(),
  policy: {
    probeUsesSyntheticDataOnly: true,
    readsCustomerData: false,
    enablesLiveProcessing: false,
  },
}, { headers: noStore }));

export const POST = withPlatformAdmin(async (req, session) => {
  const limit = rateLimit({
    key: `admin:jev-readiness:${session.userId}:${getClientIp(req)}`,
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    return withRateLimitHeaders(NextResponse.json({
      ok: false,
      code: 'TYPESAFE_API_KEY_MISSING',
      message: 'Configure TYPESAFE_API_KEY somente no ambiente do servidor.',
      configuration: configuration(),
    }, { status: 503, headers: noStore }), limit);
  }

  try {
    const probe = await runJevSyntheticReadinessProbe();
    return withRateLimitHeaders(NextResponse.json({
      probe,
      configuration: configuration(),
      liveProcessingChanged: false,
    }, { headers: noStore }), limit);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : 'JEV_READINESS_FAILED';
    const providerStatus = /^JEV_HTTP_\d+$/.test(code) ? Number(code.slice('JEV_HTTP_'.length)) : null;
    console.error('[admin/integrations/jev/readiness][POST]', { code, providerStatus });
    return withRateLimitHeaders(NextResponse.json({
      ok: false,
      code,
      providerStatus,
      message: 'O teste sintético do JEV não foi confirmado.',
      configuration: configuration(),
      liveProcessingChanged: false,
    }, { status: providerStatus === 401 ? 502 : 503, headers: noStore }), limit);
  }
});
