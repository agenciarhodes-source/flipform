import 'server-only';

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getBusinessGroupAccessesForUser } from '@/lib/business-groups';

/**
 * Owners and admins of a business group also get their own user in each company of the group,
 * as Gestor. The audit entry written when that user is created is what marks it as coming from
 * the group: it does not take a seat of the company's plan and it is turned off by the group.
 */
export const GROUP_MEMBERSHIP_GRANTED = 'business_group.membership_granted';
export const GROUP_MEMBERSHIP_REVOKED = 'business_group.membership_revoked';
const GROUP_MANAGER_ROLES = ['owner', 'admin'];

async function isGroupManagerOfTenant(db: PrismaClient, userId: string, tenantId: string) {
  const state = await getBusinessGroupAccessesForUser(db, userId);
  return state.accesses.some((access) => GROUP_MANAGER_ROLES.includes(access.role)
    && access.tenants.some((tenant) => tenant.id === tenantId));
}

/** Creates the missing Gestor users of a group and turns off the ones the group no longer grants. */
export async function syncBusinessGroupMemberships(db: PrismaClient, input: { groupId: string; actorUserId: string }) {
  const [managers, tenants] = await Promise.all([
    db.$queryRaw<Array<{ user_id: string }>>(Prisma.sql`
      SELECT user_id FROM business_group_users
      WHERE group_id = ${input.groupId} AND status = 'active' AND role IN ('owner', 'admin')
    `),
    db.$queryRaw<Array<{ tenant_id: string }>>(Prisma.sql`
      SELECT tenant_id FROM business_group_tenants WHERE group_id = ${input.groupId}
    `),
  ]);

  let granted = 0;
  for (const { user_id: userId } of managers) {
    for (const { tenant_id: tenantId } of tenants) {
      const existing = await db.tenantUser.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { id: true, status: true } });
      if (existing?.status === 'active') continue;
      if (existing) {
        // Only a user the group created is turned back on; anyone else's access is the company's decision.
        const fromGroup = await db.auditLog.findFirst({ where: { tenantId, entityId: existing.id, action: GROUP_MEMBERSHIP_GRANTED }, select: { id: true } });
        if (!fromGroup) continue;
        await db.tenantUser.update({ where: { id: existing.id }, data: { status: 'active' } });
      } else {
        await db.$transaction(async (tx) => {
          const created = await tx.tenantUser.create({ data: { tenantId, userId, role: 'manager', status: 'active' } });
          await tx.auditLog.create({
            data: {
              tenantId, userId: input.actorUserId, entityType: 'tenant_user', entityId: created.id,
              action: GROUP_MEMBERSHIP_GRANTED, metadata: { groupId: input.groupId, memberUserId: userId },
            },
          });
        });
      }
      granted += 1;
    }
  }

  // Users this group created that it no longer grants: revoked member, removed company or lower role.
  let revoked = 0;
  const grants = await db.auditLog.findMany({
    where: { action: GROUP_MEMBERSHIP_GRANTED, metadata: { path: ['groupId'], equals: input.groupId } },
    select: { tenantId: true, entityId: true },
  });
  for (const grant of grants) {
    const membership = await db.tenantUser.findUnique({ where: { id: grant.entityId }, select: { id: true, userId: true, status: true } });
    if (!membership || membership.status !== 'active') continue;
    if (await isGroupManagerOfTenant(db, membership.userId, grant.tenantId)) continue;
    await db.tenantUser.update({ where: { id: membership.id }, data: { status: 'inactive' } });
    await db.auditLog.create({
      data: {
        tenantId: grant.tenantId, userId: input.actorUserId, entityType: 'tenant_user', entityId: membership.id,
        action: GROUP_MEMBERSHIP_REVOKED, metadata: { groupId: input.groupId, memberUserId: membership.userId },
      },
    });
    revoked += 1;
  }
  return { granted, revoked };
}

/** Active users that take a seat of the plan: everyone except the Gestores created by a group. */
export async function countPlanSeatUsers(tenantId: string) {
  const [active, grants] = await Promise.all([
    prisma.tenantUser.findMany({ where: { tenantId, status: 'active' }, select: { id: true } }),
    prisma.auditLog.findMany({ where: { tenantId, action: GROUP_MEMBERSHIP_GRANTED }, select: { entityId: true } }),
  ]);
  const fromGroup = new Set(grants.map((grant) => grant.entityId));
  return active.filter((membership) => !fromGroup.has(membership.id)).length;
}
