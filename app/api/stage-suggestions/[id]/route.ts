import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { canMoveLead } from '@/lib/rbac';
import { decideStageSuggestion } from '@/lib/whatsapp-ai/stage-suggestions';

const bodySchema = z.object({ action: z.enum(['approve', 'reject']) }).strict();

/** Aprovar or Recusar a stage suggestion of the Flip AI, by whoever may move the lead. */
export const POST = withPermission('LEADS_MOVE', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  const suggestion = await prisma.leadStageSuggestion.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { id: true, lead: { select: { assignedTo: true } } },
  });
  if (!suggestion) return NextResponse.json({ error: 'Sugestão não encontrada.' }, { status: 404 });
  if (!canMoveLead(session.role, suggestion.lead, session.userId)) {
    return NextResponse.json({ error: 'Sem permissão para mover este lead.' }, { status: 403 });
  }
  const result = await decideStageSuggestion({
    tenantId: session.tenantId, suggestionId: suggestion.id, userId: session.userId, action: parsed.data.action,
  });
  if (!result.ok) return NextResponse.json({ error: 'Esta sugestão já foi decidida ou não vale mais.' }, { status: 409 });
  return NextResponse.json({ ok: true });
});
