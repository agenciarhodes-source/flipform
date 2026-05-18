const GRACE_DAYS = 5;

type Status = string | null | undefined;

export type BillingAccessInput = {
  tenantStatus?: Status;
  subscriptionStatus?: Status;
  gracePeriodEndsAt?: Date | string | null;
  now?: Date;
};

export type BillingAccessResult = {
  allowAccess: boolean;
  shouldSuspend: boolean;
  reason: 'active' | 'trial' | 'courtesy' | 'past_due_grace' | 'past_due_expired' | 'suspended' | 'canceled' | 'blocked' | 'unknown';
};

export function evaluateBillingAccess(input: BillingAccessInput): BillingAccessResult {
  const tenantStatus = String(input.tenantStatus || '').toLowerCase();
  const subscriptionStatus = String(input.subscriptionStatus || '').toLowerCase();
  const now = input.now ?? new Date();

  if (subscriptionStatus === 'courtesy') return { allowAccess: true, shouldSuspend: false, reason: 'courtesy' };
  if (tenantStatus === 'suspended' || subscriptionStatus === 'suspended') return { allowAccess: false, shouldSuspend: false, reason: 'suspended' };
  if (tenantStatus === 'canceled' || subscriptionStatus === 'canceled') return { allowAccess: false, shouldSuspend: false, reason: 'canceled' };
  if (tenantStatus === 'blocked' || tenantStatus === 'inactive') return { allowAccess: false, shouldSuspend: false, reason: 'blocked' };

  if (tenantStatus === 'past_due' || subscriptionStatus === 'past_due') {
    const gracePeriodEndsAt = input.gracePeriodEndsAt ? new Date(input.gracePeriodEndsAt) : new Date(now.getTime() + GRACE_DAYS * 86400000);
    const expired = gracePeriodEndsAt.getTime() < now.getTime();
    return expired
      ? { allowAccess: false, shouldSuspend: true, reason: 'past_due_expired' }
      : { allowAccess: true, shouldSuspend: false, reason: 'past_due_grace' };
  }

  if (tenantStatus === 'trial' || subscriptionStatus === 'trialing') {
    return { allowAccess: true, shouldSuspend: false, reason: 'trial' };
  }

  if (tenantStatus === 'active' || subscriptionStatus === 'active') return { allowAccess: true, shouldSuspend: false, reason: 'active' };

  return { allowAccess: true, shouldSuspend: false, reason: 'unknown' };
}
