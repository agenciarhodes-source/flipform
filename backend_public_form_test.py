#!/usr/bin/env python3
"""
LeadFlow CRM Phase 6.1 - Public Form Hardening Test Suite
Tests public form submit endpoint with comprehensive validation and edge cases
"""

import requests
import json
import random
import string
from typing import Dict, Any, Optional

# Base URL from .env
BASE_URL = "https://lead-capture-hub-45.preview.emergentagent.com"

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
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}")

# ============================================================================
# SETUP: Get form fields and pipeline info
# ============================================================================

def setup_test_data():
    """Get form fields and pipeline info for testing"""
    print_section("SETUP: Getting form data")
    
    # Login as owner to get form and pipeline info
    owner_session = requests.Session()
    resp = owner_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@leadflow.com",
        "password": "demo123"
    })
    
    if resp.status_code != 200:
        print(f"❌ Failed to login as owner: {resp.status_code}")
        return None, None, None, None
    
    # Get public form to extract fields
    resp = requests.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
    if resp.status_code != 200:
        print(f"❌ Failed to get public form: {resp.status_code}")
        return None, None, None, None
    
    form_data = resp.json().get("form", {})
    fields = form_data.get("fields", [])
    
    print(f"✅ Got form with {len(fields)} fields")
    
    # Get pipeline info
    resp = owner_session.get(f"{BASE_URL}/api/pipelines")
    pipelines = resp.json().get("pipelines", [])
    default_pipeline = next((p for p in pipelines if p.get("isDefault")), None)
    
    if not default_pipeline:
        print(f"❌ No default pipeline found")
        return None, None, None, None
    
    initial_stage = default_pipeline.get("stages", [])[0] if default_pipeline.get("stages") else None
    
    print(f"✅ Got default pipeline: {default_pipeline.get('name')} with {len(default_pipeline.get('stages', []))} stages")
    
    return owner_session, fields, default_pipeline, initial_stage

# ============================================================================
# A) HAPPY PATH TESTS
# ============================================================================

def test_happy_path(owner_session: requests.Session, fields: list):
    print_section("A) HAPPY PATH TESTS")
    
    # A1: Happy path with `value`
    try:
        answers = []
        for field in fields:
            field_type = field.get("fieldType")
            value = ""
            
            if field_type in ["name", "short_text"]:
                value = "João Silva"
            elif field_type == "email":
                value = f"joao.silva.{random_string()}@example.com"
            elif field_type == "phone":
                value = "+5511987654321"
            elif field_type == "rating":
                value = "5"
            elif field_type == "single_select":
                options = field.get("options", [])
                value = options[0] if options else "1-5"
            elif field_type == "long_text":
                value = "Estou interessado em turbinar meu negócio com marketing digital."
            else:
                value = "Test Value"
            
            answers.append({
                "fieldId": field.get("id"),
                "value": value
            })
        
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": answers}
        )
        
        if resp.status_code == 200:
            data = resp.json()
            has_ok = data.get("ok") is True
            has_lead_id = "leadId" in data
            has_success_msg = "successMessage" in data
            
            lead_id = data.get("leadId")
            
            # Verify lead was created in correct stage
            if lead_id and owner_session:
                resp2 = owner_session.get(f"{BASE_URL}/api/leads/{lead_id}")
                if resp2.status_code == 200:
                    lead = resp2.json().get("lead", {})
                    correct_source = lead.get("source") == "formulario"
                    has_answers = len(lead.get("answers", [])) > 0
                    has_history = len(lead.get("history", [])) > 0
                    
                    # Check history has fromStageId=null, toStageId=initialStageId
                    history = lead.get("history", [])
                    first_history = history[0] if history else {}
                    correct_history = first_history.get("fromStageId") is None and first_history.get("toStageId") is not None
                    
                    log_test("A1: Happy path with `value` - submit + verify lead", 
                            has_ok and has_lead_id and has_success_msg and correct_source and has_answers and correct_history,
                            f"Status: {resp.status_code}, leadId: {lead_id}, source: {lead.get('source')}, answers: {len(lead.get('answers', []))}, history correct: {correct_history}")
                else:
                    log_test("A1: Happy path with `value`", False, f"Lead created but cannot verify: {resp2.status_code}")
            else:
                log_test("A1: Happy path with `value`", has_ok and has_lead_id and has_success_msg,
                        f"Status: {resp.status_code}, leadId: {lead_id}")
        else:
            log_test("A1: Happy path with `value`", False, f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("A1: Happy path with `value`", False, f"Exception: {str(e)}")
    
    # A2: Happy path with `answer` (legacy alias)
    try:
        answers = []
        for field in fields:
            field_type = field.get("fieldType")
            value = ""
            
            if field_type in ["name", "short_text"]:
                value = "Maria Santos"
            elif field_type == "email":
                value = f"maria.santos.{random_string()}@example.com"
            elif field_type == "phone":
                value = "+5511976543210"
            elif field_type == "rating":
                value = "4"
            elif field_type == "single_select":
                options = field.get("options", [])
                value = options[0] if options else "1-5"
            elif field_type == "long_text":
                value = "Preciso de ajuda com estratégias de vendas."
            else:
                value = "Test Value"
            
            # Use `answer` instead of `value` (legacy)
            answers.append({
                "fieldId": field.get("id"),
                "answer": value  # Legacy field name
            })
        
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": answers}
        )
        
        if resp.status_code == 200:
            data = resp.json()
            has_ok = data.get("ok") is True
            has_lead_id = "leadId" in data
            
            log_test("A2: Happy path with `answer` (legacy alias)", 
                    has_ok and has_lead_id,
                    f"Status: {resp.status_code}, leadId: {data.get('leadId')}")
        else:
            log_test("A2: Happy path with `answer` (legacy)", False, f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("A2: Happy path with `answer` (legacy)", False, f"Exception: {str(e)}")

# ============================================================================
# B) VALIDATION TESTS
# ============================================================================

def test_validation(fields: list):
    print_section("B) VALIDATION TESTS")
    
    # B1: Missing required field
    try:
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": []}
        )
        
        is_400 = resp.status_code == 400
        data = resp.json() if resp.status_code == 400 else {}
        has_error = "error" in data
        has_missing_fields = "missingFields" in data
        error_mentions_required = "obrigatório" in data.get("error", "").lower() if has_error else False
        
        log_test("B1: Missing required field returns 400 with missingFields", 
                is_400 and has_error and has_missing_fields and error_mentions_required,
                f"Status: {resp.status_code}, Has error: {has_error}, Has missingFields: {has_missing_fields}, Error: {data.get('error', '')[:100]}")
    except Exception as e:
        log_test("B1: Missing required field", False, f"Exception: {str(e)}")
    
    # B2: Invalid email value
    try:
        # Find email field
        email_field = next((f for f in fields if f.get("fieldType") == "email"), None)
        
        if email_field:
            answers = []
            for field in fields:
                field_type = field.get("fieldType")
                
                if field_type == "email":
                    value = "not-an-email"  # Invalid email
                elif field_type in ["name", "short_text"]:
                    value = "Test User"
                elif field_type == "phone":
                    value = "+5511999999999"
                elif field_type == "rating":
                    value = "5"
                elif field_type == "single_select":
                    options = field.get("options", [])
                    value = options[0] if options else "1-5"
                elif field_type == "long_text":
                    value = "Test text"
                else:
                    value = "Test"
                
                answers.append({
                    "fieldId": field.get("id"),
                    "value": value
                })
            
            resp = requests.post(
                f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
                json={"answers": answers}
            )
            
            is_400 = resp.status_code == 400
            data = resp.json() if resp.status_code == 400 else {}
            error_mentions_email = "e-mail" in data.get("error", "").lower() or "email" in data.get("error", "").lower()
            
            log_test("B2: Invalid email value returns 400", 
                    is_400 and error_mentions_email,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        else:
            log_test("B2: Invalid email value", False, "No email field found in form")
    except Exception as e:
        log_test("B2: Invalid email value", False, f"Exception: {str(e)}")

# ============================================================================
# C) SLUG AND FORM STATE TESTS
# ============================================================================

def test_slug_and_form_state(owner_session: requests.Session, fields: list):
    print_section("C) SLUG AND FORM STATE TESTS")
    
    # C1: Slug inexistente
    try:
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/inexistente-xyz/submit",
            json={"answers": []}
        )
        
        is_404 = resp.status_code == 404
        data = resp.json() if resp.status_code == 404 else {}
        error_mentions_not_found = "não encontrado" in data.get("error", "").lower() or "inativo" in data.get("error", "").lower()
        
        log_test("C1: Slug inexistente returns 404", 
                is_404 and error_mentions_not_found,
                f"Status: {resp.status_code}, Error: {data.get('error', '')}")
    except Exception as e:
        log_test("C1: Slug inexistente", False, f"Exception: {str(e)}")
    
    # C2: Form inactive
    try:
        # Create a new form with isActive=false
        resp = owner_session.post(f"{BASE_URL}/api/forms", json={
            "name": "Inactive Form Test",
            "publicTitle": "Inactive Form",
            "isActive": False,
            "fields": [
                {
                    "label": "Nome",
                    "fieldType": "name",
                    "isRequired": True,
                    "orderIndex": 0
                }
            ]
        })
        
        if resp.status_code == 200:
            form = resp.json().get("form", {})
            inactive_slug = form.get("slug")
            form_id = form.get("id")
            
            # Try to submit to inactive form
            resp2 = requests.post(
                f"{BASE_URL}/api/public/forms/{inactive_slug}/submit",
                json={"answers": [{"fieldId": "any", "value": "test"}]}
            )
            
            is_404 = resp2.status_code == 404
            
            # Cleanup
            owner_session.delete(f"{BASE_URL}/api/forms/{form_id}")
            
            log_test("C2: Form inactive returns 404", 
                    is_404,
                    f"Status: {resp2.status_code}, Slug: {inactive_slug}")
        else:
            log_test("C2: Form inactive", False, f"Failed to create inactive form: {resp.status_code}")
    except Exception as e:
        log_test("C2: Form inactive", False, f"Exception: {str(e)}")

# ============================================================================
# D) PIPELINE AND STAGE ARCHIVED TESTS
# ============================================================================

def test_archived_pipeline_stage(owner_session: requests.Session, fields: list):
    print_section("D) PIPELINE AND STAGE ARCHIVED TESTS")
    
    # D1: Pipeline arquivado
    try:
        # Create new pipeline
        resp = owner_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Test Pipeline for Archive"
        })
        
        if resp.status_code == 200:
            pipeline = resp.json().get("pipeline", {})
            pipeline_id = pipeline.get("id")
            stages = pipeline.get("stages", [])
            initial_stage_id = stages[0].get("id") if stages else None
            
            # Create form using this pipeline
            resp2 = owner_session.post(f"{BASE_URL}/api/forms", json={
                "name": "Form with Archived Pipeline",
                "publicTitle": "Test Form",
                "pipelineId": pipeline_id,
                "initialStageId": initial_stage_id,
                "fields": [
                    {
                        "label": "Nome",
                        "fieldType": "name",
                        "isRequired": True,
                        "orderIndex": 0
                    }
                ]
            })
            
            if resp2.status_code == 200:
                form = resp2.json().get("form", {})
                form_slug = form.get("slug")
                form_id = form.get("id")
                
                # Archive the pipeline
                resp3 = owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}", json={
                    "isArchived": True
                })
                
                if resp3.status_code == 200:
                    # Try to submit to form with archived pipeline
                    resp4 = requests.post(
                        f"{BASE_URL}/api/public/forms/{form_slug}/submit",
                        json={"answers": [{"fieldId": "any", "value": "test"}]}
                    )
                    
                    is_410 = resp4.status_code == 410
                    data = resp4.json() if resp4.status_code == 410 else {}
                    error_mentions_archived = "arquivado" in data.get("error", "").lower() or "indisponível" in data.get("error", "").lower()
                    
                    # Cleanup
                    owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}", json={"isArchived": False})
                    owner_session.delete(f"{BASE_URL}/api/forms/{form_id}")
                    owner_session.delete(f"{BASE_URL}/api/pipelines/{pipeline_id}")
                    
                    log_test("D1: Pipeline arquivado returns 410", 
                            is_410 and error_mentions_archived,
                            f"Status: {resp4.status_code}, Error: {data.get('error', '')}")
                else:
                    log_test("D1: Pipeline arquivado", False, f"Failed to archive pipeline: {resp3.status_code}")
            else:
                log_test("D1: Pipeline arquivado", False, f"Failed to create form: {resp2.status_code}")
        else:
            log_test("D1: Pipeline arquivado", False, f"Failed to create pipeline: {resp.status_code}")
    except Exception as e:
        log_test("D1: Pipeline arquivado", False, f"Exception: {str(e)}")
    
    # D2: Stage inicial arquivada
    try:
        # Create new pipeline
        resp = owner_session.post(f"{BASE_URL}/api/pipelines", json={
            "name": "Test Pipeline for Stage Archive"
        })
        
        if resp.status_code == 200:
            pipeline = resp.json().get("pipeline", {})
            pipeline_id = pipeline.get("id")
            stages = pipeline.get("stages", [])
            
            # Add a second stage so we can archive the first one
            resp_stage = owner_session.post(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages", json={
                "name": "Second Stage",
                "color": "#10B981"
            })
            
            if resp_stage.status_code == 200:
                initial_stage_id = stages[0].get("id") if stages else None
                
                # Create form using first stage
                resp2 = owner_session.post(f"{BASE_URL}/api/forms", json={
                    "name": "Form with Archived Stage",
                    "publicTitle": "Test Form",
                    "pipelineId": pipeline_id,
                    "initialStageId": initial_stage_id,
                    "fields": [
                        {
                            "label": "Nome",
                            "fieldType": "name",
                            "isRequired": True,
                            "orderIndex": 0
                        }
                    ]
                })
                
                if resp2.status_code == 200:
                    form = resp2.json().get("form", {})
                    form_slug = form.get("slug")
                    form_id = form.get("id")
                    
                    # Archive the initial stage
                    resp3 = owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{initial_stage_id}", json={
                        "isArchived": True
                    })
                    
                    if resp3.status_code == 200:
                        # Try to submit to form with archived stage
                        resp4 = requests.post(
                            f"{BASE_URL}/api/public/forms/{form_slug}/submit",
                            json={"answers": [{"fieldId": "any", "value": "test"}]}
                        )
                        
                        is_410 = resp4.status_code == 410
                        data = resp4.json() if resp4.status_code == 410 else {}
                        error_mentions_archived = "arquivada" in data.get("error", "").lower() or "indisponível" in data.get("error", "").lower()
                        
                        # Cleanup
                        owner_session.put(f"{BASE_URL}/api/pipelines/{pipeline_id}/stages/{initial_stage_id}", json={"isArchived": False})
                        owner_session.delete(f"{BASE_URL}/api/forms/{form_id}")
                        owner_session.delete(f"{BASE_URL}/api/pipelines/{pipeline_id}")
                        
                        log_test("D2: Stage inicial arquivada returns 410", 
                                is_410 and error_mentions_archived,
                                f"Status: {resp4.status_code}, Error: {data.get('error', '')}")
                    else:
                        log_test("D2: Stage inicial arquivada", False, f"Failed to archive stage: {resp3.status_code}")
                else:
                    log_test("D2: Stage inicial arquivada", False, f"Failed to create form: {resp2.status_code}")
            else:
                log_test("D2: Stage inicial arquivada", False, f"Failed to create second stage: {resp_stage.status_code}")
        else:
            log_test("D2: Stage inicial arquivada", False, f"Failed to create pipeline: {resp.status_code}")
    except Exception as e:
        log_test("D2: Stage inicial arquivada", False, f"Exception: {str(e)}")

# ============================================================================
# E) MALFORMED AND INVALID DATA TESTS
# ============================================================================

def test_malformed_data(fields: list):
    print_section("E) MALFORMED AND INVALID DATA TESTS")
    
    # E1: JSON malformado
    try:
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            data="{not-json",
            headers={"Content-Type": "application/json"}
        )
        
        is_400 = resp.status_code == 400
        data = resp.json() if resp.status_code == 400 else {}
        error_mentions_json = "json" in data.get("error", "").lower() or "malformado" in data.get("error", "").lower() or "inválido" in data.get("error", "").lower()
        
        log_test("E1: JSON malformado returns 400", 
                is_400 and error_mentions_json,
                f"Status: {resp.status_code}, Error: {data.get('error', '')}")
    except Exception as e:
        log_test("E1: JSON malformado", False, f"Exception: {str(e)}")
    
    # E2: FieldIds que não pertencem ao form
    try:
        # Send only invalid fieldId
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": [{"fieldId": "00000000-0000-0000-0000-000000000000", "value": "test"}]}
        )
        
        # Should return 400 because required fields are missing
        is_400 = resp.status_code == 400
        data = resp.json() if resp.status_code == 400 else {}
        has_missing_fields = "missingFields" in data
        
        log_test("E2: FieldIds que não pertencem ao form - validation still applies", 
                is_400 and has_missing_fields,
                f"Status: {resp.status_code}, Has missingFields: {has_missing_fields}")
    except Exception as e:
        log_test("E2: FieldIds que não pertencem ao form", False, f"Exception: {str(e)}")

# ============================================================================
# F) MULTI-TENANT ISOLATION
# ============================================================================

def test_multi_tenant(owner_session: requests.Session, fields: list):
    print_section("F) MULTI-TENANT ISOLATION")
    
    # F1: Submit to tenant A form, verify tenant B cannot see the lead
    try:
        # Submit to tenant A form
        answers = []
        for field in fields:
            field_type = field.get("fieldType")
            value = ""
            
            if field_type in ["name", "short_text"]:
                value = "Tenant Isolation Test"
            elif field_type == "email":
                value = f"tenant.test.{random_string()}@example.com"
            elif field_type == "phone":
                value = "+5511999999999"
            elif field_type == "rating":
                value = "5"
            elif field_type == "single_select":
                options = field.get("options", [])
                value = options[0] if options else "1-5"
            elif field_type == "long_text":
                value = "Testing multi-tenant isolation"
            else:
                value = "Test"
            
            answers.append({
                "fieldId": field.get("id"),
                "value": value
            })
        
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": answers}
        )
        
        if resp.status_code == 200:
            lead_id = resp.json().get("leadId")
            
            # Register tenant B
            tenant_b_session = requests.Session()
            tenant_b_email = f"tenant_b_public_{random_string()}@test.com"
            
            resp2 = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
                "companyName": f"Tenant B Public {random_string(4)}",
                "name": "Tenant B User",
                "email": tenant_b_email,
                "password": "abc123"
            })
            
            if resp2.status_code == 200:
                # Tenant B tries to get all leads
                resp3 = tenant_b_session.get(f"{BASE_URL}/api/leads")
                tenant_b_leads = resp3.json().get("leads", [])
                
                # Tenant B should not see the lead from tenant A
                lead_in_b = any(l.get("id") == lead_id for l in tenant_b_leads)
                
                # Tenant B tries to access the specific lead
                resp4 = tenant_b_session.get(f"{BASE_URL}/api/leads/{lead_id}")
                is_404 = resp4.status_code == 404
                
                log_test("F1: Multi-tenant isolation - Tenant B cannot see Tenant A's lead", 
                        not lead_in_b and is_404,
                        f"Lead in B's list: {lead_in_b}, Direct access status: {resp4.status_code} (must be 404)")
                
                if lead_in_b or not is_404:
                    print(f"   🚨 SECURITY ISSUE: Tenant B can access Tenant A's lead!")
            else:
                log_test("F1: Multi-tenant isolation", False, f"Failed to register tenant B: {resp2.status_code}")
        else:
            log_test("F1: Multi-tenant isolation", False, f"Failed to submit form: {resp.status_code}")
    except Exception as e:
        log_test("F1: Multi-tenant isolation", False, f"Exception: {str(e)}")

# ============================================================================
# G) AUDIT LOGS
# ============================================================================

def test_audit_logs(owner_session: requests.Session, fields: list):
    print_section("G) AUDIT LOGS")
    
    # G1: Verify audit logs after submit
    try:
        # Submit form
        answers = []
        for field in fields:
            field_type = field.get("fieldType")
            value = ""
            
            if field_type in ["name", "short_text"]:
                value = "Audit Test User"
            elif field_type == "email":
                value = f"audit.test.{random_string()}@example.com"
            elif field_type == "phone":
                value = "+5511999999999"
            elif field_type == "rating":
                value = "5"
            elif field_type == "single_select":
                options = field.get("options", [])
                value = options[0] if options else "1-5"
            elif field_type == "long_text":
                value = "Testing audit logs"
            else:
                value = "Test"
            
            answers.append({
                "fieldId": field.get("id"),
                "value": value
            })
        
        resp = requests.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": answers}
        )
        
        if resp.status_code == 200:
            lead_id = resp.json().get("leadId")
            
            # Get audit logs
            resp2 = owner_session.get(f"{BASE_URL}/api/audit-logs")
            
            if resp2.status_code == 200:
                logs = resp2.json().get("logs", [])
                
                # Check for form.submitted and lead.created
                has_form_submitted = any(log.get("action") == "form.submitted" for log in logs)
                has_lead_created = any(log.get("action") == "lead.created" and log.get("entityId") == lead_id for log in logs)
                
                log_test("G1: Audit logs contain form.submitted and lead.created", 
                        has_form_submitted and has_lead_created,
                        f"Has form.submitted: {has_form_submitted}, Has lead.created: {has_lead_created}")
            else:
                log_test("G1: Audit logs", False, f"Failed to get audit logs: {resp2.status_code}")
        else:
            log_test("G1: Audit logs", False, f"Failed to submit form: {resp.status_code}")
    except Exception as e:
        log_test("G1: Audit logs", False, f"Exception: {str(e)}")

# ============================================================================
# H) CONCURRENCY / ATOMICITY
# ============================================================================

def test_concurrency(fields: list):
    print_section("H) CONCURRENCY / ATOMICITY")
    
    # H1: Submit 5x in parallel
    try:
        import concurrent.futures
        
        def submit_form():
            answers = []
            for field in fields:
                field_type = field.get("fieldType")
                value = ""
                
                if field_type in ["name", "short_text"]:
                    value = f"Concurrent User {random_string(4)}"
                elif field_type == "email":
                    value = f"concurrent.{random_string()}@example.com"
                elif field_type == "phone":
                    value = "+5511999999999"
                elif field_type == "rating":
                    value = "5"
                elif field_type == "single_select":
                    options = field.get("options", [])
                    value = options[0] if options else "1-5"
                elif field_type == "long_text":
                    value = "Testing concurrency"
                else:
                    value = "Test"
                
                answers.append({
                    "fieldId": field.get("id"),
                    "value": value
                })
            
            resp = requests.post(
                f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
                json={"answers": answers}
            )
            return resp.status_code, resp.json() if resp.status_code == 200 else {}
        
        # Submit 5 times in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(submit_form) for _ in range(5)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        # Check all returned 200
        all_200 = all(r[0] == 200 for r in results)
        
        # Check all have unique leadIds
        lead_ids = [r[1].get("leadId") for r in results if r[0] == 200]
        unique_leads = len(set(lead_ids)) == len(lead_ids)
        
        log_test("H1: Concurrency - 5 parallel submits create 5 unique leads", 
                all_200 and unique_leads and len(lead_ids) == 5,
                f"All 200: {all_200}, Unique leads: {unique_leads}, Count: {len(lead_ids)}/5")
    except Exception as e:
        log_test("H1: Concurrency", False, f"Exception: {str(e)}")

# ============================================================================
# I) NO AUTH REQUIRED
# ============================================================================

def test_no_auth_required(fields: list):
    print_section("I) NO AUTH REQUIRED")
    
    # I1: Confirm public endpoint works without auth
    try:
        no_auth_session = requests.Session()
        
        answers = []
        for field in fields:
            field_type = field.get("fieldType")
            value = ""
            
            if field_type in ["name", "short_text"]:
                value = "No Auth User"
            elif field_type == "email":
                value = f"noauth.{random_string()}@example.com"
            elif field_type == "phone":
                value = "+5511999999999"
            elif field_type == "rating":
                value = "5"
            elif field_type == "single_select":
                options = field.get("options", [])
                value = options[0] if options else "1-5"
            elif field_type == "long_text":
                value = "Testing no auth required"
            else:
                value = "Test"
            
            answers.append({
                "fieldId": field.get("id"),
                "value": value
            })
        
        resp = no_auth_session.post(
            f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
            json={"answers": answers}
        )
        
        is_200 = resp.status_code == 200
        has_lead_id = resp.json().get("leadId") is not None if is_200 else False
        
        log_test("I1: No auth required - public endpoint works without cookie", 
                is_200 and has_lead_id,
                f"Status: {resp.status_code}, Has leadId: {has_lead_id}")
    except Exception as e:
        log_test("I1: No auth required", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*80)
    print("  LeadFlow CRM Phase 6.1 - Public Form Hardening Test Suite")
    print("  Base URL:", BASE_URL)
    print("="*80)
    
    try:
        # Setup
        owner_session, fields, pipeline, initial_stage = setup_test_data()
        
        if not fields:
            print("\n❌ Failed to setup test data. Exiting.")
            return
        
        # Run all test suites
        test_happy_path(owner_session, fields)
        test_validation(fields)
        test_slug_and_form_state(owner_session, fields)
        test_archived_pipeline_stage(owner_session, fields)
        test_malformed_data(fields)
        test_multi_tenant(owner_session, fields)
        test_audit_logs(owner_session, fields)
        test_concurrency(fields)
        test_no_auth_required(fields)
        
        # Print summary
        print("\n" + "="*80)
        print("  TEST SUMMARY")
        print("="*80)
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
        
        print("\n" + "="*80)
        
        # Check for critical security issues
        security_tests = [t for t in test_results['tests'] if 'isolation' in t['name'].lower() or 'tenant' in t['name'].lower()]
        security_failures = [t for t in security_tests if not t['passed']]
        
        if security_failures:
            print("\n🚨 CRITICAL SECURITY ISSUES DETECTED!")
            print("   Multi-tenant isolation is NOT working properly!")
            for test in security_failures:
                print(f"   - {test['name']}")
        else:
            print("\n✅ Multi-tenant isolation is working correctly!")
        
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
