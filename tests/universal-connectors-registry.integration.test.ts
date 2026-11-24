import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { listConnections, registerConnection, replaceCredential, revokeConnection } from '../lib/universal-connectors/registry';
import type { ConnectorDescriptor } from '../lib/universal-connectors/contracts';

test('Universal Connect PR-A: owner, tenant isolation, vault and local revocation (CI only)', { skip: process.env.CI !== 'true' }, async () => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '5432' || url.pathname !== '/flipform_ci' || url.username !== 'postgres') throw new Error('Disposable CI DB required');
  const db = new PrismaClient();
  const suffix = randomUUID();
  const vars = ['UNIVERSAL_CONNECT_ENABLED', 'UNIVERSAL_CONNECT_PILOT_TENANT_IDS', 'UNIVERSAL_CONNECT_VAULT_KEY', 'UNIVERSAL_CONNECT_VAULT_KEY_ID'] as const;
  const original = vars.map(k => process.env[k]);
  const tenants: string[] = [];
  let userId = '';
  try {
    for (const n of ['a','b']) {
      const tenant = await db.tenant.create({ data: { name: 'Synthetic ' + n, slug: 'uc-' + n + '-' + suffix } });
      tenants.push(tenant.id);
    }
    const u = await db.user.create({ data: { name: 'Synthetic owner', email: suffix + '@example.invalid', passwordHash: 'synthetic' } });
    userId = u.id;
    const [a,b] = tenants;
    await db.tenantUser.create({ data: { tenantId: a, userId, role: 'owner', status: 'active' } });
    await db.tenantUser.create({ data: { tenantId: b, userId, role: 'viewer', status: 'active' } });
    const actor = { tenantId: a, userId }, other = { tenantId: b, userId };
    const descriptor: ConnectorDescriptor = { providerId: 'sample_erp', title: 'Synthetic ERP', version: 1, domains: ['erp'], authMethods: ['api_key'], capabilities: ['read'], allowedHosts: ['api.example.com'] };
    process.env.UNIVERSAL_CONNECT_ENABLED = 'false';
    process.env.UNIVERSAL_CONNECT_PILOT_TENANT_IDS = tenants.join(',');
    await assert.rejects(registerConnection(actor, descriptor, 'api_key', db));
    process.env.UNIVERSAL_CONNECT_ENABLED = 'true';
    process.env.UNIVERSAL_CONNECT_VAULT_KEY = Buffer.alloc(32, 11).toString('base64url');
    process.env.UNIVERSAL_CONNECT_VAULT_KEY_ID = 'synthetic';
    await assert.rejects(registerConnection(other, descriptor, 'api_key', db));
    const row = await registerConnection(actor, descriptor, 'api_key', db);
    assert.equal(row.enabled, false);
    await replaceCredential(actor, row.id, 'synthetic-credential', db);
    const encrypted = await db.universalConnectionCredential.findUniqueOrThrow({ where: { tenantId_connectionId: { tenantId: a, connectionId: row.id } } });
    assert.ok(!encrypted.ciphertext.includes('synthetic-credential'));
    await assert.rejects(db.universalConnectionCredential.create({ data: { tenantId: b, connectionId: row.id, keyId: 'synthetic', ciphertext: 'invalid' } }));
    await assert.rejects(db.universalConnectionAudit.create({ data: { tenantId: b, connectionId: row.id, actorUserId: userId, action: 'invalid' } }));
    await db.tenantUser.updateMany({ where: { tenantId: b, userId }, data: { role: 'owner' } });
    assert.deepEqual(await listConnections(other, db), []);
    await assert.rejects(replaceCredential(other, row.id, 'synthetic', db));
    await assert.rejects(revokeConnection(other, row.id, db));
    assert.equal((await listConnections(actor, db))[0].id, row.id);
    assert.ok(!JSON.stringify(await listConnections(actor, db)).includes('ciphertext'));
    await revokeConnection(actor, row.id, db);
    assert.equal(await db.universalConnectionCredential.count({ where: { tenantId: a, connectionId: row.id } }), 0);
    assert.ok((await listConnections(actor, db))[0].revokedAt);
    await assert.rejects(replaceCredential(actor, row.id, 'synthetic', db));
    assert.deepEqual((await db.universalConnectionAudit.findMany({ where: { tenantId: a, connectionId: row.id }, orderBy: { createdAt: 'asc' } })).map(x => x.action).sort(), ['credential.replaced','registered','revoked.local']);
  } finally {
    for (let i=0; i<vars.length; i++) { const value = original[i]; if (value === undefined) delete process.env[vars[i]]; else process.env[vars[i]] = value; }
    await db.universalConnectionAudit.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.universalConnectionCredential.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.universalConnection.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.tenantUser.deleteMany({ where: { tenantId: { in: tenants } } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    await db.$disconnect();
  }
});
