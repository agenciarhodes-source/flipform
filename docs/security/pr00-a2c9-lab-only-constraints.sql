-- PR00 A2-C.9: EXPERIMENTAL LAB ONLY. NOT A MIGRATION. DO NOT RUN IN PRODUCTION/STAGING.
-- These statements have ALREADY BEEN TESTED only on isolated lab branch br-quiet-voice-bcs6win0.
-- The guard below fails CLOSED if database/project/branch or fictional fixtures differ.
-- SQL submitted to GitHub for review only; do not re-execute it on the already patched lab.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'flipform_staging'
     OR current_setting('neon.project_id',true) <> 'holy-fog-36254823'
     OR current_setting('neon.branch_id',true) <> 'br-quiet-voice-bcs6win0'
     OR (SELECT count(*) FROM public.tenants) <> 2
     OR (SELECT count(*) FROM public.leads) <> 2
     OR (SELECT count(*) FROM public.tasks) <> 2
     OR (SELECT count(*) FROM public.pipeline_stages) <> 2
     OR (SELECT count(*) FROM pg_constraint WHERE conname LIKE 'a2c9_%') <> 0
     OR (SELECT md5(string_agg(id||':'||tenant_id||':'||pipeline_id||':'||stage_id,';' ORDER BY id)) FROM public.leads) <> '82921cd235a03124a4b81f54df339e73'
     OR (SELECT md5(string_agg(id||':'||tenant_id||':'||coalesce(lead_id,''),';' ORDER BY id)) FROM public.tasks) <> '2568a229dc63a7e5460bc39575a235d1'
     OR (SELECT md5(string_agg(id||':'||pipeline_id,';' ORDER BY id)) FROM public.pipeline_stages) <> '4c0953ddd5af92e210217c87016f921b'
  THEN
    RAISE EXCEPTION 'PR00 A2-C.9 STOP: wrong branch/database or modified synthetic fixtures';
  END IF;
END
$guard$;
-- Phase 1: target keys, duplicating id with tenant/pipeline only to enable scoped FKs.
ALTER TABLE public.pipelines ADD CONSTRAINT a2c9_pipelines_id_tenant_unique UNIQUE (id,tenant_id);
ALTER TABLE public.leads ADD CONSTRAINT a2c9_leads_id_tenant_unique UNIQUE (id,tenant_id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT a2c9_stages_id_pipeline_unique UNIQUE (id,pipeline_id);

-- Phase 2: same-tenant and same-pipeline FKs; add NOT VALID first, then validate.
ALTER TABLE public.leads ADD CONSTRAINT a2c9_leads_pipeline_tenant_fk
 FOREIGN KEY (pipeline_id,tenant_id) REFERENCES public.pipelines(id,tenant_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.leads ADD CONSTRAINT a2c9_leads_stage_pipeline_fk
 FOREIGN KEY (stage_id,pipeline_id) REFERENCES public.pipeline_stages(id,pipeline_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.tasks ADD CONSTRAINT a2c9_tasks_lead_tenant_fk
 FOREIGN KEY (lead_id,tenant_id) REFERENCES public.leads(id,tenant_id)
 ON UPDATE RESTRICT ON DELETE CASCADE NOT VALID;

ALTER TABLE public.leads VALIDATE CONSTRAINT a2c9_leads_pipeline_tenant_fk;
ALTER TABLE public.leads VALIDATE CONSTRAINT a2c9_leads_stage_pipeline_fk;
ALTER TABLE public.tasks VALIDATE CONSTRAINT a2c9_tasks_lead_tenant_fk;
COMMIT;
-- NOTE: A2-C.9 lab proof DOES NOT cover the remaining tenant FKs, optional SET NULL
-- relationships, Prisma migrate/diff round trips, RLS, app authentication, or real data.
