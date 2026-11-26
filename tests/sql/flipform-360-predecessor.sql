-- Minimal predecessor contract, NOT a complete historical schema or production copy.
CREATE TABLE tenants (id TEXT PRIMARY KEY);
INSERT INTO tenants (id) VALUES ('fixture-tenant-a'), ('fixture-tenant-b');
