import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FlipAiError } from '@/lib/flip-ai/access';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { agentPublicationSchema } from '@/lib/flip-ai/policy';
import { changeAgentPublication } from '@/lib/flip-ai/publication';

export const dynamic = 'force-dynamic';

export const POST = withFlipAiSession<{ params: { id: string } }>(async (request, session, context) => {
  const id = z.string().uuid().safeParse(context.params.id);
  const body = agentPublicationSchema.safeParse(await readFlipAiBody(request, 2_000));
  if (!id.success || !body.success) {
    throw new FlipAiError('INVALID_PUBLICATION_REQUEST', 400, 'Solicitação de publicação inválida.');
  }
  return NextResponse.json(await changeAgentPublication(session, id.data, body.data));
});
