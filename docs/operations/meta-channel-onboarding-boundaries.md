# Meta channel onboarding boundaries

## Objective

FlipForm must support multiple Meta products without turning one authorization into a cross-client or cross-channel credential. Ads/Pixel, WhatsApp and Instagram have separate onboarding semantics, permissions, assets and token lifecycles.

The platform therefore treats the following purposes as distinct security boundaries:

- `ads_tracking` — existing Facebook Login for Business flow used for Ads/Pixel tracking.
- `whatsapp_embedded_signup` — reserved for the official WhatsApp Embedded Signup flow.
- `instagram_business_login` — reserved for Business Login for Instagram.

## Signed onboarding purpose

Every Meta OAuth state must be bound to tenant, user, nonce, expiration **and purpose**. A state created for one purpose is invalid for every other purpose.

The existing `/api/integrations/meta/connect` and `/api/integrations/meta/callback` endpoints are explicitly `ads_tracking`. They may only create or update `TenantMetaConnection`, which remains the Ads/Pixel authorization record.

WhatsApp and Instagram must not reuse the Ads token or persist their credentials into `TenantMetaConnection`.

## Persistence rule

Channel credentials and assets must be isolated by tenant and by channel. Future WhatsApp and Instagram implementations require separate persistence records with encrypted tokens and explicit asset binding.

No channel onboarding endpoint may enumerate assets from a different tenant in a tenant-authenticated session. Broad asset discovery, when operationally required, remains a platform-admin capability and must always start from the target tenant.

## Planned sequence

1. Add WhatsApp connection persistence and official Embedded Signup completion, binding only the WABA and phone number selected for the tenant.
2. Add Meta WhatsApp webhook verification, tenant routing and message send runtime.
3. Add Instagram connection persistence and Business Login for Instagram, binding only the professional account selected for the tenant.
4. Add Instagram webhooks and messaging runtime.
5. Converge WhatsApp and Instagram into the shared conversation/message/inbox domain without sharing provider credentials between channels.

## UX rule

FlipForm should hide Meta implementation details from the customer and present the official provider-hosted onboarding flow as a simple connection action. The product must not emulate or bypass Meta authorization with custom credential collection.

## Production data safety

This boundary change is additive and does not modify leads, form answers, pipeline history, sales, conversations or customer records. Existing production customer data must never be deleted, reset, mass-updated or recreated as part of channel onboarding work.
