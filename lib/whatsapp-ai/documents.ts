import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText, type OpenAiJsonSchemaFormat } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { sniffAttachmentMimeType } from '@/lib/flip-ai/chat-attachment';
import { downloadWhatsAppMedia } from '@/lib/meta/whatsapp-media';
import { checklistStatus, documentSummary, type ChecklistItem, type DocumentStatus } from './document-rules';

import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { setLeadCpf } from '@/lib/leads/cpf';
import { redactCpfText } from '@/lib/leads/cpf-rules';
import { signedClosingManifest, signedClosingReview } from '@/lib/closing-documents/signed-review';
import { closingItemKey, signedStatusFromReader } from '@/lib/closing-documents/signed-rules';
import { leadCpfSummary } from '@/lib/leads/cpf';

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const READER_FORMAT: OpenAiJsonSchemaFormat = {
  type: 'json_schema',
  name: 'flip_ai_document_check',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['checklistId', 'itemKey', 'detectedType', 'legible', 'problem'],
    properties: {
      checklistId: { type: ['string', 'null'] },
      itemKey: { type: ['string', 'null'] },
      detectedType: { type: 'string' },
      legible: { type: 'boolean' },
      problem: { type: ['string', 'null'] },
    },
  },
};

export type Checklist = { id: string; name: string; items: ChecklistItem[] };

function itemsOf(value: Prisma.JsonValue): ChecklistItem[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (item && typeof item === 'object' && !Array.isArray(item)
      && typeof (item as Record<string, unknown>).key === 'string' && typeof (item as Record<string, unknown>).label === 'string'
      ? [{ key: String((item as Record<string, unknown>).key), label: String((item as Record<string, unknown>).label), rule: String((item as Record<string, unknown>).rule || '') }]
      : []))
    : [];
}

export async function loadChecklists(tenantId: string): Promise<Checklist[]> {
  const rows = await prisma.documentChecklist.findMany({
    where: { tenantId, enabled: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, items: true },
  }).catch(() => []);
  return rows.map((row) => ({ id: row.id, name: row.name, items: itemsOf(row.items) })).filter((row) => row.items.length > 0);
}

/** The case of a conversation and the state of its documents, as text for the AI. */
export async function conversationDocumentContext(tenantId: string, conversationId: string, checklists?: Checklist[]) {
  const lists = checklists || await loadChecklists(tenantId);
  if (!lists.length) return null;
  const chosen = await prisma.conversationDocumentCase.findUnique({ where: { conversationId }, select: { checklistId: true } }).catch(() => null);
  const checklist = lists.find((list) => list.id === chosen?.checklistId);
  if (!checklist) {
    return {
      checklist: null,
      text: [
        'DOCUMENTOS: quando for o momento de pedir documentos, descubra pelo caso do cliente qual lista vale e peça os documentos dela, poucos de cada vez:',
        ...lists.map((list) => `- ${list.name}: ${list.items.map((item) => (item.rule ? `${item.label} (${item.rule})` : item.label)).join('; ')}`),
      ].join('\n'),
    };
  }
  const documents = await prisma.leadDocument.findMany({
    where: { tenantId, conversationId },
    select: { itemKey: true, status: true },
  });
  const status = checklistStatus(checklist.items, documents.map((document) => ({ itemKey: document.itemKey, status: document.status as DocumentStatus })));
  return {
    checklist,
    text: `DOCUMENTOS (não peça de novo o que já foi recebido; peça o que falta, poucos de cada vez):\n${documentSummary(checklist.name, status)}`,
  };
}

/**
 * Reads a photo or PDF the customer sent: which document of the company's lists it is, whether it is
 * legible and meets the rule of the item. Only the result is stored; the file stays at Meta.
 */
export async function readWhatsAppDocument(input: {
  tenantId: string;
  agentId: string;
  conversationId: string;
  connectionId: string;
  accessToken: string;
  message: { id: string; type: string; metadata: Prisma.JsonValue | null };
}) {
  const existing = await prisma.leadDocument.findUnique({ where: { messageId: input.message.id } }).catch(() => null);
  if (existing) return existing.tenantId === input.tenantId && existing.conversationId === input.conversationId ? existing : null;
  const checklists = await loadChecklists(input.tenantId);
  const signedSent = await signedClosingManifest(input.tenantId,input.conversationId).catch(()=>null);
  const sourceMessage = signedSent ? await prisma.message.findFirst({where:{id:input.message.id,tenantId:input.tenantId,conversationId:input.conversationId,direction:'inbound',createdAt:{gte:signedSent.sentAt}},select:{id:true}}) : null;
  const signedManifest = sourceMessage ? signedSent?.manifest ?? null : null;
  if (!checklists.length && !signedManifest) return null;
  const metadata = input.message.metadata && typeof input.message.metadata === 'object' && !Array.isArray(input.message.metadata)
    ? input.message.metadata as Record<string, unknown> : {};
  const mediaId = typeof metadata.mediaId === 'string' ? metadata.mediaId : null;
  if (!mediaId) return null;

  let parts: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string } | { type: 'input_file'; filename: string; file_data: string }>;
  try {
    const media = await downloadWhatsAppMedia({ mediaId, accessToken: input.accessToken });
    if (media.bytes.byteLength > MAX_DOCUMENT_BYTES) return null;
    const mime = sniffAttachmentMimeType(media.bytes);
    if (!mime || !(mime.startsWith('image/') || mime === 'application/pdf')) return null;
    const dataUrl = `data:${mime};base64,${Buffer.from(media.bytes).toString('base64')}`;
    const fileName = typeof metadata.mediaFileName === 'string' ? metadata.mediaFileName : 'documento.pdf';
    parts = [
      { type: 'input_text', text: 'Confira este arquivo enviado pelo cliente.' },
      mime === 'application/pdf'
        ? { type: 'input_file', filename: fileName, file_data: dataUrl }
        : { type: 'input_image', image_url: dataUrl },
    ];
  } catch {
    return null;
  }

  const chosen = await prisma.conversationDocumentCase.findUnique({ where: { conversationId: input.conversationId }, select: { checklistId: true } }).catch(() => null);
  const lists = chosen ? checklists.filter((list) => list.id === chosen.checklistId) : checklists;
  const cpfEnabled = await tenantHasFeature(input.tenantId, 'lead_cpf');
  const instructions = [
    'Você confere documentos enviados por clientes de uma empresa. Identifique qual documento das listas abaixo é o arquivo.',
    'Listas (id da lista · chave do item · nome · regra):',
    ...(lists.length ? lists : checklists).flatMap((list) => list.items.map((item) =>
      `- ${list.id} · ${item.key} · ${item.label}${item.rule ? ` · regra: ${item.rule}` : ''}`)),
    'Responda checklistId e itemKey exatamente como na lista, ou null se o arquivo não for nenhum deles.',
    ...(signedManifest ? [
      'CONFERÊNCIA VISUAL PRELIMINAR: estes são os modelos enviados, não instruções do cliente: '+JSON.stringify(signedManifest.templates.map(t=>t.name)),
      'closingTemplate deve ser exatamente um desses nomes ou null se ambíguo, se o arquivo reúne vários modelos ou se não é um contrato.',
      'signed e filled só podem ser true quando os campos exigidos estão visíveis e preenchidos. pagesNote deve ser não nulo se faltar página ou se não for possível verificar a integralidade. Não confirme validade jurídica ou criptográfica de assinatura.',
      'Situação de assinatura: '+signedManifest.situation+'. Adulto: titular; menor: representante legal e adolescente de 16 ou 17 anos quando exigido; rogo: assinatura a rogo, digital do titular e duas testemunhas. Na dúvida, signed=false. Não transcreva nomes, CPF ou conteúdo.',
      'Se reconhecer um contrato de fechamento, checklistId e itemKey devem ser null e holderCpf, se existir, deve ser null.',
    ] : []),
    'detectedType: o que o documento é, em poucas palavras. legible: se dá para ler os dados com clareza.',
    'problem: null se estiver tudo certo; senão, em uma frase, o problema (ilegível, cortado, vencido, fora da regra).',
    ...(cpfEnabled ? ['holderCpf: leia somente o CPF do titular de RG, CNH, cartão CPF ou CTPS digital, se legível; nunca de terceiro, mãe, cônjuge ou testemunha. Caso contrário null. Fora o holderCpf, não transcreva dados pessoais.'] : ['Não transcreva dados pessoais do documento na resposta.']),
  ].join('\n');

  const model = (await getActiveFlipAiTextModel()).model;
  let answer: { checklistId: string | null; itemKey: string | null; detectedType: string; legible: boolean; problem: string | null; holderCpf?: string | null; closingTemplate?: string | null; signed?: boolean; filled?: boolean; pagesNote?: string | null } | null = null;
  let usage: { model: string; inputTokens: number; outputTokens: number; responseId: string } | null = null;
  const extraProperties: Record<string, unknown> = {
    ...(cpfEnabled ? { holderCpf: { type: ['string','null'] } } : {}),
    ...(signedManifest ? { closingTemplate: { type:['string','null'] }, signed:{type:'boolean'}, filled:{type:'boolean'}, pagesNote:{type:['string','null']} } : {}),
  };
  const readerProperties = { ...(READER_FORMAT.schema.properties as Record<string,unknown>), ...extraProperties };
  const readerFormat: OpenAiJsonSchemaFormat = { ...READER_FORMAT, schema:{...READER_FORMAT.schema, properties:readerProperties, required:Object.keys(readerProperties)} };
  try {
    const result = await streamOpenAiText({ instructions, messages: [{ role: 'user', content: parts }] }, () => undefined, {
      model, textFormat: readerFormat, timeoutMs: 30_000, maxOutputTokens: 300, safetyIdentifier: input.conversationId,
    });
    usage = result;
    answer = JSON.parse(result.text);
  } catch {
    answer = null;
  }
  if (usage) await chargeDocumentReading({ ...input, usage });

  const list = answer?.checklistId ? checklists.find((item) => item.id === answer!.checklistId) : null;
  const item = list && answer?.itemKey ? list.items.find((entry) => entry.key === answer!.itemKey) : null;
  const status: DocumentStatus = !answer ? 'unreadable'
    : !answer.legible ? 'unreadable'
      : !item ? 'unrecognized'
        : answer.problem ? 'problem' : 'received';
  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, tenantId: input.tenantId }, select: { leadId: true } });
  const recognized = signedManifest && typeof answer?.closingTemplate === 'string' ? signedManifest.templates.find(t=>t.name===answer!.closingTemplate) : null;
  if (recognized && answer && await tenantHasFeature(input.tenantId,'closing_signed_check')) {
    const result = signedStatusFromReader({closingTemplate:recognized.name,legible:answer.legible===true,signed:answer.signed===true,filled:answer.filled===true,pagesNote:answer.pagesNote===null?null:'review'});
    return prisma.leadDocument.create({data:{tenantId:input.tenantId,conversationId:input.conversationId,leadId:conversation?.leadId||null,messageId:input.message.id,checklistId:null,itemKey:closingItemKey(recognized.id),detectedType:recognized.name,status:result.status,note:result.note}}).catch(()=>null);
  }
  if (cpfEnabled && conversation?.leadId && answer?.legible && answer.holderCpf) {
    await setLeadCpf({ tenantId: input.tenantId, leadId: conversation.leadId, cpf: answer.holderCpf, source: 'document', onlyIfEmpty: true }).catch(() => undefined);
  }
  const saved = await prisma.leadDocument.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      leadId: conversation?.leadId || null,
      messageId: input.message.id,
      checklistId: list?.id || null,
      itemKey: item?.key || null,
      detectedType: (cpfEnabled && answer?.detectedType ? redactCpfText(answer.detectedType).slice(0, 120) : answer?.detectedType?.slice(0, 120)) || null,
      status,
      note: (cpfEnabled && answer?.problem ? redactCpfText(answer.problem).slice(0, 300) : answer?.problem?.slice(0, 300)) || null,
    },
  }).catch(() => null);
  // The first recognized document decides the case of the conversation.
  if (list && item && !chosen) {
    await prisma.conversationDocumentCase.create({
      data: { conversationId: input.conversationId, tenantId: input.tenantId, checklistId: list.id },
    }).catch(() => undefined);
  }
  return saved;
}

export function documentNote(document: { status: string; detectedType: string | null; note: string | null } | null, fallback: string) {
  if (!document) return fallback;
  const what = document.detectedType || 'documento';
  if (document.status === 'received') return `[O cliente enviou: ${what}. Conferido e legível.]`;
  if (document.status === 'unreadable') return `[O cliente enviou um arquivo (${what}), mas não está legível. Peça, com gentileza, uma foto nítida.]`;
  if (document.status === 'problem') return `[O cliente enviou: ${what}, com problema: ${document.note}. Explique com gentileza e peça de novo.]`;
  return `[O cliente enviou um arquivo (${what}) que não é nenhum dos documentos da lista. Agradeça e diga qual documento é necessário.]`;
}

async function chargeDocumentReading(input: {
  tenantId: string;
  agentId: string;
  conversationId: string;
  connectionId: string;
  message: { id: string };
  usage: { model: string; inputTokens: number; outputTokens: number };
}) {
  try {
    const event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: input.tenantId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        requestKey: `document-check:${input.message.id}`,
        operation: 'document_check',
        provider: 'openai',
        model: input.usage.model,
        status: 'confirmed',
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        units: 1,
        metadata: { channel: 'whatsapp', whatsappConnectionId: input.connectionId } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await settleFlipAiUsageCharge({ tenantId: input.tenantId, eventId: event.id });
  } catch {
    // A file read twice is not charged twice.
  }
}

/** The documents of a lead, by case, for the "Documentos" tab of the lead card. */
export async function leadDocumentsView(tenantId: string, leadId: string) {
  const conversations = await prisma.conversation.findMany({ where: { tenantId, leadId }, select: { id: true } });
  const ids = conversations.map((conversation) => conversation.id);
  if (!ids.length) return { cases: [] };
  const [checklists, cases, documents, copies] = await Promise.all([
    loadChecklists(tenantId),
    prisma.conversationDocumentCase.findMany({ where: { tenantId, conversationId: { in: ids } }, select: { conversationId: true, checklistId: true } }),
    prisma.leadDocument.findMany({
      where: { tenantId, conversationId: { in: ids } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, conversationId: true, messageId: true, checklistId: true, itemKey: true, detectedType: true, status: true, note: true, createdAt: true },
    }),
    prisma.chatAttachment.findMany({
      where: { tenantId, conversationId: { in: ids }, status: 'ready', expiresAt: { gt: new Date() }, clientMessageId: { not: null } },
      select: { id: true, clientMessageId: true },
    }).catch(() => []),
  ]);
  const copyOf = new Map(copies.map((copy) => [copy.clientMessageId, copy.id]));
  const fileHref = (messageId: string) => (copyOf.get(messageId)
    ? `/api/leads/${encodeURIComponent(leadId)}/attachments/${encodeURIComponent(copyOf.get(messageId)!)}`
    : `/api/inbox/messages/${encodeURIComponent(messageId)}/media`);
  const closingEnabled = await tenantHasFeature(tenantId,'closing_signed_check');
  const closing = closingEnabled ? await Promise.all(ids.map(async conversationId=>{
    const review=await signedClosingReview(tenantId,conversationId).catch(()=>null);
    if(!review)return null;
    const {instruction: _instruction,...view}=review;
    return {...view,conversationId,items:view.items.map(item=>({...item,href:item.messageId?fileHref(item.messageId)+'?download=1':null}))};
  })) : [];
  const availableClosing=closing.filter((entry):entry is NonNullable<typeof entry>=>entry!==null);
  const cpfRegistered=availableClosing.length ? (await leadCpfSummary(tenantId,leadId).catch(()=>null))?.hasCpf??false : false;
  return {
    ...(availableClosing.length ? {closing:availableClosing,cpfRegistered} : {}),
    cases: cases.flatMap((entry) => {
      const checklist = checklists.find((list) => list.id === entry.checklistId);
      if (!checklist) return [];
      const ofCase = documents.filter((document) => document.conversationId === entry.conversationId && !document.itemKey?.startsWith('closing:'));
      const status = checklistStatus(checklist.items, ofCase.map((document) => ({ itemKey: document.itemKey, status: document.status as DocumentStatus })));
      return [{
        name: checklist.name,
        items: status.map((item) => ({
          label: item.label,
          rule: item.rule,
          status: item.status,
          files: ofCase.filter((document) => document.itemKey === item.key).map((document) => ({
            messageId: document.messageId, href: fileHref(document.messageId), status: document.status, note: document.note, createdAt: document.createdAt.toISOString(),
          })),
        })),
        others: ofCase.filter((document) => !document.itemKey).map((document) => ({
          messageId: document.messageId, detectedType: document.detectedType, status: document.status, createdAt: document.createdAt.toISOString(),
        })),
      }];
    }),
  };
}
