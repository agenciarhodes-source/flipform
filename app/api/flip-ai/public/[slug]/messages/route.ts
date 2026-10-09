import { NextRequest, NextResponse } from 'next/server';
import { normalizeHostname, isAdminHostname } from '@/lib/host-routing';
import { FlipAiError } from '@/lib/flip-ai/access';
import { resolvePublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import {
  buildPublicChatContext,
  completePublicChatTurn,
  failPublicChatTurn,
  getOrCreatePublicSessionToken,
  preparePublicChatTurn,
  parsePublicChatDecision,
  PUBLIC_CHAT_DECISION_FORMAT,
} from '@/lib/flip-ai/public-chat';
import { OpenAiResponseError } from '@/lib/flip-ai/openai-responses';
import { toPublicFlipAiErrorMessage } from '@/lib/flip-ai/public-error-message';
import {
  assertFlipAiConversationRuntimeReady,
  executeFlipAiConversationResponse,
  FlipAiConversationRuntimeError,
} from '@/lib/flip-ai/conversation-runtime';
import { captureFlipAiLead, type FlipAiIdentityDecision } from '@/lib/flip-ai/lead-capture';
import { applyBrainFinalQualification, finalizeFlipAiQualification } from '@/lib/flip-ai/qualification';
import { syncFlipAiHumanActionRequest } from '@/lib/flip-ai/human-action-request';
import type { LeadAttributionSnapshot } from '@/lib/leads/ensure-from-conversation';
import type { PublicFlipAiRuntime } from '@/lib/flip-ai/public-agent';
import { ATTRIBUTION_LIMITS, normalizeAttributionString, parseAttributionCookies } from '@/lib/attribution';
import { getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const COOKIE_NAME = 'flip_ai_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function customDomainHost(request: NextRequest): string | null | undefined {
  const host = normalizeHostname(request.headers.get('host'));
  if (!host) return undefined;
  if (isAdminHostname(host)) return null;
  const appHost = normalizeHostname(process.env.APP_HOSTNAME || process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br');
  if (host === appHost || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return undefined;
  return host;
}

function attachSessionCookie(response: NextResponse, token: string, created: boolean) {
  if (created) {
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return response;
}

function jsonError(error: unknown, token: string, created: boolean) {
  if (error instanceof FlipAiError) {
    return attachSessionCookie(NextResponse.json({
      error: toPublicFlipAiErrorMessage(error.code, error.message),
      code: error.code,
    }, { status: error.status }), token, created);
  }
  return attachSessionCookie(NextResponse.json({
    error: 'Não foi possível processar a mensagem agora.',
    code: 'PUBLIC_CHAT_UNAVAILABLE',
  }, { status: 503 }), token, created);
}

function sseData(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type BrowserAttribution = Pick<LeadAttributionSnapshot,
  'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'utmTerm'
  | 'fbclid' | 'gclid' | 'landingPage' | 'referrer'>;

async function trySyncHumanActionRequest(input: {
  runtime: PublicFlipAiRuntime;
  conversationId: string;
}) {
  try {
    return await syncFlipAiHumanActionRequest({
      tenantId: input.runtime.tenantId,
      conversationId: input.conversationId,
      agentId: input.runtime.id,
    });
  } catch {
    // Internal human-action task creation never invalidates a confirmed customer reply.
    return null;
  }
}

async function tryCaptureLead(input: {
  request: NextRequest;
  runtime: PublicFlipAiRuntime;
  conversationId: string;
  decision: FlipAiIdentityDecision | null;
  browser?: BrowserAttribution;
}) {
  if (!input.decision) return null;
  const cookies = parseAttributionCookies(input.request.headers.get('cookie'));
  try {
    return await captureFlipAiLead({
      runtime: input.runtime,
      conversationId: input.conversationId,
      decision: input.decision,
      attribution: {
        utmSource: input.browser?.utmSource || null,
        utmMedium: input.browser?.utmMedium || null,
        utmCampaign: input.browser?.utmCampaign || null,
        utmContent: input.browser?.utmContent || null,
        utmTerm: input.browser?.utmTerm || null,
        fbclid: input.browser?.fbclid || null,
        gclid: input.browser?.gclid || null,
        landingPage: input.browser?.landingPage || null,
        referrer: input.browser?.referrer || null,
        fbc: cookies.fbc,
        fbp: cookies.fbp,
        clientIp: normalizeAttributionString(getClientIp(input.request), ATTRIBUTION_LIMITS.serverValue),
        clientUserAgent: normalizeAttributionString(input.request.headers.get('user-agent'), ATTRIBUTION_LIMITS.serverValue),
      },
    });
  } catch {
    // Lead capture is isolated from the valid conversation response.
    return null;
  }
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const session = getOrCreatePublicSessionToken(request.cookies.get(COOKIE_NAME)?.value);
  const domainHost = customDomainHost(request);
  if (domainHost === null) {
    return attachSessionCookie(NextResponse.json({ error: 'Not found' }, { status: 404 }), session.token, session.created);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(new FlipAiError('INVALID_PUBLIC_CHAT_MESSAGE', 400, 'Revise a mensagem enviada.'),
      session.token, session.created);
  }

  const runtimeContext = await resolvePublicFlipAiRuntime({
    slug: params.slug,
    ...(domainHost === undefined ? {} : { customDomainHost: domainHost }),
  });
  if (!runtimeContext) {
    return attachSessionCookie(NextResponse.json({ error: 'Not found' }, { status: 404 }), session.token, session.created);
  }

  let turn: Awaited<ReturnType<typeof preparePublicChatTurn>>;
  try {
    turn = await preparePublicChatTurn(runtimeContext, session.token, body);
  } catch (error) {
    return jsonError(error, session.token, session.created);
  }

  const encoder = new TextEncoder();
  if (turn.mode === 'replay') {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(sseData('delta', { delta: turn.text })));
        const leadCapture = await tryCaptureLead({
          request,
          runtime: runtimeContext,
          conversationId: turn.conversationId,
          decision: turn.identity,
          browser: turn.attribution,
        });
        if (leadCapture && (leadCapture.meta || leadCapture.gtmContainerId)) {
          controller.enqueue(encoder.encode(sseData('lead', leadCapture)));
        }
        try {
          await finalizeFlipAiQualification({
            runtime: runtimeContext,
            conversationId: turn.conversationId,
            decision: turn.qualification,
            model: turn.qualificationModel || 'unknown',
            evidenceMessageIds: turn.qualificationEvidenceMessageIds,
          });
        } catch {
          // Qualification persistence/tracking never invalidates a confirmed reply or Lead.
        }
        await trySyncHumanActionRequest({
          runtime: runtimeContext,
          conversationId: turn.conversationId,
        });
        if (turn.sources.length) controller.enqueue(encoder.encode(sseData('sources', { sources: turn.sources })));
        controller.enqueue(encoder.encode(sseData('done', { messageId: turn.messageId, replayed: true })));
        controller.close();
      },
    });
    return attachSessionCookie(new NextResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
    }), session.token, session.created);
  }

  try {
    await assertFlipAiConversationRuntimeReady({ tenantId: turn.tenantId });
  } catch (error) {
    if (error instanceof FlipAiConversationRuntimeError) {
      await failPublicChatTurn(turn, error, 'runtime').catch(() => undefined);
    }
    return jsonError(error, session.token, session.created);
  }

  let context;
  try {
    context = await buildPublicChatContext(runtimeContext, turn);
  } catch (error) {
    if (error instanceof FlipAiConversationRuntimeError) {
      await failPublicChatTurn(turn, error, 'runtime').catch(() => undefined);
    }
    return jsonError(error, session.token, session.created);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const rawResult = await executeFlipAiConversationResponse({
          tenantId: turn.tenantId,
          conversationId: turn.conversationId,
          agentId: turn.agentId,
          context,
          textFormat: PUBLIC_CHAT_DECISION_FORMAT,
          timeoutMs: 55_000,
        });
        const decision = parsePublicChatDecision(rawResult.text);
        decision.qualification = applyBrainFinalQualification(decision.qualification, context.brainAssessment);
        const result = { ...rawResult, text: decision.reply };
        await completePublicChatTurn(
          turn,
          result,
          decision,
          context.evidenceMessageIds,
          context.sources,
          context.memorySnapshot,
          context.availabilitySnapshot,
          context.actionEligibility,
          context.actionPermission,
        );
        controller.enqueue(encoder.encode(sseData('delta', { delta: decision.reply })));
        if (context.sources.length) controller.enqueue(encoder.encode(sseData('sources', { sources: context.sources })));

        const leadCapture = await tryCaptureLead({
          request,
          runtime: runtimeContext,
          conversationId: turn.conversationId,
          decision: decision.identity,
          browser: turn.attribution,
        });
        if (leadCapture && (leadCapture.meta || leadCapture.gtmContainerId)) {
          controller.enqueue(encoder.encode(sseData('lead', leadCapture)));
        }
        try {
          await finalizeFlipAiQualification({
            runtime: runtimeContext,
            conversationId: turn.conversationId,
            decision: decision.qualification,
            model: result.model,
            evidenceMessageIds: context.evidenceMessageIds,
          });
        } catch {
          // Qualification persistence/tracking never invalidates a confirmed reply or Lead.
        }
        await trySyncHumanActionRequest({
          runtime: runtimeContext,
          conversationId: turn.conversationId,
        });
        controller.enqueue(encoder.encode(sseData('done', {
          messageId: turn.messageId,
          responseId: result.responseId,
          replayed: false,
        })));
      } catch (error) {
        const failure = error instanceof OpenAiResponseError || error instanceof FlipAiConversationRuntimeError
          ? error : new OpenAiResponseError('ambiguous', 'PUBLIC_CHAT_RESULT_AMBIGUOUS');
        try {
          await failPublicChatTurn(turn, failure, 'response');
        } catch {
          // The visible error remains ambiguous; no automatic retry is attempted.
        }
        controller.enqueue(encoder.encode(sseData('error', {
          code: failure.code,
          retryRequiresConfirmation: true,
          message: failure instanceof FlipAiConversationRuntimeError
            ? toPublicFlipAiErrorMessage(failure.code, failure.message)
            : failure.kind === 'ambiguous'
              ? 'A resposta ficou incerta. Confirme antes de tentar novamente.'
              : 'Não foi possível responder agora. Confirme uma nova tentativa.',
        })));
      } finally {
        controller.close();
      }
    },
  });

  return attachSessionCookie(new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    },
  }), session.token, session.created);
}
