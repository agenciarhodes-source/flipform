import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { canReadJunqueiraSupportKnowledge } from '@/lib/suporte-atendimento/access';
import { readTenantSupportKnowledge } from '@/lib/suporte-atendimento/tenant-knowledge';
import { findSupportAnswers, supportTerms } from '@/lib/suporte-atendimento/question-answer';
import { classifySupportQuestion } from '@/lib/suporte-atendimento/jev-support-router';

export const dynamic = 'force-dynamic';

export const POST = withPermission('INBOX_VIEW', async (req, session) => {
  if (!canReadJunqueiraSupportKnowledge(session, process.env.SUPPORT_KB_JUNQUEIRA_TENANT_ID, process.env.SUPPORT_KB_GLOBAL_ENABLED === 'true')) {
    return NextResponse.json({ error: 'Indisponível.' }, { status: 404 });
  }
  const limits = await rateLimit({ key: 'support_questions:' + session.tenantId + ':' + session.userId, limit: 30, windowMs: 3_600_000 });
  if (!limits.allowed) return rateLimitResponse(limits);
  let question: string;
  try {
    const data = await req.json();
    question = typeof data?.question === 'string' ? data.question.trim() : '';
  } catch { return NextResponse.json({ error: 'Pergunta inválida.' }, { status: 400 }); }
  if (question.length < 3 || question.length > 600 || supportTerms(question).length === 0) {
    return NextResponse.json({ error: 'Informe uma dúvida geral sem dados pessoais de clientes (até 600 caracteres).' }, { status: 400 });
  }
  try {
    const knowledge = await readTenantSupportKnowledge(session.tenantId);
    if (!knowledge) return NextResponse.json({ error: 'O manual da empresa não está disponível.' }, { status: 404 });
    const headings = knowledge.content.split(/^##\s+/m).slice(1).map((s) => s.split('\n', 1)[0].trim());
    const index = await classifySupportQuestion(question, headings, session.tenantId);
    const lexical = findSupportAnswers(question, knowledge.content);
    const picked = index === null ? lexical : (() => {
      // Escopo JEV: escolhe só capítulo; o TEXTO vem sempre do MD privado e
      // nunca do provider. Se a seção não tem conteúdo útil, usar busca local.
      const chunk = knowledge.content.split(/^##\s+/m).slice(1)[index] || '';
      const body = chunk.slice(chunk.indexOf('\n') + 1).trim();
      const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim() && !p.trim().startsWith('|') && !p.trim().startsWith('#'));
      const score = (p: string) => supportTerms(question).filter((t) => supportTerms(p).includes(t)).length;
      paragraphs.sort((a, b) => score(b) - score(a));
      const excerpt = (paragraphs[0] || '').replace(/\*\*/g, '').replace(/^\s*>\s*/gm, '').slice(0, 900);
      if (excerpt.length < 15) return lexical;
      return [{ title: headings[index], excerpt, matchScore: 10, index }];
    })();
    return NextResponse.json({ results: picked, mode: index === null ? 'manual' : 'jev', version: knowledge.version }, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar o manual. Procure a supervisão.' }, { status: 503 });
  }
});
