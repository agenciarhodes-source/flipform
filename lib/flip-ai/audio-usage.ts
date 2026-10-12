import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getFlipAiCreditBalanceForTenant } from './credits';
import { settleFlipAiUsageCharge } from './usage-billing';
import type { FlipAiAudioUsage } from './audio-usage-policy';

/** Audio is only produced or transcribed for a company that still has credits. */
export async function hasCreditsForAudio(tenantId: string) {
  try {
    const wallet = await getFlipAiCreditBalanceForTenant(tenantId);
    return wallet.available && wallet.balanceCredits > 0;
  } catch {
    return false;
  }
}

/**
 * Records one audio operation and debits it from the company's wallet, through the same usage
 * event and ledger every other operation uses. The request key makes it charge at most once.
 * It never throws: a billing problem must not break a conversation that already happened.
 */
export async function chargeAudioUsage(input: {
  tenantId: string;
  agentId: string;
  requestKey: string;
  operation: string;
  model: string;
  usage: FlipAiAudioUsage;
  metadata?: Record<string, string | number | boolean>;
}) {
  if (input.usage.inputTokens <= 0 && input.usage.outputTokens <= 0) return;
  try {
    const event = await prisma.flipAiUsageEvent.create({ data: {
      tenantId: input.tenantId,
      agentId: input.agentId,
      requestKey: input.requestKey,
      operation: input.operation,
      provider: 'openai',
      model: input.model,
      status: 'confirmed',
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      units: Math.max(1, input.usage.seconds),
      metadata: { ...input.metadata, audioSeconds: input.usage.seconds, estimated: input.usage.estimated },
    }, select: { id: true } });
    await settleFlipAiUsageCharge({ tenantId: input.tenantId, eventId: event.id });
  } catch (error) {
    // The same audio was already recorded: it is not charged twice.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    console.error('[flip-ai] audio usage not recorded', input.operation);
  }
}
