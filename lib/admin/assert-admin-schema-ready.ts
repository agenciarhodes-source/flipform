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

const REQUIRED_TABLES = ['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions', 'audit_logs', 'payments'];
const RUNTIME_REQUIRED_TABLES = new Set(['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions']);

const REQUIRED_COLUMNS: Record<string, string[]> = {
  tenants: ['id', 'name', 'slug', 'status', 'plan_id', 'internal_notes', 'last_login_at', 'created_at', 'updated_at'],
  users: ['id', 'name', 'email', 'password_hash', 'global_role', 'created_at', 'updated_at'],
  tenant_users: ['id', 'tenant_id', 'user_id', 'role', 'status', 'created_at'],
  allowed_users: ['id', 'email', 'tenant_id', 'role', 'active', 'status', 'source', 'invited_by', 'accepted_at', 'created_at', 'updated_at'],
  subscriptions: ['id', 'tenant_id', 'plan_id', 'status', 'provider', 'payment_required', 'payment_provider', 'created_at', 'updated_at'],
  plans: ['id', 'name', 'slug', 'description', 'price', 'billing_cycle', 'max_users', 'max_forms', 'max_leads_per_month', 'max_pipelines', 'can_use_reports', 'can_export_csv', 'can_use_custom_branding', 'can_use_meta_pixel', 'can_use_webhooks', 'can_use_tasks', 'is_active', 'created_at', 'updated_at'],
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
  return new Set(rows.map((row) => row.table_name));
}

async function columnsFor(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<ColumnInfo[]>(
    `select column_name, data_type, udt_name, is_nullable
     from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    tableName,
  );
  return new Map(rows.map((row) => [row.column_name, row]));
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

export async function runAdminSchemaReadinessChecks(): Promise<AdminSchemaCheck[]> {
  const checks: AdminSchemaCheck[] = [];
  const tables = await tableNames();

  for (const table of REQUIRED_TABLES) {
    add(checks, {
      label: `table.${table}`,
      ok: tables.has(table),
      suggestion: `Aplique as migrations: npx prisma migrate deploy`,
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
        runtimeEssential: table in REQUIRED_COLUMNS,
      });
    }
  }

  const indexes = await prisma.$queryRaw<IndexInfo[]>`
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('users', 'tenants', 'tenant_users', 'allowed_users')
  `;

  const hasUsersEmailUnique = indexes.some((idx) => idx.tablename === 'users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email'));
  const hasTenantsSlugUnique = indexes.some((idx) => idx.tablename === 'tenants' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'slug'));
  const hasTenantUsersUnique = indexes.some((idx) => idx.tablename === 'tenant_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'user_id'));
  const hasAllowedCompositeUnique = indexes.some((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'tenant_id') && indexHasColumn(idx.indexdef, 'email'));
  const hasAllowedGlobalEmailUnique = indexes.some((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email') && !indexHasColumn(idx.indexdef, 'tenant_id'));

  const invitedBy = columnMaps.get('allowed_users')?.get('invited_by');
  add(checks, {
    label: 'column.allowed_users.invited_by_nullable',
    ok: invitedBy?.is_nullable === 'YES',
    detail: invitedBy ? `nullable=${invitedBy.is_nullable}` : 'not found',
    suggestion: 'ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL;',
  });

  add(checks, { label: 'index.users.email_unique', ok: hasUsersEmailUnique, suggestion: 'Aplique a migration que cria unique em users.email.' });
  add(checks, { label: 'index.tenants.slug_unique', ok: hasTenantsSlugUnique, suggestion: 'Aplique a migration que cria unique em tenants.slug.' });
  add(checks, { label: 'index.tenant_users.tenant_id_user_id_unique', ok: hasTenantUsersUnique, suggestion: 'Aplique a migration que cria unique em tenant_users(tenant_id, user_id).' });
  add(checks, {
    label: 'index.allowed_users.no_global_email_unique',
    ok: !hasAllowedGlobalEmailUnique,
    detail: hasAllowedGlobalEmailUnique ? indexes.filter((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email')).map((idx) => idx.indexname).join(', ') : undefined,
    suggestion: 'ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS "AllowedUser_email_key";',
  });
  add(checks, {
    label: 'index.allowed_users.tenant_id_email_unique',
    ok: hasAllowedCompositeUnique,
    suggestion: 'CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email);',
  });

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
      const plan = plans.find((item) => item.slug === slug);
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
