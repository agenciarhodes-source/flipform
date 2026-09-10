import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessFlipAi, canServeFlipAiPublic, createAgentDraftSchema, updateAgentDraftSchema, knowledgeMasterSchema } from '../lib/flip-ai/policy';
import { requireFlipAiAccess, FlipAiError, type FlipAiDb } from '../lib/flip-ai/access';
import type { SessionPayload } from '../lib/auth';
import { batchKnowledgeChunks, chunkMasterMarkdown, FLIP_AI_CHUNK_MAX_BYTES } from '../lib/flip-ai/chunking';
import { createOpenAiEmbeddings, FLIP_AI_EMBEDDING_DIMENSIONS, OpenAiEmbeddingError } from '../lib/flip-ai/openai-embeddings';
import { knowledgePreviewSchema } from '../lib/flip-ai/knowledge-preview';

const plan = { slug: 'premium', isActive: true };
const allowed = { role: 'owner', tenantStatus: 'active', plan };
test('only Premium/Premium Pro owners and admins qualify', () => {
  assert.equal(canAccessFlipAi(allowed), true);
  assert.equal(canAccessFlipAi({ ...allowed, role: 'admin', plan: { ...plan, slug: 'premium-pro' } }), true);
  for (const role of ['manager', 'agent', 'viewer', 'platform_admin', null]) assert.equal(canAccessFlipAi({ ...allowed, role }), false);
  for (const slug of ['free', 'starter', 'pro', 'growth', 'business', 'Premium', null]) assert.equal(canAccessFlipAi({ ...allowed, plan: { ...plan, slug } }), false);
  assert.equal(canAccessFlipAi({ ...allowed, plan: null }), false);
  assert.equal(canAccessFlipAi({ ...allowed, plan: { ...plan, isActive: false } }), false);
});
test('billing is fail-closed, including grace deadlines', () => {
  for (const tenantStatus of ['blocked', 'suspended', 'canceled', 'inactive', 'unknown']) assert.equal(canAccessFlipAi({ ...allowed, tenantStatus }), false);
  for (const status of ['suspended', 'canceled', 'unpaid', 'paused']) assert.equal(canAccessFlipAi({ ...allowed, subscription: { status, plan, gracePeriodEndsAt: null } }), false);
  const now = new Date('2026-09-09T12:00:00Z');
  assert.equal(canAccessFlipAi({ ...allowed, tenantStatus: 'past_due', now }), false);
  for (const ms of [-1, 0, 1]) assert.equal(canAccessFlipAi({ ...allowed, now, subscription: { status: 'past_due', plan, gracePeriodEndsAt: new Date(now.getTime() + ms) } }), ms > 0);
});
test('strict payload rejects tenant and integration overrides', () => {
  const draft = { name: 'Helena', description: '', primaryColor: '#2563EB', style: 'welcoming', slug: 'helena-empresa',
    pipelineId: 'a166c90d-c862-4e04-9e8b-ad1c43ac6390', initialStageId: 'b166c90d-c862-4e04-9e8b-ad1c43ac6390',
    requestId: 'c166c90d-c862-4e04-9e8b-ad1c43ac6390' };
  assert.equal(createAgentDraftSchema.safeParse(draft).success, true);
  for (const key of ['tenantId', 'status', 'provider', 'pixelId', 'apiKey']) assert.equal(createAgentDraftSchema.safeParse({ ...draft, [key]: 'injected' }).success, false);
  assert.equal(createAgentDraftSchema.safeParse({ ...draft, primaryColor: 'url(https://evil.invalid)' }).success, false);
  assert.equal(createAgentDraftSchema.safeParse({ ...draft, slug: '../admin' }).success, false);
  const { requestId, ...input } = draft;
  assert.equal(updateAgentDraftSchema.safeParse({ ...input, version: 0 }).success, false);
});
test('fresh membership overrides JWT role', async () => {
  let membership = { role: 'viewer', status: 'active' };
  const db = { tenantUser: { findUnique: async () => membership }, tenant: { findUnique: async () => ({ status: 'active', plan }) },
    subscription: { findFirst: async () => null } } as unknown as FlipAiDb;
  const session = { userId: 'u', tenantId: 't', role: 'owner', globalRole: 'platform_admin' } as SessionPayload;
  await assert.rejects(requireFlipAiAccess(db, session), (e: unknown) => e instanceof FlipAiError && e.status === 403);
  membership = { role: 'admin', status: 'active' };
  assert.deepEqual(await requireFlipAiAccess(db, session), { tenantId: 't', userId: 'u' });
});

test('Markdown Mestre payload is strict and bounded', () => {
  const valid = { title: 'Base oficial', content: '# Empresa\n\nConteúdo oficial da empresa.', expectedRevision: 0 };
  assert.equal(knowledgeMasterSchema.safeParse(valid).success, true);
  assert.equal(knowledgeMasterSchema.safeParse({ ...valid, tenantId: 'other' }).success, false);
  assert.equal(knowledgeMasterSchema.safeParse({ ...valid, content: 'curto' }).success, false);
  assert.equal(knowledgeMasterSchema.safeParse({ ...valid, content: 'x'.repeat(700_000) }).success, true);
  assert.equal(knowledgeMasterSchema.safeParse({ ...valid, content: 'texto válido com nul\0' }).success, false);
});

test('PR 268 migration keeps Premium plans inactive and has no destructive statements', () => {
  const sql = readFileSync(new URL('../prisma/migrations/20260909160000_flip_ai_master_knowledge/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /'Premium'.*'premium'.*797\.00/s);
  assert.match(sql, /'Premium Pro'.*'premium-pro'.*1497\.00/s);
  assert.equal((sql.match(/, FALSE, NOW\(\), NOW\(\)/g) || []).length, 2);
  assert.doesNotMatch(sql, /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE|UPDATE\s+\"?(?:leads|conversations))/i);
});


test('Markdown chunking is deterministic, byte-bounded and batch-bounded', () => {
  const markdown = '# Empresa\n\n' + 'Informação oficial. '.repeat(900) + '\n\n## Atendimento\n\n' + '界'.repeat(8_000);
  const first = chunkMasterMarkdown(markdown);
  const second = chunkMasterMarkdown(markdown);
  assert.deepEqual(first, second);
  assert.ok(first.length > 2);
  assert.ok(first.every((chunk, index) => chunk.ordinal === index &&
    Buffer.byteLength(chunk.content, 'utf8') <= FLIP_AI_CHUNK_MAX_BYTES && chunk.contentHash.length === 64));
  const batches = batchKnowledgeChunks(first);
  assert.ok(batches.every((batch) => batch.chunks.length <= 64 && batch.byteSize <= 100_000));
});

test('OpenAI embeddings adapter pins model and dimensions without retrying', async () => {
  let calls = 0;
  let authorization = '';
  const result = await createOpenAiEmbeddings(['trecho oficial'], {
    apiKey: 'server-test-key',
    fetchImpl: async (_url, init) => {
      calls += 1;
      authorization = new Headers(init?.headers).get('authorization') || '';
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'text-embedding-3-small');
      assert.equal(body.dimensions, FLIP_AI_EMBEDDING_DIMENSIONS);
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(FLIP_AI_EMBEDDING_DIMENSIONS).fill(0.01) }],
        model: body.model, usage: { prompt_tokens: 4, total_tokens: 4 } }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(authorization, 'Bearer server-test-key');
  assert.equal(result.inputTokens, 4);
  let failedCalls = 0;
  await assert.rejects(createOpenAiEmbeddings(['trecho'], { apiKey: 'server-test-key', fetchImpl: async () => {
    failedCalls += 1;
    throw new TypeError('network');
  } }), (error: unknown) => error instanceof OpenAiEmbeddingError && error.kind === 'ambiguous');
  assert.equal(failedCalls, 1, 'adapter must never retry an ambiguous request');
});

test('PR 269 migration is additive and tenant-scoped', () => {
  const sql = readFileSync(new URL('../prisma/migrations/20260909210000_flip_ai_knowledge_index/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(sql, /vector\(1536\)/);
  assert.match(sql, /flip_ai_usage_events/);
  assert.match(sql, /FOREIGN KEY \("tenant_id", "agent_id"\)/);
  assert.doesNotMatch(sql, /\b(?:DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE|UPDATE\s+"?(?:leads|conversations))/i);
});


test('knowledge preview payload is strict and requires an idempotency key', () => {
  const valid = { requestId: 'c166c90d-c862-4e04-9e8b-ad1c43ac6390', query: 'Qual é o horário de atendimento?' };
  assert.equal(knowledgePreviewSchema.safeParse(valid).success, true);
  assert.equal(knowledgePreviewSchema.safeParse({ ...valid, tenantId: 'other' }).success, false);
  assert.equal(knowledgePreviewSchema.safeParse({ ...valid, query: 'x' }).success, false);
  assert.equal(knowledgePreviewSchema.safeParse({ ...valid, requestId: 'repetir' }).success, false);
});


test('public Flip AI runtime enforces Premium billing without an admin role', () => {
  assert.equal(canServeFlipAiPublic({ tenantStatus: 'active', plan }), true);
  assert.equal(canServeFlipAiPublic({ tenantStatus: 'active', plan: { ...plan, slug: 'starter' } }), false);
  assert.equal(canServeFlipAiPublic({ tenantStatus: 'blocked', plan }), false);
  assert.equal(canServeFlipAiPublic({
    tenantStatus: 'active',
    plan,
    subscription: { status: 'canceled', plan, gracePeriodEndsAt: null },
  }), false);
  const now = new Date('2026-09-10T00:00:00Z');
  assert.equal(canServeFlipAiPublic({
    tenantStatus: 'past_due',
    plan,
    subscription: { status: 'past_due', plan, gracePeriodEndsAt: new Date(now.getTime() + 1) },
    now,
  }), true);
});
