-- Security protocol S2: a version per user, written in each login token. Raising it ends every
-- open session (password change, "sair de todos os aparelhos"). Additive only: one column with
-- default 0, so every session open today stays valid.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;
