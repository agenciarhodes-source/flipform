import assert from 'node:assert/strict';
import test from 'node:test';

import { attendantRoleGuidance, parseAttendantRole } from '../lib/flip-ai/attendant-role';
import { buildHumanConversationGuidance } from '../lib/flip-ai/conversation-style';

test('perfil padrão é Closer; só aceita analyst ou closer', () => {
  assert.equal(parseAttendantRole('analyst'), 'analyst');
  assert.equal(parseAttendantRole('closer'), 'closer');
  assert.equal(parseAttendantRole('vendedor'), 'closer');
  assert.equal(parseAttendantRole(null), 'closer');
});

test('Analista só faz a triagem e passa para o time', () => {
  const text = attendantRoleGuidance('analyst').join('\n');
  assert.match(text, /PERFIL DO ATENDENTE: ANALISTA/);
  assert.match(text, /Não peça documentos, provas, agendamentos/);
  assert.match(text, /passar para o time de atendimento/);
  assert.doesNotMatch(text, /Busque o fechamento/);
});

test('Closer conduz o próximo passo e busca o fechamento', () => {
  const text = attendantRoleGuidance('closer').join('\n');
  assert.match(text, /PERFIL DO ATENDENTE: CLOSER/);
  assert.match(text, /peça você mesma o próximo passo/);
  assert.match(text, /Busque o fechamento/);
});

test('a política de conversa usa o perfil escolhido', () => {
  assert.match(buildHumanConversationGuidance('text', 'analyst').join('\n'), /ANALISTA/);
  assert.match(buildHumanConversationGuidance('text').join('\n'), /CLOSER/);
});
