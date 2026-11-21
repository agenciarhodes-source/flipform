import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled } from './policy';
import type { ApiV1Authorization } from './identity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FIELDS = 100;

export type ApiV1FormFieldDefinition = {
  id: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  orderIndex: number;
};
export type ApiV1FormFieldsResult =
  | { kind: 'ok'; formId: string; fields: ApiV1FormFieldDefinition[]; truncated: boolean }
  | { kind: 'not_found' | 'unavailable' | 'denied' };

/** Identifier has no tenant semantics; source of tenant identity is the bearer credential only. */
export function validApiV1FormId(formId: string): boolean {
  return UUID.test(formId);
}

export function noFormFieldsQueryParameters(url: string): boolean {
  try {
    return Array.from(new URL(url).searchParams.keys()).length === 0;
  } catch {
    return false;
  }
}

/**
 * Read-only schema catalog for integration mapping.
 * Tenant, entitlement and forms.read are mandatory. Only fields of a
 * tenant-owned ACTIVE form are selected; never touch leads/answers/PII.
 * Return generic not-found for another tenant or an inactive form.
 */
export async function readApiV1FormFields(
  authorization: ApiV1Authorization,
  formId: string,
  db: Pick<PrismaClient, 'form'> = prisma,
): Promise<ApiV1FormFieldsResult> {
  if (!apiV1Enabled(process.env) || !authorization.ok
    || authorization.scope !== 'forms.read'
    || !authorization.tenantId || !authorization.integrationId
    || !validApiV1FormId(formId)) return { kind: 'denied' };
  try {
    const form = await db.form.findFirst({
      where: {
        id: formId.toLowerCase(),
        tenantId: authorization.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        fields: {
          orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
          take: MAX_FIELDS + 1,
          select: {
            id: true,
            label: true,
            fieldType: true,
            isRequired: true,
            orderIndex: true,
          },
        },
      },
    });
    if (!form) return { kind: 'not_found' };
    return {
      kind: 'ok',
      formId: form.id,
      fields: form.fields.slice(0, MAX_FIELDS),
      truncated: form.fields.length > MAX_FIELDS,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}
