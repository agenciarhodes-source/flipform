import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess, type FlipAiDb } from './access';
import { batchKnowledgeChunks, chunkMasterMarkdown } from './chunking';
import { createOpenAiEmbeddings, FLIP_AI_EMBEDDING_DIMENSIONS, FLIP_AI_EMBEDDING_MODEL,
  OpenAiEmbeddingError, type EmbeddingResult } from './openai-embeddings';

type Embedder = (inputs: string[]) => Promise<EmbeddingResult>;
export type KnowledgeIndexStatus = { id: string; revision: number; status: string; chunkCount: number;
  completedBatches: number; totalBatches: number; inputTokens: number; lastErrorCode: string | null };

async function ensureIndexSchema(db: FlipAiDb) {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`
    SELECT to_regclass('public.flip_ai_knowledge_indexes') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_index_batches') IS NOT NULL
      AND to_regclass('public.flip_ai_knowledge_chunks') IS NOT NULL
      AND to_regclass('public.flip_ai_usage_events') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ready
  `);
  if (!rows[0]?.ready) throw new FlipAiError('FLIP_AI_INDEX_SCHEMA_NOT_READY', 503, 'A indexação da base está em preparação.');
}

function statusOf(index: { id: string; revision: number; status: string; chunkCount: number; inputTokens: number | null;
  lastErrorCode: string | null; batches: Array<{ status: string }> }): KnowledgeIndexStatus {
  return { id: index.id, revision: index.revision, status: index.status, chunkCount: index.chunkCount,
    completedBatches: index.batches.filter((batch) => batch.status === 'completed').length,
    totalBatches: index.batches.length, inputTokens: index.inputTokens || 0, lastErrorCode: index.lastErrorCode };
}

export async function prepareKnowledgeIndex(session: SessionPayload, agentId: string,
  expectedRevision: number): Promise<KnowledgeIndexStatus> {
  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureIndexSchema(db);
    const agent = await db.flipAiAgent.findFirst({ where: { id: agentId, tenantId, status: 'draft' },
      select: { id: true, knowledgeBase: { select: { id: true } } } });
    if (!agent?.knowledgeBase) throw new FlipAiError('MASTER_MARKDOWN_NOT_FOUND', 404, 'Cadastre o Markdown Mestre antes de indexar.');
    const document = await db.flipAiKnowledgeDocument.findFirst({
      where: { tenantId, knowledgeBaseId: agent.knowledgeBase.id, sourceKey: 'master' },
      include: { revisions: { where: { revision: expectedRevision }, take: 1 } },
    });
    if (!document || document.currentRevision !== expectedRevision || !document.revisions[0]) {
      throw new FlipAiError('KNOWLEDGE_VERSION_CONFLICT', 409, 'A base mudou. Recarregue antes de indexar.');
    }
    const existing = await db.flipAiKnowledgeIndex.findFirst({
      where: { tenantId, documentId: document.id, revision: expectedRevision, embeddingModel: FLIP_AI_EMBEDDING_MODEL },
      include: { batches: { select: { status: true } } },
    });
    if (existing) return statusOf(existing);
    const chunks = chunkMasterMarkdown(document.revisions[0].content);
    if (!chunks.length) throw new FlipAiError('EMPTY_MASTER_MARKDOWN', 400, 'O Markdown Mestre não possui conteúdo indexável.');
    const index = await db.flipAiKnowledgeIndex.create({ data: { tenantId, agentId, documentId: document.id,
      revision: expectedRevision, contentHash: document.currentHash, status: 'pending',
      embeddingModel: FLIP_AI_EMBEDDING_MODEL, embeddingDimensions: FLIP_AI_EMBEDDING_DIMENSIONS,
      chunkCount: chunks.length }, select: { id: true } });
    for (const batch of batchKnowledgeChunks(chunks)) {
      const createdBatch = await db.flipAiKnowledgeIndexBatch.create({ data: { tenantId, indexId: index.id,
        ordinal: batch.ordinal, status: 'pending', byteSize: batch.byteSize }, select: { id: true } });
      await db.flipAiKnowledgeChunk.createMany({ data: batch.chunks.map((chunk) => ({ tenantId, indexId: index.id,
        batchId: createdBatch.id, ordinal: chunk.ordinal, heading: chunk.heading, content: chunk.content,
        contentHash: chunk.contentHash, byteSize: chunk.byteSize, tokenEstimate: chunk.tokenEstimate })) });
    }
    const prepared = await db.flipAiKnowledgeIndex.findUniqueOrThrow({ where: { id: index.id },
      include: { batches: { select: { status: true } } } });
    return statusOf(prepared);
  });
}

export async function processNextKnowledgeIndexBatch(session: SessionPayload, agentId: string, indexId: string,
  confirmAmbiguousRetry = false, embedder: Embedder = createOpenAiEmbeddings): Promise<KnowledgeIndexStatus> {
  const claim = await prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureIndexSchema(db);
    const index = await db.flipAiKnowledgeIndex.findFirst({ where: { id: indexId, tenantId, agentId },
      include: { document: { select: { currentRevision: true, currentHash: true } }, batches: { orderBy: { ordinal: 'asc' } } } });
    if (!index) throw new FlipAiError('KNOWLEDGE_INDEX_NOT_FOUND', 404, 'Índice não encontrado.');
    if (index.document.currentRevision !== index.revision || index.document.currentHash !== index.contentHash) {
      const superseded = await db.flipAiKnowledgeIndex.update({ where: { id: index.id },
        data: { status: 'superseded', lastErrorCode: 'REVISION_SUPERSEDED' },
        include: { batches: { select: { status: true } } } });
      return { blocked: statusOf(superseded), tenantId, batch: null };
    }
    const next = index.batches.find((batch) => batch.status !== 'completed');
    if (!next) {
      const completed = await db.flipAiKnowledgeIndex.update({ where: { id: index.id }, data: { status: 'completed', completedAt: new Date() },
        include: { batches: { select: { status: true } } } });
      return { blocked: statusOf(completed), tenantId, batch: null };
    }
    if (next.status === 'processing') {
      const stale = !!next.startedAt && Date.now() - next.startedAt.getTime() > 10 * 60_000;
      if (stale) {
        await db.flipAiKnowledgeIndexBatch.update({ where: { id: next.id }, data: { status: 'ambiguous', lastErrorCode: 'STALE_PROCESSING_AMBIGUOUS' } });
        await db.flipAiKnowledgeIndex.update({ where: { id: index.id }, data: { status: 'ambiguous', lastErrorCode: 'STALE_PROCESSING_AMBIGUOUS' } });
      }
      return { blocked: { ...statusOf(index), status: stale ? 'ambiguous' : 'processing',
        lastErrorCode: stale ? 'STALE_PROCESSING_AMBIGUOUS' : index.lastErrorCode }, tenantId, batch: null };
    }
    if (next.status === 'ambiguous' && !confirmAmbiguousRetry) {
      return { blocked: { ...statusOf(index), status: 'ambiguous' }, tenantId, batch: null };
    }
    const changed = await db.flipAiKnowledgeIndexBatch.updateMany({ where: { id: next.id, tenantId, status: next.status },
      data: { status: 'processing', startedAt: new Date(), completedAt: null, attemptCount: { increment: 1 }, lastErrorCode: null } });
    if (changed.count !== 1) throw new FlipAiError('KNOWLEDGE_INDEX_BUSY', 409, 'Outro processo iniciou este lote.');
    await db.flipAiKnowledgeIndex.update({ where: { id: index.id }, data: { status: 'processing',
      attemptCount: { increment: 1 }, lastErrorCode: null } });
    const batch = await db.flipAiKnowledgeIndexBatch.findUniqueOrThrow({ where: { id: next.id },
      include: { chunks: { orderBy: { ordinal: 'asc' }, select: { id: true, content: true } } } });
    return { blocked: null, tenantId, batch };
  });
  if (!claim.batch) return claim.blocked!;

  const requestKey = `${claim.batch.id}:${claim.batch.attemptCount}`;
  try {
    const result = await embedder(claim.batch.chunks.map((chunk) => chunk.content));
    if (result.embeddings.length !== claim.batch.chunks.length ||
      result.embeddings.some((embedding) => embedding.length !== FLIP_AI_EMBEDDING_DIMENSIONS || embedding.some((value) => !Number.isFinite(value)))) {
      throw new OpenAiEmbeddingError('ambiguous', 'OPENAI_EMBEDDING_DIMENSION_MISMATCH');
    }
    return await prisma.$transaction(async (db) => {
      const { tenantId } = await requireFlipAiAccess(db, session);
      for (let position = 0; position < claim.batch!.chunks.length; position += 1) {
        const vector = `[${result.embeddings[position].join(',')}]`;
        const changed = await db.$executeRaw(Prisma.sql`UPDATE flip_ai_knowledge_chunks
          SET embedding = ${vector}::vector WHERE id = ${claim.batch!.chunks[position].id}
            AND tenant_id = ${tenantId} AND batch_id = ${claim.batch!.id}`);
        if (changed !== 1) throw new FlipAiError('KNOWLEDGE_CHUNK_WRITE_FAILED', 409, 'Não foi possível confirmar um trecho indexado.');
      }
      await db.flipAiKnowledgeIndexBatch.update({ where: { id: claim.batch!.id }, data: { status: 'completed',
        inputTokens: result.inputTokens, completedAt: new Date(), lastErrorCode: null } });
      await db.flipAiUsageEvent.create({ data: { tenantId, agentId, requestKey, operation: 'knowledge_embedding',
        provider: 'openai', model: result.model, status: 'confirmed', inputTokens: result.inputTokens,
        outputTokens: 0, units: claim.batch!.chunks.length, metadata: { indexId, batchId: claim.batch!.id } } });
      const remaining = await db.flipAiKnowledgeIndexBatch.count({ where: { tenantId, indexId, status: { not: 'completed' } } });
      const index = await db.flipAiKnowledgeIndex.update({ where: { id: indexId }, data: {
        status: remaining ? 'pending' : 'completed', inputTokens: { increment: result.inputTokens },
        completedAt: remaining ? null : new Date(), lastErrorCode: null }, include: { batches: { select: { status: true } } } });
      return statusOf(index);
    });
  } catch (error) {
    const failure = error instanceof OpenAiEmbeddingError ? error : new OpenAiEmbeddingError('ambiguous', 'INDEX_PERSISTENCE_AMBIGUOUS');
    await prisma.$transaction(async (db) => {
      const access = await requireFlipAiAccess(db, session);
      await db.flipAiKnowledgeIndexBatch.updateMany({ where: { id: claim.batch!.id, tenantId: access.tenantId, status: 'processing' },
        data: { status: failure.kind === 'ambiguous' ? 'ambiguous' : 'failed', lastErrorCode: failure.code } });
      await db.flipAiKnowledgeIndex.updateMany({ where: { id: indexId, tenantId: access.tenantId },
        data: { status: failure.kind === 'ambiguous' ? 'ambiguous' : 'failed', lastErrorCode: failure.code } });
      await db.flipAiUsageEvent.upsert({ where: { requestKey }, create: { tenantId: access.tenantId, agentId,
        requestKey, operation: 'knowledge_embedding', provider: 'openai', model: FLIP_AI_EMBEDDING_MODEL,
        status: failure.kind, outputTokens: 0, units: claim.batch!.chunks.length,
        metadata: { indexId, batchId: claim.batch!.id, errorCode: failure.code } }, update: {} });
    });
    const message = failure.kind === 'ambiguous'
      ? 'O resultado da OpenAI ficou ambíguo. Confirme manualmente antes de tentar este lote novamente.'
      : 'A OpenAI recusou este lote. Uma nova tentativa precisa ser iniciada explicitamente.';
    throw new FlipAiError(failure.code, failure.code === 'OPENAI_API_KEY_MISSING' ? 503 : 502, message);
  }
}

export async function searchKnowledgeByVector(session: SessionPayload, agentId: string, embedding: number[], limit = 5) {
  if (embedding.length !== FLIP_AI_EMBEDDING_DIMENSIONS || embedding.some((value) => !Number.isFinite(value))) {
    throw new FlipAiError('INVALID_QUERY_EMBEDDING', 400, 'Vetor de consulta inválido.');
  }
  const take = Math.max(1, Math.min(8, Math.trunc(limit)));
  return prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await ensureIndexSchema(db);
    const vector = `[${embedding.join(',')}]`;
    return db.$queryRaw<Array<{ id: string; heading: string | null; content: string; score: number }>>(Prisma.sql`
      SELECT c.id, c.heading, c.content, 1 - (c.embedding <=> ${vector}::vector) AS score
      FROM flip_ai_knowledge_chunks c
      JOIN flip_ai_knowledge_indexes i ON i.id = c.index_id AND i.tenant_id = c.tenant_id
      JOIN flip_ai_knowledge_documents d ON d.id = i.document_id AND d.tenant_id = i.tenant_id
      WHERE c.tenant_id = ${tenantId} AND i.agent_id = ${agentId} AND i.status = 'completed'
        AND d.current_revision = i.revision AND d.current_hash = i.content_hash AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vector}::vector LIMIT ${take}
    `);
  });
}
