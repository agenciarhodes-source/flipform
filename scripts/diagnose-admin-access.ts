import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Check = { label: string; ok: boolean; detail?: string; suggestion?: string };
const checks: Check[] = [];

function add(label: string, ok: boolean, detail?: string, suggestion?: string) {
  checks.push({ label, ok, detail, suggestion });
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = '${tableName.replace(/'/g, "''")}') as exists`,
  );
  return Boolean(rows[0]?.exists);
}

async function columns(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string; data_type: string }>>(
    `select column_name, is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = '${tableName.replace(/'/g, "''")}'`,
  );
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function enumValues(typeNames: string[]) {
  const quoted = typeNames.map((name) => `'${name.replace(/'/g, "''")}'`).join(',');
  return prisma.$queryRawUnsafe<Array<{ enum_name: string; enum_value: string }>>(
    `select t.typname as enum_name, e.enumlabel as enum_value from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname in (${quoted}) order by t.typname, e.enumsortorder`,
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('FAIL: DATABASE_URL não configurado. O diagnóstico não foi executado.');
    process.exitCode = 1;
    return;
  }

  const requiredTables = ['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions', 'audit_logs'];
  for (const table of requiredTables) add(`table.${table}`, await tableExists(table), undefined, 'Execute as migrations Prisma.');

  const requiredColumns: Record<string, string[]> = {
    tenants: ['id', 'name', 'slug', 'status', 'plan_id', 'internal_notes', 'last_login_at', 'created_at', 'updated_at'],
    users: ['id', 'name', 'email', 'password_hash', 'global_role', 'created_at', 'updated_at'],
    tenant_users: ['tenant_id', 'user_id', 'role', 'status', 'created_at'],
    allowed_users: ['email', 'tenant_id', 'role', 'active', 'status', 'source', 'invited_by', 'accepted_at', 'created_at', 'updated_at'],
    subscriptions: ['tenant_id', 'plan_id', 'status', 'provider', 'payment_required', 'payment_provider', 'created_at', 'updated_at'],
  };

  for (const [table, names] of Object.entries(requiredColumns)) {
    if (!(await tableExists(table))) continue;
    const existing = await columns(table);
    for (const column of names) add(`column.${table}.${column}`, existing.has(column), undefined, `ALTER TABLE ${table} ADD COLUMN ${column} ...;`);
    if (table === 'allowed_users') {
      const invitedBy = existing.get('invited_by');
      add('column.allowed_users.invited_by.nullable', invitedBy?.is_nullable === 'YES', invitedBy ? `nullable=${invitedBy.is_nullable}` : undefined, 'ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL;');
    }
  }

  const enums = await enumValues(['SubscriptionStatus', 'subscription_status', 'TenantStatus', 'tenant_status', 'Role', 'role']);
  const enumMap = new Map<string, Set<string>>();
  for (const row of enums) {
    if (!enumMap.has(row.enum_name)) enumMap.set(row.enum_name, new Set());
    enumMap.get(row.enum_name)?.add(row.enum_value);
  }
  const hasEnumValue = (names: string[], value: string) => names.some((name) => enumMap.get(name)?.has(value));
  add('enum.SubscriptionStatus.courtesy', hasEnumValue(['SubscriptionStatus', 'subscription_status'], 'courtesy'), `found=${JSON.stringify(Object.fromEntries([...enumMap].filter(([name]) => name.toLowerCase().includes('subscription'))))}`, `ALTER TYPE "SubscriptionStatus" ADD VALUE 'courtesy';`);
  add('enum.TenantStatus.active', hasEnumValue(['TenantStatus', 'tenant_status'], 'active'), undefined, `ALTER TYPE "TenantStatus" ADD VALUE 'active';`);
  add('enum.Role.owner', hasEnumValue(['Role', 'role'], 'owner'), undefined, `ALTER TYPE "Role" ADD VALUE 'owner';`);

  const indexes = await prisma.$queryRaw<Array<{ tablename: string; indexname: string; indexdef: string }>>`
    select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('allowed_users', 'tenant_users', 'users')
  `;
  const hasAllowedComposite = indexes.some((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('tenant_id') && idx.indexdef.includes('email'));
  const hasAllowedGlobal = indexes.some((idx) => idx.tablename === 'allowed_users' && idx.indexdef.toLowerCase().includes('unique') && !idx.indexdef.includes('tenant_id') && idx.indexdef.includes('email'));
  const hasTenantUserComposite = indexes.some((idx) => idx.tablename === 'tenant_users' && idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('tenant_id') && idx.indexdef.includes('user_id'));
  const hasUsersEmailUnique = indexes.some((idx) => idx.tablename === 'users' && idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('email'));
  add('index.allowed_users.no_global_email_unique', !hasAllowedGlobal, hasAllowedGlobal ? indexes.filter((idx) => idx.tablename === 'allowed_users' && idx.indexdef.includes('email')).map((idx) => idx.indexname).join(', ') : undefined, 'ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS "AllowedUser_email_key";');
  add('index.allowed_users.tenant_id_email_unique', hasAllowedComposite, undefined, 'CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email);');
  add('index.tenant_users.tenant_id_user_id_unique', hasTenantUserComposite, undefined, 'Create/apply migration with unique tenant_id + user_id.');
  add('index.users.email_unique', hasUsersEmailUnique, undefined, 'Create/apply migration with unique users.email.');

  const plans = await prisma.plan.findMany({ where: { slug: { in: ['starter', 'growth', 'pro'] } }, select: { slug: true, isActive: true }, orderBy: { slug: 'asc' } }).catch(() => []);
  for (const slug of ['starter', 'growth', 'pro']) {
    const plan = plans.find((item) => item.slug === slug);
    add(`plan.${slug}.active`, Boolean(plan?.isActive), plan ? `active=${plan.isActive}` : 'not found', `INSERT/UPDATE plans SET is_active = true WHERE slug = '${slug}';`);
  }
  add('dry_run.active_plan_exists', plans.some((plan) => plan.isActive), undefined, 'Crie ou ative ao menos um plano.');

  const adminUserId = process.env.ADMIN_USER_ID || process.env.ADMIN_SESSION_USER_ID || null;
  if (adminUserId) {
    const admin = await prisma.user.findUnique({ where: { id: adminUserId }, select: { id: true } }).catch(() => null);
    add('dry_run.admin_session_user_exists', Boolean(admin), `adminUserId=${adminUserId}`, 'Use invited_by null ou um adminUserId existente em users.');
  } else {
    add('dry_run.admin_session_user_exists', true, 'ADMIN_USER_ID não informado; invited_by pode ficar null se o admin não existir.');
  }
  const allowedCols = await columns('allowed_users').catch(() => new Map());
  add('dry_run.allowed_users.invited_by_accepts_null', allowedCols.get('invited_by')?.is_nullable === 'YES', undefined, 'ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL;');
  add('dry_run.subscriptions.status_accepts_courtesy', hasEnumValue(['SubscriptionStatus', 'subscription_status'], 'courtesy'), undefined, `ALTER TYPE "SubscriptionStatus" ADD VALUE 'courtesy';`);

  console.log('Admin manual access diagnosis');
  console.log('================================');
  for (const check of checks) {
    console.log(`${check.ok ? 'OK  ' : 'FAIL'} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
    if (!check.ok && check.suggestion) console.log(`     SQL sugerido: ${check.suggestion}`);
  }

  const failed = checks.filter((check) => !check.ok);
  console.log('================================');
  console.log(`Resultado: ${failed.length ? `${failed.length} FAIL` : 'OK'}`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('FAIL: diagnóstico interrompido.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
