import { createHash } from 'node:crypto';

const OMITTED = {
  bank: '[dado bancário omitido]',
  document: '[documento omitido]',
  email: '[email omitido]',
  medicalIdentifier: '[identificador médico omitido]',
  name: '[nome omitido]',
  phone: '[telefone omitido]',
  secret: '[segredo omitido]',
  structure: '[estrutura omitida]',
} as const;

const DIRECT_IDENTIFIER_KEYS = /^(?:name|full_?name|nome|nome_?completo|phone|telefone|whatsapp|email|cpf|cnpj|rg|cnh|pis|pasep|nit|nis|cns|pix|bank_?account|conta_?bancaria)$/i;
const SECRET_KEYS = /(?:api_?key|authorization|password|senha|secret|token)$/i;
const JEV_SANITIZER_MAX_DEPTH = 12;
const JEV_SANITIZER_MAX_ARRAY_ITEMS = 100;
const JEV_SANITIZER_MAX_OBJECT_ENTRIES = 200;
const JEV_SANITIZER_MAX_NODES = 5_000;

export function jevSubjectReference(tenantId: string, conversationId: string) {
  return `lead_${createHash('sha256').update(`${tenantId}:${conversationId}`).digest('hex').slice(0, 16)}`;
}

export function redactJevText(value: string, max = 2_000) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, OMITTED.email)
    .replace(/\b(?:CPF|CNPJ|RG|CNH|PIS|PASEP|NIT|NIS)\s*(?:n[º°o.]?\s*)?[:#-]?\s*[A-Z0-9./-]{5,}\b/gi, OMITTED.document)
    .replace(/\b(?:cart[aã]o\s+(?:do\s+)?SUS|CNS|prontu[aá]rio|laudo|receita|atestado|protocolo)\s*(?:n[º°o.]?\s*)?[:#-]?\s*[A-Z0-9./-]{5,}\b/gi, OMITTED.medicalIdentifier)
    .replace(/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g, OMITTED.document)
    .replace(/\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/.\s-]?\d{4}[-.\s]?\d{2}\b/g, OMITTED.document)
    .replace(/\b\d{5,7}[-.]?\d\b/g, OMITTED.document)
    .replace(/\b(?:banco|ag[eê]ncia|conta|chave\s+pix|pix)\s*[:#-]?\s*[A-Z0-9@.+/_-]{3,}\b/gi, OMITTED.bank)
    .replace(/\b(?:meu nome [ée]|me chamo)\s+[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,4}/giu, `meu nome é ${OMITTED.name}`)
    .replace(/(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]*\d{4}\b/g, OMITTED.phone)
    .replace(/\b(?:sk|pk|rk|key)[-_][A-Za-z0-9_-]{12,}\b/g, OMITTED.secret)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeJevPayload(value: unknown): unknown {
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  function sanitize(entry: unknown, depth: number): unknown {
    visitedNodes += 1;
    if (visitedNodes > JEV_SANITIZER_MAX_NODES) return OMITTED.structure;
    if (typeof entry === 'string') return redactJevText(entry, 8_000);
    if (typeof entry === 'bigint' || typeof entry === 'function' || typeof entry === 'symbol') {
      return OMITTED.structure;
    }
    if (!entry || typeof entry !== 'object') {
      return typeof entry === 'number' && !Number.isFinite(entry) ? null : entry;
    }
    if (depth >= JEV_SANITIZER_MAX_DEPTH || seen.has(entry)) return OMITTED.structure;
    seen.add(entry);
    if (Array.isArray(entry)) {
      return entry.slice(0, JEV_SANITIZER_MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1));
    }
    return Object.fromEntries(
      Object.entries(entry as Record<string, unknown>)
        .slice(0, JEV_SANITIZER_MAX_OBJECT_ENTRIES)
        .map(([key, nested]) => {
          if (SECRET_KEYS.test(key)) return [key, OMITTED.secret];
          if (DIRECT_IDENTIFIER_KEYS.test(key)) {
            const kind = /(?:name|nome)/i.test(key) ? 'name'
              : /mail/i.test(key) ? 'email'
                : /phone|telefone|whatsapp/i.test(key) ? 'phone' : 'document';
            return [key, OMITTED[kind]];
          }
          return [key, sanitize(nested, depth + 1)];
        }),
    );
  }

  return sanitize(value, 0);
}
