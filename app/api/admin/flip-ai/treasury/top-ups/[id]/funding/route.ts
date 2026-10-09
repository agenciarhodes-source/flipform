import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { setTopUpFunded } from '@/lib/flip-ai/top-up-funding';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const PUT = withPlatformAdmin<{ params: { id: string } }>(async (req, session, { params }) => {
  const body = await req.json().catch(() => null);
  const funded = body && typeof body === 'object' ? (body as { funded?: unknown }).funded : undefined;
  if (typeof funded !== 'boolean') {
    return NextResponse.json({ error: 'Informe se o valor foi atribuído.' }, { status: 400, headers: NO_STORE });
  }

  try {
    // A control note only: no payment, provider recharge or company wallet is touched.
    const result = await setTopUpFunded({ orderId: params.id, funded, userId: session.userId });
    if (!result) {
      return NextResponse.json({ error: 'Recarga não encontrada.' }, { status: 404, headers: NO_STORE });
    }
    await logPlatformAudit({
      tenantId: result.tenantId,
      userId: session.userId,
      entityType: 'flip_ai_top_up_order',
      entityId: result.orderId,
      action: funded ? 'platform.top_up_funding_marked' : 'platform.top_up_funding_unmarked',
      metadata: { fundedUsd: result.fundedUsd },
    });
    return NextResponse.json({ ok: true, funded: result.funded }, { headers: NO_STORE });
  } catch (error) {
    const schemaPending = error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === 'P2021' || error.code === 'P2022');
    return NextResponse.json({
      error: schemaPending
        ? 'O controle de valor atribuído ainda não pode ser salvo neste ambiente: a tabela não foi criada no banco.'
        : 'Não foi possível salvar o controle desta recarga.',
    }, { status: schemaPending ? 503 : 500, headers: NO_STORE });
  }
});
