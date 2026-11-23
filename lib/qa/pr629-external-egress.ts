/**
 * PR629-only protected preview egress brake, NOT a general network firewall.
 * Opt-in is deliberately restricted to Vercel Preview (never production).
 * No payload, token, URL or personal data is logged by this guard.
 */
export function isPr629ExternalEgressBlocked(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.PR629_BLOCK_EXTERNAL_EGRESS === 'true' && env.VERCEL_ENV === 'preview';
}

export function assertPr629NoExternalEgress(_provider: string): void {
  if (isPr629ExternalEgressBlocked()) {
    throw new Error('PR629_EXTERNAL_EGRESS_BLOCKED');
  }
}
