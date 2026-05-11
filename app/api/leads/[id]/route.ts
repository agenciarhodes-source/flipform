import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: {
      stage: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      form: { select: { id: true, name: true } },
      answers: true,
      history: {
        include: { fromStage: true, toStage: true, changer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      notes: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ lead });
});

export const PUT = withAuth(async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const body = await req.json();
  const allowed: any = {};
  ['name', 'email', 'phone', 'temperature', 'assignedTo', 'lostReason'].forEach((k) => {
    if (body[k] !== undefined) allowed[k] = body[k];
  });
  await prisma.lead.update({ where: { id: lead.id }, data: allowed });
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (_req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.lead.delete({ where: { id: lead.id } });
  return NextResponse.json({ ok: true });
});
