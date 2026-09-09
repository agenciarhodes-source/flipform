import 'server-only';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess, type FlipAiDb } from './access';
import { knowledgeMasterSchema, type KnowledgeMaster, type KnowledgeMasterSummary } from './policy';

async function ensureKnowledgeSchema(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_agents') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_bases') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_documents') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_revisions') IS NOT NULL AS ready
  `);
  if (!rows[0]?.ready) throw new FlipAiError('FLIP_AI_KNOWLEDGE_SCHEMA_NOT_READY', 503, 'A base de conhecimento está em preparação.');
}
async function requireDraftAgent(db: FlipAiDb, tenantId: string, agentId: string) {
  const agent = await db.flipAiAgent.findFirst({ where: { id: agentId, tenantId, status: 'draft' }, select: { id: true } });
  if (!agent) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente em rascunho não encontrado.');
}
function summary(document: { title: string; currentRevision: number; byteSize: number; currentHash: string; updatedAt: Date }): KnowledgeMasterSummary {
  return { title: document.title, revision: document.currentRevision, byteSize: document.byteSize,
    contentHash: document.currentHash, updatedAt: document.updatedAt.toISOString() };
}

export async function getMasterMarkdown(session: SessionPayload, agentId: string): Promise<KnowledgeMaster | null> {
  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureKnowledgeSchema(db);
    await requireDraftAgent(db, tenantId, agentId);
    const base = await db.flipAiKnowledgeBase.findFirst({ where: { tenantId, agentId }, select: { id: true } });
    if (!base) return null;
    const document = await db.flipAiKnowledgeDocument.findFirst({ where: { tenantId, knowledgeBaseId: base.id, sourceKey: 'master' } });
    if (!document) return null;
    const revision = await db.flipAiKnowledgeRevision.findFirst({
      where: { tenantId, documentId: document.id, revision: document.currentRevision },
      select: { content: true },
    });
    if (!revision) throw new FlipAiError('KNOWLEDGE_REVISION_NOT_FOUND', 409, 'A revisão atual não pôde ser carregada.');
    return { ...summary(document), content: revision.content };
  });
}

export async function saveMasterMarkdown(session: SessionPayload, agentId: string, rawInput: unknown): Promise<KnowledgeMasterSummary> {
  const parsed = knowledgeMasterSchema.safeParse(rawInput);
  if (!parsed.success) throw new FlipAiError('INVALID_MASTER_MARKDOWN', 400, 'Revise o título e o conteúdo do Markdown Mestre.');
  const input = parsed.data;
  const byteSize = Buffer.byteLength(input.content, 'utf8');
  if (byteSize > 1_000_000) throw new FlipAiError('MASTER_MARKDOWN_TOO_LARGE', 413, 'O Markdown Mestre deve ter no máximo 1 MB.');
  const contentHash = createHash('sha256').update(input.title).update('\0').update(input.content).digest('hex');

  return prisma.$transaction(async (db) => {
    const { tenantId, userId } = await requireFlipAiAccess(db, session);
    await ensureKnowledgeSchema(db);
    await db.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`);
    await requireDraftAgent(db, tenantId, agentId);

    let base = await db.flipAiKnowledgeBase.findFirst({ where: { tenantId, agentId } });
    if (!base) base = await db.flipAiKnowledgeBase.create({ data: { tenantId, agentId, status: 'draft' } });
    const existing = await db.flipAiKnowledgeDocument.findFirst({ where: { tenantId, knowledgeBaseId: base.id, sourceKey: 'master' } });

    if (existing?.currentHash === contentHash) return summary(existing);
    const actualRevision = existing?.currentRevision || 0;
    if (input.expectedRevision !== actualRevision) {
      throw new FlipAiError('KNOWLEDGE_VERSION_CONFLICT', 409, 'O Markdown Mestre mudou em outra sessão. Recarregue antes de salvar.');
    }
    const nextRevision = actualRevision + 1;
    const document = existing
      ? await db.flipAiKnowledgeDocument.update({ where: { id: existing.id }, data: {
          title: input.title, currentRevision: nextRevision, currentHash: contentHash, byteSize,
        } })
      : await db.flipAiKnowledgeDocument.create({ data: {
          tenantId, knowledgeBaseId: base.id, sourceKey: 'master', sourceType: 'markdown',
          title: input.title, currentRevision: nextRevision, currentHash: contentHash, byteSize,
        } });
    await db.flipAiKnowledgeRevision.create({ data: {
      tenantId, documentId: document.id, revision: nextRevision, title: input.title,
      content: input.content, contentHash, byteSize, createdBy: userId,
    } });
    await db.auditLog.create({ data: { tenantId, userId, entityType: 'flip_ai_knowledge_document',
      entityId: document.id, action: 'master_markdown.revision_created',
      metadata: { agentId, revision: nextRevision, byteSize, contentHash } } });
    return summary(document);
  });
}
