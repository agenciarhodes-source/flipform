import { createHmac, timingSafeEqual } from 'crypto';

/**
 * After the contract is sent: ZapSign tells FlipForm when the customer signs; FlipForm keeps the
 * signed PDF, the AI reads it whole and, if something is missing, tells the customer what to fix
 * and sends a new link. When everything is right, an urgent task (1 hour) goes to the attendant to
 * file the case in Gojus. Pure rules, easy to test.
 */

/** The secret ZapSign sends back in the Authorization header; derived per company, never stored. */
export function zapSignWebhookSecret(key: string, tenantId: string) {
  return createHmac('sha256', key).update(`zapsign-webhook:${tenantId}`).digest('hex');
}

export function zapSignWebhookAuthorized(header: string | null, expected: string) {
  const given = (header || '').replace(/^Bearer\s+/i, '').trim();
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** The event ZapSign sent, read safely. Only the document token is trusted; the state is fetched again. */
export function zapSignEvent(body: unknown): { type: string; docToken: string } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const type = typeof record.event_type === 'string' ? record.event_type : '';
  const docToken = typeof record.token === 'string' ? record.token : '';
  if (!type || !/^[A-Za-z0-9-]{8,80}$/.test(docToken)) return null;
  return { type, docToken };
}

export type ZapSignDocState = { status: string; signedFile: string | null; refused: boolean };

/** The document as ZapSign reports it now. */
export function zapSignDocState(body: unknown): ZapSignDocState | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.status !== 'string') return null;
  const signers = Array.isArray(record.signers) ? record.signers as Array<Record<string, unknown>> : [];
  const signedFile = typeof record.signed_file === 'string' && /^https:\/\//.test(record.signed_file) ? record.signed_file : null;
  return {
    status: record.status,
    signedFile,
    refused: record.status === 'refused' || signers.some((signer) => signer.status === 'refused'),
  };
}

/** What the AI answers after reading the signed contract. */
export const CONTRACT_CHECK_FORMAT = {
  type: 'json_schema' as const,
  name: 'signed_contract_check',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['complete', 'problems'],
    properties: {
      complete: { type: 'boolean' },
      problems: { type: 'array', items: { type: 'string' }, description: 'Each problem in one short sentence for the customer, in Portuguese' },
    },
  },
};

export function contractCheckInstructions(input: { customerName: string; thesis: string }) {
  return [
    'Você confere um contrato assinado eletronicamente (ZapSign) antes de a equipe dar entrada no caso.',
    `Cliente esperado: ${input.customerName}. Tese: ${input.thesis}.`,
    'Leia o documento inteiro, todas as páginas, inclusive o aditivo e o relatório de assinaturas do final.',
    'Está completo quando: há a assinatura do cliente no relatório de assinaturas; todos os campos de dados do cliente estão',
    'preenchidos (nada em branco, nada como {{CAMPO}}, "____" ou "não informado" onde deveria haver CPF, RG, endereço, estado',
    'civil ou profissão); o nome no contrato é o do cliente esperado; não falta nenhuma parte (contrato e aditivo).',
    'Em problems, liste só o que falta ou está errado, cada item em uma frase curta e simples para o cliente entender',
    '(por exemplo: "O campo do endereço ficou em branco."). Nunca escreva números de CPF, RG ou outros dados pessoais.',
    'Se estiver tudo certo, complete = true e problems vazio.',
  ].join('\n');
}

export function firstNameOf(name: string | null | undefined) {
  return (name || '').trim().split(/\s+/)[0] || null;
}

/** Signed and complete: thanks, and what happens next (the mission phrase of the office). */
export function signedThanksMessage(firstName: string | null) {
  return `${firstName ? `${firstName}, r` : 'R'}ecebemos o seu contrato assinado. Obrigada! Agora iremos examinar o seu caso a partir dos documentos que você enviou, e a equipe te avisa por aqui sobre os próximos passos.`;
}

/** Something was missing: what, and that a new link follows. */
export function contractFixMessage(firstName: string | null, problems: string[]) {
  const list = problems.slice(0, 5).map((problem) => `• ${problem.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
  return [
    `${firstName ? `${firstName}, r` : 'R'}ecebi o seu contrato, mas faltou uma coisinha para ele valer:`,
    ...list,
    'Vou te mandar um novo link em seguida para você assinar de novo, com tudo preenchido. É rapidinho.',
  ].join('\n');
}

/** The customer did not sign yet. */
export function contractReminderMessage(firstName: string | null, signUrl: string) {
  return [
    `${firstName ? `${firstName}, s` : 'S'}ó lembrando: o seu contrato está esperando a sua assinatura.`,
    signUrl,
    'É só abrir o link, preencher os dados que faltarem e assinar no final. Se tiver alguma dúvida, me chama aqui.',
  ].join('\n\n');
}

/** One reminder, 3 hours after sending, while WhatsApp still lets the company write (24 hours after the customer). */
export function shouldRemindUnsigned(input: { sentAt: Date; now: Date; lastInboundAt: Date | null; reminded: boolean }) {
  if (input.reminded || !input.lastInboundAt) return false;
  const sinceSent = input.now.getTime() - input.sentAt.getTime();
  const sinceCustomer = input.now.getTime() - input.lastInboundAt.getTime();
  return sinceSent >= 3 * 3_600_000 && sinceSent <= 48 * 3_600_000 && sinceCustomer <= 23 * 3_600_000;
}

/** The urgent task for the attendant: file the case in Gojus within the next hour. */
export function gojusTask(input: { customerName: string; thesis: string; leadId: string | null; conversationId: string; appUrl: string }) {
  const base = input.appUrl.replace(/\/$/, '');
  return {
    title: `Lançar no Gojus: ${input.customerName} (${input.thesis})`.slice(0, 190),
    description: [
      'O cliente assinou o contrato e a IA conferiu: está completo. Dê entrada do caso no Gojus em até 1 hora.',
      'O contrato assinado está nos arquivos do lead, junto com os documentos que o cliente enviou.',
      input.leadId ? `Lead: ${base}/leads?leadId=${encodeURIComponent(input.leadId)}` : '',
      `Conversa: ${base}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
      'Depois de lançar, conclua esta tarefa.',
    ].filter(Boolean).join('\n\n'),
  };
}

/** Contract problems the team must handle (the customer could not be told on WhatsApp, or refused). */
export function contractIssueTask(input: { customerName: string; reason: string; conversationId: string; appUrl: string }) {
  return {
    title: `Contrato com pendência: ${input.customerName}`.slice(0, 190),
    description: [
      input.reason,
      `Conversa: ${input.appUrl.replace(/\/$/, '')}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
    ].join('\n\n'),
  };
}
