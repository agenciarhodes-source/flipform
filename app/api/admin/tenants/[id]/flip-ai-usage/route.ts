import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getFlipAiUsageDashboardForTenant } from '@/lib/flip-ai/usage';
import { resolveFlipAiUsageRange } from '@/lib/flip-ai/usage-range';

export const GET = withPlatformAdmin(async (req, _session, ctx: { params: { id: string } }) => {
  try {
    const { searchParams } = new URL(req.url);
    const range = resolveFlipAiUsageRange({
      range: searchParams.get('range') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      days: searchParams.get('days') || undefined,
    });
    const usage = await getFlipAiUsageDashboardForTenant(ctx.params.id, range);
    return NextResponse.json({ usage });
  } catch (error) {
    if (error instanceof FlipAiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Não foi possível carregar o consumo de IA deste cliente.' }, { status: 500 });
  }
});
