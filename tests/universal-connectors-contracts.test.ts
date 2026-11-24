import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  canUseConnectorCapability, connectorAuditFields, validateConnectorDescriptor,
  type ConnectorDescriptor,
} from '../lib/universal-connectors/contracts';

const descriptor: ConnectorDescriptor = {
  providerId: 'sample_erp', title: 'ERP de exemplo', version: 1,
  domains: ['erp', 'orders'], authMethods: ['oauth2'],
  capabilities: ['discover', 'read', 'incremental_sync', 'write'],
  allowedHosts: ['api.example.com'],
};

test('validates pinned provider descriptor, denying local/private targets and duplicates', () => {
  assert.equal(validateConnectorDescriptor(descriptor), true);
  assert.equal(validateConnectorDescriptor({ ...descriptor, allowedHosts: ['localhost'] }), false);
  assert.equal(validateConnectorDescriptor({ ...descriptor, allowedHosts: ['127.0.0.1'] }), false);
  assert.equal(validateConnectorDescriptor({ ...descriptor, allowedHosts: ['api.example.com', 'api.example.com'] }), false);
  assert.equal(validateConnectorDescriptor({ ...descriptor, providerId: '../../unsafe' }), false);
});
test('fail-closed: no production activation or third-party write by contract', () => {
  assert.equal(canUseConnectorCapability(descriptor, 'read', false), false);
  assert.equal(canUseConnectorCapability(descriptor, 'read', true), true);
  assert.equal(canUseConnectorCapability(descriptor, 'write', true), false);
});
test('audit context excludes secrets and arbitrary raw provider records', () => {
  const audit = connectorAuditFields({
    tenantId: 'tenant', connectionId: 'conn', actorUserId: 'owner', permission: 'owner',
  }, 'sample_erp', 'connection.test');
  assert.deepEqual(Object.keys(audit), ['tenantId', 'connectionId', 'actorUserId', 'providerId', 'action']);
});
