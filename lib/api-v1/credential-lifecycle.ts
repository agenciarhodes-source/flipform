import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { digestApiV1Secret } from './identity';
import { apiV1Enabled, isApiV1Scope, type ApiV1Scope } from './policy';
import { mayManageApiV1Credentials } from './prisma-credential-repository';

/**
 * PR01 Phase 3 — server-only service; NOT exposed by an HTTP route.
 * Every actor MUST be derived from an independently authenticated server
 * session by a future handler. Never pass actor identity from JSON/payload.
 * This service is unreachable while the API feature flag is off.
 */
export type ApiV1KeyActor = { userId: string; tenantId: string };
export type ApiV1IssuedKey = {
  credentialId: string;
  bearerToken: string; // one-time return to trusted server caller; NEVER log
  expiresAt: Date;
};

type KeyOptions = { integrationId: string; expiresAt: Date };
type IssueOptions = KeyOptions & { scopes: readonly ApiV1Scope[] };

function validExpiry(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime())
    && value.getTime() > Date.now();
}

function validScopes(value: readonly ApiV1Scope[]): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= 4
    && value.every((scope) => typeof scope === 'string' && isApiV1Scope(scope))
    && new Set(value).size === value.length;
}

function keyMaterial(expiresAt: Date): { secret: Buffer; credentialId: string; result: ApiV1IssuedKey } {
  const secret = randomBytes(32);
  const credentialId = randomUUID();
  return {
    secret,
    credentialId,
    result: {
      credentialId,
      bearerToken: 'ffv1.' + credentialId + '.' + secret.toString('base64url'),
      expiresAt,
    },
  };
}

/** Create only after verified owner permission and active integration. */
export async function issueApiV1Key(
  actor: ApiV1KeyActor, options: IssueOptions, db: PrismaClient = prisma,
): Promise<ApiV1IssuedKey | null> {
  if (!apiV1Enabled(process.env) || !actor.userId || !actor.tenantId
    || !options.integrationId || !validExpiry(options.expiresAt)
    || !validScopes(options.scopes)) return null;
  const generated = keyMaterial(options.expiresAt);
  try {
    return await db.$transaction(async (tx) => {
      if (!await mayManageApiV1Credentials(actor, actor.tenantId, tx)) return null;
      const integration = await tx.apiIntegration.findFirst({
        where: { id: options.integrationId, tenantId: actor.tenantId, status: 'active' },
        select: { id: true },
      });
      if (!integration) return null;
      await tx.apiCredential.create({
        data: {
          id: generated.credentialId, tenantId: actor.tenantId, integrationId: integration.id,
          secretHashHex: digestApiV1Secret(generated.secret),
          scopes: [...options.scopes], expiresAt: options.expiresAt,
        },
      });
      await tx.apiCredentialAudit.create({
        data: {
          tenantId: actor.tenantId, integrationId: integration.id,
          credentialId: generated.credentialId, actorUserId: actor.userId,
          action: 'issued',
        },
      });
      return generated.result;
    });
  } catch {
    // Never return or log DB errors, secret bytes or token text.
    return null;
  } finally {
    generated.secret.fill(0);
  }
}

/** Rotate atomically: revoke exactly one active old key and create replacement. */
export async function rotateApiV1Key(
  actor: ApiV1KeyActor, oldCredentialId: string, options: KeyOptions, db: PrismaClient = prisma,
): Promise<ApiV1IssuedKey | null> {
  if (!apiV1Enabled(process.env) || !actor.userId || !actor.tenantId
    || !oldCredentialId || !options.integrationId || !validExpiry(options.expiresAt)) return null;
  const generated = keyMaterial(options.expiresAt);
  try {
    return await db.$transaction(async (tx) => {
      if (!await mayManageApiV1Credentials(actor, actor.tenantId, tx)) return null;
      const old = await tx.apiCredential.findFirst({
        where: {
          id: oldCredentialId, tenantId: actor.tenantId, integrationId: options.integrationId,
          revokedAt: null,
          integration: { status: 'active' },
        },
        select: { id: true, scopes: true, expiresAt: true },
      });
      if (!old || (old.expiresAt !== null && old.expiresAt <= new Date())
        || !validScopes(old.scopes as ApiV1Scope[])) return null;
      // WHERE prevents parallel rotations from both revoking the same old key.
      const revoked = await tx.apiCredential.updateMany({
        where: {
          id: old.id, tenantId: actor.tenantId, integrationId: options.integrationId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) return null;
      await tx.apiCredential.create({
        data: {
          id: generated.credentialId, tenantId: actor.tenantId,
          integrationId: options.integrationId,
          secretHashHex: digestApiV1Secret(generated.secret),
          scopes: [...old.scopes], expiresAt: options.expiresAt,
        },
      });
      await tx.apiCredentialAudit.createMany({
        data: [
          {
            tenantId: actor.tenantId, integrationId: options.integrationId,
            credentialId: old.id, actorUserId: actor.userId, action: 'rotated_from',
          },
          {
            tenantId: actor.tenantId, integrationId: options.integrationId,
            credentialId: generated.credentialId, actorUserId: actor.userId,
            action: 'rotated_to',
          },
        ],
      });
      return generated.result;
    });
  } catch {
    return null;
  } finally {
    generated.secret.fill(0);
  }
}

/** Revocation is scoped by actor tenant, key id and integration; no hard delete. */
export async function revokeApiV1Key(
  actor: ApiV1KeyActor, credentialId: string, integrationId: string, db: PrismaClient = prisma,
): Promise<boolean> {
  if (!apiV1Enabled(process.env) || !actor.userId || !actor.tenantId
    || !credentialId || !integrationId) return false;
  try {
    return await db.$transaction(async (tx) => {
      if (!await mayManageApiV1Credentials(actor, actor.tenantId, tx)) return false;
      const changed = await tx.apiCredential.updateMany({
        where: { id: credentialId, tenantId: actor.tenantId, integrationId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count !== 1) return false;
      await tx.apiCredentialAudit.create({
        data: {
          tenantId: actor.tenantId, integrationId, credentialId,
          actorUserId: actor.userId, action: 'revoked',
        },
      });
      return true;
    });
  } catch {
    return false;
  }
}
