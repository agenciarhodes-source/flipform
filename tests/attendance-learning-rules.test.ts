import assert from 'node:assert/strict';
import test from 'node:test';

import {
  anonymizeText,
  buildLearningSection,
  cleanTopic,
  LEARNING_SECTION,
  parseLearningSuggestions,
  replaceLearningSection,
} from '../lib/flip/learning-rules';

test('dados pessoais saem antes da análise', () => {
  const text = 'Oi Maria Souza, seu CPF 123.456.789-09, fone (86) 99999-1234, email maria@x.com. Mariana não.';
  const clean = anonymizeText(text, ['Maria Souza']);
  assert.ok(!clean.includes('Maria Souza'));
  assert.ok(!clean.includes('123.456'));
  assert.ok(!clean.includes('99999'));
  assert.ok(!clean.includes('maria@x.com'));
  assert.ok(clean.includes('Mariana'), 'outras palavras parecidas continuam');
});

test('lição de atendimento que não deu certo é sempre "o que evitar"', () => {
  const parsed = parseLearningSuggestions({ suggestions: [
    { kind: 'objection', origin: 'human_success', topic: 'Geral', title: 'Medo de golpe', content: 'Explique onde fica o escritório e ofereça chamada de vídeo.', example: null, conversations: 3 },
    { kind: 'phrase', origin: 'human_failure', topic: 'BPC', title: 'Documento cedo demais', content: 'Pedir documentos antes de explicar o benefício afastou clientes.', example: null, conversations: 2 },
    { kind: 'xyz', origin: 'human_success', topic: '', title: 'Ok', content: 'curto', example: null, conversations: 1 },
  ] });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].kind, 'avoid');
  assert.equal(parsed[1].topic, 'BPC');
  assert.equal(cleanTopic(''), 'Geral');
  assert.equal(cleanTopic('geral'), 'Geral');
});

test('a seção é montada da lista aprovada, por tema, com "Faça" e "Evite"', () => {
  const items = [
    { kind: 'triage', topic: 'Salário-maternidade', title: 'Etapa da gestação', content: 'Pergunte se o bebê já nasceu antes de tudo.' },
    { kind: 'phrase', topic: 'Geral', title: 'Acolher primeiro', content: 'Responda a dúvida antes de pedir documentos.' },
    { kind: 'avoid', topic: 'Geral', title: 'Pressa', content: 'Não mande várias perguntas na mesma mensagem.' },
  ];
  const section = buildLearningSection(items);
  assert.ok(section.indexOf('### Geral') < section.indexOf('### Salário-maternidade'));
  assert.ok(section.includes('Faça:') && section.includes('Evite:'));
  assert.equal(buildLearningSection([]), '');
});

test('reconstruir a seção não mexe no resto e remove quando a lista esvazia', () => {
  const base = '# Prompt\n\n## Parte 1\nTexto.\n';
  const one = replaceLearningSection(base, [{ kind: 'phrase', topic: null, title: 'Acolher primeiro', content: 'Responda a dúvida antes de pedir documentos.' }]);
  assert.ok(one.startsWith('# Prompt\n\n## Parte 1\nTexto.'));
  assert.equal(one.split(LEARNING_SECTION).length, 2);
  const two = replaceLearningSection(one, [
    { kind: 'phrase', topic: null, title: 'Acolher primeiro', content: 'Responda a dúvida antes de pedir documentos.' },
    { kind: 'avoid', topic: 'BPC', title: 'Documento cedo', content: 'Não peça documentos antes de explicar o benefício.' },
  ]);
  assert.equal(two.split(LEARNING_SECTION).length, 2, 'a seção não se repete');
  assert.ok(two.includes('Documento cedo'));
  const middle = replaceLearningSection(`${one}\n## Parte 99\nFim.\n`, []);
  assert.ok(!middle.includes(LEARNING_SECTION));
  assert.ok(middle.includes('## Parte 99\nFim.'));
  assert.ok(middle.startsWith('# Prompt\n\n## Parte 1\nTexto.'));
  assert.equal(replaceLearningSection(two, [
    { kind: 'phrase', topic: null, title: 'Acolher primeiro', content: 'Responda a dúvida antes de pedir documentos.' },
    { kind: 'avoid', topic: 'BPC', title: 'Documento cedo', content: 'Não peça documentos antes de explicar o benefício.' },
  ]), two, 'sem mudança, o texto fica idêntico (nenhuma revisão nova)');
});
