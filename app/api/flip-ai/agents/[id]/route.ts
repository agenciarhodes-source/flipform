import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveAgentDraft } from '@/lib/flip-ai/agents';
import { updateAgentDraftSchema } from '@/lib/flip-ai/policy';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
import { FLIP_AI_AGENT_BODY_MAX_BYTES } from '@/lib/flip-ai/avatar';
export const dynamic = 'force-dynamic';
export const PATCH = withFlipAiSession<{ params: { id: string } }>(async (req, session, ctx) => {
  const id = z.string().uuid().safeParse(ctx.params.id);
  const parsed = updateAgentDraftSchema.safeParse(await readFlipAiBody(req, FLIP_AI_AGENT_BODY_MAX_BYTES));
  if (!id.success || !parsed.success) throw new FlipAiError('INVALID_DRAFT', 400, 'Revise os dados do atendente.');
  const { version, ...input } = parsed.data;
  return NextResponse.json({ agent: await saveAgentDraft(session, input, { kind: 'update', id: id.data, version }) });
});
