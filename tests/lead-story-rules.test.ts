import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadStory, caseLabel, nextStepOf, type LeadStoryInput } from '../lib/leads/lead-story-rules';

const d = (iso: string) => new Date(iso);
const base: LeadStoryInput = {
  name: 'Maria Silva',
  createdAt: d('2026-11-05T13:00:00Z'),
  source: 'Anúncio Meta — WhatsApp',
  assignedName: 'Rebeca',
  stageName: 'Aguardando Documentação',
  status: 'open',
  channels: [{ channel: 'whatsapp', provider: 'meta', firstAt: d('2026-11-05T12:55:00Z') }],
  documents: { caseName: 'DOCUMENTOS – SALÁRIO-MATERNIDADE URBANO', received: ['RG e CPF da mãe', 'Comprovante de residência'], missing: ['Carteira de trabalho', 'CadÚnico'], problems: [] },
  documentArrivals: [
    { at: d('2026-11-06T14:00:00Z'), label: 'RG e CPF da mãe' },
    { at: d('2026-11-06T14:02:00Z'), label: 'Comprovante de residência' },
  ],
  stageMoves: [{ at: d('2026-11-05T13:10:00Z'), stage: 'Aguardando Documentação', by: null }],
  tasks: [{ at: d('2026-11-06T15:00:00Z'), title: 'Ajudar com o gov.br', done: true }],
  events: [{ at: d('2026-11-07T13:00:00Z'), action: 'whatsapp_ai.reactivation_sent' }],
  lastInbound: { at: d('2026-11-07T15:00:00Z'), text: 'vou mandar amanhã' },
  lastOutboundAt: d('2026-11-07T15:01:00Z'),
};

test('headline: who, case, channel, date, source, owner and stage', () => {
  const story = buildLeadStory(base);
  assert.equal(story.headline, 'Maria Silva, salário-maternidade urbano. Chegou pelo WhatsApp em 05/11 (Anúncio Meta — WhatsApp). Responsável: Rebeca. Etapa: Aguardando Documentação.');
  assert.equal(caseLabel('DOCUMENTOS – DIREITO DO CONSUMIDOR'), 'direito do consumidor');
});

test('timeline: in order, documents of the same day in one line', () => {
  const story = buildLeadStory(base);
  const texts = story.timeline.map((event) => event.text);
  assert.equal(texts[0], 'Primeiro contato pelo WhatsApp');
  assert.ok(texts.includes('Mandou 2 documentos: RG e CPF da mãe, Comprovante de residência'));
  assert.ok(texts.includes('Tarefa: Ajudar com o gov.br (concluída)'));
  assert.ok(texts.includes('Retomada enviada pela IA'));
  assert.equal(story.lastCustomerMessage?.text, 'vou mandar amanhã');
});

test('next step: answer first, then open task, contract, problems, missing documents', () => {
  assert.equal(nextStepOf({ ...base, lastOutboundAt: d('2026-11-07T14:00:00Z') }, false), 'Responder o cliente: a última mensagem é dele.');
  assert.equal(nextStepOf({ ...base, tasks: [{ at: d('2026-11-07T10:00:00Z'), title: 'Ligar para a cliente', done: false }] }, false), 'Concluir a tarefa: Ligar para a cliente.');
  assert.equal(nextStepOf(base, true), 'Aguardar a procuração e o contrato assinados e conferir.');
  assert.equal(nextStepOf(base, false), 'Receber os documentos que faltam: Carteira de trabalho, CadÚnico.');
  assert.equal(nextStepOf({ ...base, documents: { ...base.documents!, missing: [] } }, false), 'Documentação completa: seguir para a procuração e o contrato.');
  assert.equal(nextStepOf({ ...base, status: 'won' }, false), 'Cliente fechado.');
});

test('a lead from a form, without conversation or documents', () => {
  const story = buildLeadStory({ ...base, channels: [], documents: null, documentArrivals: [], stageMoves: [], tasks: [], events: [], lastInbound: null, assignedName: null, source: null });
  assert.equal(story.headline, 'Maria Silva. Chegou pelo formulário em 05/11. Sem responsável. Etapa: Aguardando Documentação.');
  assert.equal(story.nextStep, 'Aguardar a resposta do cliente.');
});
