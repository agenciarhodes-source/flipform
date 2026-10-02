import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { inspectStripeFoundationConfiguration } from '@/lib/stripe/config';
import { getStripeServerSdkMetadata } from '@/lib/stripe/client';

export const dynamic = 'force-dynamic';

export const GET = withPlatformAdmin(async () => {
  const readiness = inspectStripeFoundationConfiguration();

  return NextResponse.json(
    {
      readiness,
      sdk: getStripeServerSdkMetadata(),
      policy: {
        livePaymentsAllowed: readiness.livePaymentsAllowed,
        checkoutCreationEnabled: readiness.readyForCheckout,
        webhookProcessingEnabled: readiness.readyForWebhookValidation,
        commercialPaymentsEnabled: readiness.readyForCheckout && readiness.mode === 'live',
      },
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  );
});
