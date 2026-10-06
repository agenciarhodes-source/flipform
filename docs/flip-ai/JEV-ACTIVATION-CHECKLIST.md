# JEV production activation checklist

This checklist is the operational gate for connecting the FlipForm company-wide TypeSafe/JEV account. It does not authorize customer data by itself.

## Phase 1 — connect the global account without customer traffic

Configure only server-side Vercel variables:

```text
TYPESAFE_API_KEY=<company TypeSafe key>
TYPESAFE_JEV_MODEL=jev-latest
FLIP_AI_JEV_ENABLED=false
FLIP_AI_JEV_TENANT_IDS=
FLIP_AI_JEV_DATA_PROCESSING_APPROVED=false
```

Redeploy after changing environment variables. Do not place the API key in tenant settings, Markdown, browser code, support messages, logs, or source control.

Expected state in Admin → Integrations → JEV:

- API key configured and valid;
- real customer data blocked;
- feature flag disabled;
- no tenant allowlisted.

## Phase 2 — synthetic provider verification

Run **Testar conexão com dados fictícios** from the platform admin integration page.

The probe must:

- use the fixed synthetic server-side sentence only;
- not read tenants, leads, conversations, knowledge, documents, or customer Markdown;
- not change any production activation gate;
- return only safe operational metadata such as model, latency, token counts, synthetic decision and confidence;
- write only the minimal synthetic-probe audit record.

A successful probe proves connectivity and response compatibility. It does not authorize real customer data.

## Phase 3 — provider privacy review

Before real data is allowed, record the TypeSafe response covering:

- input and output retention;
- deletion and backups;
- Zero Data Retention availability and contractual scope;
- subprocessors and processing regions;
- incident notification;
- data-subject request procedures.

Do not put API keys, real lead examples or customer documents in that record.

Keep `FLIP_AI_JEV_DATA_PROCESSING_APPROVED=false` until this review is accepted.

## Phase 4 — first tenant pilot

Use one reviewed tenant first.

Configure the pilot tenant ID in `FLIP_AI_JEV_TENANT_IDS`. Verify the published Brain Profile/Markdown for that tenant before live activation.

Only when the provider privacy review is accepted and the pilot tenant is explicitly allowlisted:

```text
FLIP_AI_JEV_ENABLED=true
FLIP_AI_JEV_DATA_PROCESSING_APPROVED=true
```

Both controls are required. A global API key alone never enables live processing.

## Phase 5 — pilot acceptance

Validate controlled conversations for:

- tenant isolation;
- direct-identifier and credential redaction;
- profile routing;
- decision schema compatibility;
- fallback on timeout/provider failure;
- latency and token consumption;
- persisted decision reuse;
- no automatic lead-stage movement;
- human-handoff behavior.

If any item fails, disable `FLIP_AI_JEV_ENABLED` first. The existing non-JEV fallback remains available.

## Multi-tenant operating model

FlipForm uses one company-managed TypeSafe/JEV account and one server-side API key. Customer access is controlled independently by tenant allowlisting and each tenant's published brain configuration. Customers never receive or manage the TypeSafe API key.

After the pilot is stable, tenant activation should move from the environment allowlist to a platform-admin control without moving the global TypeSafe credential into tenant data.
