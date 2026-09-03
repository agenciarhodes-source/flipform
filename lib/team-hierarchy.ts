import { randomUUID } from 'crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { canManageRole, ROLE_LEVEL, type RoleName } from '@/lib/rbac';

type Db = PrismaClient | Prisma.TransactionClient;

export type TeamHierarchyMember = {
  tenantUserId: string;
  userId: string;
  name: string;
  role: RoleName;
  status: string;
};

export type TeamHierarchyEdge = {
  id: string;
  superiorTenantUserId: string;
  subordinateTenantUserId: string;
  createdAt: Date;
};

export type TeamHierarchySnapshot = {
  schemaReady: boolean;
  hierarchyConfigured: boolean;
  hierarchyEnabled: boolean;
  members: TeamHierarchyMember[];
  edges: TeamHierarchyEdge[];
};

type EdgeRow = {
  id: string;
  superior_tenant_user_id: string;
  subordinate_tenant_user_id: string;
  created_at: Date;
};

type SettingsRow = { enabled: boolean };

export class TeamHierarchyError extends Error {
  constructor(public code: 'HIERARCHY_SCHEMA_NOT_READY' | 'MEMBER_NOT_FOUND' | 'FORBIDDEN_SCOPE' | 'INVALID_HIERARCHY' | 'FORBIDDEN', message: string) {
    super(message);
  }
}

function isRoleName(role: string): role is RoleName {
  return ['owner', 'admin', 'manager', 'agent', 'viewer'].includes(role);
}

function isMissingHierarchyTable(error: any): boolean {
  if (error?.code === 'P2021') return true;
  if (error?.code !== 'P2010') return false;
  const providerCode = String(error?.meta?.code || '');
  const providerMessage = String(error?.meta?.message || '').toLowerCase();
  return providerCode === '42P01' || providerMessage.includes('tenant_user_hierarchy') || providerMessage.includes('tenant_team_hierarchy_settings') || providerMessage.includes('does not exist');
}

function sanitizeEdges(edges: TeamHierarchyEdge[], memberIds: Set<string>) {
  return edges.filter((edge) => memberIds.has(edge.superiorTenantUserId) && memberIds.has(edge.subordinateTenantUserId));
}

export async function getTeamHierarchySnapshot(db: Db, tenantId: string): Promise<TeamHierarchySnapshot> {
  const tenantUsers = await db.tenantUser.findMany({
    where: { tenantId, status: 'active' },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const members: TeamHierarchyMember[] = tenantUsers
    .filter((member) => isRoleName(String(member.role)))
    .map((member) => ({
      tenantUserId: member.id,
      userId: member.userId,
      name: member.user.name,
      role: member.role as RoleName,
      status: member.status,
    }));

  try {
    const [rows, settings] = await Promise.all([
      db.$queryRaw<EdgeRow[]>(Prisma.sql`
        SELECT id, superior_tenant_user_id, subordinate_tenant_user_id, created_at
        FROM tenant_user_hierarchy
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at ASC
      `),
      db.$queryRaw<SettingsRow[]>(Prisma.sql`
        SELECT enabled
        FROM tenant_team_hierarchy_settings
        WHERE tenant_id = ${tenantId}
        LIMIT 1
      `),
    ]);
    const memberIds = new Set(members.map((member) => member.tenantUserId));
    const edges = sanitizeEdges(rows.map((row) => ({
      id: row.id,
      superiorTenantUserId: row.superior_tenant_user_id,
      subordinateTenantUserId: row.subordinate_tenant_user_id,
      createdAt: row.created_at,
    })), memberIds);
    return {
      schemaReady: true,
      hierarchyConfigured: edges.length > 0,
      hierarchyEnabled: settings[0]?.enabled === true,
      members,
      edges,
    };
  } catch (error) {
    if (!isMissingHierarchyTable(error)) throw error;
    // Safe compatibility mode: deployment can precede the explicit additive schema repair.
    return { schemaReady: false, hierarchyConfigured: false, hierarchyEnabled: false, members, edges: [] };
  }
}

function descendantIds(rootTenantUserId: string, edges: TeamHierarchyEdge[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    const list = children.get(edge.superiorTenantUserId) || [];
    list.push(edge.subordinateTenantUserId);
    children.set(edge.superiorTenantUserId, list);
  }

  const result = new Set<string>();
  const queue = [...(children.get(rootTenantUserId) || [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) || []));
  }
  return result;
}

export async function resolveOperationalScope(db: Db, input: {
  tenantId: string;
  userId: string;
  role: string;
  selectedTenantUserId?: string | null;
}) {
  const snapshot = await getTeamHierarchySnapshot(db, input.tenantId);
  const actor = snapshot.members.find((member) => member.userId === input.userId);
  if (!actor) throw new TeamHierarchyError('MEMBER_NOT_FOUND', 'Usuário não pertence a esta empresa.');

  const role = isRoleName(input.role) ? input.role : actor.role;
  const legacyMode = !snapshot.schemaReady || !snapshot.hierarchyEnabled;
  let actorVisibleIds = new Set<string>([actor.tenantUserId]);

  if (role === 'owner') {
    actorVisibleIds = new Set(snapshot.members.map((member) => member.tenantUserId));
  } else if (role === 'admin' || role === 'manager') {
    if (legacyMode) {
      // Backward compatibility: hierarchy can be drafted without changing any current view.
      actorVisibleIds = new Set(snapshot.members.map((member) => member.tenantUserId));
    } else {
      for (const descendantId of descendantIds(actor.tenantUserId, snapshot.edges)) actorVisibleIds.add(descendantId);
    }
  }

  let scopeIds = new Set(actorVisibleIds);
  let selectedMember: TeamHierarchyMember | null = null;
  if (input.selectedTenantUserId) {
    if (!actorVisibleIds.has(input.selectedTenantUserId)) {
      throw new TeamHierarchyError('FORBIDDEN_SCOPE', 'Esta visão não pertence à sua estrutura de equipe.');
    }
    selectedMember = snapshot.members.find((member) => member.tenantUserId === input.selectedTenantUserId) || null;
    if (!selectedMember) throw new TeamHierarchyError('MEMBER_NOT_FOUND', 'Membro da equipe não encontrado.');
    scopeIds = new Set([selectedMember.tenantUserId]);
    for (const descendantId of descendantIds(selectedMember.tenantUserId, snapshot.edges)) {
      if (actorVisibleIds.has(descendantId)) scopeIds.add(descendantId);
    }
  }

  const scopeMembers = snapshot.members.filter((member) => scopeIds.has(member.tenantUserId));
  const visibleMembers = snapshot.members.filter((member) => actorVisibleIds.has(member.tenantUserId));
  const visibleAgentUserIds = scopeMembers.filter((member) => member.role === 'agent').map((member) => member.userId);

  const unrestrictedTenantView = !input.selectedTenantUserId && (
    role === 'owner' || ((role === 'admin' || role === 'manager') && legacyMode)
  );

  return {
    ...snapshot,
    actor,
    role,
    legacyMode,
    visibleMembers,
    scopeMembers,
    selectedMember,
    visibleAgentUserIds,
    restrictToAssignees: !unrestrictedTenantView,
  };
}

export async function replaceHierarchyParents(db: PrismaClient, input: {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  actorGlobalRole?: string | null;
  subordinateTenantUserId: string;
  superiorTenantUserIds: string[];
}) {
  const snapshot = await getTeamHierarchySnapshot(db, input.tenantId);
  if (!snapshot.schemaReady) {
    throw new TeamHierarchyError('HIERARCHY_SCHEMA_NOT_READY', 'A estrutura de hierarquia ainda não foi instalada.');
  }

  const actor = snapshot.members.find((member) => member.userId === input.actorUserId);
  const subordinate = snapshot.members.find((member) => member.tenantUserId === input.subordinateTenantUserId);
  if (!actor || !subordinate) throw new TeamHierarchyError('MEMBER_NOT_FOUND', 'Membro da equipe não encontrado.');
  if (!canManageRole(input.actorRole, subordinate.role, input.actorGlobalRole)) {
    throw new TeamHierarchyError('FORBIDDEN', 'Você não pode alterar a hierarquia deste usuário.');
  }

  const superiorIds = [...new Set(input.superiorTenantUserIds)];
  const memberById = new Map(snapshot.members.map((member) => [member.tenantUserId, member]));
  for (const superiorId of superiorIds) {
    const superior = memberById.get(superiorId);
    if (!superior) throw new TeamHierarchyError('INVALID_HIERARCHY', 'O superior selecionado não pertence a esta empresa.');
    if (superior.tenantUserId === subordinate.tenantUserId) {
      throw new TeamHierarchyError('INVALID_HIERARCHY', 'Um usuário não pode supervisionar a si mesmo.');
    }
    if ((ROLE_LEVEL[superior.role] ?? 0) <= (ROLE_LEVEL[subordinate.role] ?? 0)) {
      throw new TeamHierarchyError('INVALID_HIERARCHY', 'O superior precisa ter um nível de acesso maior que o subordinado.');
    }
    if (descendantIds(subordinate.tenantUserId, snapshot.edges).has(superiorId)) {
      throw new TeamHierarchyError('INVALID_HIERARCHY', 'Este vínculo criaria um ciclo na hierarquia.');
    }
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM tenant_user_hierarchy
      WHERE tenant_id = ${input.tenantId}
        AND subordinate_tenant_user_id = ${input.subordinateTenantUserId}
    `);
    for (const superiorId of superiorIds) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO tenant_user_hierarchy (
          id, tenant_id, superior_tenant_user_id, subordinate_tenant_user_id, created_by, created_at
        ) VALUES (
          ${randomUUID()}, ${input.tenantId}, ${superiorId}, ${input.subordinateTenantUserId}, ${input.actorUserId}, CURRENT_TIMESTAMP
        )
      `);
    }
  });

  return getTeamHierarchySnapshot(db, input.tenantId);
}

export async function setHierarchyEnabled(db: PrismaClient, input: {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  enabled: boolean;
}) {
  if (!['owner', 'admin'].includes(input.actorRole)) {
    throw new TeamHierarchyError('FORBIDDEN', 'Somente Dono ou Administrador pode ativar a hierarquia.');
  }

  const snapshot = await getTeamHierarchySnapshot(db, input.tenantId);
  if (!snapshot.schemaReady) {
    throw new TeamHierarchyError('HIERARCHY_SCHEMA_NOT_READY', 'A estrutura de hierarquia ainda não foi instalada.');
  }

  if (input.enabled) {
    if (!snapshot.hierarchyConfigured) {
      throw new TeamHierarchyError('INVALID_HIERARCHY', 'Cadastre os vínculos da equipe antes de ativar a hierarquia.');
    }
    const linkedSubordinates = new Set(snapshot.edges.map((edge) => edge.subordinateTenantUserId));
    const missing = snapshot.members.filter((member) => ['manager', 'agent'].includes(member.role) && !linkedSubordinates.has(member.tenantUserId));
    if (missing.length) {
      throw new TeamHierarchyError('INVALID_HIERARCHY', `Antes de ativar, vincule um superior para: ${missing.map((member) => member.name).join(', ')}.`);
    }
  }

  await db.$executeRaw(Prisma.sql`
    INSERT INTO tenant_team_hierarchy_settings (tenant_id, enabled, updated_by, updated_at)
    VALUES (${input.tenantId}, ${input.enabled}, ${input.actorUserId}, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id)
    DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
  `);

  return getTeamHierarchySnapshot(db, input.tenantId);
}
