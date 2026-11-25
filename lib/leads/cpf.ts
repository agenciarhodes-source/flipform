import 'server-only';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { encryptIntegrationSecret, decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { maskCpf, validCpfOrNull, type CpfSource } from './cpf-rules';

function fingerprint(cpf: string): string {
  const secret = process.env.INTEGRATION_SECRET_KEY;
  if (!secret || secret.trim().length < 16) throw new Error('CPF storage unavailable');
  const key = crypto.createHash('sha256').update('lead-cpf-fingerprint:' + secret).digest();
  return crypto.createHmac('sha256', key).update(cpf).digest('hex');
}
type Write = { tenantId: string; leadId: string; cpf: unknown; source: CpfSource; userId?: string | null; onlyIfEmpty?: boolean };
export async function setLeadCpf(input: Write) {
  const { tenantId, leadId, source, userId } = input;
  if (!await tenantHasFeature(tenantId, 'lead_cpf')) return { saved: false, reason: 'disabled' } as const;
  const cpf = validCpfOrNull(input.cpf);
  if (!cpf) return { saved: false, reason: 'invalid' } as const;
  if (source === 'team' && !userId) return { saved: false, reason: 'invalid' } as const;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, tenantId }, select: { id: true } });
  if (!lead) return { saved: false, reason: 'not_found' } as const;
  const data = { tenantId, leadId, cpfEncrypted: encryptIntegrationSecret(cpf), cpfHash: fingerprint(cpf), source, updatedBy: userId ?? null };
  return prisma.$transaction(async tx => {
    // Atomic insert; automated writes never replace a manual write.
    const inserted = await tx.leadPersonalDocument.createMany({ data: [data], skipDuplicates: true });
    if (!inserted.count) {
      if (input.onlyIfEmpty || source !== 'team') return { saved: false, reason: 'kept' } as const;
      const changed = await tx.leadPersonalDocument.updateMany({ where: { leadId, tenantId }, data: { cpfEncrypted: data.cpfEncrypted, cpfHash: data.cpfHash, source, updatedBy: data.updatedBy } });
      if (!changed.count) return { saved: false, reason: 'not_found' } as const;
    }
    await tx.auditLog.create({ data: { tenantId, userId: userId ?? null, entityType: 'lead', entityId: leadId, action: inserted.count ? 'lead.cpf_set' : 'lead.cpf_changed', metadata: { source } } });
    return { saved: true } as const;
  });
}
export async function leadCpfSummary(tenantId: string, leadId: string) {
  if (!await tenantHasFeature(tenantId, 'lead_cpf')) return { hasCpf: false, masked: null, source: null, updatedAt: null };
  const row = await prisma.leadPersonalDocument.findFirst({ where: { tenantId, leadId } });
  const cpf = row ? validCpfOrNull(decryptIntegrationSecret(row.cpfEncrypted)) : null;
  return { hasCpf: !!cpf, masked: cpf ? maskCpf(cpf) : null, source: cpf && row ? row.source as CpfSource : null, updatedAt: cpf && row ? row.updatedAt : null };
}
export async function revealLeadCpf({ tenantId, leadId, userId }: { tenantId: string; leadId: string; userId: string }) {
  if (!await tenantHasFeature(tenantId, 'lead_cpf')) return null;
  const row = await prisma.leadPersonalDocument.findFirst({ where: { tenantId, leadId } });
  const cpf = row ? validCpfOrNull(decryptIntegrationSecret(row.cpfEncrypted)) : null;
  if (!cpf) return null;
  await prisma.auditLog.create({ data: { tenantId, userId, entityType: 'lead', entityId: leadId, action: 'lead.cpf_viewed', metadata: { source: 'team' } } });
  return cpf;
}
export async function clearLeadCpf({ tenantId, leadId, userId }: { tenantId: string; leadId: string; userId: string }) {
  if (!await tenantHasFeature(tenantId, 'lead_cpf')) return false;
  return prisma.$transaction(async tx => {
    const removed = await tx.leadPersonalDocument.deleteMany({ where: { tenantId, leadId } });
    if (removed.count) await tx.auditLog.create({ data: { tenantId, userId, entityType: 'lead', entityId: leadId, action: 'lead.cpf_removed', metadata: { source: 'team' } } });
    return removed.count > 0;
  });
}
export async function leadIdsByCpf(tenantId: string, value: unknown): Promise<string[]> {
  const cpf = validCpfOrNull(value);
  if (!cpf || !await tenantHasFeature(tenantId, 'lead_cpf')) return [];
  try {
    const rows = await prisma.leadPersonalDocument.findMany({ where: { tenantId, cpfHash: fingerprint(cpf) }, select: { leadId: true } });
    return rows.map(row => row.leadId);
  } catch { return []; }
}
