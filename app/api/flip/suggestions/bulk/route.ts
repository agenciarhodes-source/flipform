import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { decideFlipSuggestionsOfKind } from '@/lib/flip/suggestions';

const bodySchema = z.object({
  kind: z.enum(['create_task', 'transfer_lead', 'rebalance']),
  action: z.enum(['apply', 'dismiss']),
}).strict();

/** Aplicar todas / Dispensar todas of one kind. Each one is checked as if clicked alone. */
export const POST = withPermission('LEADS_VIEW', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const result = await decideFlipSuggestionsOfKind(session, parsed.data.kind, parsed.data.action);
  return NextResponse.json({ ok: true, ...result });
});
