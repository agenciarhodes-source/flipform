import 'server-only';

import { prisma } from '@/lib/prisma';
import { normalizeInstagramUsername } from './rules';

/** Whether any connected Instagram account of the company has the AI switched on (for the Inbox). */
export async function isInstagramAiEnabledForTenant(tenantId: string) {
  const enabled = await prisma.tenantInstagramAiSettings.findFirst({
    where: { tenantId, enabled: true, agentId: { not: null }, connection: { status: 'connected' } },
    select: { resumeAfterHours: true },
  }).catch(() => null);
  return enabled ? { enabled: true as const, resumeAfterHours: enabled.resumeAfterHours } : { enabled: false as const, resumeAfterHours: null };
}

/**
 * Who the AI answers on the Instagram Direct: everyone, when an account with the AI on is released
 * to all; otherwise only the test profiles. Used to show "IA atendendo" only where the AI answers.
 */
export async function instagramAiAudience(tenantId: string) {
  const accounts = await prisma.tenantInstagramAiSettings.findMany({
    where: { tenantId, enabled: true, agentId: { not: null }, connection: { status: 'connected' } },
    select: { liveEnabled: true, testUsernames: true },
  }).catch(() => []);
  const everyone = accounts.some((account) => account.liveEnabled);
  const tests = new Set(accounts.flatMap((account) => account.testUsernames.map(normalizeInstagramUsername)).filter(Boolean));
  return (username: string | null | undefined) => everyone || tests.has(normalizeInstagramUsername(username));
}
