-- Adds Gestor do grupo ('manager') to the roles a business group member can have.
-- Only widens the allowed values: every existing member keeps the role they have.
ALTER TABLE business_group_users DROP CONSTRAINT IF EXISTS business_group_users_role_check;
ALTER TABLE business_group_users ADD CONSTRAINT business_group_users_role_check CHECK (role IN ('owner', 'admin', 'manager', 'viewer'));
