#!/usr/bin/env python3
"""
Phase 8 — FlipForm Platform Admin + Tenant Lifecycle + Form Branding — Backend Testing
Tests platform admin auth, tenant status management, plan changes, and form branding features.
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Base URL from .env
BASE_URL = "https://lead-capture-hub-45.preview.emergentagent.com/api"

# Test credentials
PLATFORM_ADMIN_EMAIL = "admin@flipform.com.br"
PLATFORM_ADMIN_PASSWORD = "flipform2025"
DEMO_EMAIL = "demo@leadflow.com"
DEMO_PASSWORD = "demo123"

# Test state
passed = 0
failed = 0
test_results = []

def log_test(name, success, details=""):
    global passed, failed
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"  Details: {details}")
    test_results.append({"name": name, "success": success, "details": details})
    if success:
        passed += 1
    else:
        failed += 1

def print_summary():
    print("\n" + "="*80)
    print(f"PHASE 8 PLATFORM ADMIN TEST SUMMARY")
    print("="*80)
    print(f"Total: {passed + failed} | Passed: {passed} | Failed: {failed}")
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for t in test_results:
            if not t["success"]:
                print(f"  - {t['name']}")
                if t["details"]:
                    print(f"    {t['details']}")
    else:
        print("\n✅ ALL TESTS PASSED!")
    print("="*80)

def main():
    global passed, failed
    
    print("="*80)
    print("PHASE 8 — FLIPFORM PLATFORM ADMIN + TENANT LIFECYCLE + FORM BRANDING")
    print("="*80)
    
    # Sessions
    admin_session = requests.Session()
    demo_session = requests.Session()
    
    # Store tenant IDs
    demo_tenant_id = None
    demo_form_id = None
    demo_form_slug = None
    pro_plan_id = None
    
    try:
        # ========================================================================
        # A. AUTH PLATFORM ADMIN
        # ========================================================================
        print("\n[A] AUTH PLATFORM ADMIN")
        print("-" * 80)
        
        # A1: Without cookie: GET /api/admin/overview → 401
        try:
            resp = requests.get(f"{BASE_URL}/admin/overview")
            log_test("A1: GET /api/admin/overview without auth → 401",
                    resp.status_code == 401,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("A1: GET /api/admin/overview without auth → 401", False, str(e))
        
        # A2: POST /api/auth/login with platform admin → 200, platformAdmin: true
        try:
            resp = admin_session.post(f"{BASE_URL}/auth/login", json={
                "email": PLATFORM_ADMIN_EMAIL,
                "password": PLATFORM_ADMIN_PASSWORD
            })
            data = resp.json() if resp.status_code == 200 else {}
            has_cookie = "flipform_token" in admin_session.cookies or "leadflow_token" in admin_session.cookies
            is_platform_admin = data.get("platformAdmin") == True
            log_test("A2: Login as platform admin → 200, platformAdmin: true",
                    resp.status_code == 200 and is_platform_admin and has_cookie,
                    f"Status: {resp.status_code}, platformAdmin: {data.get('platformAdmin')}, Cookie: {has_cookie}")
        except Exception as e:
            log_test("A2: Login as platform admin → 200, platformAdmin: true", False, str(e))
        
        # A3: GET /api/admin/overview as platform admin → 200
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/overview")
            data = resp.json() if resp.status_code == 200 else {}
            has_tenants = "tenants" in data and isinstance(data["tenants"], dict)
            has_mrr = "mrr" in data
            has_recent = "recentTenants" in data and isinstance(data["recentTenants"], list)
            log_test("A3: GET /api/admin/overview as platform admin → 200",
                    resp.status_code == 200 and has_tenants and has_mrr and has_recent,
                    f"Status: {resp.status_code}, Keys: {list(data.keys()) if data else []}")
        except Exception as e:
            log_test("A3: GET /api/admin/overview as platform admin → 200", False, str(e))
        
        # A4: GET /api/admin/tenants as platform admin → 200
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/tenants")
            data = resp.json() if resp.status_code == 200 else {}
            tenants = data.get("tenants", [])
            log_test("A4: GET /api/admin/tenants as platform admin → 200",
                    resp.status_code == 200 and isinstance(tenants, list),
                    f"Status: {resp.status_code}, Tenants count: {len(tenants)}")
        except Exception as e:
            log_test("A4: GET /api/admin/tenants as platform admin → 200", False, str(e))
        
        # A5: GET /api/admin/plans as platform admin → 200
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/plans")
            data = resp.json() if resp.status_code == 200 else {}
            plans = data.get("plans", [])
            has_min_plans = len(plans) >= 4
            log_test("A5: GET /api/admin/plans as platform admin → 200, >= 4 plans",
                    resp.status_code == 200 and has_min_plans,
                    f"Status: {resp.status_code}, Plans count: {len(plans)}")
            # Store Pro plan ID for later
            for plan in plans:
                if plan.get("name") == "Pro":
                    pro_plan_id = plan.get("id")
        except Exception as e:
            log_test("A5: GET /api/admin/plans as platform admin → 200, >= 4 plans", False, str(e))
        
        # A6: GET /api/admin/audit as platform admin → 200
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/audit")
            data = resp.json() if resp.status_code == 200 else {}
            logs = data.get("logs", [])
            log_test("A6: GET /api/admin/audit as platform admin → 200",
                    resp.status_code == 200 and isinstance(logs, list),
                    f"Status: {resp.status_code}, Logs count: {len(logs)}")
        except Exception as e:
            log_test("A6: GET /api/admin/audit as platform admin → 200", False, str(e))
        
        # ========================================================================
        # B. RBAC: REGULAR USER CANNOT ACCESS ADMIN
        # ========================================================================
        print("\n[B] RBAC: REGULAR USER CANNOT ACCESS ADMIN")
        print("-" * 80)
        
        # B1: Login as demo (tenant owner)
        try:
            resp = demo_session.post(f"{BASE_URL}/auth/login", json={
                "email": DEMO_EMAIL,
                "password": DEMO_PASSWORD
            })
            has_cookie = "flipform_token" in demo_session.cookies or "leadflow_token" in demo_session.cookies
            log_test("B1: Login as demo (tenant owner) → 200",
                    resp.status_code == 200 and has_cookie,
                    f"Status: {resp.status_code}, Cookie: {has_cookie}")
        except Exception as e:
            log_test("B1: Login as demo (tenant owner) → 200", False, str(e))
        
        # B2: GET /api/admin/overview as demo → 403
        try:
            resp = demo_session.get(f"{BASE_URL}/admin/overview")
            data = resp.json() if resp.status_code == 403 else {}
            log_test("B2: GET /api/admin/overview as demo → 403",
                    resp.status_code == 403,
                    f"Status: {resp.status_code}, Message: {data.get('error', '')}")
        except Exception as e:
            log_test("B2: GET /api/admin/overview as demo → 403", False, str(e))
        
        # B3: GET /api/admin/tenants as demo → 403
        try:
            resp = demo_session.get(f"{BASE_URL}/admin/tenants")
            log_test("B3: GET /api/admin/tenants as demo → 403",
                    resp.status_code == 403,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("B3: GET /api/admin/tenants as demo → 403", False, str(e))
        
        # B4: PUT /api/admin/tenants/<any>/status as demo → 403
        try:
            resp = demo_session.put(f"{BASE_URL}/admin/tenants/fake-id/status", json={"status": "active"})
            log_test("B4: PUT /api/admin/tenants/<any>/status as demo → 403",
                    resp.status_code == 403,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("B4: PUT /api/admin/tenants/<any>/status as demo → 403", False, str(e))
        
        # ========================================================================
        # C. TENANT LIFECYCLE — SUSPEND/BLOCK/REACTIVATE
        # ========================================================================
        print("\n[C] TENANT LIFECYCLE — SUSPEND/BLOCK/REACTIVATE")
        print("-" * 80)
        
        # C1: Get demo tenant ID via /api/admin/tenants?q=leadflow-demo
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/tenants?q=leadflow-demo")
            data = resp.json() if resp.status_code == 200 else {}
            tenants = data.get("tenants", [])
            if tenants:
                demo_tenant_id = tenants[0].get("id")
                log_test("C1: Get demo tenant ID via /api/admin/tenants?q=leadflow-demo",
                        demo_tenant_id is not None,
                        f"Demo tenant ID: {demo_tenant_id}")
            else:
                log_test("C1: Get demo tenant ID via /api/admin/tenants?q=leadflow-demo", False, "No tenants found")
        except Exception as e:
            log_test("C1: Get demo tenant ID via /api/admin/tenants?q=leadflow-demo", False, str(e))
        
        if not demo_tenant_id:
            print("⚠️  Cannot continue with tenant lifecycle tests without demo_tenant_id")
            print_summary()
            return
        
        # C2: PUT /api/admin/tenants/<demo_id>/status with status=suspended → 200
        try:
            resp = admin_session.put(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/status", json={
                "status": "suspended",
                "reason": "Phase 8 testing - suspend"
            })
            data = resp.json() if resp.status_code == 200 else {}
            log_test("C2: PUT /api/admin/tenants/<demo_id>/status with status=suspended → 200",
                    resp.status_code == 200,
                    f"Status: {resp.status_code}, Tenant status: {data.get('tenant', {}).get('status')}")
        except Exception as e:
            log_test("C2: PUT /api/admin/tenants/<demo_id>/status with status=suspended → 200", False, str(e))
        
        # C3: GET /api/admin/audit contains platform.tenant_suspended
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/audit")
            data = resp.json() if resp.status_code == 200 else {}
            logs = data.get("logs", [])
            has_suspend_log = any(log.get("action") == "platform.tenant_suspended" for log in logs)
            log_test("C3: GET /api/admin/audit contains platform.tenant_suspended",
                    has_suspend_log,
                    f"Found suspend log: {has_suspend_log}")
        except Exception as e:
            log_test("C3: GET /api/admin/audit contains platform.tenant_suspended", False, str(e))
        
        # C4: GET /api/admin/tenants/<demo_id> → tenant.statusHistory has new entry
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/tenants/{demo_tenant_id}")
            data = resp.json() if resp.status_code == 200 else {}
            tenant = data.get("tenant", {})
            status_history = tenant.get("statusHistory", [])
            log_test("C4: GET /api/admin/tenants/<demo_id> → statusHistory has entries",
                    len(status_history) > 0,
                    f"Status history count: {len(status_history)}")
        except Exception as e:
            log_test("C4: GET /api/admin/tenants/<demo_id> → statusHistory has entries", False, str(e))
        
        # C5: Try login as demo → 403 with code: tenant_blocked
        try:
            new_session = requests.Session()
            resp = new_session.post(f"{BASE_URL}/auth/login", json={
                "email": DEMO_EMAIL,
                "password": DEMO_PASSWORD
            })
            data = resp.json() if resp.status_code == 403 else {}
            has_blocked_code = data.get("code") == "tenant_blocked"
            log_test("C5: Login as demo after suspend → 403 with code=tenant_blocked",
                    resp.status_code == 403 and has_blocked_code,
                    f"Status: {resp.status_code}, Code: {data.get('code')}")
        except Exception as e:
            log_test("C5: Login as demo after suspend → 403 with code=tenant_blocked", False, str(e))
        
        # C6: Reuse old demo cookie: GET /api/leads → 403 code=tenant_blocked
        try:
            resp = demo_session.get(f"{BASE_URL}/leads")
            data = resp.json() if resp.status_code == 403 else {}
            has_blocked_code = data.get("code") == "tenant_blocked"
            log_test("C6: GET /api/leads with old demo cookie → 403 code=tenant_blocked",
                    resp.status_code == 403 and has_blocked_code,
                    f"Status: {resp.status_code}, Code: {data.get('code')}")
        except Exception as e:
            log_test("C6: GET /api/leads with old demo cookie → 403 code=tenant_blocked", False, str(e))
        
        # C7: GET /api/public/forms/turbinar-comercial → 410 (tenant suspended)
        try:
            resp = requests.get(f"{BASE_URL}/public/forms/turbinar-comercial")
            log_test("C7: GET /api/public/forms/turbinar-comercial → 410 (tenant suspended)",
                    resp.status_code == 410,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("C7: GET /api/public/forms/turbinar-comercial → 410 (tenant suspended)", False, str(e))
        
        # C8: POST /api/public/forms/turbinar-comercial/submit → 410
        try:
            # Get form to find field IDs
            resp_form = requests.get(f"{BASE_URL}/public/forms/turbinar-comercial")
            form_data = resp_form.json() if resp_form.status_code == 200 else {}
            form_fields = form_data.get("form", {}).get("fields", [])
            
            # Build answers array with actual field IDs
            answers = []
            for field in form_fields[:2]:  # Use first 2 fields
                answers.append({
                    "fieldId": field.get("id"),
                    "value": "Test Value"
                })
            
            resp = requests.post(f"{BASE_URL}/public/forms/turbinar-comercial/submit", json={
                "answers": answers
            })
            data = resp.json() if resp.status_code != 410 else {}
            log_test("C8: POST /api/public/forms/turbinar-comercial/submit → 410",
                    resp.status_code == 410,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("C8: POST /api/public/forms/turbinar-comercial/submit → 410", False, str(e))
        
        # C9: PUT /api/admin/tenants/<demo_id>/status with status=active → 200
        try:
            resp = admin_session.put(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/status", json={
                "status": "active"
            })
            data = resp.json() if resp.status_code == 200 else {}
            log_test("C9: PUT /api/admin/tenants/<demo_id>/status with status=active → 200",
                    resp.status_code == 200,
                    f"Status: {resp.status_code}, Tenant status: {data.get('tenant', {}).get('status')}")
        except Exception as e:
            log_test("C9: PUT /api/admin/tenants/<demo_id>/status with status=active → 200", False, str(e))
        
        # C10: After reactivate: login demo → 200; GET /api/leads → 200; GET /api/public/forms/turbinar-comercial → 200
        try:
            # Fresh login
            demo_session = requests.Session()
            resp = demo_session.post(f"{BASE_URL}/auth/login", json={
                "email": DEMO_EMAIL,
                "password": DEMO_PASSWORD
            })
            login_ok = resp.status_code == 200
            
            # GET /api/leads
            resp_leads = demo_session.get(f"{BASE_URL}/leads")
            leads_ok = resp_leads.status_code == 200
            
            # GET /api/public/forms/turbinar-comercial
            resp_form = requests.get(f"{BASE_URL}/public/forms/turbinar-comercial")
            form_ok = resp_form.status_code == 200
            
            log_test("C10: After reactivate: login → 200, GET /api/leads → 200, GET public form → 200",
                    login_ok and leads_ok and form_ok,
                    f"Login: {login_ok}, Leads: {leads_ok}, Form: {form_ok}")
        except Exception as e:
            log_test("C10: After reactivate: login → 200, GET /api/leads → 200, GET public form → 200", False, str(e))
        
        # ========================================================================
        # D. PLAN MANAGEMENT
        # ========================================================================
        print("\n[D] PLAN MANAGEMENT")
        print("-" * 80)
        
        # D1: GET /api/admin/plans → get Pro plan ID
        if not pro_plan_id:
            try:
                resp = admin_session.get(f"{BASE_URL}/admin/plans")
                data = resp.json() if resp.status_code == 200 else {}
                plans = data.get("plans", [])
                for plan in plans:
                    if plan.get("name") == "Pro":
                        pro_plan_id = plan.get("id")
                log_test("D1: GET /api/admin/plans → get Pro plan ID",
                        pro_plan_id is not None,
                        f"Pro plan ID: {pro_plan_id}")
            except Exception as e:
                log_test("D1: GET /api/admin/plans → get Pro plan ID", False, str(e))
        else:
            log_test("D1: GET /api/admin/plans → get Pro plan ID (cached)", True, f"Pro plan ID: {pro_plan_id}")
        
        # D2: PUT /api/admin/tenants/<demo_id>/plan with Pro plan
        if pro_plan_id:
            try:
                # Use ISO format with timezone offset
                next_due = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
                resp = admin_session.put(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/plan", json={
                    "planId": pro_plan_id,
                    "nextDueDate": next_due,
                    "internalNotes": "Phase 8 testing - plan change"
                })
                data = resp.json() if resp.status_code != 200 else {}
                log_test("D2: PUT /api/admin/tenants/<demo_id>/plan with Pro plan → 200",
                        resp.status_code == 200,
                        f"Status: {resp.status_code}, Error: {data.get('error', '')}")
            except Exception as e:
                log_test("D2: PUT /api/admin/tenants/<demo_id>/plan with Pro plan → 200", False, str(e))
        else:
            log_test("D2: PUT /api/admin/tenants/<demo_id>/plan with Pro plan → 200", False, "Pro plan ID not found")
        
        # D3: GET /api/admin/tenants/<demo_id> → tenant.planId === pro_id, plan.name === "Pro"
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/tenants/{demo_tenant_id}")
            data = resp.json() if resp.status_code == 200 else {}
            tenant = data.get("tenant", {})
            plan = tenant.get("plan", {})
            plan_id_match = tenant.get("planId") == pro_plan_id
            plan_name_match = plan.get("name") == "Pro"
            log_test("D3: GET /api/admin/tenants/<demo_id> → planId=Pro, plan.name=Pro",
                    plan_id_match and plan_name_match,
                    f"PlanId match: {plan_id_match}, Plan name: {plan.get('name')}")
        except Exception as e:
            log_test("D3: GET /api/admin/tenants/<demo_id> → planId=Pro, plan.name=Pro", False, str(e))
        
        # D4: Audit log platform.tenant_plan_changed registered
        try:
            resp = admin_session.get(f"{BASE_URL}/admin/audit")
            data = resp.json() if resp.status_code == 200 else {}
            logs = data.get("logs", [])
            has_plan_change_log = any(log.get("action") == "platform.tenant_plan_changed" for log in logs)
            log_test("D4: Audit log platform.tenant_plan_changed registered",
                    has_plan_change_log,
                    f"Found plan change log: {has_plan_change_log}")
        except Exception as e:
            log_test("D4: Audit log platform.tenant_plan_changed registered", False, str(e))
        
        # D5: PUT with invalid planId → 400
        try:
            resp = admin_session.put(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/plan", json={
                "planId": "00000000-0000-0000-0000-000000000000"
            })
            data = resp.json() if resp.status_code == 400 else {}
            log_test("D5: PUT with invalid planId → 400",
                    resp.status_code == 400,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("D5: PUT with invalid planId → 400", False, str(e))
        
        # ========================================================================
        # E. FORM BRANDING (PHASE 8)
        # ========================================================================
        print("\n[E] FORM BRANDING (PHASE 8)")
        print("-" * 80)
        
        # E1: Create form with branding fields
        try:
            resp = demo_session.post(f"{BASE_URL}/forms", json={
                "name": "Form Branding Test",
                "publicTitle": "Form Branding Test Public",
                "fields": [{"label": "Name", "fieldType": "short_text", "isRequired": True, "orderIndex": 0}],
                "bgColor": "#fef3c7",
                "buttonColor": "#ea580c",
                "textColor": "#7c2d12",
                "theme": "dark",
                "coverImageUrl": "https://example.com/cover.png"
            })
            data = resp.json() if resp.status_code == 200 else {}
            # Check if response has 'form' key or if the form data is at root level
            if "form" in data:
                form = data["form"]
            else:
                form = data
            demo_form_id = form.get("id")
            demo_form_slug = form.get("slug")
            log_test("E1: Create form with branding fields → 200",
                    resp.status_code == 200 and demo_form_id is not None,
                    f"Status: {resp.status_code}, Form ID: {demo_form_id}, Slug: {demo_form_slug}, Response keys: {list(data.keys())}")
        except Exception as e:
            log_test("E1: Create form with branding fields → 200", False, str(e))
        
        # E2: GET /api/public/forms/<slug> → returns all branding fields
        if demo_form_slug:
            try:
                resp = requests.get(f"{BASE_URL}/public/forms/{demo_form_slug}")
                data = resp.json() if resp.status_code == 200 else {}
                form = data.get("form", {})
                has_bg = form.get("bgColor") == "#fef3c7"
                has_button = form.get("buttonColor") == "#ea580c"
                has_text = form.get("textColor") == "#7c2d12"
                has_theme = form.get("theme") == "dark"
                has_cover = form.get("coverImageUrl") == "https://example.com/cover.png"
                log_test("E2: GET /api/public/forms/<slug> → returns all branding fields",
                        resp.status_code == 200 and has_bg and has_button and has_text and has_theme and has_cover,
                        f"Status: {resp.status_code}, bgColor: {has_bg}, buttonColor: {has_button}, textColor: {has_text}, theme: {has_theme}, coverImageUrl: {has_cover}")
            except Exception as e:
                log_test("E2: GET /api/public/forms/<slug> → returns all branding fields", False, str(e))
        else:
            log_test("E2: GET /api/public/forms/<slug> → returns all branding fields", False, "Form slug not found")
        
        # E3: PUT /api/forms/<id> changing bgColor to null → 200
        if demo_form_id:
            try:
                # First GET the form to get current values
                resp_current = demo_session.get(f"{BASE_URL}/forms/{demo_form_id}")
                current_form = resp_current.json().get("form", {}) if resp_current.status_code == 200 else {}
                
                # Update with bgColor set to null, keeping other required fields
                resp = demo_session.put(f"{BASE_URL}/forms/{demo_form_id}", json={
                    "name": current_form.get("name"),
                    "publicTitle": current_form.get("publicTitle"),
                    "fields": [{"label": "Name", "fieldType": "short_text", "isRequired": True, "orderIndex": 0}],
                    "bgColor": None
                })
                data = resp.json() if resp.status_code != 200 else {}
                
                # Verify with GET
                resp_get = requests.get(f"{BASE_URL}/public/forms/{demo_form_slug}")
                data_get = resp_get.json() if resp_get.status_code == 200 else {}
                form_get = data_get.get("form", {})
                bg_is_null = form_get.get("bgColor") is None
                
                log_test("E3: PUT /api/forms/<id> changing bgColor to null → 200, GET confirms null",
                        resp.status_code == 200 and bg_is_null,
                        f"PUT Status: {resp.status_code}, PUT Error: {data.get('error', '')}, GET bgColor is null: {bg_is_null}")
            except Exception as e:
                log_test("E3: PUT /api/forms/<id> changing bgColor to null → 200, GET confirms null", False, str(e))
        else:
            log_test("E3: PUT /api/forms/<id> changing bgColor to null → 200, GET confirms null", False, "Form ID not found")
        
        # ========================================================================
        # F. VALIDATIONS
        # ========================================================================
        print("\n[F] VALIDATIONS")
        print("-" * 80)
        
        # F1: PUT /api/admin/tenants/<demo_id>/status with invalid status → 400
        try:
            resp = admin_session.put(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/status", json={
                "status": "invalid_status"
            })
            data = resp.json() if resp.status_code == 400 else {}
            log_test("F1: PUT with invalid status → 400",
                    resp.status_code == 400,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("F1: PUT with invalid status → 400", False, str(e))
        
        # F2: PUT /api/admin/tenants/<random_uuid>/status → 404
        try:
            resp = admin_session.put(f"{BASE_URL}/admin/tenants/00000000-0000-0000-0000-000000000000/status", json={
                "status": "active"
            })
            data = resp.json() if resp.status_code == 404 else {}
            log_test("F2: PUT with random UUID → 404",
                    resp.status_code == 404,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("F2: PUT with random UUID → 404", False, str(e))
        
        # F3: PUT /api/admin/tenants/<demo_id>/status with same status → 200 {unchanged: true}
        try:
            # Get current status first
            resp_get = admin_session.get(f"{BASE_URL}/admin/tenants/{demo_tenant_id}")
            data_get = resp_get.json() if resp_get.status_code == 200 else {}
            current_status = data_get.get("tenant", {}).get("status")
            
            # Try to set same status
            resp = admin_session.put(f"{BASE_URL}/admin/tenants/{demo_tenant_id}/status", json={
                "status": current_status
            })
            data = resp.json() if resp.status_code == 200 else {}
            is_unchanged = data.get("unchanged") == True
            log_test("F3: PUT with same status → 200 {unchanged: true}",
                    resp.status_code == 200 and is_unchanged,
                    f"Status: {resp.status_code}, Unchanged: {is_unchanged}")
        except Exception as e:
            log_test("F3: PUT with same status → 200 {unchanged: true}", False, str(e))
        
        # Cleanup: Delete test form
        if demo_form_id:
            try:
                demo_session.delete(f"{BASE_URL}/forms/{demo_form_id}")
                print(f"\n✓ Cleanup: Deleted test form {demo_form_id}")
            except:
                pass
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    print_summary()
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
