import { NextResponse } from 'next/server';
import { resolveOpenAiOperationalBalanceReference } from '@/lib/flip-ai/operational-balance-setting';
import { withPlatformAdmin } from '@/lib/auth';
import {
  getOpenAiAdminObservability,
  OpenAiAdminObservabilityError,
  resolveOpenAiObservabilityDays,
} from '@/lib/flip-ai/openai-admin-observability';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async (req) => {
  const url = new URL(req.url);
  const requestedDays = Number(url.searchParams.get('days') || '30');

  let days: number;
  try {
    days = resolveOpenAiObservabilityDays(requestedDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Período inválido.';
    return NextResponse.json({ error: message, code: 'invalid_range' }, { status: 400 });
  }

  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  if (!adminKey) {
    return NextResponse.json({
      configured: false,
      code: 'OPENAI_ADMIN_KEY_MISSING',
      message: 'Configure OPENAI_ADMIN_KEY no ambiente do servidor para habilitar este painel.',
      operationalBalanceConfigured: Boolean(process.env.OPENAI_OPERATIONAL_BALANCE_USD?.trim()),
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const observability = await getOpenAiAdminObservability({
      adminKey,
      organizationId: process.env.OPENAI_ORGANIZATION_ID?.trim() || null,
      operationalBalanceRaw: (await resolveOpenAiOperationalBalanceReference()).raw,
      days,
    });

    return NextResponse.json({
      configured: true,
      observability,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const err = error instanceof OpenAiAdminObservabilityError ? error : null;
    console.error('[admin/openai/observability][GET]', {
      code: err?.code || 'UNKNOWN',
      providerStatus: err?.providerStatus ?? null,
      providerCode: err?.providerCode ?? null,
      requestId: err?.requestId ?? null,
    });

    const status = err?.providerStatus === 401 || err?.providerStatus === 403 ? 502 : 503;
    return NextResponse.json({
      configured: true,
      error: err?.message || 'Não foi possível consultar os dados operacionais da OpenAI.',
      code: err?.code || 'OPENAI_ADMIN_OBSERVABILITY_FAILED',
      providerStatus: err?.providerStatus ?? null,
      requestId: err?.requestId ?? null,
    }, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
});
