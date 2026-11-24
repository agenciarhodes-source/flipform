import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { createAttachmentUploadUrl, readAttachmentObject, resolveAttachmentStorage, type AttachmentStorageConfig } from '@/lib/storage/attachment-storage';
import { DEFAULT_SUPPORT_ACTIVATION, parseTenantSupportActivation, type TenantSupportActivation } from './support-switch-rules';

const MAX_MD_BYTES = 1_000_000;
const MAX_MANIFEST_BYTES = 16_384;

export type SupportKnowledge = {
  content: string;
  source: 'tenant-upload';
  version: number;
  hash: string;
  updatedAt: string | null;
};

type Manifest = { version: number; hash: string; key: string; updatedAt: string };

function isManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return Number.isSafeInteger(obj.version) && (obj.version as number) > 0 &&
    typeof obj.hash === 'string' && /^[a-f0-9]{64}$/.test(obj.hash) &&
    typeof obj.key === 'string' && /^tenants\/[A-Za-z0-9_-]+\/support-knowledge\/versions\/[a-f0-9-]+\.md$/.test(obj.key) &&
    typeof obj.updatedAt === 'string';
}

function safeTenantId(tenantId: string): string {
  // Server-derived tenant ID only, not user-provided filename/key.
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId)) throw new Error('SUPPORT_TENANT_ID_INVALID');
  return tenantId;
}

function manifestKey(tenantId: string) {
  return 'tenants/' + safeTenantId(tenantId) + '/support-knowledge/current.json';
}

async function manifest(config: AttachmentStorageConfig, tenantId: string) {
  const bytes = await readAttachmentObject(config, { key: manifestKey(tenantId), maxBytes: MAX_MANIFEST_BYTES });
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isManifest(parsed)) throw new Error('SUPPORT_MANIFEST_CORRUPT');
    if (!parsed.key.startsWith('tenants/' + safeTenantId(tenantId) + '/support-knowledge/versions/')) {
      throw new Error('SUPPORT_MANIFEST_TENANT_MISMATCH');
    }
    return parsed;
  } catch {
    throw new Error('SUPPORT_MANIFEST_INVALID');
  }
}

export async function readTenantSupportKnowledge(tenantId: string): Promise<SupportKnowledge | null> {
  safeTenantId(tenantId);
  // GitHub guarda código/templates; a fonte de conhecimento do produto é EXCLUSIVAMENTE
  // a revisão privada anexada pela empresa. Nunca consultar ou herdar outra empresa.
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new Error('SUPPORT_STORAGE_NOT_CONFIGURED');
  const current = await manifest(storage.config, tenantId);
  if (!current) return null;
  const contentBytes = await readAttachmentObject(storage.config, { key: current.key, maxBytes: MAX_MD_BYTES });
  if (!contentBytes) throw new Error('SUPPORT_VERSION_MISSING');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(contentBytes);
  if (createHash('sha256').update(content).digest('hex') !== current.hash) throw new Error('SUPPORT_HASH_MISMATCH');
  return { content, source: 'tenant-upload', version: current.version, hash: current.hash, updatedAt: current.updatedAt };
}

async function writeObject(config: AttachmentStorageConfig, key: string, body: Uint8Array, contentType: string) {
  const url = createAttachmentUploadUrl(config, { key, contentType, contentLength: body.byteLength });
  const response = await fetch(url, {
    method: 'PUT',
    body: Buffer.from(body),
    headers: { 'Content-Type': contentType, 'Content-Length': String(body.byteLength) },
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('SUPPORT_UPLOAD_STORAGE_FAILED');
}


const MAX_SWITCH_BYTES = 4_096;

/** Estado separado do manifesto do Markdown para evitar perder o conteúdo ao desligar. */
function activationKey(tenantId: string) {
  return 'tenants/' + safeTenantId(tenantId) + '/support-knowledge/activation.json';
}

/** Sempre desligado na ausência de configuração persistida, sem migração. */
export async function readTenantSupportActivation(tenantId: string): Promise<TenantSupportActivation> {
  safeTenantId(tenantId);
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new Error('SUPPORT_STORAGE_NOT_CONFIGURED');
  const bytes = await readAttachmentObject(storage.config, { key: activationKey(tenantId), maxBytes: MAX_SWITCH_BYTES });
  if (!bytes) return DEFAULT_SUPPORT_ACTIVATION;
  try {
    return parseTenantSupportActivation(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown);
  } catch {
    throw new Error('SUPPORT_ACTIVATION_INVALID');
  }
}

/** Falha fechada: falha de leitura, configuração ausente ou estado inválido = OFF. */
export async function isTenantSupportActive(tenantId: string): Promise<boolean> {
  try {
    return (await readTenantSupportActivation(tenantId)).enabled;
  } catch {
    return false;
  }
}

/** Proprietário altera apenas o seu próprio tenant, validado na rota autenticada. */
export async function saveTenantSupportActivation(input: {
  tenantId: string;
  userId: string;
  enabled: boolean;
  expectedRevision: number;
}) {
  safeTenantId(input.tenantId);
  if (typeof input.enabled !== 'boolean' ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error('SUPPORT_ACTIVATION_BAD_REQUEST');
  }
  const current = await readTenantSupportActivation(input.tenantId);
  if (current.revision !== input.expectedRevision) throw new Error('SUPPORT_ACTIVATION_CONFLICT');
  if (current.enabled === input.enabled) return { ...current, noop: true };

  // Ativar exige manual privado válido. Desativar não apaga ou altera o .md.
  if (input.enabled && !(await readTenantSupportKnowledge(input.tenantId))) {
    throw new Error('SUPPORT_ACTIVATION_NO_MANUAL');
  }
  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new Error('SUPPORT_STORAGE_NOT_CONFIGURED');

  const next: TenantSupportActivation = {
    enabled: input.enabled,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeObject(
    storage.config,
    activationKey(input.tenantId),
    new TextEncoder().encode(JSON.stringify(next)),
    'application/json',
  );

  await prisma.auditLog.create({ data: {
    tenantId: input.tenantId,
    userId: input.userId,
    entityType: 'support_knowledge',
    entityId: input.tenantId,
    action: input.enabled ? 'support_knowledge.enabled' : 'support_knowledge.disabled',
    metadata: { enabled: next.enabled, revision: next.revision },
  } });
  return { ...next, noop: false };
}

/** Escreve versão imutável e então atualiza ponteiro. Não deleta nem modifica versões anteriores. */
export async function saveTenantSupportKnowledge(input: {
  tenantId: string; userId: string; filename: string; content: string; expectedVersion: number;
}) {
  safeTenantId(input.tenantId);
  if (!/\.md$/i.test(input.filename) || input.filename.length > 150) throw new Error('SUPPORT_ONLY_MARKDOWN');
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error('SUPPORT_INVALID_REVISION');
  if (input.content.trim().length < 50 || !/^#\s+\S/m.test(input.content)) throw new Error('SUPPORT_MARKDOWN_INVALID');
  if (input.content.includes('\0')) throw new Error('SUPPORT_MARKDOWN_INVALID');
  const bytes = new TextEncoder().encode(input.content);
  if (bytes.byteLength > MAX_MD_BYTES) throw new Error('SUPPORT_FILE_TOO_LARGE');

  const storage = resolveAttachmentStorage();
  if (!storage.ready) throw new Error('SUPPORT_STORAGE_NOT_CONFIGURED');
  const current = await manifest(storage.config, input.tenantId);
  if ((current?.version || 0) !== input.expectedVersion) throw new Error('SUPPORT_VERSION_CONFLICT');

  const hash = createHash('sha256').update(input.content).digest('hex');
  if (hash === current?.hash) return { version: current.version, hash, noop: true };
  const version = (current?.version || 0) + 1;
  const key = 'tenants/' + safeTenantId(input.tenantId) + '/support-knowledge/versions/' + randomUUID() + '.md';
  const updatedAt = new Date().toISOString();
  await writeObject(storage.config, key, bytes, 'text/markdown; charset=utf-8');
  const next = { version, hash, key, updatedAt } satisfies Manifest;
  await writeObject(storage.config, manifestKey(input.tenantId), new TextEncoder().encode(JSON.stringify(next)), 'application/json');

  await prisma.auditLog.create({ data: {
    tenantId: input.tenantId, userId: input.userId,
    entityType: 'support_knowledge', entityId: input.tenantId,
    action: 'support_knowledge.revision_created',
    metadata: { version, hash, filename: input.filename, byteSize: bytes.byteLength },
  } });
  return { version, hash, updatedAt, noop: false };
}
