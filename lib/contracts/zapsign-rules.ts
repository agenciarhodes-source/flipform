/**
 * Contracts by ZapSign: when the documents of a case are complete, a contract made from the ZapSign
 * model of that case (its thesis) is created and its signing link goes to the customer on WhatsApp.
 * FlipForm fills only what it already knows (name, phone, city, thesis, date); the customer fills
 * the other fields (CPF, address, marital status...) in ZapSign before signing, so FlipForm never
 * copies or keeps those numbers. Pure rules, easy to test.
 */

export const ZAPSIGN_API_BASE = 'https://api.zapsign.com.br/api/v1';

/** The variables FlipForm fills. Any other {{VARIABLE}} of the model is asked to the customer by ZapSign. */
export const ZAPSIGN_FILLED_VARIABLES = ['{{NOME COMPLETO}}', '{{TELEFONE}}', '{{CIDADE}}', '{{ESTADO}}', '{{TESE}}', '{{DATA}}'] as const;

export type ContractCustomer = {
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
};

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "10 de novembro de 2026", in Brasília. */
export function contractDate(now: Date) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now).split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

/** Brazilian phone split for ZapSign: country "55" and the rest. Null when it is not a Brazilian number. */
export function zapSignPhone(phone: string | null) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits.startsWith('55') || digits.length < 12 || digits.length > 13) return null;
  return { country: '55', number: digits.slice(2) };
}

/** The body of "create document via model". The link is sent by FlipForm on WhatsApp, not by ZapSign. */
export function createDocBody(input: {
  templateId: string;
  contractId: string;
  customer: ContractCustomer;
  thesis: string;
  companyName: string;
  now: Date;
}) {
  const phone = zapSignPhone(input.customer.phone);
  const values: Record<(typeof ZAPSIGN_FILLED_VARIABLES)[number], string> = {
    '{{NOME COMPLETO}}': input.customer.name,
    '{{TELEFONE}}': input.customer.phone || '',
    '{{CIDADE}}': input.customer.city || '',
    '{{ESTADO}}': input.customer.state || '',
    '{{TESE}}': input.thesis,
    '{{DATA}}': contractDate(input.now),
  };
  return {
    template_id: input.templateId,
    signer_name: input.customer.name,
    ...(phone ? { signer_phone_country: phone.country, signer_phone_number: phone.number } : {}),
    lang: 'pt-br',
    external_id: input.contractId,
    // Empty values are left for the customer to fill in ZapSign.
    data: Object.entries(values).filter(([, value]) => value.trim()).map(([de, para]) => ({ de, para })),
    signer_has_incomplete_fields: true,
    send_automatic_email: false,
    send_automatic_whatsapp: false,
    disable_signer_emails: true,
    brand_name: input.companyName.slice(0, 100),
    folder_path: '/flipform/',
  };
}

/** The signing link from ZapSign's answer, or null. */
export function signUrlFrom(response: unknown): { docToken: string; signUrl: string } | null {
  if (!response || typeof response !== 'object') return null;
  const body = response as { token?: unknown; signers?: unknown };
  const signer = Array.isArray(body.signers) ? body.signers[0] as { sign_url?: unknown } | undefined : undefined;
  if (typeof body.token !== 'string' || !body.token || typeof signer?.sign_url !== 'string' || !/^https:\/\//.test(signer.sign_url)) return null;
  return { docToken: body.token, signUrl: signer.sign_url };
}

/** The WhatsApp message with the link. */
export function contractLinkMessage(firstName: string | null, signUrl: string) {
  const hello = firstName ? `${firstName}, ` : '';
  return [
    `${hello}a sua documentação está completa. Aqui está o contrato para você assinar:`,
    signUrl,
    'Abra o link, confira e preencha os dados que faltarem (como CPF e endereço) e assine no final. Leva poucos minutos.',
    'Se tiver qualquer dúvida, é só me chamar aqui.',
  ].join('\n\n');
}

/** What the attendant reads in the turn the documents become complete (the link follows its reply). */
export const CONTRACT_COMING_NOTE = '[Nota interna, não mostre ao cliente: a documentação deste caso ficou completa. Logo depois da sua resposta, o sistema envia aqui o link do contrato para assinatura. Agradeça, diga em uma frase que o contrato chega em seguida por aqui, e não peça mais documentos.]';

/** Statuses of a contract that block sending another one for the same conversation. */
export const ACTIVE_CONTRACT_STATUSES = ['creating', 'sent', 'checking', 'signed'] as const;
