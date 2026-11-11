-- Closing documents: the stage the lead goes to when the documents are sent. Additive only: one new column.
ALTER TABLE "closing_document_settings" ADD COLUMN IF NOT EXISTS "stage_id" TEXT;
