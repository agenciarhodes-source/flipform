-- Synthetic rows in the disposable CI database only.
INSERT INTO "platform_catalog_apps" ("id","label","description","category","sort_order","plan_slugs","updated_at") VALUES ('custom-ci','Synthetic','Test','CRM',10,ARRAY['premium-pro'],CURRENT_TIMESTAMP);
INSERT INTO "platform_catalog_audits" ("id","app_id","actor_id","revision","after") VALUES ('catalog-test-audit','custom-ci','synthetic-actor',1,'{"label":"Synthetic"}');
DO $test$
BEGIN
  BEGIN
    INSERT INTO "platform_catalog_apps" ("id","label","description","category","sort_order","plan_slugs","updated_at") VALUES ('custom-invalid','Synthetic','','CRM',10,ARRAY['unknown'],CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Invalid plan accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "platform_catalog_apps" SET "icon_png"='AAAA' WHERE "id"='custom-ci';
    RAISE EXCEPTION 'Unpaired icon accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO "platform_catalog_audits" ("id","app_id","actor_id","revision","after") VALUES ('catalog-test-duplicate','custom-ci','synthetic-actor',1,'{}');
    RAISE EXCEPTION 'Duplicate revision accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    DELETE FROM "platform_catalog_apps" WHERE "id"='custom-ci';
    RAISE EXCEPTION 'Audit parent deletion accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO "platform_catalog_audits" ("id","app_id","actor_id","revision","after") VALUES ('catalog-test-orphan','missing','synthetic-actor',1,'{}');
    RAISE EXCEPTION 'Orphan audit accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END
$test$;
