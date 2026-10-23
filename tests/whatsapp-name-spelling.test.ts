import assert from 'node:assert/strict';
import test from 'node:test';

import {
  alignNameSpelling,
  alignTranscriptNames,
  knownFirstNames,
  matchKnownName,
  transcriptionHint,
} from '../lib/whatsapp-ai/name-spelling';

test('o nome conhecido vem do perfil e do cadastro, sem repetir', () => {
  assert.deepEqual(knownFirstNames(['Eunice', 'EUNICE SOUZA', null, 'Jo']), ['Eunice']);
  assert.deepEqual(knownFirstNames(['Beatriz E Francisco 💍', 'LUIZA BEATRIZ']), ['Beatriz', 'Luiza']);
});

test('um erro de transcrição volta para a grafia conhecida', () => {
  assert.equal(matchKnownName('Eunício', ['Eunice']), 'Eunice');
  assert.equal(alignNameSpelling('Eunício', ['Eunice']), 'Eunice');
  assert.equal(alignTranscriptNames('Sim, pode me chamar de Eunício.', ['Eunice']), 'Sim, pode me chamar de Eunice.');
});

test('outro nome ou outra palavra não é trocado', () => {
  assert.equal(matchKnownName('Paula', ['Paulo']), null);
  assert.equal(matchKnownName('Fernanda', ['Fernando']), null);
  assert.equal(matchKnownName('Mariana', ['Maria']), null);
  assert.equal(matchKnownName('Joana', ['João']), null);
  assert.equal(alignNameSpelling('Bia', ['Beatriz']), 'Bia');
  assert.equal(alignTranscriptNames('Estava esperando o retorno.', ['Estela']), 'Estava esperando o retorno.');
  assert.equal(alignTranscriptNames('Eunice', []), 'Eunice');
});

test('a transcrição recebe o nome do cliente como dica', () => {
  assert.equal(transcriptionHint(['Eunice']), 'Mensagem de voz no WhatsApp. Nome do cliente: Eunice.');
  assert.equal(transcriptionHint([]), '');
});
