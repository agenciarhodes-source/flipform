import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { applyFlipSuggestion, dismissFlipSuggestion } from '@/lib/flip/suggestions';

const bodySchema = z.object({ action: z.enum(['apply', 'dismiss']) }).strict();

/** Aplicar or Dispensar one suggestion of the Flip. */
export const POST = withPermission('LEADS_VIEW', async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  if (parsed.data.action === 'dismiss') {
    const ok = await dismissFlipSuggestion(session, ctx.params.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }
  const result = await applyFlipSuggestion(session, ctx.params.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
});
