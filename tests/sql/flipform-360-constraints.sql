-- All inserts and expected failures run only in the disposable migration rehearsal.
INSERT INTO universal_connections (id,tenant_id,provider_id,auth_method,updated_at)
VALUES ('fixture-conn','fixture-tenant-a','synthetic_finance','api_key',CURRENT_TIMESTAMP);
INSERT INTO universal_connection_credentials (tenant_id,connection_id,key_id,ciphertext,updated_at)
VALUES ('fixture-tenant-a','fixture-conn','synthetic','synthetic',CURRENT_TIMESTAMP);
INSERT INTO universal_sync_runs (id,tenant_id,connection_id,request_key,fixture_version,updated_at)
VALUES ('fixture-run','fixture-tenant-a','fixture-conn','fixture-key','finance-v1',CURRENT_TIMESTAMP);
INSERT INTO universal_data_records (id,tenant_id,connection_id,run_id,provider_id,kind,source_id,source_updated_at,amount_minor,currency,status)
VALUES ('fixture-record','fixture-tenant-a','fixture-conn','fixture-run','synthetic_finance','receivable','fixture-a',CURRENT_TIMESTAMP,100,'BRL','open');
INSERT INTO flip_ads_campaign_drafts (id,tenant_id,provider,account_id,plan,digest,created_by,updated_at)
VALUES ('fixture-draft','fixture-tenant-a','meta_ads','fixture-account','{}',repeat('a',64),'fixture-owner',CURRENT_TIMESTAMP);
INSERT INTO flip_ads_draft_audits (id,tenant_id,draft_id,actor_id,action,revision,digest)
VALUES ('fixture-audit','fixture-tenant-a','fixture-draft','fixture-owner','created',1,repeat('a',64));
DO $checks$
BEGIN
  IF (SELECT enabled FROM universal_connections WHERE id='fixture-conn') IS DISTINCT FROM false THEN RAISE EXCEPTION 'connection enabled by default'; END IF;
  IF (SELECT state FROM flip_ads_campaign_drafts WHERE id='fixture-draft') IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'draft state invalid'; END IF;
  BEGIN
    INSERT INTO universal_connection_credentials (tenant_id,connection_id,key_id,ciphertext,updated_at)
    VALUES ('fixture-tenant-b','fixture-conn','synthetic','synthetic',CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'cross-tenant credential accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO universal_sync_runs (id,tenant_id,connection_id,request_key,fixture_version,updated_at)
    VALUES ('fixture-wrong-run','fixture-tenant-b','fixture-conn','fixture-key','finance-v1',CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'cross-tenant sync accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO universal_sync_runs (id,tenant_id,connection_id,request_key,fixture_version,updated_at)
    VALUES ('fixture-repeat','fixture-tenant-a','fixture-conn','fixture-key','finance-v1',CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'duplicate sync request accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE universal_sync_runs SET attempts=4 WHERE id='fixture-run';
    RAISE EXCEPTION 'unbounded retry accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE universal_data_records SET amount_minor=-1 WHERE id='fixture-record';
    RAISE EXCEPTION 'negative synthetic value accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE universal_data_records SET tenant_id='fixture-tenant-b' WHERE id='fixture-record';
    RAISE EXCEPTION 'cross-tenant data accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO flip_ads_draft_audits (id,tenant_id,draft_id,actor_id,action,revision,digest)
    VALUES ('fixture-wrong-audit','fixture-tenant-b','fixture-draft','fixture-owner','created',1,repeat('a',64));
    RAISE EXCEPTION 'cross-tenant draft audit accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE flip_ads_campaign_drafts SET state='approved' WHERE id='fixture-draft';
    RAISE EXCEPTION 'approval without actor/time accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    DELETE FROM flip_ads_campaign_drafts WHERE id='fixture-draft';
    RAISE EXCEPTION 'audit parent deletion accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    DELETE FROM universal_connections WHERE id='fixture-conn';
    RAISE EXCEPTION 'connection parent deletion accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF (SELECT count(*) FROM tenants) <> 2 THEN RAISE EXCEPTION 'predecessor changed'; END IF;
END
$checks$;
