import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled, API_V1_MAX_ACTIVE_KEYS_PER_INTEGRATION } from './policy';
import { mayManageApiV1Credentials } from './prisma-credential-repository';
import type { ApiV1KeyActor } from './credential-lifecycle';

const MAX_INTEGRATIONS_PER_TENANT = 4;
const NAME = /^[^<>\x00-\x1f\x7f]{2,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApiV1IntegrationSummary = {
  id: string; displayName: string; status: string; createdAt: Date; updatedAt: Date;
};

export async function listApiV1Integrations(
  actor: ApiV1KeyActor, db: PrismaClient = prisma,
): Promise<ApiV1IntegrationSummary[] | null> {
  if (!apiV1Enabled(process.env) || !actor.tenantId || !actor.userId) return null;
  try {
    if (!await mayManageApiV1Credentials(actor, actor.tenantId, db)) return null;
    return await db.apiIntegration.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, displayName: true, status: true, createdAt: true, updatedAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_INTEGRATIONS_PER_TENANT + 1,
    });
  } catch { return null; }
}

export async function createApiV1Integration(
  actor: ApiV1KeyActor, displayName: string, db: PrismaClient = prisma,
): Promise<ApiV1IntegrationSummary | null> {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!apiV1Enabled(process.env) || !actor.tenantId || !actor.userId
    || !NAME.test(name)) return null;
  try {
    return await db.$transaction(async tx => {
      if (!await mayManageApiV1Credentials(actor, actor.tenantId, tx)) return null;
      // Serialize all integration creations for this tenant before count+insert.
      // READ COMMITTED transactions without this lock could exceed the cap.
      const lockedTenant = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tenants WHERE id = ${actor.tenantId} FOR UPDATE
      `;
      if (lockedTenant.length !== 1) return null;
      const count = await tx.apiIntegration.count({ where: { tenantId: actor.tenantId } });
      if (count >= MAX_INTEGRATIONS_PER_TENANT) return null;
      const row = await tx.apiIntegration.create({
        data: { tenantId: actor.tenantId, displayName: name, status: 'disabled' },
        select: { id: true, displayName: true, status: true, createdAt: true, updatedAt: true },
      });
      await tx.auditLog.create({ data: {
        tenantId: actor.tenantId, userId: actor.userId,
        entityType: 'api_v1_integration', entityId: row.id, action: 'api_v1.integration_created',
      } });
      return row;
    });
  } catch { return null; }
}

/** No hard-delete: disabling immediately prevents existing keys from authenticating. */
export async function setApiV1IntegrationState(
  actor: ApiV1KeyActor, integrationId: string, state: 'active' | 'disabled',
  db: PrismaClient = prisma,
): Promise<ApiV1IntegrationSummary | null> {
  if (!apiV1Enabled(process.env) || !actor.userId || !actor.tenantId
    || !UUID.test(integrationId) || !['active', 'disabled'].includes(state)) return null;
  try {
    return await db.$transaction(async tx => {
      if (!await mayManageApiV1Credentials(actor, actor.tenantId, tx)) return null;
      const existing = await tx.apiIntegration.findFirst({
        where: { id: integrationId, tenantId: actor.tenantId },
        select: { status: true },
      });
      if (!existing) return null;
      if (existing.status !== state) {
        const changed = await tx.apiIntegration.updateMany({
          where: { id: integrationId, tenantId: actor.tenantId, status: existing.status },
          data: { status: state },
        });
        if (changed.count !== 1) return null;
        await tx.auditLog.create({ data: {
          tenantId: actor.tenantId, userId: actor.userId,
          entityType: 'api_v1_integration', entityId: integrationId,
          action: state === 'active' ? 'api_v1.integration_activated' : 'api_v1.integration_disabled',
        } });
      }
      return tx.apiIntegration.findFirst({
        where: { id: integrationId, tenantId: actor.tenantId },
        select: { id: true, displayName: true, status: true, createdAt: true, updatedAt: true },
      });
    });
  } catch { return null; }
}

export async function listApiV1Keys(
  actor: ApiV1KeyActor, integrationId: string, db: PrismaClient = prisma,
) {
  if (!apiV1Enabled(process.env) || !actor.userId || !actor.tenantId
    || !UUID.test(integrationId)) return null;
  try {
    if (!await mayManageApiV1Credentials(actor, actor.tenantId, db)) return null;
    const integration = await db.apiIntegration.findFirst({
      where: { id: integrationId, tenantId: actor.tenantId }, select: { id: true },
    });
    if (!integration) return null;
    // Explicitly omit secretHashHex. Never return the original key from storage.
    return await db.apiCredential.findMany({
      where: { tenantId: actor.tenantId, integrationId },
      select: { id: true, scopes: true, expiresAt: true, revokedAt: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 30,
    });
  } catch { return null; }
}

export async function belowApiV1KeyLimit(
  actor: ApiV1KeyActor, integrationId: string, db: PrismaClient = prisma,
): Promise<boolean> {
  if (!apiV1Enabled(process.env) || !actor.tenantId || !actor.userId
    || !UUID.test(integrationId)) return false;
  try {
    if (!await mayManageApiV1Credentials(actor, actor.tenantId, db)) return false;
    const count = await db.apiCredential.count({
      where: { tenantId: actor.tenantId, integrationId, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    return count < API_V1_MAX_ACTIVE_KEYS_PER_INTEGRATION;
  } catch { return false; }
}
