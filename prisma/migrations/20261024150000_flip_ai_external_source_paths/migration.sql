-- Optional page paths an external source is limited to (one per line). Empty = the whole site.
-- Additive only.
ALTER TABLE "flip_ai_external_sources" ADD COLUMN "path_prefix" TEXT;
