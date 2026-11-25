import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPlatformAdmin, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

// Only the platform Super Admin can provision a distinct technical account.
// Creating an account does not grant access to any tenant or bypass MFA.
const input = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(128),
  tenantId: z.string().uuid(),
}).strict();

export const POST = withPlatformAdmin(async (req: NextRequest, session) => {
  const now = Math.floor(Date.now() / 1000);
  if (!session.mfaVerifiedAt || !Number.isSafeInteger(session.mfaVerifiedAt)
      || session.mfaVerifiedAt > now + 60 || now - session.mfaVerifiedAt > 15 * 60) {
    return NextResponse.json({ error: 'Confirme novamente o MFA do Super Admin.' }, { status: 403 });
  }
  if (req.headers.get('origin') !== req.nextUrl.origin
      || (req.headers.get('sec-fetch-site') && req.headers.get('sec-fetch-site') !== 'same-origin')) {
    return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  }
  const limit = await rateLimit({
    key: 'developer-account-create:' + session.userId + ':' + getClientIp(req),
    limit: 5, windowMs: 10 * 60_000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Informe nome, e-mail válido e senha inicial com no mínimo 12 caracteres.' }, { status: 400 });
  }
  const { name, email, password, tenantId } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    // Create the account and authorize the selected company atomically.
    // A newly-created account cannot be left with an unintended partial grant.
    const account = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId }, select: { id: true, status: true },
      });
      if (!tenant || !['active', 'trial'].includes(tenant.status)) {
        throw new Error('TENANT_NOT_ELIGIBLE');
      }
      const user = await tx.user.create({
        data: { name, email, passwordHash, globalRole: null },
        select: { id: true, name: true, email: true },
      });
      await tx.tenantUser.create({
        data: { userId: user.id, tenantId, role: 'viewer', status: 'active' },
      });
      await tx.allowedUser.create({
        data: {
          tenantId, email, role: 'viewer', status: 'active', active: true,
          source: 'developer_grant', invitedBy: session.userId,
        },
      });
      await tx.developerTenantGrant.create({
        data: { tenantId, userId: user.id, grantedById: session.userId },
      });
      return user;
    });
    await logPlatformAudit({
      tenantId, userId: session.userId, entityType: 'user', entityId: account.id,
      action: 'developer.account_created', metadata: { targetUserId: account.id, tenantId },
    });
    return NextResponse.json({ account }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'TENANT_NOT_ELIGIBLE') {
      return NextResponse.json({ error: 'Empresa não disponível para receber o Desenvolvedor.' }, { status: 409 });
    }
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe uma conta com este e-mail. Selecione-a na lista.' }, { status: 409 });
    }
    console.error('[developer-account-create]', error);
    return NextResponse.json({ error: 'Não foi possível criar a conta técnica.' }, { status: 500 });
  }
});
