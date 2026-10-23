import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError, requireFlipAiAccess } from '@/lib/flip-ai/access';
import { ATTENDANT_ROLES } from '@/lib/flip-ai/attendant-role';
import { loadAttendantRole, saveAttendantRole } from '@/lib/flip-ai/attendant-role-server';

export const dynamic = 'force-dynamic';

function agentId(raw: string) {
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
  return parsed.data;
}

const bodySchema = z.object({ role: z.enum(ATTENDANT_ROLES) }).strict();

/** Attendant profile (analyst or closer) of an attendant of the company. */
export const GET = withFlipAiSession<{ params: { id: string } }>(async (_request, session, context) => {
  const { tenantId } = await requireFlipAiAccess(prisma, session);
  const id = agentId(context.params.id);
  const agent = await prisma.flipAiAgent.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!agent) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
  return NextResponse.json({ role: await loadAttendantRole(tenantId, agent.id) });
});

export const PUT = withFlipAiSession<{ params: { id: string } }>(async (request, session, context) => {
  const { tenantId, userId } = await requireFlipAiAccess(prisma, session);
  const parsed = bodySchema.safeParse(await readFlipAiBody(request));
  if (!parsed.success) throw new FlipAiError('INVALID_ATTENDANT_ROLE', 400, 'Escolha Analista ou Closer.');
  const role = await saveAttendantRole({ tenantId, agentId: agentId(context.params.id), role: parsed.data.role, userId });
  if (!role) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
  return NextResponse.json({ role });
});
