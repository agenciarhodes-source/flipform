from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'components/form-builder.tsx'
SUBMIT = ROOT / 'app/api/public/forms/[slug]/submit/route.ts'
GUARD = ROOT / 'lib/form-duplicate-lead.ts'
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


def test_concurrent_duplicate_submissions_are_serialized_without_schema_change():
    guard = read(GUARD)
    assert 'pg_advisory_xact_lock' in guard
    assert 'hashtext(${formId})' in guard
    assert 'hashtext(${digits})' in guard
    schema = read(SCHEMA)
    assert '@@unique([formId, phone])' not in schema


def test_duplicate_guard_runs_before_rotation_and_lead_creation():
    submit = read(SUBMIT)
    guard_index = submit.index('await assertPhoneNotUsedInForm(')
    rotation_index = submit.index('const rotation = await assignLeadByRotation(', guard_index)
    create_index = submit.index('const created = await tx.lead.create(', rotation_index)
    assert guard_index < rotation_index < create_index


def test_duplicate_submission_never_reaches_meta_or_tracking_pipeline():
    submit = read(SUBMIT)
    guard_index = submit.index('await assertPhoneNotUsedInForm(')
    meta_event_index = submit.index('const metaLeadEventId = crypto.randomUUID()', guard_index)
    tracking_index = submit.index('await dispatchFormSubmissionTracking(', meta_event_index)
    assert guard_index < meta_event_index < tracking_index


def test_duplicate_response_is_explicit_without_exposing_existing_lead():
    submit = read(SUBMIT)
    guard = read(GUARD)
    assert "DUPLICATE_FORM_PHONE_CODE = 'duplicate_form_phone'" in guard
    assert 'Este número de telefone já foi cadastrado neste formulário.' in guard
    assert '{ status: 409 }' in submit
    duplicate_catch = submit[submit.index('if (e instanceof DuplicateFormPhoneError)'):]
    assert 'leadId' not in duplicate_catch.split("console.error('public submit error'", 1)[0]


def test_same_phone_remains_allowed_in_other_forms():
    guard = read(GUARD)
    assert '"form_id" = ${formId}' in guard
    assert 'tenantId: string' in guard
    assert 'formId: string' in guard
