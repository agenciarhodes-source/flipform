import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled } from './policy';

/**
 * PR01 Phase 5: server-only HMAC validation and durable nonce claims.
 * The trusted tenant/integration scope and signing key MUST come from a future
 * authenticated backend/KMS lookup, NEVER from a caller-supplied JSON object.
 * There is NO HTTP handler, credential provisioning, delivery, or real webhook.
 */
export type TrustedWebhookScope = { tenantId: string; integrationId: string };
export type SignedDiagnosticWebhook = {
  scope: TrustedWebhookScope;
  /** Raw signed octets, before parsing, size <= 64 KiB. */
  rawBody: Buffer;
  unixSeconds: string;
  nonce: string;
  signature: string;
};

export type WebhookClaimResult =
  | { status: 'accepted' }
  | { status: 'replay_rejected' | 'denied' | 'unavailable' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP = /^[1-9][0-9]{9}$/;
const NONCE = /^[A-Za-z0-9_-]{16,96}$/;
const SIGNATURE = /^v1=([a-f0-9]{64})$/;
const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_BODY_BYTES = 65_536;

function isValidSigningInput(
  args: SignedDiagnosticWebhook, secret: Buffer, now: Date,
): boolean {
  if (!args || !args.scope || !Buffer.isBuffer(secret)
    || secret.length < 32 || secret.length > 128
    || !Buffer.isBuffer(args.rawBody) || args.rawBody.length > MAX_BODY_BYTES
    || !UUID.test(args.scope.tenantId) || !UUID.test(args.scope.integrationId)
    || !TIMESTAMP.test(args.unixSeconds) || !NONCE.test(args.nonce)
    || !Number.isFinite(now.getTime())) return false;
  const stamp = Number(args.unixSeconds);
  return Number.isSafeInteger(stamp)
    && Math.abs(Math.floor(now.getTime() / 1000) - stamp) <= MAX_CLOCK_SKEW_SECONDS;
}

function bodyDigest(raw: Buffer): string {
  return createHash('sha256').update(raw).digest('hex');
}

function signedMessage(args: SignedDiagnosticWebhook): string {
  // All fields are encoded unambiguously. Scope binds the signature to the
  // trusted tenant/integration and prohibits cross-tenant replay.
  return [
    'flipform-webhook-v1', args.scope.tenantId, args.scope.integrationId,
    args.unixSeconds, args.nonce, bodyDigest(args.rawBody),
  ].join('\n');
}

/** Used only by synthetic CI fixtures until a server-side signing service is approved. */
export function computeApiV1WebhookSignature(
  args: SignedDiagnosticWebhook, secret: Buffer,
): string | null {
  if (!args || !args.scope || !Buffer.isBuffer(args.rawBody)
    || !UUID.test(args.scope.tenantId) || !UUID.test(args.scope.integrationId)
    || !TIMESTAMP.test(args.unixSeconds) || !NONCE.test(args.nonce)
    || args.rawBody.length > MAX_BODY_BYTES
    || !Buffer.isBuffer(secret) || secret.length < 32 || secret.length > 128) return null;
  return 'v1=' + createHmac('sha256', secret).update(signedMessage(args)).digest('hex');
}

/** Validates exact raw body, timestamp skew, tenant scope and constant-time HMAC. */
export function verifyApiV1WebhookSignature(
  args: SignedDiagnosticWebhook, secret: Buffer, now: Date = new Date(),
): boolean {
  if (!isValidSigningInput(args, secret, now) || !SIGNATURE.test(args.signature)) return false;
  const expected = computeApiV1WebhookSignature(args, secret);
  if (!expected) return false;
  return timingSafeEqual(
    Buffer.from(expected.slice(3), 'hex'),
    Buffer.from(args.signature.slice(3), 'hex'),
  );
}

function isDiagnosticOnly(rawBody: Buffer): boolean {
  // The Phase 5 service stores only digests; even signed customer payloads
  // are refused until a separate retention/consent authorization exists.
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return false;
    const value = parsed as Record<string, unknown>;
    return Object.keys(value).length === 1 && value.kind === 'diagnostic.ping';
  } catch {
    return false;
  }
}

/**
 * Transactional replay claim; no business effects or event delivery.
 * A duplicate nonce is rejected even when the body is identical.
 */
export async function claimSignedDiagnosticWebhook(
  args: SignedDiagnosticWebhook,
  trustedSecret: Buffer,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<WebhookClaimResult> {
  if (!apiV1Enabled(process.env)
    || !verifyApiV1WebhookSignature(args, trustedSecret, now)
    || !isDiagnosticOnly(args.rawBody)) return { status: 'denied' };
  const { tenantId, integrationId } = args.scope;
  // Don't save the raw signature, signing key, nonce or request body.
  const nonceHash = createHash('sha256').update(
    JSON.stringify([tenantId, integrationId, args.nonce]),
  ).digest('hex');
  const bodyHash = bodyDigest(args.rawBody);
  try {
    return await db.$transaction(async (tx) => {
      const integration = await tx.apiIntegration.findFirst({
        where: { id: integrationId, tenantId, status: 'active' },
        select: { id: true },
      });
      if (!integration) return { status: 'denied' } as const;
      await tx.apiV1WebhookReplay.create({
        data: {
          tenantId, integrationId, nonceHash, bodyHash,
          expiresAt: new Date(now.getTime() + MAX_CLOCK_SKEW_SECONDS * 1000),
        },
      });
      return { status: 'accepted' } as const;
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { status: 'replay_rejected' };
    return { status: 'unavailable' };
  }
}
