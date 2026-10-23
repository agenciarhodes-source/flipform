import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';
import { leadCreateSchema } from '@/lib/schemas';
import { normalizeBrazilCity, normalizeBrazilState } from '@/lib/brazil-locations';
import { normalizeBrazilianLeadPhone, normalizeEmail } from '@/lib/leads';
import { findExistingLeadIdByContactInTenant } from '@/lib/form-duplicate-lead';
import { isValidBrazilMobilePhone } from '@/lib/form-field-validation';
import { dateOnlyToDate, isValidDateOnly, todayDateOnly } from '@/lib/date-only';

function dateOnlyBoundary(value: string, endOfDay = false) {
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}-03:00`);
}

function subtractCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipelineId');
  const search = searchParams.get('q')?.toLowerCase();
  const period = searchParams.get('period');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  // entered: arrived in the period (default, as before) · moved: arrived OR moved to its current
  // stage in the period · open: every open lead, whatever the date.
  const basis = searchParams.get('basis') || 'entered';
  if (!['entered', 'moved', 'open'].includes(basis)) {
    return NextResponse.json({ error: 'Base do filtro inválida.' }, { status: 400 });
  }

  const where: any = { tenantId: session.tenantId, ...getLeadScopeForRole(session) };
  if (period) {
    if (!['7d', '30d', 'custom'].includes(period)) {
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
    }
    let rangeStart: string;
    let rangeEnd: string;
    if (period === 'custom') {
      if (!startDate || !endDate || !isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
        return NextResponse.json({ error: 'Informe uma data inicial e final válidas.' }, { status: 400 });
      }
      if (startDate > endDate) {
        return NextResponse.json({ error: 'A data final deve ser maior ou igual à data inicial.' }, { status: 400 });
      }
      rangeStart = startDate;
      rangeEnd = endDate;
    } else {
      rangeEnd = todayDateOnly();
      rangeStart = subtractCalendarDays(rangeEnd, period === '7d' ? 6 : 29);
    }
    where.enteredAt = { gte: dateOnlyBoundary(rangeStart), lte: dateOnlyBoundary(rangeEnd, true) };
  }
  if (pipelineId) where.pipelineId = pipelineId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ];
  }
  if (basis === 'open') {
    delete where.enteredAt;
    where.status = 'open';
  }
  // Moved: a lead that arrived months ago and moved to its current stage (for example, closed)
  // inside the period shows up, in that stage.
  let movedPairs: Set<string> | null = null;
  const range = where.enteredAt as { gte: Date; lte: Date } | undefined;
  if (basis === 'moved' && range) {
    const { enteredAt: _arrival, ...scope } = where;
    const moves = await prisma.leadStageHistory.findMany({
      where: { createdAt: { gte: range.gte, lte: range.lte }, lead: scope },
      select: { leadId: true, toStageId: true },
      take: 20_000,
    });
    movedPairs = new Set(moves.map((move) => `${move.leadId}:${move.toStageId}`));
    delete where.enteredAt;
    where.AND = [...(where.AND || []), { OR: [{ enteredAt: range }, { id: { in: Array.from(new Set(moves.map((move) => move.leadId))) } }] }];
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      assignedUser: { select: { id: true, name: true } },
      stage: true,
      form: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (movedPairs && range) {
    const pairs = movedPairs;
    const inRange = (date: Date) => date >= range.gte && date <= range.lte;
    return NextResponse.json({ leads: leads.filter((lead) => inRange(lead.enteredAt) || pairs.has(`${lead.id}:${lead.stageId}`)) });
  }
  return NextResponse.json({ leads });
});

export const POST = withPermission('LEADS_CREATE', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = leadCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const email = normalizeEmail(parsed.data.email);
    const enteredAt = parsed.data.entryDate ? dateOnlyToDate(parsed.data.entryDate) : new Date();
    const phone = normalizeBrazilianLeadPhone(parsed.data.phone);
    if (!email && !phone) return NextResponse.json({ error: 'Informe telefone ou e-mail.' }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    // Same rule as the public forms: only a Brazilian mobile with area code is saved.
    if (phone && !isValidBrazilMobilePhone(phone)) {
      return NextResponse.json({ error: 'Informe um celular do Brasil: +55 (DDD) 9 0000-0000.' }, { status: 400 });
    }

    const [pipeline, stage, assignedUser] = await Promise.all([
      prisma.pipeline.findFirst({ where: { id: parsed.data.pipelineId, tenantId: session.tenantId, isArchived: false } }),
      prisma.pipelineStage.findFirst({ where: { id: parsed.data.stageId, pipelineId: parsed.data.pipelineId, pipeline: { tenantId: session.tenantId }, isArchived: false } }),
      parsed.data.assignedTo ? prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: parsed.data.assignedTo, status: 'active' } }) : Promise.resolve(null),
    ]);

    if (!pipeline) return NextResponse.json({ error: 'Pipeline inválido.' }, { status: 400 });
    if (!stage) return NextResponse.json({ error: 'Etapa inválida para o pipeline selecionado.' }, { status: 400 });
    if (parsed.data.assignedTo && !assignedUser) return NextResponse.json({ error: 'Responsável inválido.' }, { status: 400 });
    const state = parsed.data.state ? normalizeBrazilState(parsed.data.state) : null;
    const city = state && parsed.data.city ? normalizeBrazilCity(state, parsed.data.city) : null;
    if (parsed.data.state && !state) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
    if (parsed.data.city && !state) return NextResponse.json({ error: 'Selecione um estado para a cidade informada.' }, { status: 400 });
    if (parsed.data.city && !city) return NextResponse.json({ error: 'Cidade inválida para o estado selecionado.' }, { status: 400 });

    // A lead created straight in the final stage of its funnel is a sale, like one moved there.
    const finalStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: parsed.data.pipelineId, isArchived: false, pipeline: { tenantId: session.tenantId } },
      orderBy: { orderIndex: 'desc' },
      select: { id: true },
    });
    const createdAsSale = finalStage?.id === parsed.data.stageId;

    const leadResult = await prisma.$transaction(async (tx) => {
      const existingLeadId = await findExistingLeadIdByContactInTenant({
        tx,
        tenantId: session.tenantId,
        phone,
        email,
      });

      if (existingLeadId) {
        const duplicate = await tx.lead.findFirst({
          where: { id: existingLeadId, tenantId: session.tenantId },
          select: { id: true, name: true, source: true },
        });
        if (duplicate) return { duplicate, lead: null } as const;
      }

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
          temperature: (createdAsSale ? 'hot' : parsed.data.temperature) as any,
          status: createdAsSale ? 'won' : 'open',
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
      return { duplicate: null, lead: created } as const;
    });

    if (leadResult.duplicate) {
      return NextResponse.json({
        error: 'Este contato já está cadastrado nesta conta. Não é possível cadastrar novamente.',
        duplicate: leadResult.duplicate,
      }, { status: 409 });
    }

    return NextResponse.json({ lead: leadResult.lead }, { status: 201 });
  } catch (e) {
    console.error('leads.create error', e);
    return NextResponse.json({ error: 'Não foi possível criar o lead.' }, { status: 500 });
  }
});
