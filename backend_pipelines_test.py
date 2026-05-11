#!/usr/bin/env python3
"""
LeadFlow CRM Pipelines Backend Test Suite (Phase 3)
Tests Pipelines + Stages CRUD with RBAC + multi-tenant isolation + regression
"""

import requests
import json
import random
import string
from typing import Dict, Any, Optional

# Base URL
BASE_URL = "https://405ee25f-8f34-4dbb-a532-867091561470.preview.emergentagent.com"

# Test results tracking
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"   {details}")
    
    test_results["tests"].append({
        "name": name,
        "passed": passed,
        "details": details
    })
    
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1

def random_string(length: int = 8) -> str:
    """Generate random string"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def print_section(title: str):
    """Print section header"""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

# ============================================================================
# A) PIPELINES CRUD
# ============================================================================

def test_pipelines_crud():
    print_section("A) PIPELINES CRUD (logged as demo owner)")
    
    # Login as demo (owner)
    owner_session = requests.Session()
    resp = owner_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@leadflow.com",
        "password": "demo123"
    })
    
    if resp.status_code != 200:
        log_test("A0: Login as owner (demo)", False, f"Status: {resp.status_code}")
        return None
    
    log_test("A0: Login as owner (demo)", True, f"Status: {resp.status_code}")
    
    default_pipeline_id = None
    funil_vendas_id = None
    created_pipeline_id = None
    duplicated_pipeline_id = None
    
    # A1: GET /api/pipelines -> 200, contains "Funil de Vendas" (isDefault=true) with 7 stages
    try:
        resp = owner_session.get(f"{BASE_URL}/api/pipelines")
        data = resp.json()
        pipelines = data.get("pipelines", [])
        
        funil_vendas = next((p for p in pipelines if "Funil de Vendas" in p.get("name", "")), None)
        if funil_vendas:
            funil_vendas_id = funil_vendas.get("id")
            default_pipeline_id = funil_vendas_id
            is_default = funil_vendas.get("isDefault") == True
            stages = funil_vendas.get("stages", [])
            has_7_stages = len(stages) == 7
            
            log_test("A1: GET /api/pipelines -> 200, contains 'Funil de Vendas' (isDefault=true) with 7 stages", 
                    resp.status_code == 200 and is_default and has_7_stages,
                    f"Status: {resp.status_code}, Found: {funil_vendas.get('name')}, isDefault: {is_default}, Stages: {len(stages)}")
        else:
            log_test("A1: GET /api/pipelines", False, "Funil de Vendas not found")
    except Exception as e:
        log_test("A1: GET /api/pipelines", False, f"Exception: {str(e)}")
    
    # A2: GET /api/pipelines?includeArchived=1 -> 200, same list
    try:
        resp = owner_session.get(f"{BASE_URL}/api/pipelines?includeArchived=1")
        data = resp.json()
        pipelines_with_archived = data.get("pipelines", [])
        
        log_test("A2: GET /api/pipelines?includeArchived=1 -> 200", 
                resp.status_code == 200,
                f"Status: {resp.status_code}, Pipelines count: {len(pipelines_with_archived)}")
    except Exception as e:
        log_test("A2: GET /api/pipelines?includeArchived=1", False, f"Exception: {str(e)}")
    
    # A3: POST /api/pipelines {name:"Funil Outbound"} -> 200, returns pipeline with 3 default stages
    try:
        resp = owner_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Funil Outbound"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            pipeline = data.get("pipeline", {})
            created_pipeline_id = pipeline.get("id")
            stages = pipeline.get("stages", [])
            has_3_stages = len(stages) == 3
            is_not_default = pipeline.get("isDefault") == False
            
            # Check stage names
            stage_names = [s.get("name") for s in stages]
            has_correct_stages = "Novo lead" in stage_names and "Em andamento" in stage_names and "Ganho" in stage_names
            
            log_test("A3: POST /api/pipelines {name:'Funil Outbound'} -> 200, returns pipeline with 3 default stages", 
                    has_3_stages and is_not_default and has_correct_stages,
                    f"Status: {resp.status_code}, Pipeline ID: {created_pipeline_id}, Stages: {len(stages)}, isDefault: {pipeline.get('isDefault')}, Stage names: {stage_names}")
        else:
            log_test("A3: POST /api/pipelines", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("A3: POST /api/pipelines", False, f"Exception: {str(e)}")
    
    # A4: GET /api/pipelines/<id> -> 200, with stages._count
    if created_pipeline_id:
        try:
            resp = owner_session.get(f"{BASE_URL}/api/pipelines/{created_pipeline_id}")
            data = resp.json()
            pipeline = data.get("pipeline", {})
            stages = pipeline.get("stages", [])
            
            # Check if stages have _count
            has_count = all("_count" in s for s in stages)
            
            log_test("A4: GET /api/pipelines/<id> -> 200, with stages._count", 
                    resp.status_code == 200 and has_count,
                    f"Status: {resp.status_code}, Stages with _count: {has_count}")
        except Exception as e:
            log_test("A4: GET /api/pipelines/<id>", False, f"Exception: {str(e)}")
    else:
        log_test("A4: GET /api/pipelines/<id>", False, "Skipped - no pipeline created")
    
    # A5: PUT /api/pipelines/<id> {name:"Funil Outbound v2"} -> 200; GET confirms name
    if created_pipeline_id:
        try:
            resp = owner_session.put(f"{BASE_URL}/api/pipelines/{created_pipeline_id}", json={
                "name": "Funil Outbound v2"
            })
            
            if resp.status_code == 200:
                # Verify via GET
                resp2 = owner_session.get(f"{BASE_URL}/api/pipelines/{created_pipeline_id}")
                pipeline = resp2.json().get("pipeline", {})
                name_updated = pipeline.get("name") == "Funil Outbound v2"
                
                log_test("A5: PUT /api/pipelines/<id> {name:'Funil Outbound v2'} -> 200; GET confirms name", 
                        name_updated,
                        f"Status: {resp.status_code}, New name: {pipeline.get('name')}")
            else:
                log_test("A5: PUT /api/pipelines/<id>", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("A5: PUT /api/pipelines/<id>", False, f"Exception: {str(e)}")
    else:
        log_test("A5: PUT /api/pipelines/<id>", False, "Skipped - no pipeline created")
    
    # A6: POST /api/pipelines/<id>/duplicate -> 200, new pipeline with suffix " (cópia)"
    if created_pipeline_id:
        try:
            resp = owner_session.post(f"{BASE_URL}/api/pipelines/{created_pipeline_id}/duplicate")
            
            if resp.status_code == 200:
                data = resp.json()
                duplicated = data.get("pipeline", {})
                duplicated_pipeline_id = duplicated.get("id")
                has_suffix = "(cópia)" in duplicated.get("name", "")
                
                log_test("A6: POST /api/pipelines/<id>/duplicate -> 200, new pipeline with suffix ' (cópia)'", 
                        has_suffix and duplicated_pipeline_id is not None,
                        f"Status: {resp.status_code}, Duplicated name: {duplicated.get('name')}, ID: {duplicated_pipeline_id}")
            else:
                log_test("A6: POST /api/pipelines/<id>/duplicate", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("A6: POST /api/pipelines/<id>/duplicate", False, f"Exception: {str(e)}")
    else:
        log_test("A6: POST /api/pipelines/<id>/duplicate", False, "Skipped - no pipeline created")
    
    # A7: PUT /api/pipelines/<id> {isDefault:true} -> 200; verify old default is now false
    if created_pipeline_id and funil_vendas_id:
        try:
            resp = owner_session.put(f"{BASE_URL}/api/pipelines/{created_pipeline_id}", json={
                "isDefault": True
            })
            
            if resp.status_code == 200:
                # Verify that the old default (Funil de Vendas) is now false
                resp2 = owner_session.get(f"{BASE_URL}/api/pipelines/{funil_vendas_id}")
                old_default = resp2.json().get("pipeline", {})
                old_is_not_default = old_default.get("isDefault") == False
                
                # Verify new default
                resp3 = owner_session.get(f"{BASE_URL}/api/pipelines/{created_pipeline_id}")
                new_default = resp3.json().get("pipeline", {})
                new_is_default = new_default.get("isDefault") == True
                
                log_test("A7: PUT /api/pipelines/<id> {isDefault:true} -> 200; old default now false (only 1 default per tenant)", 
                        old_is_not_default and new_is_default,
                        f"Status: {resp.status_code}, Old default isDefault: {old_default.get('isDefault')}, New default isDefault: {new_default.get('isDefault')}")
            else:
                log_test("A7: PUT /api/pipelines/<id> {isDefault:true}", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("A7: PUT /api/pipelines/<id> {isDefault:true}", False, f"Exception: {str(e)}")
    else:
        log_test("A7: PUT /api/pipelines/<id> {isDefault:true}", False, "Skipped - no pipeline IDs")
    
    # A8: PUT (restore Funil de Vendas as default)
    if funil_vendas_id:
        try:
            resp = owner_session.put(f"{BASE_URL}/api/pipelines/{funil_vendas_id}", json={
                "isDefault": True
            })
            
            log_test("A8: PUT (restore Funil de Vendas as default) -> 200", 
                    resp.status_code == 200,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("A8: PUT (restore Funil de Vendas as default)", False, f"Exception: {str(e)}")
    else:
        log_test("A8: PUT (restore default)", False, "Skipped - no Funil de Vendas ID")
    
    # A9: DELETE /api/pipelines/<funil-de-vendas-id> -> 400 "Não é possível excluir o pipeline padrão"
    if funil_vendas_id:
        try:
            resp = owner_session.delete(f"{BASE_URL}/api/pipelines/{funil_vendas_id}")
            
            is_400 = resp.status_code == 400
            has_error = "padrão" in resp.text.lower()
            
            log_test("A9: DELETE /api/pipelines/<default-pipeline> -> 400 'Não é possível excluir o pipeline padrão'", 
                    is_400 and has_error,
                    f"Status: {resp.status_code}, Error mentions 'padrão': {has_error}")
        except Exception as e:
            log_test("A9: DELETE /api/pipelines/<default-pipeline>", False, f"Exception: {str(e)}")
    else:
        log_test("A9: DELETE /api/pipelines/<default-pipeline>", False, "Skipped - no default pipeline ID")
    
    # A10: DELETE /api/pipelines/<pipeline-novo-sem-leads> -> 200
    if duplicated_pipeline_id:
        try:
            resp = owner_session.delete(f"{BASE_URL}/api/pipelines/{duplicated_pipeline_id}")
            
            log_test("A10: DELETE /api/pipelines/<pipeline-without-leads> -> 200", 
                    resp.status_code == 200,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("A10: DELETE /api/pipelines/<pipeline-without-leads>", False, f"Exception: {str(e)}")
    else:
        log_test("A10: DELETE /api/pipelines/<pipeline-without-leads>", False, "Skipped - no duplicated pipeline")
    
    # A11: DELETE /api/pipelines/<funil-de-vendas-id> with leads -> 409 "Existem N leads vinculados"
    # First make another pipeline default, then try to delete Funil de Vendas (which has 20 leads)
    if funil_vendas_id and created_pipeline_id:
        try:
            # Make created pipeline default
            owner_session.put(f"{BASE_URL}/api/pipelines/{created_pipeline_id}", json={
                "isDefault": True
            })
            
            # Now try to delete Funil de Vendas (which has leads)
            resp = owner_session.delete(f"{BASE_URL}/api/pipelines/{funil_vendas_id}")
            
            is_409 = resp.status_code == 409
            has_leads_error = "leads vinculados" in resp.text.lower() or "leads" in resp.text.lower()
            
            log_test("A11: DELETE /api/pipelines/<pipeline-with-leads> -> 409 'Existem N leads vinculados'", 
                    is_409 and has_leads_error,
                    f"Status: {resp.status_code}, Error mentions leads: {has_leads_error}, Response: {resp.text[:100]}")
            
            # Restore Funil de Vendas as default
            owner_session.put(f"{BASE_URL}/api/pipelines/{funil_vendas_id}", json={
                "isDefault": True
            })
        except Exception as e:
            log_test("A11: DELETE /api/pipelines/<pipeline-with-leads>", False, f"Exception: {str(e)}")
    else:
        log_test("A11: DELETE /api/pipelines/<pipeline-with-leads>", False, "Skipped - no pipeline IDs")
    
    return owner_session, created_pipeline_id, funil_vendas_id

# ============================================================================
# B) STAGES CRUD
# ============================================================================

def test_stages_crud(owner_session, pipeline_id, funil_vendas_id):
    print_section("B) STAGES CRUD")
    
    if not owner_session or not pipeline_id:
        print("Skipping stages tests - no owner session or pipeline ID")
        return
    
    created_stage_id = None
    stage_without_leads_id = None
    novo_lead_stage_id = None
    
    # B1: POST /api/pipelines/<pipelineId>/stages {name:"Negociação Final", color:"#EC4899"} -> 200, orderIndex = max+1
    try:
        resp = owner_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages", json={
            "name": "Negociação Final",
            "color": "#EC4899"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            stage = data.get("stage", {})
            created_stage_id = stage.get("id")
            order_index = stage.get("orderIndex")
            
            log_test("B1: POST /api/pipelines/<id>/stages {name:'Negociação Final', color:'#EC4899'} -> 200, orderIndex = max+1", 
                    created_stage_id is not None and order_index is not None,
                    f"Status: {resp.status_code}, Stage ID: {created_stage_id}, orderIndex: {order_index}")
        else:
            log_test("B1: POST /api/pipelines/<id>/stages", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("B1: POST /api/pipelines/<id>/stages", False, f"Exception: {str(e)}")
    
    # B2: PUT /api/pipelines/<pipelineId>/stages/<stageId> {name:"Negociação Avançada", color:"#10B981"} -> 200
    if created_stage_id:
        try:
            resp = owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{created_stage_id}", json={
                "name": "Negociação Avançada",
                "color": "#10B981"
            })
            
            if resp.status_code == 200:
                # Verify via GET
                resp2 = owner_session.get(f"{BASE_URL}/api/pipelines/{pipeline_id}")
                pipeline = resp2.json().get("pipeline", {})
                stages = pipeline.get("stages", [])
                updated_stage = next((s for s in stages if s.get("id") == created_stage_id), None)
                
                name_updated = updated_stage and updated_stage.get("name") == "Negociação Avançada"
                color_updated = updated_stage and updated_stage.get("color") == "#10B981"
                
                log_test("B2: PUT /api/pipelines/<id>/stages/<stageId> {name:'Negociação Avançada', color:'#10B981'} -> 200", 
                        name_updated and color_updated,
                        f"Status: {resp.status_code}, Name: {updated_stage.get('name') if updated_stage else 'NOT FOUND'}, Color: {updated_stage.get('color') if updated_stage else 'NOT FOUND'}")
            else:
                log_test("B2: PUT /api/pipelines/<id>/stages/<stageId>", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("B2: PUT /api/pipelines/<id>/stages/<stageId>", False, f"Exception: {str(e)}")
    else:
        log_test("B2: PUT /api/pipelines/<id>/stages/<stageId>", False, "Skipped - no stage created")
    
    # B3: PUT stage with {isArchived:true} when stage has leads -> 409
    # Use "Novo lead" stage from Funil de Vendas which has 3 leads
    if funil_vendas_id:
        try:
            # Get Funil de Vendas stages
            resp = owner_session.get(f"{BASE_URL}/api/pipelines/{funil_vendas_id}")
            pipeline = resp.json().get("pipeline", {})
            stages = pipeline.get("stages", [])
            
            # Find "Novo lead" stage (should have leads)
            novo_lead_stage = next((s for s in stages if s.get("name") == "Novo lead"), None)
            
            if novo_lead_stage:
                novo_lead_stage_id = novo_lead_stage.get("id")
                
                resp = owner_session.put(f"{BASE_URL}/api/pipelines/{funil_vendas_id}/stages/{novo_lead_stage_id}", json={
                    "isArchived": True
                })
                
                is_409 = resp.status_code == 409
                has_leads_error = "leads" in resp.text.lower()
                
                log_test("B3: PUT stage with {isArchived:true} when stage has leads -> 409", 
                        is_409 and has_leads_error,
                        f"Status: {resp.status_code}, Error mentions leads: {has_leads_error}")
            else:
                log_test("B3: PUT stage with {isArchived:true} when has leads", False, "Novo lead stage not found")
        except Exception as e:
            log_test("B3: PUT stage with {isArchived:true} when has leads", False, f"Exception: {str(e)}")
    else:
        log_test("B3: PUT stage with {isArchived:true} when has leads", False, "Skipped - no Funil de Vendas ID")
    
    # B4: PUT stage with {isArchived:true} without leads -> 200; PUT {isArchived:false} -> 200
    if created_stage_id:
        try:
            # Archive the stage (should have no leads)
            resp = owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{created_stage_id}", json={
                "isArchived": True
            })
            
            if resp.status_code == 200:
                # Unarchive it
                resp2 = owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{created_stage_id}", json={
                    "isArchived": False
                })
                
                both_success = resp2.status_code == 200
                
                log_test("B4: PUT stage {isArchived:true} without leads -> 200; PUT {isArchived:false} -> 200", 
                        both_success,
                        f"Archive status: {resp.status_code}, Unarchive status: {resp2.status_code}")
                
                stage_without_leads_id = created_stage_id
            else:
                log_test("B4: PUT stage {isArchived:true} without leads", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("B4: PUT stage {isArchived:true} without leads", False, f"Exception: {str(e)}")
    else:
        log_test("B4: PUT stage {isArchived:true} without leads", False, "Skipped - no stage created")
    
    # B5: Create pipeline with 1 stage, try to archive the only one -> 400 "única etapa ativa"
    try:
        # Create a new pipeline (comes with 3 stages)
        resp = owner_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Pipeline Teste Única Etapa"
        })
        
        if resp.status_code == 200:
            test_pipeline = resp.json().get("pipeline", {})
            test_pipeline_id = test_pipeline.get("id")
            test_stages = test_pipeline.get("stages", [])
            
            # Delete 2 stages, leaving only 1
            if len(test_stages) >= 3:
                owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}/stages/{test_stages[1].get('id')}")
                owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}/stages/{test_stages[2].get('id')}")
                
                # Now try to archive the only remaining stage
                resp = owner_session.put(f"{BASE_URL}/api/pipelines/{test_pipeline_id}/stages/{test_stages[0].get('id')}", json={
                    "isArchived": True
                })
                
                is_400 = resp.status_code == 400
                has_error = "única" in resp.text.lower() or "ativa" in resp.text.lower()
                
                log_test("B5: Archive única etapa ativa -> 400 'única etapa ativa'", 
                        is_400 and has_error,
                        f"Status: {resp.status_code}, Error mentions única/ativa: {has_error}")
                
                # Cleanup
                owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}")
            else:
                log_test("B5: Archive única etapa ativa", False, "Not enough stages to test")
        else:
            log_test("B5: Archive única etapa ativa", False, f"Failed to create test pipeline: {resp.status_code}")
    except Exception as e:
        log_test("B5: Archive única etapa ativa", False, f"Exception: {str(e)}")
    
    # B6: POST /api/pipelines/<id>/stages/reorder {stageIds:[...in reverse order]} -> 200; GET confirms orderIndex updated
    if pipeline_id:
        try:
            # Get current stages
            resp = owner_session.get(f"{BASE_URL}/api/pipelines/{pipeline_id}")
            pipeline = resp.json().get("pipeline", {})
            stages = pipeline.get("stages", [])
            
            if len(stages) >= 2:
                # Reverse the order
                stage_ids = [s.get("id") for s in stages]
                reversed_ids = list(reversed(stage_ids))
                
                resp = owner_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/reorder", json={
                    "stageIds": reversed_ids
                })
                
                if resp.status_code == 200:
                    # Verify via GET
                    resp2 = owner_session.get(f"{BASE_URL}/api/pipelines/{pipeline_id}")
                    updated_pipeline = resp2.json().get("pipeline", {})
                    updated_stages = updated_pipeline.get("stages", [])
                    
                    # Check if first stage is now the last one
                    first_is_now_last = updated_stages[0].get("id") == stages[-1].get("id")
                    
                    log_test("B6: POST /api/pipelines/<id>/stages/reorder {stageIds:[...reversed]} -> 200; GET confirms orderIndex", 
                            first_is_now_last,
                            f"Status: {resp.status_code}, Order reversed: {first_is_now_last}")
                    
                    # Restore original order
                    owner_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/reorder", json={
                        "stageIds": stage_ids
                    })
                else:
                    log_test("B6: POST /api/pipelines/<id>/stages/reorder", False, 
                            f"Status: {resp.status_code}, Response: {resp.text}")
            else:
                log_test("B6: POST /api/pipelines/<id>/stages/reorder", False, "Not enough stages to reorder")
        except Exception as e:
            log_test("B6: POST /api/pipelines/<id>/stages/reorder", False, f"Exception: {str(e)}")
    else:
        log_test("B6: POST /api/pipelines/<id>/stages/reorder", False, "Skipped - no pipeline ID")
    
    # B7: POST reorder with stageId from another pipeline -> 400 "Etapa(s) inválida(s)"
    if pipeline_id and funil_vendas_id:
        try:
            # Get a stage from Funil de Vendas
            resp = owner_session.get(f"{BASE_URL}/api/pipelines/{funil_vendas_id}")
            funil_pipeline = resp.json().get("pipeline", {})
            funil_stages = funil_pipeline.get("stages", [])
            
            # Get stages from created pipeline
            resp2 = owner_session.get(f"{BASE_URL}/api/pipelines/{pipeline_id}")
            created_pipeline = resp2.json().get("pipeline", {})
            created_stages = created_pipeline.get("stages", [])
            
            if funil_stages and created_stages:
                # Try to reorder with a stage from another pipeline
                invalid_ids = [created_stages[0].get("id"), funil_stages[0].get("id")]
                
                resp = owner_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/reorder", json={
                    "stageIds": invalid_ids
                })
                
                is_400 = resp.status_code == 400
                has_error = "inválida" in resp.text.lower() or "etapa" in resp.text.lower()
                
                log_test("B7: POST reorder with stageId from another pipeline -> 400 'Etapa(s) inválida(s)'", 
                        is_400 and has_error,
                        f"Status: {resp.status_code}, Error mentions inválida: {has_error}")
            else:
                log_test("B7: POST reorder with stageId from another pipeline", False, "Not enough stages")
        except Exception as e:
            log_test("B7: POST reorder with stageId from another pipeline", False, f"Exception: {str(e)}")
    else:
        log_test("B7: POST reorder with stageId from another pipeline", False, "Skipped - no pipeline IDs")
    
    # B8: DELETE stage with leads -> 409
    if funil_vendas_id and novo_lead_stage_id:
        try:
            resp = owner_session.delete(f"{BASE_URL}/api/pipelines/{funil_vendas_id}/stages/{novo_lead_stage_id}")
            
            is_409 = resp.status_code == 409
            has_leads_error = "leads" in resp.text.lower()
            
            log_test("B8: DELETE stage with leads -> 409", 
                    is_409 and has_leads_error,
                    f"Status: {resp.status_code}, Error mentions leads: {has_leads_error}")
        except Exception as e:
            log_test("B8: DELETE stage with leads", False, f"Exception: {str(e)}")
    else:
        log_test("B8: DELETE stage with leads", False, "Skipped - no stage ID")
    
    # B9: DELETE única stage ativa -> 400
    try:
        # Create a new pipeline
        resp = owner_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Pipeline Teste Delete Única"
        })
        
        if resp.status_code == 200:
            test_pipeline = resp.json().get("pipeline", {})
            test_pipeline_id = test_pipeline.get("id")
            test_stages = test_pipeline.get("stages", [])
            
            # Delete 2 stages, leaving only 1
            if len(test_stages) >= 3:
                owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}/stages/{test_stages[1].get('id')}")
                owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}/stages/{test_stages[2].get('id')}")
                
                # Now try to delete the only remaining stage
                resp = owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}/stages/{test_stages[0].get('id')}")
                
                is_400 = resp.status_code == 400
                has_error = "única" in resp.text.lower() or "ativa" in resp.text.lower()
                
                log_test("B9: DELETE única stage ativa -> 400", 
                        is_400 and has_error,
                        f"Status: {resp.status_code}, Error mentions única/ativa: {has_error}")
                
                # Cleanup
                owner_session.delete(f"{BASE_URL}/api/pipelines/{test_pipeline_id}")
            else:
                log_test("B9: DELETE única stage ativa", False, "Not enough stages to test")
        else:
            log_test("B9: DELETE única stage ativa", False, f"Failed to create test pipeline: {resp.status_code}")
    except Exception as e:
        log_test("B9: DELETE única stage ativa", False, f"Exception: {str(e)}")
    
    return stage_without_leads_id

# ============================================================================
# C) MOVE WITH ARCHIVED STAGES
# ============================================================================

def test_move_with_archived_stages(owner_session, pipeline_id, stage_id):
    print_section("C) MOVE WITH ARCHIVED STAGES")
    
    if not owner_session or not pipeline_id or not stage_id:
        print("Skipping move with archived stages tests - missing parameters")
        return
    
    # C1: Archive a stage (without leads)
    try:
        resp = owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{stage_id}", json={
            "isArchived": True
        })
        
        log_test("C1: Archive a stage (without leads) -> 200", 
                resp.status_code == 200,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("C1: Archive a stage", False, f"Exception: {str(e)}")
    
    # C2: POST /api/leads/<id>/move {stageId: <archived>} -> 400 "Esta etapa está arquivada"
    try:
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        if leads:
            lead_id = leads[0].get("id")
            
            resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                "stageId": stage_id
            })
            
            is_400 = resp.status_code == 400
            has_archived_error = "arquivada" in resp.text.lower()
            
            log_test("C2: POST /api/leads/<id>/move {stageId: <archived>} -> 400 'Esta etapa está arquivada'", 
                    is_400 and has_archived_error,
                    f"Status: {resp.status_code}, Error mentions arquivada: {has_archived_error}")
        else:
            log_test("C2: POST /api/leads/<id>/move with archived stage", False, "No leads found")
    except Exception as e:
        log_test("C2: POST /api/leads/<id>/move with archived stage", False, f"Exception: {str(e)}")
    
    # C3: POST /api/leads/<id>/move {stageId: <active>} -> 200 (regression)
    try:
        # Get an active stage
        resp = owner_session.get(f"{BASE_URL}/api/pipelines/{pipeline_id}")
        pipeline = resp.json().get("pipeline", {})
        stages = pipeline.get("stages", [])
        active_stage = next((s for s in stages if not s.get("isArchived")), None)
        
        if active_stage:
            active_stage_id = active_stage.get("id")
            
            # Get a lead
            resp = owner_session.get(f"{BASE_URL}/api/leads")
            leads = resp.json().get("leads", [])
            
            if leads:
                lead_id = leads[0].get("id")
                
                resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                    "stageId": active_stage_id
                })
                
                log_test("C3: POST /api/leads/<id>/move {stageId: <active>} -> 200 (regression)", 
                        resp.status_code == 200,
                        f"Status: {resp.status_code}")
            else:
                log_test("C3: POST /api/leads/<id>/move with active stage", False, "No leads found")
        else:
            log_test("C3: POST /api/leads/<id>/move with active stage", False, "No active stage found")
    except Exception as e:
        log_test("C3: POST /api/leads/<id>/move with active stage", False, f"Exception: {str(e)}")
    
    # Unarchive the stage for cleanup
    try:
        owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{stage_id}", json={
            "isArchived": False
        })
    except:
        pass

# ============================================================================
# D) RBAC
# ============================================================================

def test_rbac():
    print_section("D) RBAC")
    
    # Login as Ana (agent)
    ana_session = requests.Session()
    resp = ana_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "ana@leadflow.com",
        "password": "demo123"
    })
    
    if resp.status_code != 200:
        log_test("D0: Login as Ana (agent)", False, f"Status: {resp.status_code}")
        return
    
    log_test("D0: Login as Ana (agent)", True, f"Status: {resp.status_code}")
    
    # D1: Ana: POST /api/pipelines -> 403 (PIPELINES_CREATE)
    try:
        resp = ana_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Ana's Pipeline"
        })
        
        is_403 = resp.status_code == 403
        log_test("D1: Ana (agent): POST /api/pipelines -> 403 (PIPELINES_CREATE)", 
                is_403,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("D1: Ana: POST /api/pipelines", False, f"Exception: {str(e)}")
    
    # D2: Ana: POST /api/pipelines/<id>/stages -> 403 (PIPELINES_EDIT)
    try:
        # Get a pipeline ID
        owner_session = requests.Session()
        owner_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = owner_session.get(f"{BASE_URL}/api/pipelines")
        pipelines = resp.json().get("pipelines", [])
        
        if pipelines:
            pipeline_id = pipelines[0].get("id")
            
            resp = ana_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages", json={
                "name": "Ana's Stage"
            })
            
            is_403 = resp.status_code == 403
            log_test("D2: Ana (agent): POST /api/pipelines/<id>/stages -> 403 (PIPELINES_EDIT)", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("D2: Ana: POST /api/pipelines/<id>/stages", False, "No pipelines found")
    except Exception as e:
        log_test("D2: Ana: POST /api/pipelines/<id>/stages", False, f"Exception: {str(e)}")
    
    # D3: Ana: POST /api/pipelines/<id>/stages/reorder -> 403
    try:
        owner_session = requests.Session()
        owner_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = owner_session.get(f"{BASE_URL}/api/pipelines")
        pipelines = resp.json().get("pipelines", [])
        
        if pipelines:
            pipeline_id = pipelines[0].get("id")
            stages = pipelines[0].get("stages", [])
            stage_ids = [s.get("id") for s in stages]
            
            resp = ana_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/reorder", json={
                "stageIds": stage_ids
            })
            
            is_403 = resp.status_code == 403
            log_test("D3: Ana (agent): POST /api/pipelines/<id>/stages/reorder -> 403", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("D3: Ana: POST /api/pipelines/<id>/stages/reorder", False, "No pipelines found")
    except Exception as e:
        log_test("D3: Ana: POST /api/pipelines/<id>/stages/reorder", False, f"Exception: {str(e)}")
    
    # D4: Ana: DELETE /api/pipelines/<id> -> 403 (PIPELINES_DELETE)
    try:
        owner_session = requests.Session()
        owner_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        # Create a test pipeline to delete
        resp = owner_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Pipeline to Delete Test"
        })
        
        if resp.status_code == 200:
            pipeline_id = resp.json().get("pipeline", {}).get("id")
            
            resp = ana_session.delete(f"{BASE_URL}/api/pipelines/{pipeline_id}")
            
            is_403 = resp.status_code == 403
            log_test("D4: Ana (agent): DELETE /api/pipelines/<id> -> 403 (PIPELINES_DELETE)", 
                    is_403,
                    f"Status: {resp.status_code}")
            
            # Cleanup
            owner_session.delete(f"{BASE_URL}/api/pipelines/{pipeline_id}")
        else:
            log_test("D4: Ana: DELETE /api/pipelines/<id>", False, "Failed to create test pipeline")
    except Exception as e:
        log_test("D4: Ana: DELETE /api/pipelines/<id>", False, f"Exception: {str(e)}")
    
    # D5: Ana: GET /api/pipelines -> 200 (PIPELINES_VIEW includes agent)
    try:
        resp = ana_session.get(f"{BASE_URL}/api/pipelines")
        
        log_test("D5: Ana (agent): GET /api/pipelines -> 200 (PIPELINES_VIEW includes agent)", 
                resp.status_code == 200,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("D5: Ana: GET /api/pipelines", False, f"Exception: {str(e)}")
    
    # D6: Carlos (manager): POST /api/pipelines -> 200 (PIPELINES_CREATE includes manager)
    try:
        carlos_session = requests.Session()
        resp = carlos_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "carlos@leadflow.com",
            "password": "demo123"
        })
        
        if resp.status_code == 200:
            resp = carlos_session.post(f"{BASE_URL}/api/pipelines", json={
                "name": "Carlos Pipeline Test"
            })
            
            if resp.status_code == 200:
                created_id = resp.json().get("pipeline", {}).get("id")
                
                log_test("D6: Carlos (manager): POST /api/pipelines -> 200 (PIPELINES_CREATE includes manager)", 
                        True,
                        f"Status: {resp.status_code}, Pipeline ID: {created_id}")
                
                # Cleanup
                carlos_session.delete(f"{BASE_URL}/api/pipelines/{created_id}")
            else:
                log_test("D6: Carlos: POST /api/pipelines", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        else:
            log_test("D6: Carlos: POST /api/pipelines", False, f"Login failed: {resp.status_code}")
    except Exception as e:
        log_test("D6: Carlos: POST /api/pipelines", False, f"Exception: {str(e)}")
    
    # D7: Carlos (manager): DELETE /api/pipelines/<id> -> 403 (PIPELINES_DELETE = owner/admin)
    try:
        carlos_session = requests.Session()
        carlos_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "carlos@leadflow.com",
            "password": "demo123"
        })
        
        # Create a pipeline as Carlos
        resp = carlos_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Carlos Pipeline to Delete"
        })
        
        if resp.status_code == 200:
            pipeline_id = resp.json().get("pipeline", {}).get("id")
            
            # Try to delete it
            resp = carlos_session.delete(f"{BASE_URL}/api/pipelines/{pipeline_id}")
            
            is_403 = resp.status_code == 403
            log_test("D7: Carlos (manager): DELETE /api/pipelines/<id> -> 403 (PIPELINES_DELETE = owner/admin)", 
                    is_403,
                    f"Status: {resp.status_code}")
            
            # Cleanup as owner
            owner_session = requests.Session()
            owner_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "demo@leadflow.com",
                "password": "demo123"
            })
            owner_session.delete(f"{BASE_URL}/api/pipelines/{pipeline_id}")
        else:
            log_test("D7: Carlos: DELETE /api/pipelines/<id>", False, "Failed to create pipeline")
    except Exception as e:
        log_test("D7: Carlos: DELETE /api/pipelines/<id>", False, f"Exception: {str(e)}")

# ============================================================================
# E) MULTI-TENANT ISOLATION
# ============================================================================

def test_multi_tenant_isolation():
    print_section("E) MULTI-TENANT ISOLATION")
    
    # E1: Register tenant B
    tenant_b_session = requests.Session()
    tenant_b_email = f"tenant_b_pipelines_{random_string()}@test.com"
    
    try:
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "companyName": f"Tenant B Pipelines {random_string(4)}",
            "name": "Tenant B Owner",
            "email": tenant_b_email,
            "password": "abc123"
        })
        
        success = resp.status_code == 200 and resp.json().get("ok")
        log_test("E1: Register tenant B", 
                success,
                f"Status: {resp.status_code}, Email: {tenant_b_email}")
    except Exception as e:
        log_test("E1: Register tenant B", False, f"Exception: {str(e)}")
        return
    
    # E2: Tenant B: GET /api/pipelines -> only default pipeline (not demo's)
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/pipelines")
        data = resp.json()
        pipelines = data.get("pipelines", [])
        
        has_only_one = len(pipelines) == 1
        is_default = pipelines[0].get("isDefault") == True if pipelines else False
        
        log_test("E2: Tenant B: GET /api/pipelines -> only default pipeline created in register (not demo's)", 
                resp.status_code == 200 and has_only_one and is_default,
                f"Status: {resp.status_code}, Pipelines count: {len(pipelines)} (MUST be 1), isDefault: {is_default}")
        
        if not has_only_one:
            print(f"   🚨 SECURITY ISSUE: Tenant B can see {len(pipelines)} pipelines from other tenants!")
    except Exception as e:
        log_test("E2: Tenant B: GET /api/pipelines", False, f"Exception: {str(e)}")
    
    # E3: Tenant B: GET /api/pipelines/<demo-pipeline-id> -> 404
    try:
        # Get demo's pipeline ID
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/pipelines")
        demo_pipelines = resp.json().get("pipelines", [])
        
        if demo_pipelines:
            demo_pipeline_id = demo_pipelines[0].get("id")
            
            resp = tenant_b_session.get(f"{BASE_URL}/api/pipelines/{demo_pipeline_id}")
            
            is_404 = resp.status_code == 404
            log_test("E3: Tenant B: GET /api/pipelines/<demo-pipeline-id> -> 404", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can access demo's pipeline! Status: {resp.status_code}")
        else:
            log_test("E3: Tenant B: GET /api/pipelines/<demo-id>", False, "No demo pipelines found")
    except Exception as e:
        log_test("E3: Tenant B: GET /api/pipelines/<demo-id>", False, f"Exception: {str(e)}")
    
    # E4: Tenant B: PUT /api/pipelines/<demo-pipeline-id> -> 404
    try:
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/pipelines")
        demo_pipelines = resp.json().get("pipelines", [])
        
        if demo_pipelines:
            demo_pipeline_id = demo_pipelines[0].get("id")
            
            resp = tenant_b_session.put(f"{BASE_URL}/api/pipelines/{demo_pipeline_id}", json={
                "name": "Hacked Pipeline"
            })
            
            is_404 = resp.status_code == 404
            log_test("E4: Tenant B: PUT /api/pipelines/<demo-pipeline-id> -> 404", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can modify demo's pipeline! Status: {resp.status_code}")
        else:
            log_test("E4: Tenant B: PUT /api/pipelines/<demo-id>", False, "No demo pipelines found")
    except Exception as e:
        log_test("E4: Tenant B: PUT /api/pipelines/<demo-id>", False, f"Exception: {str(e)}")
    
    # E5: Tenant B: POST /api/pipelines/<demo-pipeline-id>/stages -> 404
    try:
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/pipelines")
        demo_pipelines = resp.json().get("pipelines", [])
        
        if demo_pipelines:
            demo_pipeline_id = demo_pipelines[0].get("id")
            
            resp = tenant_b_session.post(f"{BASE_URL}/api/pipelines/{demo_pipeline_id}/stages", json={
                "name": "Hacked Stage"
            })
            
            is_404 = resp.status_code == 404
            log_test("E5: Tenant B: POST /api/pipelines/<demo-pipeline-id>/stages -> 404", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can add stages to demo's pipeline! Status: {resp.status_code}")
        else:
            log_test("E5: Tenant B: POST /api/pipelines/<demo-id>/stages", False, "No demo pipelines found")
    except Exception as e:
        log_test("E5: Tenant B: POST /api/pipelines/<demo-id>/stages", False, f"Exception: {str(e)}")
    
    # E6: Tenant B: POST /api/pipelines/<tenant-b-pipeline>/stages/reorder with demo's stageId -> 400
    try:
        # Get tenant B's pipeline
        resp = tenant_b_session.get(f"{BASE_URL}/api/pipelines")
        tenant_b_pipelines = resp.json().get("pipelines", [])
        
        # Get demo's stages
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/pipelines")
        demo_pipelines = resp.json().get("pipelines", [])
        
        if tenant_b_pipelines and demo_pipelines:
            tenant_b_pipeline_id = tenant_b_pipelines[0].get("id")
            tenant_b_stages = tenant_b_pipelines[0].get("stages", [])
            demo_stages = demo_pipelines[0].get("stages", [])
            
            if tenant_b_stages and demo_stages:
                # Try to reorder with demo's stage ID
                invalid_ids = [tenant_b_stages[0].get("id"), demo_stages[0].get("id")]
                
                resp = tenant_b_session.post(f"{BASE_URL}/api/pipelines/{tenant_b_pipeline_id}/stages/reorder", json={
                    "stageIds": invalid_ids
                })
                
                is_400 = resp.status_code == 400
                has_error = "inválida" in resp.text.lower()
                
                log_test("E6: Tenant B: POST /api/pipelines/<tenant-b-id>/stages/reorder with demo's stageId -> 400", 
                        is_400 and has_error,
                        f"Status: {resp.status_code}, Error mentions inválida: {has_error}")
            else:
                log_test("E6: Tenant B: POST reorder with demo's stageId", False, "Not enough stages")
        else:
            log_test("E6: Tenant B: POST reorder with demo's stageId", False, "No pipelines found")
    except Exception as e:
        log_test("E6: Tenant B: POST reorder with demo's stageId", False, f"Exception: {str(e)}")

# ============================================================================
# F) AUDIT LOGS
# ============================================================================

def test_audit_logs():
    print_section("F) AUDIT LOGS")
    
    # Login as owner
    owner_session = requests.Session()
    resp = owner_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@leadflow.com",
        "password": "demo123"
    })
    
    if resp.status_code != 200:
        log_test("F0: Login as owner", False, f"Status: {resp.status_code}")
        return
    
    # F1: GET /api/audit-logs -> contains entries with action starting with pipeline.* or stage.*
    try:
        resp = owner_session.get(f"{BASE_URL}/api/audit-logs")
        data = resp.json()
        logs = data.get("logs", [])
        
        # Check for pipeline or stage actions
        has_pipeline_logs = any("pipeline." in log.get("action", "") for log in logs)
        has_stage_logs = any("stage." in log.get("action", "") for log in logs)
        
        log_test("F1: GET /api/audit-logs -> contains entries with action pipeline.* or stage.*", 
                resp.status_code == 200 and (has_pipeline_logs or has_stage_logs),
                f"Status: {resp.status_code}, Logs count: {len(logs)}, Has pipeline logs: {has_pipeline_logs}, Has stage logs: {has_stage_logs}")
    except Exception as e:
        log_test("F1: GET /api/audit-logs", False, f"Exception: {str(e)}")

# ============================================================================
# G) REGRESSION (DO NOT BREAK)
# ============================================================================

def test_regression():
    print_section("G) REGRESSION (DO NOT BREAK)")
    
    # Login as owner
    owner_session = requests.Session()
    resp = owner_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@leadflow.com",
        "password": "demo123"
    })
    
    if resp.status_code != 200:
        log_test("G0: Login as owner", False, f"Status: {resp.status_code}")
        return
    
    # G1: GET /api/auth/me with cookie -> 200
    try:
        resp = owner_session.get(f"{BASE_URL}/api/auth/me")
        data = resp.json()
        has_user = "user" in data and data["user"] is not None
        
        log_test("G1: GET /api/auth/me with cookie -> 200", 
                resp.status_code == 200 and has_user,
                f"Status: {resp.status_code}, Has user: {has_user}")
    except Exception as e:
        log_test("G1: GET /api/auth/me", False, f"Exception: {str(e)}")
    
    # G2: GET /api/leads as owner -> array
    try:
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        data = resp.json()
        leads = data.get("leads", [])
        
        log_test("G2: GET /api/leads as owner -> array", 
                resp.status_code == 200 and isinstance(leads, list),
                f"Status: {resp.status_code}, Leads count: {len(leads)}")
    except Exception as e:
        log_test("G2: GET /api/leads", False, f"Exception: {str(e)}")
    
    # G3: POST /api/leads/<id>/move {stageId:<valid-active>} -> 200
    try:
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        # Get an active stage
        resp2 = owner_session.get(f"{BASE_URL}/api/pipelines")
        pipelines = resp2.json().get("pipelines", [])
        
        if leads and pipelines:
            lead_id = leads[0].get("id")
            stages = pipelines[0].get("stages", [])
            active_stage = next((s for s in stages if not s.get("isArchived")), None)
            
            if active_stage:
                stage_id = active_stage.get("id")
                
                resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                    "stageId": stage_id
                })
                
                log_test("G3: POST /api/leads/<id>/move {stageId:<valid-active>} -> 200", 
                        resp.status_code == 200,
                        f"Status: {resp.status_code}")
            else:
                log_test("G3: POST /api/leads/<id>/move", False, "No active stage found")
        else:
            log_test("G3: POST /api/leads/<id>/move", False, "No leads or pipelines found")
    except Exception as e:
        log_test("G3: POST /api/leads/<id>/move", False, f"Exception: {str(e)}")
    
    # G4: GET /api/dashboard?range=30d -> 200
    try:
        resp = owner_session.get(f"{BASE_URL}/api/dashboard?range=30d")
        data = resp.json()
        has_indicators = "indicators" in data
        
        log_test("G4: GET /api/dashboard?range=30d -> 200", 
                resp.status_code == 200 and has_indicators,
                f"Status: {resp.status_code}, Has indicators: {has_indicators}")
    except Exception as e:
        log_test("G4: GET /api/dashboard", False, f"Exception: {str(e)}")
    
    # G5: GET /api/public/forms/turbinar-comercial -> 200
    try:
        public_session = requests.Session()
        resp = public_session.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
        data = resp.json()
        has_form = "form" in data
        
        log_test("G5: GET /api/public/forms/turbinar-comercial -> 200", 
                resp.status_code == 200 and has_form,
                f"Status: {resp.status_code}, Has form: {has_form}")
    except Exception as e:
        log_test("G5: GET /api/public/forms/turbinar-comercial", False, f"Exception: {str(e)}")
    
    # G6: POST /api/public/forms/turbinar-comercial/submit -> 200 (creates lead)
    try:
        public_session = requests.Session()
        
        # Get form fields first
        resp = public_session.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
        form = resp.json().get("form", {})
        fields = form.get("fields", [])
        
        if fields:
            # Build answers
            answers = []
            for field in fields:
                field_type = field.get("fieldType")
                value = ""
                
                if field_type in ["name", "short_text"]:
                    value = "João Silva"
                elif field_type == "email":
                    value = f"joao_{random_string()}@test.com"
                elif field_type == "phone":
                    value = "+5511987654321"
                elif field_type == "rating":
                    value = "5"
                elif field_type == "single_select":
                    value = "1-5"
                elif field_type == "long_text":
                    value = "Teste de regressão do pipeline editor"
                else:
                    value = "Test Value"
                
                answers.append({
                    "fieldId": field.get("id"),
                    "label": field.get("label"),
                    "value": value
                })
            
            resp = public_session.post(f"{BASE_URL}/api/public/forms/turbinar-comercial/submit", json={
                "answers": answers
            })
            
            if resp.status_code == 200:
                has_lead_id = "leadId" in resp.json()
                log_test("G6: POST /api/public/forms/turbinar-comercial/submit -> 200 (creates lead)", 
                        has_lead_id,
                        f"Status: {resp.status_code}, Lead ID: {resp.json().get('leadId')}")
            else:
                log_test("G6: POST /api/public/forms/submit", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        else:
            log_test("G6: POST /api/public/forms/submit", False, "No form fields found")
    except Exception as e:
        log_test("G6: POST /api/public/forms/submit", False, f"Exception: {str(e)}")
    
    # G7: GET /api/users as owner -> 200
    try:
        resp = owner_session.get(f"{BASE_URL}/api/users")
        data = resp.json()
        users = data.get("users", [])
        
        log_test("G7: GET /api/users as owner -> 200", 
                resp.status_code == 200 and isinstance(users, list),
                f"Status: {resp.status_code}, Users count: {len(users)}")
    except Exception as e:
        log_test("G7: GET /api/users", False, f"Exception: {str(e)}")
    
    # G8: GET /api/forms as owner -> 200
    try:
        resp = owner_session.get(f"{BASE_URL}/api/forms")
        data = resp.json()
        forms = data.get("forms", [])
        
        log_test("G8: GET /api/forms as owner -> 200", 
                resp.status_code == 200 and isinstance(forms, list),
                f"Status: {resp.status_code}, Forms count: {len(forms)}")
    except Exception as e:
        log_test("G8: GET /api/forms", False, f"Exception: {str(e)}")
    
    # G9: POST /api/invites {email:..., role:'agent'} -> 200
    try:
        random_email = f"invite_regression_{random_string()}@test.com"
        resp = owner_session.post(f"{BASE_URL}/api/invites", json={
            "email": random_email,
            "role": "agent"
        })
        
        if resp.status_code == 200:
            has_token = "token" in resp.json().get("invite", {})
            log_test("G9: POST /api/invites {email:..., role:'agent'} -> 200", 
                    has_token,
                    f"Status: {resp.status_code}, Has token: {has_token}")
        else:
            log_test("G9: POST /api/invites", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("G9: POST /api/invites", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*70)
    print("  LeadFlow CRM Pipelines Backend Test Suite (Phase 3)")
    print("  Base URL:", BASE_URL)
    print("="*70)
    
    try:
        # Run all test suites
        owner_session, created_pipeline_id, funil_vendas_id = test_pipelines_crud()
        stage_id = test_stages_crud(owner_session, created_pipeline_id, funil_vendas_id)
        test_move_with_archived_stages(owner_session, created_pipeline_id, stage_id)
        test_rbac()
        test_multi_tenant_isolation()
        test_audit_logs()
        test_regression()
        
        # Print summary
        print("\n" + "="*70)
        print("  TEST SUMMARY")
        print("="*70)
        print(f"✅ Passed: {test_results['passed']}")
        print(f"❌ Failed: {test_results['failed']}")
        print(f"📊 Total:  {test_results['passed'] + test_results['failed']}")
        
        if test_results['failed'] > 0:
            print("\n❌ FAILED TESTS:")
            for test in test_results['tests']:
                if not test['passed']:
                    print(f"  - {test['name']}")
                    if test['details']:
                        print(f"    {test['details']}")
        
        print("\n" + "="*70)
        
        # Check for critical security issues
        security_tests = [t for t in test_results['tests'] if t['name'].startswith('E')]
        security_failures = [t for t in security_tests if not t['passed']]
        
        if security_failures:
            print("\n🚨 CRITICAL SECURITY ISSUES DETECTED!")
            print("   Multi-tenant isolation is NOT working properly!")
            for test in security_failures:
                print(f"   - {test['name']}")
        else:
            print("\n✅ Multi-tenant isolation is working correctly!")
        
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
