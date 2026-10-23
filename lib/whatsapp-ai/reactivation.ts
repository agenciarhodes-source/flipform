import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { streamOpenAiText } from '@/lib/flip-ai/openai-responses';
import { getActiveFlipAiTextModel } from '@/lib/flip-ai/text-model-setting';
import { getFlipAiCreditBalanceForTenant } from '@/lib/flip-ai/credits';
import { settleFlipAiUsageCharge } from '@/lib/flip-ai/usage-billing';
import { enqueueAndDispatchWhatsAppTextMessage } from '@/lib/meta/whatsapp-outbound';
import { isTestPhoneNumber } from './eligibility';
import {
  cleanReactivationText,
  REACTIVATION_AFTER_HOURS,
  REACTIVATION_LAST_MINUTE,
  reactivationDue,
  reactivationKey,
} from './reactivation-rules';

const OPERATION = 'whatsapp_reactivation';

function firstName(value: string | null | undefined) {
  const name = (value || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/)[0] || '';
  return name.length >= 2 ? name : null;
}

async function transcript(tenantId: string, conversationId: string) {
  const messages = await prisma.message.findMany({
    where: { tenantId, conversationId },
    orderBy: { createdAt: 'desc' },
    take: 14,
    select: { direction: true, type: true, text: true },
  });
  return messages.reverse().map((message) => {
    const who = message.direction === 'inbound' ? 'Cliente' : 'Empresa';
    const body = message.text?.trim() || (message.type !== 'text' ? `[${message.type}]` : '');
    return body ? `${who}: ${body.slice(0, 400)}` : '';
  }).filter(Boolean).join('\n');
}

/**
 * "Mensagem de reativação": for each number with the option on, conversations where the company
 * spoke last and the customer has been silent for 23 hours get one cordial reminder of where they
 * stopped, written by the AI and sent inside the free 24-hour window. Called by the scheduler.
 */
export async function sweepWhatsAppReactivations(now = new Date()) {
  const numbers = await prisma.tenantWhatsAppAiSettings.findMany({
    where: { enabled: true, reactivationEnabled: true, agentId: { not: null }, connection: { status: 'connected' } },
    select: { tenantId: true, agentId: true, liveEnabled: true, testPhoneNumbers: true, connection: { select: { phoneNumberId: true } } },
  });
  let sent = 0;
  for (const number of numbers) {
    const wallet = await getFlipAiCreditBalanceForTenant(number.tenantId).catch(() => null);
    if (!wallet?.available || wallet.balanceCredits <= 0) continue;
    const agent = await prisma.flipAiAgent.findFirst({
      where: { id: number.agentId!, tenantId: number.tenantId, status: 'published' },
      select: { id: true, name: true, tenant: { select: { name: true } } },
    });
    if (!agent) continue;

    const candidates = await prisma.conversation.findMany({
      where: {
        tenantId: number.tenantId, provider: 'meta', channel: 'whatsapp',
        lastInboundAt: {
          lte: new Date(now.getTime() - REACTIVATION_AFTER_HOURS * 3_600_000),
          gte: new Date(now.getTime() - REACTIVATION_LAST_MINUTE * 60_000),
        },
      },
      orderBy: { lastInboundAt: 'asc' },
      take: 30,
      select: {
        id: true, lastInboundAt: true, lastOutboundAt: true,
        externalContactIdentity: { select: { externalUserId: true, displayName: true } },
        lead: { select: { name: true, status: true, stage: { select: { name: true } } } },
        messages: {
          where: { direction: 'inbound' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { metadata: true },
        },
      },
    });

    for (const conversation of candidates) {
      if (!reactivationDue({
        lastInboundAt: conversation.lastInboundAt,
        lastOutboundAt: conversation.lastOutboundAt,
        leadStatus: conversation.lead ? String(conversation.lead.status) : null,
      }, now)) continue;
      // Only conversations of this number, and only customers the AI may talk to.
      const inboundMeta = conversation.messages[0]?.metadata as Record<string, unknown> | null;
      if (inboundMeta?.phoneNumberId && inboundMeta.phoneNumberId !== number.connection.phoneNumberId) continue;
      if (!number.liveEnabled && !isTestPhoneNumber(number.testPhoneNumbers, conversation.externalContactIdentity.externalUserId)) continue;

      // One reminder per silence: the usage record is the lock (its request key is unique).
      const requestKey = reactivationKey(conversation.id, conversation.lastInboundAt!);
      let eventId: string;
      try {
        eventId = (await prisma.flipAiUsageEvent.create({
          data: {
            tenantId: number.tenantId, agentId: agent.id, conversationId: conversation.id, requestKey,
            operation: OPERATION, provider: 'openai', model: 'pending', status: 'processing', units: 1,
            metadata: { channel: 'whatsapp' } as Prisma.InputJsonValue,
          },
          select: { id: true },
        })).id;
      } catch {
        continue;
      }

      try {
        const history = await transcript(number.tenantId, conversation.id);
        const name = firstName(conversation.lead?.name) || firstName(conversation.externalContactIdentity.displayName);
        const model = (await getActiveFlipAiTextModel()).model;
        const result = await streamOpenAiText({
          instructions: [
            `Você é a assistente de atendimento de ${agent.tenant.name} no WhatsApp.`,
            'O cliente parou de responder há quase um dia. Escreva UMA mensagem curta de reativação (no máximo 3 frases curtas, até 300 caracteres).',
            `${name ? `Chame o cliente de ${name}. ` : ''}Seja cordial e leve: retome em poucas palavras o ponto exato em que a conversa parou e o próximo passo que estava combinado, e convide a pessoa a responder.`,
            conversation.lead?.stage?.name ? `Momento do atendimento (não cite este nome): ${conversation.lead.stage.name}.` : '',
            'Não se apresente de novo, não pressione, não prometa resultado, prazo nem valor, não invente fatos que não estão na conversa e não use listas.',
            'Escreva só a mensagem, em português do Brasil, pronta para enviar.',
          ].filter(Boolean).join('\n'),
          messages: [{ role: 'user', content: history || 'Sem histórico de texto.' }],
        }, () => undefined, { model, timeoutMs: 25_000, maxOutputTokens: 200, safetyIdentifier: conversation.id });
        const text = cleanReactivationText(result.text);
        if (!text) throw new Error('empty');

        const delivery = await enqueueAndDispatchWhatsAppTextMessage({
          tenantId: number.tenantId,
          conversationId: conversation.id,
          requestedByUserId: '',
          text,
          idempotencyKey: requestKey,
          aiSender: { agentId: agent.id, agentName: agent.name },
        });
        await prisma.flipAiUsageEvent.update({
          where: { id: eventId },
          data: {
            model: result.model, status: 'confirmed', inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            metadata: { channel: 'whatsapp', delivery: delivery.status } as Prisma.InputJsonValue,
          },
        });
        await settleFlipAiUsageCharge({ tenantId: number.tenantId, eventId }).catch(() => undefined);
        if (delivery.status !== 'failed') {
          sent += 1;
          await prisma.auditLog.create({
            data: {
              tenantId: number.tenantId, entityType: 'conversation', entityId: conversation.id,
              action: 'whatsapp_ai.reactivation_sent', metadata: { hours: REACTIVATION_AFTER_HOURS },
            },
          }).catch(() => undefined);
        }
      } catch {
        await prisma.flipAiUsageEvent.update({ where: { id: eventId }, data: { status: 'failed' } }).catch(() => undefined);
      }
    }
  }
  return { numbers: numbers.length, sent };
}
