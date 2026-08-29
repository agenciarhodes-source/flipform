import 'server-only';

import { createAppSecretProof, META_PLATFORM_GRAPH_API_VERSION } from './oauth';

const GRAPH_HOST = 'graph.facebook.com';
const TIMEOUT_MS = 10_000;
const TEMPLATE_PAGE_LIMIT = 100;

export const WHATSAPP_TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING'] as const;
export const WHATSAPP_TEMPLATE_LANGUAGES = ['pt_BR', 'en_US'] as const;

export type WhatsAppTemplateCategory = (typeof WHATSAPP_TEMPLATE_CATEGORIES)[number];
export type WhatsAppTemplateLanguage = (typeof WHATSAPP_TEMPLATE_LANGUAGES)[number];

export type WhatsAppTemplateSummary = {
  id: string | null;
  name: string;
  status: string;
  category: string | null;
  language: string | null;
};

export type WhatsAppTemplateCreateInput = {
  name: string;
  category: WhatsAppTemplateCategory;
  language: WhatsAppTemplateLanguage;
  header?: string;
  body: string;
  footer?: string;
};

type MetaProviderError = Error & {
  status?: number;
  providerCode?: string | number | null;
  providerType?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function metaJson(url: URL, operation: string, input: {
  accessToken: string;
  method?: 'GET' | 'POST';
  body?: unknown;
}) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method || 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    });
  } catch {
    throw new Error(`Meta WhatsApp ${operation} unavailable`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Meta WhatsApp ${operation} invalid response`);
  }

  if (!response.ok || data?.error) {
    console.error('Meta WhatsApp template request failed', {
      operation,
      httpStatus: response.status,
      metaCode: data?.error?.code,
      metaType: data?.error?.type,
    });
    const error = new Error(`Meta WhatsApp ${operation} failed`) as MetaProviderError;
    error.status = response.status;
    error.providerCode = data?.error?.code ?? null;
    error.providerType = typeof data?.error?.type === 'string' ? data.error.type : null;
    throw error;
  }

  return data;
}

function validateCreateInput(input: WhatsAppTemplateCreateInput) {
  if (!/^[a-z0-9_]{1,512}$/.test(input.name)) {
    throw new Error('WhatsApp template name must use lowercase letters, numbers and underscores only');
  }
  if (!WHATSAPP_TEMPLATE_CATEGORIES.includes(input.category)) {
    throw new Error('WhatsApp template category is not supported');
  }
  if (!WHATSAPP_TEMPLATE_LANGUAGES.includes(input.language)) {
    throw new Error('WhatsApp template language is not supported');
  }
  const header = input.header?.trim() || '';
  const body = input.body.trim();
  const footer = input.footer?.trim() || '';
  if (!body || body.length > 1024) throw new Error('WhatsApp template body is invalid');
  if (header.length > 60 || footer.length > 60) throw new Error('WhatsApp template header or footer is too long');

  // The first App Review version intentionally creates deterministic text-only
  // templates without variables. Meta requires example values for variable
  // templates, so accepting placeholders without their examples would create a
  // fragile approval path. Variable support can be added later as a separate UX.
  if ([header, body, footer].some(text => text.includes('{{') || text.includes('}}'))) {
    throw new Error('WhatsApp template variables are not supported in this creator yet');
  }

  return { header, body, footer };
}

function normalizeTemplate(raw: any): WhatsAppTemplateSummary | null {
  const name = asString(raw?.name);
  if (!name) return null;
  return {
    id: asString(raw?.id),
    name,
    status: asString(raw?.status)?.toUpperCase() || 'UNKNOWN',
    category: asString(raw?.category)?.toUpperCase() || null,
    language: asString(raw?.language),
  };
}

export async function listWhatsAppMessageTemplates(input: {
  accessToken: string;
  appSecret: string;
  wabaId: string;
  after?: string | null;
}) {
  if (!/^\d+$/.test(input.wabaId)) throw new Error('Meta WhatsApp template WABA id is invalid');
  if (input.after && input.after.length > 500) throw new Error('Meta WhatsApp template cursor is invalid');

  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/message_templates`);
  const search = new URLSearchParams({
    fields: 'id,name,status,category,language',
    limit: String(TEMPLATE_PAGE_LIMIT),
    appsecret_proof: createAppSecretProof(input.accessToken, input.appSecret),
  });
  if (input.after) search.set('after', input.after);
  url.search = search.toString();

  const data = await metaJson(url, 'list_message_templates', { accessToken: input.accessToken });
  const templates = Array.isArray(data?.data)
    ? data.data.map(normalizeTemplate).filter((item: WhatsAppTemplateSummary | null): item is WhatsAppTemplateSummary => item !== null)
    : [];
  const nextCursor = typeof data?.paging?.cursors?.after === 'string' && data?.paging?.next
    ? data.paging.cursors.after
    : null;

  return { templates, nextCursor };
}

export async function createWhatsAppMessageTemplate(input: {
  accessToken: string;
  appSecret: string;
  wabaId: string;
  template: WhatsAppTemplateCreateInput;
}) {
  if (!/^\d+$/.test(input.wabaId)) throw new Error('Meta WhatsApp template WABA id is invalid');
  const normalized = validateCreateInput(input.template);

  const components: Array<Record<string, string>> = [];
  if (normalized.header) {
    components.push({ type: 'HEADER', format: 'TEXT', text: normalized.header });
  }
  components.push({ type: 'BODY', text: normalized.body });
  if (normalized.footer) components.push({ type: 'FOOTER', text: normalized.footer });

  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/message_templates`);
  url.search = new URLSearchParams({
    appsecret_proof: createAppSecretProof(input.accessToken, input.appSecret),
  }).toString();

  const data = await metaJson(url, 'create_message_template', {
    accessToken: input.accessToken,
    method: 'POST',
    body: {
      name: input.template.name,
      language: input.template.language,
      category: input.template.category,
      components,
    },
  });

  return {
    id: asString(data?.id),
    name: input.template.name,
    status: asString(data?.status)?.toUpperCase() || 'PENDING',
    category: asString(data?.category)?.toUpperCase() || input.template.category,
    language: input.template.language,
  } satisfies WhatsAppTemplateSummary;
}
