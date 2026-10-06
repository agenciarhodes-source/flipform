import { createHash } from 'node:crypto';

const OMITTED = {
  bank: '[dado bancário omitido]',
  document: '[documento omitido]',
  email: '[email omitido]',
  medicalIdentifier: '[identificador médico omitido]',
  name: '[nome omitido]',
  phone: '[telefone omitido]',
  secret: '[segredo omitido]',
} as const;

const DIRECT_IDENTIFIER_KEYS = /^(?:name|full_?name|nome|nome_?completo|phone|telefone|whatsapp|email|cpf|cnpj|rg|cnh|pis|pasep|nit|nis|cns|pix|bank_?account|conta_?bancaria)$/i;
const SECRET_KEYS = /(?:api_?key|authorization|password|senha|secret|token)$/i;

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
  if (typeof value === 'string') return redactJevText(value, 8_000);
  if (Array.isArray(value)) return value.map(sanitizeJevPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (SECRET_KEYS.test(key)) return [key, OMITTED.secret];
    if (DIRECT_IDENTIFIER_KEYS.test(key)) {
      const kind = /(?:name|nome)/i.test(key) ? 'name'
        : /mail/i.test(key) ? 'email'
          : /phone|telefone|whatsapp/i.test(key) ? 'phone' : 'document';
      return [key, OMITTED[kind]];
    }
    return [key, sanitizeJevPayload(entry)];
  }));
}
