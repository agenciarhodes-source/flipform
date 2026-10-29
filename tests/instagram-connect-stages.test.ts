import assert from 'node:assert/strict';
import test from 'node:test';

import { instagramConnectStageMessage, isInstagramConnectStage, safeProviderCode } from '../lib/meta/instagram-connect-stages';

test('só etapas conhecidas e códigos numéricos da Meta chegam à tela', () => {
  assert.equal(isInstagramConnectStage('authorization_code_exchange'), true);
  assert.equal(isInstagramConnectStage('<script>'), false);
  assert.equal(isInstagramConnectStage(null), false);
  assert.equal(safeProviderCode(190), '190');
  assert.equal(safeProviderCode('100'), '100');
  assert.equal(safeProviderCode('IGQV-token-aqui'), null);
  assert.equal(safeProviderCode(undefined), null);
});

test('cada etapa diz o que conferir', () => {
  assert.match(instagramConnectStageMessage('authorization_code_exchange', '400'), /App Secret.*\(código da Meta: 400\)|código da Meta: 400.*App Secret/s);
  assert.match(instagramConnectStageMessage('messaging_permission_validation', null), /testadora do app/);
  assert.match(instagramConnectStageMessage('state', null), /Conectar Instagram/);
  assert.match(instagramConnectStageMessage(null, null), /Não foi possível concluir/);
});
