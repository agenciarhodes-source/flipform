import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closingInstruction,
  extractSendDocuments,
  signingInstructions,
  templatesForCase,
} from '../lib/closing-documents/send-rules';

test('marker: taken out of the reply, with who signs', () => {
  const a = extractSendDocuments('Perfeito! Vou te mandar os documentos agora.\n[ENVIAR_DOCUMENTOS: adulto]');
  assert.equal(a.reply, 'Perfeito! Vou te mandar os documentos agora.');
  assert.equal(a.send, 'adult');
  assert.equal(extractSendDocuments('Ok [ENVIAR_DOCUMENTOS: menor]').send, 'minor');
  assert.equal(extractSendDocuments('Ok [ENVIAR DOCUMENTOS: a rogo]').send, 'rogo');
  assert.equal(extractSendDocuments('Ok [ENVIAR_DOCUMENTOS]').send, 'adult');
  assert.deepEqual(extractSendDocuments('Só uma resposta.'), { reply: 'Só uma resposta.', send: null });
});

test('files: the case type own ones, otherwise those for every case', () => {
  const prev = { id: 'prev', checklistIds: ['urbano', 'bpc'] };
  const rural = { id: 'rural', checklistIds: ['rural'] };
  const all = { id: 'all', checklistIds: [] as string[] };
  assert.deepEqual(templatesForCase([prev, rural, all], 'rural').map((t) => t.id), ['rural']);
  assert.deepEqual(templatesForCase([prev, rural, all], 'bpc').map((t) => t.id), ['prev']);
  assert.deepEqual(templatesForCase([prev, rural, all], 'outra').map((t) => t.id), ['all']);
  assert.deepEqual(templatesForCase([prev, rural, all], null).map((t) => t.id), ['all']);
  assert.deepEqual(templatesForCase([prev], 'outra'), []);
});

test('instruction: the company text, already sent or not, who signs and curatela', () => {
  const before = closingInstruction({ sendWhen: 'Quando mandar RG e comprovante.', fileNames: ['PROC. PREV.'], sentAt: null });
  assert.match(before, /Quando mandar RG e comprovante\./);
  assert.match(before, /Ainda NÃO foram enviados/);
  assert.match(before, /curatela/);
  assert.match(before, /idade avançada, sozinha, não muda isso/);
  const after = closingInstruction({ sendWhen: 'x'.repeat(30), fileNames: ['A'], sentAt: new Date('2026-11-10T12:00:00Z') });
  assert.match(after, /JÁ FORAM ENVIADOS/);
  assert.match(after, /TAREFA_EQUIPE: Conferir os documentos assinados/);
});

test('how to sign: gov.br or by hand; the guardian for a minor; a rogo with fingerprint and witnesses', () => {
  const adult = signingInstructions('adult', 1);
  assert.match(adult, /gov\.br/);
  assert.match(adult, /À mão/);
  assert.match(adult, /o documento/);
  const minor = signingInstructions('minor', 2);
  assert.match(minor, /responsável legal/);
  assert.match(minor, /16 ou 17/);
  assert.match(minor, /os documentos/);
  const rogo = signingInstructions('rogo', 1);
  assert.match(rogo, /digital/);
  assert.match(rogo, /2 testemunhas/);
  assert.doesNotMatch(rogo, /gov\.br/);
});
