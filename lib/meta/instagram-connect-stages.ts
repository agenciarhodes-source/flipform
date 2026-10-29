/**
 * Where an Instagram connection attempt stopped, shown to the person who connects (and in the logs)
 * so a failure says what to fix. Only a stage name and Meta's numeric error code ever leave the
 * server: never a token, secret or message from Meta.
 */
export const INSTAGRAM_CONNECT_STAGES = [
  'state',
  'rate_limit',
  'no_code',
  'not_ready',
  'authorization_code_exchange',
  'long_lived_token_exchange',
  'profile_validation',
  'messaging_permission_validation',
  'webhook_subscription',
  'save',
] as const;
export type InstagramConnectStage = (typeof INSTAGRAM_CONNECT_STAGES)[number];

export function isInstagramConnectStage(value: unknown): value is InstagramConnectStage {
  return typeof value === 'string' && (INSTAGRAM_CONNECT_STAGES as readonly string[]).includes(value);
}

/** Meta error codes are numbers; anything else is dropped. */
export function safeProviderCode(value: unknown): string | null {
  const text = value == null ? '' : String(value);
  return /^\d{1,6}$/.test(text) ? text : null;
}

/** What the person sees when the connection stops at a stage. */
export function instagramConnectStageMessage(stage: string | null, code: string | null) {
  const suffix = code ? ` (código da Meta: ${code})` : '';
  switch (stage) {
    case 'state':
      return 'A tentativa de conexão expirou ou foi aberta em outra janela. Clique em “Conectar Instagram” de novo.';
    case 'rate_limit':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'no_code':
      return 'O Instagram não devolveu a autorização. Tente conectar de novo.';
    case 'not_ready':
      return 'A configuração do Instagram da plataforma está incompleta. Avise o administrador do FlipForm.';
    case 'authorization_code_exchange':
      return `A Meta recusou a autorização${suffix}. Confira, no Super Admin, o Instagram App ID e o App Secret e, no painel da Meta, o endereço de retorno do login.`;
    case 'long_lived_token_exchange':
      return `A Meta recusou a renovação do acesso${suffix}. Confira o Instagram App Secret no Super Admin.`;
    case 'profile_validation':
      return `Não foi possível ler o perfil${suffix}. A conta precisa ser profissional (Empresa ou Criador de conteúdo).`;
    case 'messaging_permission_validation':
      return `A Meta não liberou as mensagens desta conta${suffix}. Enquanto o app não tiver aprovação da Meta, a conta precisa ser testadora do app e ter aceitado o convite.`;
    case 'webhook_subscription':
      return `A Meta não ativou o recebimento das mensagens desta conta${suffix}. Confira o webhook do Instagram no painel da Meta.`;
    case 'save':
      return 'A conta foi autorizada, mas não foi possível salvar a conexão. Tente de novo.';
    default:
      return 'Não foi possível concluir a conexão com o Instagram agora.';
  }
}
