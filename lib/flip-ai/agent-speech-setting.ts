import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess } from './access';
import { FLIP_AI_DEFAULT_SPEECH_VOICE, FLIP_AI_SPEECH_VOICES, resolveSpeechVoice, type FlipAiSpeechVoice } from './openai-speech';
import { FLIP_AI_AUDIO_MODES, FLIP_AI_DEFAULT_AUDIO_MODE, resolveAudioMode, type FlipAiAudioMode } from './audio-reply';

/**
 * The voice each attendant uses when a reply is delivered as audio.
 * Kept in its own table, so an attendant without a choice simply uses the default voice.
 */

function isSchemaPending(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2021' || error.code === 'P2022');
}

/** Never throws: any problem reading the choice falls back to the default voice. */
export async function getAgentSpeechVoice(input: { tenantId: string; agentId: string }): Promise<FlipAiSpeechVoice> {
  try {
    const row = await prisma.agentSpeechSetting.findFirst({
      where: { agentId: input.agentId, tenantId: input.tenantId },
      select: { voice: true },
    });
    return resolveSpeechVoice(row?.voice);
  } catch {
    return FLIP_AI_DEFAULT_SPEECH_VOICE;
  }
}

/** Any problem reading the choice means the default, automatic mode; it never fails the chat. */
export async function getAgentAudioMode(input: { tenantId: string; agentId: string }): Promise<FlipAiAudioMode> {
  try {
    const row = await prisma.agentSpeechSetting.findFirst({
      where: { agentId: input.agentId, tenantId: input.tenantId },
      select: { audioMode: true },
    });
    return resolveAudioMode(row?.audioMode);
  } catch {
    return FLIP_AI_DEFAULT_AUDIO_MODE;
  }
}

async function ownedAgent(session: SessionPayload, agentId: string) {
  return prisma.$transaction(async (db) => {
    const { tenantId, userId } = await requireFlipAiAccess(db, session);
    const agent = await db.flipAiAgent.findFirst({ where: { id: agentId, tenantId }, select: { id: true } });
    if (!agent) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
    return { tenantId, userId };
  });
}

export async function readAgentSpeechVoice(session: SessionPayload, agentId: string) {
  const { tenantId } = await ownedAgent(session, agentId);
  return {
    voice: await getAgentSpeechVoice({ tenantId, agentId }),
    voices: [...FLIP_AI_SPEECH_VOICES],
    defaultVoice: FLIP_AI_DEFAULT_SPEECH_VOICE,
    audioMode: await getAgentAudioMode({ tenantId, agentId }),
    audioModes: [...FLIP_AI_AUDIO_MODES],
  };
}

export async function saveAgentSpeechVoice(session: SessionPayload, agentId: string, rawVoice: unknown) {
  const voice = FLIP_AI_SPEECH_VOICES.find((candidate) => candidate === rawVoice);
  if (!voice) throw new FlipAiError('INVALID_VOICE', 400, 'Escolha uma das vozes disponíveis.');
  const { tenantId, userId } = await ownedAgent(session, agentId);
  try {
    await prisma.agentSpeechSetting.upsert({
      where: { agentId },
      update: { voice, updatedById: userId },
      create: { agentId, tenantId, voice, audioMode: FLIP_AI_DEFAULT_AUDIO_MODE, updatedById: userId },
      select: { agentId: true },
    });
  } catch (error) {
    if (isSchemaPending(error)) {
      throw new FlipAiError('VOICE_SETTING_UNAVAILABLE', 503, 'A escolha de voz ainda não está disponível neste ambiente.');
    }
    throw error;
  }
  return { voice };
}

export async function saveAgentAudioMode(session: SessionPayload, agentId: string, rawMode: unknown) {
  const audioMode = FLIP_AI_AUDIO_MODES.find((candidate) => candidate === rawMode);
  if (!audioMode) throw new FlipAiError('INVALID_AUDIO_MODE', 400, 'Escolha uma das opções de áudio.');
  const { tenantId, userId } = await ownedAgent(session, agentId);
  try {
    await prisma.agentSpeechSetting.upsert({
      where: { agentId },
      update: { audioMode, updatedById: userId },
      // An attendant that never chose a voice starts on the default one.
      create: { agentId, tenantId, voice: FLIP_AI_DEFAULT_SPEECH_VOICE, audioMode, updatedById: userId },
      select: { agentId: true },
    });
  } catch (error) {
    if (isSchemaPending(error)) {
      throw new FlipAiError('VOICE_SETTING_UNAVAILABLE', 503, 'A configuração de áudio ainda não está disponível neste ambiente.');
    }
    throw error;
  }
  return { audioMode };
}
