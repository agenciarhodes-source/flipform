import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { validateConnectorDescriptor, type ConnectorDescriptor, type ConnectorAuthMethod } from './contracts';
import { universalConnectAllowed, type UniversalActor } from './policy';
import { currentVaultKey, sealCredential } from './vault';

/** Only trusted backend session context may supply actor; no routes are exposed in PR-A. */
async function assertOwner(tx: Prisma.TransactionClient, actor: UniversalActor) {
  if (!actor.userId || !universalConnectAllowed(actor.tenantId)) throw new Error('Universal Connect unavailable');
  const membership = await tx.tenantUser.findFirst({
    where: { userId: actor.userId, tenantId: actor.tenantId, role: 'owner', status: 'active',
      tenant: { status: { in: ['active', 'trial'] } } }, select: { userId: true },
  });
  if (!membership) throw new Error('Universal Connect unavailable');
}
const safeSelect = { id: true, providerId: true, authMethod: true, enabled: true, revokedAt: true, createdAt: true, updatedAt: true } as const;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

export async function listConnections(actor: UniversalActor, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await assertOwner(tx, actor);
    return tx.universalConnection.findMany({ where: { tenantId: actor.tenantId, providerId: { not: 'gojus_browser' } }, select: safeSelect, orderBy: { createdAt: 'desc' }, take: 100 });
  }, serializable);
}

/** Descriptor must come from trusted, static server provider catalog (PR-B). */
export async function registerConnection(actor: UniversalActor, descriptor: ConnectorDescriptor, authMethod: ConnectorAuthMethod, db: PrismaClient = prisma) {
  if (!validateConnectorDescriptor(descriptor) || !descriptor.authMethods.includes(authMethod)) throw new Error('Invalid connector');
  return db.$transaction(async tx => {
    await assertOwner(tx, actor);
    const row = await tx.universalConnection.create({ data: {
      tenantId: actor.tenantId, providerId: descriptor.providerId, authMethod, enabled: false,
    }, select: safeSelect });
    await tx.universalConnectionAudit.create({ data: { tenantId: actor.tenantId, connectionId: row.id, actorUserId: actor.userId, action: 'registered' } });
    return row;
  }, serializable);
}

export async function replaceCredential(actor: UniversalActor, connectionId: string, secret: string, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await assertOwner(tx, actor);
    const row = await tx.universalConnection.findFirst({ where: { id: connectionId, tenantId: actor.tenantId, providerId: { not: 'gojus_browser' }, revokedAt: null, enabled: false }, select: { id: true, providerId: true } });
    if (!row) throw new Error('Connection unavailable');
    const envelope = sealCredential(secret, { tenantId: actor.tenantId, connectionId: row.id, providerId: row.providerId }, currentVaultKey());
    const data = { keyId: envelope.keyId, ciphertext: envelope.ciphertext };
    await tx.universalConnectionCredential.upsert({
      where: { tenantId_connectionId: { tenantId: actor.tenantId, connectionId: row.id } },
      create: { tenantId: actor.tenantId, connectionId: row.id, ...data }, update: data,
    });
    await tx.universalConnectionAudit.create({ data: { tenantId: actor.tenantId, connectionId: row.id, actorUserId: actor.userId, action: 'credential.replaced' } });
  }, serializable);
}

/** Local revocation only. Remote provider revocation is PR-B; never claim it here. */
export async function revokeConnection(actor: UniversalActor, connectionId: string, db: PrismaClient = prisma) {
  return db.$transaction(async tx => {
    await assertOwner(tx, actor);
    const result = await tx.universalConnection.updateMany({ where: { tenantId: actor.tenantId, id: connectionId, providerId: { not: 'gojus_browser' }, revokedAt: null }, data: { enabled: false, revokedAt: new Date() } });
    if (result.count !== 1) throw new Error('Connection unavailable');
    await tx.universalConnectionCredential.deleteMany({ where: { tenantId: actor.tenantId, connectionId } });
    await tx.universalConnectionAudit.create({ data: { tenantId: actor.tenantId, connectionId, actorUserId: actor.userId, action: 'revoked.local' } });
  }, serializable);
}

/** Atomic registration of an explicitly tested sandbox credential. The caller must
 * have probed the exact supplied secret using the fixed sandbox adapter first.
 * Still disabled for synchronization; no external writes or activation. */
export async function registerSandboxCredential(actor: UniversalActor, secret: string, db: PrismaClient = prisma) {
  const { ASAAS_SANDBOX } = await import('./catalog');
  const { sandboxAvailable, validCredential } = await import('./sandbox-policy');
  if (!sandboxAvailable(actor.tenantId) || !validCredential(secret)) throw new Error('Sandbox unavailable');
  return db.$transaction(async tx => {
    await assertOwner(tx, actor);
    const count = await tx.universalConnection.count({ where: { tenantId: actor.tenantId, providerId: ASAAS_SANDBOX.providerId, revokedAt: null } });
    if (count >= 3) throw new Error('Sandbox connection limit');
    const row = await tx.universalConnection.create({ data: {
      tenantId: actor.tenantId, providerId: ASAAS_SANDBOX.providerId, authMethod: 'api_key', enabled: false,
    }, select: safeSelect });
    const envelope = sealCredential(secret, { tenantId: actor.tenantId, connectionId: row.id, providerId: row.providerId }, currentVaultKey());
    await tx.universalConnectionCredential.create({ data: { tenantId: actor.tenantId, connectionId: row.id, ...envelope } });
    await tx.universalConnectionAudit.create({ data: { tenantId: actor.tenantId, connectionId: row.id, actorUserId: actor.userId, action: 'sandbox.registered' } });
    return row;
  }, serializable);
}
