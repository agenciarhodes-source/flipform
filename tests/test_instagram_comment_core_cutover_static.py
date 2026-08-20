from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_cutover_reconciles_legacy_rule_under_tenant_lock_and_reuses_matching_mirror():
    bridge = read('lib/automation/bridges/instagram-comment-core-cutover.ts')

    assert "SELECT id FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE" in bridge
    assert 'entityType: AUTOMATION_DEFINITION_ENTITY_TYPE' in bridge
    assert 'entityId: input.rule.id' in bridge
    assert 'mirrorMatchesRule(current, input.rule)' in bridge
    assert 'return snapshotFromMirror(current, input.rule)' in bridge
    assert 'syncInstagramCommentAutomationRuleToCore(tx, {' in bridge


def test_cutover_preserves_legacy_priority_and_matching_before_core_enqueue():
    bridge = read('lib/automation/bridges/instagram-comment-core-cutover.ts')
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert 'listInstagramCommentAutomations(input.tenantId)' in bridge
    assert 'const rule = rules.find(candidate =>' in bridge
    assert 'candidate.enabled' in bridge
    assert 'instagramCommentAutomationMatches({' in bridge
    assert 'normalizedKeyword: candidate.keywordNormalized' in bridge
    assert 'matchType: candidate.matchType' in bridge
    assert 'prepareInstagramCommentCoreCutover' in runtime
    assert 'enqueueInstagramCommentCoreAutomation' in runtime


def test_cutover_falls_back_to_authorized_actor_and_fails_closed_without_one():
    bridge = read('lib/automation/bridges/instagram-comment-core-cutover.ts')

    assert "where: { tenantId, status: 'active' }" in bridge
    assert "can(membership.role, 'INTEGRATIONS_EDIT')" in bridge
    assert 'input.rule.configuredByUserId' in bridge
    assert 'if (!userId) return null' in bridge


def test_new_comments_use_only_core_queue_while_legacy_worker_is_drain_only():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    route = read('app/api/webhooks/meta/instagram/route.ts')

    assert 'await enqueueInstagramCommentCoreAutomation(tx' in runtime
    assert 'createInstagramCommentAutomationJob' not in runtime
    assert 'runAutomationWorker' in route
    assert 'legacyDrainWork' in route
    assert 'drainInstagramCommentAutomationQueue' in route


def test_cutover_does_not_touch_crm_or_add_schema_migration():
    bridge = read('lib/automation/bridges/instagram-comment-core-cutover.ts')
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    schema = read('prisma/schema.prisma')
    combined = bridge + '\n' + runtime

    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.pipeline.',
        'tx.pipeline.',
        'prisma.conversation.',
        'tx.conversation.',
        'prisma.message.',
        'tx.message.',
    ):
        assert forbidden not in combined

    assert 'model InstagramCommentCoreCutover' not in schema
