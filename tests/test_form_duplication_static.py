from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_duplicate_endpoint_permissions_tenant_transaction_and_audit():
    route = read('app/api/forms/[id]/duplicate/route.ts')
    assert "withPermission('FORMS_CREATE'" in route
    assert "rateLimit({ key: `form-duplicate:${session.tenantId}:${session.userId}`" in route
    assert "where: { id: ctx.params.id, tenantId: session.tenantId }" in route
    assert "return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })" in route
    assert 'tenantId: session.tenantId' in route
    assert 'await prisma.$transaction' in route
    assert "action: 'form.duplicated'" in route
    assert 'sourceFormId: sourceForm.id' in route
    assert 'newFormId: duplicatedForm.id' in route
    assert 'status: 201' in route


def test_duplicate_endpoint_copies_configuration_but_not_generated_data():
    route = read('app/api/forms/[id]/duplicate/route.ts')
    for copied in [
        'publicTitle: sourceForm.publicTitle',
        'publicDescription: sourceForm.publicDescription',
        'primaryColor: sourceForm.primaryColor',
        'bgColor: sourceForm.bgColor',
        'buttonColor: sourceForm.buttonColor',
        'textColor: sourceForm.textColor',
        'theme: sourceForm.theme',
        'logoUrl: sourceForm.logoUrl',
        'coverImageUrl: sourceForm.coverImageUrl',
        'successMessage: sourceForm.successMessage',
        'disqualificationSettings: jsonValue(sourceForm.disqualificationSettings)',
        "leadSource: sourceForm.leadSource || 'formulario'",
        'pipelineId: sourceForm.pipelineId',
        'initialStageId: sourceForm.initialStageId',
        'label: field.label',
        'placeholder: field.placeholder',
        'description: field.description',
        'fieldType: field.fieldType',
        'options: jsonValue(field.options)',
        'validationRules: jsonValue(field.validationRules)',
        'isRequired: field.isRequired',
        'orderIndex: field.orderIndex',
    ]:
        assert copied in route
    assert 'isActive: false' in route
    assert 'include: { fields: { orderBy: { orderIndex: \'asc\' } }, _count: { select: { leads: true, fields: true } } }' in route
    assert 'leads: {' not in route
    assert 'answers: {' not in route


def test_duplicate_name_slug_pipeline_and_rotation_rules():
    name_helper = read('lib/forms/generate-duplicate-form-name.ts')
    slug_helper = read('lib/forms/generate-unique-form-slug.ts')
    route = read('app/api/forms/[id]/duplicate/route.ts')
    assert 'tenantId,' in name_helper
    assert '`${baseName} (cópia)`' in name_helper
    assert '`${baseName} (cópia ${copy})`' in name_helper
    assert 'slugify(params.name)' in slug_helper
    assert 'excludeSlug' in slug_helper
    assert "e.code === 'P2002'" in route
    assert 'pipeline.isArchived || stage.isArchived' in route
    assert 'INVALID_PIPELINE_STAGE' in route
    assert 'assignmentRotations' in route
    assert 'currentIndex: 0' in route
    assert 'lastAssignedTo: null' in route
    assert "role: 'agent', status: 'active'" in route


def test_listing_and_ui_expose_duplicate_only_when_authorized():
    forms_route = read('app/api/forms/route.ts')
    page = read('app/(app)/forms/page.tsx')
    rbac = read('lib/rbac.ts')
    assert "FORMS_CREATE: ['owner', 'admin']" in rbac
    assert "canDuplicate: can(session.role, 'FORMS_CREATE')" in forms_route
    assert 'CopyPlus' in page
    assert 'duplicatingId' in page
    assert 'title="Duplicar formulário"' in page
    assert 'aria-label={`Duplicar formulário ${f.name}`}' in page
    assert 'f.canDuplicate &&' in page
    assert "fetch(`/api/forms/${form.id}/duplicate`, { method: 'POST' })" in page
    assert 'toast.success(`Formulário “${data.form.name}” duplicado com sucesso.`)' in page
    assert 'toast.warning(data.warning)' in page
    assert 'load();' in page
