import 'server-only';

import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setSessionCookie, type SessionPayload } from '@/lib/auth';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { consumeRecoveryCode, verifyTotp } from './totp';

/**
 * Two-step verification at sign-in (security protocol S5). After the password, a person with the
 * verification on gets a short-lived ticket instead of the session; the session only starts when
 * the 6-digit code (or a recovery code) is confirmed.
 */

const CHALLENGE_TTL = '5m';

function challengeSecret() {
  const secret = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT secret');
  return secret;
}

type Challenge = { purpose: 'mfa'; session: SessionPayload; response: Record<string, unknown> };

export function signMfaChallenge(session: SessionPayload, response: Record<string, unknown>) {
  return jwt.sign({ purpose: 'mfa', session, response } satisfies Challenge, challengeSecret(), { expiresIn: CHALLENGE_TTL });
}

export function readMfaChallenge(token: string): Challenge | null {
  const secrets = [process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      const value = jwt.verify(token, secret) as Challenge;
      if (value?.purpose === 'mfa' && value.session?.userId) return value;
    } catch {
      // try the next secret
    }
  }
  return null;
}

/**
 * Starts the session, or, when the person has the two-step verification on, answers with the
 * ticket for the code screen. `response` is what the sign-in answers once the code is confirmed.
 */
export async function startSessionOrMfa(session: SessionPayload, response: Record<string, unknown>) {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { mfaEnabledAt: true } });
  if (user?.mfaEnabledAt) {
    return NextResponse.json({ ok: true, mfaRequired: true, mfaToken: signMfaChallenge(session, response) });
  }
  await setSessionCookie(session);
  return null;
}

/** For flows that set a password and sign in (onboarding): with the verification on, no session. */
export async function setSessionCookieUnlessMfa(session: SessionPayload) {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { mfaEnabledAt: true } });
  if (user?.mfaEnabledAt) return false;
  await setSessionCookie(session);
  return true;
}

/**
 * Checks a 6-digit code or a recovery code for a user with the verification on, and records it
 * (a code is accepted once; a recovery code is spent). True when valid.
 */
export async function confirmUserMfaCode(userId: string, code: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecretEncrypted: true, mfaEnabledAt: true, mfaLastCounter: true, mfaRecoveryHashes: true },
  });
  if (!user?.mfaEnabledAt || !user.mfaSecretEncrypted) return false;
  const secret = decryptIntegrationSecret(user.mfaSecretEncrypted);
  if (!secret) return false;
  const counter = verifyTotp(secret, code, now.getTime(), user.mfaLastCounter);
  if (counter !== null) {
    // Only one sign-in per code: the update fails when another request used the same step.
    const updated = await prisma.user.updateMany({
      where: { id: userId, OR: [{ mfaLastCounter: null }, { mfaLastCounter: { lt: counter } }] },
      data: { mfaLastCounter: counter },
    });
    return updated.count === 1;
  }
  const hashes = Array.isArray(user.mfaRecoveryHashes) ? (user.mfaRecoveryHashes as string[]) : [];
  const remaining = consumeRecoveryCode(hashes, code);
  if (!remaining) return false;
  await prisma.user.update({ where: { id: userId }, data: { mfaRecoveryHashes: remaining } });
  return true;
}
