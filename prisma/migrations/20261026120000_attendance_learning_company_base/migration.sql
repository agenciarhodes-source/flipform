-- Company learning base: where each suggestion came from, its theme, and the "what to avoid" kind.
-- Additive: two new columns and one more allowed kind.
ALTER TABLE "attendance_learning_suggestions" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'human_success';
ALTER TABLE "attendance_learning_suggestions" ADD COLUMN IF NOT EXISTS "topic" TEXT;
ALTER TABLE "attendance_learning_suggestions" DROP CONSTRAINT IF EXISTS "attendance_learning_suggestions_kind_check";
ALTER TABLE "attendance_learning_suggestions" ADD CONSTRAINT "attendance_learning_suggestions_kind_check" CHECK ("kind" IN ('phrase', 'objection', 'triage', 'explanation', 'closing', 'avoid', 'other'));
ALTER TABLE "attendance_learning_suggestions" DROP CONSTRAINT IF EXISTS "attendance_learning_suggestions_origin_check";
ALTER TABLE "attendance_learning_suggestions" ADD CONSTRAINT "attendance_learning_suggestions_origin_check" CHECK ("origin" IN ('human_success', 'human_failure', 'ai_review'));
