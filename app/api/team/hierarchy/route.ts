import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { getTeamHierarchySnapshot, replaceHierarchyParents, resolveOperationalScope, setHierarchyEnabled, TeamHierarchyError } from '@/lib/team-hierarchy';

const hierarchyUpdateSchema = z.object({
  subordinateTenantUserId: z.string().uuid(),
  superiorTenantUserIds: z.array(z.string().uuid()).max(10),
});
const activationSchema = z.object({ enabled: z.boolean() });

function hierarchyErrorResponse(error: TeamHierarchyError) {
  const status = error.code === 'HIERARCHY_SCHEMA_NOT_READY' ? 503
    : error.code === 'MEMBER_NOT_FOUND' ? 404
      : error.code === 'INVALID_HIERARCHY' ? 400
        : 403;
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

export const GET = withPermission('DASHBOARD_VIEW', async (_req, session) => {
  try {
    const scope = await resolveOperationalScope(prisma, {
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
    });
    const snapshot = await getTeamHierarchySnapshot(prisma, session.tenantId);
    const canManage = session.role === 'owner' || session.role === 'admin';
    const visibleIds = new Set(scope.visibleMembers.map((member) => member.tenantUserId));

    return NextResponse.json({
      schemaReady: snapshot.schemaReady,
      hierarchyConfigured: snapshot.hierarchyConfigured,
      hierarchyEnabled: snapshot.hierarchyEnabled,
      legacyMode: scope.legacyMode,
      actorTenantUserId: scope.actor.tenantUserId,
      canManage,
      members: (canManage ? snapshot.members : snapshot.members.filter((member) => visibleIds.has(member.tenantUserId))).map((member) => ({
        tenantUserId: member.tenantUserId,
        userId: member.userId,
        name: member.name,
        role: member.role,
      })),
      visibleTenantUserIds: scope.visibleMembers.map((member) => member.tenantUserId),
      edges: snapshot.edges.map((edge) => ({
        id: edge.id,
        superiorTenantUserId: edge.superiorTenantUserId,
        subordinateTenantUserId: edge.subordinateTenantUserId,
      })),
    });
  } catch (error) {
    console.error('team.hierarchy.get error', error);
    return NextResponse.json({ error: 'Não foi possível carregar a hierarquia da equipe.' }, { status: 500 });
  }
});

export const PUT = withPermission('USERS_EDIT', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = hierarchyUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const snapshot = await replaceHierarchyParents(prisma, {
      tenantId: session.tenantId,
      actorUserId: session.userId,
      actorRole: session.role,
      actorGlobalRole: session.globalRole,
      subordinateTenantUserId: parsed.data.subordinateTenantUserId,
      superiorTenantUserIds: parsed.data.superiorTenantUserIds,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'team_hierarchy',
      entityId: parsed.data.subordinateTenantUserId,
      action: 'team.hierarchy_updated',
      metadata: { superiorTenantUserIds: parsed.data.superiorTenantUserIds },
    });

    return NextResponse.json({ ok: true, hierarchyConfigured: snapshot.hierarchyConfigured, hierarchyEnabled: snapshot.hierarchyEnabled });
  } catch (error: any) {
    if (error instanceof TeamHierarchyError) return hierarchyErrorResponse(error);
    console.error('team.hierarchy.update error', error);
    return NextResponse.json({ error: 'Não foi possível atualizar a hierarquia.' }, { status: 500 });
  }
});

export const PATCH = withPermission('USERS_EDIT', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = activationSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const snapshot = await setHierarchyEnabled(prisma, {
      tenantId: session.tenantId,
      actorUserId: session.userId,
      actorRole: session.role,
      enabled: parsed.data.enabled,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: 'team_hierarchy',
      entityId: session.tenantId,
      action: parsed.data.enabled ? 'team.hierarchy_enabled' : 'team.hierarchy_disabled',
      metadata: { enabled: parsed.data.enabled },
    });

    return NextResponse.json({ ok: true, hierarchyEnabled: snapshot.hierarchyEnabled });
  } catch (error: any) {
    if (error instanceof TeamHierarchyError) return hierarchyErrorResponse(error);
    console.error('team.hierarchy.activation error', error);
    return NextResponse.json({ error: 'Não foi possível alterar a ativação da hierarquia.' }, { status: 500 });
  }
});
