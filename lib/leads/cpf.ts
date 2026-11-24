import 'server-only';

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { maskCpf, validCpfOrNull, type CpfSource } from './cpf-rules';

/**
 * The lead's CPF lives in its own table, encrypted (AES-256-GCM, the key of the integrations),
 * never in the lead row: lists, exports and the lead APIs never carry it by accident. A keyed
 * fingerprint (HMAC) finds a lead by CPF without decrypting anything. The value is never logged;
 * the audit log records only who set, changed or viewed it, and from where.
 */

function fingerprint(cpf: string) {
  const secret = process.env.INTEGRATION_SECRET_KEY;
  if (!secret || secret.trim().length < 16) throw new Error('INTEGRATION_SECRET_KEY ausente.');
  const key = crypto.createHash('sha256').update(`lead-cpf-fingerprint:${secret}`).digest();
  return crypto.createHmac('sha256', key).update(cpf).digest('hex');
}

function isMissingTable(error: unknown) {
  const code = (error as { code?: string })?.code;
  return code === 'P2021' || code === 'P2010' || /lead_personal_documents/.test(String((error as Error)?.message || ''));
}

/**
 * Saves a CPF on a lead of the company. With onlyIfEmpty (the AI), a CPF already on the lead is
 * never replaced: a CPF the team wrote always wins. Returns whether it was saved.
 */
export async function setLeadCpf(input: {
  tenantId: string;
  leadId: string;
  cpf: unknown;
  source: CpfSource;
  userId?: string | null;
  onlyIfEmpty?: boolean;
}) {
  const cpf = validCpfOrNull(input.cpf);
  if (!cpf) return { saved: false as const, reason: 'invalid' as const };
  const lead = await prisma.lead.findFirst({ where: { id: input.leadId, tenantId: input.tenantId }, select: { id: true } });
  if (!lead) return { saved: false as const, reason: 'not_found' as const };
  try {
    const current = await prisma.leadPersonalDocument.findUnique({ where: { leadId: lead.id }, select: { cpfHash: true } });
    const hash = fingerprint(cpf);
    if (current && (input.onlyIfEmpty || current.cpfHash === hash)) return { saved: false as const, reason: 'kept' as const };
    const data = { cpfEncrypted: encryptIntegrationSecret(cpf), cpfHash: hash, source: input.source, updatedBy: input.userId || null };
    await prisma.leadPersonalDocument.upsert({
      where: { leadId: lead.id },
      create: { leadId: lead.id, tenantId: input.tenantId, ...data },
      update: data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId, userId: input.userId || null, entityType: 'lead', entityId: lead.id,
        action: current ? 'lead.cpf_changed' : 'lead.cpf_set', metadata: { source: input.source },
      },
    }).catch(() => undefined);
    return { saved: true as const };
  } catch (error) {
    if (isMissingTable(error)) return { saved: false as const, reason: 'not_ready' as const };
    throw error;
  }
}

/** The masked CPF and where it came from (what everyone who sees the lead may see). */
export async function leadCpfSummary(tenantId: string, leadId: string) {
  const row = await prisma.leadPersonalDocument.findFirst({
    where: { leadId, tenantId }, select: { cpfEncrypted: true, source: true, updatedAt: true },
  }).catch(() => null);
  const cpf = row ? validCpfOrNull(decryptIntegrationSecret(row.cpfEncrypted)) : null;
  return cpf && row ? { masked: maskCpf(cpf), source: row.source as CpfSource, updatedAt: row.updatedAt } : null;
}

/** The full CPF, for who may edit the lead; each view is recorded. */
export async function revealLeadCpf(input: { tenantId: string; leadId: string; userId: string }) {
  const row = await prisma.leadPersonalDocument.findFirst({
    where: { leadId: input.leadId, tenantId: input.tenantId }, select: { cpfEncrypted: true },
  }).catch(() => null);
  const cpf = row ? validCpfOrNull(decryptIntegrationSecret(row.cpfEncrypted)) : null;
  if (!cpf) return null;
  await prisma.auditLog.create({
    data: { tenantId: input.tenantId, userId: input.userId, entityType: 'lead', entityId: input.leadId, action: 'lead.cpf_viewed', metadata: {} },
  }).catch(() => undefined);
  return cpf;
}

/** Removes the CPF of a lead (the team cleared the field). */
export async function clearLeadCpf(input: { tenantId: string; leadId: string; userId: string }) {
  const removed = await prisma.leadPersonalDocument.deleteMany({ where: { leadId: input.leadId, tenantId: input.tenantId } }).catch(() => ({ count: 0 }));
  if (removed.count) {
    await prisma.auditLog.create({
      data: { tenantId: input.tenantId, userId: input.userId, entityType: 'lead', entityId: input.leadId, action: 'lead.cpf_removed', metadata: {} },
    }).catch(() => undefined);
  }
  return removed.count > 0;
}

/** Leads of the company with this CPF (search on the Leads page), without decrypting anything. */
export async function leadIdsByCpf(tenantId: string, value: unknown) {
  const cpf = validCpfOrNull(value);
  if (!cpf) return [];
  const rows = await prisma.leadPersonalDocument.findMany({
    where: { tenantId, cpfHash: fingerprint(cpf) }, select: { leadId: true }, take: 50,
  }).catch(() => []);
  return rows.map((row) => row.leadId);
}
