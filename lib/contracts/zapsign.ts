import 'server-only';

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/lib/tracking/crypto';
import { checklistStatus, type DocumentStatus } from '@/lib/whatsapp-ai/document-rules';
import { loadChecklists } from '@/lib/whatsapp-ai/documents';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import {
  ACTIVE_CONTRACT_STATUSES, contractLinkMessage, createDocBody, signUrlFrom, ZAPSIGN_API_BASE,
} from './zapsign-rules';

/**
 * Contracts by ZapSign. The tables are read with SQL so that, before they exist in a database,
 * every call just answers "off" and nothing else changes.
 */

type SettingsRow = { allowed: boolean; enabled: boolean; api_token_encrypted: string | null };

export async function zapSignSettings(tenantId: string) {
  const rows = await prisma.$queryRaw<SettingsRow[]>`
    SELECT allowed, enabled, api_token_encrypted FROM tenant_zapsign_settings WHERE tenant_id = ${tenantId}`.catch(() => null);
  if (!rows) return { ready: false as const, allowed: false, enabled: false, hasToken: false };
  const row = rows[0];
  return { ready: true as const, allowed: !!row?.allowed, enabled: !!row?.enabled, hasToken: !!row?.api_token_encrypted };
}

export async function zapSignTemplates(tenantId: string) {
  const rows = await prisma.$queryRaw<Array<{ checklist_id: string; template_id: string }>>`
    SELECT checklist_id, template_id FROM zapsign_templates WHERE tenant_id = ${tenantId}`.catch(() => []);
  return rows.map((row) => ({ checklistId: row.checklist_id, templateId: row.template_id }));
}

/** Released by the Super Admin for one company. */
export async function setZapSignAllowed(input: { tenantId: string; allowed: boolean; userId: string }) {
  await prisma.$executeRaw`
    INSERT INTO tenant_zapsign_settings (tenant_id, allowed, updated_by, updated_at)
    VALUES (${input.tenantId}, ${input.allowed}, ${input.userId}, NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
}

/**
 * What the company sets: on/off, the API token (only replaced when a new one is typed; never
 * returned) and the ZapSign model of each case.
 */
export async function saveZapSignSettings(input: {
  tenantId: string;
  userId: string;
  enabled: boolean;
  apiToken: string | null;
  templates: Array<{ checklistId: string; templateId: string }>;
}) {
  const current = await zapSignSettings(input.tenantId);
  if (!current.ready || !current.allowed) throw new Error('ZAPSIGN_NOT_ALLOWED');
  const checklists = await prisma.documentChecklist.findMany({ where: { tenantId: input.tenantId }, select: { id: true } });
  const known = new Set(checklists.map((item) => item.id));
  const templates = input.templates.filter((item) => known.has(item.checklistId) && item.templateId.trim());
  const encrypted = input.apiToken?.trim() ? encryptIntegrationSecret(input.apiToken) : null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE tenant_zapsign_settings
      SET enabled = ${input.enabled},
          api_token_encrypted = COALESCE(${encrypted}, api_token_encrypted),
          updated_by = ${input.userId}, updated_at = NOW()
      WHERE tenant_id = ${input.tenantId}`;
    await tx.$executeRaw`DELETE FROM zapsign_templates WHERE tenant_id = ${input.tenantId}`;
    for (const item of templates) {
      await tx.$executeRaw`
        INSERT INTO zapsign_templates (id, tenant_id, checklist_id, template_id, created_at, updated_at)
        VALUES (${randomUUID()}, ${input.tenantId}, ${item.checklistId}, ${item.templateId.trim()}, NOW(), NOW())`;
    }
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId, userId: input.userId, entityType: 'zapsign_settings', entityId: input.tenantId,
        action: 'contracts.zapsign_settings_saved',
        metadata: { enabled: input.enabled, tokenReplaced: !!encrypted, templates: templates.length },
      },
    });
  });
}

/** The company's ZapSign API token, only while contracts are released and switched on. */
export async function zapSignApiToken(tenantId: string) {
  const rows = await prisma.$queryRaw<SettingsRow[]>`
    SELECT allowed, enabled, api_token_encrypted FROM tenant_zapsign_settings WHERE tenant_id = ${tenantId}`.catch(() => []);
  const row = rows[0];
  if (!row?.allowed || !row.enabled) return null;
  return decryptIntegrationSecret(row.api_token_encrypted);
}

/** The case of the conversation, its ZapSign model, and whether every document was received. */
export async function contractReadiness(tenantId: string, conversationId: string) {
  const settings = await zapSignSettings(tenantId);
  if (!settings.ready || !settings.allowed || !settings.enabled || !settings.hasToken) return null;
  const chosen = await prisma.conversationDocumentCase.findUnique({ where: { conversationId }, select: { checklistId: true } }).catch(() => null);
  if (!chosen) return null;
  const template = (await zapSignTemplates(tenantId)).find((item) => item.checklistId === chosen.checklistId);
  if (!template) return null;
  const checklist = (await loadChecklists(tenantId)).find((item) => item.id === chosen.checklistId);
  if (!checklist) return null;
  const documents = await prisma.leadDocument.findMany({ where: { tenantId, conversationId }, select: { itemKey: true, status: true } });
  const status = checklistStatus(checklist.items, documents.map((item) => ({ itemKey: item.itemKey, status: item.status as DocumentStatus })));
  if (!status.every((item) => item.status === 'received')) return null;
  const active = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM lead_contracts
    WHERE tenant_id = ${tenantId} AND conversation_id = ${conversationId}
      AND status IN (${Prisma.join([...ACTIVE_CONTRACT_STATUSES])})
    LIMIT 1`.catch(() => [{ id: 'unknown' }]);
  if (active.length) return null;
  return { checklist, templateId: template.templateId };
}

async function failContract(tenantId: string, contractId: string, conversationId: string, code: string) {
  await prisma.$executeRaw`UPDATE lead_contracts SET status = 'error', error = ${code}, updated_at = NOW() WHERE id = ${contractId}`.catch(() => undefined);
  await prisma.auditLog.create({
    data: { tenantId, userId: null, entityType: 'conversation', entityId: conversationId, action: 'contracts.send_failed', metadata: { contractId, code } },
  }).catch(() => undefined);
  return { sent: false as const, reason: code };
}

/**
 * Creates the contract in ZapSign from the model of the case and sends its link to the customer
 * on WhatsApp. One contract at a time per conversation; it does nothing when the company did not
 * switch contracts on, the case has no model, or a document is still missing.
 */
export async function sendContractIfReady(input: { tenantId: string; conversationId: string; agent: { id: string; name: string } | null }) {
  const ready = await contractReadiness(input.tenantId, input.conversationId);
  if (!ready) return { sent: false as const, reason: 'not_ready' };
  const token = await zapSignApiToken(input.tenantId);
  if (!token) return { sent: false as const, reason: 'no_token' };

  // Claims the conversation: a second run at the same time finds this row and stops.
  const contractId = randomUUID();
  const claimed = await prisma.$executeRaw`
    INSERT INTO lead_contracts (id, tenant_id, conversation_id, checklist_id, status, created_at, updated_at)
    SELECT ${contractId}, ${input.tenantId}, ${input.conversationId}, ${ready.checklist.id}, 'creating', NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_contracts WHERE tenant_id = ${input.tenantId} AND conversation_id = ${input.conversationId}
        AND status IN (${Prisma.join([...ACTIVE_CONTRACT_STATUSES])}))`;
  if (claimed !== 1) return { sent: false as const, reason: 'already_sent' };

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId },
    select: {
      leadId: true,
      lead: { select: { name: true, phone: true, city: true, state: true } },
      externalContactIdentity: { select: { displayName: true, externalUserId: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!conversation) return failContract(input.tenantId, contractId, input.conversationId, 'CONVERSATION_NOT_FOUND');
  const name = (conversation.lead?.name || conversation.externalContactIdentity?.displayName || '').trim();
  if (!name) return failContract(input.tenantId, contractId, input.conversationId, 'NAME_MISSING');
  const phone = conversation.lead?.phone || conversation.externalContactIdentity?.externalUserId || null;
  await prisma.$executeRaw`UPDATE lead_contracts SET lead_id = ${conversation.leadId} WHERE id = ${contractId}`;

  let created: { docToken: string; signUrl: string } | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const response = await fetch(`${ZAPSIGN_API_BASE}/models/create-doc/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(createDocBody({
        templateId: ready.templateId,
        contractId,
        customer: { name, phone, city: conversation.lead?.city || null, state: conversation.lead?.state || null },
        thesis: ready.checklist.name,
        companyName: conversation.tenant.name,
        now: new Date(),
      })),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return failContract(input.tenantId, contractId, input.conversationId, `ZAPSIGN_HTTP_${response.status}`);
    created = signUrlFrom(await response.json().catch(() => null));
  } catch {
    return failContract(input.tenantId, contractId, input.conversationId, 'ZAPSIGN_UNREACHABLE');
  }
  if (!created) return failContract(input.tenantId, contractId, input.conversationId, 'ZAPSIGN_INVALID_RESPONSE');

  await prisma.$executeRaw`
    UPDATE lead_contracts SET status = 'sent', provider_doc_token = ${created.docToken}, sign_url = ${created.signUrl},
      sent_at = NOW(), updated_at = NOW()
    WHERE id = ${contractId}`;
  const firstName = name.split(/\s+/)[0] || null;
  const message = await enqueueAndDispatchWhatsAppTextMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    requestedByUserId: '',
    text: contractLinkMessage(firstName, created.signUrl),
    idempotencyKey: `contract-${contractId}`,
    ...(input.agent ? { aiSender: { agentId: input.agent.id, agentName: input.agent.name } } : { systemSender: { label: 'Contratos' } }),
  });
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: null, entityType: 'conversation', entityId: input.conversationId,
      action: 'contracts.sent',
      metadata: { contractId, checklistId: ready.checklist.id, thesis: ready.checklist.name, whatsapp: message.status },
    },
  }).catch(() => undefined);
  return { sent: true as const, contractId, whatsapp: message.status };
}
