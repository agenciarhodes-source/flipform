/**
 * PR00 A2-C.11 — Prisma Client 5.22 integration test on the EPHEMERAL CI DB.
 *
 * Executed ONLY by the smoke CI job, after local Postgres startup.
 * No Neon credentials, network integrations, real data or production schema.
 * Creates two synthetic tables inside a transaction which MUST roll back.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const generated = createRequire(import.meta.url)(
  './fixtures/pr00_a2c11/generated-client'
);
const { PrismaClient } = generated;

const expected = {
  hostname: '127.0.0.1',
  port: '5432',
  db: 'flipform_ci',
  schema: 'public',
};

function guardedURL() {
  if (process.env.CI !== 'true') throw new Error('A2C11 STOP: outside disposable CI');
  const url = new URL(process.env.DATABASE_URL ?? 'invalid');
  if (url.protocol !== 'postgresql:' || url.hostname !== expected.hostname ||
      url.port !== expected.port || url.pathname !== '/' + expected.db ||
      url.searchParams.get('schema') !== expected.schema) {
    throw new Error('A2C11 STOP: refusing a database outside disposable localhost/flipform_ci');
  }
  return url.toString();
}

test('A2-C.11 Prisma Client retains tenantId after partial ON DELETE SET NULL', { timeout: 45000 }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: guardedURL() } } });
  const rollback = new Error('A2C11_ROLLBACK_ALL_SYNTHETIC_DATA_AND_DDL');
  let proof = null;
  try {
    const initial = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    assert.equal(initial[0].db, expected.db);
    const prior = await prisma.$queryRawUnsafe(
      "SELECT to_regclass('public.a2c11_parent') IS NULL AS no_parent, to_regclass('public.a2c11_child') IS NULL AS no_child"
    );
    assert.equal(prior[0].no_parent, true, 'collision with existing parent test table');
    assert.equal(prior[0].no_child, true, 'collision with existing child test table');

    await assert.rejects(
      prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('CREATE TABLE public.a2c11_parent (id text PRIMARY KEY, tenant_id text NOT NULL, UNIQUE (id, tenant_id))');
        await tx.$executeRawUnsafe(
          'CREATE TABLE public.a2c11_child (id text PRIMARY KEY, tenant_id text NOT NULL, parent_id text NULL, ' +
          'CONSTRAINT a2c11_optional_tenant_fk FOREIGN KEY (parent_id,tenant_id) ' +
          'REFERENCES public.a2c11_parent(id,tenant_id) ON DELETE SET NULL (parent_id) ON UPDATE RESTRICT)'
        );
        await tx.a2C11Parent.create({ data: { id: 'a2c11-parent-a', tenantId: 'tenant-a' } });
        await tx.a2C11Parent.create({ data: { id: 'a2c11-parent-b', tenantId: 'tenant-b' } });
        await tx.a2C11Child.create({ data: { id: 'a2c11-child-a', tenantId: 'tenant-a', parentId: 'a2c11-parent-a' } });
        await tx.a2C11Child.create({ data: { id: 'a2c11-child-b', tenantId: 'tenant-b', parentId: 'a2c11-parent-b' } });

        const before = await tx.a2C11Child.findUniqueOrThrow({ where: { id: 'a2c11-child-a' } });
        assert.equal(before.parentId, 'a2c11-parent-a');
        assert.equal(before.tenantId, 'tenant-a');

        await tx.a2C11Parent.delete({ where: { id: 'a2c11-parent-a' } });
        const afterA = await tx.a2C11Child.findUniqueOrThrow({ where: { id: 'a2c11-child-a' } });
        const afterB = await tx.a2C11Child.findUniqueOrThrow({ where: { id: 'a2c11-child-b' } });
        assert.equal(afterA.parentId, null);
        assert.equal(afterA.tenantId, 'tenant-a');
        assert.equal(afterB.parentId, 'a2c11-parent-b');
        assert.equal(afterB.tenantId, 'tenant-b');
        assert.equal((await tx.a2C11Child.count()), 2);
        proof = {
          prismaClient: '5.22.0',
          deletedParent: true,
          childPreserved: true,
          tenantUnchanged: true,
          otherTenantUnaffected: true,
          allChangesRolledBack: true,
        };
        throw rollback; // rollback inserts, deletion, CREATE TABLE and constraints
      }, { timeout: 20000 }),
      err => err === rollback
    );

    assert.ok(proof, 'transaction did not reach the proof stage');
    const verify = await prisma.$queryRawUnsafe(
      "SELECT to_regclass('public.a2c11_parent') IS NULL AS no_parent, to_regclass('public.a2c11_child') IS NULL AS no_child"
    );
    assert.equal(verify[0].no_parent, true, 'parent test table persisted unexpectedly');
    assert.equal(verify[0].no_child, true, 'child test table persisted unexpectedly');
    console.log('A2C11_PRISMA_CLIENT_PROOF=' + JSON.stringify(proof));
  } finally {
    await prisma.$disconnect();
  }
});
