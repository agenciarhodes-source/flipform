import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { getTodayBriefing, markBriefingSeen } from '@/lib/flip/briefing';

/** Today's summary of the person signed in (made on the first call of the day, from 7h). */
export const GET = withPermission('LEADS_VIEW', async (_req: NextRequest, session) => {
  const briefing = await getTodayBriefing(session).catch(() => null);
  return NextResponse.json({
    briefing: briefing ? { id: briefing.id, day: briefing.day, text: briefing.text, seenAt: briefing.seenAt?.toISOString() || null } : null,
  });
});

const bodySchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();

export const POST = withPermission('LEADS_VIEW', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  await markBriefingSeen(session, parsed.data.id);
  return NextResponse.json({ ok: true });
});
