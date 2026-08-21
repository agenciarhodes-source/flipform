import { prisma } from '@/lib/prisma';

const PLATFORM_WHATSAPP_COLUMNS = [
  'whatsapp_embedded_signup_config_id',
  'whatsapp_business_id',
  'whatsapp_system_user_id',
  'whatsapp_admin_system_user_access_token_encrypted',
  'whatsapp_system_user_access_token_encrypted',
] as const;

async function execute(label: string, sql: string) {
  process.stdout.write(`[whatsapp-schema] ${label}... `);
  await prisma.$executeRawUnsafe(sql);
  console.log('ok');
}

async function main() {
  await execute(
    'platform columns',
    `ALTER TABLE public.platform_meta_settings
      ADD COLUMN IF NOT EXISTS whatsapp_embedded_signup_config_id TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_business_id TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_system_user_id TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_admin_system_user_access_token_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_system_user_access_token_encrypted TEXT`,
  );

  await execute(
    'connection table',
    `CREATE TABLE IF NOT EXISTS public.tenant_whatsapp_connections (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      waba_id TEXT NOT NULL,
      waba_name TEXT,
      phone_number_id TEXT NOT NULL,
      display_phone_number TEXT,
      verified_name TEXT,
      quality_rating TEXT,
      connected_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      system_user_assigned_at TIMESTAMP(3),
      subscribed_at TIMESTAMP(3),
      last_validated_at TIMESTAMP(3),
      revoked_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL,
      CONSTRAINT tenant_whatsapp_connections_pkey PRIMARY KEY (id)
    )`,
  );

  // Keep this repair safe even if an older environment created a partial table.
  const connectionColumns: Array<[string, string]> = [
    ['tenant_id', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'connected'"],
    ['waba_id', 'TEXT'],
    ['waba_name', 'TEXT'],
    ['phone_number_id', 'TEXT'],
    ['display_phone_number', 'TEXT'],
    ['verified_name', 'TEXT'],
    ['quality_rating', 'TEXT'],
    ['connected_at', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['system_user_assigned_at', 'TIMESTAMP(3)'],
    ['subscribed_at', 'TIMESTAMP(3)'],
    ['last_validated_at', 'TIMESTAMP(3)'],
    ['revoked_at', 'TIMESTAMP(3)'],
    ['created_at', 'TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ['updated_at', 'TIMESTAMP(3)'],
  ];
  for (const [column, definition] of connectionColumns) {
    await execute(
      `connection column ${column}`,
      `ALTER TABLE public.tenant_whatsapp_connections ADD COLUMN IF NOT EXISTS ${column} ${definition}`,
    );
  }

  await execute(
    'waba unique index',
    'CREATE UNIQUE INDEX IF NOT EXISTS tenant_whatsapp_connections_waba_id_key ON public.tenant_whatsapp_connections(waba_id)',
  );
  await execute(
    'phone unique index',
    'CREATE UNIQUE INDEX IF NOT EXISTS tenant_whatsapp_connections_phone_number_id_key ON public.tenant_whatsapp_connections(phone_number_id)',
  );
  await execute(
    'tenant index',
    'CREATE INDEX IF NOT EXISTS tenant_whatsapp_connections_tenant_id_idx ON public.tenant_whatsapp_connections(tenant_id)',
  );
  await execute(
    'tenant status index',
    'CREATE INDEX IF NOT EXISTS tenant_whatsapp_connections_tenant_id_status_idx ON public.tenant_whatsapp_connections(tenant_id, status)',
  );

  const foreignKey = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'tenant_whatsapp_connections_tenant_id_fkey'
        AND conrelid = 'public.tenant_whatsapp_connections'::regclass
    ) AS exists`,
  );
  if (!foreignKey[0]?.exists) {
    await execute(
      'tenant foreign key',
      `ALTER TABLE public.tenant_whatsapp_connections
       ADD CONSTRAINT tenant_whatsapp_connections_tenant_id_fkey
       FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'platform_meta_settings'`,
  );
  const names = new Set(columns.map(row => row.column_name));
  const missing = PLATFORM_WHATSAPP_COLUMNS.filter(column => !names.has(column));
  const table = await prisma.$queryRawUnsafe<Array<{ table_name: string | null }>>(
    `SELECT to_regclass('public.tenant_whatsapp_connections')::text AS table_name`,
  );

  if (missing.length || !table[0]?.table_name) {
    throw new Error(`WhatsApp schema repair incomplete: ${missing.join(', ') || 'connection table missing'}`);
  }
  console.log('[whatsapp-schema] schema ready');
}

main()
  .catch(error => {
    console.error('[whatsapp-schema] repair failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
