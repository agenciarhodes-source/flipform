/**
 * Owner-reviewed legacy platform /f/:slug aliases. No aliases are inferred from
 * currently active slugs; historical URL ownership must be attested externally.
 *
 * Environment variable: PR00_VERIFIED_LEGACY_FORM_ALIASES_JSON
 * {
 *   "version": 1,
 *   "verified": [
 *     { "slug": "example-old-link", "formId": "<uuid>", "tenantId": "<uuid>",
 *       "evidenceRef": "PR00-APPROVAL-123" }
 *   ]
 * }
 *
 * Fail closed for absent, invalid, duplicate or oversized manifests.
 * The evidenceRef is a pointer for human audit, NOT proof on its own.
 */
export type VerifiedLegacyFormAlias = {
  slug: string;
  formId: string;
  tenantId: string;
  evidenceRef: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const EVIDENCE = /^[a-zA-Z0-9][a-zA-Z0-9_./#-]{7,127}$/;

export function getVerifiedLegacyFormAlias(
  slug: string,
  manifestJson: string | undefined,
): Pick<VerifiedLegacyFormAlias, 'formId' | 'tenantId'> | null {
  if (!SLUG.test(slug) || !manifestJson || manifestJson.length > 32768) return null;
  try {
    const manifest: unknown = JSON.parse(manifestJson);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
    const parsed = manifest as Record<string, unknown>;
    if (parsed.version !== 1 || !Array.isArray(parsed.verified) || parsed.verified.length > 200) return null;
    const seen = new Set<string>();
    let found: Pick<VerifiedLegacyFormAlias, 'formId' | 'tenantId'> | null = null;
    for (const raw of parsed.verified) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const row = raw as Record<string, unknown>;
      if (
        typeof row.slug !== 'string' || !SLUG.test(row.slug) ||
        typeof row.formId !== 'string' || !UUID.test(row.formId) ||
        typeof row.tenantId !== 'string' || !UUID.test(row.tenantId) ||
        typeof row.evidenceRef !== 'string' || !EVIDENCE.test(row.evidenceRef) ||
        seen.has(row.slug)
      ) return null;
      seen.add(row.slug);
      if (row.slug === slug) found = { formId: row.formId, tenantId: row.tenantId };
    }
    return found;
  } catch {
    return null;
  }
}
