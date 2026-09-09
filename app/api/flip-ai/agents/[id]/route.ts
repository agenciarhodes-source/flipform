import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveAgentDraft } from '@/lib/flip-ai/agents';
import { updateAgentDraftSchema } from '@/lib/flip-ai/policy';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
export const dynamic = 'force-dynamic';
export const PATCH = withFlipAiSession<{ params: { id: string } }>(async (req, session, ctx) => {
  const id = z.string().uuid().safeParse(ctx.params.id);
  const parsed = updateAgentDraftSchema.safeParse(await readFlipAiBody(req));
  if (!id.success || !parsed.success) throw new FlipAiError('INVALID_DRAFT', 400, 'Revise os dados do atendente.');
  const { version, ...input } = parsed.data;
  return NextResponse.json({ agent: await saveAgentDraft(session, input, { kind: 'update', id: id.data, version }) });
});
