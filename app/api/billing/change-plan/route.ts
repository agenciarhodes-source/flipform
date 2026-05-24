import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { validateTenantWithinPlanLimits } from '@/lib/plan-limits';

const SELF_SERVE = new Set(['starter', 'growth', 'pro']);

export const POST = withAuth(async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `billing:change-plan:user:${session.userId}:ip:${getClientIp(req)}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!['owner', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Você não tem permissão para alterar o plano.', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetPlanSlug = String(body.targetPlanSlug || '').trim().toLowerCase();
  if (targetPlanSlug === 'enterprise') return NextResponse.json({ error: 'Plano Enterprise é sob consulta.', code: 'ENTERPRISE_CONTACT_REQUIRED' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true, status: true } });
  if (!tenant || tenant.status === 'canceled') return NextResponse.json({ error: 'Tenant inválido para troca de plano.', code: 'INVALID_TENANT' }, { status: 400 });

  const currentSub = await prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
  if (!currentSub?.plan) return NextResponse.json({ error: 'Assinatura não encontrada.', code: 'SUBSCRIPTION_NOT_FOUND' }, { status: 404 });
  if (['courtesy', 'manual'].includes(String(currentSub.provider || '').toLowerCase())) {
    return NextResponse.json({ error: 'Troca de plano manual deve ser feita pelo administrador da plataforma.', code: 'MANUAL_PLAN_CHANGE_REQUIRED' }, { status: 400 });
  }

  const targetPlan = await prisma.plan.findFirst({ where: { slug: targetPlanSlug, isActive: true }, select: { id: true, slug: true, price: true, maxUsers: true, maxForms: true, maxPipelines: true, maxLeadsPerMonth: true } });
  if (!targetPlan || !SELF_SERVE.has(targetPlan.slug)) return NextResponse.json({ error: 'Plano inválido ou indisponível.', code: 'INVALID_PLAN' }, { status: 400 });
  if (currentSub.plan.slug === targetPlan.slug) return NextResponse.json({ error: 'Este já é o plano atual.', code: 'SAME_PLAN' }, { status: 400 });

  const isUpgrade = Number(targetPlan.price) > Number(currentSub.plan.price);
  if (!isUpgrade) {
    const limits = await validateTenantWithinPlanLimits(session.tenantId, targetPlan);
    if (!limits.ok) {
      await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.blocked_by_limits', metadata: { targetPlan: targetPlan.slug, violations: limits.violations } });
      return NextResponse.json({ error: 'Sua conta excede os limites do plano selecionado.', code: 'PLAN_LIMIT_EXCEEDED', details: limits.violations }, { status: 400 });
    }
  }

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.requested', metadata: { currentPlan: currentSub.plan.slug, targetPlan: targetPlan.slug, mode: isUpgrade ? 'upgrade' : 'downgrade' } });

  await prisma.subscription.update({ where: { id: currentSub.id }, data: { planId: targetPlan.id } });
  await prisma.tenant.update({ where: { id: session.tenantId }, data: { planId: targetPlan.id } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.applied', metadata: { currentPlan: currentSub.plan.slug, targetPlan: targetPlan.slug } });

  return NextResponse.json({ ok: true, status: 'applied', currentPlan: currentSub.plan.slug, targetPlan: targetPlan.slug, message: 'Solicitação de troca de plano registrada.' });
});
