import { Prisma } from '@prisma/client';

export const DUPLICATE_FORM_PHONE_CODE = 'duplicate_form_phone';
export const DUPLICATE_FORM_PHONE_MESSAGE = 'Este contato já está cadastrado nesta conta.';

export class DuplicateFormPhoneError extends Error {
  readonly code = DUPLICATE_FORM_PHONE_CODE;

  constructor() {
    super(DUPLICATE_FORM_PHONE_MESSAGE);
    this.name = 'DuplicateFormPhoneError';
  }
}

function normalizePhoneIdentity(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const localDigits = digits.startsWith('55') ? digits.slice(2) : digits;
  if (!localDigits) return null;
  return {
    localDigits,
    internationalDigits: `55${localDigits}`,
  };
}

function normalizeEmailIdentity(email?: string | null) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized || null;
}

async function lockTenantContactKeys({
  tx,
  tenantId,
  keys,
}: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  keys: string[];
}) {
  for (const key of [...new Set(keys)].sort()) {
    await tx.$queryRaw<Array<{ locked: number }>>`
      WITH lock_guard AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${key})) AS acquired
      )
      SELECT 1::int AS locked FROM lock_guard
    `;
  }
}

/**
 * Returns the oldest CRM lead that already owns this phone or e-mail in the tenant.
 *
 * The advisory locks serialize concurrent creates for the same contact across
 * manual creation and public forms without requiring a destructive schema change.
 */
export async function findExistingLeadIdByContactInTenant({
  tx,
  tenantId,
  phone,
  email,
}: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  phone?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const normalizedPhone = normalizePhoneIdentity(phone);
  const normalizedEmail = normalizeEmailIdentity(email);

  if (!normalizedPhone && !normalizedEmail) return null;

  const lockKeys: string[] = [];
  if (normalizedPhone) lockKeys.push(`phone:${normalizedPhone.localDigits}`);
  if (normalizedEmail) lockKeys.push(`email:${normalizedEmail}`);
  await lockTenantContactKeys({ tx, tenantId, keys: lockKeys });

  const phoneCondition = normalizedPhone
    ? Prisma.sql`(
        regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${normalizedPhone.localDigits}
        OR regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${normalizedPhone.internationalDigits}
      )`
    : null;
  const emailCondition = normalizedEmail
    ? Prisma.sql`LOWER(BTRIM(COALESCE("email", ''))) = ${normalizedEmail}`
    : null;

  const contactCondition = phoneCondition && emailCondition
    ? Prisma.sql`(${phoneCondition} OR ${emailCondition})`
    : phoneCondition || emailCondition;

  if (!contactCondition) return null;

  const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "leads"
    WHERE "tenant_id" = ${tenantId}
      AND ${contactCondition}
    ORDER BY "created_at" ASC, "id" ASC
    LIMIT 1
  `);

  return existing[0]?.id ?? null;
}

/**
 * Backwards-compatible export. Despite the historical name, the lookup is now
 * tenant-wide so another form can never create a second CRM lead for this phone.
 */
export async function findExistingLeadIdByPhoneInForm({
  tx,
  tenantId,
  phone,
}: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  formId?: string;
  phone: string;
}): Promise<string | null> {
  return findExistingLeadIdByContactInTenant({ tx, tenantId, phone });
}

export async function assertPhoneNotUsedInForm(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  formId?: string;
  phone: string;
}) {
  const existingLeadId = await findExistingLeadIdByContactInTenant(params);
  if (existingLeadId) throw new DuplicateFormPhoneError();
}
