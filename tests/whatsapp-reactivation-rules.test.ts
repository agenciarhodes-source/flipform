import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanReactivationText, reactivationDue, reactivationKey } from '../lib/whatsapp-ai/reactivation-rules';

const now = new Date('2026-10-24T15:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

test('lembra às 23h quando a empresa falou por último e o cliente sumiu', () => {
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(22), leadStatus: 'open' }, now), true);
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(22), leadStatus: null }, now), true);
});

test('não lembra antes de 23h nem depois que a janela de 24h está fechando', () => {
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(20), lastOutboundAt: hoursAgo(19), leadStatus: 'open' }, now), false);
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.95), lastOutboundAt: hoursAgo(22), leadStatus: 'open' }, now), false);
});

test('não lembra quando o cliente falou por último, quando a equipe acabou de escrever ou com negócio fechado', () => {
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(23.5), leadStatus: 'open' }, now), false);
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(1), leadStatus: 'open' }, now), false);
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(22), leadStatus: 'won' }, now), false);
  assert.equal(reactivationDue({ lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(22), leadStatus: 'lost' }, now), false);
});

test('não lembra lead não qualificado nem quem já é cliente', () => {
  const base = { lastInboundAt: hoursAgo(23.1), lastOutboundAt: hoursAgo(22), leadStatus: 'open' };
  assert.equal(reactivationDue({ ...base, leadStageName: 'Não qualificado' }, now), false);
  assert.equal(reactivationDue({ ...base, leadStageName: 'Já é cliente' }, now), false);
  assert.equal(reactivationDue({ ...base, leadStageName: 'Em andamento' }, now), true);
});

test('um lembrete por silêncio e texto limpo para o WhatsApp', () => {
  assert.equal(reactivationKey('c1', hoursAgo(23)), reactivationKey('c1', hoursAgo(23)));
  assert.notEqual(reactivationKey('c1', hoursAgo(23)), reactivationKey('c1', hoursAgo(10)));
  assert.equal(cleanReactivationText('## Oi\n\n\n\n**Maria**, tudo bem?  '), 'Oi\n\n*Maria*, tudo bem?');
  assert.equal(cleanReactivationText('   '), '');
});

test('primeira retomada: depois de 12 horas, em horário comercial, antes da de 23 horas', async () => {
  const { earlyReactivationDue, withinBusinessHours, reactivationInstructions } = await import('../lib/whatsapp-ai/reactivation-rules');
  // Tuesday 15:00 in Brasília = 18:00 UTC.
  const now = new Date('2026-11-10T18:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const base = { leadStatus: 'open', leadStageName: 'Aguardando Documentação' };
  assert.equal(withinBusinessHours(now), true);
  assert.equal(withinBusinessHours(new Date('2026-11-10T23:30:00Z')), false); // 20:30 in Brasília
  assert.equal(withinBusinessHours(new Date('2026-11-15T15:00:00Z')), false); // Sunday
  assert.equal(earlyReactivationDue({ ...base, lastInboundAt: hoursAgo(13), lastOutboundAt: hoursAgo(12.5) }, now), true);
  assert.equal(earlyReactivationDue({ ...base, lastInboundAt: hoursAgo(11), lastOutboundAt: hoursAgo(10.5) }, now), false);
  assert.equal(earlyReactivationDue({ ...base, lastInboundAt: hoursAgo(4), lastOutboundAt: hoursAgo(3.5) }, now), false);
  assert.equal(earlyReactivationDue({ ...base, lastInboundAt: hoursAgo(9), lastOutboundAt: hoursAgo(8.9) }, now), false);
  assert.equal(earlyReactivationDue({ ...base, lastInboundAt: hoursAgo(13), lastOutboundAt: hoursAgo(1) }, now), false);
  assert.equal(earlyReactivationDue({ ...base, lastInboundAt: hoursAgo(21), lastOutboundAt: hoursAgo(20) }, now), false);
  assert.equal(earlyReactivationDue({ ...base, leadStageName: 'Não qualificado', lastInboundAt: hoursAgo(13), lastOutboundAt: hoursAgo(12.5) }, now), false);
  const text = reactivationInstructions({ companyName: 'X', name: 'Ana', kind: 'early', stageName: null, documents: 'faltam: extrato do INSS', moment: { intent: 'objection', objection: 'trust' }, pending: ['enviar RG'] });
  assert.match(text, /Nunca pergunte "ainda tem interesse\?"/);
  assert.match(text, /Podemos dar continuidade\?/);
  assert.match(text, /até 160 caracteres/);
  assert.match(text, /PROIBIDO dizer "vou encaminhar"/);
  assert.match(text, /faltam: extrato do INSS/);
  assert.match(text, /objeção: trust/);
  assert.doesNotMatch(text, /vi que ficou faltando/);
  assert.match(text, /PRAZO COMBINADO/);
  assert.match(text, /NÃO REPITA/);
  assert.match(text, /só se a empresa ainda não disse isso/);
  assert.doesNotMatch(text, /SEMPRE dê o motivo/);
  const { isReactivationSkip, reminderTooSoon } = await import('../lib/whatsapp-ai/reactivation-rules');
  const at = new Date('2026-11-11T16:16:00Z');
  assert.equal(reminderTooSoon(null, at), false);
  assert.equal(reminderTooSoon(new Date('2026-11-11T13:16:00Z'), at), true);
  assert.equal(reminderTooSoon(new Date('2026-11-11T00:00:00Z'), at), true);
  assert.equal(reminderTooSoon(new Date('2026-11-10T16:00:00Z'), at), false);
  assert.equal(isReactivationSkip('PULAR'), true);
  assert.equal(isReactivationSkip('*PULAR*'), true);
  assert.equal(isReactivationSkip('pular.'), true);
  assert.equal(isReactivationSkip('Fernanda, vi que ficou faltando a declaração.'), false);
});
