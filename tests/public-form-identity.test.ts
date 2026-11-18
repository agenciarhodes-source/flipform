import assert from 'node:assert/strict';
import test from 'node:test';
import { selectUniquePublicForm } from '../lib/forms/public-form-identity-policy';

const a = { id: 'a-id', tenantId: 'tenant-a', slug: 'maternidade' };
const b = { id: 'b-id', tenantId: 'tenant-b', slug: 'maternidade' };

test('unique scoped form is selected without falling back to another tenant', () => {
  assert.deepEqual(selectUniquePublicForm([a]), a);
  assert.deepEqual(selectUniquePublicForm([b]), b);
});

test('identical slug across tenants fails closed without arbitrary selection', () => {
  assert.equal(selectUniquePublicForm([a, b]), null);
  assert.equal(selectUniquePublicForm([b, a]), null);
});

test('missing and unexpectedly duplicated candidates fail closed', () => {
  assert.equal(selectUniquePublicForm([]), null);
  assert.equal(selectUniquePublicForm([a, a]), null);
});
