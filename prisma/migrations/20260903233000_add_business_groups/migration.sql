CREATE TABLE IF NOT EXISTS business_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_group_tenants (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_group_tenants_group_tenant_key UNIQUE (group_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS business_group_users (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES business_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_group_users_group_user_key UNIQUE (group_id, user_id),
  CONSTRAINT business_group_users_role_check CHECK (role IN ('owner', 'admin', 'viewer')),
  CONSTRAINT business_group_users_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS business_group_tenants_group_id_idx
  ON business_group_tenants(group_id);

CREATE INDEX IF NOT EXISTS business_group_tenants_tenant_id_idx
  ON business_group_tenants(tenant_id);

CREATE INDEX IF NOT EXISTS business_group_users_group_id_idx
  ON business_group_users(group_id);

CREATE INDEX IF NOT EXISTS business_group_users_user_id_idx
  ON business_group_users(user_id);

CREATE INDEX IF NOT EXISTS business_group_users_user_status_idx
  ON business_group_users(user_id, status);
