import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { LeadAssistantError, undoLeadBatch } from '@/lib/lead-assistant/service';

const bodySchema = z.object({ batchId: z.string().trim().min(1).max(128) }).strict();

/** Undoes one change of the assistant: each lead goes back to who had it, unless it was changed again. */
export const POST = withPermission('LEAD_ASSISTANT_COMMAND', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Mudança inválida.' }, { status: 400 });
  try {
    return NextResponse.json(await undoLeadBatch(session, parsed.data.batchId));
  } catch (error) {
    if (error instanceof LeadAssistantError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Serializable transaction aborted by a concurrent operation: no partial writes.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ error: 'Os leads mudaram durante a operação. Atualize e tente novamente.' }, { status: 409 });
    }
    console.error('Lead assistant undo failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível desfazer agora. Nada foi alterado.' }, { status: 500 });
  }
});
