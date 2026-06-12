import { prisma } from '@/lib/prisma';

type ColumnInfo = { column_name: string; data_type: string; udt_name: string; is_nullable: string };
type IndexInfo = { tablename: string; indexname: string; indexdef: string };
type EnumInfo = { enum_name: string; enum_value: string };

export type AdminSchemaCheck = {
  label: string;
  ok: boolean;
  detail?: string;
  suggestion?: string;
  runtimeEssential?: boolean;
  diagnosticEssential?: boolean;
};

export type ReadinessProfile = 'runtime' | 'diagnostic';

export class AdminSchemaNotReadyError extends Error {
  code = 'DB_SCHEMA_NOT_READY';
  status = 503;
  details: { code: 'DB_SCHEMA_NOT_READY'; missing: string[]; checks: AdminSchemaCheck[] };

  constructor(checks: AdminSchemaCheck[], profile: ReadinessProfile = 'runtime') {
    const failed = checks.filter((check) => isEssential(check, profile) && !check.ok);
    super('DB_SCHEMA_NOT_READY');
    this.name = 'AdminSchemaNotReadyError';
    this.details = {
      code: 'DB_SCHEMA_NOT_READY',
      missing: failed.map((check) => check.label),
      checks: failed,
    };
  }
}

const REQUIRED_TABLES = ['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions', 'audit_logs', 'payments', 'tenant_integration_settings', 'kanban_stage_tracking_events', 'tracking_event_logs'];
const RUNTIME_REQUIRED_TABLES = new Set(['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions']);

const REQUIRED_COLUMNS: Record<string, string[]> = {
  tenants: ['id', 'name', 'slug', 'status', 'plan_id', 'next_due_date', 'internal_notes', 'last_login_at', 'created_at', 'updated_at'],
  users: ['id', 'name', 'email', 'password_hash', 'global_role', 'created_at', 'updated_at'],
  tenant_users: ['id', 'tenant_id', 'user_id', 'role', 'status', 'created_at'],
  allowed_users: ['id', 'email', 'tenant_id', 'role', 'active', 'status', 'source', 'invited_by', 'accepted_at', 'created_at', 'updated_at'],
  subscriptions: ['id', 'tenant_id', 'plan_id', 'status', 'current_period_start', 'current_period_end', 'next_due_date', 'provider', 'payment_required', 'grace_period_ends_at', 'payment_provider', 'provider_customer_id', 'provider_subscription_id', 'created_at', 'updated_at', 'canceled_at'],
  plans: ['id', 'name', 'slug', 'description', 'price', 'billing_cycle', 'max_users', 'max_forms', 'max_leads_per_month', 'max_pipelines', 'can_use_reports', 'can_export_csv', 'can_use_custom_branding', 'can_use_meta_pixel', 'can_use_webhooks', 'can_use_tasks', 'is_active', 'created_at', 'updated_at'],
  payments: ['id', 'tenant_id', 'subscription_id', 'provider', 'provider_payment_id', 'status', 'value', 'due_date', 'paid_at', 'invoice_url', 'bank_slip_url', 'pix_qr_code', 'billing_type', 'raw_payload', 'created_at', 'updated_at'],
  tenant_integration_settings: ['id', 'tenant_id', 'meta_pixel_enabled', 'meta_pixel_id', 'meta_access_token_encrypted', 'meta_test_event_code', 'gtm_enabled', 'gtm_container_id', 'ga4_enabled', 'ga4_measurement_id', 'ga4_api_secret_encrypted', 'google_ads_enabled', 'google_ads_id', 'google_ads_label', 'created_at', 'updated_at'],
  kanban_stage_tracking_events: ['id', 'tenant_id', 'pipeline_id', 'stage_id', 'provider', 'event_name', 'custom_event_name', 'conversion_label', 'conversion_value', 'currency', 'metadata', 'enabled', 'created_at', 'updated_at'],
  tracking_event_logs: ['id', 'tenant_id', 'lead_id', 'pipeline_id', 'from_stage_id', 'to_stage_id', 'provider', 'event_name', 'status', 'reason', 'triggered_by_id', 'event_id', 'created_at'],
};

function add(checks: AdminSchemaCheck[], check: AdminSchemaCheck) {
  checks.push({ runtimeEssential: true, diagnosticEssential: true, ...check });
}

function isEssential(check: AdminSchemaCheck, profile: ReadinessProfile) {
  return profile === 'runtime' ? check.runtimeEssential !== false : check.diagnosticEssential !== false;
}

async function tableNames() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `;
  return new Set((rows as Array<{ table_name: string }>).map((row) => row.table_name));
}

async function columnsFor(tableName: string) {
  const rows = (await prisma.$queryRawUnsafe(
    `select column_name, data_type, udt_name, is_nullable
     from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    tableName,
  )) as ColumnInfo[];
  return new Map((rows as ColumnInfo[]).map((row) => [row.column_name, row]));
}

async function enumValues() {
  const rows = await prisma.$queryRaw<EnumInfo[]>`
    select t.typname as enum_name, e.enumlabel as enum_value
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
  `;
  const values = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!values.has(row.enum_name)) values.set(row.enum_name, new Set());
    values.get(row.enum_name)?.add(row.enum_value);
  }
  return values;
}

function indexHasColumn(indexDef: string, column: string) {
  return new RegExp(`\\b${column}\\b`, 'i').test(indexDef.replace(/"/g, ''));
}

function enumAcceptsValue(column: ColumnInfo | undefined, enums: Map<string, Set<string>>, prismaEnumName: string, legacyEnumName: string, value: string) {
  if (!column) return false;
  if (['text', 'character varying', 'varchar'].includes(column.data_type)) return true;
  const enumNames = [column.udt_name, prismaEnumName, legacyEnumName].filter(Boolean);
  return enumNames.some((name) => enums.get(name)?.has(value));
}


let allowedUsersRepairPromise: Promise<void> | null = null;

async function allowedUsersLooksReady() {
  const tables = await tableNames();
  if (!tables.has('allowed_users')) return false;
  const columns = await columnsFor('allowed_users');
  const required = REQUIRED_COLUMNS.allowed_users || [];
  if (required.some((column) => !columns.has(column))) return false;

  const indexes = await prisma.$queryRaw<IndexInfo[]>`
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public' and tablename = 'allowed_users'
  `;
  const typedIdxLocal = indexes as IndexInfo[];
  const hasCompositeUnique = typedIdxLocal.some((idx) => idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'email'));
  const hasGlobalEmailUnique = typedIdxLocal.some((idx) => idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email') && !indexHasColumn(idx.indexdef, 'tenant_id'));
  return hasCompositeUnique && !hasGlobalEmailUnique && columns.get('invited_by')?.is_nullable === 'YES';
}

async function repairAllowedUsersTableForLegacyDatabases() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS allowed_users (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      email TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      active BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'admin',
      invited_by TEXT,
      accepted_at TIMESTAMP WITHOUT TIME ZONE,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )
  `);

  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS email TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS tenant_id TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS invited_by TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITHOUT TIME ZONE`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()`);
  await prisma.$executeRawUnsafe(`UPDATE allowed_users SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL OR id = ''`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users ALTER COLUMN id SET NOT NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS allowed_users_email_key`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "AllowedUser_email_key"`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_id_key ON allowed_users(id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS allowed_users_email_idx ON allowed_users(email)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS allowed_users_tenant_id_idx ON allowed_users(tenant_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS allowed_users_active_idx ON allowed_users(active)`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email)`);
}

async function ensureAllowedUsersTableForLegacyDatabases() {
  if (!allowedUsersRepairPromise) {
    allowedUsersRepairPromise = (async () => {
      if (await allowedUsersLooksReady()) return;
      await repairAllowedUsersTableForLegacyDatabases();
    })().catch((error) => {
      allowedUsersRepairPromise = null;
      throw error;
    });
  }
  return allowedUsersRepairPromise;
}

export async function runAdminSchemaReadinessChecks(): Promise<AdminSchemaCheck[]> {
  if (process.env.ADMIN_SCHEMA_RUNTIME_REPAIR === 'true') {
    await ensureAllowedUsersTableForLegacyDatabases();
  }

  const checks: AdminSchemaCheck[] = [];
  const tables = await tableNames();

  for (const table of REQUIRED_TABLES) {
    add(checks, {
      label: `table.${table}`,
      ok: tables.has(table),
      suggestion: table === 'allowed_users' ? 'Aplique a migration 202605240000_ensure_allowed_users_table com npx prisma migrate deploy.' : `Aplique as migrations: npx prisma migrate deploy`,
      runtimeEssential: RUNTIME_REQUIRED_TABLES.has(table),
    });
  }

  const columnMaps = new Map<string, Map<string, ColumnInfo>>();
  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const tableColumns = tables.has(table) ? await columnsFor(table) : new Map<string, ColumnInfo>();
    columnMaps.set(table, tableColumns);
    for (const column of requiredColumns) {
      add(checks, {
        label: `column.${table}.${column}`,
        ok: tableColumns.has(column),
        suggestion: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ...;`,
        runtimeEssential: RUNTIME_REQUIRED_TABLES.has(table),
      });
    }
  }

  const indexes = await prisma.$queryRaw<IndexInfo[]>`
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions', 'payments', 'tenant_integration_settings', 'kanban_stage_tracking_events', 'tracking_event_logs')
  `;

  type IdxRow = IndexInfo;
  const typedIndexes = indexes as IdxRow[];
  const hasUsersEmailUnique = typedIndexes.some((idx) => idx.tablename === 'users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email'));
  const hasTenantsSlugUnique = typedIndexes.some((idx) => idx.tablename === 'tenants' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'slug'));
  const hasTenantUsersUnique = typedIndexes.some((idx) => idx.tablename === 'tenant_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'user_id'));
  const hasAllowedCompositeUnique = typedIndexes.some((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'email'));
  const hasAllowedGlobalEmailUnique = typedIndexes.some((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email') && !indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasPlansSlugUnique = typedIndexes.some((idx) => idx.tablename === 'plans' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'slug'));
  const hasSubscriptionsTenant = typedIndexes.some((idx) => idx.tablename === 'subscriptions' && indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasSubscriptionsTenantStatus = typedIndexes.some((idx) => idx.tablename === 'subscriptions' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'status'));
  const hasSubscriptionsTenantNextDueDate = typedIndexes.some((idx) => idx.tablename === 'subscriptions' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'next_due_date'));
  const hasPaymentsTenant = typedIndexes.some((idx) => idx.tablename === 'payments' && indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasPaymentsStatus = typedIndexes.some((idx) => idx.tablename === 'payments' && indexHasColumn(idx.indexdef, 'status'));
  const hasPaymentsTenantStatus = typedIndexes.some((idx) => idx.tablename === 'payments' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'status'));
  const hasPaymentsTenantDueDate = typedIndexes.some((idx) => idx.tablename === 'payments' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'due_date'));
  const hasPaymentsTenantCreatedAt = typedIndexes.some((idx) => idx.tablename === 'payments' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'created_at'));
  const hasTenantIntegrationTenantUnique = typedIndexes.some((idx) => idx.tablename === 'tenant_integration_settings' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasTenantIntegrationTenant = typedIndexes.some((idx) => idx.indexname === 'tenant_integration_settings_tenant_id_idx' && idx.tablename === 'tenant_integration_settings' && indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasKanbanTrackingTenant = typedIndexes.some((idx) => idx.indexname === 'kanban_stage_tracking_events_tenant_id_idx' && idx.tablename === 'kanban_stage_tracking_events' && indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasKanbanTrackingStage = typedIndexes.some((idx) => idx.indexname === 'kanban_stage_tracking_events_stage_id_idx' && idx.tablename === 'kanban_stage_tracking_events' && indexHasColumn(idx.indexdef, 'stage_id'));
  const hasKanbanTrackingTenantStageProvider = typedIndexes.some((idx) => idx.indexname === 'kanban_stage_tracking_events_tenant_stage_provider_idx' && idx.tablename === 'kanban_stage_tracking_events' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'stage_id') && indexHasColumn(idx.indexdef, 'provider'));
  const hasTrackingLogsTenant = typedIndexes.some((idx) => idx.indexname === 'tracking_event_logs_tenant_id_idx' && idx.tablename === 'tracking_event_logs' && indexHasColumn(idx.indexdef, 'tenant_id'));
  const hasTrackingLogsLead = typedIndexes.some((idx) => idx.indexname === 'tracking_event_logs_lead_id_idx' && idx.tablename === 'tracking_event_logs' && indexHasColumn(idx.indexdef, 'lead_id'));
  const hasTrackingLogsCreatedAt = typedIndexes.some((idx) => idx.indexname === 'tracking_event_logs_created_at_idx' && idx.tablename === 'tracking_event_logs' && indexHasColumn(idx.indexdef, 'created_at'));
  const hasTrackingLogsTenantProviderCreatedAt = typedIndexes.some((idx) => idx.indexname === 'tracking_event_logs_tenant_provider_created_at_idx' && idx.tablename === 'tracking_event_logs' && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'provider') && indexHasColumn(idx.indexdef, 'created_at'));

  const invitedBy = columnMaps.get('allowed_users')?.get('invited_by') as ColumnInfo | undefined;
  add(checks, {
    label: 'column.allowed_users.invited_by_nullable',
    ok: invitedBy?.is_nullable === 'YES',
    detail: invitedBy ? `nullable=${invitedBy.is_nullable}` : 'not found',
    suggestion: 'ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL;',
  });

  add(checks, { label: 'index.users.email_unique', ok: hasUsersEmailUnique, suggestion: 'Aplique a migration que cria unique em users.email.' });
  add(checks, { label: 'index.tenants.slug_unique', ok: hasTenantsSlugUnique, suggestion: 'Aplique a migration que cria unique em tenants.slug.' });
  add(checks, { label: 'index.tenant_users.tenant_id_user_id_unique', ok: hasTenantUsersUnique, suggestion: 'Aplique a migration que cria unique em tenant_users(tenant_id, user_id).' });
  add(checks, { label: 'index.plans.slug_unique', ok: hasPlansSlugUnique, suggestion: 'CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_key ON plans(slug);' });
  add(checks, {
    label: 'index.allowed_users.no_global_email_unique',
    ok: !hasAllowedGlobalEmailUnique,
    detail: hasAllowedGlobalEmailUnique ? typedIndexes.filter((idx: IndexInfo) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email')).map((idx: IndexInfo) => idx.indexname).join(', ') : undefined,
    suggestion: 'ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS "AllowedUser_email_key";',
  });
  add(checks, {
    label: 'index.allowed_users.tenant_id_email_unique',
    ok: hasAllowedCompositeUnique,
    suggestion: 'CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email);',
  });

  add(checks, { label: 'index.subscriptions.tenant_id', ok: hasSubscriptionsTenant, suggestion: 'CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_idx ON subscriptions(tenant_id);' });
  add(checks, { label: 'index.subscriptions.tenant_id_status', ok: hasSubscriptionsTenantStatus, suggestion: 'CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_status_idx ON subscriptions(tenant_id, status);' });
  add(checks, { label: 'index.subscriptions.tenant_id_next_due_date', ok: hasSubscriptionsTenantNextDueDate, suggestion: 'CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_next_due_date_idx ON subscriptions(tenant_id, next_due_date);' });
  add(checks, { label: 'index.payments.tenant_id', ok: hasPaymentsTenant, suggestion: 'CREATE INDEX IF NOT EXISTS payments_tenant_id_idx ON payments(tenant_id);', runtimeEssential: false });
  add(checks, { label: 'index.payments.status', ok: hasPaymentsStatus, suggestion: 'CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);', runtimeEssential: false });
  add(checks, { label: 'index.payments.tenant_id_status', ok: hasPaymentsTenantStatus, suggestion: 'CREATE INDEX IF NOT EXISTS payments_tenant_id_status_idx ON payments(tenant_id, status);', runtimeEssential: false });
  add(checks, { label: 'index.payments.tenant_id_due_date', ok: hasPaymentsTenantDueDate, suggestion: 'CREATE INDEX IF NOT EXISTS payments_tenant_id_due_date_idx ON payments(tenant_id, due_date);', runtimeEssential: false });
  add(checks, { label: 'index.payments.tenant_id_created_at', ok: hasPaymentsTenantCreatedAt, suggestion: 'CREATE INDEX IF NOT EXISTS payments_tenant_id_created_at_idx ON payments(tenant_id, created_at);', runtimeEssential: false });


  add(checks, { label: 'index.tenant_integration_settings.tenant_id_unique', ok: hasTenantIntegrationTenantUnique, suggestion: 'CREATE UNIQUE INDEX IF NOT EXISTS tenant_integration_settings_tenant_id_key ON tenant_integration_settings(tenant_id);', runtimeEssential: false });
  add(checks, { label: 'index.tenant_integration_settings.tenant_id', ok: hasTenantIntegrationTenant, suggestion: 'CREATE INDEX IF NOT EXISTS tenant_integration_settings_tenant_id_idx ON tenant_integration_settings(tenant_id);', runtimeEssential: false });
  add(checks, { label: 'index.kanban_stage_tracking_events.tenant_id', ok: hasKanbanTrackingTenant, suggestion: 'CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_id_idx ON kanban_stage_tracking_events(tenant_id);', runtimeEssential: false });
  add(checks, { label: 'index.kanban_stage_tracking_events.stage_id', ok: hasKanbanTrackingStage, suggestion: 'CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_stage_id_idx ON kanban_stage_tracking_events(stage_id);', runtimeEssential: false });
  add(checks, { label: 'index.kanban_stage_tracking_events.tenant_stage_provider', ok: hasKanbanTrackingTenantStageProvider, suggestion: 'CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_stage_provider_idx ON kanban_stage_tracking_events(tenant_id, stage_id, provider);', runtimeEssential: false });
  add(checks, { label: 'index.tracking_event_logs.tenant_id', ok: hasTrackingLogsTenant, suggestion: 'CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_id_idx ON tracking_event_logs(tenant_id);', runtimeEssential: false });
  add(checks, { label: 'index.tracking_event_logs.lead_id', ok: hasTrackingLogsLead, suggestion: 'CREATE INDEX IF NOT EXISTS tracking_event_logs_lead_id_idx ON tracking_event_logs(lead_id);', runtimeEssential: false });
  add(checks, { label: 'index.tracking_event_logs.created_at', ok: hasTrackingLogsCreatedAt, suggestion: 'CREATE INDEX IF NOT EXISTS tracking_event_logs_created_at_idx ON tracking_event_logs(created_at);', runtimeEssential: false });
  add(checks, { label: 'index.tracking_event_logs.tenant_provider_created_at', ok: hasTrackingLogsTenantProviderCreatedAt, suggestion: 'CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_provider_created_at_idx ON tracking_event_logs(tenant_id, provider, created_at);', runtimeEssential: false });

  const enums = await enumValues();
  add(checks, {
    label: 'enum.SubscriptionStatus.courtesy',
    ok: enumAcceptsValue(columnMaps.get('subscriptions')?.get('status'), enums, 'SubscriptionStatus', 'subscription_status', 'courtesy'),
    suggestion: 'ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS courtesy; ou use coluna text compatível.',
  });
  add(checks, {
    label: 'enum.TenantStatus.active',
    ok: enumAcceptsValue(columnMaps.get('tenants')?.get('status'), enums, 'TenantStatus', 'tenant_status', 'active'),
    suggestion: 'ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS active; ou use coluna text compatível.',
  });
  add(checks, {
    label: 'enum.Role.owner',
    ok: enumAcceptsValue(columnMaps.get('tenant_users')?.get('role'), enums, 'Role', 'role', 'owner'),
    suggestion: 'ALTER TYPE "Role" ADD VALUE IF NOT EXISTS owner; ou use coluna text compatível.',
  });

  if (tables.has('plans') && columnMaps.get('plans')?.has('slug') && columnMaps.get('plans')?.has('is_active')) {
    const plans = await prisma.$queryRaw<Array<{ slug: string; is_active: boolean }>>`
      select slug, is_active
      from plans
      where slug in ('starter', 'growth', 'pro')
    `;
    const activePlanCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(*)::bigint as count
      from plans
      where is_active = true
    `;
    add(checks, {
      label: 'plan.any_active',
      ok: Number(activePlanCount[0]?.count ?? 0) > 0,
      detail: `active=${String(activePlanCount[0]?.count ?? 0)}`,
      suggestion: 'Ative ou crie ao menos um plano antes de criar acesso manual.',
      diagnosticEssential: true,
      runtimeEssential: true,
    });
    for (const slug of ['starter', 'growth', 'pro']) {
      const plan = (plans as Array<{ slug: string; is_active: boolean }>).find((item) => item.slug === slug);
      add(checks, {
        label: `plan.${slug}.active`,
        ok: Boolean(plan?.is_active),
        detail: plan ? `active=${plan.is_active}` : 'not found',
        suggestion: `INSERT INTO plans (...) SELECT ... WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = '${slug}');`,
        runtimeEssential: false,
      });
    }
  } else {
    add(checks, { label: 'plan.any_active', ok: false, detail: 'plans.slug/is_active unavailable', suggestion: 'Aplique a migration de reparo dos planos.' });
    for (const slug of ['starter', 'growth', 'pro']) {
      add(checks, { label: `plan.${slug}.active`, ok: false, detail: 'plans.slug/is_active unavailable', suggestion: 'Aplique a migration de reparo dos planos.', runtimeEssential: false });
    }
  }

  return checks;
}

export function getFailedAdminSchemaChecks(checks: AdminSchemaCheck[], profile: ReadinessProfile = 'runtime') {
  return checks.filter((check) => isEssential(check, profile) && !check.ok);
}

export async function assertAdminSchemaReady(profile: ReadinessProfile = 'runtime') {
  const checks = await runAdminSchemaReadinessChecks();
  const failed = getFailedAdminSchemaChecks(checks, profile);
  if (failed.length) throw new AdminSchemaNotReadyError(checks, profile);
}
