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

type SettingsRow = { enabled: boolean; send_when: string };
type TemplateRow = { id: string; name: string; object_key: string; size_bytes: number; placeholders: unknown; situation: string; created_at: Date };

export type ClosingTemplate = { id: string; name: string; sizeBytes: number; known: string[]; unknown: string[]; situation: ClosingSituation; createdAt: string };

function toTemplate(row: TemplateRow): ClosingTemplate {
  const found = (row.placeholders && typeof row.placeholders === 'object' ? row.placeholders : {}) as { known?: unknown; unknown?: unknown };
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  const situation = (['adult', 'minor', 'rogo'].includes(row.situation) ? row.situation : 'all') as ClosingSituation;
  return { id: row.id, name: row.name, sizeBytes: row.size_bytes, known: list(found.known), unknown: list(found.unknown), situation, createdAt: row.created_at.toISOString() };
}

/** Settings and models of a company. `ready: false` while the tables do not exist yet. */
export async function closingDocuments(tenantId: string) {
  const settings = await prisma.$queryRaw<SettingsRow[]>`
    SELECT enabled, send_when FROM closing_document_settings WHERE tenant_id = ${tenantId}`.catch(() => null);
  if (!settings) return { ready: false as const };
  const templates = await prisma.$queryRaw<TemplateRow[]>`
    SELECT id, name, object_key, size_bytes, placeholders, situation, created_at FROM closing_document_templates
    WHERE tenant_id = ${tenantId} ORDER BY position ASC, created_at ASC`;
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

/** Keeps one Word model in the private storage. */
export async function addClosingTemplate(input: { tenantId: string; userId: string; fileName: string; bytes: Uint8Array; situation: ClosingSituation }) {
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new ClosingDocumentError('O armazenamento de arquivos não está configurado.');
  if (!/\.docx$/i.test(input.fileName)) throw new ClosingDocumentError('Envie o modelo em Word (.docx).');
  if (input.bytes.byteLength > CLOSING_MAX_BYTES) throw new ClosingDocumentError('O modelo pode ter até 2 MB.');
  let placeholders: { known: string[]; unknown: string[] };
  try {
    placeholders = docxPlaceholders(input.bytes);
  } catch {
    throw new ClosingDocumentError('Não consegui abrir este arquivo. Salve de novo no Word como .docx e tente outra vez.');
  }
  const count = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total FROM closing_document_templates WHERE tenant_id = ${input.tenantId}`;
  const total = Number(count[0]?.total || 0);
  if (total >= CLOSING_MAX_TEMPLATES) throw new ClosingDocumentError(`São até ${CLOSING_MAX_TEMPLATES} documentos. Apague um para enviar outro.`);

  const id = randomUUID();
  const objectKey = `tenants/${input.tenantId.replace(/[^A-Za-z0-9_-]/g, '')}/closing-documents/${id}`;
  const uploaded = await fetch(createAttachmentUploadUrl(storage.config, { key: objectKey, contentType: DOCX_MIME, contentLength: input.bytes.byteLength }), {
    method: 'PUT',
    headers: { 'Content-Type': DOCX_MIME, 'Content-Length': String(input.bytes.byteLength) },
    body: Buffer.from(input.bytes),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!uploaded?.ok) throw new ClosingDocumentError('Não foi possível guardar o arquivo. Tente de novo.');

  await prisma.$executeRaw`
    INSERT INTO closing_document_templates (id, tenant_id, name, object_key, size_bytes, placeholders, situation, position, created_by, created_at)
    VALUES (${id}, ${input.tenantId}, ${cleanTemplateName(input.fileName)}, ${objectKey}, ${input.bytes.byteLength},
      ${JSON.stringify(placeholders)}::jsonb, ${input.situation}, ${total}, ${input.userId}, NOW())`;
  return { id, ...placeholders };
}

async function templateRow(tenantId: string, id: string) {
  const rows = await prisma.$queryRaw<TemplateRow[]>`
    SELECT id, name, object_key, size_bytes, placeholders, situation, created_at FROM closing_document_templates
    WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return rows[0] || null;
}

/** The bytes of one model of the company, or null. */
export async function readClosingTemplate(tenantId: string, id: string) {
  const row = await templateRow(tenantId, id);
  const storage = resolveAttachmentStorage();
  if (!row || !storage.ready) return null;
  const bytes = await readAttachmentObject(storage.config, { key: row.object_key, maxBytes: CLOSING_MAX_BYTES });
  return bytes ? { name: row.name, bytes } : null;
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
