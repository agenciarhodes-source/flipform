import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

const rotationMemberSchema = z.object({ userId: z.string().uuid(), orderIndex: z.number().int().min(0), isActive: z.boolean().default(true) });
const rotationPutSchema = z.object({ isEnabled: z.boolean(), strategy: z.literal('round_robin').default('round_robin'), members: z.array(rotationMemberSchema).default([]) });

export const GET = withPermission('LEAD_ASSIGNMENT_ROTATION_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const form = await prisma.form.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 });
  const [rotation, agents] = await Promise.all([
    prisma.leadAssignmentRotation.findUnique({
      where: { tenantId_formId: { tenantId: session.tenantId, formId: form.id } },
      include: { members: { include: { user: { select: { id: true, name: true, email: true, tenantUsers: { where: { tenantId: session.tenantId }, select: { role: true, status: true } } } } }, orderBy: [{ orderIndex: 'asc' }] } },
    }),
    prisma.tenantUser.findMany({ where: { tenantId: session.tenantId, role: 'agent', status: 'active' }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
  ]);
  return NextResponse.json({
    isEnabled: rotation?.isEnabled ?? false,
    strategy: 'round_robin',
    currentIndex: rotation?.currentIndex ?? 0,
    members: (rotation?.members || []).map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: 'agent', orderIndex: m.orderIndex, isActive: m.isActive })),
    availableAgents: agents.map((a) => ({ userId: a.userId, name: a.user.name, email: a.user.email })),
  });
});

export const PUT = withPermission('LEAD_ASSIGNMENT_ROTATION_MANAGE', async (req, session, ctx: { params: { id: string } }) => {
  const parsed = rotationPutSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const form = await prisma.form.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 });
  const userIds = parsed.data.members.map((m) => m.userId);
  if (new Set(userIds).size !== userIds.length) return NextResponse.json({ error: 'Vendedor duplicado no rodízio.' }, { status: 400 });
  if (parsed.data.isEnabled && !parsed.data.members.some((m) => m.isActive)) return NextResponse.json({ error: 'Selecione ao menos um vendedor ativo para ativar o rodízio.' }, { status: 400 });
  const validAgents = await prisma.tenantUser.findMany({ where: { tenantId: session.tenantId, userId: { in: userIds }, role: 'agent', status: 'active' }, select: { userId: true } });
  const valid = new Set(validAgents.map((a) => a.userId));
  if (userIds.some((id) => !valid.has(id))) return NextResponse.json({ error: 'Todos os vendedores devem ser agents ativos do mesmo tenant.' }, { status: 400 });

  const rotation = await prisma.$transaction(async (tx) => {
    const rotation = await tx.leadAssignmentRotation.upsert({
      where: { tenantId_formId: { tenantId: session.tenantId, formId: form.id } },
      create: { tenantId: session.tenantId, formId: form.id, isEnabled: parsed.data.isEnabled, strategy: 'round_robin', currentIndex: 0 },
      update: { isEnabled: parsed.data.isEnabled, strategy: 'round_robin', currentIndex: 0 },
    });
    await tx.leadAssignmentRotationMember.deleteMany({ where: { rotationId: rotation.id } });
    if (parsed.data.members.length) await tx.leadAssignmentRotationMember.createMany({ data: parsed.data.members.map((m, index) => ({ rotationId: rotation.id, userId: m.userId, orderIndex: m.orderIndex ?? index, isActive: m.isActive })) });
    return rotation;
  });
  return NextResponse.json({ ok: true, rotationId: rotation.id });
});
