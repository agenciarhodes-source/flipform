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
  const { name, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    // A developer account exists independently of companies. It is NOT a platform admin.
    // Each company must be authorized separately through a tenant-scoped grant.
    const account = await prisma.user.create({
      data: { name, email, passwordHash, globalRole: 'developer_account' },
      select: { id: true, name: true, email: true },
    });
    await logPlatformAudit({
      tenantId: null, userId: session.userId, entityType: 'user', entityId: account.id,
      action: 'developer.account_created', metadata: { targetUserId: account.id },
    });
    return NextResponse.json({ account }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe uma conta com este e-mail. Selecione-a na lista.' }, { status: 409 });
    }
    console.error('[developer-account-create]', error);
    return NextResponse.json({ error: 'Não foi possível criar a conta técnica.' }, { status: 500 });
  }
});
