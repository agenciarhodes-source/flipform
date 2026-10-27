import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError, requireFlipAiAccess } from '@/lib/flip-ai/access';
import { FLIP_AI_SPEECH_VOICES, synthesizeReplySpeech } from '@/lib/flip-ai/openai-speech';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The same short sentence for every voice, so they can be compared by ear. */
const SAMPLE_TEXT = 'Olá! Eu sou a voz do seu atendente. Vou explicar tudo com calma, do jeito que você precisa.';

/** Plays a short fixed sample of one voice to someone managing attendants. */
export const POST = withFlipAiSession(async (req, session) => {
  await prisma.$transaction((db) => requireFlipAiAccess(db, session));
  const limited = await rateLimit({ key: `flip-ai:voice-sample:user:${session.userId}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limited.allowed) throw new FlipAiError('VOICE_SAMPLE_RATE_LIMIT', 429, 'Muitas amostras em pouco tempo. Tente mais tarde.');

  const body = await readFlipAiBody(req);
  const requested = body && typeof body === 'object' ? (body as { voice?: unknown }).voice : undefined;
  const voice = FLIP_AI_SPEECH_VOICES.find((candidate) => candidate === requested);
  if (!voice) throw new FlipAiError('INVALID_VOICE', 400, 'Escolha uma das vozes disponíveis.');

  try {
    const speech = await synthesizeReplySpeech({ text: SAMPLE_TEXT, voice });
    const audio = speech.audio.buffer.slice(
      speech.audio.byteOffset, speech.audio.byteOffset + speech.audio.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(audio, { headers: { 'Content-Type': speech.contentType } });
  } catch {
    throw new FlipAiError('VOICE_SAMPLE_UNAVAILABLE', 502, 'Não foi possível gerar a amostra agora.');
  }
});
