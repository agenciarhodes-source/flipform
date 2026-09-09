import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, type SessionPayload } from '@/lib/auth';
import { FlipAiError } from './access';

function errorResponse(error: unknown): NextResponse {
  if (error instanceof FlipAiError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
  const dbError = error as { code?: string; meta?: { code?: string } } | null;
  if (dbError?.code === 'P2002' || dbError?.meta?.code === '23505') {
    return NextResponse.json({ code: 'DRAFT_CONFLICT', error: 'Este endereço ou solicitação já está em uso. Atualize a lista ou escolha outro endereço.' }, { status: 409 });
  }
  return NextResponse.json({ code: 'FLIP_AI_UNAVAILABLE', error: 'Não foi possível salvar ou carregar o Flip AI. Tente novamente.' }, { status: 500 });
}
export function withFlipAiSession<T = unknown>(handler: (req: NextRequest, session: SessionPayload, ctx: T) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: T) => {
    let response: NextResponse;
    try {
      const session = getSessionFromRequest(req);
      if (!session) throw new FlipAiError('UNAUTHORIZED', 401, 'Entre na sua conta.');
      if (req.method !== 'GET' && req.headers.get('origin') !== req.nextUrl.origin) throw new FlipAiError('INVALID_ORIGIN', 403, 'Origem da solicitação inválida.');
      response = await handler(req, session, ctx);
    } catch (error) { response = errorResponse(error); }
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };
}
export async function readFlipAiBody(req: NextRequest): Promise<unknown> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new FlipAiError('INVALID_BODY', 415, 'Envie os dados em JSON.');
  const reader = req.body?.getReader();
  if (!reader) throw new FlipAiError('INVALID_BODY', 400, 'Dados ausentes.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new FlipAiError('BODY_TOO_LARGE', 413, 'Dados acima do tamanho permitido.'); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new FlipAiError('INVALID_BODY', 400, 'JSON inválido.'); }
}
