import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
import { readAgentSpeechVoice, saveAgentSpeechVoice } from '@/lib/flip-ai/agent-speech-setting';

export const dynamic = 'force-dynamic';

function agentId(raw: string) {
  const id = z.string().uuid().safeParse(raw);
  if (!id.success) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
  return id.data;
}

export const GET = withFlipAiSession<{ params: { id: string } }>(async (_req, session, ctx) => (
  NextResponse.json(await readAgentSpeechVoice(session, agentId(ctx.params.id)))
));

export const PUT = withFlipAiSession<{ params: { id: string } }>(async (req, session, ctx) => {
  const body = await readFlipAiBody(req);
  const voice = body && typeof body === 'object' ? (body as { voice?: unknown }).voice : undefined;
  return NextResponse.json(await saveAgentSpeechVoice(session, agentId(ctx.params.id), voice));
});
