import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FLIP_AI_TEXT_MODEL } from './openai-responses';

/**
 * Manual reference of the prepaid balance held at the provider, typed by the
 * platform admin in the Treasury panel. OpenAI exposes no balance endpoint, so
 * this is never an official figure and never moves money.
 */

const SETTINGS_ID = 'default';
export const OPENAI_OPERATIONAL_BALANCE_MAX_USD = 100_000_000;

export type OpenAiOperationalBalanceReference = {
  raw: string | undefined;
  source: 'admin_panel' | 'manual_server_configuration';
  updatedAt: string | null;
};

/** The panel value wins; the server variable remains the fallback. Never throws. */
export async function resolveOpenAiOperationalBalanceReference(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpenAiOperationalBalanceReference> {
  try {
    const row = await prisma.platformFlipAiSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { operationalBalanceUsd: true, operationalBalanceUpdatedAt: true },
    });
    if (row?.operationalBalanceUsd != null) {
      return {
        raw: row.operationalBalanceUsd.toString(),
        source: 'admin_panel',
        updatedAt: row.operationalBalanceUpdatedAt?.toISOString() ?? null,
      };
    }
  } catch {
    // Columns not applied yet or database unavailable: use the server variable.
  }
  return { raw: env.OPENAI_OPERATIONAL_BALANCE_USD, source: 'manual_server_configuration', updatedAt: null };
}

export function parseOperationalBalanceInput(value: unknown): { ok: true; usd: number | null } | { ok: false } {
  if (value === null || value === '') return { ok: true, usd: null };
  const usd = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(',', '.')) : Number.NaN;
  if (!Number.isFinite(usd) || usd < 0 || usd > OPENAI_OPERATIONAL_BALANCE_MAX_USD) return { ok: false };
  return { ok: true, usd: Math.round(usd * 100) / 100 };
}

export async function setOpenAiOperationalBalanceReference(input: { usd: number | null; userId: string | null }) {
  const data = {
    operationalBalanceUsd: input.usd === null ? null : new Prisma.Decimal(input.usd),
    operationalBalanceUpdatedAt: new Date(),
    updatedById: input.userId,
  };
  await prisma.platformFlipAiSettings.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    // The row may not exist yet; the text model keeps its current default.
    create: { id: SETTINGS_ID, textModel: FLIP_AI_TEXT_MODEL, ...data },
    select: { id: true },
  });
}
