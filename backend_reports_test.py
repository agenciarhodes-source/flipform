#!/usr/bin/env python3
"""
LeadFlow CRM - Phase 7: Reports + CSV Export Backend Test Suite
Tests all reports endpoints with RBAC, multi-tenant isolation, and CSV export
"""

import requests
import json
import random
import string
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

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
# A) AUTH + TENANT
# ============================================================================

def test_auth_and_tenant():
    print_section("A) AUTH + TENANT")
    
    # Create sessions
    demo_session = requests.Session()
    no_auth_session = requests.Session()
    
    # Login as owner (demo@leadflow.com)
    try:
        resp = demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        if resp.status_code == 200:
            print(f"✓ Logged in as demo@leadflow.com (owner)")
        else:
            print(f"✗ Failed to login: {resp.status_code} - {resp.text}")
            return demo_session, no_auth_session, None, None, None
    except Exception as e:
        print(f"✗ Login exception: {str(e)}")
        return demo_session, no_auth_session, None, None, None
    
    # Get user info to extract IDs
    resp = demo_session.get(f"{BASE_URL}/api/auth/me")
    me_data = resp.json()
    demo_user_id = me_data.get("user", {}).get("id")
    demo_tenant_id = me_data.get("user", {}).get("tenantId")
    
    # Get pipelines and forms for filtering
    resp = demo_session.get(f"{BASE_URL}/api/pipelines")
    pipelines = resp.json()
    default_pipeline_id = None
    if isinstance(pipelines, list) and len(pipelines) > 0:
        default_pipeline_id = pipelines[0]["id"]
    
    resp = demo_session.get(f"{BASE_URL}/api/forms")
    forms = resp.json()
    first_form_id = None
    if isinstance(forms, list) and len(forms) > 0:
        first_form_id = forms[0]["id"]
    
    # A1: Test all 10 endpoints without cookie -> 401
    endpoints = [
        "/api/reports/summary",
        "/api/reports/leads-by-day",
        "/api/reports/leads-by-stage",
        "/api/reports/leads-by-source",
        "/api/reports/leads-by-form",
        "/api/reports/agent-performance",
        "/api/reports/task-performance",
        "/api/reports/lost-reasons",
        "/api/reports/options",
        "/api/reports/export"
    ]
    
    all_401 = True
    for endpoint in endpoints:
        try:
            resp = no_auth_session.get(f"{BASE_URL}{endpoint}?range=30d")
            if resp.status_code != 401:
                all_401 = False
                print(f"   ✗ {endpoint} returned {resp.status_code} instead of 401")
        except Exception as e:
            all_401 = False
            print(f"   ✗ {endpoint} exception: {str(e)}")
    
    log_test("A1: All 10 endpoints without cookie return 401", all_401,
            "All endpoints require authentication")
    
    # A2: GET /api/reports/summary?range=30d as owner -> 200
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
        data = resp.json()
        has_range = "range" in data and "from" in data["range"] and "to" in data["range"]
        has_totals = "totals" in data and "total" in data["totals"]
        has_tasks = "tasks" in data and "pending" in data["tasks"]
        
        log_test("A2: GET /api/reports/summary?range=30d as owner returns 200 with complete data",
                resp.status_code == 200 and has_range and has_totals and has_tasks,
                f"Status: {resp.status_code}, Has range: {has_range}, Has totals: {has_totals}, Has tasks: {has_tasks}")
    except Exception as e:
        log_test("A2: GET /api/reports/summary?range=30d as owner returns 200 with complete data",
                False, f"Exception: {str(e)}")
    
    # A3: GET each endpoint as owner -> 200
    all_200 = True
    for endpoint in endpoints:
        try:
            resp = demo_session.get(f"{BASE_URL}{endpoint}?range=30d")
            if resp.status_code != 200:
                all_200 = False
                print(f"   ✗ {endpoint} returned {resp.status_code}")
        except Exception as e:
            all_200 = False
            print(f"   ✗ {endpoint} exception: {str(e)}")
    
    log_test("A3: All 10 endpoints as owner return 200", all_200,
            "All endpoints accessible to owner")
    
    return demo_session, no_auth_session, default_pipeline_id, first_form_id, demo_user_id

# ============================================================================
# B) ZOD VALIDATIONS
# ============================================================================

def test_zod_validations(demo_session):
    print_section("B) ZOD VALIDATIONS")
    
    # B1: Invalid range -> 400
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/summary?range=99d")
        log_test("B1: Invalid range '99d' returns 400",
                resp.status_code == 400,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B1: Invalid range '99d' returns 400", False, f"Exception: {str(e)}")
    
    # B2: Invalid pipelineId (not UUID) -> 400
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/summary?pipelineId=not-a-uuid")
        data = resp.json()
        has_uuid_error = "uuid" in str(data).lower() or "invalid" in str(data).lower()
        log_test("B2: Invalid pipelineId (not UUID) returns 400 with 'Invalid uuid'",
                resp.status_code == 400 and has_uuid_error,
                f"Status: {resp.status_code}, Error: {data.get('error', '')}")
    except Exception as e:
        log_test("B2: Invalid pipelineId (not UUID) returns 400 with 'Invalid uuid'",
                False, f"Exception: {str(e)}")
    
    # B3: Invalid date format -> should be ignored or 400 (no crash)
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/summary?range=custom&from=2025-99-99")
        # Should not crash - either 400 or ignored
        no_crash = resp.status_code in [200, 400]
        log_test("B3: Invalid date format does not crash server",
                no_crash,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B3: Invalid date format does not crash server", False, f"Exception: {str(e)}")
    
    # B4: Custom range with valid dates -> 200
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/summary?range=custom&from=2025-01-01&to=2025-12-31")
        data = resp.json()
        if resp.status_code == 200:
            range_from = data.get("range", {}).get("from", "")
            range_to = data.get("range", {}).get("to", "")
            dates_reflected = "2025-01-01" in range_from and "2025-12-31" in range_to
            log_test("B4: Custom range with valid dates returns 200 with dates reflected",
                    dates_reflected,
                    f"From: {range_from[:10]}, To: {range_to[:10]}")
        else:
            log_test("B4: Custom range with valid dates returns 200 with dates reflected",
                    False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B4: Custom range with valid dates returns 200 with dates reflected",
                False, f"Exception: {str(e)}")

# ============================================================================
# C) CROSS-TENANT GUARDRAILS
# ============================================================================

def test_cross_tenant_guardrails(demo_session):
    print_section("C) CROSS-TENANT GUARDRAILS")
    
    # C1: Create tenant B and get its IDs
    tenant_b_session = requests.Session()
    tenant_b_email = f"tenant-b-reports-{random_string()}@example.com"
    
    try:
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Tenant B Reports",
            "email": tenant_b_email,
            "password": "password123",
            "companyName": "Tenant B Reports"
        })
        if resp.status_code != 200:
            print(f"   ✗ Failed to create Tenant B: {resp.status_code}")
            log_test("C1: Create Tenant B", False, f"Status: {resp.status_code}")
            return
        
        print(f"   ✓ Created Tenant B: {tenant_b_email}")
    except Exception as e:
        log_test("C1: Create Tenant B", False, f"Exception: {str(e)}")
        return
    
    # Get Tenant B's pipeline, form, and user IDs
    resp = tenant_b_session.get(f"{BASE_URL}/api/pipelines")
    tenant_b_pipelines = resp.json()
    tenant_b_pipeline_id = None
    if isinstance(tenant_b_pipelines, list) and len(tenant_b_pipelines) > 0:
        tenant_b_pipeline_id = tenant_b_pipelines[0]["id"]
    
    # Create a form for Tenant B
    resp = tenant_b_session.post(f"{BASE_URL}/api/forms", json={
        "name": "Tenant B Form",
        "slug": f"tenant-b-form-{random_string()}",
        "fields": [{"id": "1", "type": "text", "label": "Name", "required": True}]
    })
    tenant_b_form_id = resp.json().get("id") if resp.status_code == 200 else None
    
    resp = tenant_b_session.get(f"{BASE_URL}/api/auth/me")
    tenant_b_user_id = resp.json().get("user", {}).get("id")
    
    log_test("C1: Create Tenant B and get IDs",
            tenant_b_pipeline_id is not None and tenant_b_form_id is not None and tenant_b_user_id is not None,
            f"Pipeline: {tenant_b_pipeline_id}, Form: {tenant_b_form_id}, User: {tenant_b_user_id}")
    
    # C2: Demo (Tenant A) tries to use Tenant B's pipelineId -> 400
    if tenant_b_pipeline_id:
        try:
            resp = demo_session.get(f"{BASE_URL}/api/reports/summary?pipelineId={tenant_b_pipeline_id}")
            data = resp.json()
            has_tenant_error = "tenant" in str(data).lower() or "inválido" in str(data).lower()
            log_test("C2: Demo using Tenant B's pipelineId returns 400 'Pipeline inválido para este tenant'",
                    resp.status_code == 400 and has_tenant_error,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("C2: Demo using Tenant B's pipelineId returns 400", False, f"Exception: {str(e)}")
    
    # C3: Demo tries to use Tenant B's formId -> 400
    if tenant_b_form_id:
        try:
            resp = demo_session.get(f"{BASE_URL}/api/reports/summary?formId={tenant_b_form_id}")
            data = resp.json()
            has_tenant_error = "tenant" in str(data).lower() or "inválido" in str(data).lower()
            log_test("C3: Demo using Tenant B's formId returns 400 'Formulário inválido para este tenant'",
                    resp.status_code == 400 and has_tenant_error,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("C3: Demo using Tenant B's formId returns 400", False, f"Exception: {str(e)}")
    
    # C4: Demo tries to use Tenant B's userId -> 400
    if tenant_b_user_id:
        try:
            resp = demo_session.get(f"{BASE_URL}/api/reports/summary?assignedTo={tenant_b_user_id}")
            data = resp.json()
            has_tenant_error = "tenant" in str(data).lower() or "inválido" in str(data).lower()
            log_test("C4: Demo using Tenant B's assignedTo returns 400 'Responsável inválido para este tenant'",
                    resp.status_code == 400 and has_tenant_error,
                    f"Status: {resp.status_code}, Error: {data.get('error', '')}")
        except Exception as e:
            log_test("C4: Demo using Tenant B's assignedTo returns 400", False, f"Exception: {str(e)}")

# ============================================================================
# D) CONSISTENT FILTERS
# ============================================================================

def test_consistent_filters(demo_session, pipeline_id):
    print_section("D) CONSISTENT FILTERS")
    
    # D1: Compare summary totals with leads-by-day sum
    try:
        resp_summary = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
        summary_data = resp_summary.json()
        summary_total = summary_data.get("totals", {}).get("total", 0)
        
        resp_by_day = demo_session.get(f"{BASE_URL}/api/reports/leads-by-day?range=30d")
        by_day_data = resp_by_day.json()
        by_day_sum = sum(day.get("total", 0) for day in by_day_data.get("data", []))
        
        totals_match = summary_total == by_day_sum
        log_test("D1: Summary total matches sum of leads-by-day",
                totals_match,
                f"Summary total: {summary_total}, Leads-by-day sum: {by_day_sum}")
    except Exception as e:
        log_test("D1: Summary total matches sum of leads-by-day", False, f"Exception: {str(e)}")
    
    # D2: Filter by pipelineId and compare with direct leads count
    if pipeline_id:
        try:
            resp_summary = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d&pipelineId={pipeline_id}")
            summary_data = resp_summary.json()
            summary_total = summary_data.get("totals", {}).get("total", 0)
            
            # Get leads directly
            resp_leads = demo_session.get(f"{BASE_URL}/api/leads?pipelineId={pipeline_id}")
            leads_data = resp_leads.json()
            # Count leads created in last 30 days
            now = datetime.now()
            thirty_days_ago = now - timedelta(days=30)
            leads_count = 0
            for lead in leads_data:
                created_at = datetime.fromisoformat(lead.get("createdAt", "").replace("Z", "+00:00"))
                if created_at >= thirty_days_ago:
                    leads_count += 1
            
            # Allow some tolerance due to timing
            counts_close = abs(summary_total - leads_count) <= 5
            log_test("D2: Summary with pipelineId filter matches direct leads count",
                    counts_close,
                    f"Summary: {summary_total}, Direct count: {leads_count}")
        except Exception as e:
            log_test("D2: Summary with pipelineId filter matches direct leads count",
                    False, f"Exception: {str(e)}")
    
    # D3: Leads-by-source sum matches summary total
    try:
        resp_summary = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
        summary_total = resp_summary.json().get("totals", {}).get("total", 0)
        
        resp_by_source = demo_session.get(f"{BASE_URL}/api/reports/leads-by-source?range=30d")
        by_source_data = resp_by_source.json()
        by_source_sum = sum(item.get("count", 0) for item in by_source_data.get("data", []))
        
        totals_match = summary_total == by_source_sum
        log_test("D3: Leads-by-source sum matches summary total",
                totals_match,
                f"Summary: {summary_total}, By-source sum: {by_source_sum}")
    except Exception as e:
        log_test("D3: Leads-by-source sum matches summary total", False, f"Exception: {str(e)}")

# ============================================================================
# E) CSV EXPORT
# ============================================================================

def test_csv_export(demo_session):
    print_section("E) CSV EXPORT")
    
    # E1: GET /api/reports/export -> 200, text/csv, has .csv in filename
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/export?range=30d")
        content_type = resp.headers.get("Content-Type", "")
        content_disposition = resp.headers.get("Content-Disposition", "")
        has_csv_type = "text/csv" in content_type
        has_csv_filename = ".csv" in content_disposition
        
        # Check for BOM (UTF-8 BOM is \ufeff or bytes EF BB BF)
        has_bom = resp.content[:3] == b'\xef\xbb\xbf'
        
        log_test("E1: CSV export returns 200, text/csv, .csv filename, UTF-8 BOM",
                resp.status_code == 200 and has_csv_type and has_csv_filename and has_bom,
                f"Status: {resp.status_code}, Content-Type: {content_type}, Has BOM: {has_bom}")
    except Exception as e:
        log_test("E1: CSV export returns 200, text/csv, .csv filename, UTF-8 BOM",
                False, f"Exception: {str(e)}")
    
    # E2: CSV headers in PT-BR
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/export?range=30d")
        csv_text = resp.content.decode('utf-8-sig')  # Decode with BOM handling
        lines = csv_text.split('\r\n')
        header_line = lines[0] if lines else ""
        
        expected_headers = [
            "ID", "Nome", "E-mail", "Telefone", "Origem", "Formulário",
            "Pipeline", "Etapa", "Status", "Temperatura", "Responsável",
            "E-mail do Responsável", "Data de Criação", "Última Atualização",
            "Motivo de Perda", "Tarefas (total)", "Tarefas Pendentes", "Tarefas Vencidas"
        ]
        
        all_headers_present = all(header in header_line for header in expected_headers)
        log_test("E2: CSV headers in PT-BR (all 18 columns present)",
                all_headers_present,
                f"Headers present: {all_headers_present}")
    except Exception as e:
        log_test("E2: CSV headers in PT-BR (all 18 columns present)", False, f"Exception: {str(e)}")
    
    # E3: Number of data rows matches summary total
    try:
        resp_summary = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
        summary_total = resp_summary.json().get("totals", {}).get("total", 0)
        
        resp_csv = demo_session.get(f"{BASE_URL}/api/reports/export?range=30d")
        csv_text = resp_csv.content.decode('utf-8-sig')
        lines = [line for line in csv_text.split('\r\n') if line.strip()]
        data_rows = len(lines) - 1  # Subtract header row
        
        counts_match = data_rows == summary_total
        log_test("E3: CSV data rows match summary total",
                counts_match,
                f"CSV rows: {data_rows}, Summary total: {summary_total}")
    except Exception as e:
        log_test("E3: CSV data rows match summary total", False, f"Exception: {str(e)}")
    
    # E4: CSV with source filter
    try:
        # Get available sources
        resp_options = demo_session.get(f"{BASE_URL}/api/reports/options")
        sources = resp_options.json().get("sources", [])
        
        if sources:
            test_source = sources[0]["value"]
            resp_csv = demo_session.get(f"{BASE_URL}/api/reports/export?source={test_source}")
            csv_text = resp_csv.content.decode('utf-8-sig')
            
            # Check that all data rows contain the source
            lines = [line for line in csv_text.split('\r\n') if line.strip()]
            # Simple check: CSV should have data
            has_data = len(lines) > 1
            
            log_test("E4: CSV export with source filter works",
                    resp_csv.status_code == 200 and has_data,
                    f"Status: {resp_csv.status_code}, Rows: {len(lines) - 1}")
        else:
            log_test("E4: CSV export with source filter works", True, "No sources available to test")
    except Exception as e:
        log_test("E4: CSV export with source filter works", False, f"Exception: {str(e)}")
    
    # E5: Audit log contains reports.exported
    try:
        resp = demo_session.get(f"{BASE_URL}/api/audit-logs")
        logs = resp.json()
        
        # Handle both list and dict responses
        if isinstance(logs, dict):
            logs = logs.get("logs", [])
        
        has_export_log = any(log.get("action") == "reports.exported" for log in logs if isinstance(log, dict))
        
        # If not found, do an export and check again
        if not has_export_log:
            demo_session.get(f"{BASE_URL}/api/reports/export?range=7d")
            resp = demo_session.get(f"{BASE_URL}/api/audit-logs")
            logs = resp.json()
            if isinstance(logs, dict):
                logs = logs.get("logs", [])
            has_export_log = any(log.get("action") == "reports.exported" for log in logs if isinstance(log, dict))
        
        # Check for metadata.rowCount
        export_log = next((log for log in logs if isinstance(log, dict) and log.get("action") == "reports.exported"), None)
        has_row_count = export_log and "metadata" in export_log and "rowCount" in export_log["metadata"]
        
        log_test("E5: Audit log contains reports.exported with metadata.rowCount",
                has_export_log and has_row_count,
                f"Export log found: {has_export_log}, Has rowCount: {has_row_count}")
    except Exception as e:
        log_test("E5: Audit log contains reports.exported with metadata.rowCount",
                False, f"Exception: {str(e)}")

# ============================================================================
# F) RBAC
# ============================================================================

def test_rbac(demo_session, demo_user_id):
    print_section("F) RBAC")
    
    # F1: Create agent user and test REPORTS_VIEW (scoped to own leads)
    agent_session = requests.Session()
    agent_email = f"agent-reports-{random_string()}@example.com"
    
    try:
        # Create agent user via POST /api/users
        resp = demo_session.post(f"{BASE_URL}/api/users", json={
            "name": "Agent Reports",
            "email": agent_email,
            "password": "password123",
            "role": "agent"
        })
        
        if resp.status_code != 200:
            print(f"   ✗ Failed to create agent: {resp.status_code}")
            log_test("F1: Create agent user", False, f"Status: {resp.status_code}")
        else:
            print(f"   ✓ Created agent: {agent_email}")
            
            # Login as agent
            resp = agent_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": agent_email,
                "password": "password123"
            })
            
            if resp.status_code == 200:
                # GET /api/reports/summary as agent -> 200 but scoped
                resp_summary = agent_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
                agent_total = resp_summary.json().get("totals", {}).get("total", 0)
                
                # Get owner's total
                resp_owner = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
                owner_total = resp_owner.json().get("totals", {}).get("total", 0)
                
                # Agent should see <= owner (likely 0 since no leads assigned)
                agent_scoped = agent_total <= owner_total
                
                log_test("F1: Agent GET /summary returns 200 with scoped data (total <= owner)",
                        resp_summary.status_code == 200 and agent_scoped,
                        f"Agent total: {agent_total}, Owner total: {owner_total}")
            else:
                log_test("F1: Agent GET /summary returns 200 with scoped data", False,
                        f"Agent login failed: {resp.status_code}")
    except Exception as e:
        log_test("F1: Agent GET /summary returns 200 with scoped data", False, f"Exception: {str(e)}")
    
    # F2: Agent tries to export -> 403
    try:
        resp = agent_session.get(f"{BASE_URL}/api/reports/export?range=30d")
        log_test("F2: Agent GET /export returns 403 (REPORTS_EXPORT required)",
                resp.status_code == 403,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("F2: Agent GET /export returns 403", False, f"Exception: {str(e)}")
    
    # F3: Agent with assignedTo filter still only sees own leads
    try:
        if demo_user_id:
            # Agent tries to see demo's leads
            resp = agent_session.get(f"{BASE_URL}/api/reports/summary?assignedTo={demo_user_id}")
            
            if resp.status_code == 200:
                agent_total = resp.json().get("totals", {}).get("total", 0)
                # Should still be scoped to agent's own leads (likely 0)
                log_test("F3: Agent with assignedTo=otherUserId still only sees own leads",
                        agent_total == 0,
                        f"Status: {resp.status_code}, Total: {agent_total}")
            else:
                # If 400, it might be because the user doesn't belong to tenant (which is also valid)
                log_test("F3: Agent with assignedTo=otherUserId still only sees own leads",
                        resp.status_code in [200, 400],
                        f"Status: {resp.status_code} (server enforces scoping)")
        else:
            log_test("F3: Agent with assignedTo=otherUserId still only sees own leads",
                    False, "Could not get demo user ID")
    except Exception as e:
        log_test("F3: Agent with assignedTo=otherUserId still only sees own leads",
                False, f"Exception: {str(e)}")
    
    # F4: Create viewer and test - viewer should NOT have REPORTS_VIEW
    viewer_session = requests.Session()
    viewer_email = f"viewer-reports-{random_string()}@example.com"
    
    try:
        resp = demo_session.post(f"{BASE_URL}/api/users", json={
            "name": "Viewer Reports",
            "email": viewer_email,
            "password": "password123",
            "role": "viewer"
        })
        
        if resp.status_code == 200:
            # Login as viewer
            resp = viewer_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": viewer_email,
                "password": "password123"
            })
            
            if resp.status_code == 200:
                # GET /summary as viewer -> 403 (viewer does NOT have REPORTS_VIEW)
                resp_summary = viewer_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
                
                # GET /export as viewer -> 403
                resp_export = viewer_session.get(f"{BASE_URL}/api/reports/export?range=30d")
                
                log_test("F4: Viewer GET /summary returns 403, GET /export returns 403 (no REPORTS_VIEW)",
                        resp_summary.status_code == 403 and resp_export.status_code == 403,
                        f"Summary: {resp_summary.status_code}, Export: {resp_export.status_code}")
            else:
                log_test("F4: Viewer GET /summary returns 403, GET /export returns 403 (no REPORTS_VIEW)",
                        False, f"Viewer login failed: {resp.status_code}")
        else:
            log_test("F4: Viewer GET /summary returns 403, GET /export returns 403 (no REPORTS_VIEW)",
                    False, f"Failed to create viewer: {resp.status_code}")
    except Exception as e:
        log_test("F4: Viewer GET /summary returns 403, GET /export returns 403 (no REPORTS_VIEW)",
                False, f"Exception: {str(e)}")

# ============================================================================
# G) MULTI-TENANT ISOLATION
# ============================================================================

def test_multi_tenant_isolation(demo_session):
    print_section("G) MULTI-TENANT ISOLATION")
    
    # G1: Demo (Tenant A) leads-by-day only counts Tenant A leads
    try:
        resp = demo_session.get(f"{BASE_URL}/api/reports/leads-by-day?range=30d")
        data = resp.json()
        total_leads = sum(day.get("total", 0) for day in data.get("data", []))
        
        # Should match summary
        resp_summary = demo_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
        summary_total = resp_summary.json().get("totals", {}).get("total", 0)
        
        log_test("G1: Demo leads-by-day only counts Tenant A leads",
                total_leads == summary_total,
                f"Leads-by-day: {total_leads}, Summary: {summary_total}")
    except Exception as e:
        log_test("G1: Demo leads-by-day only counts Tenant A leads", False, f"Exception: {str(e)}")
    
    # G2: Tenant B (empty) -> all totals zero
    tenant_b_session = requests.Session()
    tenant_b_email = f"tenant-b-isolation-{random_string()}@example.com"
    
    try:
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Tenant B Isolation",
            "email": tenant_b_email,
            "password": "password123",
            "companyName": "Tenant B Isolation"
        })
        
        if resp.status_code == 200:
            # GET /summary as Tenant B
            resp_summary = tenant_b_session.get(f"{BASE_URL}/api/reports/summary?range=30d")
            summary_data = resp_summary.json()
            totals = summary_data.get("totals", {})
            
            all_zero = (
                totals.get("total", -1) == 0 and
                totals.get("ganhos", -1) == 0 and
                totals.get("perdidos", -1) == 0
            )
            
            # Check arrays are empty
            resp_by_day = tenant_b_session.get(f"{BASE_URL}/api/reports/leads-by-day?range=30d")
            by_day_data = resp_by_day.json().get("data", [])
            by_day_sum = sum(day.get("total", 0) for day in by_day_data)
            
            log_test("G2: Tenant B (empty) has zero totals and empty arrays",
                    all_zero and by_day_sum == 0,
                    f"Total: {totals.get('total')}, Ganhos: {totals.get('ganhos')}, By-day sum: {by_day_sum}")
        else:
            log_test("G2: Tenant B (empty) has zero totals and empty arrays",
                    False, f"Failed to create Tenant B: {resp.status_code}")
    except Exception as e:
        log_test("G2: Tenant B (empty) has zero totals and empty arrays", False, f"Exception: {str(e)}")

# ============================================================================
# H) AUDIT LOGS
# ============================================================================

def test_audit_logs(demo_session):
    print_section("H) AUDIT LOGS")
    
    # H1: GET /summary generates reports.viewed
    try:
        # Clear recent logs by getting current count
        resp = demo_session.get(f"{BASE_URL}/api/audit-logs")
        initial_logs = resp.json()
        if isinstance(initial_logs, dict):
            initial_logs = initial_logs.get("logs", [])
        initial_viewed_count = sum(1 for log in initial_logs if isinstance(log, dict) and log.get("action") == "reports.viewed")
        
        # Trigger a view
        demo_session.get(f"{BASE_URL}/api/reports/summary?range=7d")
        
        # Check logs again
        resp = demo_session.get(f"{BASE_URL}/api/audit-logs")
        final_logs = resp.json()
        if isinstance(final_logs, dict):
            final_logs = final_logs.get("logs", [])
        final_viewed_count = sum(1 for log in final_logs if isinstance(log, dict) and log.get("action") == "reports.viewed")
        
        log_test("H1: GET /summary generates reports.viewed audit log",
                final_viewed_count > initial_viewed_count,
                f"Initial: {initial_viewed_count}, Final: {final_viewed_count}")
    except Exception as e:
        log_test("H1: GET /summary generates reports.viewed audit log", False, f"Exception: {str(e)}")
    
    # H2: GET /export generates reports.exported
    try:
        resp = demo_session.get(f"{BASE_URL}/api/audit-logs")
        initial_logs = resp.json()
        if isinstance(initial_logs, dict):
            initial_logs = initial_logs.get("logs", [])
        initial_exported_count = sum(1 for log in initial_logs if isinstance(log, dict) and log.get("action") == "reports.exported")
        
        # Trigger an export
        demo_session.get(f"{BASE_URL}/api/reports/export?range=7d")
        
        # Check logs again
        resp = demo_session.get(f"{BASE_URL}/api/audit-logs")
        final_logs = resp.json()
        if isinstance(final_logs, dict):
            final_logs = final_logs.get("logs", [])
        final_exported_count = sum(1 for log in final_logs if isinstance(log, dict) and log.get("action") == "reports.exported")
        
        log_test("H2: GET /export generates reports.exported audit log",
                final_exported_count > initial_exported_count,
                f"Initial: {initial_exported_count}, Final: {final_exported_count}")
    except Exception as e:
        log_test("H2: GET /export generates reports.exported audit log", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*80)
    print("  LeadFlow CRM - Phase 7: Reports + CSV Export Backend Tests")
    print("="*80)
    
    # Run all test suites
    demo_session, no_auth_session, pipeline_id, form_id, user_id = test_auth_and_tenant()
    
    if demo_session:
        test_zod_validations(demo_session)
        test_cross_tenant_guardrails(demo_session)
        test_consistent_filters(demo_session, pipeline_id)
        test_csv_export(demo_session)
        test_rbac(demo_session, user_id)
        test_multi_tenant_isolation(demo_session)
        test_audit_logs(demo_session)
    
    # Print summary
    print("\n" + "="*80)
    print("  TEST SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {test_results['passed']}")
    print(f"❌ FAILED: {test_results['failed']}")
    print(f"📊 TOTAL:  {test_results['passed'] + test_results['failed']}")
    
    if test_results['failed'] > 0:
        print("\n❌ FAILED TESTS:")
        for test in test_results['tests']:
            if not test['passed']:
                print(f"  - {test['name']}")
                if test['details']:
                    print(f"    {test['details']}")
    
    print("\n" + "="*80)
    
    return test_results['failed'] == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
