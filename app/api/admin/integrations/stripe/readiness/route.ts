import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import {
  inspectStripeFoundationConfiguration,
  STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED,
} from '@/lib/stripe/config';
import { getStripeServerSdkMetadata } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async () => {
  const readiness = inspectStripeFoundationConfiguration();

  return NextResponse.json(
    {
      readiness,
      sdk: getStripeServerSdkMetadata(),
      policy: {
        livePaymentsAllowed: STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED,
        checkoutCreationEnabled: readiness.readyForTestIntegration,
        webhookProcessingEnabled: readiness.readyForWebhookValidation,
        moneyMovementEnabled: false,
      },
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  );
});
