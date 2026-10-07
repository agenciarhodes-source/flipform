import 'server-only';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { selectGoogleClickIdentifier, type GoogleClickIds } from './google-click-ids';
import { parseGoogleConversionActionResource, toSafeGoogleConversionErrorCode } from './google-funnel';

/**
 * Transport building blocks for Google Ads conversions through the Data
 * Manager API. Nothing in this module reads the database or decides when to
 * send; it is fail-closed and inert until every gate below is configured.
 */

export const GOOGLE_DATA_MANAGER_INGEST_URL = 'https://datamanager.googleapis.com/v1/events:ingest';
export const GOOGLE_DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_TIMEOUT_MS = 10_000;

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GoogleFunnelTransportConfig = {
  enabled: boolean;
  /** Requests are dry runs unless production sending is explicitly turned on. */
  validateOnly: boolean;
  sendUserData: boolean;
  loginAccountId: string | null;
  serviceAccount: { clientEmail: string; privateKey: string } | null;
  /** tenantId -> Google Ads customer IDs that tenant may send conversions to. */
  tenantAccounts: Map<string, Set<string>>;
};

function parseServiceAccount(raw: string | undefined) {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const json = value.startsWith('{') ? value : Buffer.from(value, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { client_email?: unknown; private_key?: unknown };
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
    if (!parsed.client_email.includes('@') || !parsed.private_key.includes('PRIVATE KEY')) return null;
    return { clientEmail: parsed.client_email, privateKey: parsed.private_key };
  } catch {
    return null;
  }
}

function parseTenantAccounts(raw: string | undefined) {
  const accounts = new Map<string, Set<string>>();
  for (const entry of (raw || '').split(',')) {
    const [tenantId, customerId] = entry.split(':').map((part) => part.trim());
    if (!tenantId || !/^[0-9]{10}$/.test(customerId || '')) continue;
    const set = accounts.get(tenantId) || new Set<string>();
    set.add(customerId);
    accounts.set(tenantId, set);
  }
  return accounts;
}

export function resolveGoogleFunnelTransportConfig(env: Env = process.env): GoogleFunnelTransportConfig {
  const loginAccountId = (env.GOOGLE_DATA_MANAGER_LOGIN_ACCOUNT_ID || '').replace(/-/g, '').trim();
  return {
    enabled: env.GOOGLE_FUNNEL_TRANSPORT_ENABLED === 'true',
    validateOnly: env.GOOGLE_FUNNEL_VALIDATE_ONLY !== 'false',
    sendUserData: env.GOOGLE_FUNNEL_SEND_USER_DATA === 'true',
    loginAccountId: /^[0-9]{10}$/.test(loginAccountId) ? loginAccountId : null,
    serviceAccount: parseServiceAccount(env.GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON),
    tenantAccounts: parseTenantAccounts(env.GOOGLE_FUNNEL_TENANT_ACCOUNTS),
  };
}

export type GoogleFunnelTransportReadiness =
  | { ready: true }
  | { ready: false; code: 'TRANSPORT_DISABLED' | 'CREDENTIALS_MISSING' | 'TENANT_ACCOUNT_NOT_ALLOWED' };

/** A tenant can only reach a Google Ads account the platform explicitly paired with it. */
export function checkGoogleFunnelTransportReadiness(
  config: GoogleFunnelTransportConfig,
  tenantId: string,
  customerId: string,
): GoogleFunnelTransportReadiness {
  if (!config.enabled) return { ready: false, code: 'TRANSPORT_DISABLED' };
  if (!config.serviceAccount) return { ready: false, code: 'CREDENTIALS_MISSING' };
  if (!config.tenantAccounts.get(tenantId)?.has(customerId)) return { ready: false, code: 'TENANT_ACCOUNT_NOT_ALLOWED' };
  return { ready: true };
}

export function normalizeGoogleEmail(value: string | null | undefined): string | null {
  const email = (value || '').replace(/\s+/g, '').toLowerCase();
  const match = /^([^@]+)@([^@]+\.[^@]+)$/.exec(email);
  if (!match) return null;
  const [, local, domain] = match;
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return `${local}@${domain}`;
  const normalizedLocal = local.split('+')[0].replace(/\./g, '');
  return normalizedLocal ? `${normalizedLocal}@${domain}` : null;
}

/** E.164. Numbers without a country code are treated as Brazilian. */
export function normalizeGooglePhoneE164(value: string | null | undefined): string | null {
  const raw = (value || '').trim();
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return null;
}

export function hashGoogleIdentifier(normalized: string): string {
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export type GoogleConversionIngestInput = {
  tenantId: string;
  conversionActionResource: string;
  idempotencyKey: string;
  conversionTime: Date;
  conversionValue?: number | null;
  currency?: string | null;
  clickIds?: Partial<GoogleClickIds> | null;
  lead?: { email?: string | null; phone?: string | null } | null;
};

export type GoogleConversionIngestBuild =
  | { ok: true; body: Record<string, unknown>; customerId: string }
  | { ok: false; code: 'INVALID_CONVERSION_ACTION' | 'NO_IDENTIFIER' | GoogleFunnelNotReadyCode };

type GoogleFunnelNotReadyCode = Extract<GoogleFunnelTransportReadiness, { ready: false }>['code'];

export function buildGoogleConversionIngestRequest(
  config: GoogleFunnelTransportConfig,
  input: GoogleConversionIngestInput,
): GoogleConversionIngestBuild {
  const action = parseGoogleConversionActionResource(input.conversionActionResource);
  if (!action) return { ok: false, code: 'INVALID_CONVERSION_ACTION' };
  const readiness = checkGoogleFunnelTransportReadiness(config, input.tenantId, action.customerId);
  if (!readiness.ready) return { ok: false, code: readiness.code };

  const click = selectGoogleClickIdentifier(input.clickIds);
  const userIdentifiers: Array<Record<string, string>> = [];
  if (config.sendUserData) {
    const email = normalizeGoogleEmail(input.lead?.email);
    const phone = normalizeGooglePhoneE164(input.lead?.phone);
    if (email) userIdentifiers.push({ emailAddress: hashGoogleIdentifier(email) });
    if (phone) userIdentifiers.push({ phoneNumber: hashGoogleIdentifier(phone) });
  }
  // Without a click ID or permitted user data Google cannot attribute the event.
  if (!click && userIdentifiers.length === 0) return { ok: false, code: 'NO_IDENTIFIER' };

  const event: Record<string, unknown> = {
    transactionId: input.idempotencyKey,
    eventTimestamp: input.conversionTime.toISOString(),
    eventSource: 'WEB',
  };
  if (click) event.adIdentifiers = { [click.kind]: click.value };
  if (userIdentifiers.length > 0) event.userData = { userIdentifiers };
  if (typeof input.conversionValue === 'number' && input.conversionValue > 0) {
    event.conversionValue = input.conversionValue;
    event.currency = input.currency || 'BRL';
  }

  const body: Record<string, unknown> = {
    destinations: [
      {
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: action.customerId },
        loginAccount: { accountType: 'GOOGLE_ADS', accountId: config.loginAccountId || action.customerId },
        productDestinationId: action.conversionActionId,
      },
    ],
    events: [event],
    validateOnly: config.validateOnly,
  };
  if (userIdentifiers.length > 0) {
    body.encoding = 'HEX';
    body.consent = { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' };
  }
  return { ok: true, body, customerId: action.customerId };
}

let cachedToken: { clientEmail: string; accessToken: string; expiresAtMs: number } | null = null;

export function resetGoogleDataManagerTokenCache() {
  cachedToken = null;
}

/** Service-account access token, cached in memory until shortly before it expires. */
export async function getGoogleDataManagerAccessToken(
  serviceAccount: { clientEmail: string; privateKey: string },
  options: { fetchImpl?: FetchLike; nowMs?: number } = {},
): Promise<string | null> {
  const nowMs = options.nowMs ?? Date.now();
  if (cachedToken && cachedToken.clientEmail === serviceAccount.clientEmail && cachedToken.expiresAtMs - 60_000 > nowMs) {
    return cachedToken.accessToken;
  }
  const issuedAt = Math.floor(nowMs / 1000);
  let assertion: string;
  try {
    assertion = jwt.sign(
      { iss: serviceAccount.clientEmail, scope: GOOGLE_DATA_MANAGER_SCOPE, aud: GOOGLE_OAUTH_TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 },
      serviceAccount.privateKey,
      { algorithm: 'RS256' },
    );
  } catch {
    return null;
  }
  try {
    const response = await (options.fetchImpl || fetch)(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== 'string' || !payload.access_token) return null;
    const expiresIn = typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 3600;
    cachedToken = { clientEmail: serviceAccount.clientEmail, accessToken: payload.access_token, expiresAtMs: nowMs + expiresIn * 1000 };
    return payload.access_token;
  } catch {
    return null;
  }
}

export type GoogleConversionSendOutcome =
  /** Google accepted the request for processing; attribution is confirmed later. */
  | { outcome: 'sent'; requestId: string | null }
  /** Dry run: Google validated the payload and ingested nothing. */
  | { outcome: 'validated' }
  | { outcome: 'rejected'; code: string }
  | { outcome: 'retry'; code: string };

async function readErrorCode(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { status?: unknown } };
    return toSafeGoogleConversionErrorCode(payload.error?.status);
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * One request, no internal retry. Only a symbolic code leaves this function:
 * provider messages, tokens and payloads are never returned or logged.
 */
export async function sendGoogleConversionIngest(
  body: Record<string, unknown>,
  accessToken: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<GoogleConversionSendOutcome> {
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(GOOGLE_DATA_MANAGER_INGEST_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    return { outcome: 'retry', code: 'NETWORK_ERROR' };
  }

  if (response.ok) {
    if (body.validateOnly === true) return { outcome: 'validated' };
    try {
      const payload = (await response.json()) as { requestId?: unknown };
      return { outcome: 'sent', requestId: typeof payload.requestId === 'string' ? payload.requestId : null };
    } catch {
      return { outcome: 'sent', requestId: null };
    }
  }

  const code = await readErrorCode(response);
  // Credentials and quota problems are operational: keep the event for a later attempt.
  if (response.status === 401 || response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500) {
    return { outcome: 'retry', code: code === 'UNKNOWN' ? `HTTP_${response.status}` : code };
  }
  return { outcome: 'rejected', code: code === 'UNKNOWN' ? `HTTP_${response.status}` : code };
}
