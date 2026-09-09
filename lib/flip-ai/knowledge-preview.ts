import 'server-only';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess } from './access';
import { searchKnowledgeByVector } from './indexing';
import { createOpenAiEmbeddings, FLIP_AI_EMBEDDING_MODEL, OpenAiEmbeddingError,
  type EmbeddingResult } from './openai-embeddings';

export const knowledgePreviewSchema = z.object({
  requestId: z.string().uuid(),
  query: z.string().trim().min(3).max(500),
  confirmRetry: z.boolean().optional().default(false),
}).strict();

type Embedder = (inputs: string[]) => Promise<EmbeddingResult>;
export type KnowledgePreviewHit = { id: string; heading: string | null; content: string; score: number };
export type KnowledgePreviewResult = { requestId: string; cached: boolean; inputTokens: number; hits: KnowledgePreviewHit[] };
type StoredMetadata = { queryHash?: string; indexId?: string; attemptStartedAt?: string;
  results?: Array<{ id: string; score: number }> };

function metadataOf(value: Prisma.JsonValue | null): StoredMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as unknown as StoredMetadata : {};
}

async function hydrateCachedHits(tenantId: string, results: Array<{ id: string; score: number }>): Promise<KnowledgePreviewHit[]> {
  if (!results.length) return [];
  const ids = results.map((result) => result.id);
  const rows = await prisma.$queryRaw<Array<{ id: string; heading: string | null; content: string }>>(Prisma.sql`
    SELECT id, heading, content FROM flip_ai_knowledge_chunks
    WHERE tenant_id = ${tenantId} AND id IN (${Prisma.join(ids)})
  `);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return results.flatMap((result) => {
    const row = byId.get(result.id);
    return row ? [{ ...row, score: result.score }] : [];
  });
}

export async function previewKnowledgeRetrieval(session: SessionPayload, agentId: string, rawInput: unknown,
  embedder: Embedder = createOpenAiEmbeddings): Promise<KnowledgePreviewResult> {
  const parsed = knowledgePreviewSchema.safeParse(rawInput);
  if (!parsed.success) throw new FlipAiError('INVALID_KNOWLEDGE_PREVIEW', 400, 'Revise a pergunta usada no teste da base.');
  const input = parsed.data;
  const requestKey = `knowledge-preview:${input.requestId}`;
  const queryHash = createHash('sha256').update(input.query).digest('hex');

  const reservation = await prisma.$transaction(async (db) => {
    const { tenantId } = await requireFlipAiAccess(db, session);
    await db.$queryRaw(Prisma.sql`SELECT id FROM flip_ai_agents
      WHERE tenant_id = ${tenantId} AND id = ${agentId} FOR UPDATE`);
    const document = await db.flipAiKnowledgeDocument.findFirst({ where: {
      tenantId, sourceKey: 'master', knowledgeBase: { agentId },
    }, select: { id: true, currentRevision: true, currentHash: true } });
    if (!document) throw new FlipAiError('MASTER_MARKDOWN_NOT_FOUND', 404, 'Cadastre o Markdown Mestre antes de testar.');
    const index = await db.flipAiKnowledgeIndex.findFirst({ where: { tenantId, agentId, documentId: document.id,
      revision: document.currentRevision, contentHash: document.currentHash, embeddingModel: FLIP_AI_EMBEDDING_MODEL,
      status: 'completed' }, select: { id: true } });
    if (!index) throw new FlipAiError('KNOWLEDGE_INDEX_NOT_READY', 409, 'Conclua a indexação da revisão atual antes de testar.');

    const existing = await db.flipAiUsageEvent.findUnique({ where: { requestKey } });
    if (existing) {
      const metadata = metadataOf(existing.metadata);
      if (existing.tenantId !== tenantId || existing.agentId !== agentId || existing.operation !== 'knowledge_preview' ||
        metadata.queryHash !== queryHash || metadata.indexId !== index.id) {
        throw new FlipAiError('PREVIEW_REQUEST_CONFLICT', 409, 'Esta solicitação já foi usada em outro teste.');
      }
      if (existing.status === 'confirmed') return { mode: 'cached' as const, tenantId, indexId: index.id, eventId: existing.id,
        inputTokens: existing.inputTokens || 0, results: metadata.results || [] };
      if (existing.status === 'processing') {
        const startedAt = metadata.attemptStartedAt ? new Date(metadata.attemptStartedAt).getTime() : existing.createdAt.getTime();
        if (Date.now() - startedAt <= 10 * 60_000) return { mode: 'busy' as const, tenantId, indexId: index.id, eventId: existing.id };
        await db.flipAiUsageEvent.update({ where: { id: existing.id }, data: { status: 'ambiguous',
          metadata: { ...metadata, errorCode: 'STALE_PREVIEW_AMBIGUOUS' } } });
        return { mode: 'ambiguous' as const, tenantId, indexId: index.id, eventId: existing.id };
      }
      if (!input.confirmRetry) return { mode: existing.status === 'ambiguous' ? 'ambiguous' as const : 'failed' as const,
        tenantId, indexId: index.id, eventId: existing.id };
      await db.flipAiUsageEvent.update({ where: { id: existing.id }, data: { status: 'processing', inputTokens: null,
        metadata: { queryHash, indexId: index.id, attemptStartedAt: new Date().toISOString() } } });
      return { mode: 'execute' as const, tenantId, indexId: index.id, eventId: existing.id };
    }
    const event = await db.flipAiUsageEvent.create({ data: { tenantId, agentId, requestKey,
      operation: 'knowledge_preview', provider: 'openai', model: FLIP_AI_EMBEDDING_MODEL, status: 'processing',
      outputTokens: 0, units: 1, metadata: { queryHash, indexId: index.id, attemptStartedAt: new Date().toISOString() } } });
    return { mode: 'execute' as const, tenantId, indexId: index.id, eventId: event.id };
  });

  if (reservation.mode === 'cached') return { requestId: input.requestId, cached: true,
    inputTokens: reservation.inputTokens, hits: await hydrateCachedHits(reservation.tenantId, reservation.results) };
  if (reservation.mode !== 'execute') {
    const ambiguous = reservation.mode === 'ambiguous' || reservation.mode === 'busy';
    throw new FlipAiError(ambiguous ? 'KNOWLEDGE_PREVIEW_AMBIGUOUS' : 'KNOWLEDGE_PREVIEW_RETRY_REQUIRED', 409,
      ambiguous ? 'O resultado anterior é incerto. Confirme antes de tentar novamente.' : 'Confirme uma nova tentativa para repetir este teste.');
  }

  try {
    const embedded = await embedder([input.query]);
    if (embedded.embeddings.length !== 1) throw new OpenAiEmbeddingError('ambiguous', 'OPENAI_EMBEDDING_INVALID_RESPONSE');
    const hits = await searchKnowledgeByVector(session, agentId, embedded.embeddings[0], 5);
    const metadata = { queryHash, indexId: reservation.indexId,
      results: hits.map((hit) => ({ id: hit.id, score: hit.score })) };
    const changed = await prisma.flipAiUsageEvent.updateMany({ where: { id: reservation.eventId,
      tenantId: reservation.tenantId, status: 'processing' }, data: { status: 'confirmed',
      inputTokens: embedded.inputTokens, metadata } });
    if (changed.count !== 1) throw new OpenAiEmbeddingError('ambiguous', 'PREVIEW_PERSISTENCE_AMBIGUOUS');
    return { requestId: input.requestId, cached: false, inputTokens: embedded.inputTokens, hits };
  } catch (error) {
    const failure = error instanceof OpenAiEmbeddingError ? error : new OpenAiEmbeddingError('ambiguous', 'PREVIEW_RESULT_AMBIGUOUS');
    const current = await prisma.flipAiUsageEvent.findUnique({ where: { id: reservation.eventId }, select: { metadata: true } });
    await prisma.flipAiUsageEvent.updateMany({ where: { id: reservation.eventId, tenantId: reservation.tenantId, status: 'processing' },
      data: { status: failure.kind === 'ambiguous' ? 'ambiguous' : 'failed',
        metadata: { ...metadataOf(current?.metadata || null), errorCode: failure.code } } });
    throw new FlipAiError(failure.code, failure.code === 'OPENAI_API_KEY_MISSING' ? 503 : 502,
      failure.kind === 'ambiguous' ? 'O resultado da OpenAI ficou incerto. Confirme antes de tentar novamente.'
        : 'A OpenAI recusou o teste. Confirme uma nova tentativa depois de revisar a configuração.');
  }
}
