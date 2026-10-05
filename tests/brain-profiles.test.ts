import { chunkMasterMarkdown } from '../lib/flip-ai/chunking';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBrainProfiles, buildBrainAssessment, brainAssessmentPrompt, type BrainProfile } from '../lib/flip-ai/brain-profiles';
import { __testOnly, runJevConversationDecision } from '../lib/flip-ai/jev-decision-engine';
import { calculateFlipAiLeadScore, parseConversationDecision } from '../lib/flip-ai/lead-intelligence-policy';
import { applyBrainFinalQualification } from '../lib/flip-ai/qualification';
import { buildHarnessRetrievalQueries } from '../lib/flip-ai/harness-resolver';
import { buildFlipAiHumanHandoffSnapshot } from '../lib/flip-ai/human-handoff-policy';
import { loadPublishedBrainProfiles } from '../lib/flip-ai/brain-profiles-server';
import { prisma } from '../lib/prisma';

const profile: BrainProfile = {
  id: 'maternidade', label: 'Salário-maternidade', description: 'Pessoa busca orientação sobre maternidade.',
  retrievalTerms: ['maternidade rural', 'documentação rural'],
  criteria: [
    { id: 'perfil', label: 'Perfil', weight: 60, levels: ['Incompatível', 'Baixa aderência', 'Parcial', 'Boa aderência', 'Forte aderência'] },
    { id: 'documentos', label: 'Documentação', weight: 40, levels: ['Não possui', 'Poucos documentos', 'Documentos parciais', 'Boa documentação', 'Documentação pronta'] },
  ],
};
const fence = (value: unknown) => '# Empresa\n\n```flip-ai-profiles\n' + JSON.stringify(value) + '\n```\n';
const brain = { version: 1 as const, profiles: [profile] };
const assess = (answers: Record<string, {choice: string; confidence: number}>, confidence = .9) => buildBrainAssessment({
  knowledgeIndexId: 'published-index', contentHash: 'hash-v1', profile, confidence, answers,
});
const decision = {
  engine: 'jev' as const, engineVersion: 'test', model: 'jev', intent: 'qualification' as const,
  objection: 'none' as const, journeyStage: 'decision' as const, nextAction: 'ask_one_question' as const,
  fitScore: 100, intentScore: 100, urgencyScore: 100, readinessScore: 100,
  confidence: .9, intentConfidence: .9, objectionConfidence: .9, stageConfidence: .9, needsHuman: false,
};

test('central Markdown validates unique profiles, weights, levels and malformed fences', () => {
  assert.equal(parseBrainProfiles('Texto sem configurações').status, 'absent');
  assert.equal(parseBrainProfiles(fence(brain).replace(/\n/g, '\r\n')).status, 'valid');
  assert.equal(parseBrainProfiles('```flip-ai-profiles\n{').status, 'invalid');
  assert.equal(parseBrainProfiles(fence(brain) + fence(brain)).status, 'invalid');
  assert.equal(parseBrainProfiles(fence({version: 1, profiles: [profile, profile]})).status, 'invalid');
  assert.equal(parseBrainProfiles(fence({version: 1, profiles: [{...profile, criteria: [{...profile.criteria[0], weight: 99}]}]})).status, 'invalid');
  assert.equal(parseBrainProfiles(fence({version: 1, profiles: [{...profile, criteria: [{...profile.criteria[0], weight: 100, levels: ['one']}]}]})).status, 'invalid');
});

test('weighted score comes from the selected rubric; missing evidence never means low fit', () => {
  const full = assess({brain_perfil: {choice: 'level_4', confidence: .9}, brain_documentos: {choice: 'level_2', confidence: .9}});
  assert.equal(full.score, 80);
  assert.equal(full.status, 'complete');
  assert.equal(calculateFlipAiLeadScore({...decision, brainAssessment: full}).score, 80);
  const partial = assess({brain_perfil: {choice: 'level_4', confidence: .9}, brain_documentos: {choice: 'unknown', confidence: .95}});
  assert.equal(partial.score, null);
  assert.equal(calculateFlipAiLeadScore({...decision, brainAssessment: partial}).classification, 'insufficient');
  assert.equal(assess({brain_perfil: {choice: 'level_4', confidence: .3}}).criteria[0].level, null);
  assert.equal(assess({}, .3).status, 'unknown');
  assert.equal(assess({brain_perfil: {choice: 'level_0', confidence: .9}, brain_documentos: {choice: 'level_0', confidence: .9}}).score, 0);
  assert.match(brainAssessmentPrompt(partial), /ainda precisa ser confirmado/);
});

test('Jev routes only configured topics and unknown, without loading the complete brain', async () => {
  let sent: any;
  const routed = await __testOnly.routeBrainProfile({latestMessage: 'maternidade'}, brain, {
    apiKey: 'test', fetchImpl: (async (_url, options) => {
      sent = JSON.parse(String(options?.body));
      return new Response(JSON.stringify({model: 'jev', answers: {profile: {type: 'choice', choice: 'maternidade', confidence: .9}}, usage: {input_tokens: 10, output_tokens: 2}}));
    }) as typeof fetch,
  });
  assert.equal(routed.profile?.id, profile.id);
  assert.deepEqual(Object.keys(sent.questions.profile.criteria), ['unknown', 'maternidade']);
  assert.ok(!JSON.stringify(sent).includes('Documentação pronta'));
  const payload = __testOnly.payload({}, 'jev', profile);
  assert.ok('brain_documentos' in payload.questions);
  assert.equal(Object.keys(payload.questions).length, 16);
  await assert.rejects(__testOnly.routeBrainProfile({}, brain, {
    apiKey: 'test', fetchImpl: (async () => new Response(JSON.stringify({model: 'jev', answers: {profile: {type: 'choice', choice: 'foreign_profile', confidence: .99}}, usage: {input_tokens: 1, output_tokens: 1}}))) as typeof fetch,
  }), /JEV_PROFILE_CHOICE_INVALID/);
});

test('published loader binds tenant, agent and exact indexed revision, ignoring drafts', async () => {
  const original = prisma.flipAiKnowledgeIndex.findFirst;
  let query: any;
  try {
    (prisma.flipAiKnowledgeIndex as any).findFirst = async (args: unknown) => {query = args; return {contentHash: 'published-hash', sourceRevision: {content: fence(brain)}};};
    const result = await loadPublishedBrainProfiles({tenantId: 'tenant-a', agentId: 'agent-a', knowledgeIndexId: 'index-a'});
    assert.deepEqual(query.where, {id: 'index-a', tenantId: 'tenant-a', agentId: 'agent-a', status: 'completed'});
    assert.equal(result.contentHash, 'published-hash');
    assert.equal(result.status, 'valid');
    (prisma.flipAiKnowledgeIndex as any).findFirst = async () => null;
    await assert.rejects(loadPublishedBrainProfiles({tenantId: 'tenant-b', agentId: 'agent-a', knowledgeIndexId: 'index-a'}), /BRAIN_PUBLISHED_INDEX_NOT_FOUND/);
  } finally {(prisma.flipAiKnowledgeIndex as any).findFirst = original;}
});

test('retrieval is directed to the detected thesis and final qualification cannot override an incomplete rubric', () => {
  const assessment = assess({brain_perfil: {choice: 'level_4', confidence: .9}});
  const queries = buildHarnessRetrievalQueries({message: 'E quais documentos?', decision: {...decision, brainAssessment: assessment}});
  assert.match(queries.qualificationQuery, /documentação rural/);
  assert.equal(parseConversationDecision({...decision, brainAssessment: assessment})?.brainAssessment?.status, 'partial');
  const final = applyBrainFinalQualification({classification: 'qualified', fitScore: 99, intentScore: 99, awarenessLevel: 3, journeyStage: 'decision', confidence: .99, summary: 'Busca orientação.', reasons: ['LLM'], nextAction: 'Análise humana.'}, assessment);
  assert.equal(final?.classification, 'insufficient');
  assert.equal(final?.confidence, 0);
  assert.equal(applyBrainFinalQualification(null, assessment), null);
});

test('handoff uses current conversation facts and pending information, without repeating an old summary', () => {
  const snapshot = buildFlipAiHumanHandoffSnapshot({
    leadName: 'Maria', hasPhone: true, hasEmail: false, answers: [],
    qualification: {summary: 'Resumo antigo', reasons: [], nextAction: 'Análise humana'}, stateSummary: null,
    intelligence: null, conversationId: 'conversation', updatedAt: new Date(),
    memory: {version: 'test', facts: [{key: 'atividade', value: 'Trabalha no campo'}], pending: [{key: 'documentacao', value: 'Confirmar documentos disponíveis'}], updatedAt: new Date().toISOString(), sourceMessageId: 'message'},
  });
  assert.match(snapshot.summary, /Trabalha no campo/);
  assert.ok(snapshot.knownFacts.some((fact) => fact.includes('Trabalha no campo')));
  assert.deepEqual(snapshot.pending, ['documentacao: Confirmar documentos disponíveis']);
});


test('the Junqueira example validates all eleven profiles without hardcoding them in the engine', () => {
  const parsed = parseBrainProfiles(readFileSync('docs/flip-ai/junqueira-profiles.example.md', 'utf8'));
  assert.equal(parsed.status, 'valid');
  if (parsed.status === 'valid') assert.equal(parsed.brain.profiles.length, 11);
});

test('decision runtime stores profile scores and combined usage, then replays without provider calls', async () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const delegates: any = prisma.flipAiUsageEvent;
  const index: any = prisma.flipAiKnowledgeIndex;
  const saved = {findUnique: delegates.findUnique, create: delegates.create, updateMany: delegates.updateMany, index: index.findFirst, fetch: globalThis.fetch};
  const envNames = ['FLIP_AI_JEV_ENABLED', 'FLIP_AI_JEV_TENANT_IDS', 'TYPESAFE_API_KEY'];
  const savedEnv = envNames.map((name) => process.env[name]);
  let stored: any = null;
  let calls = 0;
  try {
    process.env.FLIP_AI_JEV_ENABLED = 'true'; process.env.FLIP_AI_JEV_TENANT_IDS = tenantId; process.env.TYPESAFE_API_KEY = 'test';
    delegates.findUnique = async () => stored;
    delegates.create = async (args: any) => { stored = {...args.data, id: 'event'}; return {id: 'event'}; };
    delegates.updateMany = async (args: any) => { stored = {...stored, ...args.data}; return {count: 1}; };
    index.findFirst = async () => ({contentHash: 'hash-v1', sourceRevision: {content: fence(brain)}});
    globalThis.fetch = (async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      const answers: Record<string, unknown> = {};
      if (body.questions.profile) answers.profile = {type: 'choice', choice: 'maternidade', confidence: .9};
      else {
        const choices: Record<string, string> = {intent: 'qualification', objection: 'none', journey_stage: 'decision', next_action: 'ask_one_question', brain_perfil: 'level_4', brain_documentos: 'level_2'};
        for (const [key, question] of Object.entries(body.questions) as Array<[string, any]>) {
          answers[key] = question.type === 'choice' ? {type: 'choice', choice: choices[key], confidence: .9}
            : question.type === 'score' ? {type: 'score', score: 4, confidence: .9} : {type: 'noul', noul: .1};
        }
      }
      return new Response(JSON.stringify({model: 'jev', answers, usage: {input_tokens: 10, output_tokens: 2}}));
    }) as typeof fetch;
    const input = {tenantId, agentId: 'agent', conversationId: 'conversation', chatRequestKey: 'unique-turn', knowledgeIndexId: 'index', state: {latestMessage: 'Preciso de salário maternidade'}};
    const first = await runJevConversationDecision(input);
    assert.equal(first.decision?.brainAssessment?.score, 80);
    assert.equal(stored.inputTokens, 20); assert.equal(stored.outputTokens, 4); assert.equal(stored.units, 2);
    assert.equal(calls, 2);
    const replay = await runJevConversationDecision(input);
    assert.equal(replay.reused, true); assert.equal(replay.decision?.brainAssessment?.score, 80); assert.equal(calls, 2);
    const changedIndex = await runJevConversationDecision({...input, knowledgeIndexId: 'other-index'});
    assert.equal(changedIndex.errorCode, 'JEV_INDEX_BINDING_CONFLICT'); assert.equal(calls, 2);
    stored.tenantId = 'different-tenant';
    const foreign = await runJevConversationDecision(input);
    assert.equal(foreign.errorCode, 'JEV_USAGE_BINDING_CONFLICT'); assert.equal(foreign.decision, null); assert.equal(calls, 2);
  } finally {
    Object.assign(delegates, {findUnique: saved.findUnique, create: saved.create, updateMany: saved.updateMany}); index.findFirst = saved.index; globalThis.fetch = saved.fetch;
    envNames.forEach((name, i) => {if (savedEnv[i] === undefined) delete process.env[name]; else process.env[name] = savedEnv[i];});
  }
});


test('indexing gives each profile its own section without mixing topic chunks', () => {
  const second = {...profile, id: 'voo', label: 'Voo atrasado', description: 'Relata problema com voo', retrievalTerms: ['passagem aérea']};
  const chunks = chunkMasterMarkdown(fence({version: 1, profiles: [profile, second]}));
  const firstChunks = chunks.filter((chunk) => chunk.heading === 'Qualificação — Salário-maternidade');
  const secondChunks = chunks.filter((chunk) => chunk.heading === 'Qualificação — Voo atrasado');
  assert.ok(firstChunks.length > 0 && secondChunks.length > 0);
  assert.ok(firstChunks.every((chunk) => !chunk.content.includes('Voo atrasado')));
  assert.ok(secondChunks.every((chunk) => !chunk.content.includes('Salário-maternidade')));
  assert.ok(chunks.every((chunk) => !chunk.content.includes('```flip-ai-profiles')));
});
