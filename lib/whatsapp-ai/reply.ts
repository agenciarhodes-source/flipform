import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolvePublicFlipAiRuntime, type PublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import {
  buildPublicChatContext,
  completePublicChatTurn,
  failPublicChatTurn,
  parsePublicChatDecision,
  PUBLIC_CHAT_DECISION_FORMAT,
  type PreparedPublicChatTurn,
} from '@/lib/flip-ai/public-chat';
import {
  assertFlipAiConversationRuntimeReady,
  executeFlipAiConversationResponse,
  FlipAiConversationRuntimeError,
} from '@/lib/flip-ai/conversation-runtime';
import { OpenAiResponseError } from '@/lib/flip-ai/openai-responses';
import { applyBrainFinalQualification } from '@/lib/flip-ai/qualification';
import { enforceContactMoment } from '@/lib/flip-ai/contact-timing';
import { FLIP_AI_HUMAN_CONVERSATION_POLICY_VERSION } from '@/lib/flip-ai/conversation-style';
import { transcribeVoiceNote } from '@/lib/flip-ai/openai-transcription';
import { chargeAudioUsage, hasCreditsForAudio } from '@/lib/flip-ai/audio-usage';
import { FLIP_AI_VOICE_TRANSCRIPTION_OPERATION, resolveTranscriptionUsage } from '@/lib/flip-ai/audio-usage-policy';
import { connectionAccessToken } from '@/lib/meta/whatsapp-connection-token';
import { getPlatformWhatsAppRuntimeCredentials } from '@/lib/meta/platform-settings';
import { downloadWhatsAppMedia } from '@/lib/meta/whatsapp-media';
import { showWhatsAppTyping } from '@/lib/meta/whatsapp-typing';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { isConversationAiPaused } from './pause';
import { handleWhatsAppAiQualification, isLeadNameConfirmed, whatsappContactName } from './lead';
import { suggestStageFromConversation } from './stage-suggestions';
import { conversationDocumentContext, documentNote, readWhatsAppDocument } from './documents';
import { decideWhatsAppAiAnswer, nameFromReply, toWhatsAppText, withWhatsAppSourceLinks, WHATSAPP_AI_QUIET_SECONDS, WHATSAPP_AI_TIMEZONE } from './eligibility';

type ExecuteTurn = Extract<PreparedPublicChatTurn, { mode: 'execute' }>;
export type WhatsAppAiOutcome = { replied: boolean; reason: string };

const MAX_VOICE_NOTE_BYTES = 25 * 1024 * 1024;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function metadataOf(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Start of today in Brasília, for the daily credit limit of the number. */
function startOfBrasiliaDay(now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: WHATSAPP_AI_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${day}T00:00:00-03:00`);
}

async function creditsSpentToday(tenantId: string, connectionId: string, now: Date) {
  const rows = await prisma.$queryRaw<Array<{ spent: bigint | number | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(ledger.amount_credits), 0) AS spent
    FROM flip_ai_credit_ledger AS ledger
    JOIN flip_ai_usage_events AS event ON event.id = ledger.reference_id
    WHERE ledger.tenant_id = ${tenantId}
      AND ledger.entry_type = 'debit'
      AND ledger.created_at >= ${startOfBrasiliaDay(now)}
      AND event.metadata->>'whatsappConnectionId' = ${connectionId}
  `);
  return Number(rows[0]?.spent || 0);
}

async function mediaAccessToken(accessTokenEncrypted: string | null) {
  return connectionAccessToken(accessTokenEncrypted)
    || (await getPlatformWhatsAppRuntimeCredentials())?.systemUserAccessToken
    || null;
}

const MEDIA_NOTES: Record<string, string> = {
  image: '[O cliente enviou uma foto. Agradeça e diga que ela foi recebida; o conteúdo será analisado pela equipe.]',
  document: '[O cliente enviou um documento. Agradeça e diga que ele foi recebido; o conteúdo será analisado pela equipe.]',
  video: '[O cliente enviou um vídeo. Diga que foi recebido.]',
  sticker: '[O cliente enviou uma figurinha.]',
};

/** How the AI introduces itself: the company's own text, or "assistente de <empresa>". */
export function whatsappIntroduction(introduction: string | null | undefined, companyName: string) {
  const text = (introduction || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return text || `assistente de ${companyName}`;
}

function whatsappInstructions(input: {
  agentName: string;
  companyName: string;
  introduction: string;
  firstReply: boolean;
  /** The name the person already confirmed, when there is one. */
  knownName: string | null;
  /** The name on the person's WhatsApp profile, to confirm. */
  profileName: string | null;
}) {
  return [
    `CANAL WHATSAPP: você está respondendo pelo WhatsApp oficial de ${input.companyName}.`,
    'Escreva como numa conversa de WhatsApp: mensagens curtas e naturais, no máximo um ou dois parágrafos,',
    'sem títulos nem listas longas. Para destacar algo, use *texto* (um asterisco de cada lado).',
    'O telefone do cliente já é conhecido, porque ele está falando por este WhatsApp: nunca peça o número de telefone.',
    `APRESENTAÇÃO NO WHATSAPP: neste canal você não usa o nome ${input.agentName} nem nenhum nome próprio; você é a ${input.introduction}.`,
    input.firstReply
      ? `Esta é a sua primeira resposta nesta conversa: apresente-se apenas como ${input.introduction}, sem dizer nome próprio.`
      : 'Não se apresente de novo.',
    'Nunca diga que é uma pessoa. Se o cliente perguntar se está falando com uma pessoa ou um robô, diga com naturalidade que é uma assistente automática.',
    'Se o cliente pedir para falar com alguém da equipe, diga que vai chamar um atendente.',
    input.knownName
      ? `NOME: o cliente já disse que prefere ser chamado de "${input.knownName}". Chame-o assim e NÃO pergunte o nome de novo.`
      : `NOME PENDENTE (prioridade): você ainda não sabe como a pessoa prefere ser chamada. Nesta resposta, responda a dúvida dela em no máximo uma frase e termine perguntando ${input.profileName ? `"Posso te chamar de ${input.profileName.split(' ')[0]}?"` : '"Como você prefere ser chamado(a)?"'}. Só continue a triagem depois que ela responder. Nunca deixe essa pergunta para o fim da conversa.`,
    'Quando a pessoa disser o nome, registre em identity.name. O telefone já é o deste WhatsApp.',
    // Global for every company on WhatsApp; what is specific to a business is in its Master Markdown.
    'SEU PAPEL É A TRIAGEM (prioridade máxima) E, DEPOIS, O FECHAMENTO: primeiro entenda o perfil e a situação do cliente com as'
      + ' perguntas certas, sem dar aula nem consulta; depois entenda em que momento ele está e conduza ao próximo passo que fecha'
      + ' o negócio. Uma pergunta por mensagem (no máximo duas bem curtas), sempre reagindo ao que ele acabou de dizer: é uma'
      + ' conversa, não um questionário.',
    'SEM EXPLICAÇÕES DESNECESSÁRIAS: não explique por conta própria como funciona um produto, serviço, regra ou direito. Só explique'
      + ' se o cliente perguntar diretamente, e então em uma frase, voltando em seguida para a próxima pergunta.',
    'NÃO PRESUMA NADA: use apenas o que o cliente disse com as próprias palavras. Não dê como certo nenhum fato que ele não confirmou'
      + ' (por exemplo, que já comprou antes, que tem o documento, que o problema já aconteceu, que já recebeu uma resposta negativa).'
      + ' Na dúvida, pergunte. Se a mensagem for só um cumprimento ("oi", "bom dia"), cumprimente e pergunte com o que pode ajudar;'
      + ' se ele veio por um anúncio de um assunto, confirme primeiro se é isso que procura, sem explicar o assunto.',
    'ORDEM DA TRIAGEM: 1) o que a pessoa procura ou o que aconteceu; 2) a situação atual dela ligada a isso; 3) os poucos dados'
      + ' que decidem se ela tem o perfil (conforme a base de conhecimento da empresa); 4) se ela quer seguir.'
      + ' Leia o histórico da conversa e não repita perguntas já respondidas. Se a pessoa não se encaixar no que procurou, não'
      + ' encerre de imediato: veja com perguntas se outro produto, serviço ou tese da empresa serve para ela, e só então encaminhe.',
    'MOMENTO DE QUALIFICAR: assim que os dados que decidem o caso estiverem confirmados pelo cliente, não estique a conversa:'
      + ' combine o próximo passo do fechamento (o que a base de conhecimento indicar: documentos, provas, visita, reunião, proposta'
      + ' ou contratação), diga que a equipe dá sequência e preencha a qualificação final. Nunca qualifique com base em suposição.'
      + ' A mudança de etapa do lead no funil usa o que você registrar aqui, por isso registre só fatos que o cliente confirmou.',
    'QUALIFICAÇÃO: quando já houver informação suficiente para a equipe avaliar o caso, preencha a qualificação final.'
      + ' SEMPRE que você disser que vai encaminhar o caso para a equipe, um atendente ou um especialista, preencha a qualificação'
      + ' final NESSA MESMA resposta: "qualified" quando há perfil e a pessoa quer seguir; "nurture" quando falta informação'
      + ' ou decisão; "disqualified" só quando claramente nada que a empresa oferece serve para o caso.',
  ].join('\n');
}

/**
 * The Flip AI answers a WhatsApp conversation, in place of a first attendant. It runs a few seconds
 * after the customer's last message and only when nobody has answered since. Leads and conversion
 * events are not created here.
 */
export async function replyToWhatsAppConversation(input: {
  tenantId: string;
  conversationId: string;
  /** The message that started this run; a newer one takes over the reply. */
  inboundMessageId: string;
  trigger: 'message' | 'no_reply_sweep' | 'handback';
  now?: Date;
}): Promise<WhatsAppAiOutcome> {
  const now = input.now || new Date();
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId, provider: 'meta', channel: 'whatsapp' },
    select: {
      id: true, aiPausedAt: true,
      leadId: true,
      externalContactIdentity: { select: { externalUserId: true, displayName: true } },
      lead: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!conversation) return { replied: false, reason: 'conversation_not_found' };

  // Only the latest customer message answers, and only if nobody (person or AI) answered after it.
  const [latestInbound, latestOutbound] = await Promise.all([
    prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'inbound' },
      orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, externalMessageId: true, providerTimestamp: true, createdAt: true, metadata: true },
    }),
    prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'outbound' },
      orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, providerTimestamp: true, createdAt: true },
    }),
  ]);
  if (!latestInbound || latestInbound.id !== input.inboundMessageId) return { replied: false, reason: 'newer_message' };
  const inboundAt = latestInbound.providerTimestamp || latestInbound.createdAt;
  const outboundAt = latestOutbound ? latestOutbound.providerTimestamp || latestOutbound.createdAt : null;
  if (outboundAt && outboundAt >= inboundAt) return { replied: false, reason: 'already_answered' };
  // The free reply window is 24 hours from the customer's last message.
  if (now.getTime() - inboundAt.getTime() > 23 * 3_600_000) return { replied: false, reason: 'window_closed' };

  const phoneNumberId = metadataOf(latestInbound.metadata).phoneNumberId;
  const connection = typeof phoneNumberId === 'string'
    ? await prisma.tenantWhatsAppConnection.findFirst({
      where: { tenantId: input.tenantId, phoneNumberId, status: 'connected' },
      select: { id: true, wabaId: true, accessTokenEncrypted: true, aiSettings: true },
    })
    : null;
  const settings = connection?.aiSettings;
  if (!connection || !settings) return { replied: false, reason: 'not_configured' };

  const decision = decideWhatsAppAiAnswer({
    settings: {
      enabled: settings.enabled,
      agentId: settings.agentId,
      scheduleMode: settings.scheduleMode,
      businessHours: settings.businessHours as unknown as { days: number[]; start: string; end: string } | null,
      liveEnabled: settings.liveEnabled,
      testPhoneNumbers: settings.testPhoneNumbers,
    },
    customerWaId: conversation.externalContactIdentity.externalUserId,
    now,
    trigger: input.trigger,
  });
  if (!decision.answer) return { replied: false, reason: decision.reason };
  if (isConversationAiPaused(conversation, settings.resumeAfterHours, now)) return { replied: false, reason: 'paused' };
  if (settings.dailyCreditLimit && await creditsSpentToday(input.tenantId, connection.id, now) >= settings.dailyCreditLimit) {
    return { replied: false, reason: 'daily_limit' };
  }

  // The agent chosen for the number, only while it is published and the company may use the Flip AI.
  const endpoint = await prisma.flipAiEndpoint.findFirst({
    where: { tenantId: input.tenantId, agentId: settings.agentId! },
    select: { slug: true },
  });
  const runtime: PublicFlipAiRuntime | null = endpoint ? await resolvePublicFlipAiRuntime({ slug: endpoint.slug }) : null;
  if (!runtime || runtime.tenantId !== input.tenantId) return { replied: false, reason: 'agent_unavailable' };

  try {
    await assertFlipAiConversationRuntimeReady({ tenantId: input.tenantId });
  } catch {
    return { replied: false, reason: 'runtime_unavailable' };
  }

  // "digitando…" for the customer while the answer is prepared (also marks the message as read).
  const typingToken = await mediaAccessToken(connection.accessTokenEncrypted).catch(() => null);
  if (typingToken && typeof phoneNumberId === 'string') {
    void showWhatsAppTyping({ phoneNumberId, accessToken: typingToken, messageId: latestInbound.externalMessageId });
  }

  // Everything the customer sent since the last answer is read together, as one turn.
  const pending = await prisma.message.findMany({
    where: {
      tenantId: input.tenantId,
      conversationId: conversation.id,
      direction: 'inbound',
      ...(outboundAt ? { OR: [{ providerTimestamp: { gt: outboundAt } }, { providerTimestamp: null, createdAt: { gt: outboundAt } }] } : {}),
    },
    orderBy: [{ providerTimestamp: 'asc' }, { createdAt: 'asc' }],
    take: 20,
    select: { id: true, type: true, text: true, metadata: true },
  });

  const parts: string[] = [];
  const extraUserNotes: string[] = [];
  let inputMode: 'text' | 'voice' = 'text';
  for (const message of pending) {
    if (message.text?.trim()) parts.push(message.text.trim());
    if (message.type === 'audio') {
      const transcript = await transcribeWhatsAppVoiceNote({
        tenantId: input.tenantId,
        agentId: runtime.id,
        connectionId: connection.id,
        accessTokenEncrypted: connection.accessTokenEncrypted,
        message,
      });
      if (transcript) {
        inputMode = 'voice';
        parts.push(transcript);
        extraUserNotes.push(`[Áudio do cliente, transcrito]: ${transcript}`);
      } else {
        extraUserNotes.push('[O cliente enviou um áudio que não pôde ser ouvido. Peça, com gentileza, que escreva a mensagem.]');
      }
    } else if (message.type === 'image' || message.type === 'document') {
      // Checked against the company's document lists; only the result is kept.
      const token = await mediaAccessToken(connection.accessTokenEncrypted);
      const checked = token
        ? await readWhatsAppDocument({
          tenantId: input.tenantId,
          agentId: runtime.id,
          conversationId: conversation.id,
          connectionId: connection.id,
          accessToken: token,
          message,
        }).catch(() => null)
        : null;
      extraUserNotes.push(documentNote(checked, MEDIA_NOTES[message.type]));
    } else if (MEDIA_NOTES[message.type]) {
      extraUserNotes.push(MEDIA_NOTES[message.type]);
    }
  }
  const turnText = (parts.join('\n') || extraUserNotes.join('\n') || 'Olá').slice(0, 2_000);
  if (input.trigger === 'handback') {
    extraUserNotes.push('[Nota interna, não mostre ao cliente: a equipe devolveu esta conversa para você. Responda o que o cliente perguntou ou pediu nas últimas mensagens e continue o atendimento de onde parou, sem repetir o que a equipe já disse.]');
  }

  // A Flip AI conversation state binds the conversation to the agent answering it.
  const state = await prisma.flipAiConversationState.upsert({
    where: { conversationId: conversation.id },
    create: { tenantId: input.tenantId, agentId: runtime.id, conversationId: conversation.id, status: 'active' },
    update: {},
  });
  if (state.tenantId !== input.tenantId) return { replied: false, reason: 'state_conflict' };
  if (state.agentId !== runtime.id) {
    await prisma.flipAiConversationState.update({ where: { conversationId: conversation.id }, data: { agentId: runtime.id } });
  }

  const plan = await assertFlipAiConversationRuntimeReady({ tenantId: input.tenantId });
  const requestKey = `whatsapp:${input.tenantId}:${conversation.id}:${latestInbound.id}`;
  const attemptToken = randomUUID();
  let event;
  try {
    event = await prisma.flipAiUsageEvent.create({
      data: {
        tenantId: input.tenantId,
        agentId: runtime.id,
        conversationId: conversation.id,
        requestKey,
        operation: 'chat_response',
        provider: plan.provider,
        model: plan.model,
        status: 'processing',
        units: 1,
        metadata: {
          conversationId: conversation.id,
          messageId: latestInbound.id,
          inputHash: digest(turnText),
          knowledgeIndexId: runtime.knowledgeIndexId,
          attemptToken,
          attemptStartedAt: now.toISOString(),
          phase: 'retrieval',
          runtimeVersion: plan.runtimeVersion,
          runtimeProvider: plan.provider,
          runtimeTask: plan.task,
          runtimeModality: plan.modality,
          modelRouting: plan.modelRouting,
          inputMode,
          humanConversationPolicyVersion: FLIP_AI_HUMAN_CONVERSATION_POLICY_VERSION,
          channel: 'whatsapp',
          whatsappConnectionId: connection.id,
          trigger: input.trigger,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Another run already answers this message (the same notice can arrive twice).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { replied: false, reason: 'duplicate_run' };
    throw error;
  }

  const turn: ExecuteTurn = {
    mode: 'execute',
    tenantId: input.tenantId,
    agentId: runtime.id,
    conversationId: conversation.id,
    requestKey,
    eventId: event.id,
    messageId: latestInbound.id,
    text: turnText,
    inputMode,
    attemptToken,
    knowledgeIndexId: runtime.knowledgeIndexId,
    outboundExternalId: `ai:whatsapp:${event.id}`,
    attribution: undefined,
  };

  try {
    let context = await buildPublicChatContext(runtime, turn);
    const recentOutbound = await prisma.message.findMany({
      where: { tenantId: input.tenantId, conversationId: conversation.id, direction: 'outbound', sentByUserId: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { metadata: true, text: true },
    });
    const aiRepliesSoFar = recentOutbound.filter((message) => typeof metadataOf(message.metadata).aiAgentId === 'string').length;
    const profileName = whatsappContactName(conversation.externalContactIdentity.displayName);
    const nameConfirmed = conversation.leadId
      ? await isLeadNameConfirmed(input.tenantId, conversation.leadId, profileName)
      : false;
    // When the AI's last question was the name, the answer is read here too, not only by the model.
    const nameInAnswer = nameFromReply(recentOutbound[0]?.text, turnText, profileName ? profileName.split(' ')[0] : null);
    const documents = await conversationDocumentContext(input.tenantId, conversation.id).catch(() => null);
    context = {
      ...context,
      instructions: `${context.instructions}\n\n${whatsappInstructions({
        agentName: runtime.name,
        companyName: conversation.tenant.name,
        introduction: whatsappIntroduction(settings.introduction, conversation.tenant.name),
        firstReply: aiRepliesSoFar === 0,
        knownName: nameConfirmed ? whatsappContactName(conversation.lead?.name) : nameInAnswer,
        profileName,
      })}${documents ? `\n\n${documents.text}` : ''}`,
      messages: extraUserNotes.length
        ? [...context.messages, { role: 'user' as const, content: extraUserNotes.join('\n') }]
        : context.messages,
    };

    const raw = await executeFlipAiConversationResponse({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      agentId: runtime.id,
      context,
      textFormat: PUBLIC_CHAT_DECISION_FORMAT,
      timeoutMs: 40_000,
    });
    const parsed = parsePublicChatDecision(raw.text);
    parsed.qualification = applyBrainFinalQualification(parsed.qualification, context.brainAssessment);
    parsed.reply = enforceContactMoment(parsed.reply, context.contactMoment);
    const reply = withWhatsAppSourceLinks(toWhatsAppText(parsed.reply), context.sources);
    if (!reply) throw new OpenAiResponseError('definitive', 'WHATSAPP_AI_EMPTY_REPLY');

    // A person may have answered while the AI was thinking: then the AI stays quiet. Compared by the
    // moment each message was stored, and never counting the last answer that was already there.
    const answeredMeanwhile = await prisma.message.findFirst({
      where: {
        tenantId: input.tenantId, conversationId: conversation.id, direction: 'outbound',
        createdAt: { gt: latestOutbound?.createdAt || new Date(0) },
        ...(latestOutbound ? { id: { not: latestOutbound.id } } : {}),
      },
      select: { id: true },
    });
    const pausedMeanwhile = await prisma.conversation.findFirst({ where: { id: conversation.id }, select: { aiPausedAt: true } });
    if (answeredMeanwhile || (pausedMeanwhile && isConversationAiPaused(pausedMeanwhile, settings.resumeAfterHours, new Date()))) {
      await failPublicChatTurn(turn, { kind: 'definitive', code: 'WHATSAPP_AI_TEAM_ANSWERED' }, 'response');
      return { replied: false, reason: 'team_answered_meanwhile' };
    }

    const sent = await enqueueAndDispatchWhatsAppTextMessage({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      requestedByUserId: '',
      text: reply,
      idempotencyKey: `flipai-${event.id}`,
      aiSender: { agentId: runtime.id, agentName: runtime.name },
    });
    if (sent.status === 'failed') {
      await failPublicChatTurn(turn, { kind: 'definitive', code: 'WHATSAPP_AI_SEND_FAILED' }, 'response');
      return { replied: false, reason: 'send_failed' };
    }

    await completePublicChatTurn(
      turn,
      { ...raw, text: reply },
      parsed,
      context.evidenceMessageIds,
      context.sources,
      context.memorySnapshot,
      context.availabilitySnapshot,
      context.actionEligibility,
      context.actionPermission,
      { recordOutbound: false },
    );
    // A qualified conversation becomes a lead and Meta and Google Ads are told once (pilot only).
    await handleWhatsAppAiQualification({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      runtime,
      classification: parsed.qualification?.classification,
      preferredName: parsed.identity?.name || nameInAnswer,
      whatsappBusinessAccountId: connection.wabaId,
      qualification: parsed.qualification,
      model: raw.model,
      evidenceMessageIds: context.evidenceMessageIds,
    }).catch((error) => console.error('WhatsApp AI lead failed', { errorType: error instanceof Error ? error.name : 'unknown' }));
    // With a lead, the conversation may show it is time for the next stage of the funnel.
    await suggestStageFromConversation({
      tenantId: input.tenantId,
      conversationId: conversation.id,
      agentId: runtime.id,
      mode: settings.stageMode,
    }).catch((error) => console.error('WhatsApp AI stage suggestion failed', { errorType: error instanceof Error ? error.name : 'unknown' }));
    return { replied: true, reason: 'sent' };
  } catch (error) {
    const failure = error instanceof OpenAiResponseError || error instanceof FlipAiConversationRuntimeError
      ? error : new OpenAiResponseError('ambiguous', 'WHATSAPP_AI_RESULT_AMBIGUOUS');
    await failPublicChatTurn(turn, failure, 'response').catch(() => undefined);
    console.error('WhatsApp AI reply failed', { tenantId: input.tenantId, conversationId: conversation.id, code: failure.code });
    return { replied: false, reason: 'failed' };
  }
}

async function transcribeWhatsAppVoiceNote(input: {
  tenantId: string;
  agentId: string;
  connectionId: string;
  accessTokenEncrypted: string | null;
  message: { id: string; metadata: Prisma.JsonValue | null };
}) {
  const mediaId = metadataOf(input.message.metadata).mediaId;
  if (typeof mediaId !== 'string') return null;
  if (!await hasCreditsForAudio(input.tenantId)) return null;
  const accessToken = await mediaAccessToken(input.accessTokenEncrypted);
  if (!accessToken) return null;
  try {
    const media = await downloadWhatsAppMedia({ mediaId, accessToken });
    if (media.bytes.byteLength > MAX_VOICE_NOTE_BYTES) return null;
    const heard = await transcribeVoiceNote({ bytes: media.bytes, mimeType: media.mimeType });
    if (!heard?.text) return null;
    await chargeAudioUsage({
      tenantId: input.tenantId,
      agentId: input.agentId,
      requestKey: `whatsapp-voice:${input.message.id}`,
      operation: FLIP_AI_VOICE_TRANSCRIPTION_OPERATION,
      model: heard.model,
      usage: resolveTranscriptionUsage({ reported: heard.reported, transcriptCharacters: heard.text.length }),
      metadata: { whatsappConnectionId: input.connectionId },
    });
    return heard.text.slice(0, 2_000);
  } catch {
    return null;
  }
}

/**
 * "Devolver para a IA" / "Responder agora com a IA": when the customer's last message is still
 * unanswered, the AI answers it right away instead of waiting for a new message. Outside the 24-hour
 * window WhatsApp only accepts approved templates, so nothing is sent then.
 */
export async function pendingWhatsAppReply(input: { tenantId: string; conversationId: string; now?: Date }) {
  const now = input.now || new Date();
  const [latestInbound, latestOutbound] = await Promise.all([
    prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: input.conversationId, direction: 'inbound' },
      orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, providerTimestamp: true, createdAt: true },
    }),
    prisma.message.findFirst({
      where: { tenantId: input.tenantId, conversationId: input.conversationId, direction: 'outbound' },
      orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { providerTimestamp: true, createdAt: true },
    }),
  ]);
  if (!latestInbound) return { status: 'nothing_pending' as const };
  const inboundAt = latestInbound.providerTimestamp || latestInbound.createdAt;
  const outboundAt = latestOutbound ? latestOutbound.providerTimestamp || latestOutbound.createdAt : null;
  if (outboundAt && outboundAt >= inboundAt) return { status: 'nothing_pending' as const };
  if (now.getTime() - inboundAt.getTime() > 23 * 3_600_000) return { status: 'window_closed' as const };
  return {
    status: 'answering' as const,
    run: () => replyToWhatsAppConversation({
      tenantId: input.tenantId, conversationId: input.conversationId, inboundMessageId: latestInbound.id, trigger: 'handback',
    }),
  };
}

/** Waits for the customer to finish typing, then answers if this is still the latest message. */
export async function replyAfterQuietPeriod(input: { tenantId: string; conversationId: string; inboundMessageId: string }) {
  await new Promise((resolve) => setTimeout(resolve, WHATSAPP_AI_QUIET_SECONDS * 1_000));
  return replyToWhatsAppConversation({ ...input, trigger: 'message' });
}

/**
 * "Quando ninguém responder": conversations the team left without reply for the minutes chosen on
 * the number. Called by the scheduler; each conversation goes through the same checks as above.
 */
export async function sweepUnansweredWhatsAppConversations(now = new Date()) {
  const numbers = await prisma.tenantWhatsAppAiSettings.findMany({
    where: { enabled: true, scheduleMode: 'no_reply', connection: { status: 'connected' } },
    select: { tenantId: true, noReplyMinutes: true },
  });
  let replied = 0;
  for (const number of numbers) {
    const waitingSince = new Date(now.getTime() - number.noReplyMinutes * 60_000);
    const candidates = await prisma.conversation.findMany({
      where: {
        tenantId: number.tenantId,
        provider: 'meta',
        channel: 'whatsapp',
        lastInboundAt: { lte: waitingSince, gte: new Date(now.getTime() - 23 * 3_600_000) },
      },
      orderBy: { lastInboundAt: 'asc' },
      take: 50,
      select: { id: true, lastInboundAt: true, lastOutboundAt: true },
    });
    // Waiting: the customer wrote last and nobody answered after.
    const waiting = candidates
      .filter((candidate) => !candidate.lastOutboundAt || (candidate.lastInboundAt && candidate.lastOutboundAt < candidate.lastInboundAt))
      .slice(0, 10);
    for (const candidate of waiting) {
      const latest = await prisma.message.findFirst({
        where: { tenantId: number.tenantId, conversationId: candidate.id, direction: 'inbound' },
        orderBy: [{ providerTimestamp: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: { id: true },
      });
      if (!latest) continue;
      const outcome = await replyToWhatsAppConversation({
        tenantId: number.tenantId, conversationId: candidate.id, inboundMessageId: latest.id, trigger: 'no_reply_sweep', now,
      }).catch(() => ({ replied: false, reason: 'failed' }));
      if (outcome.replied) replied += 1;
    }
  }
  return { numbers: numbers.length, replied };
}
