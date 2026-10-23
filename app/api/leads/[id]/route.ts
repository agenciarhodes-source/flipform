import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  withPermission,
  canDeleteLead,
  canEditLead,
  canCompleteTask,
  assertCanAccessLead,
} from '@/lib/rbac-server';
import { can } from '@/lib/rbac';
import { withAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseLeadBasicInfo } from '@/lib/leads/basic-info';
import { getFlipAiLeadIntelligence } from '@/lib/flip-ai/lead-intelligence';
import { getFlipAiHumanHandoff } from '@/lib/flip-ai/human-handoff';
import { getFlipAiHumanActionRequest } from '@/lib/flip-ai/human-action-request';
import { canDeleteChatAttachment, listLeadChatAttachments } from '@/lib/flip-ai/chat-attachment-library';

export const GET = withPermission('LEADS_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const qualificationSchemaReady = await prisma.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_qualifications') IS NOT NULL AS ready
  `).then((rows) => rows[0]?.ready === true).catch(() => false);
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
      ...(qualificationSchemaReady ? {
        flipAiQualifications: {
          orderBy: { createdAt: 'desc' as const },
          take: 5,
          include: {
            agent: { select: { id: true, name: true } },
            conversation: {
              select: {
                id: true,
                messages: {
                  where: { type: 'text', text: { not: null } },
                  orderBy: [{ providerTimestamp: 'desc' as const }, { createdAt: 'desc' as const }],
                  take: 30,
                  select: { id: true, direction: true, text: true, createdAt: true },
                },
              },
            },
          },
        },
      } : {}),
      tasks: {
        include: {
          assignee: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      },
    },
  });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try { assertCanAccessLead(session, lead); } catch { return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403 }); }
  const flipAiLiveIntelligence = await getFlipAiLeadIntelligence({
    tenantId: session.tenantId,
    leadId: lead.id,
  }).catch(() => null);
  // The conversation with the AI attendant is shown even when no qualification was finished.
  const flipAiConversation = await prisma.conversation.findFirst({
    where: { tenantId: session.tenantId, leadId: lead.id, provider: 'flip_ai' },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      messages: {
        where: { type: 'text', text: { not: null } },
        orderBy: [{ providerTimestamp: 'desc' }, { createdAt: 'desc' }],
        take: 50,
        select: { id: true, direction: true, text: true, createdAt: true },
      },
    },
  }).catch(() => null);
  // Files the lead sent in the chat that are still within the retention period.
  const chatAttachments = await listLeadChatAttachments({ tenantId: session.tenantId, leadId: lead.id })
    .catch(() => []);
  const [activeAgents, saleValueAuditLogs, flipAiHumanHandoff] = await Promise.all([
    ['owner', 'admin', 'manager'].includes(session.role)
      ? prisma.tenantUser.findMany({
        where: { tenantId: session.tenantId, role: 'agent', status: 'active' },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: { tenantId: session.tenantId, entityType: 'lead', entityId: lead.id, action: 'lead.sale_value_updated' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, metadata: true, createdAt: true },
    }),
    getFlipAiHumanHandoff({
      tenantId: session.tenantId,
      leadId: lead.id,
      intelligence: flipAiLiveIntelligence,
    }).catch(() => null),
  ]);
  // When the person authorized contact on WhatsApp, by sending a form with the notice below it.
  const whatsappConsentAt = await prisma.auditLog.findFirst({
    where: { tenantId: session.tenantId, entityType: 'lead', entityId: lead.id, action: 'lead.contact_consent_recorded' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  }).then((row) => row?.createdAt.toISOString() || null).catch(() => null);
  // Which attendant talked to this lead: the equivalent of the form name for a chat lead.
  const flipAiAgentName = await prisma.flipAiConversationState.findFirst({
    where: { tenantId: session.tenantId, conversation: { leadId: lead.id } },
    orderBy: { updatedAt: 'desc' },
    select: { agent: { select: { name: true } } },
  }).then((state) => state?.agent.name || null).catch(() => null);
  const flipAiHumanActionRequest = await getFlipAiHumanActionRequest({
    tenantId: session.tenantId,
    leadId: lead.id,
    conversationId: flipAiHumanHandoff?.conversationId || flipAiLiveIntelligence?.conversationId || null,
  }).catch(() => null);
  const flipAiHumanActionRequestView = flipAiHumanActionRequest
    ? {
      ...flipAiHumanActionRequest,
      canResolve: canCompleteTask(session.role, {
        task: { assignedTo: flipAiHumanActionRequest.assignedTo, createdBy: null },
        lead: { assignedTo: lead.assignedTo },
      }, session.userId),
    }
    : null;

  return NextResponse.json({ lead: { ...lead, flipAiAgentName, whatsappConsentAt,
    flipAiQualifications: qualificationSchemaReady ? (lead as any).flipAiQualifications || [] : [],
    flipAiLiveIntelligence,
    flipAiConversation,
    chatAttachments,
    canDeleteChatAttachments: canDeleteChatAttachment(session.role),
    flipAiHumanHandoff,
    flipAiHumanActionRequest: flipAiHumanActionRequestView,
    saleValueAuditLogs, activeAgents: activeAgents.map((agent) => ({ userId: agent.userId, name: agent.user.name, email: agent.user.email })), canDelete: canDeleteLead(session.role), canEdit: canEditLead(session.role, lead, session.userId), canContactWhatsApp: can(session.role, 'LEADS_CONTACT_WHATSAPP') } });
});

export const PUT = withAuth(async (req, session, ctx: { params: { id: string } }) => {
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canEditLead(session.role, lead, session.userId)) {
    return NextResponse.json({ error: 'Sem permissão para editar este lead.' }, { status: 403 });
  }
  const body = await req.json();
  const allowed: any = {};
  // The contact phone is never edited: it ties the lead to its WhatsApp conversations and ads.
  const editableFields = session.role === 'agent'
    ? ['temperature']
    : ['temperature', 'assignedTo', 'lostReason'];
  editableFields.forEach((k) => {
    if (body[k] !== undefined) allowed[k] = body[k];
  });
  const basic = parseLeadBasicInfo({ name: body?.name, email: body?.email });
  if (!basic.ok) return NextResponse.json({ error: basic.error }, { status: 400 });
  Object.assign(allowed, basic.data);
  const previousBasic = {
    ...(basic.data.name !== undefined && basic.data.name !== lead.name ? { previousName: lead.name } : {}),
    ...(basic.data.email !== undefined && basic.data.email !== lead.email ? { previousEmail: lead.email } : {}),
  };
  if (Object.prototype.hasOwnProperty.call(allowed, 'assignedTo')) {
    allowed.assignedTo = allowed.assignedTo || null;
    if (allowed.assignedTo) {
      const assignee = await prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: allowed.assignedTo, role: 'agent', status: 'active' }, include: { user: { select: { name: true } } } });
      if (!assignee) return NextResponse.json({ error: 'Responsável inválido. Selecione um Atendente/Vendedor ativo deste tenant.' }, { status: 400 });
    }
  }
  // A transfer moves the whole service: the lead and its WhatsApp and Instagram conversations,
  // with every message, go to the new owner together, so two people never answer the same person.
  const transferring = Object.prototype.hasOwnProperty.call(allowed, 'assignedTo')
    && allowed.assignedTo !== lead.assignedTo;
  const conversationsTransferred = await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id: lead.id }, data: allowed });
    if (!transferring) return 0;
    const moved = await tx.conversation.updateMany({
      where: { tenantId: session.tenantId, leadId: lead.id, provider: 'meta' },
      data: { assignedTo: allowed.assignedTo },
    });
    return moved.count;
  });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'lead', entityId: lead.id, action: 'lead.updated',
    metadata: { changes: Object.keys(allowed), assignedTo: allowed.assignedTo, ...previousBasic,
      ...(transferring ? { previousAssignedTo: lead.assignedTo, conversationsTransferred } : {}), message: Object.prototype.hasOwnProperty.call(allowed, 'assignedTo') ? 'Responsável do lead atualizado manualmente.' : undefined },
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = withPermission('LEADS_DELETE', async (_req, session, ctx: { params: { id: string } }) => {
  // Destructive CRM deletion is owner-only, even if RBAC is widened elsewhere.
  if (session.role !== 'owner' || !canDeleteLead(session.role)) {
    return NextResponse.json({ error: 'Apenas o dono da empresa pode excluir leads.' }, { status: 403 });
  }
  const lead = await prisma.lead.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.lead.delete({ where: { id: lead.id } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'lead', entityId: lead.id, action: 'lead.deleted',
    metadata: { name: lead.name, email: lead.email },
  });
  return NextResponse.json({ ok: true });
});
