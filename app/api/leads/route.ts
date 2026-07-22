import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';
import { leadCreateSchema } from '@/lib/schemas';
import { normalizeBrazilCity, normalizeBrazilState } from '@/lib/brazil-locations';
import { isValidBrazilianPhone, normalizeBrazilianPhone, normalizeEmail } from '@/lib/leads';
import { dateOnlyToDate } from '@/lib/date-only';

export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipelineId');
  const search = searchParams.get('q')?.toLowerCase();

  const where: any = { tenantId: session.tenantId, ...getLeadScopeForRole(session) };
  if (pipelineId) where.pipelineId = pipelineId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    include: { assignedUser: { select: { id: true, name: true } }, stage: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ leads });
});

export const POST = withPermission('LEADS_CREATE', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = leadCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const email = normalizeEmail(parsed.data.email);
    const enteredAt = parsed.data.entryDate ? dateOnlyToDate(parsed.data.entryDate) : new Date();
    const phone = normalizeBrazilianPhone(parsed.data.phone);
    if (!email && !phone) return NextResponse.json({ error: 'Informe telefone ou e-mail.' }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    if (phone && !isValidBrazilianPhone(phone)) return NextResponse.json({ error: 'Informe um telefone válido.' }, { status: 400 });

    const [pipeline, stage, assignedUser, duplicate] = await Promise.all([
      prisma.pipeline.findFirst({ where: { id: parsed.data.pipelineId, tenantId: session.tenantId, isArchived: false } }),
      prisma.pipelineStage.findFirst({ where: { id: parsed.data.stageId, pipelineId: parsed.data.pipelineId, pipeline: { tenantId: session.tenantId }, isArchived: false } }),
      parsed.data.assignedTo ? prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: parsed.data.assignedTo, status: 'active' } }) : Promise.resolve(null),
      prisma.lead.findFirst({
        where: {
          tenantId: session.tenantId,
          OR: [phone ? { phone } : undefined, email ? { email } : undefined].filter(Boolean) as any,
        },
        select: { id: true, name: true },
      }),
    ]);

    if (!pipeline) return NextResponse.json({ error: 'Pipeline inválido.' }, { status: 400 });
    if (!stage) return NextResponse.json({ error: 'Etapa inválida para o pipeline selecionado.' }, { status: 400 });
    if (parsed.data.assignedTo && !assignedUser) return NextResponse.json({ error: 'Responsável inválido.' }, { status: 400 });
    if (duplicate && !body.forceCreate) return NextResponse.json({ error: 'Já existe um lead com este contato.', duplicate }, { status: 409 });
    const state = parsed.data.state ? normalizeBrazilState(parsed.data.state) : null;
    const city = state && parsed.data.city ? normalizeBrazilCity(state, parsed.data.city) : null;
    if (parsed.data.state && !state) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
    if (parsed.data.city && !state) return NextResponse.json({ error: 'Selecione um estado para a cidade informada.' }, { status: 400 });
    if (parsed.data.city && !city) return NextResponse.json({ error: 'Cidade inválida para o estado selecionado.' }, { status: 400 });

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId: session.tenantId,
          formId: null,
          name: parsed.data.name.trim(),
          email,
          phone,
          source: parsed.data.source,
          pipelineId: parsed.data.pipelineId,
          stageId: parsed.data.stageId,
          assignedTo: session.role === 'agent' ? session.userId : (parsed.data.assignedTo || null),
          temperature: parsed.data.temperature as any,
          status: 'open',
          state,
          city,
          saleValueCents: parsed.data.saleValueCents ?? null,
          saleValueUpdatedAt: parsed.data.saleValueCents != null ? new Date() : null,
          saleValueUpdatedBy: parsed.data.saleValueCents != null ? session.userId : null,
          enteredAt,
        },
        include: { assignedUser: { select: { id: true, name: true } }, stage: true },
      });
      await tx.leadStageHistory.create({ data: { leadId: created.id, fromStageId: null, toStageId: parsed.data.stageId, changedBy: session.userId } });
      const noteParts = ['Lead criado manualmente.', parsed.data.notes?.trim()].filter(Boolean);
      if (noteParts.length) await tx.note.create({ data: { tenantId: session.tenantId, leadId: created.id, userId: session.userId, content: noteParts.join('\n\n') } });
      return created;
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (e) {
    console.error('leads.create error', e);
    return NextResponse.json({ error: 'Não foi possível criar o lead.' }, { status: 500 });
  }
});
