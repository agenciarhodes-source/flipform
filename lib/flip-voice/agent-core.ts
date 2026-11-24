/**
 * Pure Flip Voice Core / ElevenAgents configuration.
 * Does not create an agent, start calls or read company data.
 *
 * Agent tools are deliberately empty in PR #636: CRM tools require independently
 * authorized webhook operations and session binding (the next PR).
 */
import { FLIP_VOICE_DEFAULTS } from './policy';

export type VoiceScope = 'tts' | 'voice_calls';

export type ApprovedVoice = {
  tenantId: string;
  profileId: string;
  provider: string;
  providerVoiceId: string;
  profileStatus: string;
  consentStatus: string;
  consentScopes: string[];
  consentEvidenceHash: string;
  consentVerifiedAt: Date | null;
  consentExpiresAt: Date | null;
  consentRevokedAt: Date | null;
};

export class FlipVoiceCoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'FlipVoiceCoreError';
  }
}

const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{10,80}$/;
const EVIDENCE_PATTERN = /^[a-f0-9]{64}$/i;

export function validateApprovedVoice(
  voice: ApprovedVoice,
  expectedTenantId: string,
  requestedScope: VoiceScope,
  now: Date = new Date(),
): void {
  if (!expectedTenantId.trim() || voice.tenantId !== expectedTenantId) {
    throw new FlipVoiceCoreError('TENANT_MISMATCH');
  }
  if (voice.provider !== 'elevenlabs' || !VOICE_ID_PATTERN.test(voice.providerVoiceId)) {
    throw new FlipVoiceCoreError('VOICE_PROVIDER_INVALID');
  }
  if (voice.profileStatus !== 'active' || voice.consentStatus !== 'verified' ||
      !EVIDENCE_PATTERN.test(voice.consentEvidenceHash) ||
      !voice.consentVerifiedAt || voice.consentVerifiedAt.getTime() > now.getTime() ||
      voice.consentRevokedAt !== null ||
      (voice.consentExpiresAt !== null && voice.consentExpiresAt.getTime() <= now.getTime()) ||
      !voice.consentScopes.includes(requestedScope)) {
    throw new FlipVoiceCoreError('VOICE_CONSENT_REQUIRED');
  }
}

/**
 * These guardrails are part of the prompt AND must be independently enforced in
 * server-side services. The prompt alone does not authorize CRM actions.
 */
export const FLIP_VOICE_SYSTEM_GUARDRAILS = [
  'Você é um assistente virtual da empresa, não uma pessoa. Identifique-se claramente como IA no início da conversa.',
  'Fale português brasileiro com naturalidade. Uma pergunta por vez; respostas curtas e respeitosas.',
  'Nunca afirme que é o titular da voz nem simule que ele gravou pessoalmente a ligação.',
  'Não invente dados do cliente, situação cadastral, critérios legais, valores, documentos ou ações no CRM.',
  'Confirme informações ambíguas. Nunca presuma enquadramento urbano ou rural para benefícios.',
  'Não prometa aprovação de benefícios, resultado de ações, reembolsos ou resultados jurídicos.',
  'Encaminhe pedidos de atendimento humano e casos que exijam julgamento profissional.',
  'Não peça senhas, códigos de verificação, dados bancários completos ou informações sensíveis desnecessárias.',
  'Jamais execute alterações, agendamentos, envio de documentos ou qualquer ação externa sem uma ferramenta autorizada e confirmação de sucesso.',
  'Se houver falha, explique que registrará o pedido de retorno quando a ferramenta permitir, sem alegar que ele foi registrado.',
  'Se o cliente pedir para não receber novas ligações, respeite, não insista e encerre cordialmente.',
].join('\n');

export type VoiceAgentDraft = {
  name: string;
  platform_settings: {
    auth: { enable_auth: true };
    call_limits: { agent_concurrency_limit: 1; daily_limit: 5 };
    trust_context: 'low';
  };
  conversation_config: {
    agent: {
      language: 'pt';
      first_message: string;
      prompt: {
        prompt: string;
        llm: 'gpt-6-luna' | 'custom-llm';
        reasoning_effort: 'none';
        max_tokens: number;
        tools: [];
        custom_llm?: {
          url: 'https://api.openai.com/v1/chat/completions';
          model_id: 'gpt-6-luna';
          api_type: 'chat_completions';
          api_key: { secret_id: string };
        };
      };
    };
    tts: { voice_id: string; model_id: 'eleven_v4_turbo' };
    turn: { turn_eagerness: 'normal' };
    conversation: { max_duration_seconds: number };
  };
};

export function buildFlipVoiceAgentDraft(input: {
  tenantId: string;
  voice: ApprovedVoice;
  businessDisplayName: string;
  businessInstructions: string;
  testOnly: true;
  // ElevenLabs secret reference ONLY; NEVER pass the OpenAI bearer secret.
  openAiSecretId?: string;
  maxCallSeconds?: number;
  now?: Date;
}): VoiceAgentDraft {
  validateApprovedVoice(input.voice, input.tenantId, 'voice_calls', input.now);
  if (input.testOnly !== true) throw new FlipVoiceCoreError('TEST_ONLY_REQUIRED');
  const name = input.businessDisplayName.trim().slice(0, 60);
  if (name.length < 2) throw new FlipVoiceCoreError('BUSINESS_NAME_INVALID');
  if (input.businessInstructions.length > 4000) throw new FlipVoiceCoreError('INSTRUCTIONS_TOO_LONG');
  if (input.openAiSecretId !== undefined && !/^[a-zA-Z0-9_-]{8,100}$/.test(input.openAiSecretId)) {
    throw new FlipVoiceCoreError('OPENAI_SECRET_REFERENCE_INVALID');
  }
  const duration = input.maxCallSeconds ?? FLIP_VOICE_DEFAULTS.maxCallSeconds;
  if (!Number.isInteger(duration) || duration < 30 || duration > 300) {
    throw new FlipVoiceCoreError('CALL_DURATION_INVALID');
  }
  const prompt = [
    'Atendimento telefônico da empresa ' + name + '.',
    FLIP_VOICE_SYSTEM_GUARDRAILS,
    'Informações complementares fornecidas pela empresa (não são permissão de execução):',
    input.businessInstructions || 'Nenhuma informação adicional fornecida.',
  ].join('\n\n');
  return {
    name: ('Flip Voice TEST - ' + name).slice(0, 78),
    platform_settings: {
      auth: { enable_auth: true },
      call_limits: { agent_concurrency_limit: 1, daily_limit: 5 },
      trust_context: 'low',
    },
    conversation_config: {
      agent: {
        language: 'pt',
        first_message: 'Olá! Você ligou para ' + name + '. Sou uma assistente virtual de inteligência artificial. Como posso ajudar?',
        prompt: {
          prompt,
          llm: input.openAiSecretId ? 'custom-llm' : 'gpt-6-luna',
          reasoning_effort: 'none',
          max_tokens: 220,
          tools: [],
          ...(input.openAiSecretId ? { custom_llm: {
            url: 'https://api.openai.com/v1/chat/completions' as const,
            model_id: 'gpt-6-luna' as const,
            api_type: 'chat_completions' as const,
            api_key: { secret_id: input.openAiSecretId },
          }} : {}),
        },
      },
      tts: { voice_id: input.voice.providerVoiceId, model_id: 'eleven_v4_turbo' },
      turn: { turn_eagerness: 'normal' },
      conversation: { max_duration_seconds: duration },
    },
  };
}
