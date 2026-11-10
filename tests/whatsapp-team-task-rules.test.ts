import assert from 'node:assert/strict';
import test from 'node:test';

import { extractTeamTask, sanitizeTeamTask, teamTaskContent, teamTaskKey, TEAM_TASK_INSTRUCTION } from '../lib/whatsapp-ai/team-task-rules';

test('a tarefa sai da resposta: o cliente nunca vê a marca', () => {
  const result = extractTeamTask('Recebi, obrigada! Já vou ver isso para você.\n[TAREFA_EQUIPE: Cliente não consegue entrar no gov.br e enviou o acesso. Baixar o extrato do INSS.]');
  assert.equal(result.reply, 'Recebi, obrigada! Já vou ver isso para você.');
  assert.equal(result.task, 'Cliente não consegue entrar no gov.br e enviou o acesso. Baixar o extrato do INSS.');
  assert.deepEqual(extractTeamTask('Só uma resposta normal.'), { reply: 'Só uma resposta normal.', task: null, urgent: false });
});

test('a tarefa nunca leva senha nem número de documento', () => {
  assert.equal(sanitizeTeamTask('Entrar no gov.br, CPF 031.783.882-22 senha: Abc@123'), 'Entrar no gov.br, CPF [número] senha (na conversa)');
});

test('a tarefa tem o link da conversa e o prazo de 1 hora no texto', () => {
  const task = teamTaskContent({ customerName: 'Maria', what: 'Baixar o extrato do INSS.', conversationId: 'c1', leadId: 'l1', appUrl: 'https://app.flipform.com.br' });
  assert.equal(task.title, 'WhatsApp: Maria — Baixar o extrato do INSS.');
  assert.match(task.description, /inbox\?conversationId=c1/);
  assert.match(task.description, /em até 1 hora/);
  assert.match(task.description, /leads\?leadId=l1/);
});

test('o mesmo pedido repetido tem a mesma chave', () => {
  assert.equal(teamTaskKey('Baixar o extrato do INSS!'), teamTaskKey('baixar o extrato do inss'));
  assert.match(TEAM_TASK_INSTRUCTION, /O cliente não vê essa linha/);
});

test('cliente travado (documento, gov.br, não sabe fazer): a tarefa é urgente', () => {
  assert.equal(extractTeamTask('Vamos resolver juntos.\n[TAREFA_EQUIPE: Cliente com dificuldade para acessar o gov.br.]').urgent, true);
  assert.equal(extractTeamTask('Ok!\n[TAREFA_EQUIPE_URGENTE: Ajudar a cliente agora.]').urgent, true);
  assert.equal(extractTeamTask('Ok!\n[TAREFA_EQUIPE: Já é cliente e quer saber do processo.]').urgent, false);
});
