import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipAiError } from '@/lib/flip-ai/access';
import {
  getFlipAiCreditWalletForTenant,
  grantFlipAiCreditsByPlatformAdmin,
} from '@/lib/flip-ai/credits';

const grantSchema = z.object({
  amountCredits: z.number().int().positive().max(2_000_000_000),
  reason: z.string().trim().min(3).max(190),
  idempotencyIdentifier: z.string().trim().min(4).max(120)
    .regex(/^[A-Za-z0-9._:-]+$/, 'Use apenas letras, números, ponto, hífen, dois-pontos ou sublinhado.'),
}).strict();

export const GET = withPlatformAdmin(async (_req, _session, ctx: { params: { id: string } }) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.params.id }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
    const wallet = await getFlipAiCreditWalletForTenant(tenant.id, 100);
    return NextResponse.json({ wallet });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível carregar a carteira Flip AI.' }, { status: 500 });
  }
});

export const POST = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const parsed = grantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' }, { status: 400 });
  }

  try {
    const result = await grantFlipAiCreditsByPlatformAdmin({
      tenantId: ctx.params.id,
      amountCredits: parsed.data.amountCredits,
      reason: parsed.data.reason,
      idempotencyIdentifier: parsed.data.idempotencyIdentifier,
      actorUserId: session.userId,
    });
    return NextResponse.json({
      ok: true,
      entryId: result.entryId,
      balanceCredits: result.balanceCredits,
      reused: result.reused,
    });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível adicionar créditos à carteira.' }, { status: 500 });
  }
});
