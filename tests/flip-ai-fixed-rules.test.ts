import assert from 'node:assert/strict';
import test from 'node:test';

import { extractFixedRules, FIXED_RULES_MAX_CHARS, fixedRulesPrompt } from '../lib/flip-ai/fixed-rules';

test('a seção "Regras fixas do atendimento" é lida inteira, até o próximo título do mesmo nível', () => {
  const file = [
    '# Prompt',
    'intro',
    '## Regras fixas do atendimento (vale em toda resposta)',
    'Missão: pedir os documentos.',
    '### Encerramento',
    'Frase final.',
    '## Parte 1 — Quem você é',
    'fora da seção',
  ].join('\r\n');
  const rules = extractFixedRules(file);
  assert.equal(rules, 'Missão: pedir os documentos.\n### Encerramento\nFrase final.');
  assert.ok(!rules?.includes('fora da seção'));
});

test('sem a seção, ou vazia, não há regras fixas', () => {
  assert.equal(extractFixedRules('# Prompt\n## Parte 1\ntexto'), null);
  assert.equal(extractFixedRules('## Regras fixas do atendimento\n\n## Parte 1\nx'), null);
  assert.equal(extractFixedRules(null), null);
  assert.equal(fixedRulesPrompt(null), '');
});

test('regras longas são cortadas no fim de uma linha, dentro do limite', () => {
  const body = Array.from({ length: 400 }, (_, i) => `- regra ${i} ${'x'.repeat(20)}`).join('\n');
  const rules = extractFixedRules(`## Regras fixas do atendimento\n${body}`);
  assert.ok(rules && rules.length <= FIXED_RULES_MAX_CHARS);
  assert.match(rules!, /x$/);
});

test('o texto entregue à IA diz que as regras prevalecem sobre o roteiro, mas não sobre segurança', () => {
  const prompt = fixedRulesPrompt('Encerrar com a frase X.');
  assert.match(prompt, /^REGRAS FIXAS DA EMPRESA/);
  assert.match(prompt, /prevalecem sobre o roteiro/);
  assert.match(prompt, /não prevalecem sobre segurança/);
  assert.match(prompt, /Encerrar com a frase X\./);
});
