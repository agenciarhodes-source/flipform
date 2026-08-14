# Meta universal multi-tenant onboarding

## Goal

FlipForm owns and configures one platform-level Meta App. Each tenant authorizes its own Meta identity and selects only the ad account and Pixel / Dataset that FlipForm should use for that tenant.

The tenant does not configure App ID, App Secret, Redirect URI, Graph API version, platform token, or Business Login configuration.

## Tenant flow

1. Open Integrations > Meta.
2. Connect with Meta using an identity that has access to the client's advertising assets.
3. FlipForm stores that authorization only for the current tenant.
4. FlipForm discovers ad accounts directly from the connected Meta identity.
5. The tenant selects an ad account.
6. FlipForm discovers Pixels / Datasets available through that ad account.
7. The tenant selects a Pixel / Dataset and saves.
8. Pixel and Conversions API runtime use that tenant connection as the universal source.

A Meta Business Portfolio can exist behind the selected assets, but it is not a required onboarding step in FlipForm.

## Tenant isolation

- OAuth state is bound to the authenticated FlipForm tenant and user.
- The callback persists the authorization under the current tenant only.
- Asset discovery always starts from the current tenant's encrypted authorization.
- Ad account and Pixel IDs submitted by the browser are revalidated against Meta before persistence.
- Switching Meta identity revokes other authorized identities in that tenant and clears the previous asset selection before a new selection can become authoritative.
- Disconnecting marks the authorization revoked; it does not delete historical connection records.

## Runtime precedence

The universal runtime introduced before this onboarding change remains unchanged:

1. latest authorized tenant Meta connection with a selected valid Pixel / Dataset;
2. legacy manual Meta configuration only when the universal connection is not usable yet.

Business Portfolio metadata is optional and is not required by runtime.

## Identity switching

The Integrations page shows the connected Meta identity when available and exposes actions to switch or disconnect it. When switching accounts, the operator must authenticate with a Meta identity that can access the advertising assets for the tenant being configured.

Browser-level Meta session behavior is controlled by Meta. If Meta reuses an already logged-in identity, the operator must choose or sign in with the intended identity in Meta's authorization flow.

## Production data safety

PRODUCTION DATA SAFETY: Existing customer leads and related production data are immutable by default. Never delete, truncate, reset, mass-update, recreate, or replace customer production data as part of a feature implementation or migration. Any operation affecting existing production records requires explicit user approval after impact analysis.

This onboarding flow does not delete or rewrite customer leads, answers, history, purchases, notes, tasks, users, or other customer production records.
