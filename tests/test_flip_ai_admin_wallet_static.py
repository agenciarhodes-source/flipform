from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_admin_wallet_route_is_platform_admin_only_and_tenant_explicit():
    route = read('app/api/admin/tenants/[id]/flip-ai-credits/route.ts')
    assert route.count('withPlatformAdmin') >= 3
    assert 'tenantId: ctx.params.id' in route
    assert 'actorUserId: session.userId' in route
    assert 'session.tenantId' not in route
    assert 'amountCredits: z.number().int().positive()' in route
    assert 'reason: z.string().trim().min(3).max(190)' in route
    assert 'idempotencyIdentifier:' in route

def test_platform_admin_credit_grant_is_atomic_idempotent_and_audited():
    credits = read('lib/flip-ai/credits.ts')
    assert 'grantFlipAiCreditsByPlatformAdmin' in credits
    assert "idempotencyKey: `platform-admin:${identifier}`" in credits
    assert "source: 'platform_admin_grant'" in credits
    assert "action: 'platform.flip_ai_credits_granted'" in credits
    assert "userId: actorUserId" in credits
    assert "entityId: result.entryId" in credits
    assert "referenceId: reason" in credits
    assert 'recordFlipAiCreditEntryWithDb(db, mutation)' in credits

def test_wallet_queries_and_mutations_remain_tenant_scoped():
    credits = read('lib/flip-ai/credits.ts')
    migration = read('prisma/migrations/20260926010000_flip_ai_credit_wallet/migration.sql')
    assert 'WHERE tenant_id = ${safeTenantId}' in credits
    assert 'WHERE tenant_id = ${mutation.tenantId}' in credits
    assert 'WHERE tenant_id = ${mutation.tenantId} AND id = ${account.id}' in credits
    assert 'flip_ai_credit_accounts_tenant_id_key' in migration
    assert 'flip_ai_credit_ledger_tenant_id_idempotency_key_key' in migration

def test_admin_ui_explains_exclusive_wallet_and_exposes_history():
    page = read('app/admin/(secure)/tenants/[id]/page.tsx')
    assert 'Carteira Flip AI' in page
    assert 'Carteira exclusiva deste cliente' in page
    assert 'O consumo nunca utiliza saldo de outra empresa' in page
    assert 'Adicionar créditos' in page
    assert 'Histórico da carteira' in page
    assert 'entry.idempotencyKey' in page
    assert 'créditos exclusivos deste tenant' in page

def test_tenant_usage_copy_distinguishes_wallet_from_openai_balance():
    page = read('app/(app)/flip-ai/usage/page.tsx')
    assert 'Carteira Flip AI sem créditos' in page
    assert 'Esta carteira pertence somente à sua empresa no FlipForm' in page
    assert 'é separada do saldo operacional da OpenAI' in page

def test_pr_328_does_not_touch_leads_integrations_or_automatic_recharge():
    route = read('app/api/admin/tenants/[id]/flip-ai-credits/route.ts')
    credits = read('lib/flip-ai/credits.ts')
    combined = route + '\n' + credits
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'TenantMetaConnection',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'dispatchFormSubmissionTracking',
        'creditCard',
        'cvv',
        'ASAAS_API_KEY',
        'autoRecharge',
    ]:
        assert forbidden not in combined
