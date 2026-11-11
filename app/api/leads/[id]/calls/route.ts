import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { callSchema, CALL_OUTCOMES, isCallTaskTitle } from '@/lib/leads/call-rules';

type CallRow = { id: string; outcome: string; note: string | null; callback_at: Date | null; created_at: Date; user_name: string | null };

async function leadOf(tenantId: string, id: string) {
  return prisma.lead.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
}

/** Calls of the lead, and its open call tasks (to finish them when the call is recorded). */
export const GET = withPermission('NOTES_CREATE', async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await leadOf(session.tenantId, ctx.params.id);
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const calls = await prisma.$queryRaw<CallRow[]>`
    SELECT c.id, c.outcome, c.note, c.callback_at, c.created_at, u.name AS user_name
    FROM lead_calls c LEFT JOIN users u ON u.id = c.user_id
    WHERE c.tenant_id = ${session.tenantId} AND c.lead_id = ${lead.id}
    ORDER BY c.created_at DESC LIMIT 30`.catch(() => null);
  if (!calls) return NextResponse.json({ ready: false });
  const tasks = await prisma.task.findMany({
    where: { tenantId: session.tenantId, leadId: lead.id, status: { in: ['pending', 'overdue'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, dueDate: true },
  });
  return NextResponse.json({
    ready: true,
    calls: calls.map((call) => ({
      id: call.id, outcome: call.outcome, label: CALL_OUTCOMES[call.outcome as keyof typeof CALL_OUTCOMES] || call.outcome,
      note: call.note, callbackAt: call.callback_at?.toISOString() || null, createdAt: call.created_at.toISOString(), userName: call.user_name,
    })),
    callTasks: tasks.filter((task) => isCallTaskTitle(task.title)).map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate?.toISOString() || null })),
  });
});

/** Records a call: how it went, a note, and when to call again (becomes a task). */
export const POST = withPermission('NOTES_CREATE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const lead = await leadOf(session.tenantId, ctx.params.id);
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const parsed = callSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 });
  const data = parsed.data;
  const callbackAt = data.outcome === 'callback' && data.callbackAt ? new Date(data.callbackAt) : null;
  if (callbackAt && callbackAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: 'Escolha um horário no futuro para ligar de novo.' }, { status: 400 });
  }
  const id = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO lead_calls (id, tenant_id, lead_id, user_id, outcome, note, callback_at, created_at)
      VALUES (${id}, ${session.tenantId}, ${lead.id}, ${session.userId}, ${data.outcome}, ${data.note || null}, ${callbackAt}, NOW())`;
  } catch {
    return NextResponse.json({ error: 'O registro de ligações ainda não foi instalado no banco.' }, { status: 409 });
  }
  if (callbackAt) {
    await prisma.task.create({
      data: {
        tenantId: session.tenantId, leadId: lead.id, assignedTo: session.userId, createdBy: session.userId,
        title: `Ligar de novo para ${lead.name}`.slice(0, 190),
        description: data.note ? `Combinado na ligação: ${data.note}` : 'O cliente pediu para ligar depois.',
        dueDate: callbackAt, remindMinutesBefore: 15, priority: 'high',
      },
    });
  }
  // Only open call tasks of this same lead are finished.
  const finished = data.completeTaskIds.length
    ? await prisma.task.updateMany({
      where: { id: { in: data.completeTaskIds }, tenantId: session.tenantId, leadId: lead.id, status: { in: ['pending', 'overdue'] } },
      data: { status: 'completed', completedAt: new Date() },
    })
    : { count: 0 };
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id,
      action: 'lead.call_logged', metadata: { callId: id, outcome: data.outcome, callback: Boolean(callbackAt), tasksCompleted: finished.count },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, id, tasksCompleted: finished.count, callbackTask: Boolean(callbackAt) });
});
