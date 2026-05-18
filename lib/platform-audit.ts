import { prisma } from './prisma';

/**
 * Audit log da plataforma (nível super admin).
 * Diferente do logAudit padrão, este pode receber um tenantId opcional.
 * Quando tenantId é informado, registra no audit_logs do tenant relevante;
 * caso contrário, tenta achar qualquer tenant para o registro existir.
 *
 * userId é opcional para permitir eventos gerados por jobs/cron/sistema,
 * já que audit_logs.user_id é nullable no schema Prisma.
 */
export async function logPlatformAudit(params: {
  tenantId?: string | null;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, any>;
}) {
  const { userId, entityType, entityId, action, metadata } = params;
  let tenantId = params.tenantId;

  if (!tenantId) {
    const anyTenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!anyTenant) return; // sem tenants ainda
    tenantId = anyTenant.id;
  }

  try {
    await prisma.auditLog.create({
      data: { tenantId, userId: userId || null, entityType, entityId, action, metadata: (metadata || {}) as any },
    });
  } catch (e) {
    console.error('logPlatformAudit error', e);
  }
}
