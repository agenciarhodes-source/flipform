import { prisma } from '@/lib/prisma';
import { planFeatures, PUBLIC_PLAN_SLUGS, stripeSubscriptionsEnabled, TRIAL_DAYS } from '@/lib/billing/subscription-rules';
import { CheckoutClient, type CheckoutPlan } from './checkout-client';

export const dynamic = 'force-dynamic';

/** Public checkout: the plans, prices and limits come from the plans table (what is really charged). */
export default async function CheckoutPage({ params }: { params: { planSlug: string } }) {
  const rows = await prisma.plan.findMany({
    where: { slug: { in: [...PUBLIC_PLAN_SLUGS] }, isActive: true },
    orderBy: { price: 'asc' },
    select: { slug: true, name: true, price: true, maxUsers: true, maxForms: true, maxPipelines: true, maxLeadsPerMonth: true },
  });
  const plans: CheckoutPlan[] = rows.map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    price: Number(plan.price),
    features: planFeatures(plan),
    recommended: plan.slug === 'growth',
  }));
  const stripe = stripeSubscriptionsEnabled();
  return <CheckoutClient initialSlug={(params.planSlug || '').toLowerCase()} plans={plans} trialDays={stripe ? TRIAL_DAYS : 0} />;
}
