import 'server-only';

import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess, type FlipAiDb } from './access';
import { externalSourceCreateSchema, externalSourceUpdateSchema, type FlipAiExternalSource } from './policy';

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.invalid', '.example', '.test'];
const COUNTRY_SECOND_LEVEL = new Set(['ac', 'co', 'com', 'edu', 'gov', 'mil', 'net', 'org']);

export function normalizeExternalSourceDomain(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value || value.includes('://') || /[/?#@:*\[\]]/.test(value) || value.endsWith('.')) {
    throw new FlipAiError('INVALID_EXTERNAL_SOURCE_DOMAIN', 400,
      'Informe somente o domínio, sem protocolo, caminho, porta ou curinga.');
  }
  const domain = domainToASCII(value);
  const labels = domain.split('.');
  if (!domain || domain.length > 253 || labels.length < 2 || isIP(domain)
    || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    || BLOCKED_SUFFIXES.some((suffix) => domain === suffix.slice(1) || domain.endsWith(suffix))
    || (labels.length === 2 && labels[1].length === 2 && COUNTRY_SECOND_LEVEL.has(labels[0]))) {
    throw new FlipAiError('INVALID_EXTERNAL_SOURCE_DOMAIN', 400, 'Informe um domínio público específico e confiável.');
  }
  return domain;
}

async function ensureSchema(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_external_sources') IS NOT NULL AS ready
  `);
  if (!rows[0]?.ready) throw new FlipAiError('FLIP_AI_EXTERNAL_SOURCES_SCHEMA_NOT_READY', 503,
    'As fontes externas estão em preparação. Tente novamente após a ativação.');
}
async function requireOwnedAgent(db: FlipAiDb, tenantId: string, agentId: string) {
  const agent = await db.flipAiAgent.findFirst({ where: { id: agentId, tenantId, status: { in: ['draft', 'published'] } }, select: { id: true } });
  if (!agent) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
}
function view(source: { id: string; label: string; domain: string; status: string; version: number; updatedAt: Date }): FlipAiExternalSource {
  if (source.status !== 'active' && source.status !== 'inactive') {
    throw new FlipAiError('EXTERNAL_SOURCE_STATE_INVALID', 500, 'A fonte possui um estado inválido.');
  }
  return { ...source, status: source.status, updatedAt: source.updatedAt.toISOString() };
}

export async function listExternalSources(session: SessionPayload, agentId: string) {
  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureSchema(db); await requireOwnedAgent(db, tenantId, agentId);
    return (await db.flipAiExternalSource.findMany({
      where: { tenantId, agentId }, orderBy: [{ status: 'asc' }, { label: 'asc' }, { id: 'asc' }],
      select: { id: true, label: true, domain: true, status: true, version: true, updatedAt: true },
    })).map(view);
  });
}

export async function createExternalSource(session: SessionPayload, agentId: string, raw: unknown) {
  const parsed = externalSourceCreateSchema.safeParse(raw);
  if (!parsed.success) throw new FlipAiError('INVALID_EXTERNAL_SOURCE', 400, 'Revise a fonte externa.');
  const input = { ...parsed.data, domain: normalizeExternalSourceDomain(parsed.data.domain) };
  try {
    return await prisma.$transaction(async (db) => {
      const { tenantId, userId } = await requireFlipAiAccess(db, session);
      await ensureSchema(db); await requireOwnedAgent(db, tenantId, agentId);
      const existing = await db.flipAiExternalSource.findUnique({ where: { id: input.requestId },
        select: { id: true, tenantId: true, agentId: true, label: true, domain: true, status: true, version: true, updatedAt: true } });
      if (existing) {
        if (existing.tenantId !== tenantId || existing.agentId !== agentId || existing.label !== input.label || existing.domain !== input.domain) {
          throw new FlipAiError('REQUEST_CONFLICT', 409, 'Esta solicitação já foi usada em outro contexto.');
        }
        return view(existing);
      }
      const source = await db.flipAiExternalSource.create({
        data: { id: input.requestId, tenantId, agentId, label: input.label, domain: input.domain },
        select: { id: true, label: true, domain: true, status: true, version: true, updatedAt: true },
      });
      await db.auditLog.create({ data: { tenantId, userId, entityType: 'flip_ai_external_source', entityId: source.id,
        action: 'created', metadata: { agentId, domain: input.domain } } });
      return view(source);
    });
  } catch (error) {
    if (error instanceof FlipAiError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new FlipAiError('EXTERNAL_SOURCE_DOMAIN_EXISTS', 409, 'Este domínio já está cadastrado para o atendente.');
    }
    throw error;
  }
}

export async function updateExternalSource(session: SessionPayload, agentId: string, sourceId: string, raw: unknown) {
  const parsed = externalSourceUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new FlipAiError('INVALID_EXTERNAL_SOURCE', 400, 'Revise a fonte externa.');
  return prisma.$transaction(async (db) => {
    const { tenantId, userId } = await requireFlipAiAccess(db, session);
    await ensureSchema(db); await requireOwnedAgent(db, tenantId, agentId);
    const changed = await db.flipAiExternalSource.updateMany({
      where: { id: sourceId, tenantId, agentId, version: parsed.data.version },
      data: { label: parsed.data.label, status: parsed.data.status, version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      const exists = await db.flipAiExternalSource.count({ where: { id: sourceId, tenantId, agentId } });
      if (!exists) throw new FlipAiError('EXTERNAL_SOURCE_NOT_FOUND', 404, 'Fonte externa não encontrada.');
      throw new FlipAiError('VERSION_CONFLICT', 409, 'Esta fonte mudou em outra sessão. Atualize a lista antes de editar.');
    }
    const source = await db.flipAiExternalSource.findFirstOrThrow({ where: { id: sourceId, tenantId, agentId },
      select: { id: true, label: true, domain: true, status: true, version: true, updatedAt: true } });
    await db.auditLog.create({ data: { tenantId, userId, entityType: 'flip_ai_external_source', entityId: source.id,
      action: parsed.data.status === 'active' ? 'activated' : 'deactivated', metadata: { agentId, domain: source.domain } } });
    return view(source);
  });
}
