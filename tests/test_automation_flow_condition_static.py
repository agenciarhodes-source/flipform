from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_flow_condition_adapter_is_provider_agnostic_and_supports_safe_operators():
    adapter = read('lib/automation/adapters/flow-condition.ts')

    assert "FLOW_CONDITION_ACTION = 'flow.condition'" in adapter
    for operator in ('equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists'):
        assert f"'{operator}'" in adapter
    assert "normalize('NFKC')" in adapter
    assert "toLocaleLowerCase('pt-BR')" in adapter
    assert 'prisma.' not in adapter
    assert 'fetch(' not in adapter
    assert 'whatsapp' not in adapter.lower()
    assert 'instagram' not in adapter.lower()


def test_flow_condition_handler_reads_only_execution_input_and_stops_flow_on_mismatch():
    handler = read('lib/automation/handlers/flow-condition.ts')

    assert 'context.input[field]' in handler
    assert 'evaluateFlowCondition({' in handler
    assert "status: 'completed'" in handler
    assert "status: 'skipped', code: 'FLOW_CONDITION_NOT_MATCHED'" in handler
    assert "INVALID_FLOW_CONDITION_CONFIG" in handler
    assert 'prisma.' not in handler
    assert 'fetch(' not in handler
    assert 'tenantId:' not in handler


def test_central_worker_registers_condition_without_replacing_existing_handlers():
    worker = read('lib/automation/worker.ts')
    index = read('lib/automation/index.ts')

    assert '[FLOW_CONDITION_ACTION]: createFlowConditionAutomationHandler()' in worker
    assert '[INSTAGRAM_PRIVATE_REPLY_ACTION]: createInstagramPrivateReplyAutomationHandler()' in worker
    assert '[WHATSAPP_SEND_TEXT_ACTION]: createWhatsAppSendTextAutomationHandler()' in worker
    assert '[LEAD_ENSURE_FROM_CONVERSATION_ACTION]: createLeadEnsureFromConversationAutomationHandler()' in worker
    assert '[LEAD_MOVE_STAGE_ACTION]: createLeadMoveStageAutomationHandler()' in worker
    assert 'FLOW_CONDITION_ACTION' in index
    assert 'createFlowConditionAutomationHandler' in index


def test_execution_engine_already_finalizes_skipped_action_without_following_actions():
    engine = read('lib/automation/execution-engine.ts')

    skipped = engine.split("if (result.status === 'skipped')", 1)[1].split("await finalizeExecution({", 2)[1]
    assert "state: 'skipped'" in skipped
    assert "outcome: 'action_skipped'" in skipped
    assert "return 'skipped' as const" in engine


def test_condition_foundation_adds_no_crm_mutation_schema_or_secrets():
    paths = [
        'lib/automation/adapters/flow-condition.ts',
        'lib/automation/handlers/flow-condition.ts',
        'lib/automation/worker.ts',
        'lib/automation/index.ts',
    ]
    combined = '\n'.join(read(path) for path in paths)

    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.pipeline.',
        'tx.pipeline.',
        'accessToken',
        'appSecret',
        'clientSecret',
        'systemUserAccessToken',
        'DROP TABLE',
        'TRUNCATE ',
    ):
        assert forbidden not in combined
