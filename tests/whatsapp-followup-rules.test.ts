import assert from 'node:assert/strict';
import test from 'node:test';

import { dueFollowupStep, followupCallTask, followupSettingsSchema, followupSkipReason, parseFollowupSteps } from '../lib/whatsapp-ai/followup-rules';

const now = new Date('2026-11-20T15:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const DAYS = [2, 4, 7, 15, 30];

test('o 1º envio sai 2 dias depois da última mensagem do cliente, se a empresa falou por último', () => {
  assert.equal(dueFollowupStep({ lastInboundAt: daysAgo(2.1), lastOutboundAt: daysAgo(2), sentSteps: [], lastSentAt: null }, DAYS, now), 1);
  assert.equal(dueFollowupStep({ lastInboundAt: daysAgo(1.5), lastOutboundAt: daysAgo(1.4), sentSteps: [], lastSentAt: null }, DAYS, now), null);
  // The customer spoke last: the AI answers, no template.
  assert.equal(dueFollowupStep({ lastInboundAt: daysAgo(3), lastOutboundAt: daysAgo(4), sentSteps: [], lastSentAt: null }, DAYS, now), null);
});

test('silêncio antigo: um envio por dia, nunca todos de uma vez', () => {
  const base = { lastInboundAt: daysAgo(20), lastOutboundAt: daysAgo(19) };
  assert.equal(dueFollowupStep({ ...base, sentSteps: [], lastSentAt: null }, DAYS, now), 1);
  assert.equal(dueFollowupStep({ ...base, sentSteps: [1], lastSentAt: daysAgo(0.2) }, DAYS, now), null);
  assert.equal(dueFollowupStep({ ...base, sentSteps: [1], lastSentAt: daysAgo(1) }, DAYS, now), 2);
  assert.equal(dueFollowupStep({ ...base, sentSteps: [1, 2, 3, 4], lastSentAt: daysAgo(1) }, DAYS, now), null);
  assert.equal(dueFollowupStep({ lastInboundAt: daysAgo(31), lastOutboundAt: daysAgo(30), sentSteps: [1, 2, 3, 4], lastSentAt: daysAgo(2) }, DAYS, now), 5);
  assert.equal(dueFollowupStep({ lastInboundAt: daysAgo(40), lastOutboundAt: daysAgo(30), sentSteps: [1, 2, 3, 4, 5], lastSentAt: daysAgo(2) }, DAYS, now), null);
});

test('alguém da empresa escreveu há pouco: o 1º envio espera', () => {
  assert.equal(dueFollowupStep({ lastInboundAt: daysAgo(3), lastOutboundAt: new Date(now.getTime() - 5 * 3_600_000), sentSteps: [], lastSentAt: null }, DAYS, now), null);
});

test('quem nunca recebe: pediu para sair, fechado, não qualificado, resolvido, assumido', () => {
  const ok = { optedOut: false, leadStatus: 'open', outcomeStage: false, conversationResolved: false, pauseReason: null };
  assert.equal(followupSkipReason(ok), null);
  assert.equal(followupSkipReason({ ...ok, optedOut: true }), 'opted_out');
  assert.equal(followupSkipReason({ ...ok, leadStatus: 'won' }), 'closed_lead');
  assert.equal(followupSkipReason({ ...ok, outcomeStage: true }), 'outcome_stage');
  assert.equal(followupSkipReason({ ...ok, conversationResolved: true }), 'resolved');
  assert.equal(followupSkipReason({ ...ok, pauseReason: 'manual' }), 'team_took_over');
  // A person answered by phone earlier: the sequence still runs.
  assert.equal(followupSkipReason({ ...ok, pauseReason: 'human_reply_phone' }), null);
});

test('configuração: dias crescentes, ligação depois de um envio existente', () => {
  const steps = [{ days: 2, template: 'retomada_1:pt_BR' }, { days: 4, template: 'retomada_2:pt_BR' }];
  assert.equal(followupSettingsSchema.safeParse({ enabled: true, steps, callAfterStep: 2 }).success, true);
  assert.equal(followupSettingsSchema.safeParse({ enabled: true, steps: [steps[1], steps[0]], callAfterStep: 1 }).success, false);
  assert.equal(followupSettingsSchema.safeParse({ enabled: true, steps, callAfterStep: 3 }).success, false);
  assert.equal(followupSettingsSchema.safeParse({ enabled: true, steps: [], callAfterStep: 0 }).success, false);
  assert.deepEqual(parseFollowupSteps([{ days: 2, template: 'a:pt_BR' }, { days: 1, template: 'b:pt_BR' }, 'x']), [{ days: 2, template: 'a:pt_BR' }]);
});

test('a tarefa de ligação explica o caso e tem os links', () => {
  const task = followupCallTask({ customerName: 'Maria', stageName: 'Aguardando Documentação', daysSilent: 4, stepsSent: 2, conversationId: 'c1', leadId: 'l1', appUrl: 'https://app.flipform.com.br' });
  assert.equal(task.title, 'Ligar para Maria: sem resposta há 4 dias');
  assert.match(task.description, /2 mensagens de retomada/);
  assert.match(task.description, /Aguardando Documentação/);
  assert.match(task.description, /inbox\?conversationId=c1/);
});
