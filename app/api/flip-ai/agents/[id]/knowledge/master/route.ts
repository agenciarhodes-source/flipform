import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMasterMarkdown, saveMasterMarkdown } from '@/lib/flip-ai/knowledge';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
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
  return NextResponse.json({ master: await saveMasterMarkdown(session, id.data, await readFlipAiBody(req, 1_100_000)) });
});
