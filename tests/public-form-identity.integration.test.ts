import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { resolvePublicFormIdentity } from '../lib/forms/resolve-public-form-identity';

/**
 * This suite may WRITE ONLY to a disposable PostgreSQL instance belonging to
 * the GitHub CI runner. It must never run against Neon, staging or production.
 */
function assertDisposableDatabase() {
  const raw = process.env.DATABASE_URL || '';
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('PR00 form fixtures require a local CI database'); }
  if (
    process.env.CI !== 'true' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/flipform_ci' ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('PR00 form fixtures require CI=true and disposable localhost/flipform_ci');
  }
}

type Fixture = { tenantId: string; pipelineId: string; formId: string; slug: string };

async function fixture(slug: string, label: string): Promise<Fixture> {
  const suffix = randomUUID();
  const tenant = await prisma.tenant.create({
    data: { slug: 'pr00-form-' + suffix, name: label + ' synthetic tenant', status: 'active' },
  });
  try {
    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId: tenant.id,
        name: label + ' synthetic pipeline',
        stages: { create: [{ name: 'Novo lead', orderIndex: 0 }] },
      },
      include: { stages: true },
    });
    const form = await prisma.form.create({
      data: {
        tenantId: tenant.id,
        pipelineId: pipeline.id,
        initialStageId: pipeline.stages[0].id,
        name: label + ' synthetic form',
        publicTitle: 'Synthetic contact',
        slug,
      },
    });
    return { tenantId: tenant.id, pipelineId: pipeline.id, formId: form.id, slug };
  } catch (error) {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    throw error;
  }
}

async function cleanup(x: Fixture) {
  await prisma.customFormDomain.deleteMany({ where: { tenantId: x.tenantId } });
  await prisma.form.deleteMany({ where: { tenantId: x.tenantId } });
  await prisma.pipeline.deleteMany({ where: { tenantId: x.tenantId } });
  await prisma.tenant.delete({ where: { id: x.tenantId } });
}

test('PR00: same slug across two tenants never selects an arbitrary platform owner', async () => {
  assertDisposableDatabase();
  const slug = 'same-public-slug-' + randomUUID();
  const a = await fixture(slug, 'A');
  let b: Fixture | undefined;
  try {
    // Provisional legacy bridge works with precisely one current candidate.
    assert.deepEqual(
      await resolvePublicFormIdentity('app.flipform.com.br', { slug }),
      { id: a.formId, tenantId: a.tenantId },
    );
    b = await fixture(slug, 'B');
    assert.equal(await resolvePublicFormIdentity('app.flipform.com.br', { slug }), null);
    assert.equal(await resolvePublicFormIdentity('app.flipform.com.br', { slug }), null);
    // Stable canonical ID works even when both tenants publish identical slugs.
    assert.deepEqual(
      await resolvePublicFormIdentity('app.flipform.com.br', { formId: a.formId, slug }),
      { id: a.formId, tenantId: a.tenantId },
    );
    assert.deepEqual(
      await resolvePublicFormIdentity('app.flipform.com.br', { formId: b.formId, slug }),
      { id: b.formId, tenantId: b.tenantId },
    );
    assert.equal(await resolvePublicFormIdentity(null, { formId: a.formId }), null);
    assert.equal(await resolvePublicFormIdentity('unrelated.example.invalid', { formId: a.formId }), null);
  } finally {
    if (b) await cleanup(b);
    await cleanup(a);
  }
});

test('PR00: verified custom domain binds slug and immutable ID to its tenant only', async () => {
  assertDisposableDatabase();
  const slug = 'form-collision-' + randomUUID();
  const a = await fixture(slug, 'A');
  let b: Fixture | undefined;
  try {
    b = await fixture(slug, 'B');
    const host = 'tenant-b-' + randomUUID() + '.example.invalid';
    const domain = await prisma.customFormDomain.create({
      data: {
        tenantId: b.tenantId, domain: host,
        status: 'active', verificationStatus: 'verified', sslStatus: 'active',
      },
    });
    assert.deepEqual(await resolvePublicFormIdentity(host, { slug }), {
      id: b.formId, tenantId: b.tenantId,
    });
    assert.deepEqual(await resolvePublicFormIdentity(host, { formId: b.formId }), {
      id: b.formId, tenantId: b.tenantId,
    });
    assert.equal(await resolvePublicFormIdentity(host, { formId: a.formId }), null);
    await prisma.customFormDomain.update({
      where: { id: domain.id }, data: { sslStatus: 'pending' },
    });
    assert.equal(await resolvePublicFormIdentity(host, { slug }), null);
    assert.equal(await resolvePublicFormIdentity(host, { formId: b.formId }), null);
  } finally {
    if (b) await cleanup(b);
    await cleanup(a);
  }
});

test('PR00: an inactive form does not become a valid canonical or legacy target', async () => {
  assertDisposableDatabase();
  const a = await fixture('inactive-' + randomUUID(), 'Inactive');
  try {
    await prisma.form.update({ where: { id: a.formId }, data: { isActive: false } });
    assert.equal(await resolvePublicFormIdentity('app.flipform.com.br', { formId: a.formId }), null);
    assert.equal(await resolvePublicFormIdentity('app.flipform.com.br', { slug: a.slug }), null);
  } finally {
    await cleanup(a);
  }
});
