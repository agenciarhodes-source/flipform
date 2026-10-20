import assert from 'node:assert/strict';
import test from 'node:test';

import { checklistStatus, documentSummary, itemKey, parseChecklistItems } from '../lib/whatsapp-ai/document-rules';

test('a lista é escrita um documento por linha, com regra depois de |', () => {
  const items = parseChecklistItems('RG ou CNH\nComprovante de residência | dos últimos 3 meses\n\n  CPF  ');
  assert.deepEqual(items.map((item) => item.key), ['rg_ou_cnh', 'comprovante_de_residencia', 'cpf']);
  assert.equal(items[1].rule, 'dos últimos 3 meses');
  assert.equal(itemKey('Cadastro no CadÚnico'), 'cadastro_no_cadunico');
});

test('uma cópia boa vale mais que uma com problema, e o que falta aparece', () => {
  const items = parseChecklistItems('RG\nCPF\nLaudo médico');
  const status = checklistStatus(items, [
    { itemKey: 'rg', status: 'unreadable' },
    { itemKey: 'rg', status: 'received' },
    { itemKey: 'laudo_medico', status: 'problem' },
  ]);
  assert.deepEqual(status.map((item) => item.status), ['received', 'missing', 'problem']);
  const summary = documentSummary('BPC/LOAS', status);
  assert.match(summary, /recebidos \(1\/3\): RG/);
  assert.match(summary, /com problema, pedir de novo: Laudo médico/);
  assert.match(summary, /faltam: CPF/);
});
