import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { latestAttendanceDiagnosis } from '@/lib/reports/attendance-diagnosis';
import { lessonsFromDiagnosis } from '@/lib/flip/learning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MESSAGES: Record<string, { status: number; message: string }> = {
  already: { status: 409, message: 'As práticas deste diagnóstico já foram enviadas para o aprendizado da IA.' },
  no_agent: { status: 400, message: 'Configure primeiro o atendente de IA.' },
  no_credits: { status: 402, message: 'Sem créditos do Flip AI para preparar as lições.' },
  nothing_to_learn: { status: 200, message: 'O diagnóstico não trouxe práticas novas para a IA.' },
  unavailable: { status: 503, message: 'O aprendizado por IA não está disponível agora.' },
  failed: { status: 502, message: 'Não foi possível preparar as lições agora. Tente de novo em instantes.' },
};

/**
 * "Aplicar na IA": turns the last diagnosis into learning suggestions, which wait for approval on
 * the learning page before reaching any attendant.
 */
export const POST = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  const diagnosis = await latestAttendanceDiagnosis(session.tenantId);
  if (!diagnosis) return NextResponse.json({ error: 'Gere um diagnóstico primeiro.' }, { status: 400 });
  const result = await lessonsFromDiagnosis(session.tenantId, diagnosis);
  if (result.status === 'done') {
    return NextResponse.json({ ...result, message: `${result.created} lição(ões) pronta(s) para você revisar e aprovar.` });
  }
  const { status, message } = MESSAGES[result.status] || MESSAGES.failed;
  return status === 200 ? NextResponse.json({ ...result, message }) : NextResponse.json({ ...result, error: message }, { status });
});
