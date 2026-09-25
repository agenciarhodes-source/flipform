from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'components/form-builder.tsx'
SUBMIT = ROOT / 'app/api/public/forms/[slug]/submit/route.ts'
GUARD = ROOT / 'lib/form-duplicate-lead.ts'
TRACKING = ROOT / 'lib/tracking.ts'
SCHEMA = ROOT / 'prisma/schema.prisma'


def read(path: Path) -> str:
    return path.read_text()


def test_protection_is_mandatory_and_account_wide_for_all_forms():
    builder = read(BUILDER)
    submit = read(SUBMIT)
    assert 'Cadastro único por conta' in builder
    assert 'Esta proteção é obrigatória em toda a conta.' in builder
    assert 'nenhum formulário ou atendente poderá criar outro cadastro' in builder
    assert 'primaryPhoneRules?.preventDuplicateLead === true' not in submit
    assert 'const uniqueContactPhone = phone;' in submit
    assert 'const uniqueContactEmail = email;' in submit
    assert 'setPreventDuplicateLead' not in builder


def test_duplicate_check_is_scoped_by_tenant_contact_not_form():
    guard = read(GUARD)
    assert '"tenant_id" = ${tenantId}' in guard
    assert '"form_id" = ${formId}' not in guard
    assert "regexp_replace(COALESCE(\"phone\", ''), '[^0-9]', '', 'g')" in guard
    assert "LOWER(BTRIM(COALESCE(\"email\", '')))" in guard
    assert "digits.startsWith('55') ? digits.slice(2) : digits" in guard


def test_concurrent_duplicate_submissions_are_serialized_without_void_deserialization_or_schema_change():
    guard = read(GUARD)
    assert 'pg_advisory_xact_lock' in guard
    assert 'WITH lock_guard AS MATERIALIZED' in guard
    assert 'SELECT 1::int AS locked FROM lock_guard' in guard
    assert 'Array<{ locked: number }>' in guard
    assert 'SELECT pg_advisory_xact_lock(hashtext(${formId}), hashtext(${digits})) AS locked' not in guard
    assert 'pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${key}))' in guard
    schema = read(SCHEMA)
    assert '@@unique([formId, phone])' not in schema


def test_existing_lead_is_reused_before_rotation_without_crm_mutation():
    submit = read(SUBMIT)
    lookup_index = submit.index('const existingLeadId = await findExistingLeadIdByContactInTenant(')
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


def test_same_contact_is_reused_across_different_forms_in_the_same_account():
    guard = read(GUARD)
    submit = read(SUBMIT)
    assert '"form_id" = ${formId}' not in guard
    assert 'tenantId: string' in guard
    assert 'findExistingLeadIdByContactInTenant' in submit
    assert 'where: { id: existingLeadId, tenantId: form.tenantId }' in submit
    assert 'where: { id: existingLeadId, tenantId: form.tenantId, formId: form.id }' not in submit


def test_account_scope_preserves_original_crm_source_and_owner_on_repeat_submission():
    submit = read(SUBMIT)
    lookup_index = submit.index('const existingLeadId = await findExistingLeadIdByContactInTenant(')
    return_index = submit.index('return { lead: existing, created: false } as const;', lookup_index)
    branch = submit[lookup_index:return_index]
    assert 'tx.lead.update' not in branch
    assert 'source:' not in branch
    assert 'data: { assignedTo:' not in branch
    assert 'assignedTo: true' in branch


def test_account_uniqueness_does_not_depend_on_assignee_or_form_setting():
    submit = read(SUBMIT)
    lookup_index = submit.index('const existingLeadId = await findExistingLeadIdByContactInTenant(')
    lookup_branch = submit[lookup_index:submit.index('if (existingLeadId)', lookup_index)]
    assert 'tenantId: form.tenantId' in lookup_branch
    assert 'assignedTo' not in lookup_branch
    assert 'formId' not in lookup_branch
    assert 'preventDuplicateLead' not in submit
