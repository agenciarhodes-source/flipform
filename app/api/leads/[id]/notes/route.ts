import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';

export const POST = withPermission('NOTES_CREATE', async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Conteúdo obrigatório' }, { status: 400 });
  const note = await prisma.note.create({
    data: { tenantId: session.tenantId, leadId: lead.id, userId: session.userId, content },
    include: { user: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ note });
});
