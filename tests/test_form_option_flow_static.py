from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'components/form-builder.tsx'
PUBLIC_TYPEFORM = ROOT / 'components/public-typeform.tsx'
VALIDATION = ROOT / 'lib/form-field-validation.ts'
SCHEMAS = ROOT / 'lib/schemas.ts'


def read(path: Path) -> str:
    return path.read_text()


def test_builder_exposes_flow_toggle_and_per_option_destination_link():
    source = read(BUILDER)
    assert '<Label>Fluxo</Label>' in source
    assert '<Label className="text-xs">Link de destino</Label>' in source
    assert 'updateOptionRedirectUrl' in source
    assert 'O redirecionamento só acontece depois que o cadastro for salvo com sucesso.' in source


def test_flow_is_limited_to_single_choice_and_requires_valid_http_links():
    source = read(VALIDATION)
    assert "Fluxo está disponível apenas para perguntas de escolha única." in source
    assert "Informe um link válido (http:// ou https://) para cada opção do Fluxo." in source
    assert "url.protocol === 'http:' || url.protocol === 'https:'" in source


def test_flow_cannot_share_a_question_with_qualification():
    source = read(VALIDATION)
    assert 'isFlow(rules) && isQualifier(rules)' in source
    assert 'Fluxo e qualificação não podem ser usados na mesma pergunta.' in source


def test_form_schema_persists_flow_metadata_inside_existing_json_fields():
    source = read(SCHEMAS)
    assert 'redirectUrl: flowRedirectUrlSchema.optional()' in source
    assert 'isFlow: z.boolean().optional()' in source


def test_redirect_happens_only_after_submit_resolves_successfully():
    source = read(PUBLIC_TYPEFORM)
    submit_index = source.index('const result = await onSubmit(')
    flow_resolution_index = source.index('const flowRedirectUrl =', submit_index)
    redirect_index = source.index('window.location.href = flowRedirectUrl;', flow_resolution_index)
    assert submit_index < flow_resolution_index < redirect_index


def test_flow_redirect_takes_priority_over_global_qualified_redirect():
    source = read(PUBLIC_TYPEFORM)
    flow_index = source.index('if (flowRedirectUrl)')
    qualified_index = source.index('const qualifiedRedirectUrl = form.disqualificationSettings?.qualifiedRedirectUrl || null;', flow_index)
    assert flow_index < qualified_index
