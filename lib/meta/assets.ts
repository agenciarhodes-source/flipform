import 'server-only';
import { createAppSecretProof, META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

export type MetaBusinessAsset = {
  id: string;
  name: string;
};

export type MetaAdAccountAsset = {
  id: string;
  accountId: string;
  name: string;
};

export type MetaPixelAsset = {
  id: string;
  name: string;
};

export type MetaAssetSelection = {
  business: MetaBusinessAsset;
  adAccount: MetaAdAccountAsset;
  pixel: MetaPixelAsset;
};

function normalizeNumericId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^\d{1,64}$/.test(normalized) ? normalized : null;
}

function normalizeAdAccountId(value: unknown): { id: string; accountId: string } | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (/^act_\d{1,64}$/.test(normalized)) return { id: normalized, accountId: normalized.slice(4) };
  const numeric = normalizeNumericId(normalized);
  return numeric ? { id: `act_${numeric}`, accountId: numeric } : null;
}

function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 255) : fallback;
}

async function metaAssetJson(url: URL, operation: string, accessToken: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error(`Meta ${operation} unavailable`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Meta ${operation} invalid response`);
  }

  if (!response.ok || data?.error) {
    console.error('Meta asset discovery request failed', {
      operation,
      httpStatus: response.status,
      metaCode: data?.error?.code,
      metaType: data?.error?.type,
    });
    throw new Error(`Meta ${operation} failed`);
  }

  return data;
}

async function fetchGraphEdge(input: {
  path: string;
  fields: string;
  operation: string;
  accessToken: string;
  appSecret: string;
}): Promise<unknown[]> {
  const appSecretProof = createAppSecretProof(input.accessToken, input.appSecret);
  const results: unknown[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.path.replace(/^\//, '')}`);
    const params: Record<string, string> = {
      fields: input.fields,
      limit: String(PAGE_LIMIT),
      appsecret_proof: appSecretProof,
    };
    if (after) params.after = after;
    url.search = new URLSearchParams(params).toString();

    const payload = await metaAssetJson(url, input.operation, input.accessToken);
    if (Array.isArray(payload?.data)) results.push(...payload.data);

    const nextAfter = payload?.paging?.cursors?.after;
    if (typeof nextAfter !== 'string' || !nextAfter || nextAfter.length > 2048 || nextAfter === after) break;
    after = nextAfter;
  }

  return results;
}

export async function listMetaBusinesses(input: { accessToken: string; appSecret: string }): Promise<MetaBusinessAsset[]> {
  const data = await fetchGraphEdge({
    path: 'me/businesses',
    fields: 'id,name',
    operation: 'businesses',
    accessToken: input.accessToken,
    appSecret: input.appSecret,
  });

  const businesses = new Map<string, MetaBusinessAsset>();
  for (const entry of data) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = entry as { id?: unknown; name?: unknown };
    const id = normalizeNumericId(value.id);
    if (!id) continue;
    businesses.set(id, { id, name: normalizeName(value.name, `Empresa ${id}`) });
  }
  return [...businesses.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function listMetaBusinessAdAccounts(input: {
  accessToken: string;
  appSecret: string;
  businessId: string;
}): Promise<MetaAdAccountAsset[]> {
  const businessId = normalizeNumericId(input.businessId);
  if (!businessId) throw new Error('Invalid Meta business id');

  const [owned, client] = await Promise.all([
    fetchGraphEdge({
      path: `${businessId}/owned_ad_accounts`,
      fields: 'id,account_id,name',
      operation: 'owned_ad_accounts',
      accessToken: input.accessToken,
      appSecret: input.appSecret,
    }),
    fetchGraphEdge({
      path: `${businessId}/client_ad_accounts`,
      fields: 'id,account_id,name',
      operation: 'client_ad_accounts',
      accessToken: input.accessToken,
      appSecret: input.appSecret,
    }),
  ]);

  const accounts = new Map<string, MetaAdAccountAsset>();
  for (const entry of [...owned, ...client]) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = entry as { id?: unknown; account_id?: unknown; name?: unknown };
    const normalized = normalizeAdAccountId(value.id) ?? normalizeAdAccountId(value.account_id);
    if (!normalized) continue;
    accounts.set(normalized.id, {
      id: normalized.id,
      accountId: normalized.accountId,
      name: normalizeName(value.name, `Conta ${normalized.accountId}`),
    });
  }
  return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function listMetaAdAccountPixels(input: {
  accessToken: string;
  appSecret: string;
  adAccountId: string;
}): Promise<MetaPixelAsset[]> {
  const normalized = normalizeAdAccountId(input.adAccountId);
  if (!normalized) throw new Error('Invalid Meta ad account id');

  const data = await fetchGraphEdge({
    path: `${normalized.id}/adspixels`,
    fields: 'id,name',
    operation: 'ad_account_pixels',
    accessToken: input.accessToken,
    appSecret: input.appSecret,
  });

  const pixels = new Map<string, MetaPixelAsset>();
  for (const entry of data) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const value = entry as { id?: unknown; name?: unknown };
    const id = normalizeNumericId(value.id);
    if (!id) continue;
    pixels.set(id, { id, name: normalizeName(value.name, `Pixel / Dataset ${id}`) });
  }
  return [...pixels.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function validateMetaAssetSelection(input: {
  accessToken: string;
  appSecret: string;
  businessId: string;
  adAccountId: string;
  pixelId: string;
}): Promise<MetaAssetSelection> {
  const businesses = await listMetaBusinesses(input);
  const business = businesses.find(item => item.id === input.businessId);
  if (!business) throw new Error('Meta business is not authorized');

  const adAccounts = await listMetaBusinessAdAccounts({ ...input, businessId: business.id });
  const normalizedRequestedAccount = normalizeAdAccountId(input.adAccountId);
  const adAccount = normalizedRequestedAccount ? adAccounts.find(item => item.id === normalizedRequestedAccount.id) : null;
  if (!adAccount) throw new Error('Meta ad account is not authorized for this business');

  const pixels = await listMetaAdAccountPixels({ ...input, adAccountId: adAccount.id });
  const pixel = pixels.find(item => item.id === input.pixelId);
  if (!pixel) throw new Error('Meta pixel is not authorized for this ad account');

  return { business, adAccount, pixel };
}
