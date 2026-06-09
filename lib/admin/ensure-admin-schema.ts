import { prisma } from '@/lib/prisma';

export class AdminSchemaNotReadyError extends Error {
  code = 'DB_SCHEMA_NOT_READY';
  status = 503;
  details: unknown;

  constructor(details: unknown) {
    super('DB_SCHEMA_NOT_READY');
    this.name = 'AdminSchemaNotReadyError';
    this.details = details;
  }
}

let ensurePromise: Promise<void> | null = null;

async function runSafe(label: string, sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    console.error(`[admin-schema] ${label}`, error);
  }
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = '${tableName.replace(/'/g, "''")}') as exists`,
  );
  return Boolean(rows?.[0]?.exists);
}

async function seedDefaultPlans() {
  if (!(await tableExists('plans'))) return;

  await runSafe('plans.add.description', `alter table plans add column if not exists description text`);
  await runSafe('plans.add.slug', `alter table plans add column if not exists slug text`);
  await runSafe('plans.add.billing_cycle', `alter table plans add column if not exists billing_cycle text not null default 'monthly'`);
  await runSafe('plans.add.max_users', `alter table plans add column if not exists max_users integer not null default 0`);
  await runSafe('plans.add.max_forms', `alter table plans add column if not exists max_forms integer not null default 0`);
  await runSafe('plans.add.max_leads_per_month', `alter table plans add column if not exists max_leads_per_month integer not null default 0`);
  await runSafe('plans.add.max_pipelines', `alter table plans add column if not exists max_pipelines integer not null default 0`);
  await runSafe('plans.add.can_use_reports', `alter table plans add column if not exists can_use_reports boolean not null default false`);
  await runSafe('plans.add.can_export_csv', `alter table plans add column if not exists can_export_csv boolean not null default false`);
  await runSafe('plans.add.can_use_custom_branding', `alter table plans add column if not exists can_use_custom_branding boolean not null default false`);
  await runSafe('plans.add.can_use_meta_pixel', `alter table plans add column if not exists can_use_meta_pixel boolean not null default false`);
  await runSafe('plans.add.can_use_webhooks', `alter table plans add column if not exists can_use_webhooks boolean not null default false`);
  await runSafe('plans.add.can_use_tasks', `alter table plans add column if not exists can_use_tasks boolean not null default true`);
  await runSafe('plans.add.is_active', `alter table plans add column if not exists is_active boolean not null default true`);
  await runSafe('plans.add.created_at', `alter table plans add column if not exists created_at timestamp without time zone not null default now()`);
  await runSafe('plans.add.updated_at', `alter table plans add column if not exists updated_at timestamp without time zone not null default now()`);
  await runSafe('plans.backfill.slug', `update plans set slug = lower(regexp_replace(coalesce(nullif(name, ''), id::text), '[^a-zA-Z0-9]+', '-', 'g')) where slug is null or slug = ''`);
  await runSafe('plans.index.slug', `create unique index if not exists plans_slug_key on plans(slug)`);

  const defaults = [
    { id: '710c951e-3df4-4d76-a035-ce90575c24c1', name: 'Starter', slug: 'starter', description: 'Plano inicial para validação e primeiros formulários.', price: '97.00', maxUsers: 2, maxForms: 3, maxPipelines: 1, maxLeads: 500, reports: false, csv: true, branding: false, pixel: false, webhooks: false, tasks: true },
    { id: '7ed5afde-2bbb-453f-9633-7127fd95f2cb', name: 'Growth', slug: 'growth', description: 'Plano recomendado para operação comercial em crescimento.', price: '197.00', maxUsers: 5, maxForms: 10, maxPipelines: 3, maxLeads: 3000, reports: true, csv: true, branding: true, pixel: true, webhooks: false, tasks: true },
    { id: 'd25eef2b-4db4-49ac-ac76-c5665bf1780d', name: 'Pro', slug: 'pro', description: 'Plano avançado para times e integrações.', price: '397.00', maxUsers: 15, maxForms: 50, maxPipelines: 10, maxLeads: 20000, reports: true, csv: true, branding: true, pixel: true, webhooks: true, tasks: true },
  ];

  for (const plan of defaults) {
    await runSafe(
      `plans.seed.${plan.slug}`,
      `insert into plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_pipelines, max_leads_per_month, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
       select '${plan.id}', '${plan.name}', '${plan.slug}', '${plan.description.replace(/'/g, "''")}', ${plan.price}, 'monthly', ${plan.maxUsers}, ${plan.maxForms}, ${plan.maxPipelines}, ${plan.maxLeads}, ${plan.reports}, ${plan.csv}, ${plan.branding}, ${plan.pixel}, ${plan.webhooks}, ${plan.tasks}, true, now(), now()
       where not exists (select 1 from plans where slug = '${plan.slug}')`,
    );
  }
}

async function repairAllowedUsers() {
  if (!(await tableExists('allowed_users'))) return;

  await runSafe('allowed_users.add.tenant_id', `alter table allowed_users add column if not exists tenant_id text`);
  await runSafe('allowed_users.add.role', `alter table allowed_users add column if not exists role text not null default 'owner'`);
  await runSafe('allowed_users.add.active', `alter table allowed_users add column if not exists active boolean not null default true`);
  await runSafe('allowed_users.add.status', `alter table allowed_users add column if not exists status text not null default 'active'`);
  await runSafe('allowed_users.add.source', `alter table allowed_users add column if not exists source text not null default 'admin'`);
  await runSafe('allowed_users.add.invited_by', `alter table allowed_users add column if not exists invited_by text`);
  await runSafe('allowed_users.invited_by.nullable', `alter table allowed_users alter column invited_by drop not null`);
  await runSafe('allowed_users.add.accepted_at', `alter table allowed_users add column if not exists accepted_at timestamp without time zone`);
  await runSafe('allowed_users.add.created_at', `alter table allowed_users add column if not exists created_at timestamp without time zone not null default now()`);
  await runSafe('allowed_users.add.updated_at', `alter table allowed_users add column if not exists updated_at timestamp without time zone not null default now()`);
  await runSafe('allowed_users.drop.global_email_constraint', `alter table allowed_users drop constraint if exists allowed_users_email_key`);
  await runSafe('allowed_users.drop.global_email_idx.1', `drop index if exists allowed_users_email_key`);
  await runSafe('allowed_users.drop.global_email_idx.2', `drop index if exists "AllowedUser_email_key"`);
  await runSafe('allowed_users.index.tenant_email', `create unique index if not exists allowed_users_tenant_id_email_key on allowed_users(tenant_id, email)`);
}

async function repairSubscriptions() {
  if (!(await tableExists('subscriptions'))) return;

  await runSafe('subscription_status.add.courtesy.camel', `do $$ begin if exists (select 1 from pg_type where typname = 'SubscriptionStatus') and not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'SubscriptionStatus' and e.enumlabel = 'courtesy') then alter type "SubscriptionStatus" add value 'courtesy'; end if; end $$`);
  await runSafe('subscription_status.add.courtesy.snake', `do $$ begin if exists (select 1 from pg_type where typname = 'subscription_status') and not exists (select 1 from pg_enum e join pg_type t on e.enumtypid = t.oid where t.typname = 'subscription_status' and e.enumlabel = 'courtesy') then alter type subscription_status add value 'courtesy'; end if; end $$`);
  await runSafe('subscriptions.add.provider', `alter table subscriptions add column if not exists provider text not null default 'asaas'`);
  await runSafe('subscriptions.add.payment_required', `alter table subscriptions add column if not exists payment_required boolean not null default true`);
  await runSafe('subscriptions.add.payment_provider', `alter table subscriptions add column if not exists payment_provider text default 'asaas'`);
  await runSafe('subscriptions.add.created_at', `alter table subscriptions add column if not exists created_at timestamp without time zone not null default now()`);
  await runSafe('subscriptions.add.updated_at', `alter table subscriptions add column if not exists updated_at timestamp without time zone not null default now()`);
}

async function repairTenants() {
  if (!(await tableExists('tenants'))) return;

  await runSafe('tenants.add.plan_id', `alter table tenants add column if not exists plan_id text`);
  await runSafe('tenants.add.internal_notes', `alter table tenants add column if not exists internal_notes text`);
  await runSafe('tenants.add.last_login_at', `alter table tenants add column if not exists last_login_at timestamp without time zone`);
  await runSafe('tenants.add.status', `alter table tenants add column if not exists status text not null default 'active'`);
  await runSafe('tenants.add.created_at', `alter table tenants add column if not exists created_at timestamp without time zone not null default now()`);
  await runSafe('tenants.add.updated_at', `alter table tenants add column if not exists updated_at timestamp without time zone not null default now()`);
}

async function validateEssentialAdminSchema() {
  const failures: Array<{ check: string; message: string; suggestion: string }> = [];
  const requiredTables = ['users', 'tenants', 'tenant_users', 'allowed_users', 'plans', 'subscriptions', 'audit_logs'];

  for (const table of requiredTables) {
    if (!(await tableExists(table))) failures.push({ check: `table.${table}`, message: `Tabela ${table} não existe.`, suggestion: 'Execute as migrations Prisma antes de usar o acesso manual.' });
  }

  const requiredColumns: Record<string, string[]> = {
    tenants: ['id', 'name', 'slug', 'status', 'plan_id', 'internal_notes', 'last_login_at', 'created_at', 'updated_at'],
    users: ['id', 'name', 'email', 'password_hash', 'global_role', 'created_at', 'updated_at'],
    tenant_users: ['tenant_id', 'user_id', 'role', 'status', 'created_at'],
    allowed_users: ['email', 'tenant_id', 'role', 'active', 'status', 'source', 'invited_by', 'accepted_at', 'created_at', 'updated_at'],
    subscriptions: ['tenant_id', 'plan_id', 'status', 'provider', 'payment_required', 'payment_provider', 'created_at', 'updated_at'],
  };
  for (const [table, names] of Object.entries(requiredColumns)) {
    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string }>>(
      `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = '${table.replace(/'/g, "''")}'`,
    );
    const existing = new Map(rows.map((row) => [row.column_name, row]));
    for (const name of names) {
      if (!existing.has(name)) failures.push({ check: `${table}.${name}`, message: `Coluna ${table}.${name} não existe.`, suggestion: `Aplique a migration 20260609_stabilize_manual_admin_access.` });
    }
    if (table === 'allowed_users' && existing.get('invited_by')?.is_nullable !== 'YES') {
      failures.push({ check: 'allowed_users.invited_by.nullable', message: 'allowed_users.invited_by não aceita null.', suggestion: 'ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL;' });
    }
  }

  if (failures.length) throw new AdminSchemaNotReadyError({ failures });

  const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('allowed_users', 'tenant_users', 'users')
  `;
  const hasAllowedComposite = indexes.some((idx) => idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('allowed_users') && idx.indexdef.includes('tenant_id') && idx.indexdef.includes('email'));
  const hasAllowedGlobalEmail = indexes.some((idx) => idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('allowed_users') && !idx.indexdef.includes('tenant_id') && idx.indexdef.includes('email'));
  const hasTenantUserComposite = indexes.some((idx) => idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('tenant_users') && idx.indexdef.includes('tenant_id') && idx.indexdef.includes('user_id'));
  const hasUsersEmailUnique = indexes.some((idx) => idx.indexdef.toLowerCase().includes('unique') && idx.indexdef.includes('users') && idx.indexdef.includes('email'));

  if (!hasAllowedComposite) failures.push({ check: 'allowed_users.unique.tenant_id_email', message: 'allowed_users não tem índice único composto tenant_id + email.', suggestion: 'CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email);' });
  if (hasAllowedGlobalEmail) failures.push({ check: 'allowed_users.unique.email', message: 'allowed_users ainda tem unique global em email.', suggestion: 'ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key; DROP INDEX IF EXISTS allowed_users_email_key;' });
  if (!hasTenantUserComposite) failures.push({ check: 'tenant_users.unique.tenant_id_user_id', message: 'tenant_users não tem índice único composto tenant_id + user_id.', suggestion: 'Crie/aplique a migration que contém @@unique([tenantId, userId]).' });
  if (!hasUsersEmailUnique) failures.push({ check: 'users.unique.email', message: 'users.email não está único.', suggestion: 'Crie/aplique a migration que contém users.email unique.' });

  const activePlans = await prisma.plan.count({ where: { isActive: true, slug: { in: ['starter', 'growth', 'pro'] } } });
  if (activePlans === 0) failures.push({ check: 'plans.active', message: 'Nenhum plano starter/growth/pro ativo encontrado.', suggestion: 'Ative ou crie ao menos um plano starter/growth/pro.' });

  if (failures.length) throw new AdminSchemaNotReadyError({ failures });
}

export async function ensureAdminSchemaReady() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await seedDefaultPlans();
      await repairTenants();
      await repairSubscriptions();
      await repairAllowedUsers();
      await validateEssentialAdminSchema();
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
