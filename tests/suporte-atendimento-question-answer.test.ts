import test from 'node:test';
import assert from 'node:assert/strict';
import { findSupportAnswers } from '../lib/suporte-atendimento/question-answer';

const md = '# Suporte\n## BPC pessoa idosa\nNão exige carteira assinada nem contribuições.\n\n## Salário-maternidade rural\nA segurada especial pode comprovar atividade rural por documentos familiares.\n';
test('recupera trecho sem gerar conteúdo', () => {
  const found = findSupportAnswers('salario maternidade rural documentos', md);
  assert.ok(found.length);
  assert.match(found[0].title, /maternidade/);
  assert.match(found[0].excerpt, /documentos familiares/);
});
test('nunca inventa resposta fora da base', () => {
  assert.deepEqual(findSupportAnswers('escavação submarina', md), []);
});
test('não aceita pergunta longa ou sem conteúdo', () => {
  assert.deepEqual(findSupportAnswers('a'.repeat(1001), md), []);
  assert.deepEqual(findSupportAnswers('de e da', md), []);
});
