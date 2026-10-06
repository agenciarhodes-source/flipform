# JEV privacy and activation policy

This policy applies to every TypeSafe/JEV integration in FlipForm.

## Mandatory controls

1. Use a company-only TypeSafe account and a dedicated API key.
2. Store the API key only as the server-side `TYPESAFE_API_KEY` environment variable in Vercel.
3. Never expose the key to browser code, Markdown knowledge, logs, support messages, or chat conversations.
4. Send only the compact evidence required for the typed decision.
5. Redact direct identifiers, including CPF/CNPJ, phone, email, document numbers, bank details, medical record identifiers, and secrets at the final provider boundary.
6. Identify the person with a pseudonymous `subjectRef` derived from tenant and conversation IDs. Do not send a full name as a structured field.
7. Use synthetic data while the provider review is pending.
8. Keep `FLIP_AI_JEV_DATA_PROCESSING_APPROVED=false` until TypeSafe confirms retention terms and whether Zero Data Retention applies to the account and API plan.

## Activation gate

Live JEV calls require all three controls: the global feature flag, a tenant allowlist entry, and `FLIP_AI_JEV_DATA_PROCESSING_APPROVED=true`. Until the third control is approved, the conversation continues with the existing fallback and no request is sent to TypeSafe.

The redaction function runs inside the HTTP adapter immediately before serialization. Callers cannot bypass it by adding new fields to the decision state. Medical facts that are needed for qualification may remain after direct identifiers and record numbers are removed.

Provider and runtime failures cross API and persistence boundaries only as allowlisted diagnostic codes. Raw exception messages are never returned or written to JEV usage metadata because they may contain infrastructure details, credentials, or customer content.

The provider boundary rejects sanitized requests and decoded responses above 256 KiB. Response streams are stopped as soon as the limit is exceeded, including when the provider omits or understates `Content-Length`; oversized content is never parsed or persisted.

Outbound calls are pinned to the server-side HTTPS TypeSafe endpoint and use `redirect: error`, `cache: no-store`, omitted credentials, and no referrer. The client cannot supply or override the provider URL, and HTTP redirects are never followed.

Sanitization is bounded before serialization: nesting depth, array items, object entries, and total visited nodes all have fixed limits. Circular references and non-JSON values are replaced with a neutral omission marker, preventing malformed state from exhausting the server before the 256 KiB request limit is measured.

Provider token counters are accepted only as non-negative integers capped at 1,000,000 per call. The same schema protects synthetic probes, profile routing, and live decisions before token totals reach audit records or database fields; a routed decision can therefore accumulate at most 2,000,000 input tokens and 2,000,000 output tokens.

## Provider review record

Before changing the approval variable, record the response from TypeSafe covering:

- input and output retention periods;
- deletion and backup behavior;
- availability and contractual scope of Zero Data Retention;
- subprocessors and processing regions;
- incident notification and data subject request procedures.

Do not place credentials, real lead samples, or client documents in this record.

## Synthetic connection test

Platform administrators can inspect configuration with `GET /api/admin/integrations/jev/readiness` and execute one paid provider call with `POST /api/admin/integrations/jev/readiness`. The POST is limited to three attempts per administrator and IP per hour.

The probe sends a constant fictitious support sentence. It does not read tenants, leads, conversations, knowledge, documents, or Markdown. Its response exposes only model, latency, token counts, the synthetic routing choice, and confidence. It never returns or logs the API key or provider payload.

Each accepted probe attempt writes a minimal `platform.jev.synthetic_probe` audit entry using the existing audit store. The entry contains the administrator id, outcome, safe error code when applicable, model, latency, token counts, synthetic choice, and confidence. It never stores request state, provider response bodies, credentials, IP addresses, tenant/customer identifiers, messages, or documents. Audit persistence failure does not expose provider data and does not change any activation gate.

The probe does not change `FLIP_AI_JEV_ENABLED`, the tenant allowlist, or `FLIP_AI_JEV_DATA_PROCESSING_APPROVED`. A successful probe proves connectivity and response compatibility only; it does not authorize real customer data.
