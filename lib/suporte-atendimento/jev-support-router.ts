import 'server-only';
import { isJevEnabledForTenant } from '@/lib/flip-ai/decision-engine';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

/** A decisão é semântica, a resposta continua sendo extraída SOMENTE do Markdown. */
export async function classifySupportQuestion(
  question: string,
  headings: string[],
  tenantId: string,
): Promise<number | null> {
  if (process.env.SUPPORT_KB_JEV_ENABLED !== 'true' ||
      process.env.FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true' ||
      !isJevEnabledForTenant({
        tenantId,
        enabledRaw: process.env.FLIP_AI_JEV_ENABLED,
        tenantIdsRaw: process.env.FLIP_AI_JEV_TENANT_IDS,
        premiumPlansRaw: 'false',
      })) return null;
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || key.length < 12 || headings.length === 0 || headings.length > 100) return null;
  // Dados reais de clientes nunca devem entrar na pergunta; se o usuário colou
  // contatos/identificadores, fica apenas a recuperação local, sem provider.
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\d[.\s-]?){8,}\b/i.test(question)) return null;
  const criteria: Record<string, string> = {
    unknown: 'A pergunta não tem relação clara com qualquer capítulo disponível.',
  };
  headings.forEach((heading, index) => { criteria['s' + index] = heading.slice(0, 180); });
  const payload = {
    model: process.env.TYPESAFE_JEV_MODEL?.trim() || 'jev-latest',
    state: question.slice(0, 600),
    questions: {
      topic: {
        type: 'choice',
        instructions: 'Selecione o capítulo da base de conhecimento que mais ajuda a RESPONDER esta dúvida do atendente. Não faça análise jurídica, não invente respostas e use unknown se for incerto.',
        criteria,
      },
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(JEV_URL, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload),
    });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
    const declaredSize = Number(response.headers.get('content-length') || '0');
    if (declaredSize > 32_000) return null;
    const raw = await response.text();
    if (raw.length > 32_000) return null;
    const result: unknown = JSON.parse(raw);
    if (!result || typeof result !== 'object') return null;
    const answers = (result as Record<string, unknown>).answers;
    if (!answers || typeof answers !== 'object') return null;
    const topic = (answers as Record<string, unknown>).topic;
    if (!topic || typeof topic !== 'object') return null;
    const answer = topic as Record<string, unknown>;
    if (answer.type !== 'choice' || typeof answer.choice !== 'string' ||
      typeof answer.confidence !== 'number' || answer.confidence < 0.7 || answer.confidence > 1) return null;
    const match = /^s([0-9]+)$/.exec(answer.choice);
    if (!match) return null;
    const index = Number(match[1]);
    return Number.isInteger(index) && index >= 0 && index < headings.length ? index : null;
  } catch {
    return null;
  } finally { clearTimeout(timeout); }
}
