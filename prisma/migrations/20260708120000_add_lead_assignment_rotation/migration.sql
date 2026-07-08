CREATE TABLE IF NOT EXISTS public.lead_assignment_rotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  strategy TEXT NOT NULL DEFAULT 'round_robin',
  last_assigned_to TEXT,
  current_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lead_assignment_rotations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT lead_assignment_rotations_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE,
  CONSTRAINT lead_assignment_rotations_tenant_form_unique UNIQUE (tenant_id, form_id)
);

CREATE TABLE IF NOT EXISTS public.lead_assignment_rotation_members (
  id TEXT PRIMARY KEY,
  rotation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lead_assignment_rotation_members_rotation_id_fkey FOREIGN KEY (rotation_id) REFERENCES public.lead_assignment_rotations(id) ON DELETE CASCADE,
  CONSTRAINT lead_assignment_rotation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT lead_assignment_rotation_members_rotation_user_unique UNIQUE (rotation_id, user_id)
);

CREATE INDEX IF NOT EXISTS lead_assignment_rotations_tenant_id_idx ON public.lead_assignment_rotations(tenant_id);
CREATE INDEX IF NOT EXISTS lead_assignment_rotations_form_id_idx ON public.lead_assignment_rotations(form_id);
CREATE INDEX IF NOT EXISTS lead_assignment_rotation_members_rotation_id_idx ON public.lead_assignment_rotation_members(rotation_id);
CREATE INDEX IF NOT EXISTS lead_assignment_rotation_members_user_id_idx ON public.lead_assignment_rotation_members(user_id);
CREATE INDEX IF NOT EXISTS lead_assignment_rotation_members_rotation_order_idx ON public.lead_assignment_rotation_members(rotation_id, order_index);
