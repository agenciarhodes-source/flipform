export type TreasuryPackageInput = {
  id: string;
  name: string;
  credits: number;
  estimatedOpenAiCostCents: number;
};

export type TreasuryCoverageStatus = 'healthy' | 'attention' | 'risk' | 'unconfigured';

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function resolveTreasuryBufferPercent(raw: string | undefined) {
  if (!raw?.trim()) return 20;
  const normalized = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) return 20;
  return Math.round(normalized * 100) / 100;
}

export function buildTreasuryReservePolicy(
  packages: TreasuryPackageInput[],
  bufferPercent: number,
) {
  const active = packages.filter((item) =>
    Number.isSafeInteger(item.credits) && item.credits > 0
      && Number.isSafeInteger(item.estimatedOpenAiCostCents)
      && item.estimatedOpenAiCostCents >= 0);

  const priced = active
    .filter((item) => item.estimatedOpenAiCostCents > 0)
    .map((item) => ({
      ...item,
      estimatedOpenAiCostUsd: item.estimatedOpenAiCostCents / 100,
      reserveUsdPerMillion: round(
        ((item.estimatedOpenAiCostCents / 100) / item.credits) * 1_000_000,
      ),
    }));

  const reference = priced
    .slice()
    .sort((left, right) => right.reserveUsdPerMillion - left.reserveUsdPerMillion)[0] || null;

  const status = active.length === 0 || priced.length === 0
    ? 'missing'
    : priced.length === active.length
      ? 'complete'
      : 'partial';

  return {
    status,
    bufferPercent,
    reserveUsdPerMillionCredits: reference?.reserveUsdPerMillion ?? null,
    referencePackageId: reference?.id ?? null,
    packages: active.map((item) => {
      const pricedItem = priced.find((candidate) => candidate.id === item.id);
      return {
        id: item.id,
        name: item.name,
        credits: item.credits,
        estimatedOpenAiCostCents: item.estimatedOpenAiCostCents,
        estimatedOpenAiCostUsd: item.estimatedOpenAiCostCents / 100,
        reserveUsdPerMillion: pricedItem?.reserveUsdPerMillion ?? null,
      };
    }),
  } as const;
}

export function calculateTreasuryCoverage(input: {
  creditsInCirculation: number;
  reserveUsdPerMillionCredits: number | null;
  bufferPercent: number;
  operationalBalanceUsd: number | null;
}) {
  const credits = Number.isSafeInteger(input.creditsInCirculation) && input.creditsInCirculation > 0
    ? input.creditsInCirculation
    : 0;
  const rate = input.reserveUsdPerMillionCredits != null
    && Number.isFinite(input.reserveUsdPerMillionCredits)
    && input.reserveUsdPerMillionCredits >= 0
    ? input.reserveUsdPerMillionCredits
    : null;
  const balance = input.operationalBalanceUsd != null
    && Number.isFinite(input.operationalBalanceUsd)
    && input.operationalBalanceUsd >= 0
    ? input.operationalBalanceUsd
    : null;

  const liabilityUsd = rate == null
    ? null
    : round((credits / 1_000_000) * rate);
  const requiredReserveUsd = liabilityUsd == null
    ? null
    : round(liabilityUsd * (1 + input.bufferPercent / 100));

  let status: TreasuryCoverageStatus = 'unconfigured';
  if (liabilityUsd === 0 && requiredReserveUsd === 0) {
    status = 'healthy';
  } else if (liabilityUsd != null && requiredReserveUsd != null && balance != null) {
    status = balance >= requiredReserveUsd
      ? 'healthy'
      : balance >= liabilityUsd
        ? 'attention'
        : 'risk';
  }

  return {
    liabilityUsd,
    requiredReserveUsd,
    operationalBalanceUsd: balance,
    coveragePercent: liabilityUsd && balance != null
      ? round((balance / liabilityUsd) * 100, 2)
      : null,
    requiredReserveCoveragePercent: requiredReserveUsd && balance != null
      ? round((balance / requiredReserveUsd) * 100, 2)
      : null,
    recommendedTopUpUsd: requiredReserveUsd != null && balance != null
      ? round(Math.max(0, requiredReserveUsd - balance))
      : null,
    status,
  };
}
