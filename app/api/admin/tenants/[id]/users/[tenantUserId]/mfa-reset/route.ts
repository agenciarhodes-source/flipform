import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';

const bodySchema = z.object({
  reason: z.string().trim().min(10, 'Descreva como a identidade foi confirmada (mínimo 10 caracteres).').max(500),
}).strict();

/**
 * Lost phone and lost recovery codes (security protocol S5): only the Super Admin turns the
 * two-step verification off for someone, after confirming who they are. Every open session of
 * that person ends, and the reason is kept in the platform audit log.
 */
export const POST = withPlatformAdmin(async (req, session, ctx: { params: { id: string; tenantUserId: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

  const target = await prisma.tenantUser.findFirst({
    where: { id: ctx.params.tenantUserId, tenantId: ctx.params.id },
    select: { userId: true, user: { select: { email: true, mfaEnabledAt: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Usuário da empresa não encontrado.' }, { status: 404 });
  if (!target.user.mfaEnabledAt) return NextResponse.json({ ok: true, unchanged: true });

  await prisma.user.update({
    where: { id: target.userId },
    data: {
      mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaEnabledAt: null,
      mfaLastCounter: null, mfaRecoveryHashes: [], sessionVersion: { increment: 1 },
    },
  });
  await logPlatformAudit({
    tenantId: ctx.params.id, userId: session.userId,
    entityType: 'user', entityId: target.userId, action: 'platform.user_mfa_reset',
    metadata: { email: target.user.email, reason: parsed.data.reason },
  });
  return NextResponse.json({ ok: true });
});
