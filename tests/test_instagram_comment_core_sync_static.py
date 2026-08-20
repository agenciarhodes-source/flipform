from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_legacy_rule_writes_mirror_atomically_in_same_transaction():
    legacy = read('lib/meta/instagram-comment-automation.ts')
    bridge = read('lib/automation/bridges/instagram-comment-rule-sync.ts')

    assert "syncInstagramCommentAutomationRuleToCore" in legacy
    assert legacy.count('await syncInstagramCommentAutomationRuleToCore(tx, {') == 2
    assert 'definitionId: input.ruleId' in bridge
    assert "type: INSTAGRAM_COMMENT_KEYWORD_TRIGGER" in bridge
    assert "type: INSTAGRAM_PRIVATE_REPLY_ACTION" in bridge
    assert "id: INSTAGRAM_PRIVATE_REPLY_ACTION_ID" in bridge
    assert 'keyword: input.keyword' in bridge
    assert 'matchType: input.matchType' in bridge
    assert 'replyText: input.replyText' in bridge
    assert 'enabled: input.enabled' in bridge
    assert 'orderIndex: input.orderIndex' in bridge


def test_definition_store_supports_transactional_mirror_upsert():
    store = read('lib/automation/definition-store.ts')

    assert 'export async function upsertAutomationDefinitionMirrorInTransaction' in store
    assert 'tx: Prisma.TransactionClient' in store
    assert "SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE" in store
    assert "const action = current ? AUTOMATION_DEFINITION_UPDATED_ACTION : AUTOMATION_DEFINITION_CREATED_ACTION" in store
    assert 'const versionNumber = (current?.versionNumber ?? 0) + 1' in store
    assert 'entityId: definitionId' in store
    assert 'metadata: toJson(definitionMetadata({' in store


def test_cutover_runs_core_while_legacy_queue_is_drain_only():
    route = read('app/api/webhooks/meta/instagram/route.ts')
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    bridge = read('lib/automation/bridges/instagram-comment-rule-sync.ts')
    legacy = read('lib/meta/instagram-comment-automation.ts')

    assert 'drainAutomationExecutionQueue' in route
    assert 'createInstagramPrivateReplyAutomationHandler' in route
    assert 'drainInstagramCommentAutomationQueue' in route
    assert 'legacyDrainWork' in route
    assert 'enqueueInstagramCommentCoreAutomation' in runtime
    assert 'prepareInstagramCommentCoreCutover' in runtime
    assert 'createInstagramCommentAutomationJob' not in runtime
    assert 'enqueueAutomationExecution' not in bridge
    assert 'drainAutomationExecutionQueue' not in bridge

    combined = bridge + '\n' + legacy + '\n' + runtime + '\n' + route
    for forbidden in ('/api/leads', '/api/kanban', 'prisma.lead.', 'tx.lead.'):
        assert forbidden not in combined


def test_core_mirror_contract_matches_existing_adapter_literals():
    bridge = read('lib/automation/bridges/instagram-comment-rule-sync.ts')
    adapter = read('lib/automation/adapters/instagram-comment.ts')

    assert "INSTAGRAM_COMMENT_KEYWORD_TRIGGER = 'instagram.comment.keyword'" in bridge
    assert "INSTAGRAM_PRIVATE_REPLY_ACTION = 'instagram.private_reply'" in bridge
    assert "INSTAGRAM_COMMENT_KEYWORD_TRIGGER = 'instagram.comment.keyword'" in adapter
    assert "INSTAGRAM_PRIVATE_REPLY_ACTION = 'instagram.private_reply'" in adapter
