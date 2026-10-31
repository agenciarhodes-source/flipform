import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError, requireFlipAiAccess } from '@/lib/flip-ai/access';
import { ATTENDANT_ROLES } from '@/lib/flip-ai/attendant-role';
import { loadAttendantRole, saveAttendantRole } from '@/lib/flip-ai/attendant-role-server';
import { closerTakeoverCandidates, runCloserTakeover } from '@/lib/whatsapp-ai/closer-takeover';

export const dynamic = 'force-dynamic';

function agentId(raw: string) {
  const parsed = z.string().guid().safeParse(raw);
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
  const id = agentId(context.params.id);
  const previous = await loadAttendantRole(tenantId, id);
  const role = await saveAttendantRole({ tenantId, agentId: id, role: parsed.data.role, userId });
  if (!role) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
  // Analyst -> Closer: the AI takes back, as Closer, the triaged conversations it handed over in the
  // last 23 hours (WhatsApp window), and continues them after this answer is sent.
  let takeover = 0;
  if (previous === 'analyst' && role === 'closer') {
    const items = await closerTakeoverCandidates(tenantId, id).catch(() => []);
    takeover = items.length;
    if (items.length) {
      after(async () => {
        await runCloserTakeover(tenantId, items).catch((error) => console.error('Closer takeover failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        }));
      });
    }
  }
  return NextResponse.json({ role, takeover });
});
