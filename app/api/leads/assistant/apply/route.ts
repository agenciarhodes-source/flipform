import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { applyLeadPlan, LeadAssistantError } from '@/lib/lead-assistant/service';
import { LEAD_ASSISTANT_MAX_LEADS, resolvedLeadAssistantPlanSchema } from '@/lib/lead-assistant/rules';

const bodySchema = z.object({
  plan: resolvedLeadAssistantPlanSchema,
  expectedMoves: z.number().int().min(0).max(LEAD_ASSISTANT_MAX_LEADS),
  command: z.string().trim().max(400),
}).strict();

/** Applies a plan the manager confirmed in the preview. Only the responsible person of open leads changes. */
export const POST = withPermission('LEAD_ASSISTANT_COMMAND', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Gere a prévia de novo antes de confirmar.' }, { status: 400 });
  try {
    return NextResponse.json(await applyLeadPlan(session, parsed.data.plan, parsed.data.expectedMoves, parsed.data.command));
  } catch (error) {
    if (error instanceof LeadAssistantError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Serializable transaction aborted by a concurrent operation: no partial writes.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ error: 'Os leads mudaram durante a operação. Atualize e tente novamente.' }, { status: 409 });
    }
    console.error('Lead assistant apply failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível aplicar a distribuição. Nada foi alterado.' }, { status: 500 });
  }
});
