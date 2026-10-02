import 'server-only';

import Stripe from 'stripe';
import {
  requireStripeConfiguration,
  STRIPE_SDK_VERSION,
} from './config';

let stripeClient: Stripe | null = null;
let stripeClientFingerprint: string | null = null;

function fingerprintRestrictedKey(mode: string, key: string) {
  return `${mode}:${key.slice(0, 10)}:${key.slice(-4)}`;
}

export function getStripeClient() {
  const config = requireStripeConfiguration();
  const fingerprint = fingerprintRestrictedKey(config.mode, config.restrictedKey);

  if (!stripeClient || stripeClientFingerprint !== fingerprint) {
    stripeClient = new Stripe(config.restrictedKey, {
      maxNetworkRetries: 0,
      timeout: 10_000,
      telemetry: false,
    });
    stripeClientFingerprint = fingerprint;
  }

  return stripeClient;
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
