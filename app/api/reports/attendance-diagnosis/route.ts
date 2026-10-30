import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { can } from '@/lib/rbac';
import {
  AttendanceDiagnosisError,
  generateAttendanceDiagnosis,
  latestAttendanceDiagnosis,
} from '@/lib/reports/attendance-diagnosis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The last diagnosis: about the whole team, so only who sees all reports. */
export const GET = withPermission('REPORTS_VIEW_ALL', async (_req: NextRequest, session) => {
  const diagnosis = await latestAttendanceDiagnosis(session.tenantId);
  return NextResponse.json({ diagnosis, canGenerate: can(session.role, 'FLIP_AI_MANAGE') });
});

const ERRORS: Record<AttendanceDiagnosisError['code'], { status: number; error: string }> = {
  unavailable: { status: 503, error: 'O diagnóstico por IA não está disponível agora.' },
  recent: { status: 429, error: 'Um diagnóstico foi gerado há menos de 1 hora. Aguarde para gerar outro.' },
  no_credits: { status: 402, error: 'Sem créditos do Flip AI para gerar o diagnóstico.' },
  nothing_to_review: { status: 400, error: 'Nenhuma conversa atendida pela equipe no período para analisar.' },
  failed: { status: 502, error: 'Não foi possível gerar o diagnóstico agora. Tente de novo em instantes.' },
};

/** "Gerar diagnóstico": spends Flip AI credits, so only owners and admins. */
export const POST = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const body = await req.json().catch(() => ({}));
  try {
    const diagnosis = await generateAttendanceDiagnosis(session.tenantId, { days: (body as { days?: unknown }).days });
    return NextResponse.json({ diagnosis });
  } catch (error) {
    const code = error instanceof AttendanceDiagnosisError ? error.code : 'failed';
    const { status, error: message } = ERRORS[code];
    return NextResponse.json({ error: message }, { status });
  }
});
