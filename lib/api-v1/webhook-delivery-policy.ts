import { isIP } from 'node:net';

/**
 * PR01 Phase 5: OFFLINE destination preflight and retry planning ONLY.
 * This file makes ZERO DNS queries and ZERO HTTP requests. A future sender
 * must resolve hostnames just before each connection, enforce IP pinning and
 * TLS SNI, reject redirects, and re-check each retry against an egress firewall.
 */
const DNS_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PRIVATE_NAME = /(?:^|\.)(?:localhost|local|internal|test|invalid)$/;
const MAX_URL_LENGTH = 2048;

function publicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const o = address.split('.').map(Number);
  if (o.length !== 4 || o.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b, c] = o;
  // Conservative denylist of all well-known non-public IPv4 ranges,
  // including link-local, loopback, CGNAT, benchmarking and documentation.
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113));
}

export type WebhookEgressCandidate = {
  url: string;
  /** Exact hostnames explicitly trusted by a future server-side policy. */
  allowedHosts: readonly string[];
  /** All DNS A/AAAA answers returned by a future trusted resolver. */
  resolvedAddresses: readonly string[];
};

export type WebhookEgressAssessment =
  | { eligible: true; hostname: string }
  | { eligible: false; reason: 'invalid_url' | 'unapproved_host' | 'unapproved_address' };

/** Never use this boolean as permission to perform a network request. */
export function assessWebhookEgress(candidate: WebhookEgressCandidate): WebhookEgressAssessment {
  if (!candidate || typeof candidate.url !== 'string'
    || candidate.url.length === 0 || candidate.url.length > MAX_URL_LENGTH
    || !Array.isArray(candidate.allowedHosts) || !Array.isArray(candidate.resolvedAddresses)) {
    return { eligible: false, reason: 'invalid_url' };
  }
  let url: URL;
  try { url = new URL(candidate.url); }
  catch { return { eligible: false, reason: 'invalid_url' }; }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')
    || url.username || url.password || url.hash
    || isIP(hostname) !== 0 || !DNS_NAME.test(hostname)
    || PRIVATE_NAME.test(hostname) || hostname.includes('xn--')
    || !url.pathname.startsWith('/')) {
    return { eligible: false, reason: 'invalid_url' };
  }

  // Exact-match only; no suffix, wildcard, regex or user-driven allowlist.
  if (!candidate.allowedHosts.some(host => typeof host === 'string'
    && host === hostname && DNS_NAME.test(host))) {
    return { eligible: false, reason: 'unapproved_host' };
  }

  // Deliberately IPv4-only in this Draft. IPv6, mixed A/AAAA, private,
  // rebinding or missing answers fail closed. No connection is opened here.
  if (candidate.resolvedAddresses.length === 0
    || candidate.resolvedAddresses.length > 20
    || !candidate.resolvedAddresses.every(addr => typeof addr === 'string'
      && publicIPv4(addr))) {
    return { eligible: false, reason: 'unapproved_address' };
  }
  return { eligible: true, hostname };
}

export type WebhookRetryDecision =
  | { action: 'retry'; afterMs: number }
  | { action: 'dead_letter' };

/** A pure scheduling policy. Does not update any row, start timers or send. */
export function planWebhookRetry(attempt: number, httpStatus: number | null): WebhookRetryDecision {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt >= 5) {
    return { action: 'dead_letter' };
  }
  const recoverable = httpStatus === null || httpStatus === 408 || httpStatus === 425
    || httpStatus === 429 || (httpStatus !== null && httpStatus >= 500 && httpStatus <= 599);
  if (!recoverable) return { action: 'dead_letter' };
  return { action: 'retry', afterMs: Math.min(30_000 * (2 ** (attempt - 1)), 900_000) };
}
