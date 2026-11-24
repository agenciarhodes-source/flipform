import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  buildFlipVoiceAgentDraft,
  validateApprovedVoice,
  FlipVoiceCoreError,
  type ApprovedVoice,
  type VoiceAgentDraft,
} from './agent-core';

/**
 * Reads ONLY the authenticated tenant's voice and verified voice consent.
 * This is a draft-only read path: it does not enable production, create agents,
 * execute tools or originate calls. In PR #636 no HTTP route invokes it.
 */
export async function readFlipVoiceAgentDraft(input: {
  authenticatedTenantId: string;
  profileId: string;
  businessDisplayName: string;
  businessInstructions: string;
  now?: Date;
}): Promise<VoiceAgentDraft> {
  const tenantId = input.authenticatedTenantId.trim();
  if (!tenantId || !input.profileId.trim()) throw new FlipVoiceCoreError('TENANT_OR_PROFILE_MISSING');

  const profile = await prisma.flipVoiceProfile.findFirst({
    where: { id: input.profileId, tenantId },
    include: {
      consents: {
        where: { status: 'verified', revokedAt: null },
        orderBy: { verifiedAt: 'desc' },
        take: 10,
      },
    },
  });
  if (!profile) throw new FlipVoiceCoreError('VOICE_NOT_AVAILABLE');

  const now = input.now || new Date();
  for (const consent of profile.consents) {
    const approved: ApprovedVoice = {
      tenantId: profile.tenantId,
      profileId: profile.id,
      provider: profile.provider === 'elevenlabs' ? 'elevenlabs' : (profile.provider as 'elevenlabs'),
      providerVoiceId: profile.providerVoiceId,
      profileStatus: profile.status,
      consentStatus: consent.status,
      consentScopes: consent.scopes,
      consentEvidenceHash: consent.evidenceSha256,
      consentVerifiedAt: consent.verifiedAt,
      consentExpiresAt: consent.expiresAt,
      consentRevokedAt: consent.revokedAt,
    };
    try {
      validateApprovedVoice(approved, tenantId, 'voice_calls', now);
      return buildFlipVoiceAgentDraft({
        tenantId,
        voice: approved,
        businessDisplayName: input.businessDisplayName,
        businessInstructions: input.businessInstructions,
        testOnly: true,
        now,
      });
    } catch (error) {
      if (error instanceof FlipVoiceCoreError && error.code === 'VOICE_CONSENT_REQUIRED') continue;
      throw error;
    }
  }
  throw new FlipVoiceCoreError('VOICE_CONSENT_REQUIRED');
}
