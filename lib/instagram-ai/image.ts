import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { sniffAttachmentMimeType } from '@/lib/flip-ai/chat-attachment';
import { instagramMediaUrl } from './image-rules';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;

const DESCRIBER_INSTRUCTIONS = [
  'Você ajuda a atendente de um escritório de advocacia a entender uma imagem enviada por um cliente no Instagram.',
  'Descreva em até 2 frases curtas o que aparece na imagem e o que a pessoa provavelmente quer mostrar.',
  'Se for um documento, diga qual documento é (por exemplo: carteira de trabalho, carta do INSS, certidão de nascimento) e se está legível.',
  'Se for um print de tela (conversa, aplicativo, número de telefone, extrato), diga o que o print mostra.',
  'Nunca transcreva números de CPF, RG, contas, senhas ou outros dados pessoais. Responda em português.',
].join('\n');

async function downloadImage(firstUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // Meta's address may forward to another Meta server; any other destination is refused.
    let url: string | null = firstUrl;
    let response: Response | null = null;
    for (let hop = 0; hop < 4 && url; hop += 1) {
      response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'manual' });
      if (response.status < 300 || response.status >= 400) break;
      const next = response.headers.get('location');
      url = next ? instagramMediaUrl(new URL(next, url).toString()) : null;
      response = null;
    }
    if (!response || !response.ok) return null;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return bytes;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * A short description of a photo sent on the Direct, read once per message and kept on it, so
 * the attendant can answer about it. Returns null when the photo cannot be read.
 */
export async function describeInstagramImage(input: {
  tenantId: string;
  agentId: string;
  conversationId: string;
  connectionId: string;
  message: { id: string; metadata: Prisma.JsonValue | null };
}): Promise<string | null> {
  const metadata = input.message.metadata && typeof input.message.metadata === 'object' && !Array.isArray(input.message.metadata)
    ? input.message.metadata as Record<string, unknown> : {};
  if (typeof metadata.imageDescription === 'string' && metadata.imageDescription.trim()) return metadata.imageDescription;
  const url = instagramMediaUrl(metadata.mediaUrl);
  if (!url) return null;

  const bytes = await downloadImage(url);
  if (!bytes) return null;
  const mime = sniffAttachmentMimeType(bytes);
  if (!mime || !mime.startsWith('image/')) return null;
  const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

  let description: string | null = null;
  let usage: { model: string; inputTokens: number; outputTokens: number } | null = null;
  try {
    const model = (await getActiveFlipAiTextModel()).model;
    const result = await streamOpenAiText({
      instructions: DESCRIBER_INSTRUCTIONS,
      messages: [{ role: 'user', content: [
        { type: 'input_text', text: 'Descreva esta imagem enviada pelo cliente.' },
        { type: 'input_image', image_url: dataUrl },
      ] }],
    }, () => undefined, { model, timeoutMs: 30_000, maxOutputTokens: 200, safetyIdentifier: input.conversationId });
    usage = result;
    description = result.text.replace(/\s+/g, ' ').trim().slice(0, 400) || null;
  } catch {
    description = null;
  }

  if (usage) {
    try {
      const event = await prisma.flipAiUsageEvent.create({
        data: {
          tenantId: input.tenantId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          requestKey: `instagram-image:${input.message.id}`,
          operation: 'image_description',
          provider: 'openai',
          model: usage.model,
          status: 'confirmed',
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          units: 1,
          metadata: { channel: 'instagram', instagramConnectionId: input.connectionId } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await settleFlipAiUsageCharge({ tenantId: input.tenantId, eventId: event.id });
    } catch {
      // A photo read twice is not charged twice.
    }
  }

  if (description) {
    // Kept on the message, so the next answers do not read (or charge) the same photo again.
    await prisma.message.updateMany({
      where: { id: input.message.id, tenantId: input.tenantId },
      data: { metadata: { ...metadata, imageDescription: description } as Prisma.InputJsonValue },
    }).catch(() => undefined);
  }
  return description;
}
