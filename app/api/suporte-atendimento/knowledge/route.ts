import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withPermission } from '@/lib/rbac-server';
import { canReadJunqueiraSupportKnowledge } from '@/lib/suporte-atendimento/access';

export const dynamic = 'force-dynamic';

/** Nunca retorna a base a outro tenant, mesmo que conheça a URL da API. */
export const GET = withPermission('INBOX_VIEW', async (_req, session) => {
  if (!canReadJunqueiraSupportKnowledge(session, process.env.SUPPORT_KB_JUNQUEIRA_TENANT_ID)) {
    return NextResponse.json({ error: 'Não disponível.' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }
  try {
    const content = await readFile(
      join(process.cwd(), 'docs', 'suporte-atendimento', 'JUNQUEIRA-BASE-DE-CONHECIMENTO.md'),
      'utf8',
    );
    return NextResponse.json({ content }, {
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch {
    return NextResponse.json({ error: 'Manual indisponível.' }, { status: 503 });
  }
});
