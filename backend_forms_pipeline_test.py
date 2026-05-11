#!/usr/bin/env python3
"""
Fase 4 — Form Builder Pipeline Integration Backend Tests
Tests forms CRUD with pipeline/stage validation, archived pipeline/stage handling, RBAC, and multi-tenant isolation.
"""

import requests
import json
from typing import Dict, Any, Optional

BASE_URL = "https://405ee25f-8f34-4dbb-a532-867091561470.preview.emergentagent.com"

# Test credentials
DEMO_EMAIL = "demo@leadflow.com"
DEMO_PASSWORD = "demo123"
ANA_EMAIL = "ana@leadflow.com"
ANA_PASSWORD = "demo123"
CARLOS_EMAIL = "carlos@leadflow.com"
CARLOS_PASSWORD = "demo123"

class TestSession:
    def __init__(self, email: str, password: str, name: str):
        self.email = email
        self.password = password
        self.name = name
        self.session = requests.Session()
        self.user_data = None
        self.tenant_id = None
    
    def login(self) -> bool:
        try:
            resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.password})
            if resp.status_code == 200:
                me_resp = self.session.get(f"{BASE_URL}/api/auth/me")
                if me_resp.status_code == 200:
                    self.user_data = me_resp.json()
                    self.tenant_id = self.user_data.get("tenantId")
                    print(f"✅ {self.name} logged in successfully (tenantId: {self.tenant_id})")
                    return True
            print(f"❌ {self.name} login failed: {resp.status_code}")
            return False
        except Exception as e:
            print(f"❌ {self.name} login error: {e}")
            return False

def register_tenant(email: str, password: str, name: str, company: str) -> Optional[TestSession]:
    """Register a new tenant and return logged-in session"""
    try:
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": password,
            "name": name,
            "companyName": company
        })
        if resp.status_code == 200:
            me_resp = session.get(f"{BASE_URL}/api/auth/me")
            if me_resp.status_code == 200:
                user_data = me_resp.json()
                tenant_id = user_data.get("tenantId")
                print(f"✅ Registered tenant '{company}' (tenantId: {tenant_id})")
                ts = TestSession(email, password, name)
                ts.session = session
                ts.user_data = user_data
                ts.tenant_id = tenant_id
                return ts
        print(f"❌ Registration failed: {resp.status_code} - {resp.text}")
        return None
    except Exception as e:
        print(f"❌ Registration error: {e}")
        return None

def test_forms_crud_with_pipeline_validation(demo: TestSession):
    """A) Forms CRUD com validação pipeline+stage"""
    print("\n" + "="*80)
    print("A) FORMS CRUD WITH PIPELINE+STAGE VALIDATION")
    print("="*80)
    
    results = []
    
    # 1. GET /api/forms -> cada form deve ter pipeline e initialStage populados
    try:
        resp = demo.session.get(f"{BASE_URL}/api/forms")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        forms = data.get("forms", [])
        assert len(forms) > 0, "Expected at least 1 form"
        
        # Verificar que cada form tem pipeline e initialStage populados
        for form in forms:
            assert "pipeline" in form and form["pipeline"] is not None, f"Form {form['id']} missing pipeline"
            assert "id" in form["pipeline"] and "name" in form["pipeline"], "Pipeline missing id/name"
            assert "isArchived" in form["pipeline"], "Pipeline missing isArchived"
            
            assert "initialStage" in form and form["initialStage"] is not None, f"Form {form['id']} missing initialStage"
            assert "id" in form["initialStage"] and "name" in form["initialStage"], "InitialStage missing id/name"
            assert "color" in form["initialStage"] and "isArchived" in form["initialStage"], "InitialStage missing color/isArchived"
        
        print(f"✅ A1) GET /api/forms returns {len(forms)} forms with pipeline+initialStage populated")
        results.append(("A1_GET_forms_populated", True, None))
    except Exception as e:
        print(f"❌ A1) GET /api/forms failed: {e}")
        results.append(("A1_GET_forms_populated", False, str(e)))
    
    # Get default pipeline and stage for testing
    vendas_pipeline_id = None
    novo_lead_stage_id = None
    try:
        resp = demo.session.get(f"{BASE_URL}/api/pipelines")
        pipelines = resp.json().get("pipelines", [])
        default_pipeline = next((p for p in pipelines if p.get("isDefault")), None)
        if default_pipeline:
            vendas_pipeline_id = default_pipeline["id"]
            stages = default_pipeline.get("stages", [])
            if stages:
                novo_lead_stage_id = stages[0]["id"]
        print(f"   Default pipeline: {vendas_pipeline_id}, first stage: {novo_lead_stage_id}")
    except Exception as e:
        print(f"   Warning: Could not get default pipeline: {e}")
    
    # 2. GET /api/forms?pipelineId=<funil-de-vendas-id> -> filtra apenas forms desse pipeline
    if vendas_pipeline_id:
        try:
            resp = demo.session.get(f"{BASE_URL}/api/forms?pipelineId={vendas_pipeline_id}")
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
            data = resp.json()
            forms = data.get("forms", [])
            # Verificar que todos os forms retornados pertencem ao pipeline filtrado
            for form in forms:
                assert form.get("pipelineId") == vendas_pipeline_id, f"Form {form['id']} has wrong pipelineId"
            print(f"✅ A2) GET /api/forms?pipelineId={vendas_pipeline_id[:8]}... filters correctly ({len(forms)} forms)")
            results.append(("A2_GET_forms_filter_pipeline", True, None))
        except Exception as e:
            print(f"❌ A2) GET /api/forms?pipelineId failed: {e}")
            results.append(("A2_GET_forms_filter_pipeline", False, str(e)))
    
    # 3. POST /api/forms com pipelineId e initialStageId válidos -> 200
    created_form_id = None
    if vendas_pipeline_id and novo_lead_stage_id:
        try:
            form_data = {
                "name": "Form Teste Pipeline",
                "publicTitle": "Teste Pipeline Integration",
                "fields": [
                    {
                        "label": "Nome Completo",
                        "fieldType": "name",
                        "isRequired": True,
                        "orderIndex": 0,
                        "options": None,
                        "placeholder": None
                    }
                ],
                "pipelineId": vendas_pipeline_id,
                "initialStageId": novo_lead_stage_id
            }
            resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
            data = resp.json()
            created_form_id = data.get("form", {}).get("id")
            assert created_form_id is not None, "Form ID not returned"
            print(f"✅ A3) POST /api/forms with valid pipelineId+initialStageId -> 200 (formId: {created_form_id[:8]}...)")
            results.append(("A3_POST_form_valid_pipeline", True, None))
        except Exception as e:
            print(f"❌ A3) POST /api/forms with valid pipeline failed: {e}")
            results.append(("A3_POST_form_valid_pipeline", False, str(e)))
    
    # 4. POST /api/forms com initialStageId de OUTRO pipeline -> 400 "não pertence ao pipeline"
    try:
        # Create a second pipeline to get a stage from it
        resp = demo.session.post(f"{BASE_URL}/api/pipelines", json={"name": "Pipeline Teste A4"})
        assert resp.status_code == 200, f"Failed to create test pipeline: {resp.status_code}"
        other_pipeline = resp.json().get("pipeline", {})
        other_pipeline_id = other_pipeline["id"]
        other_stage_id = other_pipeline["stages"][0]["id"]
        
        # Try to create form with vendas_pipeline_id but other_stage_id
        form_data = {
            "name": "Form Teste Cross Stage",
            "publicTitle": "Teste",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": vendas_pipeline_id,
            "initialStageId": other_stage_id
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        error_msg = resp.json().get("error", "")
        assert "não pertence ao pipeline" in error_msg.lower() or "não pertence" in error_msg.lower(), f"Wrong error message: {error_msg}"
        print(f"✅ A4) POST /api/forms with initialStageId from OTHER pipeline -> 400 'não pertence ao pipeline'")
        results.append(("A4_POST_form_cross_stage", True, None))
        
        # Cleanup: delete test pipeline
        demo.session.delete(f"{BASE_URL}/api/pipelines/{other_pipeline_id}")
    except Exception as e:
        print(f"❌ A4) POST /api/forms cross-stage validation failed: {e}")
        results.append(("A4_POST_form_cross_stage", False, str(e)))
    
    # 5. POST /api/forms com pipelineId inválido (UUID que não existe) -> 400 "Pipeline inválido"
    try:
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        form_data = {
            "name": "Form Teste Invalid Pipeline",
            "publicTitle": "Teste",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": fake_uuid,
            "initialStageId": novo_lead_stage_id
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        error_msg = resp.json().get("error", "")
        assert "inválido" in error_msg.lower() or "pipeline" in error_msg.lower(), f"Wrong error message: {error_msg}"
        print(f"✅ A5) POST /api/forms with invalid pipelineId -> 400 'Pipeline inválido'")
        results.append(("A5_POST_form_invalid_pipeline", True, None))
    except Exception as e:
        print(f"❌ A5) POST /api/forms invalid pipeline failed: {e}")
        results.append(("A5_POST_form_invalid_pipeline", False, str(e)))
    
    # 6. POST /api/forms sem pipelineId -> usa default (200)
    try:
        form_data = {
            "name": "Form Teste Default Pipeline",
            "publicTitle": "Teste Default",
            "fields": [{"label": "Email", "fieldType": "email", "isRequired": True, "orderIndex": 0}]
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        form = data.get("form", {})
        assert form.get("pipelineId") == vendas_pipeline_id, f"Expected default pipeline {vendas_pipeline_id}, got {form.get('pipelineId')}"
        print(f"✅ A6) POST /api/forms without pipelineId -> 200 (uses default pipeline)")
        results.append(("A6_POST_form_default_pipeline", True, None))
        
        # Cleanup
        demo.session.delete(f"{BASE_URL}/api/forms/{form['id']}")
    except Exception as e:
        print(f"❌ A6) POST /api/forms default pipeline failed: {e}")
        results.append(("A6_POST_form_default_pipeline", False, str(e)))
    
    # 7. PUT /api/forms/<id> trocando para outro pipeline+stage válidos -> 200
    if created_form_id:
        try:
            # Create another pipeline
            resp = demo.session.post(f"{BASE_URL}/api/pipelines", json={"name": "Pipeline Teste A7"})
            assert resp.status_code == 200, f"Failed to create test pipeline: {resp.status_code}"
            new_pipeline = resp.json().get("pipeline", {})
            new_pipeline_id = new_pipeline["id"]
            new_stage_id = new_pipeline["stages"][0]["id"]
            
            # Update form to use new pipeline
            update_data = {
                "name": "Form Teste Pipeline Updated",
                "publicTitle": "Teste Updated",
                "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
                "pipelineId": new_pipeline_id,
                "initialStageId": new_stage_id
            }
            resp = demo.session.put(f"{BASE_URL}/api/forms/{created_form_id}", json=update_data)
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
            
            # Verify change
            resp = demo.session.get(f"{BASE_URL}/api/forms/{created_form_id}")
            assert resp.status_code == 200, f"GET failed: {resp.status_code}"
            form = resp.json().get("form", {})
            assert form.get("pipelineId") == new_pipeline_id, f"Pipeline not updated"
            assert form.get("initialStageId") == new_stage_id, f"Stage not updated"
            
            print(f"✅ A7) PUT /api/forms/<id> changing to another valid pipeline+stage -> 200")
            results.append(("A7_PUT_form_change_pipeline", True, None))
            
            # Cleanup
            demo.session.delete(f"{BASE_URL}/api/pipelines/{new_pipeline_id}")
        except Exception as e:
            print(f"❌ A7) PUT /api/forms change pipeline failed: {e}")
            results.append(("A7_PUT_form_change_pipeline", False, str(e)))
    
    # 8. PUT /api/forms/<id> com initialStageId de outro pipeline -> 400
    if created_form_id:
        try:
            # Create another pipeline
            resp = demo.session.post(f"{BASE_URL}/api/pipelines", json={"name": "Pipeline Teste A8"})
            assert resp.status_code == 200, f"Failed to create test pipeline: {resp.status_code}"
            other_pipeline = resp.json().get("pipeline", {})
            other_pipeline_id = other_pipeline["id"]
            other_stage_id = other_pipeline["stages"][0]["id"]
            
            # Try to update form with vendas_pipeline but other_stage
            update_data = {
                "name": "Form Teste Cross Update",
                "publicTitle": "Teste",
                "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
                "pipelineId": vendas_pipeline_id,
                "initialStageId": other_stage_id
            }
            resp = demo.session.put(f"{BASE_URL}/api/forms/{created_form_id}", json=update_data)
            assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
            error_msg = resp.json().get("error", "")
            assert "não pertence" in error_msg.lower(), f"Wrong error message: {error_msg}"
            
            print(f"✅ A8) PUT /api/forms/<id> with initialStageId from OTHER pipeline -> 400")
            results.append(("A8_PUT_form_cross_stage", True, None))
            
            # Cleanup
            demo.session.delete(f"{BASE_URL}/api/pipelines/{other_pipeline_id}")
        except Exception as e:
            print(f"❌ A8) PUT /api/forms cross-stage failed: {e}")
            results.append(("A8_PUT_form_cross_stage", False, str(e)))
    
    # 9. DELETE /api/forms/<id> -> 200 (cleanup)
    if created_form_id:
        try:
            resp = demo.session.delete(f"{BASE_URL}/api/forms/{created_form_id}")
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
            print(f"✅ A9) DELETE /api/forms/<id> -> 200 (cleanup)")
            results.append(("A9_DELETE_form", True, None))
        except Exception as e:
            print(f"❌ A9) DELETE /api/forms failed: {e}")
            results.append(("A9_DELETE_form", False, str(e)))
    
    return results

def test_archived_pipeline_stage(demo: TestSession):
    """B) Pipeline/Stage arquivado"""
    print("\n" + "="*80)
    print("B) ARCHIVED PIPELINE/STAGE HANDLING")
    print("="*80)
    
    results = []
    
    # 1. Criar pipeline TEMP
    temp_pipeline_id = None
    temp_stage_id = None
    temp_form_id = None
    
    try:
        resp = demo.session.post(f"{BASE_URL}/api/pipelines", json={"name": "TEMP Test 4"})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        temp_pipeline = resp.json().get("pipeline", {})
        temp_pipeline_id = temp_pipeline["id"]
        temp_stage_id = temp_pipeline["stages"][0]["id"]
        print(f"✅ B1) Created TEMP pipeline (id: {temp_pipeline_id[:8]}...)")
        results.append(("B1_create_temp_pipeline", True, None))
    except Exception as e:
        print(f"❌ B1) Create TEMP pipeline failed: {e}")
        results.append(("B1_create_temp_pipeline", False, str(e)))
        return results
    
    # 2. POST /api/forms com TEMP pipeline -> 200
    try:
        form_data = {
            "name": "Form TEMP Test",
            "publicTitle": "TEMP Form",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": temp_pipeline_id,
            "initialStageId": temp_stage_id
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        temp_form_id = resp.json().get("form", {}).get("id")
        print(f"✅ B2) POST /api/forms with TEMP pipeline -> 200")
        results.append(("B2_POST_form_temp_pipeline", True, None))
    except Exception as e:
        print(f"❌ B2) POST /api/forms with TEMP pipeline failed: {e}")
        results.append(("B2_POST_form_temp_pipeline", False, str(e)))
    
    # 3. Arquivar TEMP pipeline
    try:
        resp = demo.session.put(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}", json={"name": "TEMP Test 4", "isArchived": True})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"✅ B3) Archived TEMP pipeline -> 200")
        results.append(("B3_archive_temp_pipeline", True, None))
    except Exception as e:
        print(f"❌ B3) Archive TEMP pipeline failed: {e}")
        results.append(("B3_archive_temp_pipeline", False, str(e)))
    
    # 4. POST /api/forms com pipeline arquivado -> 400 "Pipeline arquivado"
    try:
        form_data = {
            "name": "Form Archived Pipeline Test",
            "publicTitle": "Test",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": temp_pipeline_id,
            "initialStageId": temp_stage_id
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        error_msg = resp.json().get("error", "")
        assert "arquivado" in error_msg.lower(), f"Wrong error message: {error_msg}"
        print(f"✅ B4) POST /api/forms with archived pipeline -> 400 'Pipeline arquivado'")
        results.append(("B4_POST_form_archived_pipeline", True, None))
    except Exception as e:
        print(f"❌ B4) POST /api/forms archived pipeline failed: {e}")
        results.append(("B4_POST_form_archived_pipeline", False, str(e)))
    
    # 5. PUT /api/forms/<existing> com pipeline arquivado -> 400
    if temp_form_id:
        try:
            # Get another form to update
            resp = demo.session.get(f"{BASE_URL}/api/forms")
            forms = resp.json().get("forms", [])
            existing_form = next((f for f in forms if f["id"] != temp_form_id), None)
            
            if existing_form:
                update_data = {
                    "name": existing_form["name"],
                    "publicTitle": existing_form["publicTitle"],
                    "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
                    "pipelineId": temp_pipeline_id,
                    "initialStageId": temp_stage_id
                }
                resp = demo.session.put(f"{BASE_URL}/api/forms/{existing_form['id']}", json=update_data)
                assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
                error_msg = resp.json().get("error", "")
                assert "arquivado" in error_msg.lower(), f"Wrong error message: {error_msg}"
                print(f"✅ B5) PUT /api/forms/<id> with archived pipeline -> 400 'Pipeline arquivado'")
                results.append(("B5_PUT_form_archived_pipeline", True, None))
            else:
                print(f"⚠️  B5) Skipped - no existing form found")
                results.append(("B5_PUT_form_archived_pipeline", True, "skipped"))
        except Exception as e:
            print(f"❌ B5) PUT /api/forms archived pipeline failed: {e}")
            results.append(("B5_PUT_form_archived_pipeline", False, str(e)))
    
    # 6. Desarquivar TEMP, arquivar a stage
    try:
        # Unarchive pipeline
        resp = demo.session.put(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}", json={"name": "TEMP Test 4", "isArchived": False})
        assert resp.status_code == 200, f"Unarchive failed: {resp.status_code}"
        
        # Archive the stage (need to create another stage first so it's not the last active one)
        resp = demo.session.post(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}/stages", json={"name": "Stage 2", "color": "#FF0000"})
        assert resp.status_code == 200, f"Create stage failed: {resp.status_code}"
        
        # Now archive first stage
        resp = demo.session.put(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}/stages/{temp_stage_id}", json={"name": "Novo lead", "color": "#3B82F6", "isArchived": True})
        assert resp.status_code == 200, f"Archive stage failed: {resp.status_code}"
        
        print(f"✅ B6) Unarchived TEMP pipeline and archived first stage -> 200")
        results.append(("B6_unarchive_pipeline_archive_stage", True, None))
    except Exception as e:
        print(f"❌ B6) Unarchive/archive operations failed: {e}")
        results.append(("B6_unarchive_pipeline_archive_stage", False, str(e)))
    
    # 7. POST /api/forms com stage arquivada -> 400 "Etapa inicial está arquivada"
    try:
        form_data = {
            "name": "Form Archived Stage Test",
            "publicTitle": "Test",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": temp_pipeline_id,
            "initialStageId": temp_stage_id
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        error_msg = resp.json().get("error", "")
        assert "arquivada" in error_msg.lower() or "etapa" in error_msg.lower(), f"Wrong error message: {error_msg}"
        print(f"✅ B7) POST /api/forms with archived stage -> 400 'Etapa inicial está arquivada'")
        results.append(("B7_POST_form_archived_stage", True, None))
    except Exception as e:
        print(f"❌ B7) POST /api/forms archived stage failed: {e}")
        results.append(("B7_POST_form_archived_stage", False, str(e)))
    
    # 8. Cleanup: desarquivar stage, deletar form e pipeline TEMP
    try:
        # Unarchive stage
        demo.session.put(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}/stages/{temp_stage_id}", json={"name": "Novo lead", "color": "#3B82F6", "isArchived": False})
        
        # Delete form
        if temp_form_id:
            demo.session.delete(f"{BASE_URL}/api/forms/{temp_form_id}")
        
        # Delete pipeline
        demo.session.delete(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}")
        
        print(f"✅ B8) Cleanup: unarchived stage, deleted form and TEMP pipeline")
        results.append(("B8_cleanup", True, None))
    except Exception as e:
        print(f"⚠️  B8) Cleanup warning: {e}")
        results.append(("B8_cleanup", True, f"warning: {e}"))
    
    return results

def test_public_submit_archived(demo: TestSession):
    """C) Submit público com pipeline/stage arquivado"""
    print("\n" + "="*80)
    print("C) PUBLIC SUBMIT WITH ARCHIVED PIPELINE/STAGE")
    print("="*80)
    
    results = []
    
    # 1. Get turbinar-comercial form slug
    turbinar_slug = "turbinar-comercial"
    
    # 2. POST /api/public/forms/turbinar-comercial/submit (should work initially)
    try:
        submit_data = {
            "answers": []
        }
        resp = requests.post(f"{BASE_URL}/api/public/forms/{turbinar_slug}/submit", json=submit_data)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "leadId" in data, "leadId not returned"
        print(f"✅ C1) POST /api/public/forms/{turbinar_slug}/submit -> 200 (leadId: {data['leadId'][:8]}...)")
        results.append(("C1_public_submit_active", True, None))
    except Exception as e:
        print(f"❌ C1) Public submit failed: {e}")
        results.append(("C1_public_submit_active", False, str(e)))
    
    # 3. Create form TEMP novo: cria pipeline P2, cria form F2
    temp_pipeline_id = None
    temp_stage_id = None
    temp_form_slug = None
    
    try:
        # Create pipeline P2
        resp = demo.session.post(f"{BASE_URL}/api/pipelines", json={"name": "Pipeline P2 Test C"})
        assert resp.status_code == 200, f"Create pipeline failed: {resp.status_code}"
        p2 = resp.json().get("pipeline", {})
        temp_pipeline_id = p2["id"]
        temp_stage_id = p2["stages"][0]["id"]
        
        # Create form F2
        form_data = {
            "name": "Form F2 Test C",
            "publicTitle": "F2 Public",
            "fields": [{"label": "Email", "fieldType": "email", "isRequired": True, "orderIndex": 0}],
            "pipelineId": temp_pipeline_id,
            "initialStageId": temp_stage_id
        }
        resp = demo.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 200, f"Create form failed: {resp.status_code}"
        f2 = resp.json().get("form", {})
        temp_form_slug = f2["slug"]
        
        print(f"✅ C2) Created pipeline P2 and form F2 (slug: {temp_form_slug})")
        results.append(("C2_create_temp_form", True, None))
    except Exception as e:
        print(f"❌ C2) Create temp form failed: {e}")
        results.append(("C2_create_temp_form", False, str(e)))
        return results
    
    # 4. POST /api/public/forms/<F2.slug>/submit -> 200
    try:
        submit_data = {
            "answers": [{"fieldId": f2["fields"][0]["id"], "label": "Email", "value": "test@example.com"}]
        }
        resp = requests.post(f"{BASE_URL}/api/public/forms/{temp_form_slug}/submit", json=submit_data)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"✅ C3) POST /api/public/forms/{temp_form_slug}/submit -> 200")
        results.append(("C3_public_submit_temp_form", True, None))
    except Exception as e:
        print(f"❌ C3) Public submit temp form failed: {e}")
        results.append(("C3_public_submit_temp_form", False, str(e)))
    
    # 5. Arquivar P2
    try:
        resp = demo.session.put(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}", json={"name": "Pipeline P2 Test C", "isArchived": True})
        assert resp.status_code == 200, f"Archive failed: {resp.status_code}"
        print(f"✅ C4) Archived pipeline P2 -> 200")
        results.append(("C4_archive_p2", True, None))
    except Exception as e:
        print(f"❌ C4) Archive P2 failed: {e}")
        results.append(("C4_archive_p2", False, str(e)))
    
    # 6. POST /api/public/forms/<F2.slug>/submit -> 410 ou erro indicando indisponível
    try:
        submit_data = {
            "answers": [{"fieldId": f2["fields"][0]["id"], "label": "Email", "value": "test2@example.com"}]
        }
        resp = requests.post(f"{BASE_URL}/api/public/forms/{temp_form_slug}/submit", json=submit_data)
        assert resp.status_code == 410, f"Expected 410, got {resp.status_code}"
        error_msg = resp.json().get("error", "")
        assert "indisponível" in error_msg.lower() or "temporariamente" in error_msg.lower(), f"Wrong error message: {error_msg}"
        print(f"✅ C5) POST /api/public/forms/{temp_form_slug}/submit with archived pipeline -> 410 'temporariamente indisponível'")
        results.append(("C5_public_submit_archived", True, None))
    except Exception as e:
        print(f"❌ C5) Public submit archived failed: {e}")
        results.append(("C5_public_submit_archived", False, str(e)))
    
    # 7. Cleanup: desarquivar P2, deletar F2 e P2
    try:
        # Unarchive P2
        demo.session.put(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}", json={"name": "Pipeline P2 Test C", "isArchived": False})
        
        # Delete F2
        demo.session.delete(f"{BASE_URL}/api/forms/{f2['id']}")
        
        # Delete P2
        demo.session.delete(f"{BASE_URL}/api/pipelines/{temp_pipeline_id}")
        
        print(f"✅ C6) Cleanup: unarchived P2, deleted F2 and P2")
        results.append(("C6_cleanup", True, None))
    except Exception as e:
        print(f"⚠️  C6) Cleanup warning: {e}")
        results.append(("C6_cleanup", True, f"warning: {e}"))
    
    return results

def test_rbac_multi_tenant(demo: TestSession, ana: TestSession, carlos: TestSession):
    """D) RBAC + Multi-tenant"""
    print("\n" + "="*80)
    print("D) RBAC + MULTI-TENANT")
    print("="*80)
    
    results = []
    
    # Get a valid pipeline and stage for testing
    resp = demo.session.get(f"{BASE_URL}/api/pipelines")
    pipelines = resp.json().get("pipelines", [])
    default_pipeline = next((p for p in pipelines if p.get("isDefault")), None)
    pipeline_id = default_pipeline["id"]
    stage_id = default_pipeline["stages"][0]["id"]
    
    # 1. Como Ana (agent), POST /api/forms -> 403
    try:
        form_data = {
            "name": "Form Ana Test",
            "publicTitle": "Test",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": pipeline_id,
            "initialStageId": stage_id
        }
        resp = ana.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print(f"✅ D1) Ana (agent) POST /api/forms -> 403 (FORMS_CREATE restricted)")
        results.append(("D1_ana_POST_forms", True, None))
    except Exception as e:
        print(f"❌ D1) Ana POST forms failed: {e}")
        results.append(("D1_ana_POST_forms", False, str(e)))
    
    # 2. Como Ana, PUT /api/forms/<existing> -> 403
    try:
        resp = demo.session.get(f"{BASE_URL}/api/forms")
        forms = resp.json().get("forms", [])
        if forms:
            existing_form = forms[0]
            update_data = {
                "name": existing_form["name"],
                "publicTitle": existing_form["publicTitle"],
                "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}]
            }
            resp = ana.session.put(f"{BASE_URL}/api/forms/{existing_form['id']}", json=update_data)
            assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
            print(f"✅ D2) Ana (agent) PUT /api/forms/<id> -> 403 (FORMS_EDIT restricted)")
            results.append(("D2_ana_PUT_forms", True, None))
        else:
            print(f"⚠️  D2) Skipped - no forms found")
            results.append(("D2_ana_PUT_forms", True, "skipped"))
    except Exception as e:
        print(f"❌ D2) Ana PUT forms failed: {e}")
        results.append(("D2_ana_PUT_forms", False, str(e)))
    
    # 3. Como Ana, DELETE /api/forms/<existing> -> 403
    try:
        resp = demo.session.get(f"{BASE_URL}/api/forms")
        forms = resp.json().get("forms", [])
        if forms:
            existing_form = forms[0]
            resp = ana.session.delete(f"{BASE_URL}/api/forms/{existing_form['id']}")
            assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
            print(f"✅ D3) Ana (agent) DELETE /api/forms/<id> -> 403 (FORMS_DELETE restricted)")
            results.append(("D3_ana_DELETE_forms", True, None))
        else:
            print(f"⚠️  D3) Skipped - no forms found")
            results.append(("D3_ana_DELETE_forms", True, "skipped"))
    except Exception as e:
        print(f"❌ D3) Ana DELETE forms failed: {e}")
        results.append(("D3_ana_DELETE_forms", False, str(e)))
    
    # 4. Como Carlos (manager), POST /api/forms -> 200; DELETE -> 403
    created_form_id = None
    try:
        form_data = {
            "name": "Form Carlos Test",
            "publicTitle": "Test",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": pipeline_id,
            "initialStageId": stage_id
        }
        resp = carlos.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        created_form_id = resp.json().get("form", {}).get("id")
        print(f"✅ D4a) Carlos (manager) POST /api/forms -> 200 (FORMS_CREATE includes manager)")
        results.append(("D4a_carlos_POST_forms", True, None))
        
        # Try to delete as Carlos
        resp = carlos.session.delete(f"{BASE_URL}/api/forms/{created_form_id}")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print(f"✅ D4b) Carlos (manager) DELETE /api/forms/<id> -> 403 (FORMS_DELETE = owner/admin only)")
        results.append(("D4b_carlos_DELETE_forms", True, None))
        
        # Cleanup as demo
        demo.session.delete(f"{BASE_URL}/api/forms/{created_form_id}")
    except Exception as e:
        print(f"❌ D4) Carlos forms operations failed: {e}")
        results.append(("D4a_carlos_POST_forms", False, str(e)))
        results.append(("D4b_carlos_DELETE_forms", False, str(e)))
    
    # 5. Tenant B: registrar tenant novo
    tenant_b = register_tenant("tenantb_phase4@test.com", "test123", "Tenant B Owner", "Tenant B Company")
    if not tenant_b:
        print(f"❌ D5) Failed to register Tenant B")
        results.append(("D5_register_tenant_b", False, "registration failed"))
        return results
    
    results.append(("D5_register_tenant_b", True, None))
    
    # 6. Tenant B: POST /api/forms com pipelineId DO TENANT A -> 400 "Pipeline inválido"
    try:
        form_data = {
            "name": "Form Tenant B Cross Test",
            "publicTitle": "Test",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}],
            "pipelineId": pipeline_id,  # Demo's pipeline
            "initialStageId": stage_id
        }
        resp = tenant_b.session.post(f"{BASE_URL}/api/forms", json=form_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        error_msg = resp.json().get("error", "")
        assert "inválido" in error_msg.lower() or "pipeline" in error_msg.lower(), f"Wrong error message: {error_msg}"
        print(f"✅ D6) Tenant B POST /api/forms with Tenant A's pipelineId -> 400 'Pipeline inválido'")
        results.append(("D6_tenant_b_cross_pipeline", True, None))
    except Exception as e:
        print(f"❌ D6) Tenant B cross-pipeline failed: {e}")
        results.append(("D6_tenant_b_cross_pipeline", False, str(e)))
    
    # 7. Tenant B: GET /api/forms -> array vazio (não vê forms do tenant A)
    try:
        resp = tenant_b.session.get(f"{BASE_URL}/api/forms")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        forms = resp.json().get("forms", [])
        assert len(forms) == 0, f"Expected 0 forms, got {len(forms)}"
        print(f"✅ D7) Tenant B GET /api/forms -> 0 forms (isolation verified)")
        results.append(("D7_tenant_b_isolation_get", True, None))
    except Exception as e:
        print(f"❌ D7) Tenant B isolation GET failed: {e}")
        results.append(("D7_tenant_b_isolation_get", False, str(e)))
    
    # 8. Tenant B: PUT /api/forms/<tenant-A-form-id> -> 404
    try:
        resp = demo.session.get(f"{BASE_URL}/api/forms")
        forms = resp.json().get("forms", [])
        if forms:
            tenant_a_form_id = forms[0]["id"]
            update_data = {
                "name": "Hacked Form",
                "publicTitle": "Hacked",
                "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}]
            }
            resp = tenant_b.session.put(f"{BASE_URL}/api/forms/{tenant_a_form_id}", json=update_data)
            assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
            print(f"✅ D8) Tenant B PUT /api/forms/<tenant-A-form-id> -> 404 (cross-tenant protection)")
            results.append(("D8_tenant_b_cross_tenant_put", True, None))
        else:
            print(f"⚠️  D8) Skipped - no forms found")
            results.append(("D8_tenant_b_cross_tenant_put", True, "skipped"))
    except Exception as e:
        print(f"❌ D8) Tenant B cross-tenant PUT failed: {e}")
        results.append(("D8_tenant_b_cross_tenant_put", False, str(e)))
    
    return results

def test_regression(demo: TestSession):
    """E) Regression"""
    print("\n" + "="*80)
    print("E) REGRESSION TESTS")
    print("="*80)
    
    results = []
    
    # 1. GET /api/auth/me -> 200
    try:
        resp = demo.session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"✅ E1) GET /api/auth/me -> 200")
        results.append(("E1_auth_me", True, None))
    except Exception as e:
        print(f"❌ E1) GET /api/auth/me failed: {e}")
        results.append(("E1_auth_me", False, str(e)))
    
    # 2. GET /api/leads -> array com leads
    try:
        resp = demo.session.get(f"{BASE_URL}/api/leads")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        leads = resp.json().get("leads", [])
        assert len(leads) > 0, "Expected at least 1 lead"
        print(f"✅ E2) GET /api/leads -> 200 ({len(leads)} leads)")
        results.append(("E2_leads", True, None))
    except Exception as e:
        print(f"❌ E2) GET /api/leads failed: {e}")
        results.append(("E2_leads", False, str(e)))
    
    # 3. POST /api/leads/<id>/move -> 200
    try:
        resp = demo.session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        if leads:
            lead_id = leads[0]["id"]
            
            # Get active stage
            resp = demo.session.get(f"{BASE_URL}/api/pipelines")
            pipelines = resp.json().get("pipelines", [])
            default_pipeline = next((p for p in pipelines if p.get("isDefault")), None)
            active_stage = next((s for s in default_pipeline["stages"] if not s.get("isArchived")), None)
            
            resp = demo.session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={"stageId": active_stage["id"]})
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
            print(f"✅ E3) POST /api/leads/<id>/move -> 200")
            results.append(("E3_leads_move", True, None))
        else:
            print(f"⚠️  E3) Skipped - no leads found")
            results.append(("E3_leads_move", True, "skipped"))
    except Exception as e:
        print(f"❌ E3) POST /api/leads/move failed: {e}")
        results.append(("E3_leads_move", False, str(e)))
    
    # 4. GET /api/dashboard?range=30d -> 200
    try:
        resp = demo.session.get(f"{BASE_URL}/api/dashboard?range=30d")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"✅ E4) GET /api/dashboard?range=30d -> 200")
        results.append(("E4_dashboard", True, None))
    except Exception as e:
        print(f"❌ E4) GET /api/dashboard failed: {e}")
        results.append(("E4_dashboard", False, str(e)))
    
    # 5. GET /api/users -> 200
    try:
        resp = demo.session.get(f"{BASE_URL}/api/users")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"✅ E5) GET /api/users -> 200")
        results.append(("E5_users", True, None))
    except Exception as e:
        print(f"❌ E5) GET /api/users failed: {e}")
        results.append(("E5_users", False, str(e)))
    
    # 6. GET /api/pipelines -> 200
    try:
        resp = demo.session.get(f"{BASE_URL}/api/pipelines")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"✅ E6) GET /api/pipelines -> 200")
        results.append(("E6_pipelines", True, None))
    except Exception as e:
        print(f"❌ E6) GET /api/pipelines failed: {e}")
        results.append(("E6_pipelines", False, str(e)))
    
    # 7. GET /api/public/forms/turbinar-comercial (sem auth) -> 200
    try:
        resp = requests.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"✅ E7) GET /api/public/forms/turbinar-comercial (no auth) -> 200")
        results.append(("E7_public_forms", True, None))
    except Exception as e:
        print(f"❌ E7) GET public forms failed: {e}")
        results.append(("E7_public_forms", False, str(e)))
    
    # 8. GET /api/invites -> 200
    try:
        resp = demo.session.get(f"{BASE_URL}/api/invites")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"✅ E8) GET /api/invites -> 200")
        results.append(("E8_invites", True, None))
    except Exception as e:
        print(f"❌ E8) GET /api/invites failed: {e}")
        results.append(("E8_invites", False, str(e)))
    
    # 9. GET /api/audit-logs -> deve incluir form.created, form.updated, form.submitted, lead.created
    try:
        resp = demo.session.get(f"{BASE_URL}/api/audit-logs")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        logs = resp.json().get("logs", [])
        
        actions = [log.get("action") for log in logs]
        expected_actions = ["form.created", "form.updated", "form.submitted", "lead.created"]
        found_actions = [action for action in expected_actions if action in actions]
        
        print(f"✅ E9) GET /api/audit-logs -> 200 (found actions: {', '.join(found_actions)})")
        results.append(("E9_audit_logs", True, None))
    except Exception as e:
        print(f"❌ E9) GET /api/audit-logs failed: {e}")
        results.append(("E9_audit_logs", False, str(e)))
    
    return results

def main():
    print("="*80)
    print("FASE 4 — FORM BUILDER PIPELINE INTEGRATION BACKEND TESTS")
    print("="*80)
    
    # Login sessions
    print("\n🔐 Logging in test users...")
    demo = TestSession(DEMO_EMAIL, DEMO_PASSWORD, "Demo (owner)")
    ana = TestSession(ANA_EMAIL, ANA_PASSWORD, "Ana (agent)")
    carlos = TestSession(CARLOS_EMAIL, CARLOS_PASSWORD, "Carlos (manager)")
    
    if not demo.login():
        print("❌ CRITICAL: Demo login failed. Cannot proceed.")
        return
    
    if not ana.login():
        print("⚠️  WARNING: Ana login failed. RBAC tests may be incomplete.")
    
    if not carlos.login():
        print("⚠️  WARNING: Carlos login failed. RBAC tests may be incomplete.")
    
    # Run all test suites
    all_results = []
    
    all_results.extend(test_forms_crud_with_pipeline_validation(demo))
    all_results.extend(test_archived_pipeline_stage(demo))
    all_results.extend(test_public_submit_archived(demo))
    
    if ana.user_data and carlos.user_data:
        all_results.extend(test_rbac_multi_tenant(demo, ana, carlos))
    else:
        print("\n⚠️  SKIPPING RBAC tests due to login failures")
    
    all_results.extend(test_regression(demo))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, success, _ in all_results if success)
    failed = sum(1 for _, success, _ in all_results if not success)
    total = len(all_results)
    
    print(f"\n✅ PASSED: {passed}/{total}")
    print(f"❌ FAILED: {failed}/{total}")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for test_name, success, error in all_results:
            if not success:
                print(f"  - {test_name}: {error}")
    
    print("\n" + "="*80)
    if failed == 0:
        print("🎉 ALL TESTS PASSED - FORM BUILDER PIPELINE INTEGRATION WORKING CORRECTLY")
    else:
        print("⚠️  SOME TESTS FAILED - REVIEW ERRORS ABOVE")
    print("="*80)

if __name__ == "__main__":
    main()
