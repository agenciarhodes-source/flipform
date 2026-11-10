import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handoffRecipients, handoffTask, INSTAGRAM_HANDOFF_INSTRUCTION, INSTAGRAM_HANDOFF_REPLY, instagramWantsTeam, withoutTeamMarker,
} from '../lib/instagram-ai/handoff-rules';

test('a IA chama a equipe só com a marca, e a marca nunca vai para o cliente', () => {
  assert.equal(instagramWantsTeam('Entendo. Já avisei a equipe. [CHAMAR_EQUIPE]'), true);
  assert.equal(instagramWantsTeam('Posso ajudar em algo mais?'), false);
  assert.equal(withoutTeamMarker('Entendo. Já avisei a equipe.\n[CHAMAR_EQUIPE]'), 'Entendo. Já avisei a equipe.');
  assert.equal(withoutTeamMarker('[chamar equipe]'), '');
  assert.match(INSTAGRAM_HANDOFF_REPLY, /nosso time já está cuidando disso/);
  assert.doesNotMatch(INSTAGRAM_HANDOFF_REPLY, /atendente|uma pessoa/);
  assert.match(INSTAGRAM_HANDOFF_INSTRUCTION, /Nunca diga que o nosso time está cuidando sem escrever/);
});

test('quem recebe: o atendente da conversa; senão os gestores; senão os proprietários', () => {
  const members = [
    { userId: 'o1', role: 'owner', active: true },
    { userId: 'm1', role: 'manager', active: true },
    { userId: 'm2', role: 'manager', active: false },
    { userId: 'a1', role: 'agent', active: true },
  ];
  assert.deepEqual(handoffRecipients({ conversationAssignee: 'a1', members }), ['a1']);
  assert.deepEqual(handoffRecipients({ conversationAssignee: null, members }), ['m1']);
  assert.deepEqual(handoffRecipients({ conversationAssignee: null, members: members.filter((m) => m.role !== 'manager') }), ['o1']);
  // An attendant who left does not get it.
  assert.deepEqual(handoffRecipients({ conversationAssignee: 'gone', members }), ['m1']);
});

test('a tarefa tem o link da conversa e não mostra o CPF', () => {
  const task = handoffTask({
    contactLabel: '@cliente',
    lastMessages: ['031.783.882-22', 'Preciso falar com o advogado'],
    conversationId: 'c1',
    appUrl: 'https://app.flipform.com.br/',
  });
  assert.equal(task.title, 'Instagram: @cliente precisa de atendimento da equipe');
  assert.match(task.description, /https:\/\/app\.flipform\.com\.br\/inbox\?conversationId=c1/);
  assert.doesNotMatch(task.description, /031\.783/);
  assert.match(task.description, /\[documento\]/);
});
