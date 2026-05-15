const DEFAULT_GRACE_DAYS = 5;

export type BillingAccessStatus = 'active' | 'courtesy' | 'past_due' | 'suspended' | 'canceled' | 'blocked' | 'inactive' | string | null | undefined;

export type BillingAccessInput = {
  tenantStatus?: BillingAccessStatus;
  subscriptionStatus?: BillingAccessStatus;
  gracePeriodEndsAt?: Date | string | null;
  now?: Date;
  graceDays?: number;
};

export type BillingAccessResult = {
  allowed: boolean;
  shouldSuspend: boolean;
  reason: 'active' | 'courtesy' | 'past_due_grace' | 'past_due_expired' | 'suspended' | 'canceled' | 'blocked' | 'unknown';
};

export function evaluateBillingAccess(input: BillingAccessInput): BillingAccessResult {
  const now = input.now ?? new Date();
  const graceDays = input.graceDays ?? DEFAULT_GRACE_DAYS;
  const normalizedTenant = String(input.tenantStatus || '').toLowerCase();
  const normalizedSub = String(input.subscriptionStatus || '').toLowerCase();

  if (normalizedSub === 'courtesy') return { allowed: true, shouldSuspend: false, reason: 'courtesy' };
  if (normalizedTenant === 'suspended' || normalizedSub === 'suspended') return { allowed: false, shouldSuspend: false, reason: 'suspended' };
  if (normalizedTenant === 'canceled' || normalizedSub === 'canceled') return { allowed: false, shouldSuspend: false, reason: 'canceled' };
  if (normalizedTenant === 'blocked' || normalizedTenant === 'inactive') return { allowed: false, shouldSuspend: false, reason: 'blocked' };
  if (normalizedTenant === 'active' || normalizedSub === 'active') return { allowed: true, shouldSuspend: false, reason: 'active' };

  if (normalizedTenant === 'past_due' || normalizedSub === 'past_due') {
    const graceEndsAt = input.gracePeriodEndsAt ? new Date(input.gracePeriodEndsAt) : new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
    const expired = graceEndsAt.getTime() < now.getTime();
    if (expired) return { allowed: false, shouldSuspend: true, reason: 'past_due_expired' };
    return { allowed: true, shouldSuspend: false, reason: 'past_due_grace' };
  }

  return { allowed: true, shouldSuspend: false, reason: 'unknown' };
}
