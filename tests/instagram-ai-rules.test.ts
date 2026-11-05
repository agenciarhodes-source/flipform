import assert from 'node:assert/strict';
import test from 'node:test';

import { instagramAiMayAnswer, normalizeInstagramUsername } from '../lib/instagram-ai/rules';

test('o @ do Instagram é normalizado e o que não pode ser @ é recusado', () => {
  assert.equal(normalizeInstagramUsername('@Maria.Silva '), 'maria.silva');
  assert.equal(normalizeInstagramUsername('junqueira_adv'), 'junqueira_adv');
  for (const value of ['', '@', 'maria silva', 'maria#1', 'a'.repeat(31), null, undefined]) {
    assert.equal(normalizeInstagramUsername(value), null, String(value));
  }
});

const base = { enabled: true, agentId: 'agent-1', liveEnabled: false, testUsernames: ['maria.silva'] };

test('desligada ou sem atendente, a IA não responde', () => {
  assert.deepEqual(instagramAiMayAnswer({ ...base, enabled: false, senderUsername: 'maria.silva' }), { answer: false, reason: 'disabled' });
  assert.deepEqual(instagramAiMayAnswer({ ...base, agentId: null, senderUsername: 'maria.silva' }), { answer: false, reason: 'no_agent' });
});

test('em teste, só os perfis de teste recebem resposta', () => {
  assert.deepEqual(instagramAiMayAnswer({ ...base, senderUsername: '@Maria.Silva' }), { answer: true });
  assert.deepEqual(instagramAiMayAnswer({ ...base, senderUsername: 'outra.pessoa' }), { answer: false, reason: 'not_a_test_profile' });
  assert.deepEqual(instagramAiMayAnswer({ ...base, senderUsername: null }), { answer: false, reason: 'not_a_test_profile' });
});

test('liberada para todos, responde qualquer pessoa', () => {
  assert.deepEqual(instagramAiMayAnswer({ ...base, liveEnabled: true, senderUsername: null }), { answer: true });
});

import { instagramInstructions, INSTAGRAM_TEXT_LIMIT, toInstagramText } from '../lib/instagram-ai/rules';

test('o Direct recebe texto simples, sem formatação e dentro do limite', () => {
  assert.equal(toInstagramText('**Olá!** Veja o *link*: [WhatsApp](https://wa.me/5586999999999)'), 'Olá! Veja o link: WhatsApp: https://wa.me/5586999999999');
  assert.equal(toInstagramText('## Título\nTexto'), 'Título\nTexto');
  const long = `${'Frase curta e completa. '.repeat(60)}`;
  const cut = toInstagramText(long);
  assert.ok(cut.length <= INSTAGRAM_TEXT_LIMIT);
  assert.ok(cut.endsWith('.'));
});

test('as instruções do canal focam em entender e responder, sem pedir dados nem inventar links', () => {
  const text = instagramInstructions({ companyName: 'Empresa X', introduction: 'assistente da Empresa X', firstReply: true, firstName: null });
  assert.match(text, /entender o que a pessoa busca/);
  assert.match(text, /Nunca invente links, telefones ou endereços/);
  assert.match(text, /Não peça telefone, CPF, documentos/);
  assert.match(text, /primeira resposta/);
  assert.match(text, /Não use nenhum nome/);
  const later = instagramInstructions({ companyName: 'Empresa X', introduction: 'assistente', firstReply: false, firstName: 'Ana' });
  assert.match(later, /Não se apresente de novo/);
  assert.match(later, /"Ana"/);
  // Nothing specific to one business in the global instructions.
  for (const word of ['advogado', 'escritório', 'INSS', 'benefício']) assert.equal(text.includes(word), false, word);
});

test('Reels, publicação e menção em story compartilhados no Direct são reconhecidos', async () => {
  const { instagramShareKind, instagramShareLabel, instagramShareNote, instagramShareTitle } = await import('../lib/instagram-ai/share-rules');
  assert.equal(instagramShareKind('ig_reel'), 'reel');
  assert.equal(instagramShareKind('reel'), 'reel');
  assert.equal(instagramShareKind('share'), 'post');
  assert.equal(instagramShareKind('story_mention'), 'story_mention');
  for (const value of ['image', 'video', 'text', 'unknown', null, 42]) assert.equal(instagramShareKind(value), null, String(value));
  assert.equal(instagramShareTitle('  Salário   maternidade \n rural  '), 'Salário maternidade rural');
  assert.equal(instagramShareTitle('x'.repeat(300))?.length, 200);
  assert.equal(instagramShareTitle(''), null);
  assert.equal(instagramShareLabel('reel'), 'Compartilhou um Reels');
  assert.equal(instagramShareLabel('reel', 'Mães têm direito'), 'Compartilhou um Reels: “Mães têm direito”');
  const note = instagramShareNote('reel', 'Mães têm direito');
  assert.match(note, /Reels/);
  assert.match(note, /Mães têm direito/);
  assert.match(note, /Não finja que viu/);
  assert.match(instagramShareNote('story_mention'), /story/);
});

test('marcação em story ou mensagem vazia do Instagram recebe só o agradecimento', async () => {
  const { INSTAGRAM_TAG_THANKS, instagramIsThankOnly, instagramOtherLabel } = await import('../lib/instagram-ai/share-rules');
  const empty = { type: 'unknown', text: null, metadata: { providerType: 'unknown', attachmentTypes: [], instagramProfessionalAccountId: '1' } };
  const mention = { type: 'unknown', text: null, metadata: { providerType: 'story_mention', attachmentTypes: ['story_mention'] } };
  assert.equal(instagramIsThankOnly(empty), true);
  assert.equal(instagramIsThankOnly(mention), true);
  for (const other of [
    { type: 'text', text: 'oi', metadata: { providerType: 'text' } },
    { type: 'image', text: null, metadata: { providerType: 'image', attachmentTypes: ['image'] } },
    { type: 'unknown', text: null, metadata: { providerType: 'ig_reel', attachmentTypes: ['ig_reel'] } },
    { type: 'unknown', text: null, metadata: { providerType: 'ephemeral', attachmentTypes: ['ephemeral'] } },
  ]) assert.equal(instagramIsThankOnly(other), false, JSON.stringify(other.metadata));
  assert.doesNotMatch(INSTAGRAM_TAG_THANKS, /\?/);
  assert.match(instagramOtherLabel(empty) || '', /marcação/i);
  assert.match(instagramOtherLabel({ type: 'unknown', text: null, metadata: { providerType: 'ephemeral' } }) || '', /visualização única/);
  assert.match(instagramOtherLabel({ type: 'unknown', text: null, metadata: { providerType: 'template' } }) || '', /loja/);
});

test('assunto fora da empresa: a IA devolve [SEM_RESPOSTA] e nada é enviado', async () => {
  const { instagramWantsNoReply } = await import('../lib/instagram-ai/share-rules');
  const { instagramInstructions } = await import('../lib/instagram-ai/rules');
  assert.equal(instagramWantsNoReply('[SEM_RESPOSTA]'), true);
  assert.equal(instagramWantsNoReply(' [sem_resposta] '), true);
  assert.equal(instagramWantsNoReply('Olá! Como podemos ajudar?'), false);
  const text = instagramInstructions({ companyName: 'Junqueira Advogados', introduction: 'assistente', firstReply: false, firstName: null });
  assert.match(text, /SÓ ASSUNTOS DA EMPRESA/);
  assert.match(text, /bingo/);
  assert.match(text, /\[SEM_RESPOSTA\]/);
  assert.match(text, /Cumprimentos e pedidos vagos/);
});
