import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { analyzeHumanAttendance, listLearning } from '@/lib/flip/learning';

export const maxDuration = 60;

export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  return NextResponse.json(await listLearning(session.tenantId));
});

/** "Analisar agora": at most once every 6 hours per company. */
export const POST = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  const result = await analyzeHumanAttendance(session.tenantId, { trigger: 'manual' });
  const messages: Record<string, string> = {
    recent: 'Uma análise foi feita há pouco. Tente de novo mais tarde.',
    no_agent: 'Configure primeiro o atendente de IA.',
    no_credits: 'Sem créditos Flip AI para a análise.',
    nothing_to_learn: 'Nenhuma conversa da equipe que avançou ou fechou nos últimos 7 dias.',
    unavailable: 'A análise está indisponível no momento.',
    failed: 'Não foi possível concluir a análise agora.',
  };
  return NextResponse.json({ ...result, message: result.status === 'done' ? `${result.created} sugestão(ões) nova(s).` : messages[result.status] });
});
