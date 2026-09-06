import { hashPassword } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { prisma } from '@/lib/prisma';

export class GroupAccessAccountError extends Error {
  code: string;
  status: number;

  constructor(code: string, message = code, status = 400) {
    super(message);
    this.name = 'GroupAccessAccountError';
    this.code = code;
    this.status = status;
  }
}

export async function createGroupAccessAccount(input: {
  email: string;
  password: string;
  adminUserId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  if (!/.+@.+\..+/.test(email)) throw new GroupAccessAccountError('INVALID_EMAIL', 'E-mail inválido.');
  if (!input.password || input.password.length < 8) {
    throw new GroupAccessAccountError('INVALID_PASSWORD', 'Senha deve ter ao menos 8 caracteres.');
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new GroupAccessAccountError(
      'ACCESS_ACCOUNT_EXISTS',
      'Este e-mail já possui um acesso cadastrado. Selecione esse acesso ao configurar o grupo empresarial.',
      409,
    );
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      name: email.split('@')[0] || email,
      passwordHash,
      globalRole: null,
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  try {
    await logPlatformAudit({
      tenantId: null,
      userId: input.adminUserId || null,
      entityType: 'user',
      entityId: user.id,
      action: 'group_access.account_created',
      metadata: { email: user.email, tenantCreated: false, allowedUserCreated: false },
    });
  } catch (auditError) {
    console.error('[group-access-account-service][audit]', auditError);
  }

  return user;
}
