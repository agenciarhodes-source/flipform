# Meta asset discovery and selection

## Scope

After a tenant authorizes the universal FlipForm Meta app through Facebook Login for Business, FlipForm discovers the business assets that the authorized user token can access and lets the tenant select one Business -> Ad Account -> Pixel / Dataset chain for that connection.

This stage does not switch production CAPI or browser Pixel delivery away from the legacy tenant settings yet. It only discovers, validates and persists the official asset selection that the next tracking integration stage will consume.

## Graph edges

The implementation follows the current Meta Business SDK graph model:

- authenticated user businesses: `/me/businesses`
- business-owned ad accounts: `/{business-id}/owned_ad_accounts`
- business client ad accounts: `/{business-id}/client_ad_accounts`
- ad account pixels: `/act_{account-id}/adspixels`

Requests use the authorized tenant connection token as a Bearer token and include `appsecret_proof`. Access tokens are never placed in response payloads or application logs.

## Tenant isolation

All discovery routes derive the tenant from the authenticated FlipForm session. The client never submits a tenant ID. Only the latest non-expired authorized `TenantMetaConnection` for that tenant can be used.

Saving a selection re-fetches the Business, Ad Account and Pixel from Meta and validates the complete chain server-side. IDs posted by the browser are never trusted without Graph validation.

## Persistence

The selected asset metadata is stored on the tenant Meta connection:

- Meta Business ID and name
- Meta Ad Account ID and name
- Meta Pixel / Dataset ID and name
- selection timestamp

The migration is additive and nullable. It performs no backfill and does not modify leads, answers, history, sales or other customer records.

## Legacy compatibility

`TenantIntegrationSettings.metaPixelId` and the manual CAPI token remain unchanged in this stage. Existing tenants continue to use the legacy tracking path until the universal Meta connection is explicitly wired into CAPI/Pixel in the next stage.

## Production data safety

Existing customer leads and related production data are immutable by default. This feature must not delete, truncate, reset, mass-update, recreate or replace customer production data. Any future operation affecting existing production records requires explicit approval after impact analysis.
