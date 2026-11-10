import 'server-only';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  createAttachmentUploadUrl,
  deleteAttachmentObject,
  readAttachmentObject,
  resolveAttachmentStorage,
} from '@/lib/storage/attachment-storage';
import { CLOSING_MAX_BYTES, CLOSING_MAX_TEMPLATES, cleanTemplateName, type ClosingSituation } from './rules';
import { docxPlaceholders } from './docx';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PDF_MIME = 'application/pdf';

type SettingsRow = { enabled: boolean; send_when: string };
type TemplateRow = {
  id: string; name: string; object_key: string; size_bytes: number; placeholders: unknown; situation: string;
  kind: string | null; checklist_ids: unknown; created_at: Date;
};

export type ClosingTemplate = {
  id: string; name: string; sizeBytes: number; kind: 'pdf' | 'docx'; checklistIds: string[];
  known: string[]; unknown: string[]; situation: ClosingSituation; createdAt: string;
};

const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

function toTemplate(row: TemplateRow): ClosingTemplate {
  const found = (row.placeholders && typeof row.placeholders === 'object' ? row.placeholders : {}) as { known?: unknown; unknown?: unknown };
  const situation = (['adult', 'minor', 'rogo'].includes(row.situation) ? row.situation : 'all') as ClosingSituation;
  return {
    id: row.id, name: row.name, sizeBytes: row.size_bytes, kind: row.kind === 'pdf' ? 'pdf' : 'docx',
    checklistIds: list(row.checklist_ids), known: list(found.known), unknown: list(found.unknown), situation,
    createdAt: row.created_at.toISOString(),
  };
}

async function templateRows(tenantId: string) {
  return prisma.$queryRaw<TemplateRow[]>`
    SELECT id, name, object_key, size_bytes, placeholders, situation, kind, checklist_ids, created_at
    FROM closing_document_templates WHERE tenant_id = ${tenantId} ORDER BY position ASC, created_at ASC`;
}

/** Settings and models of a company. `ready: false` while the tables do not exist yet. */
export async function closingDocuments(tenantId: string) {
  const settings = await prisma.$queryRaw<SettingsRow[]>`
    SELECT enabled, send_when FROM closing_document_settings WHERE tenant_id = ${tenantId}`.catch(() => null);
  if (!settings) return { ready: false as const };
  const templates = await templateRows(tenantId).catch(() => null);
  if (!templates) return { ready: false as const };
  return {
    ready: true as const,
    enabled: settings[0]?.enabled ?? false,
    sendWhen: settings[0]?.send_when ?? '',
    templates: templates.map(toTemplate),
    storageReady: resolveAttachmentStorage().ready,
  };
}

export async function saveClosingSettings(input: { tenantId: string; userId: string; enabled: boolean; sendWhen: string }) {
  await prisma.$executeRaw`
    INSERT INTO closing_document_settings (tenant_id, enabled, send_when, updated_by, created_at, updated_at)
    VALUES (${input.tenantId}, ${input.enabled}, ${input.sendWhen}, ${input.userId}, NOW(), NOW())
    ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, send_when = EXCLUDED.send_when,
      updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
}

export class ClosingDocumentError extends Error {}

function isPdf(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}

/** Keeps one model (PDF as it is, or Word) in the private storage. */
export async function addClosingTemplate(input: {
  tenantId: string; userId: string; fileName: string; bytes: Uint8Array; checklistIds: string[];
}) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new ClosingDocumentError('O armazenamento de arquivos não está configurado.');
  const kind = /\.pdf$/i.test(input.fileName) ? 'pdf' : /\.docx$/i.test(input.fileName) ? 'docx' : null;
  if (!kind) throw new ClosingDocumentError('Envie o documento em PDF ou em Word (.docx).');
  if (input.bytes.byteLength > CLOSING_MAX_BYTES) throw new ClosingDocumentError('O arquivo pode ter até 4 MB.');
  let placeholders: { known: string[]; unknown: string[] } = { known: [], unknown: [] };
  if (kind === 'pdf') {
    if (!isPdf(input.bytes)) throw new ClosingDocumentError('Este arquivo não é um PDF válido.');
  } else {
    try {
      placeholders = docxPlaceholders(input.bytes);
    } catch {
      throw new ClosingDocumentError('Não consegui abrir este arquivo. Salve de novo no Word como .docx e tente outra vez.');
    }
  }
  const count = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total FROM closing_document_templates WHERE tenant_id = ${input.tenantId}`;
  const total = Number(count[0]?.total || 0);
  if (total >= CLOSING_MAX_TEMPLATES) throw new ClosingDocumentError(`São até ${CLOSING_MAX_TEMPLATES} documentos. Apague um para enviar outro.`);
  const checklistIds = await knownChecklists(input.tenantId, input.checklistIds);

  const id = randomUUID();
  const mime = kind === 'pdf' ? PDF_MIME : DOCX_MIME;
  const objectKey = `tenants/${input.tenantId.replace(/[^A-Za-z0-9_-]/g, '')}/closing-documents/${id}`;
  const uploaded = await fetch(createAttachmentUploadUrl(storage.config, { key: objectKey, contentType: mime, contentLength: input.bytes.byteLength }), {
    method: 'PUT',
    headers: { 'Content-Type': mime, 'Content-Length': String(input.bytes.byteLength) },
    body: Buffer.from(input.bytes),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!uploaded?.ok) throw new ClosingDocumentError('Não foi possível guardar o arquivo. Tente de novo.');

  const name = cleanTemplateName(input.fileName.replace(/\.pdf$/i, ''));
  await prisma.$executeRaw`
    INSERT INTO closing_document_templates (id, tenant_id, name, object_key, size_bytes, placeholders, situation, kind, checklist_ids, position, created_by, created_at)
    VALUES (${id}, ${input.tenantId}, ${name}, ${objectKey}, ${input.bytes.byteLength},
      ${JSON.stringify(placeholders)}::jsonb, 'all', ${kind}, ${JSON.stringify(checklistIds)}::jsonb, ${total}, ${input.userId}, NOW())`;
  return { id, kind, ...placeholders };
}

/** Only document lists (case types) of the company itself. */
async function knownChecklists(tenantId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await prisma.documentChecklist.findMany({ where: { tenantId, id: { in: ids.slice(0, 50) } }, select: { id: true } });
  return rows.map((row) => row.id);
}

async function templateRow(tenantId: string, id: string) {
  const rows = await prisma.$queryRaw<TemplateRow[]>`
    SELECT id, name, object_key, size_bytes, placeholders, situation, kind, checklist_ids, created_at
    FROM closing_document_templates WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return rows[0] || null;
}

/** The bytes of one model of the company, or null. */
export async function readClosingTemplate(tenantId: string, id: string) {
  const row = await templateRow(tenantId, id);
  const storage = resolveAttachmentStorage();
  if (!row || !storage.ready) return null;
  const bytes = await readAttachmentObject(storage.config, { key: row.object_key, maxBytes: CLOSING_MAX_BYTES });
  if (!bytes) return null;
  const template = toTemplate(row);
  return { name: row.name, kind: template.kind, mime: template.kind === 'pdf' ? PDF_MIME : DOCX_MIME, bytes };
}

/** Which case types (document lists) one model is for; none = every case. */
export async function setClosingTemplateChecklists(tenantId: string, id: string, checklistIds: string[]) {
  const ids = await knownChecklists(tenantId, checklistIds);
  const changed = await prisma.$executeRaw`
    UPDATE closing_document_templates SET checklist_ids = ${JSON.stringify(ids)}::jsonb WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return changed > 0;
}

/** Which customers one model is for. */
export async function setClosingTemplateSituation(tenantId: string, id: string, situation: ClosingSituation) {
  const changed = await prisma.$executeRaw`
    UPDATE closing_document_templates SET situation = ${situation} WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return changed > 0;
}

export async function deleteClosingTemplate(tenantId: string, id: string) {
  const row = await templateRow(tenantId, id);
  if (!row) return false;
  await prisma.$executeRaw`DELETE FROM closing_document_templates WHERE tenant_id = ${tenantId} AND id = ${id}`;
  const storage = resolveAttachmentStorage();
  if (storage.ready) await deleteAttachmentObject(storage.config, { key: row.object_key }).catch(() => undefined);
  return true;
}
