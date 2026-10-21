import assert from 'node:assert/strict';
import test from 'node:test';

import { anonymizeText, appendLearningSection, LEARNING_SECTION, parseLearningSuggestions } from '../lib/flip/learning-rules';

test('dados pessoais saem antes da análise', () => {
  const text = 'Oi Maria Souza, seu CPF 123.456.789-09, fone (86) 99999-1234, email maria@x.com. Mariana não.';
  const clean = anonymizeText(text, ['Maria Souza']);
  assert.ok(!clean.includes('Maria Souza'));
  assert.ok(!clean.includes('123.456'));
  assert.ok(!clean.includes('99999'));
  assert.ok(!clean.includes('maria@x.com'));
  assert.ok(clean.includes('Mariana'), 'outras palavras parecidas continuam');
});

test('só sugestões completas e de tipo conhecido', () => {
  const parsed = parseLearningSuggestions({ suggestions: [
    { kind: 'objection', title: 'Medo de golpe', content: 'Explique onde fica o escritório e ofereça chamada de vídeo.', example: null, conversations: 3 },
    { kind: 'xyz', title: 'Ok', content: 'curto', example: null, conversations: 1 },
    { kind: 'weird', title: 'Tipo desconhecido vira outra', content: 'Conteúdo suficientemente longo para valer.', example: 'ex', conversations: 0 },
  ] });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].kind, 'other');
  assert.equal(parsed[1].conversations, 1);
});

test('aprendizado aprovado entra numa seção própria, sem mexer no resto', () => {
  const base = '# Prompt\n\n## Parte 1\nTexto.\n';
  const first = appendLearningSection(base, { title: 'Acolher primeiro', content: 'Responda a dúvida antes de pedir documentos.' });
  assert.ok(first.startsWith('# Prompt\n\n## Parte 1\nTexto.'));
  assert.ok(first.includes(LEARNING_SECTION));
  const second = appendLearningSection(first, { title: 'Prazo real', content: 'Cite o prazo de 30 dias do recurso quando houver negativa.' });
  assert.equal(second.split(LEARNING_SECTION).length, 2, 'a seção não se repete');
  assert.ok(second.indexOf('Acolher primeiro') < second.indexOf('Prazo real'));
  const withNext = appendLearningSection(`${first}\n## Parte 99\nFim.\n`, { title: 'No meio', content: 'Entra antes da próxima seção do documento.' });
  assert.ok(withNext.indexOf('No meio') < withNext.indexOf('## Parte 99'));
});
