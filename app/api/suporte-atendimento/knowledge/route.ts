import { NextResponse } from 'next/server';
import { readTenantSupportKnowledge } from '@/lib/suporte-atendimento/tenant-knowledge';
import { withPermission } from '@/lib/rbac-server';
import { canReadTenantSupportKnowledge } from '@/lib/suporte-atendimento/access';

export const dynamic = 'force-dynamic';

/** Nunca retorna a base a outro tenant, mesmo que conheça a URL da API. */
export const GET = withPermission('INBOX_VIEW', async (_req, session) => {
  if (!canReadTenantSupportKnowledge(session)) {
    return NextResponse.json({ error: 'Não disponível.' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }
  try {
    const knowledge = await readTenantSupportKnowledge(session.tenantId);
    if (!knowledge) return NextResponse.json({ error: 'Nenhum manual publicado para sua empresa.' }, { status: 404 });
    return NextResponse.json({ content: knowledge.content, version: knowledge.version }, {
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch {
    return NextResponse.json({ error: 'Manual indisponível.' }, { status: 503 });
  }
});
