-- Closing documents sent as they are (PDF) and chosen by case type. Additive only: two new columns.
ALTER TABLE "closing_document_templates" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'docx';
ALTER TABLE "closing_document_templates" ADD COLUMN IF NOT EXISTS "checklist_ids" JSONB NOT NULL DEFAULT '[]';
