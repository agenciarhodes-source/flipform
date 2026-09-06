import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import {
  replaceBusinessGroupTenants,
  upsertBusinessGroupMember,
  BusinessGroupError,
} from '@/lib/business-groups';
import { logPlatformAudit } from '@/lib/platform-audit';

const memberSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(['owner', 'admin', 'viewer']),
  status: z.enum(['active', 'revoked']).default('active'),
}).refine((value) => Boolean(value.userId || value.email), {
  message: 'Selecione um acesso cadastrado.',
});

const updateSchema = z.object({
  tenantIds: z.array(z.string().uuid()).optional(),
  member: memberSchema.optional(),
}).refine((value) => value.tenantIds !== undefined || value.member !== undefined, {
  message: 'Nenhuma alteração informada.',
});

function errorResponse(error: unknown) {
  if (error instanceof BusinessGroupError) {
    const status = error.code === 'BUSINESS_GROUP_SCHEMA_NOT_READY'
      ? 503
      : error.code === 'BUSINESS_GROUP_USER_NOT_FOUND' || error.code === 'BUSINESS_GROUP_TENANT_NOT_FOUND' || error.code === 'BUSINESS_GROUP_NOT_FOUND'
        ? 404
        : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error('[admin.business-groups.update]', error);
  return NextResponse.json({ error: 'Falha ao atualizar grupo empresarial.' }, { status: 500 });
}

async function safeAudit(params: Parameters<typeof logPlatformAudit>[0]) {
  try {
    await logPlatformAudit(params);
  } catch (auditError) {
    console.error('[admin.business-groups.update][audit]', auditError);
  }
}

export const PATCH = withPlatformAdmin(async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  try {
    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    if (parsed.data.tenantIds !== undefined) {
      await replaceBusinessGroupTenants(prisma, {
        groupId: ctx.params.id,
        tenantIds: parsed.data.tenantIds,
        actorUserId: session.userId,
      });
      await safeAudit({
        tenantId: null,
        userId: session.userId,
        entityType: 'business_group',
        entityId: ctx.params.id,
        action: 'business_group.tenants_updated',
        metadata: { tenantIds: parsed.data.tenantIds },
      });
    }

    if (parsed.data.member) {
      const user = await upsertBusinessGroupMember(prisma, {
        groupId: ctx.params.id,
        userId: parsed.data.member.userId,
        email: parsed.data.member.email,
        role: parsed.data.member.role,
        status: parsed.data.member.status,
        actorUserId: session.userId,
      });
      await safeAudit({
        tenantId: null,
        userId: session.userId,
        entityType: 'business_group',
        entityId: ctx.params.id,
        action: parsed.data.member.status === 'revoked' ? 'business_group.member_revoked' : 'business_group.member_upserted',
        metadata: { memberUserId: user.id, email: user.email, role: parsed.data.member.role },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withPlatformAdmin(async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string; status: string }>>(Prisma.sql`
      SELECT id, name, slug, status
      FROM business_groups
      WHERE id = ${ctx.params.id}
      LIMIT 1
    `);
    const current = rows[0];
    if (!current) {
      return NextResponse.json({ error: 'Grupo empresarial não encontrado.', code: 'BUSINESS_GROUP_NOT_FOUND' }, { status: 404 });
    }

    // As FKs do schema de grupos usam ON DELETE CASCADE somente para
    // business_group_tenants e business_group_users. Tenants, usuários e dados
    // operacionais não são removidos por esta ação.
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM business_groups
      WHERE id = ${ctx.params.id}
    `);

    await safeAudit({
      tenantId: null,
      userId: session.userId,
      entityType: 'business_group',
      entityId: current.id,
      action: 'business_group.deleted',
      metadata: {
        name: current.name,
        slug: current.slug,
        previousStatus: current.status,
        dataDeletion: false,
      },
    });

    return NextResponse.json({ ok: true, deletedId: current.id });
  } catch (error) {
    if ((error as any)?.code === 'P2010' || (error as any)?.code === 'P2021') {
      return NextResponse.json({ error: 'Estrutura de grupos empresariais ainda não instalada.', code: 'BUSINESS_GROUP_SCHEMA_NOT_READY' }, { status: 503 });
    }
    console.error('[admin.business-groups.delete]', error);
    return NextResponse.json({ error: 'Falha ao excluir grupo empresarial.' }, { status: 500 });
  }
});
