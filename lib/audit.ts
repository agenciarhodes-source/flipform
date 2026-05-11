import { prisma } from './prisma';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, any>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        metadata: entry.metadata as any,
      },
    });
  } catch (e) {
    // Falha de auditoria nao bloqueia a acao principal
    console.error('audit log error', e);
  }
}

export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}
