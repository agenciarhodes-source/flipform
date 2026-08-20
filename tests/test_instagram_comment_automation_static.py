from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_comment_automation_uses_append_only_audit_snapshots_without_schema_change():
    service = read('lib/meta/instagram-comment-automation.ts')
    schema = read('prisma/schema.prisma')

    assert "AUTOMATION_ENTITY_TYPE = 'instagram_comment_automation'" in service
    assert "AUTOMATION_CREATED_ACTION = 'INSTAGRAM_COMMENT_AUTOMATION_CREATED'" in service
    assert "AUTOMATION_UPDATED_ACTION = 'INSTAGRAM_COMMENT_AUTOMATION_UPDATED'" in service
    assert 'tx.auditLog.create' in service
    assert 'loadLatestRules' in service
    assert 'versionNumber = 1' in service
    assert 'versionNumber = current.versionNumber + 1' in service
    assert 'entityId: ruleId' in service
    assert 'entityId: input.ruleId' in service
    assert 'model InstagramCommentAutomation' not in schema


def test_rule_writes_are_serialized_per_tenant_and_tenant_scoped():
    service = read('lib/meta/instagram-comment-automation.ts')
    routes = '\n'.join([
        read('app/api/integrations/instagram/comment-automations/route.ts'),
        read('app/api/integrations/instagram/comment-automations/[id]/route.ts'),
    ])

    assert 'FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE' in service
    assert "withPermission('INTEGRATIONS_VIEW'" in routes
    assert "withPermission('INTEGRATIONS_EDIT'" in routes
    assert 'session.tenantId' in routes
    assert 'session.userId' in routes
    assert 'tenantId: z.' not in routes
    assert 'export const DELETE' not in routes


def test_keyword_normalization_and_matching_are_deterministic():
    service = read('lib/meta/instagram-comment-automation.ts')

    assert ".normalize('NFKC')" in service
    assert '.toLowerCase()' in service
    assert ".replace(/[^\\p{L}\\p{N}]+/gu, ' ')" in service
    assert "input.matchType === 'exact'" in service
    assert '` ${input.normalizedComment} `.includes(` ${input.normalizedKeyword} `)' in service
    assert 'rules.sort((left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id))' in service
    assert 'const rule = rules.find(candidate =>' in service


def test_comment_and_matching_core_execution_commit_atomically():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    engine = read('lib/automation/execution-engine.ts')

    assert 'prepareInstagramCommentCoreCutover' in runtime
    assert "input.comment.field === 'comments'" in runtime
    assert 'return await prisma.$transaction(async tx =>' in runtime
    assert 'const event = await tx.webhookEvent.create' in runtime
    assert 'await enqueueInstagramCommentCoreAutomation(tx' in runtime
    assert 'sourceEventKey: eventId' in runtime
    assert 'sourceCommentEventId: event.id' in runtime
    assert 'automationQueued: Boolean(preparedAutomation && commentText)' in runtime
    assert 'createInstagramCommentAutomationJob' not in runtime
    assert "AUTOMATION_EXECUTION_PROVIDER = 'automation_execution_v1'" in engine


def test_duplicate_comment_webhook_cannot_create_a_late_or_duplicate_automation_job():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert "error.code === 'P2002'" in runtime
    assert "return { duplicate: true as const, automationQueued: false as const }" in runtime
    assert 'if (persisted.duplicate) result.commentDuplicates += 1' in runtime
    assert 'if (persisted.automationQueued) result.automationsQueued += 1' in runtime


def test_legacy_automation_queue_remains_durable_for_transition_drain():
    service = read('lib/meta/instagram-comment-automation.ts')

    assert "AUTOMATION_JOB_PROVIDER = 'instagram_comment_automation'" in service
    assert "AUTOMATION_JOB_SOURCE = 'flipform_instagram_comment_automation'" in service
    assert 'ruleVersionId: input.prepared.ruleVersionId' in service
    assert 'rule.versionId !== job.metadata.ruleVersionId' in service
    assert "'rule_version_changed'" in service
    assert 'processedAt: new Date()' in service


def test_legacy_worker_claims_with_skip_locked_and_reuses_safe_private_reply_runtime():
    service = read('lib/meta/instagram-comment-automation.ts')

    assert 'FOR UPDATE SKIP LOCKED' in service
    assert 'PROCESSING_LEASE_MS = 2 * 60_000' in service
    assert 'MAX_INTERNAL_ATTEMPTS = 3' in service
    assert 'enqueueAndDispatchInstagramPrivateReply' in service
    assert 'idempotencyKey: `automation:${job.metadata.ruleId}:${source.id}`' in service
    assert "error.code === 'ALREADY_REPLIED'" in service
    assert 'graph.instagram.com' not in service
    assert 'fetch(' not in service


def test_worker_attributes_to_current_authorized_user_and_has_no_crm_mutation():
    service = read('lib/meta/instagram-comment-automation.ts')

    assert "status: 'active'" in service
    assert "can(preferred.role, 'INTEGRATIONS_EDIT')" in service
    assert "can(membership.role, 'INTEGRATIONS_EDIT')" in service
    assert 'preferredUserId: rule.configuredByUserId || job.metadata.configuredByUserId' in service
    assert 'prisma.lead.' not in service
    assert 'prisma.conversation.' not in service
    assert 'prisma.message.' not in service
    assert 'tx.lead.' not in service
    assert 'tx.conversation.' not in service
    assert 'tx.message.' not in service


def test_signed_webhook_drains_core_and_pre_cutover_legacy_jobs_with_safe_fallback():
    route = read('app/api/webhooks/meta/instagram/route.ts')
    worker = read('lib/automation/worker.ts')
    helper = read('lib/vercel-wait-until.ts')

    assert "Symbol.for('@next/request-context')" in helper
    assert "Symbol.for('@vercel/request-context')" not in helper
    assert 'waitUntil?: (promise: Promise<unknown>) => void' in helper
    assert 'waitUntil(promise)' in helper
    assert 'return false' in helper
    assert 'runAutomationWorker' in route
    assert 'drainAutomationExecutionQueue' in worker
    assert 'createInstagramPrivateReplyAutomationHandler' in worker
    assert 'drainInstagramCommentAutomationQueue' in route
    assert 'const backgroundWork = Promise.all([coreWork, legacyDrainWork]).then(() => undefined)' in route
    assert 'scheduleAfterResponse(backgroundWork)' in route
    assert 'await backgroundWork' in route
    assert route.index("if (!verifyInstagramWebhookSignature") < route.index('const coreWork = runAutomationWorker')
    assert (ROOT / 'vercel.json').exists()
    assert not (ROOT / 'app/api/cron/instagram-comment-automations/route.ts').exists()


def test_automation_foundation_has_no_migration_or_destructive_customer_data_operation():
    paths = [
        'lib/meta/instagram-comment-automation.ts',
        'lib/meta/instagram-webhook-runtime.ts',
        'app/api/webhooks/meta/instagram/route.ts',
        'app/api/integrations/instagram/comment-automations/route.ts',
        'app/api/integrations/instagram/comment-automations/[id]/route.ts',
        'lib/automation/bridges/instagram-comment-core-cutover.ts',
    ]
    combined = '\n'.join(read(path) for path in paths).upper()

    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET', 'DELETE FROM MESSAGES'):
        assert destructive not in combined
