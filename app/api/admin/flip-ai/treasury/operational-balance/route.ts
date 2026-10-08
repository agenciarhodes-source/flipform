import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import {
  parseOperationalBalanceInput,
  setOpenAiOperationalBalanceReference,
} from '@/lib/flip-ai/operational-balance-setting';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const PUT = withPlatformAdmin(async (req, session) => {
  const body = await req.json().catch(() => null);
  const parsed = parseOperationalBalanceInput(body && typeof body === 'object' ? (body as { usd?: unknown }).usd : undefined);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Informe um valor em dólar entre 0 e 100.000.000.' }, { status: 400, headers: NO_STORE });
  }

  try {
    // A typed reference only: no billing, card, provider recharge or tenant wallet is touched.
    await setOpenAiOperationalBalanceReference({ usd: parsed.usd, userId: session.userId });
    await logPlatformAudit({
      userId: session.userId,
      entityType: 'platform',
      entityId: 'openai_operational_balance',
      action: 'platform.openai_operational_balance_reference_changed',
      metadata: { usd: parsed.usd },
    });
    return NextResponse.json({ ok: true, usd: parsed.usd }, { headers: NO_STORE });
  } catch (error) {
    const schemaPending = error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === 'P2021' || error.code === 'P2022');
    return NextResponse.json({
      error: schemaPending
        ? 'O saldo de referência ainda não pode ser salvo neste ambiente: a configuração não foi aplicada no banco.'
        : 'Não foi possível salvar o saldo de referência.',
    }, { status: schemaPending ? 503 : 500, headers: NO_STORE });
  }
});
