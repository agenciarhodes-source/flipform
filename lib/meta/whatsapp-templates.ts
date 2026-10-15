import 'server-only';
import { WHATSAPP_TEMPLATE_VARIABLES } from './whatsapp-template-variables';

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

/**
 * Three variables with a fixed meaning, filled in by FlipForm when the template is sent. A message
 * that names the person and the date of their own request is what Meta treats as utility.
 */
export { WHATSAPP_TEMPLATE_VARIABLES };

const VARIABLE = /\{\{\s*(\d+)\s*\}\}/g;

/** The variables a body uses, checked against Meta's rules. Throws when a rule is broken. */
export function templateBodyVariables(body: string): number[] {
  const text = body.trim();
  const used = Array.from(text.matchAll(VARIABLE), (match) => Number(match[1]));
  if (text.replace(VARIABLE, '').includes('{{') || text.replace(VARIABLE, '').includes('}}')) {
    throw new Error('WhatsApp template variables are malformed');
  }
  if (!used.length) return [];
  const distinct = Array.from(new Set(used)).sort((a, b) => a - b);
  if (distinct.length > WHATSAPP_TEMPLATE_VARIABLES.length || distinct.some((value, index) => value !== index + 1)) {
    throw new Error('WhatsApp template variables must be {{1}} to {{3}} in sequence');
  }
  if (/^\{\{\s*\d+\s*\}\}/.test(text) || /\{\{\s*\d+\s*\}\}$/.test(text)) {
    throw new Error('WhatsApp template body cannot start or end with a variable');
  }
  if (/\}\}\s*\{\{/.test(text)) throw new Error('WhatsApp template variables cannot be next to each other');
  return distinct;
}

/** The text a person receives, with each variable replaced by its value. */
export function fillTemplateVariables(body: string, values: string[]) {
  return body.replace(VARIABLE, (whole, index) => values[Number(index) - 1] ?? whole);
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

  // Variables only in the body, where FlipForm fills them; header and footer stay fixed.
  if ([header, footer].some(text => text.includes('{{') || text.includes('}}'))) {
    throw new Error('WhatsApp template variables are only supported in the body');
  }
  const variables = templateBodyVariables(body);

  return { header, body, footer, variables };
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
  /** Used as the example of {{3}}, which Meta requires to review a template with variables. */
  companyName?: string;
}) {
  if (!/^\d+$/.test(input.wabaId)) throw new Error('Meta WhatsApp template WABA id is invalid');
  const normalized = validateCreateInput(input.template);

  const components: Array<Record<string, unknown>> = [];
  if (normalized.header) {
    components.push({ type: 'HEADER', format: 'TEXT', text: normalized.header });
  }
  if (normalized.variables.length) {
    const examples = normalized.variables.map((index) => (index === 3 && input.companyName?.trim())
      || WHATSAPP_TEMPLATE_VARIABLES[index - 1].example);
    components.push({ type: 'BODY', text: normalized.body, example: { body_text: [examples] } });
  } else {
    components.push({ type: 'BODY', text: normalized.body });
  }
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

export type WhatsAppSendableTemplate = {
  name: string;
  language: string;
  category: string | null;
  body: string;
  /** How many of the fixed variables ({{1}} to {{3}}) the body uses. */
  variables: number;
};

/**
 * A template can be sent with one click when Meta approved it and FlipForm can fill everything it
 * needs: text only, and variables only the fixed ones in the body. Anything else is left out
 * instead of being sent incomplete.
 */
export function toSendableWhatsAppTemplate(raw: any): WhatsAppSendableTemplate | null {
  const name = asString(raw?.name);
  const language = asString(raw?.language);
  if (!name || !language || asString(raw?.status)?.toUpperCase() !== 'APPROVED') return null;
  const components: any[] = Array.isArray(raw?.components) ? raw.components : [];
  const fixedParts = components.filter(component => asString(component?.type)?.toUpperCase() !== 'BODY');
  if (JSON.stringify(fixedParts).includes('{{')) return null;
  const header = components.find(component => asString(component?.type)?.toUpperCase() === 'HEADER');
  if (header && asString(header?.format)?.toUpperCase() !== 'TEXT') return null;
  const body = asString(components.find(component => asString(component?.type)?.toUpperCase() === 'BODY')?.text);
  if (!body) return null;
  let variables: number[];
  try {
    variables = templateBodyVariables(body);
  } catch {
    return null;
  }
  return { name, language, category: asString(raw?.category)?.toUpperCase() || null, body, variables: variables.length };
}

export async function listSendableWhatsAppTemplates(input: {
  accessToken: string;
  appSecret: string;
  wabaId: string;
}) {
  if (!/^\d+$/.test(input.wabaId)) throw new Error('Meta WhatsApp template WABA id is invalid');
  const url = new URL(`https://${GRAPH_HOST}/${META_PLATFORM_GRAPH_API_VERSION}/${input.wabaId}/message_templates`);
  url.search = new URLSearchParams({
    fields: 'name,status,category,language,components',
    limit: '100',
    appsecret_proof: createAppSecretProof(input.accessToken, input.appSecret),
  }).toString();
  const data = await metaJson(url, 'list_sendable_templates', { accessToken: input.accessToken });
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map(toSendableWhatsAppTemplate)
    .filter((item): item is WhatsAppSendableTemplate => item !== null);
}
