#!/usr/bin/env python3
"""
LeadFlow CRM Backend API Test Suite
Tests all backend endpoints with authentication, multi-tenant isolation, and data integrity
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
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ============================================================================
# A) AUTH TESTS
# ============================================================================

def test_auth():
    print_section("A) AUTH TESTS")
    
    # Create session for demo user
    demo_session = requests.Session()
    
    # A1: Login with correct credentials
    try:
        resp = demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        if resp.status_code == 200 and resp.json().get("ok"):
            # Check if cookie is set (flipform_token or leadflow_token for backward compat)
            has_cookie = "flipform_token" in demo_session.cookies or "leadflow_token" in demo_session.cookies
            log_test("A1: Login with correct credentials", 
                    resp.status_code == 200 and has_cookie,
                    f"Status: {resp.status_code}, Cookie set: {has_cookie}")
        else:
            log_test("A1: Login with correct credentials", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("A1: Login with correct credentials", False, f"Exception: {str(e)}")
    
    # A2: Login with wrong password
    try:
        wrong_session = requests.Session()
        resp = wrong_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "wrongpassword"
        })
        log_test("A2: Login with wrong password returns 401", 
                resp.status_code == 401,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("A2: Login with wrong password returns 401", False, f"Exception: {str(e)}")
    
    # A3: GET /api/auth/me with session
    try:
        resp = demo_session.get(f"{BASE_URL}/api/auth/me")
        data = resp.json()
        has_user = "user" in data and data["user"] is not None
        has_tenant = has_user and "tenantSlug" in data["user"]
        log_test("A3: GET /api/auth/me with cookie returns user", 
                resp.status_code == 200 and has_user and has_tenant,
                f"Status: {resp.status_code}, Has user: {has_user}, Has tenantSlug: {has_tenant}")
    except Exception as e:
        log_test("A3: GET /api/auth/me with cookie returns user", False, f"Exception: {str(e)}")
    
    # A4: GET /api/auth/me without cookie
    try:
        no_auth_session = requests.Session()
        resp = no_auth_session.get(f"{BASE_URL}/api/auth/me")
        log_test("A4: GET /api/auth/me without cookie returns 401", 
                resp.status_code == 401,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("A4: GET /api/auth/me without cookie returns 401", False, f"Exception: {str(e)}")
    
    # A5: Register new user
    try:
        new_session = requests.Session()
        random_email = f"tester_{random_string()}@test.com"
        resp = new_session.post(f"{BASE_URL}/api/auth/register", json={
            "companyName": f"Empresa Teste {random_string(4)}",
            "name": "Tester",
            "email": random_email,
            "password": "abc123"
        })
        
        if resp.status_code == 200:
            has_cookie = "flipform_token" in new_session.cookies or "leadflow_token" in new_session.cookies
            log_test("A5: Register new user", 
                    resp.json().get("ok") and has_cookie,
                    f"Status: {resp.status_code}, Email: {random_email}, Cookie set: {has_cookie}")
        else:
            log_test("A5: Register new user", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("A5: Register new user", False, f"Exception: {str(e)}")
    
    # A6: Register with same email again
    try:
        dup_session = requests.Session()
        resp = dup_session.post(f"{BASE_URL}/api/auth/register", json={
            "companyName": "Duplicate Test",
            "name": "Duplicate",
            "email": random_email,  # Same email from A5
            "password": "abc123"
        })
        log_test("A6: Register duplicate email returns 409", 
                resp.status_code == 409,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("A6: Register duplicate email returns 409", False, f"Exception: {str(e)}")
    
    # A7: Logout
    try:
        resp = demo_session.post(f"{BASE_URL}/api/auth/logout")
        log_test("A7: Logout returns 200", 
                resp.status_code == 200 and resp.json().get("ok"),
                f"Status: {resp.status_code}")
        
        # Re-login for subsequent tests
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
    except Exception as e:
        log_test("A7: Logout returns 200", False, f"Exception: {str(e)}")
    
    return demo_session

# ============================================================================
# B) FORMS TESTS
# ============================================================================

def test_forms(demo_session: requests.Session):
    print_section("B) FORMS TESTS (Authenticated)")
    
    created_form_id = None
    
    # B1: GET /api/forms
    try:
        resp = demo_session.get(f"{BASE_URL}/api/forms")
        data = resp.json()
        forms = data.get("forms", [])
        has_capturacao = any("Captura" in f.get("name", "") for f in forms)
        log_test("B1: GET /api/forms returns list with 'Capturação Site'", 
                resp.status_code == 200 and has_capturacao,
                f"Status: {resp.status_code}, Forms count: {len(forms)}, Has Capturação: {has_capturacao}")
    except Exception as e:
        log_test("B1: GET /api/forms returns list", False, f"Exception: {str(e)}")
    
    # B2: POST /api/forms (create new form)
    try:
        resp = demo_session.post(f"{BASE_URL}/api/forms", json={
            "name": "Form Teste",
            "publicTitle": "Teste?",
            "fields": [
                {
                    "label": "Nome",
                    "fieldType": "name",
                    "isRequired": True,
                    "orderIndex": 0,
                    "options": None,
                    "placeholder": "seu nome"
                }
            ]
        })
        
        if resp.status_code == 200:
            data = resp.json()
            form = data.get("form", {})
            created_form_id = form.get("id")
            has_slug = "slug" in form
            log_test("B2: POST /api/forms creates form with slug", 
                    created_form_id is not None and has_slug,
                    f"Status: {resp.status_code}, Form ID: {created_form_id}, Slug: {form.get('slug')}")
        else:
            log_test("B2: POST /api/forms creates form", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("B2: POST /api/forms creates form", False, f"Exception: {str(e)}")
    
    # B3: GET /api/forms/<id>
    if created_form_id:
        try:
            resp = demo_session.get(f"{BASE_URL}/api/forms/{created_form_id}")
            data = resp.json()
            form = data.get("form", {})
            has_fields = "fields" in form and len(form["fields"]) > 0
            log_test("B3: GET /api/forms/<id> returns form with fields", 
                    resp.status_code == 200 and has_fields,
                    f"Status: {resp.status_code}, Fields count: {len(form.get('fields', []))}")
        except Exception as e:
            log_test("B3: GET /api/forms/<id> returns form", False, f"Exception: {str(e)}")
    else:
        log_test("B3: GET /api/forms/<id>", False, "Skipped - no form created")
    
    # B4: PUT /api/forms/<id> (update)
    if created_form_id:
        try:
            resp = demo_session.put(f"{BASE_URL}/api/forms/{created_form_id}", json={
                "name": "Form Teste Updated",
                "publicTitle": "Teste Atualizado?",
                "fields": [
                    {
                        "label": "Nome Completo",
                        "fieldType": "name",
                        "isRequired": True,
                        "orderIndex": 0,
                        "placeholder": "digite seu nome completo"
                    },
                    {
                        "label": "Email",
                        "fieldType": "email",
                        "isRequired": True,
                        "orderIndex": 1,
                        "placeholder": "seu@email.com"
                    }
                ]
            })
            log_test("B4: PUT /api/forms/<id> updates form", 
                    resp.status_code == 200 and resp.json().get("ok"),
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("B4: PUT /api/forms/<id> updates form", False, f"Exception: {str(e)}")
    else:
        log_test("B4: PUT /api/forms/<id>", False, "Skipped - no form created")
    
    # B5: DELETE /api/forms/<id>
    if created_form_id:
        try:
            resp = demo_session.delete(f"{BASE_URL}/api/forms/{created_form_id}")
            log_test("B5: DELETE /api/forms/<id> deletes form", 
                    resp.status_code == 200 and resp.json().get("ok"),
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("B5: DELETE /api/forms/<id> deletes form", False, f"Exception: {str(e)}")
    else:
        log_test("B5: DELETE /api/forms/<id>", False, "Skipped - no form created")
    
    # B6: GET /api/forms without cookie
    try:
        no_auth = requests.Session()
        resp = no_auth.get(f"{BASE_URL}/api/forms")
        log_test("B6: GET /api/forms without auth returns 401", 
                resp.status_code == 401,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B6: GET /api/forms without auth returns 401", False, f"Exception: {str(e)}")

# ============================================================================
# C) PUBLIC FORM TESTS
# ============================================================================

def test_public_forms():
    print_section("C) PUBLIC FORM TESTS (No Auth)")
    
    public_session = requests.Session()
    form_fields = []
    
    # C1: GET /api/public/forms/turbinar-comercial
    try:
        resp = public_session.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
        data = resp.json()
        form = data.get("form", {})
        form_fields = form.get("fields", [])
        has_6_fields = len(form_fields) == 6
        log_test("C1: GET /api/public/forms/turbinar-comercial returns form with 6 fields", 
                resp.status_code == 200 and has_6_fields,
                f"Status: {resp.status_code}, Fields count: {len(form_fields)}")
    except Exception as e:
        log_test("C1: GET /api/public/forms/turbinar-comercial", False, f"Exception: {str(e)}")
    
    # C2: GET /api/public/forms/invalid-slug
    try:
        resp = public_session.get(f"{BASE_URL}/api/public/forms/invalid-slug-xyz")
        log_test("C2: GET /api/public/forms/invalid-slug returns 404", 
                resp.status_code == 404,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("C2: GET /api/public/forms/invalid-slug returns 404", False, f"Exception: {str(e)}")
    
    # C3: POST /api/public/forms/turbinar-comercial/submit
    if form_fields:
        try:
            # Build answers based on field types
            answers = []
            for field in form_fields:
                field_type = field.get("fieldType")
                value = ""
                
                if field_type in ["name", "short_text"]:
                    value = "Test User"
                elif field_type == "email":
                    value = "test@example.com"
                elif field_type == "phone":
                    value = "+5511999999999"
                elif field_type == "rating":
                    value = "5"
                elif field_type == "single_select":
                    value = "1-5"
                elif field_type == "long_text":
                    value = "This is a test long text answer from automation"
                else:
                    value = "Test Value"
                
                answers.append({
                    "fieldId": field.get("id"),
                    "label": field.get("label"),
                    "value": value
                })
            
            resp = public_session.post(
                f"{BASE_URL}/api/public/forms/turbinar-comercial/submit",
                json={"answers": answers}
            )
            
            if resp.status_code == 200:
                data = resp.json()
                has_lead_id = "leadId" in data
                has_success = data.get("ok") is True
                log_test("C3: POST /api/public/forms/turbinar-comercial/submit creates lead", 
                        has_lead_id and has_success,
                        f"Status: {resp.status_code}, Lead ID: {data.get('leadId')}")
            else:
                log_test("C3: POST submit creates lead", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("C3: POST submit creates lead", False, f"Exception: {str(e)}")
    else:
        log_test("C3: POST submit", False, "Skipped - no form fields")

# ============================================================================
# D) LEADS TESTS
# ============================================================================

def test_leads(demo_session: requests.Session):
    print_section("D) LEADS TESTS (Authenticated)")
    
    test_lead_id = None
    ganho_stage_id = None
    
    # D1: GET /api/leads
    try:
        resp = demo_session.get(f"{BASE_URL}/api/leads")
        data = resp.json()
        leads = data.get("leads", [])
        has_21_plus = len(leads) >= 21  # 20 seeded + 1 from public submit
        log_test("D1: GET /api/leads returns >= 21 leads", 
                resp.status_code == 200 and has_21_plus,
                f"Status: {resp.status_code}, Leads count: {len(leads)}")
        
        if leads:
            test_lead_id = leads[0].get("id")
    except Exception as e:
        log_test("D1: GET /api/leads", False, f"Exception: {str(e)}")
    
    # D2: GET /api/leads?q=Roberto
    try:
        resp = demo_session.get(f"{BASE_URL}/api/leads?q=Roberto")
        data = resp.json()
        leads = data.get("leads", [])
        has_roberto = any("Roberto" in l.get("name", "") for l in leads)
        log_test("D2: GET /api/leads?q=Roberto finds Roberto Silva", 
                resp.status_code == 200 and has_roberto,
                f"Status: {resp.status_code}, Results: {len(leads)}, Has Roberto: {has_roberto}")
    except Exception as e:
        log_test("D2: GET /api/leads?q=Roberto", False, f"Exception: {str(e)}")
    
    # D3: GET /api/pipelines
    try:
        resp = demo_session.get(f"{BASE_URL}/api/pipelines")
        data = resp.json()
        pipelines = data.get("pipelines", [])
        
        if pipelines:
            stages = pipelines[0].get("stages", [])
            has_7_stages = len(stages) == 7
            
            # Find "Ganho" stage
            for stage in stages:
                if stage.get("name") == "Ganho":
                    ganho_stage_id = stage.get("id")
                    break
            
            log_test("D3: GET /api/pipelines returns pipeline with 7 stages", 
                    resp.status_code == 200 and has_7_stages,
                    f"Status: {resp.status_code}, Stages: {len(stages)}, Ganho stage ID: {ganho_stage_id}")
        else:
            log_test("D3: GET /api/pipelines", False, "No pipelines found")
    except Exception as e:
        log_test("D3: GET /api/pipelines", False, f"Exception: {str(e)}")
    
    # D4: GET /api/leads/<id>
    if test_lead_id:
        try:
            resp = demo_session.get(f"{BASE_URL}/api/leads/{test_lead_id}")
            data = resp.json()
            lead = data.get("lead", {})
            has_stage = "stage" in lead
            has_answers = "answers" in lead
            has_history = "history" in lead
            has_notes = "notes" in lead
            has_tasks = "tasks" in lead
            
            log_test("D4: GET /api/leads/<id> returns complete lead data", 
                    resp.status_code == 200 and has_stage and has_answers and has_history,
                    f"Status: {resp.status_code}, Has stage: {has_stage}, answers: {has_answers}, history: {has_history}")
        except Exception as e:
            log_test("D4: GET /api/leads/<id>", False, f"Exception: {str(e)}")
    else:
        log_test("D4: GET /api/leads/<id>", False, "Skipped - no lead ID")
    
    # D5: POST /api/leads/<id>/move to Ganho stage
    if test_lead_id and ganho_stage_id:
        try:
            resp = demo_session.post(f"{BASE_URL}/api/leads/{test_lead_id}/move", json={
                "stageId": ganho_stage_id
            })
            
            if resp.status_code == 200:
                # Verify status changed to "won"
                resp2 = demo_session.get(f"{BASE_URL}/api/leads/{test_lead_id}")
                lead = resp2.json().get("lead", {})
                is_won = lead.get("status") == "won"
                log_test("D5: POST /api/leads/<id>/move to Ganho sets status=won", 
                        is_won,
                        f"Move status: {resp.status_code}, Lead status: {lead.get('status')}")
            else:
                log_test("D5: POST /api/leads/<id>/move", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("D5: POST /api/leads/<id>/move", False, f"Exception: {str(e)}")
    else:
        log_test("D5: POST /api/leads/<id>/move", False, "Skipped - no lead or stage ID")
    
    # D6: PUT /api/leads/<id> (update temperature)
    if test_lead_id:
        try:
            resp = demo_session.put(f"{BASE_URL}/api/leads/{test_lead_id}", json={
                "temperature": "hot"
            })
            log_test("D6: PUT /api/leads/<id> updates temperature", 
                    resp.status_code == 200 and resp.json().get("ok"),
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("D6: PUT /api/leads/<id>", False, f"Exception: {str(e)}")
    else:
        log_test("D6: PUT /api/leads/<id>", False, "Skipped - no lead ID")
    
    # D7: POST /api/leads/<id>/notes
    if test_lead_id:
        try:
            resp = demo_session.post(f"{BASE_URL}/api/leads/{test_lead_id}/notes", json={
                "content": "Test note from automation"
            })
            
            if resp.status_code == 200:
                data = resp.json()
                has_note = "note" in data
                log_test("D7: POST /api/leads/<id>/notes creates note", 
                        has_note,
                        f"Status: {resp.status_code}, Note ID: {data.get('note', {}).get('id')}")
            else:
                log_test("D7: POST /api/leads/<id>/notes", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("D7: POST /api/leads/<id>/notes", False, f"Exception: {str(e)}")
    else:
        log_test("D7: POST /api/leads/<id>/notes", False, "Skipped - no lead ID")
    
    # D8: DELETE /api/leads/<id> (cleanup)
    if test_lead_id:
        try:
            resp = demo_session.delete(f"{BASE_URL}/api/leads/{test_lead_id}")
            log_test("D8: DELETE /api/leads/<id> deletes lead", 
                    resp.status_code == 200 and resp.json().get("ok"),
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("D8: DELETE /api/leads/<id>", False, f"Exception: {str(e)}")
    else:
        log_test("D8: DELETE /api/leads/<id>", False, "Skipped - no lead ID")

# ============================================================================
# E) DASHBOARD TESTS
# ============================================================================

def test_dashboard(demo_session: requests.Session):
    print_section("E) DASHBOARD TESTS")
    
    # E1: GET /api/dashboard?range=30d
    try:
        resp = demo_session.get(f"{BASE_URL}/api/dashboard?range=30d")
        data = resp.json()
        
        has_indicators = "indicators" in data
        has_leads_by_day = "leadsByDay" in data
        has_leads_by_stage = "leadsByStage" in data
        has_leads_by_source = "leadsBySource" in data
        has_leads_by_assignee = "leadsByAssignee" in data
        
        all_present = all([has_indicators, has_leads_by_day, has_leads_by_stage, 
                          has_leads_by_source, has_leads_by_assignee])
        
        log_test("E1: GET /api/dashboard?range=30d returns all metrics", 
                resp.status_code == 200 and all_present,
                f"Status: {resp.status_code}, Has all metrics: {all_present}")
    except Exception as e:
        log_test("E1: GET /api/dashboard?range=30d", False, f"Exception: {str(e)}")
    
    # E2: GET /api/dashboard?range=7d
    try:
        resp = demo_session.get(f"{BASE_URL}/api/dashboard?range=7d")
        log_test("E2: GET /api/dashboard?range=7d returns data", 
                resp.status_code == 200 and "indicators" in resp.json(),
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("E2: GET /api/dashboard?range=7d", False, f"Exception: {str(e)}")
    
    # E3: GET /api/dashboard without auth
    try:
        no_auth = requests.Session()
        resp = no_auth.get(f"{BASE_URL}/api/dashboard?range=30d")
        log_test("E3: GET /api/dashboard without auth returns 401", 
                resp.status_code == 401,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("E3: GET /api/dashboard without auth returns 401", False, f"Exception: {str(e)}")

# ============================================================================
# F) MULTI-TENANT ISOLATION TESTS (CRITICAL)
# ============================================================================

def test_multi_tenant_isolation(demo_session: requests.Session):
    print_section("F) MULTI-TENANT ISOLATION TESTS (CRITICAL - Security)")
    
    tenant_b_session = requests.Session()
    tenant_b_email = f"tenant_b_{random_string()}@test.com"
    demo_lead_id = None
    
    # Get a demo lead ID first
    try:
        resp = demo_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        if leads:
            demo_lead_id = leads[0].get("id")
    except:
        pass
    
    # F1: Register tenant B
    try:
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "companyName": f"Tenant B Company {random_string(4)}",
            "name": "Tenant B User",
            "email": tenant_b_email,
            "password": "abc123"
        })
        
        success = resp.status_code == 200 and resp.json().get("ok")
        log_test("F1: Register tenant B", 
                success,
                f"Status: {resp.status_code}, Email: {tenant_b_email}")
    except Exception as e:
        log_test("F1: Register tenant B", False, f"Exception: {str(e)}")
    
    # F2: Tenant B GET /api/leads should return 0 leads
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/leads")
        data = resp.json()
        leads = data.get("leads", [])
        has_zero_leads = len(leads) == 0
        
        log_test("F2: Tenant B GET /api/leads returns 0 leads (isolation)", 
                resp.status_code == 200 and has_zero_leads,
                f"Status: {resp.status_code}, Leads count: {len(leads)} (MUST be 0)")
        
        if not has_zero_leads:
            print(f"   🚨 SECURITY ISSUE: Tenant B can see {len(leads)} leads from other tenants!")
    except Exception as e:
        log_test("F2: Tenant B leads isolation", False, f"Exception: {str(e)}")
    
    # F3: Tenant B GET /api/forms should return empty
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/forms")
        data = resp.json()
        forms = data.get("forms", [])
        has_zero_forms = len(forms) == 0
        
        log_test("F3: Tenant B GET /api/forms returns 0 forms (isolation)", 
                resp.status_code == 200 and has_zero_forms,
                f"Status: {resp.status_code}, Forms count: {len(forms)} (MUST be 0)")
        
        if not has_zero_forms:
            print(f"   🚨 SECURITY ISSUE: Tenant B can see {len(forms)} forms from other tenants!")
    except Exception as e:
        log_test("F3: Tenant B forms isolation", False, f"Exception: {str(e)}")
    
    # F4: Tenant B try to access demo's lead
    if demo_lead_id:
        try:
            resp = tenant_b_session.get(f"{BASE_URL}/api/leads/{demo_lead_id}")
            is_404 = resp.status_code == 404
            
            log_test("F4: Tenant B cannot access demo's lead (returns 404)", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can access demo's lead! Status: {resp.status_code}")
        except Exception as e:
            log_test("F4: Tenant B lead access isolation", False, f"Exception: {str(e)}")
    else:
        log_test("F4: Tenant B lead access isolation", False, "Skipped - no demo lead ID")
    
    # F5: Tenant B try to move demo's lead
    if demo_lead_id:
        try:
            resp = tenant_b_session.post(f"{BASE_URL}/api/leads/{demo_lead_id}/move", json={
                "stageId": "any-stage-id"
            })
            is_404 = resp.status_code == 404
            
            log_test("F5: Tenant B cannot move demo's lead (returns 404)", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can move demo's lead! Status: {resp.status_code}")
        except Exception as e:
            log_test("F5: Tenant B lead move isolation", False, f"Exception: {str(e)}")
    else:
        log_test("F5: Tenant B lead move isolation", False, "Skipped - no demo lead ID")
    
    # F6: Tenant B has its own pipeline
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/pipelines")
        data = resp.json()
        pipelines = data.get("pipelines", [])
        
        has_pipeline = len(pipelines) > 0
        has_7_stages = False
        
        if pipelines:
            stages = pipelines[0].get("stages", [])
            has_7_stages = len(stages) == 7
        
        log_test("F6: Tenant B has its own default pipeline with 7 stages", 
                resp.status_code == 200 and has_pipeline and has_7_stages,
                f"Status: {resp.status_code}, Pipelines: {len(pipelines)}, Stages: {len(stages) if pipelines else 0}")
    except Exception as e:
        log_test("F6: Tenant B pipeline isolation", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*60)
    print("  LeadFlow CRM Backend API Test Suite")
    print("  Base URL:", BASE_URL)
    print("="*60)
    
    try:
        # Run all test suites
        demo_session = test_auth()
        test_forms(demo_session)
        test_public_forms()
        test_leads(demo_session)
        test_dashboard(demo_session)
        test_multi_tenant_isolation(demo_session)
        
        # Print summary
        print("\n" + "="*60)
        print("  TEST SUMMARY")
        print("="*60)
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
        
        print("\n" + "="*60)
        
        # Check for critical security issues
        security_tests = [t for t in test_results['tests'] if t['name'].startswith('F')]
        security_failures = [t for t in security_tests if not t['passed']]
        
        if security_failures:
            print("\n🚨 CRITICAL SECURITY ISSUES DETECTED!")
            print("   Multi-tenant isolation is NOT working properly!")
            for test in security_failures:
                print(f"   - {test['name']}")
        else:
            print("\n✅ Multi-tenant isolation is working correctly!")
        
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
