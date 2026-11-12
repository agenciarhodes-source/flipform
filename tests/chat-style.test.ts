import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_STYLE_RULE, cleanChatStyle, replyLengthRule, splitIntoBubbles } from '../lib/flip-ai/chat-style';
import { TEAM_VOICE_RULE } from '../lib/flip-ai/team-voice';

test('style rule: no confirming the obvious, no repeating, no machine marks', () => {
  for (const phrase of ['recebi o seu documento', 'entendi o que você disse', 'acabei de ver', 'consegui visualizar']) {
    assert.ok(CHAT_STYLE_RULE.includes(phrase), phrase);
  }
  assert.match(CHAT_STYLE_RULE, /ponto e vírgula, travessão/);
  assert.match(TEAM_VOICE_RULE, /no máximo uma vez a cada várias mensagens/);
  assert.match(TEAM_VOICE_RULE, /PROIBIDO dizer "vou encaminhar"/);
});

test('length follows the customer and the moment read by JEV', () => {
  assert.match(replyLengthRule({ customerText: 'ok' }), /1 frase/);
  assert.match(replyLengthRule({ customerText: 'x'.repeat(80), journeyStage: 'post_sale' }), /pós-venda/);
  assert.match(replyLengthRule({ customerText: 'x'.repeat(80), journeyStage: 'discovery' }), /Uma pergunta curta/);
  assert.match(replyLengthRule({ customerText: 'x'.repeat(80), journeyStage: 'decision' }), /280/);
});

test('machine marks are taken out without changing the words', () => {
  assert.equal(cleanChatStyle('Ana, isso não define sozinho — nosso time analisa; teve dificuldade?'), 'Ana, isso não define sozinho, nosso time analisa. Teve dificuldade?');
  assert.equal(cleanChatStyle('Valor de 1.234,56 e site gov.br'), 'Valor de 1.234,56 e site gov.br');
});

test('a long reply becomes two messages at a blank line; short ones stay whole', () => {
  assert.deepEqual(splitIntoBubbles('Oi! Tudo certo.'), ['Oi! Tudo certo.']);
  const first = 'a'.repeat(200);
  const second = 'b'.repeat(200);
  assert.deepEqual(splitIntoBubbles(`${first}\n\n${second}`), [first, second]);
  assert.deepEqual(splitIntoBubbles('c'.repeat(400)), ['c'.repeat(400)]);
});
