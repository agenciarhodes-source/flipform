-- PR00 A2-C.13 L1 LAB PROOF ONLY. NEVER RUN IN PRODUCTION OR STAGING ROOT.
-- Not a migration. Guard restricts to completed one-time lab; do NOT re-run on same lab.
BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'flipform_staging'
 OR current_setting('neon.project_id',true)<>'holy-fog-36254823'
 OR current_setting('neon.branch_id',true)<>'br-blue-dawn-bckyng6d'
 OR (SELECT count(*) FROM public.tenants)<>2
 OR (SELECT count(*) FROM public.forms)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE conname LIKE 'a2c13_%')<>0
 OR (SELECT md5(string_agg(id||':'||tenant_id||':'||pipeline_id||':'||stage_id,';' ORDER BY id)) FROM public.leads)<>'82921cd235a03124a4b81f54df339e73'
 OR (SELECT md5(string_agg(id||':'||tenant_id||':'||coalesce(lead_id,''),';' ORDER BY id)) FROM public.tasks)<>'2568a229dc63a7e5460bc39575a235d1'
 THEN RAISE EXCEPTION 'A2C13 STOP: wrong branch, tenant, or fixtures'; END IF;
END $guard$;
ALTER TABLE public.pipelines ADD CONSTRAINT a2c13_pipelines_id_tenant_uq UNIQUE (id,tenant_id);
ALTER TABLE public.leads ADD CONSTRAINT a2c13_leads_id_tenant_uq UNIQUE (id,tenant_id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT a2c13_stages_id_pipeline_uq UNIQUE (id,pipeline_id);
ALTER TABLE public.leads ADD CONSTRAINT a2c13_leads_pipeline_tenant_fk FOREIGN KEY (pipeline_id,tenant_id) REFERENCES public.pipelines(id,tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.forms ADD CONSTRAINT a2c13_forms_pipeline_tenant_fk FOREIGN KEY (pipeline_id,tenant_id) REFERENCES public.pipelines(id,tenant_id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.tasks ADD CONSTRAINT a2c13_tasks_lead_tenant_fk FOREIGN KEY (lead_id,tenant_id) REFERENCES public.leads(id,tenant_id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
-- Deliberate ON UPDATE RESTRICT on stage/pipeline coherence: require product review before any actual migration.
ALTER TABLE public.leads ADD CONSTRAINT a2c13_leads_stage_pipeline_fk FOREIGN KEY (stage_id,pipeline_id) REFERENCES public.pipeline_stages(id,pipeline_id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.forms ADD CONSTRAINT a2c13_forms_stage_pipeline_fk FOREIGN KEY (initial_stage_id,pipeline_id) REFERENCES public.pipeline_stages(id,pipeline_id) ON UPDATE RESTRICT ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.leads VALIDATE CONSTRAINT a2c13_leads_pipeline_tenant_fk;
ALTER TABLE public.forms VALIDATE CONSTRAINT a2c13_forms_pipeline_tenant_fk;
ALTER TABLE public.tasks VALIDATE CONSTRAINT a2c13_tasks_lead_tenant_fk;
ALTER TABLE public.leads VALIDATE CONSTRAINT a2c13_leads_stage_pipeline_fk;
ALTER TABLE public.forms VALIDATE CONSTRAINT a2c13_forms_stage_pipeline_fk;
COMMIT;
