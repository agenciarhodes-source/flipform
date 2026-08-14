import 'server-only';

import { createAppSecretProof, META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;

export type MetaUserProfile = {
  id: string;
  name: string | null;
};

export async function getMetaUserProfile(input: { accessToken: string; appSecret: string }): Promise<MetaUserProfile | null> {
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/me`);
  url.search = new URLSearchParams({
    fields: 'id,name',
    appsecret_proof: createAppSecretProof(input.accessToken, input.appSecret),
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${input.accessToken}` },
    });
  } catch {
    return null;
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (!response.ok || data?.error || typeof data?.id !== 'string' || !data.id) return null;

  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 255) : null;
  return { id: data.id, name };
}
