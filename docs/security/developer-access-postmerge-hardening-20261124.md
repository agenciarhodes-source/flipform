# Complementary security review after PR #643

This change hardens only the developer access boundary. It does not grant
permissions, rotate keys, run migrations, modify Meta/WhatsApp/Instagram
connections, or change existing client data.

## Verified code paths
- `lib/session-access.ts` now bypasses the short-lived access-decision cache
  for signed technical sessions, including recently MFA-verified sessions.
- An untrusted/stale `developer` role is downgraded until an active grant,
  enabled MFA, active direct company membership and active allowlist are
  independently verified.
- `app/api/admin/developer-access/route.ts` never reactivates an existing
  disabled `TenantUser` or `AllowedUser` when issuing a technical grant.
  Existing company roles are not overwritten.
- Existing technical entrypoints built on `withAuth` / `withPermission`
  still enforce role and tenant checks. The Meta platform callback preserves
  its separately protected administrative authorization.
- Pure tests cover grant scope, cached-session bypass, inactive membership,
  allowlist revocation and MFA denial.

## Release requirements (not automatically complete)
1. All CI / Typecheck / Smoke / Playwright checks pass on this PR's latest commit.
2. Staging E2E with two synthetic companies: tenant A grant cannot access B.
3. Disable direct TenantUser and AllowedUser separately while the developer
   session is active: technical endpoints must deny immediately.
4. Revoke grant during an active session: technical endpoints must deny and
   previously issued session version must not regain access.
5. Verify user with both company and business group memberships retains
   expected business operations without getting technical privileges.
6. Verify client owner/admin/manager cannot access technical configuration APIs
   via direct URLs, not merely hidden navigation.
7. Run no production SQL, migrations or access provisioning without approval.

No automatic merge or production deployment approval is implied by CI success.
