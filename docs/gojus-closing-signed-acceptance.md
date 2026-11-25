# PR 02 — Conferência dos contratos assinados

Foundation only; do not activate or merge this incomplete PR as the finished feature.

The existing closing-document delivery stays unchanged. If the tenant has an active `closing_signed_check` grant, the send audit additionally records confirmed template IDs and names, without changing the database schema. No new grant is created here.

The pure rules require an explicit return format and a fully confirmed manifest. Separate mode requires three distinct templates; package mode requires one template representing the entire case. Until the actual return format and model layout are confirmed, keep the feature off. A combined PDF containing multiple separately sent models requires a separate validated recognition strategy.

Remaining within this PR before final approval: gated document recognition, persistence of results, conversation instructions, urgent idempotent GoJus task and lead panel; tests of those entry points. No stage move, no ZapSign change, no production migration. Human review remains necessary for legal validity.

CI uses synthetic fixtures; no live document or model calls.
