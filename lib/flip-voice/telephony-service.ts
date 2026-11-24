import 'server-only';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { evaluateVoiceCallGate } from './policy';
import { validateApprovedVoice, FlipVoiceCoreError } from './agent-core';
import {
  normalizeBrazilianDialNumber, allowedBrazilBusinessHours, estimateCallReserveMicros,
  utcMonthStart, hashCallIdentity, validRecipientPermission, validatePstnLine,
} from './telephony-core';
import { startElevenTwilioOutbound } from './telephony-provider';

type DbTx = Prisma.TransactionClient;
const isGlobalEnabled = () => process.env.FLIP_VOICE_PSTN_ENABLED === 'true';
const isOutboundEnabled = () => process.env.FLIP_VOICE_OUTBOUND_ENABLED === 'true';
const secret = () => process.env.FLIP_VOICE_CONTACT_PEPPER || '';

function refuse(code: string): never { throw new FlipVoiceCoreError(code); }
function assertTenantOwner(session: SessionPayload) {
  if (!session.tenantId || !['owner','admin'].includes(session.role)) refuse('VOICE_FORBIDDEN');
}
const validUUID = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function currentSettingsOrFail(
  settings: { enabled: boolean; outboundEnabled: boolean; maxCallSeconds: number;
    perCallLimitMicros: bigint; monthlyLimitMicros: bigint } | null,
  cost: bigint,
): asserts settings is NonNullable<typeof settings> {
  if (!settings?.enabled || !settings.outboundEnabled) refuse('VOICE_TENANT_DISABLED');
  if (settings.maxCallSeconds < 30 || settings.maxCallSeconds > 180) refuse('VOICE_DURATION_NOT_ALLOWED');
  if (cost <= 0n || settings.perCallLimitMicros < cost || settings.monthlyLimitMicros < cost) refuse('VOICE_BUDGET_NOT_CONFIGURED');
}

async function validateVoiceOwner(db: DbTx | typeof prisma, input: {
  tenantId: string; profileId: string; now: Date;
}): Promise<string> {
  const profile = await db.flipVoiceProfile.findFirst({
    where: { id: input.profileId, tenantId: input.tenantId, status: 'active' },
    include: { consents: { where: { status: 'verified', revokedAt: null }, orderBy: { verifiedAt: 'desc' } } },
  });
  if (!profile) refuse('VOICE_PROFILE_NOT_READY');
  for (const row of profile.consents) {
    try {
      validateApprovedVoice({
        tenantId: profile.tenantId, profileId: profile.id, provider: profile.provider,
        providerVoiceId: profile.providerVoiceId, profileStatus: profile.status,
        consentStatus: row.status, consentScopes: row.scopes,
        consentEvidenceHash: row.evidenceSha256, consentVerifiedAt: row.verifiedAt,
        consentExpiresAt: row.expiresAt, consentRevokedAt: row.revokedAt,
      }, input.tenantId, 'voice_calls', input.now);
      return row.id;
    } catch (error) {
      if (error instanceof FlipVoiceCoreError && error.code === 'VOICE_CONSENT_REQUIRED') continue;
      throw error;
    }
  }
  return refuse('VOICE_OWNER_CONSENT_MISSING');
}

/** Reserve budget atomically; absence of an explicit budget row means ZERO authorization. */
async function reserveBudget(db: DbTx, input: {
  tenantId: string; periodStart: Date; micros: bigint; monthlyCeiling: bigint;
}) {
  const rows = await db.$queryRaw<{ tenant_id: string }[]>(Prisma.sql`
    UPDATE "flip_voice_budgets"
    SET "reserved_micros" = "reserved_micros" + ${input.micros},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "tenant_id" = ${input.tenantId}
      AND "period_start" = ${input.periodStart}
      AND "limit_micros" > 0
      AND "limit_micros" <= ${input.monthlyCeiling}
      AND "reserved_micros" >= 0 AND "spent_micros" >= 0
      AND "reserved_micros" + "spent_micros" + ${input.micros} <= "limit_micros"
    RETURNING "tenant_id"
  `);
  if (rows.length !== 1) refuse('VOICE_MONTHLY_BUDGET_EXCEEDED');
}

export type OutboundStartResult = { callId: string; status: string; reused: boolean };

/**
 * Sole trusted source for an outbound call. Never accept a phone number,
 * tenantId, cost, voice ID or provider credential from the browser.
 *
 * Network failures AFTER dispatch are marked uncertain and never retried
 * automatically: the provider may already have created a billable call.
 */
export async function startFlipVoiceOutbound(
  session: SessionPayload,
  input: { leadId: string; lineId: string; idempotencyKey: string },
): Promise<OutboundStartResult> {
  assertTenantOwner(session);
  if (!isGlobalEnabled() || !isOutboundEnabled()) refuse('VOICE_GLOBALLY_DISABLED');
  if (!validUUID(input.leadId) || !validUUID(input.lineId) ||
      !validUUID(input.idempotencyKey)) refuse('VOICE_REQUEST_INVALID');
  const apiKey = process.env.ELEVENLABS_API_KEY || '';
  if (apiKey.length < 16 || secret().length < 32) refuse('VOICE_SECRETS_NOT_READY');
  const now = new Date();
  if (!allowedBrazilBusinessHours(now)) refuse('VOICE_OUTSIDE_ALLOWED_HOURS');
  const tenantId = session.tenantId;
  const [settings, line, lead, budget] = await Promise.all([
    prisma.flipVoiceSettings.findUnique({ where: { tenantId } }),
    prisma.flipVoiceLine.findFirst({ where: { id: input.lineId, tenantId } }),
    prisma.lead.findFirst({ where: { id: input.leadId, tenantId }, select: { id: true, tenantId: true, phone: true } }),
    prisma.flipVoiceBudget.findUnique({ where: { tenantId_periodStart: { tenantId, periodStart: utcMonthStart(now) } } }),
  ]);
  if (!line || !lead || !budget) refuse('VOICE_NOT_CONFIGURED');
  validatePstnLine(line, tenantId, 'outbound');
  const number = normalizeBrazilianDialNumber(lead.phone);
  const micros = estimateCallReserveMicros(settings?.maxCallSeconds || 180);
  currentSettingsOrFail(settings, micros);
  const permission = await prisma.flipVoiceContactPermission.findFirst({
    where: { tenantId, leadId: lead.id, channel: 'pstn', status: 'verified', revokedAt: null },
    orderBy: { verifiedAt: 'desc' },
  });
  if (!permission || !validRecipientPermission(permission,tenantId,lead.id,now)) refuse('VOICE_CONTACT_OPT_IN_REQUIRED');
  const voiceConsentId = await validateVoiceOwner(prisma, { tenantId, profileId: line.profileId, now });
  const budgetRemaining = budget.limitMicros - budget.reservedMicros - budget.spentMicros;
  const decision = evaluateVoiceCallGate({
    tenantId, contactTenantId: lead.tenantId, enabled: isGlobalEnabled(),
    tenantEnabled: settings.enabled, outboundEnabled: settings.outboundEnabled,
    providerReady: true, actorOrWebhookAuthorized: true,
    direction: 'outbound', channel: 'pstn',
    idempotencyKey: input.idempotencyKey, doNotCall: Boolean(permission.revokedAt),
    personAskedForHuman: false, humanHandoffAvailable: true,
    contactConsentEvidenceId: permission.id,
    monthlyBudgetRemainingUsd: Number(budgetRemaining) / 1_000_000,
    reservedCallEstimateUsd: Number(micros) / 1_000_000,
  }, now);
  if (!decision.allowed) refuse('VOICE_CALL_DENIED_' + decision.reason);
  const requestKeyHash = hashCallIdentity(tenantId + ':' + input.idempotencyKey,secret());
  const contactHash = hashCallIdentity(tenantId + ':' + number,secret());

  const hold = await prisma.$transaction(async db => {
    const previous = await db.flipVoiceCall.findFirst({
      where: { tenantId, direction: 'outbound', channel: 'pstn', requestKeyHash },
      select: { id: true, status: true },
    });
    if (previous) return { id: previous.id, status: previous.status, reused: true };
    // Recheck mutable permissions and flags at the transactional boundary.
    const [latestSettings, latestLine, latestPermission, freshLead] = await Promise.all([
      db.flipVoiceSettings.findUnique({ where: { tenantId } }),
      db.flipVoiceLine.findFirst({ where: { tenantId, id: line.id } }),
      db.flipVoiceContactPermission.findFirst({ where: { tenantId, id: permission.id } }),
      db.lead.findFirst({ where: { tenantId, id: lead.id }, select: { phone: true } }),
    ]);
    currentSettingsOrFail(latestSettings, micros);
    if (!latestLine || !freshLead || normalizeBrazilianDialNumber(freshLead.phone) !== number) refuse('VOICE_CONTACT_CHANGED');
    validatePstnLine(latestLine,tenantId,'outbound');
    if (!latestPermission || !validRecipientPermission(latestPermission,tenantId,lead.id,new Date())) refuse('VOICE_OPT_IN_REVOKED');
    const freshVoiceConsent = await validateVoiceOwner(db,{tenantId,profileId:line.profileId,now:new Date()});
    if (freshVoiceConsent !== voiceConsentId) refuse('VOICE_CONSENT_CHANGED');
    await reserveBudget(db,{tenantId,periodStart:utcMonthStart(now),micros,monthlyCeiling:latestSettings.monthlyLimitMicros});
    const call=await db.flipVoiceCall.create({data:{
      tenantId,profileId:line.profileId,consentId:voiceConsentId,lineId:line.id,
      leadId:lead.id,contactPermissionId:permission.id,channel:'pstn',
      direction:'outbound',status:'held',requestKeyHash,contactHash,
      reservedUsdMicros:micros,billedUsdMicros:0n,
    }, select:{id:true,status:true}});
    return {id:call.id,status:call.status,reused:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15_000});
  if (hold.reused) return { callId:hold.id,status:hold.status,reused:true };

  const transitioned = await prisma.flipVoiceCall.updateMany({
    where:{id:hold.id,tenantId,status:'held'},data:{status:'dispatching'},
  });
  if (transitioned.count !== 1) return {callId:hold.id,status:'held_for_review',reused:false};
  try {
    const accepted=await startElevenTwilioOutbound({
      apiKey,agentId:line.providerAgentId,agentPhoneNumberId:line.providerPhoneNumberId,
      recipientNumber:number,recordingAllowed:false,
    });
    await prisma.flipVoiceCall.updateMany({
      where: {id:hold.id,tenantId,status:'dispatching'},
      data: {status:'initiated',providerCallId:accepted.providerCallId,startedAt:new Date()},
    });
    return {callId:hold.id,status:'initiated',reused:false};
  } catch {
    await prisma.flipVoiceCall.updateMany({
      where:{id:hold.id,tenantId,status:'dispatching'},data:{status:'delivery_unknown'},
    }).catch(()=>undefined);
    return {callId:hold.id,status:'delivery_unknown',reused:false};
  }
}
