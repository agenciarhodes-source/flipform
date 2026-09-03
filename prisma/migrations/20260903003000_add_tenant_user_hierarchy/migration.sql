-- Additive only. This migration creates the hierarchy relation and does not
-- update, backfill, delete or rewrite any existing tenant/user/lead data.
CREATE TABLE IF NOT EXISTS public.tenant_user_hierarchy (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  superior_tenant_user_id TEXT NOT NULL,
  subordinate_tenant_user_id TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tenant_user_hierarchy_no_self CHECK (superior_tenant_user_id <> subordinate_tenant_user_id),
  CONSTRAINT tenant_user_hierarchy_unique_edge UNIQUE (tenant_id, superior_tenant_user_id, subordinate_tenant_user_id),
  CONSTRAINT tenant_user_hierarchy_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT tenant_user_hierarchy_superior_fk FOREIGN KEY (superior_tenant_user_id) REFERENCES public.tenant_users(id) ON DELETE CASCADE,
  CONSTRAINT tenant_user_hierarchy_subordinate_fk FOREIGN KEY (subordinate_tenant_user_id) REFERENCES public.tenant_users(id) ON DELETE CASCADE,
  CONSTRAINT tenant_user_hierarchy_created_by_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS tenant_user_hierarchy_tenant_superior_idx
  ON public.tenant_user_hierarchy (tenant_id, superior_tenant_user_id);

CREATE INDEX IF NOT EXISTS tenant_user_hierarchy_tenant_subordinate_idx
  ON public.tenant_user_hierarchy (tenant_id, subordinate_tenant_user_id);
