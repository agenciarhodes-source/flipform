import 'server-only';

import { createAppSecretProof, META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;
const MAX_ITEMS = 100;

function normalizeAdAccountId(value: string) {
  const normalized = value.trim();
  if (/^act_\d{1,64}$/.test(normalized)) return normalized;
  if (/^\d{1,64}$/.test(normalized)) return `act_${normalized}`;
  throw new Error('Invalid Meta ad account id');
}

function safeString(value: unknown, max = 255) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function metaAdsReadJson(input: {
  path: string;
  fields: string;
  accessToken: string;
  appSecret: string;
  operation: string;
  limit?: number;
}) {
  const appSecretProof = createAppSecretProof(input.accessToken, input.appSecret);
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.path.replace(/^\//, '')}`);
  const params = new URLSearchParams({
    fields: input.fields,
    appsecret_proof: appSecretProof,
  });
  if (input.limit) params.set('limit', String(Math.min(Math.max(input.limit, 1), MAX_ITEMS)));
  url.search = params.toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
  } catch {
    throw new Error(`Meta ${input.operation} unavailable`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Meta ${input.operation} invalid response`);
  }

  if (!response.ok || data?.error) {
    console.error('Meta Ads read-only diagnostics request failed', {
      operation: input.operation,
      httpStatus: response.status,
      metaCode: data?.error?.code,
      metaSubcode: data?.error?.error_subcode,
      metaType: data?.error?.type,
    });
    throw new Error(`Meta ${input.operation} failed`);
  }

  return data;
}

export type MetaAdsReadOnlyDiagnostics = {
  account: {
    id: string;
    name: string | null;
    accountStatus: number | null;
    disableReason: number | null;
    currency: string | null;
    timezoneName: string | null;
  };
  campaignSummary: {
    total: number;
    active: number;
    paused: number;
    archivedOrDeleted: number;
    other: number;
  };
  campaigns: Array<{
    id: string;
    name: string | null;
    status: string | null;
    effectiveStatus: string | null;
    updatedTime: string | null;
  }>;
  activityAvailable: boolean;
  activities: Array<{
    eventTime: string | null;
    eventType: string | null;
    actorName: string | null;
    objectName: string | null;
    objectId: string | null;
  }>;
};

export async function getMetaAdsReadOnlyDiagnostics(input: {
  accessToken: string;
  appSecret: string;
  adAccountId: string;
}): Promise<MetaAdsReadOnlyDiagnostics> {
  const adAccountId = normalizeAdAccountId(input.adAccountId);

  const [accountPayload, campaignsPayload] = await Promise.all([
    metaAdsReadJson({
      path: adAccountId,
      fields: 'id,name,account_status,disable_reason,currency,timezone_name',
      accessToken: input.accessToken,
      appSecret: input.appSecret,
      operation: 'ad_account_diagnostics',
    }),
    metaAdsReadJson({
      path: `${adAccountId}/campaigns`,
      fields: 'id,name,status,effective_status,updated_time',
      accessToken: input.accessToken,
      appSecret: input.appSecret,
      operation: 'campaign_diagnostics',
      limit: MAX_ITEMS,
    }),
  ]);

  const campaigns = (Array.isArray(campaignsPayload?.data) ? campaignsPayload.data : [])
    .map((item: any) => ({
      id: safeString(item?.id, 80) || '',
      name: safeString(item?.name),
      status: safeString(item?.status, 80),
      effectiveStatus: safeString(item?.effective_status, 80),
      updatedTime: safeString(item?.updated_time, 80),
    }))
    .filter((item: { id: string }) => Boolean(item.id));

  const summary = campaigns.reduce((acc, campaign) => {
    const status = (campaign.status || '').toUpperCase();
    const effective = (campaign.effectiveStatus || '').toUpperCase();
    if (effective === 'ACTIVE') acc.active += 1;
    else if (status === 'PAUSED' || effective.includes('PAUSED')) acc.paused += 1;
    else if (status === 'ARCHIVED' || status === 'DELETED' || effective === 'ARCHIVED' || effective === 'DELETED') acc.archivedOrDeleted += 1;
    else acc.other += 1;
    return acc;
  }, { total: campaigns.length, active: 0, paused: 0, archivedOrDeleted: 0, other: 0 });

  let activityAvailable = true;
  let activities: MetaAdsReadOnlyDiagnostics['activities'] = [];
  try {
    const activityPayload = await metaAdsReadJson({
      path: `${adAccountId}/activities`,
      fields: 'event_time,event_type,actor_name,object_name,object_id',
      accessToken: input.accessToken,
      appSecret: input.appSecret,
      operation: 'ad_account_activity',
      limit: MAX_ITEMS,
    });
    activities = (Array.isArray(activityPayload?.data) ? activityPayload.data : [])
      .map((item: any) => ({
        eventTime: safeString(item?.event_time, 80),
        eventType: safeString(item?.event_type, 120),
        actorName: safeString(item?.actor_name),
        objectName: safeString(item?.object_name),
        objectId: safeString(item?.object_id, 80),
      }));
  } catch {
    activityAvailable = false;
  }

  return {
    account: {
      id: safeString(accountPayload?.id, 80) || adAccountId,
      name: safeString(accountPayload?.name),
      accountStatus: safeNumber(accountPayload?.account_status),
      disableReason: safeNumber(accountPayload?.disable_reason),
      currency: safeString(accountPayload?.currency, 16),
      timezoneName: safeString(accountPayload?.timezone_name, 120),
    },
    campaignSummary: summary,
    campaigns,
    activityAvailable,
    activities,
  };
}
