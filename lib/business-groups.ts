import { randomUUID } from 'crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export type BusinessGroupRole = 'owner' | 'admin' | 'viewer';

export type BusinessGroupTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type BusinessGroupAccess = {
  id: string;
  name: string;
  slug: string;
  role: BusinessGroupRole;
  status: string;
  tenants: BusinessGroupTenant[];
};

export type BusinessGroupAccessState = {
  schemaReady: boolean;
  accesses: BusinessGroupAccess[];
};

export type BusinessGroupAdminMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: BusinessGroupRole;
  status: string;
};

export type BusinessGroupAdminAccess = {
  userId: string;
  name: string;
  email: string;
};

export type BusinessGroupAdminItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  tenants: BusinessGroupTenant[];
  members: BusinessGroupAdminMember[];
};

export class BusinessGroupError extends Error {
  constructor(
    public code:
      | 'BUSINESS_GROUP_SCHEMA_NOT_READY'
      | 'BUSINESS_GROUP_NOT_FOUND'
      | 'BUSINESS_GROUP_USER_NOT_FOUND'
      | 'BUSINESS_GROUP_TENANT_NOT_FOUND'
      | 'BUSINESS_GROUP_FORBIDDEN'
      | 'INVALID_BUSINESS_GROUP_ROLE',
    message: string,
  ) {
    super(message);
  }
}

type AccessRow = {
  group_id: string;
  group_name: string;
  group_slug: string;
  group_status: string;
  role: string;
  member_status: string;
};

type TenantRow = {
  group_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
};

type AdminGroupRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type AdminMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

function isMissingBusinessGroupTable(error: any): boolean {
  if (error?.code === 'P2021') return true;
  if (error?.code !== 'P2010') return false;
  const providerCode = String(error?.meta?.code || '');
  const providerMessage = String(error?.meta?.message || '').toLowerCase();
  return providerCode === '42P01'
    || providerMessage.includes('business_groups')
    || providerMessage.includes('business_group_tenants')
    || providerMessage.includes('business_group_users')
    || providerMessage.includes('does not exist');
}

function isBusinessGroupRole(value: string): value is BusinessGroupRole {
  return ['owner', 'admin', 'viewer'].includes(value);
}

export function mapBusinessGroupRoleToTenantRole(role: BusinessGroupRole): 'owner' | 'admin' | 'viewer' {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  return 'viewer';
}

function normalizeSlug(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'grupo';
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function getBusinessGroupAccessesForUser(db: Db, userId: string): Promise<BusinessGroupAccessState> {
  try {
    const accessRows = await db.$queryRaw<AccessRow[]>(Prisma.sql`
      SELECT
        bg.id AS group_id,
        bg.name AS group_name,
        bg.slug AS group_slug,
        bg.status AS group_status,
        bgu.role,
        bgu.status AS member_status
      FROM business_group_users bgu
      INNER JOIN business_groups bg ON bg.id = bgu.group_id
      WHERE bgu.user_id = ${userId}
        AND bgu.status = 'active'
        AND bg.status = 'active'
      ORDER BY bgu.created_at ASC
    `);

    if (!accessRows.length) return { schemaReady: true, accesses: [] };

    const groupIds = accessRows.map((row) => row.group_id);
    const tenantRows = await db.$queryRaw<TenantRow[]>(Prisma.sql`
      SELECT
        bgt.group_id,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.status::text AS tenant_status
      FROM business_group_tenants bgt
      INNER JOIN tenants t ON t.id = bgt.tenant_id
      WHERE bgt.group_id IN (${Prisma.join(groupIds)})
      ORDER BY t.name ASC
    `);

    const tenantsByGroup = new Map<string, BusinessGroupTenant[]>();
    for (const row of tenantRows) {
      const list = tenantsByGroup.get(row.group_id) || [];
      list.push({
        id: row.tenant_id,
        name: row.tenant_name,
        slug: row.tenant_slug,
        status: row.tenant_status,
      });
      tenantsByGroup.set(row.group_id, list);
    }

    const accesses: BusinessGroupAccess[] = accessRows
      .filter((row) => isBusinessGroupRole(row.role))
      .map((row) => ({
        id: row.group_id,
        name: row.group_name,
        slug: row.group_slug,
        role: row.role as BusinessGroupRole,
        status: row.group_status,
        tenants: tenantsByGroup.get(row.group_id) || [],
      }));

    return { schemaReady: true, accesses };
  } catch (error) {
    if (!isMissingBusinessGroupTable(error)) throw error;
    return { schemaReady: false, accesses: [] };
  }
}

export async function getBusinessGroupAdminSnapshot(db: PrismaClient) {
  const [availableTenants, users] = await Promise.all([
    db.tenant.findMany({
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { name: 'asc' },
    }),
    db.user.findMany({
      select: { id: true, name: true, email: true, globalRole: true },
      orderBy: { email: 'asc' },
    }),
  ]);
  const availableAccesses: BusinessGroupAdminAccess[] = users
    .filter((user) => user.globalRole !== 'platform_admin')
    .map((user) => ({ userId: user.id, name: user.name, email: user.email }));

  try {
    const [groupRows, tenantRows, memberRows] = await Promise.all([
      db.$queryRaw<AdminGroupRow[]>(Prisma.sql`
        SELECT id, name, slug, status
        FROM business_groups
        ORDER BY created_at ASC
      `),
      db.$queryRaw<TenantRow[]>(Prisma.sql`
        SELECT
          bgt.group_id,
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.slug AS tenant_slug,
          t.status::text AS tenant_status
        FROM business_group_tenants bgt
        INNER JOIN tenants t ON t.id = bgt.tenant_id
        ORDER BY t.name ASC
      `),
      db.$queryRaw<AdminMemberRow[]>(Prisma.sql`
        SELECT
          bgu.id,
          bgu.group_id,
          u.id AS user_id,
          u.name,
          u.email,
          bgu.role,
          bgu.status
        FROM business_group_users bgu
        INNER JOIN users u ON u.id = bgu.user_id
        ORDER BY bgu.created_at ASC
      `),
    ]);

    const groups: BusinessGroupAdminItem[] = groupRows.map((group) => ({
      ...group,
      tenants: tenantRows
        .filter((row) => row.group_id === group.id)
        .map((row) => ({
          id: row.tenant_id,
          name: row.tenant_name,
          slug: row.tenant_slug,
          status: row.tenant_status,
        })),
      members: memberRows
        .filter((row) => row.group_id === group.id && isBusinessGroupRole(row.role))
        .map((row) => ({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          email: row.email,
          role: row.role as BusinessGroupRole,
          status: row.status,
        })),
    }));

    return {
      schemaReady: true,
      groups,
      availableTenants: availableTenants.map((tenant) => ({ ...tenant, status: String(tenant.status) })),
      availableAccesses,
    };
  } catch (error) {
    if (!isMissingBusinessGroupTable(error)) throw error;
    return {
      schemaReady: false,
      groups: [] as BusinessGroupAdminItem[],
      availableTenants: availableTenants.map((tenant) => ({ ...tenant, status: String(tenant.status) })),
      availableAccesses,
    };
  }
}

export async function createBusinessGroup(db: PrismaClient, input: { name: string; actorUserId: string }) {
  const name = input.name.trim();
  if (name.length < 2) throw new BusinessGroupError('BUSINESS_GROUP_NOT_FOUND', 'Informe um nome válido para o grupo.');
  const id = randomUUID();
  const slug = normalizeSlug(name);

  try {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO business_groups (id, name, slug, status, created_by, created_at, updated_at)
      VALUES (${id}, ${name}, ${slug}, 'active', ${input.actorUserId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    return { id, name, slug, status: 'active' };
  } catch (error) {
    if (isMissingBusinessGroupTable(error)) {
      throw new BusinessGroupError('BUSINESS_GROUP_SCHEMA_NOT_READY', 'A estrutura de grupos empresariais ainda não foi instalada.');
    }
    throw error;
  }
}

async function assertGroupExists(db: Db, groupId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM business_groups WHERE id = ${groupId} LIMIT 1
  `);
  if (!rows.length) throw new BusinessGroupError('BUSINESS_GROUP_NOT_FOUND', 'Grupo empresarial não encontrado.');
}

export async function replaceBusinessGroupTenants(db: PrismaClient, input: {
  groupId: string;
  tenantIds: string[];
  actorUserId: string;
}) {
  const tenantIds = [...new Set(input.tenantIds)];
  try {
    await assertGroupExists(db, input.groupId);
    const tenants = tenantIds.length
      ? await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true } })
      : [];
    if (tenants.length !== tenantIds.length) {
      throw new BusinessGroupError('BUSINESS_GROUP_TENANT_NOT_FOUND', 'Uma ou mais empresas selecionadas não existem.');
    }

    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM business_group_tenants
        WHERE group_id = ${input.groupId}
      `);
      for (const tenantId of tenantIds) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO business_group_tenants (id, group_id, tenant_id, created_by, created_at)
          VALUES (${randomUUID()}, ${input.groupId}, ${tenantId}, ${input.actorUserId}, CURRENT_TIMESTAMP)
        `);
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE business_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = ${input.groupId}
      `);
    });
  } catch (error) {
    if (isMissingBusinessGroupTable(error)) {
      throw new BusinessGroupError('BUSINESS_GROUP_SCHEMA_NOT_READY', 'A estrutura de grupos empresariais ainda não foi instalada.');
    }
    throw error;
  }
}

export async function upsertBusinessGroupMember(db: PrismaClient, input: {
  groupId: string;
  userId?: string;
  email?: string;
  role: BusinessGroupRole;
  status?: 'active' | 'revoked';
  actorUserId: string;
}) {
  if (!isBusinessGroupRole(input.role)) {
    throw new BusinessGroupError('INVALID_BUSINESS_GROUP_ROLE', 'Papel de grupo inválido.');
  }

  const email = input.email?.trim().toLowerCase();
  const user = input.userId
    ? await db.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, name: true } })
    : email
      ? await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } })
      : null;
  if (!user) {
    throw new BusinessGroupError('BUSINESS_GROUP_USER_NOT_FOUND', 'Selecione um acesso cadastrado no FlipForm.');
  }

  try {
    await assertGroupExists(db, input.groupId);
    await db.$executeRaw(Prisma.sql`
      INSERT INTO business_group_users (
        id, group_id, user_id, role, status, created_by, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${input.groupId}, ${user.id}, ${input.role}, ${input.status || 'active'}, ${input.actorUserId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (group_id, user_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `);
    return user;
  } catch (error) {
    if (isMissingBusinessGroupTable(error)) {
      throw new BusinessGroupError('BUSINESS_GROUP_SCHEMA_NOT_READY', 'A estrutura de grupos empresariais ainda não foi instalada.');
    }
    throw error;
  }
}

export function findAuthorizedBusinessGroupTenant(
  state: BusinessGroupAccessState,
  input: { groupId: string; tenantId: string },
) {
  const group = state.accesses.find((access) => access.id === input.groupId);
  if (!group) {
    throw new BusinessGroupError('BUSINESS_GROUP_FORBIDDEN', 'Você não possui acesso a este grupo empresarial.');
  }
  const tenant = group.tenants.find((item) => item.id === input.tenantId);
  if (!tenant) {
    throw new BusinessGroupError('BUSINESS_GROUP_FORBIDDEN', 'Esta empresa não pertence ao seu grupo empresarial.');
  }
  return { group, tenant };
}
