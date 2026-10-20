/**
 * Why Meta did not deliver a WhatsApp message, in plain Portuguese, from the error it sends with the
 * "failed" status. Shown on the failed message in the Inbox.
 */
const REASONS: Record<string, string> = {
  '131042': 'Problema de pagamento na conta do WhatsApp na Meta: confira a forma de pagamento no Gerenciador do WhatsApp.',
  '131049': 'A Meta limitou mensagens de marketing para esta pessoa (ela já recebeu muitas). Tente mais tarde ou use um modelo de utilidade.',
  '131047': 'Passaram mais de 24 horas desde a última mensagem do cliente: só modelo aprovado pode ser enviado.',
  '131026': 'Não foi possível entregar: o número pode não ter WhatsApp ou a pessoa usa uma versão antiga do aplicativo.',
  '131050': 'A pessoa pediu para não receber mensagens de marketing desta empresa.',
  '131051': 'Tipo de mensagem não suportado.',
  '131053': 'Não foi possível enviar o arquivo.',
  '131056': 'Muitas mensagens para o mesmo número em pouco tempo. Aguarde um pouco.',
  '130472': 'O número do cliente faz parte de um teste da Meta e não recebeu a mensagem.',
  '132000': 'O número de variáveis do modelo não confere com o modelo aprovado.',
  '132001': 'O modelo não existe ou não está aprovado neste idioma.',
  '132005': 'O texto do modelo ficou longo demais com as variáveis preenchidas.',
  '132007': 'O modelo viola a política da Meta.',
  '132012': 'As variáveis do modelo estão em formato que a Meta não aceita.',
  '132015': 'O modelo foi pausado pela Meta por baixa qualidade.',
  '132016': 'O modelo foi desativado pela Meta.',
  '133010': 'O número da empresa não está registrado na API do WhatsApp.',
  '368': 'A conta foi restrita temporariamente pela Meta por violação de política.',
};

export type WhatsAppFailure = { code: string | null; title: string | null; detail: string | null };

export function parseWhatsAppFailure(errors: unknown): WhatsAppFailure | null {
  const first = Array.isArray(errors) ? errors[0] : null;
  if (!first || typeof first !== 'object') return null;
  const value = first as Record<string, unknown>;
  const code = value.code !== undefined && value.code !== null ? String(value.code).slice(0, 20) : null;
  const title = typeof value.title === 'string' ? value.title.slice(0, 200) : typeof value.message === 'string' ? value.message.slice(0, 200) : null;
  const data = value.error_data && typeof value.error_data === 'object' ? value.error_data as Record<string, unknown> : null;
  const detail = typeof data?.details === 'string' ? data.details.slice(0, 300) : null;
  return code || title ? { code, title, detail } : null;
}

export function whatsappFailureText(code: string | null | undefined, title?: string | null) {
  if (code && REASONS[code]) return REASONS[code];
  if (title) return `A Meta não entregou: ${title}${code ? ` (código ${code})` : ''}.`;
  return code ? `A Meta não entregou a mensagem (código ${code}).` : 'A Meta não entregou a mensagem.';
}
