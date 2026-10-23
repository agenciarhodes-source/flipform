import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMasterMarkdown, saveMasterMarkdown } from '@/lib/flip-ai/knowledge';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
import { keepApprovedLearnings } from '@/lib/flip/learning';
export const dynamic = 'force-dynamic';
const idSchema = z.string().uuid();
export const GET = withFlipAiSession<{ params: { id: string } }>(async (_req, session, ctx) => {
  const id = idSchema.safeParse(ctx.params.id);
  if (!id.success) throw new FlipAiError('INVALID_AGENT', 400, 'Atendente inválido.');
  return NextResponse.json({ master: await getMasterMarkdown(session, id.data) });
});
export const PUT = withFlipAiSession<{ params: { id: string } }>(async (req, session, ctx) => {
  const id = idSchema.safeParse(ctx.params.id);
  if (!id.success) throw new FlipAiError('INVALID_AGENT', 400, 'Atendente inválido.');
  const body = await readFlipAiBody(req, 2_100_000);
  // The company's approved learnings stay in the Markdown even when a new file replaces it.
  let restored = false;
  if (session.tenantId && body && typeof body === 'object' && typeof (body as { content?: unknown }).content === 'string') {
    const kept = await keepApprovedLearnings(session.tenantId, (body as { content: string }).content);
    restored = kept.restored;
    (body as { content: string }).content = kept.content;
  }
  const master = await saveMasterMarkdown(session, id.data, body);
  return NextResponse.json({ master, ...(restored ? { content: (body as { content: string }).content, learningsRestored: true } : {}) });
});
