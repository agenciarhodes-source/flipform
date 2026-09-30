import 'server-only';

import Stripe from 'stripe';
import {
  requireStripeTestConfiguration,
  STRIPE_SDK_VERSION,
} from './config';

let stripeTestClient: Stripe | null = null;
let stripeTestClientKeyFingerprint: string | null = null;

function fingerprintRestrictedKey(key: string) {
  return key.slice(0, 10) + ':' + key.slice(-4);
}

export function getStripeTestClient() {
  const config = requireStripeTestConfiguration();
  const fingerprint = fingerprintRestrictedKey(config.restrictedKey);

  if (!stripeTestClient || stripeTestClientKeyFingerprint !== fingerprint) {
    stripeTestClient = new Stripe(config.restrictedKey, {
      maxNetworkRetries: 0,
      timeout: 10_000,
      telemetry: false,
    });
    stripeTestClientKeyFingerprint = fingerprint;
  }

  return stripeTestClient;
}

export function getStripeServerSdkMetadata() {
  return {
    sdk: 'stripe-node',
    version: STRIPE_SDK_VERSION,
    serverOnly: true,
    maxNetworkRetries: 0,
    timeoutMs: 10_000,
    telemetry: false,
  } as const;
}
