import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { HealthAuditSnapshot, MetaConnectionHealthState } from './connection-health-types';

export function jsonMetadata(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseHealthAudit(item: { createdAt: Date; metadata: Prisma.JsonValue | null } | null): HealthAuditSnapshot {
  if (!item) return null;
  const metadata = jsonMetadata(item.metadata);
  const state = typeof metadata.state === 'string' ? metadata.state : '';
  if (!['healthy', 'degraded', 'action_required', 'expired', 'revoked', 'provider_error', 'not_connected'].includes(state)) {
    return null;
  }
  return {
    state: state as MetaConnectionHealthState,
    reason: typeof metadata.reason === 'string' ? metadata.reason : 'unknown',
    createdAt: item.createdAt,
  };
}

export async function getLatestConnectionHealthAudit(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  connectedAt: Date;
}) {
  const item = await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      createdAt: { gte: input.connectedAt },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, metadata: true },
  });
  return parseHealthAudit(item);
}

export function getRecentHealthFailure(audit: HealthAuditSnapshot, connectedAt: Date) {
  if (!audit || audit.createdAt.getTime() < connectedAt.getTime()) return null;
  return ['action_required', 'expired', 'provider_error'].includes(audit.state) ? audit : null;
}

export async function writeConnectionHealthAudit(input: {
  tenantId: string;
  userId: string;
  entityType: 'tenant_instagram_connection' | 'tenant_whatsapp_connection';
  entityId: string;
  action: string;
  state: MetaConnectionHealthState;
  reason: string;
  providerStatus?: number | null;
  providerCode?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const checkedAt = new Date();
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      metadata: {
        state: input.state,
        reason: input.reason,
        checkedAt: checkedAt.toISOString(),
        providerStatus: input.providerStatus ?? null,
        providerCode: input.providerCode ?? null,
        ...(input.metadata || {}),
      } as Prisma.InputJsonValue,
    },
  });
  return checkedAt;
}
