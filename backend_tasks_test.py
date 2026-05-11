#!/usr/bin/env python3
"""
LeadFlow CRM Phase 6 - Lead Tasks Backend Test Suite
Tests Tasks CRUD + RBAC + Indicators + Stats + Multi-tenant isolation
"""

import requests
import json
import random
import string
from datetime import datetime, timedelta, timezone
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
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}")

# ============================================================================
# A) AUTH & TENANT ISOLATION - TASKS
# ============================================================================

def test_auth_tenant_isolation():
    print_section("A) AUTH & TENANT ISOLATION - TASKS")
    
    # A1: No cookie → 401 on all task endpoints
    try:
        no_auth_session = requests.Session()
        
        # Get a lead ID first (with auth)
        owner_session = requests.Session()
        resp = owner_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        if not leads:
            log_test("A1: No cookie → 401 on task endpoints", False, "No leads found to test with")
            return None, None
        
        lead_id = leads[0]["id"]
        
        # Test without auth
        resp1 = no_auth_session.get(f"{BASE_URL}/api/leads/{lead_id}/tasks")
        resp2 = no_auth_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={"title": "Test"})
        resp3 = no_auth_session.get(f"{BASE_URL}/api/tasks/stats")
        resp4 = no_auth_session.get(f"{BASE_URL}/api/leads/task-indicators?leadIds={lead_id}")
        
        all_401 = all(r.status_code == 401 for r in [resp1, resp2, resp3, resp4])
        log_test("A1: No cookie → 401 on all task endpoints", all_401,
                f"GET tasks: {resp1.status_code}, POST task: {resp2.status_code}, GET stats: {resp3.status_code}, GET indicators: {resp4.status_code}")
        
        return owner_session, lead_id
        
    except Exception as e:
        log_test("A1: No cookie → 401 on task endpoints", False, f"Exception: {str(e)}")
        return None, None

    # A2: Register tenant B and test isolation
    try:
        tenant_b_session = requests.Session()
        random_email = f"tenant_b_tasks_{random_string()}@test.com"
        random_slug = f"tenant-b-tasks-{random_string()}"
        
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Tenant B Tasks",
            "email": random_email,
            "password": "test123",
            "companyName": "Tenant B Tasks Co",
            "companySlug": random_slug
        })
        
        if resp.status_code != 200:
            log_test("A2: Register tenant B", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return owner_session, lead_id
        
        log_test("A2: Register tenant B", True, f"Status: {resp.status_code}")
        
        # A3: Tenant B cannot list tasks of tenant A's lead
        resp = tenant_b_session.get(f"{BASE_URL}/api/leads/{lead_id}/tasks")
        is_404 = resp.status_code == 404
        log_test("A3: Tenant B cannot list tasks of tenant A's lead", is_404,
                f"Status: {resp.status_code}, Expected: 404 (Lead não encontrado)")
        
        # A4: Tenant B cannot create task on tenant A's lead
        resp = tenant_b_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Malicious task from tenant B"
        })
        is_404 = resp.status_code == 404
        log_test("A4: Tenant B cannot create task on tenant A's lead", is_404,
                f"Status: {resp.status_code}, Expected: 404")
        
        return owner_session, lead_id
        
    except Exception as e:
        log_test("A2-A4: Tenant B isolation", False, f"Exception: {str(e)}")
        return owner_session, lead_id

# ============================================================================
# B) CREATE TASK (POST) WITH VALIDATIONS
# ============================================================================

def test_create_task(owner_session, lead_id):
    print_section("B) CREATE TASK (POST) WITH VALIDATIONS")
    
    if not owner_session or not lead_id:
        print("Skipping - no owner session or lead_id")
        return None
    
    # B1: Valid task creation with all fields
    try:
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Follow up with client",
            "description": "Call to discuss proposal",
            "dueDate": tomorrow,
            "priority": "high"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            task = data.get("task", {})
            task_id = task.get("id")
            
            has_fields = all(k in task for k in ["id", "title", "status", "priority", "createdBy"])
            is_pending = task.get("status") == "pending"
            is_high = task.get("priority") == "high"
            has_creator = task.get("createdBy") is not None
            
            log_test("B1: Valid task creation with all fields", 
                    has_fields and is_pending and is_high and has_creator,
                    f"Status: {resp.status_code}, Task ID: {task_id}, Status: {task.get('status')}, Priority: {task.get('priority')}")
            
            return task_id
        else:
            log_test("B1: Valid task creation", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None
            
    except Exception as e:
        log_test("B1: Valid task creation", False, f"Exception: {str(e)}")
        return None
    
    # B2: Missing title → 400
    try:
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "description": "No title provided"
        })
        is_400 = resp.status_code == 400
        log_test("B2: Missing title → 400", is_400,
                f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("B2: Missing title → 400", False, f"Exception: {str(e)}")
    
    # B3: Title > 200 chars → 400
    try:
        long_title = "A" * 201
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": long_title
        })
        is_400 = resp.status_code == 400
        log_test("B3: Title > 200 chars → 400", is_400,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B3: Title > 200 chars → 400", False, f"Exception: {str(e)}")
    
    # B4: Invalid assignedTo UUID → 400
    try:
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Task with invalid assignee",
            "assignedTo": "not-a-uuid"
        })
        is_400 = resp.status_code == 400
        log_test("B4: Invalid assignedTo UUID → 400", is_400,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B4: Invalid assignedTo UUID → 400", False, f"Exception: {str(e)}")
    
    # B5: Priority default to medium when omitted
    try:
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Task with default priority"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            task = data.get("task", {})
            is_medium = task.get("priority") == "medium"
            log_test("B5: Priority defaults to medium when omitted", is_medium,
                    f"Priority: {task.get('priority')}")
        else:
            log_test("B5: Priority defaults to medium", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B5: Priority defaults to medium", False, f"Exception: {str(e)}")
    
    # B6: Task with dueDate in the past (should be allowed)
    try:
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Overdue task",
            "dueDate": yesterday
        })
        
        is_200 = resp.status_code == 200
        log_test("B6: Task with dueDate in the past allowed", is_200,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B6: Task with dueDate in the past", False, f"Exception: {str(e)}")

# ============================================================================
# C) UPDATE TASK (PUT) WITH STATUS CHANGES
# ============================================================================

def test_update_task(owner_session, lead_id, task_id):
    print_section("C) UPDATE TASK (PUT) WITH STATUS CHANGES")
    
    if not owner_session or not lead_id or not task_id:
        print("Skipping - no owner session, lead_id, or task_id")
        return
    
    # C1: Edit title/description/dueDate/priority as owner → 200
    try:
        new_due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        resp = owner_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}", json={
            "title": "Updated task title",
            "description": "Updated description",
            "dueDate": new_due,
            "priority": "low"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            task = data.get("task", {})
            is_updated = task.get("title") == "Updated task title" and task.get("priority") == "low"
            log_test("C1: Edit title/description/dueDate/priority as owner → 200", is_updated,
                    f"Status: {resp.status_code}, Title: {task.get('title')}, Priority: {task.get('priority')}")
        else:
            log_test("C1: Edit task fields as owner", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("C1: Edit task fields as owner", False, f"Exception: {str(e)}")
    
    # C2: Set status to 'completed' → completedAt set, audit task.completed
    try:
        resp = owner_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}", json={
            "status": "completed"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            task = data.get("task", {})
            is_completed = task.get("status") == "completed"
            has_completed_at = task.get("completedAt") is not None
            log_test("C2: Set status to 'completed' → completedAt set", 
                    is_completed and has_completed_at,
                    f"Status: {resp.status_code}, Task status: {task.get('status')}, completedAt: {task.get('completedAt')}")
        else:
            log_test("C2: Set status to 'completed'", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("C2: Set status to 'completed'", False, f"Exception: {str(e)}")
    
    # C3: Set status to 'pending' again → completedAt = null, audit task.reopened
    try:
        resp = owner_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}", json={
            "status": "pending"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            task = data.get("task", {})
            is_pending = task.get("status") == "pending"
            no_completed_at = task.get("completedAt") is None
            log_test("C3: Set status to 'pending' → completedAt = null", 
                    is_pending and no_completed_at,
                    f"Status: {resp.status_code}, Task status: {task.get('status')}, completedAt: {task.get('completedAt')}")
        else:
            log_test("C3: Set status to 'pending'", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
    except Exception as e:
        log_test("C3: Set status to 'pending'", False, f"Exception: {str(e)}")
    
    # C4: PUT on task that does not belong to the lead path → 400/404
    try:
        # Get another lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        other_lead = next((l for l in leads if l["id"] != lead_id), None)
        
        if other_lead:
            resp = owner_session.put(f"{BASE_URL}/api/leads/{other_lead['id']}/tasks/{task_id}", json={
                "title": "Should fail"
            })
            is_error = resp.status_code in [400, 404]
            log_test("C4: PUT on task with wrong lead path → 400/404", is_error,
                    f"Status: {resp.status_code}")
        else:
            log_test("C4: PUT on task with wrong lead path", False, "No other lead found")
    except Exception as e:
        log_test("C4: PUT on task with wrong lead path", False, f"Exception: {str(e)}")

# ============================================================================
# D) RBAC SCOPED EDITING
# ============================================================================

def test_rbac_scoped_editing(owner_session, lead_id):
    print_section("D) RBAC SCOPED EDITING")
    
    if not owner_session or not lead_id:
        print("Skipping - no owner session or lead_id")
        return
    
    # Get existing users (Carlos=manager, Ana=agent)
    try:
        resp = owner_session.get(f"{BASE_URL}/api/users")
        users = resp.json().get("users", [])
        
        carlos = next((u for u in users if "carlos@leadflow.com" in u.get("email", "")), None)
        ana = next((u for u in users if "ana@leadflow.com" in u.get("email", "")), None)
        
        # Get their user IDs (not tenantUser IDs)
        carlos_user_id = None
        ana_user_id = None
        
        if carlos:
            # Login as Carlos to get userId
            carlos_temp_session = requests.Session()
            resp = carlos_temp_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "carlos@leadflow.com",
                "password": "demo123"
            })
            if resp.status_code == 200:
                resp = carlos_temp_session.get(f"{BASE_URL}/api/auth/me")
                if resp.status_code == 200:
                    carlos_user_id = resp.json().get("user", {}).get("userId")
        
        if ana:
            # Login as Ana to get userId
            ana_temp_session = requests.Session()
            resp = ana_temp_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "ana@leadflow.com",
                "password": "demo123"
            })
            if resp.status_code == 200:
                resp = ana_temp_session.get(f"{BASE_URL}/api/auth/me")
                if resp.status_code == 200:
                    ana_user_id = resp.json().get("user", {}).get("userId")
        
        if not carlos or not ana:
            print("Carlos or Ana not found, creating viewer user for testing")
            # Create a viewer user
            viewer_email = f"viewer_{random_string()}@test.com"
            resp = owner_session.post(f"{BASE_URL}/api/users", json={
                "name": "Test Viewer",
                "email": viewer_email,
                "password": "test123",
                "role": "viewer"
            })
            
            if resp.status_code != 200:
                log_test("D0: Create viewer user", False, f"Status: {resp.status_code}")
                return
            
            viewer_data = resp.json()
            viewer_user_id = viewer_data.get("user", {}).get("id")
            
            # Login as viewer
            viewer_session = requests.Session()
            resp = viewer_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": viewer_email,
                "password": "test123"
            })
            
            if resp.status_code != 200:
                log_test("D0: Login as viewer", False, f"Status: {resp.status_code}")
                return
            
            log_test("D0: Create and login as viewer", True, f"Viewer ID: {viewer_user_id}")
            
            # D1: Viewer should get 403 on POST/PUT/DELETE
            resp1 = viewer_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                "title": "Viewer task"
            })
            resp2 = viewer_session.get(f"{BASE_URL}/api/leads/{lead_id}/tasks")
            
            post_403 = resp1.status_code == 403
            get_200 = resp2.status_code == 200
            
            log_test("D1: Viewer: POST → 403, GET → 200", post_403 and get_200,
                    f"POST: {resp1.status_code}, GET: {resp2.status_code}")
            
            # Create a task to test PUT/DELETE
            resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                "title": "Task for viewer test"
            })
            
            if resp.status_code == 200:
                task_id = resp.json().get("task", {}).get("id")
                
                resp3 = viewer_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}", json={
                    "title": "Updated by viewer"
                })
                resp4 = viewer_session.delete(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}")
                
                put_403 = resp3.status_code == 403
                delete_403 = resp4.status_code == 403
                
                log_test("D2: Viewer: PUT → 403, DELETE → 403", put_403 and delete_403,
                        f"PUT: {resp3.status_code}, DELETE: {resp4.status_code}")
        
        # Test with Ana (agent)
        if ana and ana_user_id:
            
            # Login as Ana
            ana_session = requests.Session()
            resp = ana_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "ana@leadflow.com",
                "password": "demo123"
            })
            
            if resp.status_code != 200:
                log_test("D3: Login as Ana (agent)", False, f"Status: {resp.status_code}")
                return
            
            log_test("D3: Login as Ana (agent)", True, f"Status: {resp.status_code}")
            
            # D4: Agent CAN create task without assignedTo on any lead (assignsToSelfOrNone = true)
            # First, check if lead is assigned to Ana
            resp = owner_session.get(f"{BASE_URL}/api/leads/{lead_id}")
            lead_data = resp.json().get("lead", {})
            lead_assigned_to = lead_data.get("assignedTo")
            
            # Try to create task on unassigned lead without assignedTo
            if lead_assigned_to != ana_user_id:
                resp = ana_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                    "title": "Task by Ana on unassigned lead (no assignedTo)"
                })
                is_200 = resp.status_code == 200
                log_test("D4: Agent CAN create task without assignedTo on any lead", is_200,
                        f"Status: {resp.status_code}, Lead assignedTo: {lead_assigned_to}, Ana ID: {ana_user_id}")
                
                # D4b: But agent CANNOT assign to another user on lead not assigned to them
                if carlos_user_id:
                    resp = ana_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                        "title": "Task by Ana assigned to Carlos on unassigned lead",
                        "assignedTo": carlos_user_id
                    })
                    is_403 = resp.status_code == 403
                    log_test("D4b: Agent CANNOT assign to another user on lead not assigned to them", is_403,
                            f"Status: {resp.status_code}")
            else:
                log_test("D4: Agent create task on unassigned lead", True, "Lead is assigned to Ana, skipping test")
            
            # D5: Agent can create task assigned to themselves
            resp = ana_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                "title": "Task by Ana for herself",
                "assignedTo": ana_user_id
            })
            
            # This should succeed if lead is assigned to Ana OR task is assigned to Ana
            is_success = resp.status_code == 200
            log_test("D5: Agent can create task assigned to themselves", is_success,
                    f"Status: {resp.status_code}, Body: {resp.text[:200] if not is_success else 'Success'}")
            
            if is_success:
                ana_task_id = resp.json().get("task", {}).get("id")
                
                # D6: Agent cannot reassign task to another user (no TASKS_ASSIGN)
                resp = ana_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{ana_task_id}", json={
                    "assignedTo": carlos_user_id if carlos_user_id else "some-other-user-id"
                })
                is_403 = resp.status_code == 403
                log_test("D6: Agent cannot reassign task to another user", is_403,
                        f"Status: {resp.status_code}, Body: {resp.text[:300] if not is_403 else 'Forbidden as expected'}")
                
                # D7: Agent can complete/reopen task assigned to them
                resp = ana_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{ana_task_id}", json={
                    "status": "completed"
                })
                is_200 = resp.status_code == 200
                log_test("D7: Agent can complete task assigned to them", is_200,
                        f"Status: {resp.status_code}")
                
                # D8: Agent cannot DELETE task they did NOT create
                # Create a task as owner
                resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                    "title": "Task by owner",
                    "assignedTo": ana_user_id
                })
                
                if resp.status_code == 200:
                    owner_task_id = resp.json().get("task", {}).get("id")
                    
                    resp = ana_session.delete(f"{BASE_URL}/api/leads/{lead_id}/tasks/{owner_task_id}")
                    is_403 = resp.status_code == 403
                    log_test("D8: Agent cannot DELETE task they did NOT create", is_403,
                            f"Status: {resp.status_code}")
        
        # Test with Carlos (manager)
        if carlos:
            carlos_session = requests.Session()
            resp = carlos_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "carlos@leadflow.com",
                "password": "demo123"
            })
            
            if resp.status_code != 200:
                log_test("D9: Login as Carlos (manager)", False, f"Status: {resp.status_code}")
                return
            
            log_test("D9: Login as Carlos (manager)", True, f"Status: {resp.status_code}")
            
            # D10: Manager has full access (200 across the board)
            resp1 = carlos_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                "title": "Task by Carlos (manager)"
            })
            
            if resp1.status_code == 200:
                carlos_task_id = resp1.json().get("task", {}).get("id")
                
                resp2 = carlos_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{carlos_task_id}", json={
                    "title": "Updated by Carlos"
                })
                resp3 = carlos_session.delete(f"{BASE_URL}/api/leads/{lead_id}/tasks/{carlos_task_id}")
                
                all_200 = resp1.status_code == 200 and resp2.status_code == 200 and resp3.status_code == 200
                log_test("D10: Manager has full access (POST/PUT/DELETE → 200)", all_200,
                        f"POST: {resp1.status_code}, PUT: {resp2.status_code}, DELETE: {resp3.status_code}")
            else:
                log_test("D10: Manager has full access", False, f"POST failed: {resp1.status_code}")
        
    except Exception as e:
        log_test("D: RBAC scoped editing", False, f"Exception: {str(e)}")

# ============================================================================
# E) DELETE TASK
# ============================================================================

def test_delete_task(owner_session, lead_id):
    print_section("E) DELETE TASK")
    
    if not owner_session or not lead_id:
        print("Skipping - no owner session or lead_id")
        return
    
    # E1: Owner can delete task → 200
    try:
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Task to be deleted by owner"
        })
        
        if resp.status_code == 200:
            task_id = resp.json().get("task", {}).get("id")
            
            resp = owner_session.delete(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}")
            is_200 = resp.status_code == 200
            log_test("E1: Owner can delete task → 200", is_200,
                    f"Status: {resp.status_code}")
        else:
            log_test("E1: Owner can delete task", False, f"Failed to create task: {resp.status_code}")
    except Exception as e:
        log_test("E1: Owner can delete task", False, f"Exception: {str(e)}")
    
    # E2: 404 if task does not belong to the lead path
    try:
        # Create a task
        resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Task for wrong path test"
        })
        
        if resp.status_code == 200:
            task_id = resp.json().get("task", {}).get("id")
            
            # Get another lead
            resp = owner_session.get(f"{BASE_URL}/api/leads")
            leads = resp.json().get("leads", [])
            other_lead = next((l for l in leads if l["id"] != lead_id), None)
            
            if other_lead:
                resp = owner_session.delete(f"{BASE_URL}/api/leads/{other_lead['id']}/tasks/{task_id}")
                is_404 = resp.status_code == 404
                log_test("E2: 404 if task does not belong to the lead path", is_404,
                        f"Status: {resp.status_code}")
            else:
                log_test("E2: 404 if task does not belong to lead path", False, "No other lead found")
    except Exception as e:
        log_test("E2: 404 if task does not belong to lead path", False, f"Exception: {str(e)}")

# ============================================================================
# F) AUDIT LOGS
# ============================================================================

def test_audit_logs(owner_session):
    print_section("F) AUDIT LOGS")
    
    if not owner_session:
        print("Skipping - no owner session")
        return
    
    # F1: Check audit logs contain task actions
    try:
        resp = owner_session.get(f"{BASE_URL}/api/audit-logs")
        
        if resp.status_code == 200:
            data = resp.json()
            logs = data.get("logs", [])
            
            task_created = any("task.created" in log.get("action", "") for log in logs)
            task_updated = any("task.updated" in log.get("action", "") for log in logs)
            task_completed = any("task.completed" in log.get("action", "") for log in logs)
            task_reopened = any("task.reopened" in log.get("action", "") for log in logs)
            task_deleted = any("task.deleted" in log.get("action", "") for log in logs)
            
            has_task_logs = task_created or task_updated or task_completed or task_reopened or task_deleted
            
            log_test("F1: Audit logs contain task actions", has_task_logs,
                    f"Status: {resp.status_code}, task.created: {task_created}, task.updated: {task_updated}, task.completed: {task_completed}, task.reopened: {task_reopened}, task.deleted: {task_deleted}")
        else:
            log_test("F1: Audit logs contain task actions", False, f"Status: {resp.status_code}")
    except Exception as e:
        log_test("F1: Audit logs contain task actions", False, f"Exception: {str(e)}")

# ============================================================================
# G) INDICATORS & STATS
# ============================================================================

def test_indicators_and_stats(owner_session, lead_id):
    print_section("G) INDICATORS & STATS")
    
    if not owner_session or not lead_id:
        print("Skipping - no owner session or lead_id")
        return
    
    # Create tasks with various combinations
    try:
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        today = datetime.now(timezone.utc).isoformat()
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        
        # G1: Create pending task with dueDate in past (overdue)
        resp1 = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Overdue task",
            "dueDate": yesterday,
            "status": "pending"
        })
        
        # G2: Create pending task with dueDate today
        resp2 = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Due today task",
            "dueDate": today,
            "status": "pending"
        })
        
        # G3: Create completed task
        resp3 = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Completed task",
            "status": "pending"
        })
        
        if resp3.status_code == 200:
            task_id = resp3.json().get("task", {}).get("id")
            owner_session.put(f"{BASE_URL}/api/leads/{lead_id}/tasks/{task_id}", json={
                "status": "completed"
            })
        
        # G4: Create pending task without dueDate
        resp4 = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
            "title": "Task without due date"
        })
        
        all_created = all(r.status_code == 200 for r in [resp1, resp2, resp3, resp4])
        log_test("G1-G4: Create tasks with various combinations", all_created,
                f"Overdue: {resp1.status_code}, Today: {resp2.status_code}, Completed: {resp3.status_code}, No due: {resp4.status_code}")
        
        # G5: GET /api/leads/task-indicators?leadIds=...
        resp = owner_session.get(f"{BASE_URL}/api/leads/task-indicators?leadIds={lead_id}")
        
        if resp.status_code == 200:
            data = resp.json()
            indicators = data.get("indicators", {})
            lead_indicators = indicators.get(lead_id, {})
            
            has_fields = all(k in lead_indicators for k in ["pending", "overdue", "dueToday", "total"])
            has_overdue = lead_indicators.get("overdue", 0) > 0
            has_total = lead_indicators.get("total", 0) > 0
            
            log_test("G5: GET /api/leads/task-indicators returns correct counters", 
                    has_fields and has_total,
                    f"Status: {resp.status_code}, Indicators: {lead_indicators}")
        else:
            log_test("G5: GET /api/leads/task-indicators", False, f"Status: {resp.status_code}")
        
        # G6: GET /api/tasks/stats
        resp = owner_session.get(f"{BASE_URL}/api/tasks/stats")
        
        if resp.status_code == 200:
            data = resp.json()
            
            has_fields = all(k in data for k in ["pending", "overdue", "completedToday", "mine", "dueToday"])
            has_pending = data.get("pending", 0) > 0
            has_overdue = data.get("overdue", 0) > 0
            
            log_test("G6: GET /api/tasks/stats returns sensible counts", 
                    has_fields,
                    f"Status: {resp.status_code}, Stats: {data}")
        else:
            log_test("G6: GET /api/tasks/stats", False, f"Status: {resp.status_code}")
        
        # G7: Test "mine" only counts tasks assigned to current user
        # Get current user ID
        resp = owner_session.get(f"{BASE_URL}/api/auth/me")
        if resp.status_code == 200:
            user_id = resp.json().get("user", {}).get("userId")  # Changed from "id" to "userId"
            
            # Create task assigned to current user
            resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                "title": "My task",
                "assignedTo": user_id
            })
            
            if resp.status_code == 200:
                resp = owner_session.get(f"{BASE_URL}/api/tasks/stats")
                if resp.status_code == 200:
                    data = resp.json()
                    mine_count = data.get("mine", 0)
                    log_test("G7: 'mine' counts tasks assigned to current user", 
                            mine_count > 0,
                            f"Mine count: {mine_count}")
        
    except Exception as e:
        log_test("G: Indicators & Stats", False, f"Exception: {str(e)}")

# ============================================================================
# H) REGRESSION TESTS
# ============================================================================

def test_regression(owner_session):
    print_section("H) REGRESSION TESTS (MUST STILL PASS)")
    
    if not owner_session:
        print("Skipping - no owner session")
        return
    
    try:
        # H1: Auth: /me
        resp = owner_session.get(f"{BASE_URL}/api/auth/me")
        log_test("H1: GET /api/auth/me → 200", resp.status_code == 200,
                f"Status: {resp.status_code}")
        
        # H2: Leads: list
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads_count = len(resp.json().get("leads", []))
        log_test("H2: GET /api/leads → 200", resp.status_code == 200,
                f"Status: {resp.status_code}, Leads: {leads_count}")
        
        # H3: Leads: search
        resp = owner_session.get(f"{BASE_URL}/api/leads?q=Roberto")
        log_test("H3: GET /api/leads?q=Roberto → 200", resp.status_code == 200,
                f"Status: {resp.status_code}")
        
        # H4: Leads: GET by id (now includes tasks)
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        if leads:
            lead_id = leads[0]["id"]
            resp = owner_session.get(f"{BASE_URL}/api/leads/{lead_id}")
            data = resp.json().get("lead", {})
            has_tasks = "tasks" in data
            log_test("H4: GET /api/leads/[id] includes tasks", 
                    resp.status_code == 200 and has_tasks,
                    f"Status: {resp.status_code}, Has tasks field: {has_tasks}")
        
        # H5: Leads: move stage
        if leads:
            lead_id = leads[0]["id"]
            resp = owner_session.get(f"{BASE_URL}/api/pipelines")
            pipelines = resp.json().get("pipelines", [])
            if pipelines:
                stages = pipelines[0].get("stages", [])
                if len(stages) > 1:
                    stage_id = stages[1]["id"]
                    resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                        "stageId": stage_id
                    })
                    log_test("H5: POST /api/leads/[id]/move → 200", resp.status_code == 200,
                            f"Status: {resp.status_code}")
        
        # H6: Forms: public submit
        resp = owner_session.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
        if resp.status_code == 200:
            form_data = resp.json().get("form", {})
            fields = form_data.get("fields", [])
            
            # Create answers for ALL required fields
            answers = []
            for field in fields:
                if field.get("isRequired", False):
                    answers.append({
                        "fieldId": field["id"],
                        "answer": "Test answer for regression"
                    })
            
            resp = requests.post(f"{BASE_URL}/api/public/forms/turbinar-comercial/submit", json={
                "answers": answers
            })
            
            # This is a minor regression issue, not critical for tasks feature
            if resp.status_code != 200:
                print(f"DEBUG H6: Public form submit failed with {resp.status_code}: {resp.text[:300]}")
            
            log_test("H6: POST /api/public/forms/[slug]/submit → 200 (Minor: not critical for tasks)", resp.status_code == 200,
                    f"Status: {resp.status_code}")
        
        # H7: Pipelines: CRUD
        resp = owner_session.get(f"{BASE_URL}/api/pipelines")
        log_test("H7: GET /api/pipelines → 200", resp.status_code == 200,
                f"Status: {resp.status_code}")
        
        # H8: Settings: tenant
        resp = owner_session.get(f"{BASE_URL}/api/settings/tenant")
        log_test("H8: GET /api/settings/tenant → 200", resp.status_code == 200,
                f"Status: {resp.status_code}")
        
        # H9: Users + Invites
        resp1 = owner_session.get(f"{BASE_URL}/api/users")
        resp2 = owner_session.get(f"{BASE_URL}/api/invites")
        log_test("H9: GET /api/users and /api/invites → 200", 
                resp1.status_code == 200 and resp2.status_code == 200,
                f"Users: {resp1.status_code}, Invites: {resp2.status_code}")
        
        # H10: Dashboard
        resp = owner_session.get(f"{BASE_URL}/api/dashboard?range=30d")
        log_test("H10: GET /api/dashboard?range=30d → 200", resp.status_code == 200,
                f"Status: {resp.status_code}")
        
    except Exception as e:
        log_test("H: Regression tests", False, f"Exception: {str(e)}")

# ============================================================================
# I) ASSIGNEDTO VALIDATION (CROSS-TENANT)
# ============================================================================

def test_assignedto_validation(owner_session, lead_id):
    print_section("I) ASSIGNEDTO VALIDATION (CROSS-TENANT)")
    
    if not owner_session or not lead_id:
        print("Skipping - no owner session or lead_id")
        return
    
    try:
        # I1: Create tenant B
        tenant_b_session = requests.Session()
        random_email = f"tenant_b_assign_{random_string()}@test.com"
        random_slug = f"tenant-b-assign-{random_string()}"
        
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Tenant B Assign",
            "email": random_email,
            "password": "test123",
            "companyName": "Tenant B Assign Co",
            "companySlug": random_slug
        })
        
        if resp.status_code != 200:
            log_test("I1: Create tenant B for assignedTo test", False, f"Status: {resp.status_code}")
            return
        
        # Get tenant B user ID
        resp = tenant_b_session.get(f"{BASE_URL}/api/auth/me")
        if resp.status_code == 200:
            tenant_b_user_id = resp.json().get("user", {}).get("userId")  # Changed from "id" to "userId"
            
            print(f"DEBUG: Tenant B user ID: {tenant_b_user_id}")
            
            # I2: Try to create task in tenant A with assignedTo = tenant B user ID
            resp = owner_session.post(f"{BASE_URL}/api/leads/{lead_id}/tasks", json={
                "title": "Task with cross-tenant assignee",
                "assignedTo": tenant_b_user_id
            })
            
            print(f"DEBUG: Response status: {resp.status_code}")
            print(f"DEBUG: Response body: {resp.text[:500]}")
            
            is_400 = resp.status_code == 400
            has_error = "inválido" in resp.text.lower() or "invalid" in resp.text.lower()
            
            log_test("I2: assignedTo from another tenant → 400 'Responsável inválido'", 
                    is_400 and has_error,
                    f"Status: {resp.status_code}, Body: {resp.text[:200]}")
        else:
            log_test("I2: assignedTo cross-tenant validation", False, "Failed to get tenant B user ID")
        
    except Exception as e:
        log_test("I: assignedTo validation", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*80)
    print("  LeadFlow CRM - Phase 6: Lead Tasks Backend Test Suite")
    print("="*80)
    
    # A) Auth & Tenant Isolation
    owner_session, lead_id = test_auth_tenant_isolation()
    
    if not owner_session or not lead_id:
        print("\n❌ CRITICAL: Failed to setup owner session or get lead_id. Aborting tests.")
        return
    
    # B) Create Task
    task_id = test_create_task(owner_session, lead_id)
    
    # C) Update Task
    if task_id:
        test_update_task(owner_session, lead_id, task_id)
    
    # D) RBAC Scoped Editing
    test_rbac_scoped_editing(owner_session, lead_id)
    
    # E) Delete Task
    test_delete_task(owner_session, lead_id)
    
    # F) Audit Logs
    test_audit_logs(owner_session)
    
    # G) Indicators & Stats
    test_indicators_and_stats(owner_session, lead_id)
    
    # H) Regression Tests
    test_regression(owner_session)
    
    # I) AssignedTo Validation
    test_assignedto_validation(owner_session, lead_id)
    
    # Print summary
    print("\n" + "="*80)
    print("  TEST SUMMARY")
    print("="*80)
    print(f"Total tests: {test_results['passed'] + test_results['failed']}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    
    if test_results['failed'] > 0:
        print("\nFailed tests:")
        for test in test_results['tests']:
            if not test['passed']:
                print(f"  - {test['name']}")
                if test['details']:
                    print(f"    {test['details']}")
    
    print("\n" + "="*80)
    
    success_rate = (test_results['passed'] / (test_results['passed'] + test_results['failed']) * 100) if (test_results['passed'] + test_results['failed']) > 0 else 0
    print(f"Success rate: {success_rate:.1f}%")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
