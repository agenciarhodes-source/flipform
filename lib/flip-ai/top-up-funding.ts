import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { getFlipAiCreditPackages } from './credit-packages';

/**
 * Manual control of the provider recharge owed for each credit package a company bought.
 * Marking a purchase as funded is a note for the platform admin: it never moves money,
 * never talks to the provider and never changes a company wallet.
 */

/** 1 credit = 1,000 nano-USD, so one million credits is one dollar of provider balance. */
export function recommendedProviderFundingUsd(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.round((credits / 1_000_000) * 100) / 100;
}

export type TopUpFundingRow = {
  orderId: string;
  tenantId: string;
  tenantName: string;
  /** Catalog package with the same amount of credits, when one still exists. */
  packageName: string | null;
  credits: number;
  amountCents: number;
  currency: string;
  creditedAt: string | null;
  recommendedUsd: number;
  funded: boolean;
  fundedAt: string | null;
  fundedUsd: number | null;
};

function isSchemaPending(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2021' || error.code === 'P2022');
}

export async function listTopUpFunding(limit = 200): Promise<{
  rows: TopUpFundingRow[];
  pendingCount: number;
  pendingUsd: number;
  fundingAvailable: boolean;
}> {
  const orders = await prisma.flipAiTopUpOrder.findMany({
    where: { status: 'credited' },
    orderBy: [{ creditedAt: 'desc' }, { createdAt: 'desc' }],
    take: Math.max(1, Math.min(500, Math.trunc(limit))),
    select: {
      id: true,
      tenantId: true,
      credits: true,
      amountCents: true,
      currency: true,
      creditedAt: true,
      tenant: { select: { name: true } },
    },
  });

  let fundingAvailable = true;
  const funding = await prisma.platformTopUpFunding.findMany({
    where: { orderId: { in: orders.map((order) => order.id) } },
    select: { orderId: true, fundedAt: true, fundedUsd: true },
  }).catch((error: unknown) => {
    // Table not applied yet: the list still works, without the funded mark.
    if (!isSchemaPending(error)) throw error;
    fundingAvailable = false;
    return [];
  });
  const fundedByOrder = new Map(funding.map((item) => [item.orderId, item]));
  // Purchases do not store the package, so the name comes from the current catalog by credit amount.
  let packageByCredits = new Map<number, string>();
  try {
    packageByCredits = new Map(getFlipAiCreditPackages().map((item) => [item.credits, item.name]));
  } catch {
    // An invalid catalog only leaves the package name empty.
  }

  const rows = orders.map((order): TopUpFundingRow => {
    const mark = fundedByOrder.get(order.id);
    return {
      orderId: order.id,
      tenantId: order.tenantId,
      tenantName: order.tenant.name,
      packageName: packageByCredits.get(order.credits) ?? null,
      credits: order.credits,
      amountCents: order.amountCents,
      currency: order.currency,
      creditedAt: order.creditedAt?.toISOString() ?? null,
      recommendedUsd: recommendedProviderFundingUsd(order.credits),
      funded: Boolean(mark),
      fundedAt: mark?.fundedAt.toISOString() ?? null,
      fundedUsd: mark ? Number(mark.fundedUsd) : null,
    };
  });
  const pending = rows.filter((row) => !row.funded);
  return {
    rows,
    pendingCount: pending.length,
    pendingUsd: Math.round(pending.reduce((sum, row) => sum + row.recommendedUsd, 0) * 100) / 100,
    fundingAvailable,
  };
}

export async function setTopUpFunded(input: { orderId: string; funded: boolean; userId: string | null }) {
  const order = await prisma.flipAiTopUpOrder.findFirst({
    where: { id: input.orderId, status: 'credited' },
    select: { id: true, tenantId: true, credits: true },
  });
  if (!order) return null;

  if (!input.funded) {
    await prisma.platformTopUpFunding.deleteMany({ where: { orderId: order.id } });
    return { orderId: order.id, tenantId: order.tenantId, funded: false, fundedUsd: null };
  }
  const fundedUsd = recommendedProviderFundingUsd(order.credits);
  await prisma.platformTopUpFunding.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      orderId: order.id,
      fundedUsd: new Prisma.Decimal(fundedUsd),
      fundedAt: new Date(),
      fundedById: input.userId,
    },
    select: { orderId: true },
  });
  return { orderId: order.id, tenantId: order.tenantId, funded: true, fundedUsd };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char
  ));
}

/**
 * Tells the platform owner that a company bought credits and how much provider balance
 * that purchase calls for. Best-effort: a failure here never affects the payment.
 */
export async function notifyTopUpCredited(input: { orderId: string }, env: NodeJS.ProcessEnv = process.env) {
  const to = String(env.FLIP_AI_TOP_UP_NOTIFY_EMAIL || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false as const, reason: 'not_configured' as const };

  const order = await prisma.flipAiTopUpOrder.findFirst({
    where: { id: input.orderId, status: 'credited' },
    select: { credits: true, amountCents: true, tenant: { select: { name: true } } },
  });
  if (!order) return { sent: false as const, reason: 'order_not_found' as const };

  const credits = new Intl.NumberFormat('pt-BR').format(order.credits);
  const paid = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.amountCents / 100);
  const usd = recommendedProviderFundingUsd(order.credits).toFixed(2);
  const company = escapeHtml(order.tenant.name);
  await sendEmail({
    to,
    subject: `Flip AI: ${order.tenant.name} comprou ${credits} créditos`,
    html: [
      `<p><strong>${company}</strong> comprou <strong>${credits} créditos</strong> do Flip AI por ${paid}.</p>`,
      `<p>Recarga sugerida na OpenAI: <strong>US$ ${usd}</strong>.</p>`,
      '<p>Depois de recarregar, marque a compra como "valor atribuído" em Super Admin → Tesouraria.</p>',
      '<p>Os créditos já foram liberados na carteira da empresa; este aviso é só para o seu controle.</p>',
    ].join(''),
  });
  return { sent: true as const };
}
