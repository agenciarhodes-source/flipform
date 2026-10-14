-- How long before the due date the owner of a task is reminded. Null: no reminder.
-- Additive only: one nullable column; existing tasks keep no reminder.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "remind_minutes_before" INTEGER;
