import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { createAttachmentUploadUrl, resolveAttachmentStorage } from '@/lib/storage/attachment-storage';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { handoffRecipients } from '@/lib/instagram-ai/handoff-rules';
import { ZAPSIGN_API_BASE } from './zapsign-rules';
import { sendContractIfReady, zapSignApiToken } from './zapsign';
import {
  CONTRACT_CHECK_FORMAT, contractCheckInstructions, contractFixMessage, contractIssueTask, contractReminderMessage,
  firstNameOf, gojusTask, shouldRemindUnsigned, signedThanksMessage, zapSignDocState, zapSignWebhookSecret,
} from './zapsign-signed-rules';

const MAX_CONTRACT_BYTES = 20 * 1024 * 1024;
/** The signed contract is kept with the lead's files for this long (the chat files keep 7 days). */
const CONTRACT_RETENTION_DAYS = 365 * 5;
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br';

export function webhookSecretFor(tenantId: string) {
  const key = process.env.INTEGRATION_SECRET_KEY;
  return key && key.trim().length >= 16 ? zapSignWebhookSecret(key, tenantId) : null;
}

/** Tells ZapSign where to warn FlipForm about signatures, with the company's secret. */
export async function registerZapSignWebhook(tenantId: string, apiToken: string) {
  const secret = webhookSecretFor(tenantId);
  if (!secret) return { registered: false };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` };
  const created = await fetch(`${ZAPSIGN_API_BASE}/user/company/webhook/`, {
    method: 'POST', headers, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ url: `${APP_URL().replace(/\/$/, '')}/api/webhooks/zapsign/${encodeURIComponent(tenantId)}`, type: '' }),
  }).catch(() => null);
  const body = created?.ok ? await created.json().catch(() => null) as { id?: unknown } | null : null;
  if (!body || (typeof body.id !== 'number' && typeof body.id !== 'string')) return { registered: false };
  const header = await fetch(`${ZAPSIGN_API_BASE}/user/company/webhook/header/`, {
    method: 'POST', headers, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ id: body.id, headers: [{ name: 'Authorization', value: `Bearer ${secret}` }] }),
  }).catch(() => null);
  return { registered: !!header?.ok };
}

type ContractRow = {
  id: string; tenant_id: string; conversation_id: string; lead_id: string | null; checklist_id: string | null;
  provider_doc_token: string | null; sign_url: string | null; status: string; sent_at: Date | null;
};

async function contractByDocToken(tenantId: string, docToken: string) {
  const rows = await prisma.$queryRaw<ContractRow[]>`
    SELECT id, tenant_id, conversation_id, lead_id, checklist_id, provider_doc_token, sign_url, status, sent_at
    FROM lead_contracts WHERE tenant_id = ${tenantId} AND provider_doc_token = ${docToken} LIMIT 1`;
  return rows[0] || null;
}

async function customerOf(tenantId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, tenantId },
    select: {
      assignedTo: true, leadId: true,
      lead: { select: { name: true, assignedTo: true } },
      externalContactIdentity: { select: { displayName: true } },
    },
  });
  const name = (conversation?.lead?.name || conversation?.externalContactIdentity?.displayName || 'Cliente').trim();
  return { conversation, name, assignee: conversation?.lead?.assignedTo || conversation?.assignedTo || null };
}

async function createTeamTask(input: { tenantId: string; leadId: string | null; assignee: string | null; title: string; description: string; dueInMinutes: number }) {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId: input.tenantId },
    select: { userId: true, role: true, status: true },
  });
  const recipients = handoffRecipients({
    conversationAssignee: input.assignee,
    members: members.map((member) => ({ userId: member.userId, role: member.role, active: member.status === 'active' })),
  });
  if (!recipients.length) return 0;
  const due = new Date(Date.now() + input.dueInMinutes * 60_000);
  await prisma.task.createMany({
    data: recipients.map((userId) => ({
      tenantId: input.tenantId, leadId: input.leadId, assignedTo: userId, createdBy: null,
      title: input.title, description: input.description, dueDate: due,
      remindMinutesBefore: Math.min(60, Math.max(5, input.dueInMinutes)), priority: 'high' as const,
    })),
  });
  return recipients.length;
}

async function sayToCustomer(input: { tenantId: string; conversationId: string; text: string; key: string }) {
  const sent = await enqueueAndDispatchWhatsAppTextMessage({
    tenantId: input.tenantId, conversationId: input.conversationId, requestedByUserId: '', text: input.text,
    idempotencyKey: input.key, systemSender: { label: 'Contratos' },
  }).catch(() => null);
  return !!sent && sent.status !== 'failed';
}

async function audit(tenantId: string, conversationId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { tenantId, userId: null, entityType: 'conversation', entityId: conversationId, action, metadata: metadata as Prisma.InputJsonValue },
  }).catch(() => undefined);
}

/** Keeps the signed PDF with the lead's files (5 years). */
async function keepSignedFile(contract: ContractRow, bytes: Uint8Array, customerName: string) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) return false;
  const id = randomUUID();
  const objectKey = `tenants/${contract.tenant_id.replace(/[^A-Za-z0-9_-]/g, '')}/contracts/${id}`;
  const now = new Date();
  await prisma.chatAttachment.create({
    data: {
      id, tenantId: contract.tenant_id,
      sessionRef: `contract:${createHash('sha256').update(contract.conversation_id).digest('hex').slice(0, 32)}`,
      conversationId: contract.conversation_id, clientMessageId: `contract:${contract.id}`,
      objectKey, name: `Contrato assinado - ${customerName.slice(0, 80)}.pdf`, mimeType: 'application/pdf',
      sizeBytes: bytes.byteLength, status: 'pending',
      expiresAt: new Date(now.getTime() + CONTRACT_RETENTION_DAYS * 86_400_000),
    },
  });
  const uploaded = await fetch(createAttachmentUploadUrl(storage.config, { key: objectKey, contentType: 'application/pdf', contentLength: bytes.byteLength, now }), {
    method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.byteLength) },
    body: Buffer.from(bytes), signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!uploaded?.ok) return false;
  await prisma.chatAttachment.update({ where: { id }, data: { status: 'ready' } });
  return true;
}

/** The AI reads the whole signed contract. Null when it could not read it. */
async function checkSignedContract(input: { tenantId: string; conversationId: string; contractId: string; bytes: Uint8Array; customerName: string; thesis: string }) {
  try {
    const model = (await getActiveFlipAiTextModel()).model;
    const result = await streamOpenAiText({
      instructions: contractCheckInstructions({ customerName: input.customerName, thesis: input.thesis }),
      messages: [{ role: 'user', content: [
        { type: 'input_text', text: 'Confira este contrato assinado.' },
        { type: 'input_file', filename: 'contrato-assinado.pdf', file_data: `data:application/pdf;base64,${Buffer.from(input.bytes).toString('base64')}` },
      ] }],
    }, () => undefined, { model, textFormat: CONTRACT_CHECK_FORMAT, timeoutMs: 60_000, maxOutputTokens: 600, safetyIdentifier: input.conversationId });
    try {
      const event = await prisma.flipAiUsageEvent.create({
        data: {
          tenantId: input.tenantId, conversationId: input.conversationId, requestKey: `contract-check:${input.contractId}:${result.responseId}`,
          operation: 'contract_check', provider: 'openai', model: result.model, status: 'confirmed',
          inputTokens: result.inputTokens, outputTokens: result.outputTokens, units: 1,
          metadata: { channel: 'whatsapp' } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await settleFlipAiUsageCharge({ tenantId: input.tenantId, eventId: event.id });
    } catch {
      // Charging never blocks the check.
    }
    const parsed = JSON.parse(result.text) as { complete?: unknown; problems?: unknown };
    if (typeof parsed.complete !== 'boolean' || !Array.isArray(parsed.problems)) return null;
    return { complete: parsed.complete, problems: parsed.problems.filter((item): item is string => typeof item === 'string' && !!item.trim()) };
  } catch {
    return null;
  }
}

/**
 * A ZapSign event for this company. The event only says which document; its state is asked to
 * ZapSign again with the company's token, so a forged call cannot mark a contract as signed.
 */
export async function processZapSignEvent(tenantId: string, docToken: string) {
  const contract = await contractByDocToken(tenantId, docToken).catch(() => null);
  if (!contract || contract.status !== 'sent') return { handled: false, reason: 'not_waiting' };
  const token = await zapSignApiToken(tenantId);
  if (!token) return { handled: false, reason: 'no_token' };

  const response = await fetch(`${ZAPSIGN_API_BASE}/docs/${encodeURIComponent(docToken)}/`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const state = response?.ok ? zapSignDocState(await response.json().catch(() => null)) : null;
  if (!state) return { handled: false, reason: 'state_unknown' };

  const customer = await customerOf(tenantId, contract.conversation_id);
  const thesis = contract.checklist_id
    ? (await prisma.documentChecklist.findFirst({ where: { id: contract.checklist_id, tenantId }, select: { name: true } }))?.name || 'Caso'
    : 'Caso';

  if (state.refused) {
    const claimed = await prisma.$executeRaw`UPDATE lead_contracts SET status = 'refused', updated_at = NOW() WHERE id = ${contract.id} AND status = 'sent'`;
    if (claimed !== 1) return { handled: false, reason: 'already_handled' };
    const task = contractIssueTask({ customerName: customer.name, reason: 'O cliente recusou a assinatura do contrato no ZapSign. Fale com ele para entender o motivo.', conversationId: contract.conversation_id, appUrl: APP_URL() });
    await createTeamTask({ tenantId, leadId: contract.lead_id, assignee: customer.assignee, ...task, dueInMinutes: 60 });
    await audit(tenantId, contract.conversation_id, 'contracts.refused', { contractId: contract.id });
    return { handled: true, reason: 'refused' };
  }
  // Someone still has to sign: nothing to do yet.
  if (state.status !== 'signed' || !state.signedFile) return { handled: false, reason: 'pending' };

  // Claims the contract so a repeated event does not check it twice.
  const claimed = await prisma.$executeRaw`UPDATE lead_contracts SET status = 'checking', updated_at = NOW() WHERE id = ${contract.id} AND status = 'sent'`;
  if (claimed !== 1) return { handled: false, reason: 'already_handled' };

  const file = await fetch(state.signedFile, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const bytes = file?.ok ? new Uint8Array(await file.arrayBuffer()) : null;
  if (!bytes || bytes.byteLength > MAX_CONTRACT_BYTES || Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    await prisma.$executeRaw`UPDATE lead_contracts SET status = 'sent', updated_at = NOW() WHERE id = ${contract.id}`;
    return { handled: false, reason: 'file_unavailable' };
  }
  await keepSignedFile(contract, bytes, customer.name).catch(() => false);

  const check = await checkSignedContract({ tenantId, conversationId: contract.conversation_id, contractId: contract.id, bytes, customerName: customer.name, thesis });
  const firstName = firstNameOf(customer.name);

  if (check && !check.complete && check.problems.length) {
    await prisma.$executeRaw`
      UPDATE lead_contracts SET status = 'needs_fix', signed_at = NOW(), error = ${check.problems.join(' | ').slice(0, 1000)}, updated_at = NOW()
      WHERE id = ${contract.id}`;
    const told = await sayToCustomer({ tenantId, conversationId: contract.conversation_id, text: contractFixMessage(firstName, check.problems), key: `contract-fix-${contract.id}` });
    // A new contract with everything to fill again (the documents are still complete).
    const resent = told ? await sendContractIfReady({ tenantId, conversationId: contract.conversation_id, agent: null }).catch(() => null) : null;
    if (!told || !resent?.sent) {
      const task = contractIssueTask({
        customerName: customer.name, conversationId: contract.conversation_id, appUrl: APP_URL(),
        reason: `O contrato assinado veio com pendência e ${told ? 'o novo link não pôde ser enviado' : 'o WhatsApp não permitiu avisar o cliente (passou de 24 horas da última mensagem dele)'}. Pendências: ${check.problems.join('; ')}`,
      });
      await createTeamTask({ tenantId, leadId: contract.lead_id, assignee: customer.assignee, ...task, dueInMinutes: 60 });
    }
    await audit(tenantId, contract.conversation_id, 'contracts.needs_fix', { contractId: contract.id, problems: check.problems.length, told, resent: !!resent?.sent });
    return { handled: true, reason: 'needs_fix' };
  }

  await prisma.$executeRaw`UPDATE lead_contracts SET status = 'signed', signed_at = NOW(), updated_at = NOW() WHERE id = ${contract.id}`;
  await sayToCustomer({ tenantId, conversationId: contract.conversation_id, text: signedThanksMessage(firstName), key: `contract-signed-${contract.id}` });
  const task = gojusTask({ customerName: customer.name, thesis, leadId: contract.lead_id, conversationId: contract.conversation_id, appUrl: APP_URL() });
  // When the AI could not read the contract, the task says so: the person checks it before filing.
  const description = check ? task.description : `${task.description}\n\nAtenção: a IA não conseguiu ler o contrato assinado. Confira o arquivo antes de lançar.`;
  await createTeamTask({ tenantId, leadId: contract.lead_id, assignee: customer.assignee, title: task.title, description, dueInMinutes: 60 });
  await audit(tenantId, contract.conversation_id, 'contracts.signed', { contractId: contract.id, checked: !!check });
  return { handled: true, reason: 'signed' };
}

/**
 * Every few minutes: one reminder to customers who did not sign yet (inside the WhatsApp 24-hour
 * window), and a contract whose check stopped halfway (the server went down) is checked again.
 */
export async function sweepUnsignedContracts(now = new Date()) {
  const stuck = await prisma.$queryRaw<Array<{ tenant_id: string; provider_doc_token: string }>>`
    UPDATE lead_contracts SET status = 'sent', updated_at = NOW()
    WHERE id IN (SELECT id FROM lead_contracts WHERE status = 'checking' AND updated_at < ${new Date(now.getTime() - 15 * 60_000)} LIMIT 3)
    RETURNING tenant_id, provider_doc_token`.catch(() => []);
  for (const row of stuck) {
    if (row.provider_doc_token) await processZapSignEvent(row.tenant_id, row.provider_doc_token).catch(() => undefined);
  }

  const rows = await prisma.$queryRaw<Array<ContractRow & { last_inbound_at: Date | null; reminded: boolean }>>`
    SELECT c.id, c.tenant_id, c.conversation_id, c.lead_id, c.checklist_id, c.provider_doc_token, c.sign_url, c.status, c.sent_at,
      conv.last_inbound_at,
      EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id = c.tenant_id AND a.action = 'contracts.reminded'
        AND a.entity_id = c.conversation_id AND a.metadata->>'contractId' = c.id) AS reminded
    FROM lead_contracts c JOIN conversations conv ON conv.id = c.conversation_id
    WHERE c.status = 'sent' AND c.sent_at < ${new Date(now.getTime() - 3 * 3_600_000)} AND c.sent_at > ${new Date(now.getTime() - 48 * 3_600_000)}
    LIMIT 20`.catch(() => []);
  let reminded = 0;
  for (const row of rows) {
    if (!row.sent_at || !row.sign_url || !shouldRemindUnsigned({ sentAt: row.sent_at, now, lastInboundAt: row.last_inbound_at, reminded: row.reminded })) continue;
    const customer = await customerOf(row.tenant_id, row.conversation_id);
    const ok = await sayToCustomer({
      tenantId: row.tenant_id, conversationId: row.conversation_id,
      text: contractReminderMessage(firstNameOf(customer.name), row.sign_url), key: `contract-reminder-${row.id}`,
    });
    await audit(row.tenant_id, row.conversation_id, 'contracts.reminded', { contractId: row.id, sent: ok });
    if (ok) reminded += 1;
  }
  return { checked: rows.length, reminded };
}
