import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FlipAiError } from '@/lib/flip-ai/access';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { previewKnowledgeRetrieval } from '@/lib/flip-ai/knowledge-preview';

export const dynamic = 'force-dynamic';
const idSchema = z.string().uuid();

export const POST = withFlipAiSession<{ params: { id: string } }>(async (request, session, context) => {
  const agentId = idSchema.safeParse(context.params.id);
  if (!agentId.success) throw new FlipAiError('INVALID_AGENT', 400, 'Atendente inválido.');
  const preview = await previewKnowledgeRetrieval(session, agentId.data, await readFlipAiBody(request, 2_000));
  return NextResponse.json({ preview });
});
