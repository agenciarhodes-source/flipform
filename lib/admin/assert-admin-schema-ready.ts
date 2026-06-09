import { prisma } from '@/lib/prisma';

type ColumnInfo = { column_name: string; data_type: string; udt_name: string; is_nullable: string };
type IndexInfo = { tablename: string; indexname: string; indexdef: string };
type EnumInfo = { enum_name: string; enum_value: string };

export type AdminSchemaCheck = {
  label: string;
  ok: boolean;
  detail?: string;
  suggestion?: string;
  essential?: boolean;
};

export class AdminSchemaNotReadyError extends Error {
  code = 'DB_SCHEMA_NOT_READY';
  status = 503;
  details: { code: 'DB_SCHEMA_NOT_READY'; missing: string[]; checks: AdminSchemaCheck[] };

  constructor(checks: AdminSchemaCheck[]) {
    const failed = checks.filter((check) => check.essential !== false && !check.ok);
    super('DB_SCHEMA_NOT_READY');
    this.name = 'AdminSchemaNotReadyError';
    this.details = {
      code: 'DB_SCHEMA_NOT_READY',
      missing: failed.map((check) => check.label),
      checks: failed,
    };
  }
}

const ESSENTIAL_TABLES = ['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions'];
const OPTIONAL_TABLES = ['audit_logs', 'payments'];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  tenants: ['id', 'name', 'slug', 'status', 'plan_id', 'internal_notes', 'created_at', 'updated_at'],
  users: ['id', 'name', 'email', 'password_hash', 'global_role', 'created_at', 'updated_at'],
  tenant_users: ['id', 'tenant_id', 'user_id', 'role', 'status', 'created_at'],
  allowed_users: ['id', 'email', 'tenant_id', 'role', 'active', 'status', 'source', 'invited_by', 'accepted_at', 'created_at', 'updated_at'],
  subscriptions: ['id', 'tenant_id', 'plan_id', 'status', 'provider', 'payment_required', 'payment_provider', 'created_at', 'updated_at'],
};

function add(checks: AdminSchemaCheck[], check: AdminSchemaCheck) {
  checks.push({ essential: true, ...check });
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

  for (const table of ESSENTIAL_TABLES) {
    add(checks, { label: `table.${table}`, ok: tables.has(table), suggestion: 'Apply pending Prisma migrations.' });
  }

  for (const table of OPTIONAL_TABLES) {
    add(checks, { label: `table.${table}`, ok: tables.has(table), essential: false, suggestion: 'Optional for manual admin access.' });
  }

  const columnMaps = new Map<string, Map<string, ColumnInfo>>();
  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const tableColumns = tables.has(table) ? await columnsFor(table) : new Map<string, ColumnInfo>();
    columnMaps.set(table, tableColumns);
    for (const column of requiredColumns) {
      add(checks, { label: `column.${table}.${column}`, ok: tableColumns.has(column), suggestion: `Column ${table}.${column} is required for manual admin access.` });
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
    suggestion: 'The invited_by column must allow null values.',
  });

  add(checks, { label: 'index.users.email_unique', ok: hasUsersEmailUnique, suggestion: 'The users.email unique index is required.' });
  add(checks, { label: 'index.tenants.slug_unique', ok: hasTenantsSlugUnique, suggestion: 'The tenants.slug unique index is required.' });
  add(checks, { label: 'index.tenant_users.tenant_id_user_id_unique', ok: hasTenantUsersUnique, suggestion: 'The tenant_users tenant/user unique index is required.' });
  add(checks, {
    label: 'index.allowed_users.no_global_email_unique',
    ok: !hasAllowedGlobalEmailUnique,
    detail: hasAllowedGlobalEmailUnique ? indexes.filter((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && indexHasColumn(idx.indexdef, 'email')).map((idx) => idx.indexname).join(', ') : undefined,
    suggestion: 'Remove the legacy global email unique index from allowed_users.',
  });
  add(checks, {
    label: 'index.allowed_users.tenant_id_email_unique',
    ok: hasAllowedCompositeUnique,
    suggestion: 'The allowed_users tenant/email unique index is required.',
  });

  const enums = await enumValues();
  add(checks, {
    label: 'enum.SubscriptionStatus.courtesy',
    ok: enumAcceptsValue(columnMaps.get('subscriptions')?.get('status'), enums, 'SubscriptionStatus', 'subscription_status', 'courtesy'),
    suggestion: 'The subscriptions.status column must accept courtesy.',
  });
  add(checks, {
    label: 'enum.TenantStatus.active',
    ok: enumAcceptsValue(columnMaps.get('tenants')?.get('status'), enums, 'TenantStatus', 'tenant_status', 'active'),
    suggestion: 'The tenants.status column must accept active.',
  });
  add(checks, {
    label: 'enum.Role.owner',
    ok: enumAcceptsValue(columnMaps.get('tenant_users')?.get('role'), enums, 'Role', 'role', 'owner'),
    suggestion: 'The tenant_users.role column must accept owner.',
  });

  if (tables.has('plans') && columnMaps.get('plans')?.has('slug') && columnMaps.get('plans')?.has('is_active')) {
    const activePlans = await prisma.$queryRaw<Array<{ count: bigint }>>`
      select count(*)::bigint as count
      from plans
      where is_active = true
    `;
    add(checks, {
      label: 'plan.any.active',
      ok: Number(activePlans?.[0]?.count ?? 0) > 0,
      detail: `active=${String(activePlans?.[0]?.count ?? 0)}`,
      suggestion: 'At least one active plan is required.',
    });

    const plans = await prisma.$queryRaw<Array<{ slug: string; is_active: boolean }>>`
      select slug, is_active
      from plans
      where slug in ('starter', 'growth', 'pro')
    `;
    for (const slug of ['starter', 'growth', 'pro']) {
      const plan = plans.find((item) => item.slug === slug);
      add(checks, {
        label: `plan.${slug}.active`,
        ok: Boolean(plan?.is_active),
        essential: false,
        detail: plan ? `active=${plan.is_active}` : 'not found',
        suggestion: `Optional default plan '${slug}' is missing or inactive.`,
      });
    }
  } else {
    add(checks, { label: 'plan.any.active', ok: false, detail: 'plans.slug/is_active unavailable', suggestion: 'The plans table must have slug and is_active.' });
  }

  return checks;
}

export async function assertAdminSchemaReady() {
  const checks = await runAdminSchemaReadinessChecks();
  const failed = checks.filter((check) => check.essential !== false && !check.ok);
  if (failed.length) throw new AdminSchemaNotReadyError(checks);
}
