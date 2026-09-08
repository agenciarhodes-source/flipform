import type { Prisma } from '@prisma/client';

export const DUPLICATE_FORM_PHONE_CODE = 'duplicate_form_phone';
export const DUPLICATE_FORM_PHONE_MESSAGE = 'Este número de telefone já foi cadastrado neste formulário.';

export class DuplicateFormPhoneError extends Error {
  readonly code = DUPLICATE_FORM_PHONE_CODE;

  constructor() {
    super(DUPLICATE_FORM_PHONE_MESSAGE);
    this.name = 'DuplicateFormPhoneError';
  }
}

export async function findExistingLeadIdByPhoneInForm({
  tx,
  tenantId,
  formId,
  phone,
}: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  formId: string;
  phone: string;
}): Promise<string | null> {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;

  const localDigits = digits.startsWith('55') ? digits.slice(2) : digits;

  // Serializa apenas submissões concorrentes do mesmo formulário + telefone.
  // O CTE materializado força a execução do lock, mas devolve apenas um inteiro
  // para evitar que o Prisma tente desserializar o tipo PostgreSQL `void`.
  await tx.$queryRaw<Array<{ locked: number }>>`
    WITH lock_guard AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${formId}), hashtext(${digits})) AS acquired
    )
    SELECT 1::int AS locked FROM lock_guard
  `;

  // Compatível também com telefones históricos que possam ter sido salvos formatados
  // ou sem o DDI 55. Retornamos somente o id; o telefone não é exposto nem logado.
  const existing = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "leads"
    WHERE "tenant_id" = ${tenantId}
      AND "form_id" = ${formId}
      AND (
        regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${digits}
        OR regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') = ${localDigits}
      )
    LIMIT 1
  `;

  return existing[0]?.id ?? null;
}

export async function assertPhoneNotUsedInForm(params: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  formId: string;
  phone: string;
}) {
  const existingLeadId = await findExistingLeadIdByPhoneInForm(params);
  if (existingLeadId) throw new DuplicateFormPhoneError();
}
