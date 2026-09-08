from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'components/form-builder.tsx'
SUBMIT = ROOT / 'app/api/public/forms/[slug]/submit/route.ts'
GUARD = ROOT / 'lib/form-duplicate-lead.ts'
TRACKING = ROOT / 'lib/tracking.ts'
SCHEMA = ROOT / 'prisma/schema.prisma'


def read(path: Path) -> str:
    return path.read_text()


def test_protection_is_opt_in_and_scoped_to_a_form_phone_field():
    builder = read(BUILDER)
    submit = read(SUBMIT)
    assert 'Cadastro único por formulário' in builder
    assert 'preventDuplicateLead?: boolean' in builder
    assert 'primaryPhoneRules?.preventDuplicateLead === true' in submit
    assert 'disabled={primaryPhoneFieldIndex < 0}' in builder


def test_duplicate_check_is_scoped_by_tenant_form_and_phone():
    guard = read(GUARD)
    assert '"tenant_id" = ${tenantId}' in guard
    assert '"form_id" = ${formId}' in guard
    assert "regexp_replace(COALESCE(\"phone\", ''), '[^0-9]', '', 'g')" in guard
    assert "digits.startsWith('55') ? digits.slice(2) : digits" in guard


def test_concurrent_duplicate_submissions_are_serialized_without_void_deserialization_or_schema_change():
    guard = read(GUARD)
    assert 'pg_advisory_xact_lock' in guard
    assert 'WITH lock_guard AS MATERIALIZED' in guard
    assert 'SELECT 1::int AS locked FROM lock_guard' in guard
    assert 'Array<{ locked: number }>' in guard
    assert 'SELECT pg_advisory_xact_lock(hashtext(${formId}), hashtext(${digits})) AS locked' not in guard
    schema = read(SCHEMA)
    assert '@@unique([formId, phone])' not in schema


def test_existing_lead_is_reused_before_rotation_without_crm_mutation():
    submit = read(SUBMIT)
    lookup_index = submit.index('const existingLeadId = await findExistingLeadIdByPhoneInForm(')
    existing_return_index = submit.index('return { lead: existing, created: false } as const;', lookup_index)
    rotation_index = submit.index('const rotation = await assignLeadByRotation(', lookup_index)
    create_index = submit.index('const created = await tx.lead.create(', rotation_index)
    assert lookup_index < existing_return_index < rotation_index < create_index
    duplicate_branch = submit[lookup_index:existing_return_index]
    assert 'tx.lead.update' not in duplicate_branch
    assert 'tx.lead.create' not in duplicate_branch


def test_every_qualified_submission_gets_new_meta_event_and_reaches_tracking():
    submit = read(SUBMIT)
    transaction_index = submit.index('const leadResult = await prisma.$transaction')
    meta_event_index = submit.index('const metaLeadEventId = crypto.randomUUID()', transaction_index)
    tracking_index = submit.index('await dispatchFormSubmissionTracking(', meta_event_index)
    assert transaction_index < meta_event_index < tracking_index
    assert 'metaLeadEventId,' in submit[tracking_index:]
    assert '{ status: 409 }' not in submit
    assert 'DuplicateFormPhoneError' not in submit


def test_public_meta_lead_bypasses_stage_duplicate_guard_but_kanban_keeps_it():
    tracking = read(TRACKING)
    assert "mapping.provider === 'meta'" in tracking
    assert "mapping.eventName === 'Lead'" in tracking
    assert "context.source === 'public_form'" in tracking
    assert 'Boolean(context.metaLeadEventId)' in tracking
    assert 'return !isPublicMetaLeadSubmission' in tracking
    assert '} else if (shouldApplyStageDuplicateGuard(mapping, context)) {' in tracking
    assert 'await shouldSkipDuplicate({' in tracking


def test_pixel_and_capi_share_one_id_per_submission_while_repeat_submissions_get_new_ids():
    submit = read(SUBMIT)
    tracking = read(TRACKING)
    assert 'const metaLeadEventId = crypto.randomUUID()' in submit
    assert 'toPublicMetaPixelConfig(metaRuntime, metaLeadEventId)' in submit
    assert 'metaLeadEventId,' in submit
    assert 'return context.metaLeadEventId;' in tracking


def test_current_submission_attribution_enriches_capi_without_overwriting_existing_lead_attribution():
    submit = read(SUBMIT)
    tracking = read(TRACKING)
    assert 'const submissionMetaAttribution = {' in submit
    assert 'metaAttribution: submissionMetaAttribution' in submit
    assert 'if (leadCreated) {' in submit
    persistence = submit.index('await prisma.leadAttribution.create')
    lead_created_guard = submit.rfind('if (leadCreated) {', 0, persistence)
    assert lead_created_guard >= 0
    assert 'applySubmissionMetaAttribution' in tracking
    assert 'attribution.clientIpAddress' in tracking
    assert 'attribution.clientUserAgent' in tracking
    assert 'attribution.landingPage || data.landingPage' in tracking


def test_same_phone_remains_allowed_in_other_forms():
    guard = read(GUARD)
    assert '"form_id" = ${formId}' in guard
    assert 'tenantId: string' in guard
    assert 'formId: string' in guard
