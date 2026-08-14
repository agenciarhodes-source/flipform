# Meta tenant asset isolation

## Security objective

A Meta User Access Token can expose multiple ad accounts that the authorized identity is allowed to manage. That broad authorization must never become broad tenant visibility inside FlipForm.

FlipForm separates two concepts:

1. **Meta authorization** — the encrypted credential owned by a `TenantMetaConnection`.
2. **Tenant asset binding** — the single ad account and Pixel / Dataset explicitly assigned to that tenant.

## Enforcement

Tenant-authenticated routes must not enumerate `/me/adaccounts`, business portfolios, Pixels, datasets, WhatsApp assets, Instagram accounts, or other cross-client assets.

`/api/integrations/meta/assets` is intentionally denied for tenant sessions. The tenant UI is read-only for Meta asset binding and displays only the assets already assigned to that tenant.

Broad discovery is restricted to the platform-admin route:

`/api/admin/integrations/meta/tenant-assets`

The platform admin selects the target tenant first. The server then uses only that tenant's authorized Meta connection, decrypts the token server-side, discovers accessible accounts, and revalidates the selected Ad Account -> Pixel chain before persistence.

Access tokens and App Secrets are never returned to the browser or written to application logs.

## Runtime rule

Meta Pixel and Conversions API runtime continue to resolve only the selected `metaPixelId` and encrypted token from the tenant's own authorized `TenantMetaConnection`. A tenant cannot submit an arbitrary `adAccountId` or `pixelId` to change its runtime binding.

## Admin audit

Every successful admin binding records the action `META_ASSETS_BOUND_BY_PLATFORM_ADMIN` with tenant, connection and selected asset identifiers in the platform audit log. No secret is written to the audit entry.

## Compatibility

The existing legacy manual Meta settings remain a fallback while universal connections are migrated. This isolation change does not modify customer leads, forms, answers, pipeline history or sales data.

## Production data safety

Existing customer leads and related production data are immutable by default. Never delete, truncate, reset, mass-update, recreate, or replace customer production data as part of a feature implementation or migration. Any operation affecting existing production records requires explicit user approval after impact analysis.
