import 'server-only';

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipAiError, requireFlipAiAccess } from './access';

export const FLIP_AI_CREDIT_ENTRY_TYPES = ['credit', 'debit', 'refund'] as const;
export type FlipAiCreditEntryType = (typeof FLIP_AI_CREDIT_ENTRY_TYPES)[number];

const MAX_CREDIT_AMOUNT = 2_000_000_000;
const MAX_KEY_LENGTH = 160;
const MAX_SOURCE_LENGTH = 80;
const MAX_REFERENCE_LENGTH = 190;

type CreditAccountRow = {
  id: string;
  balanceCredits: number;
  version: number;
};

type CreditLedgerRow = {
  id: string;
  idempotencyKey: string;
  entryType: string;
  amountCredits: number;
  balanceAfterCredits: number;
  source: string;
  referenceId: string | null;
  createdAt: Date;
};

export type FlipAiCreditDateRange = {
  from: Date;
  toExclusive: Date;
};

export type FlipAiCreditWallet = {
  available: boolean;
  balanceCredits: number;
  creditedCredits: number;
  debitedCredits: number;
  entries: Array<{
    id: string;
    idempotencyKey: string;
    entryType: FlipAiCreditEntryType;
    amountCredits: number;
    balanceAfterCredits: number;
    source: string;
    referenceId: string | null;
    createdAt: string;
  }>;
};

export type FlipAiCreditMutation = {
  tenantId: string;
  idempotencyKey: string;
  entryType: FlipAiCreditEntryType;
  amountCredits: number;
  source: string;
  referenceId?: string | null;
};

export type FlipAiCreditMutationResult = {
  entryId: string;
  balanceCredits: number;
  reused: boolean;
};

function boundedText(value: string, field: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new FlipAiError('FLIP_AI_CREDIT_INVALID_INPUT', 400,
      `${field} deve ter entre 1 e ${maxLength} caracteres.`);
  }
  return normalized;
}

export function validateFlipAiCreditMutation(input: FlipAiCreditMutation) {
  const tenantId = boundedText(input.tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  const idempotencyKey = boundedText(input.idempotencyKey, 'idempotencyKey', MAX_KEY_LENGTH);
  const source = boundedText(input.source, 'source', MAX_SOURCE_LENGTH);
  const referenceId = input.referenceId == null || input.referenceId.trim() === ''
    ? null
    : boundedText(input.referenceId, 'referenceId', MAX_REFERENCE_LENGTH);
  if (!FLIP_AI_CREDIT_ENTRY_TYPES.includes(input.entryType)) {
    throw new FlipAiError('FLIP_AI_CREDIT_INVALID_INPUT', 400, 'Tipo de lançamento inválido.');
  }
  if (!Number.isSafeInteger(input.amountCredits)
    || input.amountCredits <= 0
    || input.amountCredits > MAX_CREDIT_AMOUNT) {
    throw new FlipAiError('FLIP_AI_CREDIT_INVALID_INPUT', 400,
      'A quantidade de créditos deve ser um inteiro positivo dentro do limite permitido.');
  }
  return {
    tenantId,
    idempotencyKey,
    entryType: input.entryType,
    amountCredits: input.amountCredits,
    source,
    referenceId,
  };
}

async function creditSchemaReady(db: Prisma.TransactionClient) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_credit_accounts') IS NOT NULL
      AND to_regclass('public.flip_ai_credit_ledger') IS NOT NULL AS ready
  `);
  return Boolean(rows[0]?.ready);
}

function toWalletEntry(row: CreditLedgerRow) {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    entryType: row.entryType as FlipAiCreditEntryType,
    amountCredits: row.amountCredits,
    balanceAfterCredits: row.balanceAfterCredits,
    source: row.source,
    referenceId: row.referenceId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadFlipAiCreditWalletForTenant(
  db: Prisma.TransactionClient,
  tenantId: string,
  limit = 50,
  range?: FlipAiCreditDateRange,
): Promise<FlipAiCreditWallet> {
  const safeTenantId = boundedText(tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  const rangeFrom = range?.from || new Date('1970-01-01T00:00:00.000Z');
  const rangeUntil = range?.toExclusive || new Date('9999-12-31T23:59:59.999Z');

  if (!await creditSchemaReady(db)) {
    return {
      available: false,
      balanceCredits: 0,
      creditedCredits: 0,
      debitedCredits: 0,
      entries: [],
    };
  }

  const accounts = await db.$queryRaw<CreditAccountRow[]>(Prisma.sql`
    SELECT id, balance_credits AS "balanceCredits", version
    FROM flip_ai_credit_accounts
    WHERE tenant_id = ${safeTenantId}
    LIMIT 1
  `);
  const account = accounts[0];
  if (!account) {
    return {
      available: true,
      balanceCredits: 0,
      creditedCredits: 0,
      debitedCredits: 0,
      entries: [],
    };
  }

  const totals = await db.$queryRaw<Array<{
    creditedCredits: number | bigint | string;
    debitedCredits: number | bigint | string;
  }>>(Prisma.sql`
    SELECT
      COALESCE(SUM(amount_credits) FILTER (WHERE entry_type IN ('credit', 'refund')), 0)
        AS "creditedCredits",
      COALESCE(SUM(amount_credits) FILTER (WHERE entry_type = 'debit'), 0)
        AS "debitedCredits"
    FROM flip_ai_credit_ledger
    WHERE tenant_id = ${safeTenantId} AND account_id = ${account.id}
      AND created_at >= ${rangeFrom} AND created_at < ${rangeUntil}
  `);
  const entries = await db.$queryRaw<CreditLedgerRow[]>(Prisma.sql`
    SELECT id, idempotency_key AS "idempotencyKey", entry_type AS "entryType",
      amount_credits AS "amountCredits", balance_after_credits AS "balanceAfterCredits",
      source, reference_id AS "referenceId", created_at AS "createdAt"
    FROM flip_ai_credit_ledger
    WHERE tenant_id = ${safeTenantId} AND account_id = ${account.id}
      AND created_at >= ${rangeFrom} AND created_at < ${rangeUntil}
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit}
  `);
  const total = totals[0];
  return {
    available: true,
    balanceCredits: account.balanceCredits,
    creditedCredits: Number(total?.creditedCredits || 0),
    debitedCredits: Number(total?.debitedCredits || 0),
    entries: entries.map(toWalletEntry),
  };
}

export async function getFlipAiCreditWallet(
  session: SessionPayload,
  limit = 50,
  range?: FlipAiCreditDateRange,
): Promise<FlipAiCreditWallet> {
  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    return loadFlipAiCreditWalletForTenant(db, tenantId, limit, range);
  });
}

export async function getFlipAiCreditWalletForTenant(
  tenantId: string,
  limit = 50,
  range?: FlipAiCreditDateRange,
): Promise<FlipAiCreditWallet> {
  return prisma.$transaction((db) =>
    loadFlipAiCreditWalletForTenant(db, tenantId, limit, range));
}

export async function getFlipAiCreditBalanceForTenant(
  tenantId: string,
): Promise<{ available: boolean; balanceCredits: number }> {
  const safeTenantId = boundedText(tenantId, 'tenantId', MAX_REFERENCE_LENGTH);
  return prisma.$transaction(async (db) => {
    if (!await creditSchemaReady(db)) {
      return { available: false, balanceCredits: 0 };
    }
    const accounts = await db.$queryRaw<CreditAccountRow[]>(Prisma.sql`
      SELECT id, balance_credits AS "balanceCredits", version
      FROM flip_ai_credit_accounts
      WHERE tenant_id = ${safeTenantId}
      LIMIT 1
    `);
    return {
      available: true,
      balanceCredits: accounts[0]?.balanceCredits || 0,
    };
  });
}

export async function recordFlipAiCreditEntryWithDb(
  db: Prisma.TransactionClient,
  mutation: ReturnType<typeof validateFlipAiCreditMutation>,
): Promise<FlipAiCreditMutationResult> {
  if (!await creditSchemaReady(db)) {
    throw new FlipAiError('FLIP_AI_CREDIT_SCHEMA_NOT_READY', 503,
      'A carteira de créditos ainda está em preparação.');
  }

  const accountId = randomUUID();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO flip_ai_credit_accounts
      (id, tenant_id, balance_credits, version, created_at, updated_at)
    VALUES (${accountId}, ${mutation.tenantId}, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (tenant_id) DO NOTHING
  `);
  const accounts = await db.$queryRaw<CreditAccountRow[]>(Prisma.sql`
    SELECT id, balance_credits AS "balanceCredits", version
    FROM flip_ai_credit_accounts
    WHERE tenant_id = ${mutation.tenantId}
    FOR UPDATE
  `);
  const account = accounts[0];
  if (!account) {
    throw new FlipAiError('FLIP_AI_CREDIT_ACCOUNT_UNAVAILABLE', 503,
      'Não foi possível preparar a carteira de créditos.');
  }

  const existingRows = await db.$queryRaw<CreditLedgerRow[]>(Prisma.sql`
    SELECT id, idempotency_key AS "idempotencyKey", entry_type AS "entryType",
      amount_credits AS "amountCredits", balance_after_credits AS "balanceAfterCredits",
      source, reference_id AS "referenceId", created_at AS "createdAt"
    FROM flip_ai_credit_ledger
    WHERE tenant_id = ${mutation.tenantId}
      AND idempotency_key = ${mutation.idempotencyKey}
    LIMIT 1
  `);
  const existing = existingRows[0];
  if (existing) {
    const sameMutation = existing.entryType === mutation.entryType
      && existing.amountCredits === mutation.amountCredits
      && existing.source === mutation.source
      && existing.referenceId === mutation.referenceId;
    if (!sameMutation) {
      throw new FlipAiError('FLIP_AI_CREDIT_IDEMPOTENCY_CONFLICT', 409,
        'A chave idempotente já foi usada por outro lançamento.');
    }
    return {
      entryId: existing.id,
      balanceCredits: existing.balanceAfterCredits,
      reused: true,
    };
  }

  const signedAmount = mutation.entryType === 'debit'
    ? -mutation.amountCredits
    : mutation.amountCredits;
  const nextBalance = account.balanceCredits + signedAmount;
  if (!Number.isSafeInteger(nextBalance)
    || nextBalance < 0
    || nextBalance > MAX_CREDIT_AMOUNT) {
    throw new FlipAiError(
      nextBalance < 0
        ? 'FLIP_AI_CREDIT_BALANCE_INSUFFICIENT'
        : 'FLIP_AI_CREDIT_BALANCE_LIMIT',
      409,
      nextBalance < 0
        ? 'Saldo de créditos insuficiente.'
        : 'O saldo ultrapassaria o limite permitido.',
    );
  }

  await db.$executeRaw(Prisma.sql`
    UPDATE flip_ai_credit_accounts
    SET balance_credits = ${nextBalance},
      version = version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ${mutation.tenantId} AND id = ${account.id}
  `);
  const entryId = randomUUID();
  await db.$executeRaw(Prisma.sql`
    INSERT INTO flip_ai_credit_ledger
      (id, tenant_id, account_id, idempotency_key, entry_type,
        amount_credits, balance_after_credits, source, reference_id, created_at)
    VALUES
      (${entryId}, ${mutation.tenantId}, ${account.id}, ${mutation.idempotencyKey},
        ${mutation.entryType}, ${mutation.amountCredits}, ${nextBalance},
        ${mutation.source}, ${mutation.referenceId}, CURRENT_TIMESTAMP)
  `);
  return { entryId, balanceCredits: nextBalance, reused: false };
}

export async function recordFlipAiCreditEntry(
  input: FlipAiCreditMutation,
): Promise<FlipAiCreditMutationResult> {
  const mutation = validateFlipAiCreditMutation(input);
  return prisma.$transaction((db) => recordFlipAiCreditEntryWithDb(db, mutation));
}

export async function grantFlipAiCreditsByPlatformAdmin(input: {
  tenantId: string;
  amountCredits: number;
  reason: string;
  idempotencyIdentifier: string;
  actorUserId: string;
}): Promise<FlipAiCreditMutationResult> {
  const reason = boundedText(input.reason, 'motivo', MAX_REFERENCE_LENGTH);
  const identifier = boundedText(input.idempotencyIdentifier, 'identificador', 120);
  const actorUserId = boundedText(input.actorUserId, 'actorUserId', MAX_REFERENCE_LENGTH);
  const mutation = validateFlipAiCreditMutation({
    tenantId: input.tenantId,
    idempotencyKey: `platform-admin:${identifier}`,
    entryType: 'credit',
    amountCredits: input.amountCredits,
    source: 'platform_admin_grant',
    referenceId: reason,
  });

  return prisma.$transaction(async (db) => {
    const tenant = await db.tenant.findUnique({
      where: { id: mutation.tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      throw new FlipAiError('FLIP_AI_CREDIT_TENANT_NOT_FOUND', 404, 'Cliente não encontrado.');
    }

    const result = await recordFlipAiCreditEntryWithDb(db, mutation);
    const auditExists = await db.auditLog.findFirst({
      where: {
        tenantId: mutation.tenantId,
        entityType: 'flip_ai_credit_ledger',
        entityId: result.entryId,
        action: 'platform.flip_ai_credits_granted',
      },
      select: { id: true },
    });
    if (!auditExists) {
      await db.auditLog.create({
        data: {
          tenantId: mutation.tenantId,
          userId: actorUserId,
          entityType: 'flip_ai_credit_ledger',
          entityId: result.entryId,
          action: 'platform.flip_ai_credits_granted',
          metadata: {
            tenantName: tenant.name,
            amountCredits: mutation.amountCredits,
            reason,
            idempotencyIdentifier: identifier,
            balanceAfterCredits: result.balanceCredits,
          },
        },
      });
    }
    return result;
  });
}
