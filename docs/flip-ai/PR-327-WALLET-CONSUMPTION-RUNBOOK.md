# PR #327 — Flip AI Wallet Consumption Runbook

## Scope

This increment connects confirmed and fully priced OpenAI usage to the tenant-scoped Flip AI wallet.

It adds:

- automatic debit only after a usage event is durably `confirmed`;
- exactly one idempotent debit per usage event;
- no debit for `processing`, `ambiguous`, `failed`, partially priced, unknown-price or unreconciled Realtime usage;
- traceable, idempotent refunds tied to the original usage event;
- a visible insufficient-balance warning without undoing a valid conversation or Lead;
- no automatic recharge.

This PR does not change Meta, Google, WhatsApp, lead routing, tracking credentials or the lead creation contract.

## Credit unit

The technical settlement unit is explicit and deterministic:

- `1 credit = 1,000 nano-USD = US$ 0.000001`;
- each fully priced confirmed event is rounded up to the next whole credit;
- commercial markup, package pricing and payment-gateway rules remain separate future concerns.

Examples:

- US$ 0.000800 -> 800 credits;
- US$ 0.010000 -> 10,000 credits;
- a positive cost below US$ 0.000001 -> 1 credit.

## Settlement contract

For a confirmed OpenAI usage event:

1. calculate the event cost with the reviewed PR #326 pricing snapshot;
2. require full price coverage;
3. convert the cost to whole technical credits;
4. debit the tenant wallet with idempotency key `usage:<usage_event_id>`;
5. store only billing state and technical references in usage metadata.

A replay of the same event reuses the same ledger entry. It never creates a second debit.

## Uncertain results

No debit is created when:

- the usage event is not `confirmed`;
- pricing coverage is partial or unavailable;
- Realtime audio has not been reconciled;
- the wallet schema is unavailable.

The billing result is recorded as metadata when possible, but financial settlement failure must not rewrite the technical usage outcome.

## Insufficient balance

This increment uses a warning-first policy:

- debit is rejected by the existing non-negative wallet invariant;
- no negative balance and no ledger debit are created;
- the confirmed AI operation remains confirmed;
- valid conversation state and valid Lead creation are never rolled back because of a financial failure;
- the Consumo page surfaces the insufficient-balance condition.

A future commercial-control increment may choose to block new provider calls before spend, but this PR does not interrupt an already valid customer interaction.

## Refunds

A refund is allowed only when the original debit exists.

- original debit key: `usage:<usage_event_id>`;
- refund key: `usage-refund:<usage_event_id>`;
- refund amount equals the original debit;
- the refund is append-only in the ledger and tenant-scoped;
- repeated refund requests reuse the same refund row.

No refund deletes or edits historical ledger rows.

## Recharge

There is no automatic recharge in this increment.

No card, payment gateway, Asaas flow, saved payment method, threshold recharge or browser-side wallet mutation is added.

## Database

No migration is introduced by PR #327.

The existing PR #314 tables are reused:

- `flip_ai_credit_accounts`;
- `flip_ai_credit_ledger`.

Usage billing state uses the existing `flip_ai_usage_events.metadata` JSON field and does not alter schema.
