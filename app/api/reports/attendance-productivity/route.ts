import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { can } from '@/lib/rbac';
import {
  attendanceProductivity,
  AttendanceReviewError,
  latestAttendanceReview,
  reviewAttendanceApproach,
} from '@/lib/reports/attendance-productivity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Managers see the whole team; an attendant sees only their own numbers and evaluation. */
function scopeOf(session: { role: string; userId: string }) {
  return can(session.role, 'REPORTS_VIEW_ALL') ? null : session.userId;
}

export const GET = withPermission('REPORTS_VIEW', async (req: NextRequest, session) => {
  const days = Number(new URL(req.url).searchParams.get('days')) || 30;
  const onlyUserId = scopeOf(session);
  const [report, review] = await Promise.all([
    attendanceProductivity(session.tenantId, { days, onlyUserId }),
    latestAttendanceReview(session.tenantId),
  ]);
  const visibleReview = review && onlyUserId
    ? { ...review, summary: '', attendants: review.attendants.filter((entry) => entry.userId === onlyUserId) }
    : review;
  return NextResponse.json({ ...report, review: visibleReview, canReview: can(session.role, 'FLIP_AI_MANAGE') });
});

const REVIEW_ERRORS: Record<AttendanceReviewError['code'], { status: number; error: string }> = {
  unavailable: { status: 503, error: 'A análise por IA não está disponível agora.' },
  recent: { status: 429, error: 'Uma análise foi gerada há menos de 1 hora. Aguarde para gerar outra.' },
  no_credits: { status: 402, error: 'Sem créditos do Flip AI para gerar a análise.' },
  nothing_to_review: { status: 400, error: 'Nenhuma conversa da equipe no período para analisar.' },
  failed: { status: 502, error: 'Não foi possível gerar a análise agora. Tente de novo em instantes.' },
};

/** "Gerar análise da abordagem": spends Flip AI credits, so only owners and admins. */
export const POST = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const body = await req.json().catch(() => ({}));
  const days = Number((body as { days?: unknown }).days) || 30;
  try {
    const review = await reviewAttendanceApproach(session.tenantId, { days });
    return NextResponse.json({ review });
  } catch (error) {
    const code = error instanceof AttendanceReviewError ? error.code : 'failed';
    const { status, error: message } = REVIEW_ERRORS[code];
    return NextResponse.json({ error: message }, { status });
  }
});
