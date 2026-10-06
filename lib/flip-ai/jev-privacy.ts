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

const JEV_SANITIZER_MAX_DEPTH = 12;
const JEV_SANITIZER_MAX_ARRAY_ITEMS = 100;
const JEV_SANITIZER_MAX_OBJECT_ENTRIES = 200;
const JEV_SANITIZER_MAX_NODES = 5_000;

const SECRET_KEY_NAMES = new Set([
  'authorization', 'authorizationheader', 'authheader', 'bearer', 'credential', 'credentials',
  'cookie', 'cookies', 'setcookie', 'session', 'sessionid', 'privatekey', 'signingkey',
  'encryptionkey', 'connectionstring', 'databaseurl', 'datasourceurl', 'dsn',
]);

const IDENTIFIER_KEYS = {
  name: new Set([
    'name', 'fullname', 'firstname', 'lastname', 'surname', 'givenname', 'familyname',
    'displayname', 'legalname', 'contactname', 'leadname', 'customername', 'clientname', 'username',
    'nome', 'nomecompleto', 'primeironome', 'sobrenome', 'nomedeexibicao', 'nomecontato',
    'nomelead', 'nomecliente',
  ]),
  phone: new Set([
    'phone', 'phonenumber', 'telephone', 'mobile', 'mobilephone', 'cellphone', 'contactphone',
    'telefone', 'numerotelefone', 'celular', 'numerocelular', 'whatsapp', 'whatsappnumber',
    'numerowhatsapp',
  ]),
  email: new Set(['email', 'emailaddress', 'mail', 'contactemail', 'correioeletronico']),
  document: new Set([
    'cpf', 'cnpj', 'rg', 'cnh', 'pis', 'pasep', 'nit', 'nis', 'document', 'documentnumber',
    'identitynumber', 'socialsecuritynumber', 'documento', 'numerodocumento',
  ]),
  bank: new Set([
    'pix', 'pixkey', 'chavepix', 'bankaccount', 'bankaccountnumber', 'accountnumber', 'routingnumber',
    'branchnumber', 'agencynumber', 'contabancaria', 'numeroconta', 'numeroagencia',
  ]),
  medicalIdentifier: new Set([
    'cns', 'medicalrecord', 'medicalrecordnumber', 'healthcardnumber', 'prontuario',
    'numeroprontuario', 'cartaosus', 'numerocartaosus',
  ]),
} as const;

function normalizedKey(key: string) {
  return key.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSecretKey(key: string) {
  const normalized = normalizedKey(key);
  if (SECRET_KEY_NAMES.has(normalized) || /(?:apikey|password|senha|secret|token)$/.test(normalized)) return true;
  for (const secretName of SECRET_KEY_NAMES) {
    if (normalized.endsWith(secretName)) return true;
  }
  return false;
}

function identifierKind(key: string): keyof typeof IDENTIFIER_KEYS | null {
  const normalized = normalizedKey(key);
  for (const [kind, keys] of Object.entries(IDENTIFIER_KEYS)) {
    if ((keys as ReadonlySet<string>).has(normalized)) return kind as keyof typeof IDENTIFIER_KEYS;
  }
  return null;
}

export function jevSubjectReference(tenantId: string, conversationId: string) {
  return `lead_${createHash('sha256').update(`${tenantId}:${conversationId}`).digest('hex').slice(0, 16)}`;
}

export function redactJevText(value: string, max = 2_000) {
  return value
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, OMITTED.secret)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, OMITTED.secret)
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+/gi, OMITTED.secret)
    .replace(/["']?(?:[A-Za-z0-9_-]{0,64})?(?:authorization(?:[_\s-]?header)?|auth[_\s-]?header|credentials?|cookies?|session(?:[_\s-]?id)?|private[_\s-]?key|signing[_\s-]?key|encryption[_\s-]?key|connection[_\s-]?string|database[_\s-]?url|datasource[_\s-]?url|access[_\s-]?token|refresh[_\s-]?token|client[_\s-]?secret|api[_\s-]?key|password|senha|secret|token)["']?\s*[:=]\s*(?:(?:Basic|Bearer)\s+[A-Za-z0-9._~+\/-]+=*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi, OMITTED.secret)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, OMITTED.email)
    .replace(/\b(?:CPF|CNPJ|RG|CNH|PIS|PASEP|NIT|NIS)\s*(?:n[º°o.]?\s*)?[:#-]?\s*[A-Z0-9./-]{5,}\b/gi, OMITTED.document)
    .replace(/\b(?:cart[aã]o\s+(?:do\s+)?SUS|CNS|prontu[aá]rio|laudo|receita|atestado|protocolo)\s*(?:n[º°o.]?\s*)?[:#-]?\s*[A-Z0-9./-]{5,}\b/gi, OMITTED.medicalIdentifier)
    .replace(/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g, OMITTED.document)
    .replace(/\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/.\s-]?\d{4}[-.\s]?\d{2}\b/g, OMITTED.document)
    .replace(/\b\d{5,7}[-.]?\d\b/g, OMITTED.document)
    .replace(/\b(?:banco|ag[eê]ncia|conta|chave\s+pix|pix)\s*[:#-]?\s*[A-Z0-9@.+/_-]{3,}\b/gi, OMITTED.bank)
    .replace(/\b(?:meu\s+nome(?:\s+completo)?\s*(?:[ée]|:)|nome(?:\s+completo)?\s*:|me\s+chamo|pode\s+me\s+chamar\s+de)\s+[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,4}/giu, OMITTED.name)
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
          if (isSecretKey(key)) return [key, OMITTED.secret];
          const kind = identifierKind(key);
          if (kind) return [key, OMITTED[kind]];
          return [key, sanitize(nested, depth + 1)];
        }),
    );
  }

  return sanitize(value, 0);
}
