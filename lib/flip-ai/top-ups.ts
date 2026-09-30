import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FlipAiError } from './access';
import {
  recordFlipAiCreditEntryWithDb,
  validateFlipAiCreditMutation,
} from './credits';

export const FLIP_AI_TOP_UP_STATUSES = ['pending', 'paid', 'credited', 'canceled'] as const;
export type FlipAiTopUpStatus = (typeof FLIP_AI_TOP_UP_STATUSES)[number];

const MAX_REFERENCE_LENGTH = 190;
const MAX_REQUEST_KEY_LENGTH = 120;
const MAX_AMOUNT_CENTS = 100_000_000;
const MAX_CREDITS = 2_000_000_000;
const MAX_ESTIMATED_OPENAI_COST_CENTS = 100_000_000;

type TopUpRow = {
  id: string;
  tenantId: string;
  requestKey: string;
  status: string;
  amountCents: number;
  currency: string;
  credits: number;
  estimatedOpenAiCostCents: number;
  estimatedOpenAiCostCurrency: string;
  paymentProvider: string | null;
  providerPaymentId: string | null;
  paymentMethod: string | null;
  paidAt: Date | null;
  creditedAt: Date | null;
  canceledAt: Date | null;
  creditLedgerEntryId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateFlipAiTopUpOrderInput = {
  tenantId: string;
  requestKey: string;
  amountCents: number;
  credits: number;
  estimatedOpenAiCostCents?: number;
  actorUserId: string;
};

function boundedText(value: string, field: string, maxLength: number) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) {
    throw new FlipAiError(
      'FLIP_AI_TOP_UP_INVALID_INPUT',
      400,
      `${field} deve ter entre 1 e ${maxLength} caracteres.`,
    );
  }
  return normalized;
}

function positiveInt(value: number, field: string, max: number, allowZero = false) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum || value > max) {
    throw new FlipAiError(
      'FLIP_AI_TOP_UP_INVALID_INPUT',
      400,
      `${field} deve ser um inteiro entre ${minimum} e ${max}.`,
    );
  }
  return value;
}

export function validateCreateFlipAiTopUpOrder(input: CreateFlipAiTopUpOrderInput) {
  const tenantId = boundedText(input.tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  const actorUserId = boundedText(input.actorUserId, 'actorUserId', MAX_REFERENCE_LENGTH);
  const requestKey = boundedText(input.requestKey, 'requestKey', MAX_REQUEST_KEY_LENGTH);
  if (!/^[A-Za-z0-9._:-]+$/.test(requestKey)) {
    throw new FlipAiError(
      'FLIP_AI_TOP_UP_INVALID_INPUT',
      400,
      'requestKey deve usar apenas letras, números, ponto, hífen, dois-pontos ou sublinhado.',
    );
  }
  return {
    tenantId,
    actorUserId,
    requestKey,
    amountCents: positiveInt(input.amountCents, 'amountCents', MAX_AMOUNT_CENTS),
    credits: positiveInt(input.credits, 'credits', MAX_CREDITS),
    estimatedOpenAiCostCents: positiveInt(
      input.estimatedOpenAiCostCents ?? 0,
      'estimatedOpenAiCostCents',
      MAX_ESTIMATED_OPENAI_COST_CENTS,
      true,
    ),
  };
}

async function topUpSchemaReady(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_top_up_orders') IS NOT NULL AS ready
  `);
  return Boolean(rows[0]?.ready);
}

function toTopUp(row: TopUpRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    requestKey: row.requestKey,
    status: row.status as FlipAiTopUpStatus,
    amountCents: row.amountCents,
    currency: row.currency,
    credits: row.credits,
    estimatedOpenAiCostCents: row.estimatedOpenAiCostCents,
    estimatedOpenAiCostCurrency: row.estimatedOpenAiCostCurrency,
    paymentProvider: row.paymentProvider,
    providerPaymentId: row.providerPaymentId,
    paymentMethod: row.paymentMethod,
    paidAt: row.paidAt?.toISOString() ?? null,
    creditedAt: row.creditedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    creditLedgerEntryId: row.creditLedgerEntryId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadTopUpRows(
  db: Prisma.TransactionClient,
  tenantId: string,
  limit: number,
) {
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  return db.$queryRaw<TopUpRow[]>(Prisma.sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      request_key AS "requestKey",
      status,
      amount_cents AS "amountCents",
      currency,
      credits,
      estimated_open_ai_cost_cents AS "estimatedOpenAiCostCents",
      estimated_open_ai_cost_currency AS "estimatedOpenAiCostCurrency",
      payment_provider AS "paymentProvider",
      provider_payment_id AS "providerPaymentId",
      payment_method AS "paymentMethod",
      paid_at AS "paidAt",
      credited_at AS "creditedAt",
      canceled_at AS "canceledAt",
      credit_ledger_entry_id AS "creditLedgerEntryId",
      created_by AS "createdBy",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM flip_ai_top_up_orders
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}
  `);
}

async function lockTopUpOrder(
  db: Prisma.TransactionClient,
  tenantId: string,
  orderId: string,
) {
  const rows = await db.$queryRaw<TopUpRow[]>(Prisma.sql`
    SELECT
      id,
      tenant_id AS "tenantId",
      request_key AS "requestKey",
      status,
      amount_cents AS "amountCents",
      currency,
      credits,
      estimated_open_ai_cost_cents AS "estimatedOpenAiCostCents",
      estimated_open_ai_cost_currency AS "estimatedOpenAiCostCurrency",
      payment_provider AS "paymentProvider",
      provider_payment_id AS "providerPaymentId",
      payment_method AS "paymentMethod",
      paid_at AS "paidAt",
      credited_at AS "creditedAt",
      canceled_at AS "canceledAt",
      credit_ledger_entry_id AS "creditLedgerEntryId",
      created_by AS "createdBy",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM flip_ai_top_up_orders
    WHERE tenant_id = ${tenantId} AND id = ${orderId}
    FOR UPDATE
  `);
  const order = rows[0];
  if (!order) {
    throw new FlipAiError('FLIP_AI_TOP_UP_NOT_FOUND', 404, 'Recarga não encontrada.');
  }
  return order;
}

async function writeAudit(
  db: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorUserId: string;
    orderId: string;
    action: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      entityType: 'flip_ai_top_up_order',
      entityId: input.orderId,
      action: input.action,
      metadata: input.metadata,
    },
  });
}

export async function listFlipAiTopUpOrdersForTenant(tenantId: string, limit = 50) {
  const safeTenantId = boundedText(tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  return prisma.$transaction(async (db) => {
    if (!await topUpSchemaReady(db)) return { available: false, orders: [] };
    const rows = await loadTopUpRows(db, safeTenantId, limit);
    return { available: true, orders: rows.map(toTopUp) };
  });
}

export async function createFlipAiTopUpOrder(input: CreateFlipAiTopUpOrderInput) {
  const validated = validateCreateFlipAiTopUpOrder(input);

  return prisma.$transaction(async (db) => {
    if (!await topUpSchemaReady(db)) {
      throw new FlipAiError(
        'FLIP_AI_TOP_UP_SCHEMA_NOT_READY',
        503,
        'A estrutura de recargas comerciais ainda está em preparação.',
      );
    }

    const tenant = await db.tenant.findUnique({
      where: { id: validated.tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      throw new FlipAiError('FLIP_AI_TOP_UP_TENANT_NOT_FOUND', 404, 'Cliente não encontrado.');
    }

    const existing = await db.flipAiTopUpOrder.findUnique({
      where: {
        tenantId_requestKey: {
          tenantId: validated.tenantId,
          requestKey: validated.requestKey,
        },
      },
    });

    if (existing) {
      const sameOrder = existing.amountCents === validated.amountCents
        && existing.credits === validated.credits
        && existing.estimatedOpenAiCostCents === validated.estimatedOpenAiCostCents;
      if (!sameOrder) {
        throw new FlipAiError(
          'FLIP_AI_TOP_UP_IDEMPOTENCY_CONFLICT',
          409,
          'A chave idempotente já pertence a outra recarga.',
        );
      }
      return { order: toTopUp(existing as unknown as TopUpRow), reused: true };
    }

    const order = await db.flipAiTopUpOrder.create({
      data: {
        tenantId: validated.tenantId,
        requestKey: validated.requestKey,
        status: 'pending',
        amountCents: validated.amountCents,
        currency: 'BRL',
        credits: validated.credits,
        estimatedOpenAiCostCents: validated.estimatedOpenAiCostCents,
        estimatedOpenAiCostCurrency: 'USD',
        createdBy: validated.actorUserId,
      },
    });

    await writeAudit(db, {
      tenantId: validated.tenantId,
      actorUserId: validated.actorUserId,
      orderId: order.id,
      action: 'platform.flip_ai_top_up_created',
      metadata: {
        tenantName: tenant.name,
        requestKey: validated.requestKey,
        amountCents: validated.amountCents,
        credits: validated.credits,
        estimatedOpenAiCostCents: validated.estimatedOpenAiCostCents,
      },
    });

    return { order: toTopUp(order as unknown as TopUpRow), reused: false };
  });
}

export async function markFlipAiTopUpPaid(input: {
  tenantId: string;
  orderId: string;
  paymentProvider: string;
  providerPaymentId: string;
  paymentMethod?: string | null;
  actorUserId: string;
}) {
  const tenantId = boundedText(input.tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  const orderId = boundedText(input.orderId, 'orderId', MAX_REFERENCE_LENGTH);
  const actorUserId = boundedText(input.actorUserId, 'actorUserId', MAX_REFERENCE_LENGTH);
  const paymentProvider = boundedText(input.paymentProvider, 'paymentProvider', 60);
  const providerPaymentId = boundedText(input.providerPaymentId, 'providerPaymentId', MAX_REFERENCE_LENGTH);
  const paymentMethod = input.paymentMethod?.trim()
    ? boundedText(input.paymentMethod, 'paymentMethod', 60)
    : null;

  return prisma.$transaction(async (db) => {
    if (!await topUpSchemaReady(db)) {
      throw new FlipAiError('FLIP_AI_TOP_UP_SCHEMA_NOT_READY', 503, 'Recargas comerciais ainda indisponíveis.');
    }

    const order = await lockTopUpOrder(db, tenantId, orderId);
    if (order.status === 'canceled') {
      throw new FlipAiError('FLIP_AI_TOP_UP_CANCELED', 409, 'Uma recarga cancelada não pode ser marcada como paga.');
    }
    if (order.status === 'paid' || order.status === 'credited') {
      const samePayment = order.paymentProvider === paymentProvider
        && order.providerPaymentId === providerPaymentId
        && order.paymentMethod === paymentMethod;
      if (!samePayment) {
        throw new FlipAiError(
          'FLIP_AI_TOP_UP_PAYMENT_CONFLICT',
          409,
          'Esta recarga já foi confirmada com outra referência de pagamento.',
        );
      }
      return { order: toTopUp(order), reused: true };
    }

    const updated = await db.flipAiTopUpOrder.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        paymentProvider,
        providerPaymentId,
        paymentMethod,
        paidAt: new Date(),
      },
    });

    await writeAudit(db, {
      tenantId,
      actorUserId,
      orderId: order.id,
      action: 'platform.flip_ai_top_up_paid',
      metadata: { paymentProvider, providerPaymentId, paymentMethod },
    });

    return { order: toTopUp(updated as unknown as TopUpRow), reused: false };
  });
}

export async function creditFlipAiTopUpOrder(input: {
  tenantId: string;
  orderId: string;
  actorUserId: string;
}) {
  const tenantId = boundedText(input.tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  const orderId = boundedText(input.orderId, 'orderId', MAX_REFERENCE_LENGTH);
  const actorUserId = boundedText(input.actorUserId, 'actorUserId', MAX_REFERENCE_LENGTH);

  return prisma.$transaction(async (db) => {
    if (!await topUpSchemaReady(db)) {
      throw new FlipAiError('FLIP_AI_TOP_UP_SCHEMA_NOT_READY', 503, 'Recargas comerciais ainda indisponíveis.');
    }

    const order = await lockTopUpOrder(db, tenantId, orderId);
    if (order.status === 'credited' && order.creditLedgerEntryId) {
      return { order: toTopUp(order), reused: true };
    }
    if (order.status !== 'paid') {
      throw new FlipAiError(
        'FLIP_AI_TOP_UP_NOT_PAID',
        409,
        'A recarga só pode gerar créditos depois da confirmação do pagamento.',
      );
    }

    const mutation = validateFlipAiCreditMutation({
      tenantId,
      idempotencyKey: `top-up:${order.id}`,
      entryType: 'credit',
      amountCredits: order.credits,
      source: 'top_up',
      referenceId: order.id,
    });
    const credit = await recordFlipAiCreditEntryWithDb(db, mutation);

    const updated = await db.flipAiTopUpOrder.update({
      where: { id: order.id },
      data: {
        status: 'credited',
        creditedAt: new Date(),
        creditLedgerEntryId: credit.entryId,
      },
    });

    await writeAudit(db, {
      tenantId,
      actorUserId,
      orderId: order.id,
      action: 'platform.flip_ai_top_up_credited',
      metadata: {
        amountCents: order.amountCents,
        credits: order.credits,
        ledgerEntryId: credit.entryId,
        balanceAfterCredits: credit.balanceCredits,
      },
    });

    return {
      order: toTopUp(updated as unknown as TopUpRow),
      reused: credit.reused,
      balanceCredits: credit.balanceCredits,
    };
  });
}

export async function cancelFlipAiTopUpOrder(input: {
  tenantId: string;
  orderId: string;
  actorUserId: string;
}) {
  const tenantId = boundedText(input.tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  const orderId = boundedText(input.orderId, 'orderId', MAX_REFERENCE_LENGTH);
  const actorUserId = boundedText(input.actorUserId, 'actorUserId', MAX_REFERENCE_LENGTH);

  return prisma.$transaction(async (db) => {
    if (!await topUpSchemaReady(db)) {
      throw new FlipAiError('FLIP_AI_TOP_UP_SCHEMA_NOT_READY', 503, 'Recargas comerciais ainda indisponíveis.');
    }

    const order = await lockTopUpOrder(db, tenantId, orderId);
    if (order.status === 'canceled') return { order: toTopUp(order), reused: true };
    if (order.status !== 'pending') {
      throw new FlipAiError(
        'FLIP_AI_TOP_UP_CANNOT_CANCEL',
        409,
        'Somente recargas pendentes podem ser canceladas nesta versão.',
      );
    }

    const updated = await db.flipAiTopUpOrder.update({
      where: { id: order.id },
      data: { status: 'canceled', canceledAt: new Date() },
    });

    await writeAudit(db, {
      tenantId,
      actorUserId,
      orderId: order.id,
      action: 'platform.flip_ai_top_up_canceled',
    });

    return { order: toTopUp(updated as unknown as TopUpRow), reused: false };
  });
}
