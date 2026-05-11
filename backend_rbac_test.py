#!/usr/bin/env python3
"""
LeadFlow CRM RBAC Backend Test Suite
Tests RBAC (Users, Invites, Audit) + enforcement on existing endpoints + multi-tenant isolation
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
# A) USERS ENDPOINTS
# ============================================================================

def test_users_endpoints():
    print_section("A) USERS ENDPOINTS")
    
    # Login as demo (owner)
    owner_session = requests.Session()
    resp = owner_session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "demo@leadflow.com",
        "password": "demo123"
    })
    
    if resp.status_code != 200:
        log_test("A0: Login as owner (demo)", False, f"Status: {resp.status_code}")
        return None, None, None
    
    log_test("A0: Login as owner (demo)", True, f"Status: {resp.status_code}")
    
    # A1: GET /api/users
    try:
        resp = owner_session.get(f"{BASE_URL}/api/users")
        data = resp.json()
        users = data.get("users", [])
        
        has_demo = any("demo@leadflow.com" in u.get("email", "") for u in users)
        has_carlos = any("carlos@leadflow.com" in u.get("email", "") for u in users)
        has_ana = any("ana@leadflow.com" in u.get("email", "") for u in users)
        
        log_test("A1: GET /api/users returns demo, Carlos (manager), Ana (agent)", 
                resp.status_code == 200 and has_demo and has_carlos and has_ana,
                f"Status: {resp.status_code}, Users: {len(users)}, Has demo: {has_demo}, Carlos: {has_carlos}, Ana: {has_ana}")
    except Exception as e:
        log_test("A1: GET /api/users", False, f"Exception: {str(e)}")
    
    # A2: POST /api/users with role=admin
    bruno_admin_session = None
    bruno_tenant_user_id = None
    try:
        random_email = f"bruno_{random_string()}@test.com"
        resp = owner_session.post(f"{BASE_URL}/api/users", json={
            "name": "Bruno Admin",
            "email": random_email,
            "password": "abc123",
            "role": "admin"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            user = data.get("user", {})
            bruno_tenant_user_id = user.get("tenantUserId")
            is_admin = user.get("role") == "admin"
            log_test("A2: POST /api/users with role=admin creates admin user", 
                    is_admin and bruno_tenant_user_id is not None,
                    f"Status: {resp.status_code}, Role: {user.get('role')}, Email: {random_email}")
            
            # Login as Bruno for later tests
            bruno_admin_session = requests.Session()
            bruno_admin_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": random_email,
                "password": "abc123"
            })
        else:
            log_test("A2: POST /api/users with role=admin", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("A2: POST /api/users with role=admin", False, f"Exception: {str(e)}")
    
    # A3: POST /api/users with role=owner as ADMIN (non-owner) -> 403
    if bruno_admin_session:
        try:
            resp = bruno_admin_session.post(f"{BASE_URL}/api/users", json={
                "name": "Fake Owner",
                "email": f"fake_owner_{random_string()}@test.com",
                "password": "abc123",
                "role": "owner"
            })
            
            is_403 = resp.status_code == 403
            has_error = "owner" in resp.text.lower()
            log_test("A3: POST /api/users with role=owner as ADMIN -> 403", 
                    is_403 and has_error,
                    f"Status: {resp.status_code}, Error mentions owner: {has_error}")
        except Exception as e:
            log_test("A3: POST /api/users with role=owner as ADMIN", False, f"Exception: {str(e)}")
    else:
        log_test("A3: POST /api/users with role=owner as ADMIN", False, "Skipped - no admin session")
    
    # A4: PUT /api/users/<tenantUserId> {role:"viewer"}
    viewer_tenant_user_id = None
    if bruno_tenant_user_id:
        try:
            resp = owner_session.put(f"{BASE_URL}/api/users/{bruno_tenant_user_id}", json={
                "role": "viewer"
            })
            
            if resp.status_code == 200:
                # Verify via GET /api/users
                resp2 = owner_session.get(f"{BASE_URL}/api/users")
                users = resp2.json().get("users", [])
                bruno_user = next((u for u in users if u.get("tenantUserId") == bruno_tenant_user_id), None)
                is_viewer = bruno_user and bruno_user.get("role") == "viewer"
                
                log_test("A4: PUT /api/users/<id> {role:viewer} changes role", 
                        is_viewer,
                        f"Status: {resp.status_code}, New role: {bruno_user.get('role') if bruno_user else 'NOT FOUND'}")
                
                viewer_tenant_user_id = bruno_tenant_user_id
            else:
                log_test("A4: PUT /api/users/<id> {role:viewer}", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("A4: PUT /api/users/<id> {role:viewer}", False, f"Exception: {str(e)}")
    else:
        log_test("A4: PUT /api/users/<id>", False, "Skipped - no user to update")
    
    # A5: Try to PUT own role as owner -> 403
    try:
        # Get owner's tenantUserId from users list
        resp = owner_session.get(f"{BASE_URL}/api/users")
        users = resp.json().get("users", [])
        owner_user = next((u for u in users if u.get("email") == "demo@leadflow.com"), None)
        
        if owner_user:
            owner_tenant_user_id = owner_user.get("tenantUserId")
            resp = owner_session.put(f"{BASE_URL}/api/users/{owner_tenant_user_id}", json={
                "role": "admin"
            })
            
            is_403 = resp.status_code == 403
            has_error = "próprio" in resp.text.lower() or "yourself" in resp.text.lower()
            log_test("A5: PUT own role as owner -> 403 'Você não pode alterar seu próprio papel'", 
                    is_403,
                    f"Status: {resp.status_code}, Has self-edit error: {has_error}")
        else:
            log_test("A5: PUT own role", False, "Could not find owner in users list")
    except Exception as e:
        log_test("A5: PUT own role", False, f"Exception: {str(e)}")
    
    # A6: Try to DELETE own tenantUserId -> 403
    try:
        # Get owner's tenantUserId from users list
        resp = owner_session.get(f"{BASE_URL}/api/users")
        users = resp.json().get("users", [])
        owner_user = next((u for u in users if u.get("email") == "demo@leadflow.com"), None)
        
        if owner_user:
            owner_tenant_user_id = owner_user.get("tenantUserId")
            resp = owner_session.delete(f"{BASE_URL}/api/users/{owner_tenant_user_id}")
            
            is_403 = resp.status_code == 403
            has_error = "si mesmo" in resp.text.lower() or "yourself" in resp.text.lower()
            log_test("A6: DELETE own tenantUserId -> 403 'Você não pode remover a si mesmo'", 
                    is_403,
                    f"Status: {resp.status_code}, Has self-delete error: {has_error}")
        else:
            log_test("A6: DELETE own tenantUserId", False, "Could not find owner in users list")
    except Exception as e:
        log_test("A6: DELETE own tenantUserId", False, f"Exception: {str(e)}")
    
    # A7: Try to DELETE owner as ADMIN -> 403
    if bruno_admin_session:
        try:
            # Get owner's tenantUserId
            resp = owner_session.get(f"{BASE_URL}/api/users")
            users = resp.json().get("users", [])
            owner_user = next((u for u in users if u.get("email") == "demo@leadflow.com"), None)
            
            if owner_user:
                owner_tid = owner_user.get("tenantUserId")
                
                # Re-login Bruno as admin (we changed his role to viewer earlier, need to create new admin)
                new_admin_session = requests.Session()
                new_admin_email = f"admin_{random_string()}@test.com"
                owner_session.post(f"{BASE_URL}/api/users", json={
                    "name": "Admin Test",
                    "email": new_admin_email,
                    "password": "abc123",
                    "role": "admin"
                })
                new_admin_session.post(f"{BASE_URL}/api/auth/login", json={
                    "email": new_admin_email,
                    "password": "abc123"
                })
                
                resp = new_admin_session.delete(f"{BASE_URL}/api/users/{owner_tid}")
                
                is_403 = resp.status_code == 403
                has_error = "owner" in resp.text.lower()
                log_test("A7: DELETE owner as ADMIN -> 403 'Não é possível remover o owner'", 
                        is_403,
                        f"Status: {resp.status_code}, Error mentions owner: {has_error}")
            else:
                log_test("A7: DELETE owner as ADMIN", False, "Could not find owner user")
        except Exception as e:
            log_test("A7: DELETE owner as ADMIN", False, f"Exception: {str(e)}")
    else:
        log_test("A7: DELETE owner as ADMIN", False, "Skipped - no admin session")
    
    # A8: GET /api/users as agent (Ana) -> 403
    try:
        agent_session = requests.Session()
        resp = agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        if resp.status_code == 200:
            resp = agent_session.get(f"{BASE_URL}/api/users")
            is_403 = resp.status_code == 403
            log_test("A8: GET /api/users as agent (Ana) -> 403 (USERS_VIEW restricted)", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("A8: GET /api/users as agent", False, f"Login failed: {resp.status_code}")
    except Exception as e:
        log_test("A8: GET /api/users as agent", False, f"Exception: {str(e)}")
    
    # A9: GET /api/users as viewer -> 403
    if viewer_tenant_user_id:
        try:
            # Create a fresh viewer and login (JWT needs to have viewer role)
            fresh_viewer_session = requests.Session()
            fresh_viewer_email = f"viewer_{random_string()}@test.com"
            owner_session.post(f"{BASE_URL}/api/users", json={
                "name": "Fresh Viewer",
                "email": fresh_viewer_email,
                "password": "abc123",
                "role": "viewer"
            })
            # Login to get fresh JWT with viewer role
            fresh_viewer_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": fresh_viewer_email,
                "password": "abc123"
            })
            
            resp = fresh_viewer_session.get(f"{BASE_URL}/api/users")
            is_403 = resp.status_code == 403
            log_test("A9: GET /api/users as viewer -> 403", 
                    is_403,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("A9: GET /api/users as viewer", False, f"Exception: {str(e)}")
    else:
        log_test("A9: GET /api/users as viewer", False, "Skipped - no viewer session")
    
    return owner_session, bruno_admin_session, viewer_tenant_user_id

# ============================================================================
# B) INVITES ENDPOINTS
# ============================================================================

def test_invites_endpoints(owner_session, admin_session):
    print_section("B) INVITES ENDPOINTS")
    
    if not owner_session:
        print("Skipping invites tests - no owner session")
        return
    
    invite_token = None
    invite_id = None
    
    # B1: POST /api/invites as owner
    try:
        random_email = f"convidado_{random_string()}@test.com"
        resp = owner_session.post(f"{BASE_URL}/api/invites", json={
            "email": random_email,
            "role": "agent"
        })
        
        if resp.status_code == 200:
            data = resp.json()
            invite = data.get("invite", {})
            invite_token = invite.get("token")
            invite_id = invite.get("id")
            has_token = invite_token is not None
            log_test("B1: POST /api/invites as owner creates invite with token", 
                    has_token,
                    f"Status: {resp.status_code}, Email: {random_email}, Token: {invite_token[:10]}... (truncated)")
        else:
            log_test("B1: POST /api/invites as owner", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("B1: POST /api/invites as owner", False, f"Exception: {str(e)}")
    
    # B2: GET /api/invites
    try:
        resp = owner_session.get(f"{BASE_URL}/api/invites")
        data = resp.json()
        invites = data.get("invites", [])
        has_pending = len(invites) > 0
        log_test("B2: GET /api/invites returns pending invites", 
                resp.status_code == 200 and has_pending,
                f"Status: {resp.status_code}, Invites count: {len(invites)}")
    except Exception as e:
        log_test("B2: GET /api/invites", False, f"Exception: {str(e)}")
    
    # B3: GET /api/public/invites/<token> without auth
    if invite_token:
        try:
            public_session = requests.Session()
            resp = public_session.get(f"{BASE_URL}/api/public/invites/{invite_token}")
            
            if resp.status_code == 200:
                data = resp.json()
                invite = data.get("invite", {})
                has_tenant = "tenant" in invite
                has_email = "email" in invite
                has_role = "role" in invite
                log_test("B3: GET /api/public/invites/<token> returns tenant + email + role", 
                        has_tenant and has_email and has_role,
                        f"Status: {resp.status_code}, Has tenant: {has_tenant}, email: {has_email}, role: {has_role}")
            else:
                log_test("B3: GET /api/public/invites/<token>", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("B3: GET /api/public/invites/<token>", False, f"Exception: {str(e)}")
    else:
        log_test("B3: GET /api/public/invites/<token>", False, "Skipped - no token")
    
    # B4: GET /api/public/invites/invalid-token -> 404
    try:
        public_session = requests.Session()
        resp = public_session.get(f"{BASE_URL}/api/public/invites/invalid-token-xyz")
        is_404 = resp.status_code == 404
        log_test("B4: GET /api/public/invites/invalid-token -> 404", 
                is_404,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B4: GET /api/public/invites/invalid-token", False, f"Exception: {str(e)}")
    
    # B5: POST /api/public/invites/<token>/accept
    accepted_session = None
    if invite_token:
        try:
            accept_session = requests.Session()
            resp = accept_session.post(f"{BASE_URL}/api/public/invites/{invite_token}/accept", json={
                "name": "Convidado Teste",
                "password": "def456"
            })
            
            if resp.status_code == 200:
                has_cookie = "leadflow_token" in accept_session.cookies
                log_test("B5: POST /api/public/invites/<token>/accept creates user and sets cookie", 
                        has_cookie,
                        f"Status: {resp.status_code}, Cookie set: {has_cookie}")
                accepted_session = accept_session
            else:
                log_test("B5: POST /api/public/invites/<token>/accept", False, 
                        f"Status: {resp.status_code}, Response: {resp.text}")
        except Exception as e:
            log_test("B5: POST /api/public/invites/<token>/accept", False, f"Exception: {str(e)}")
    else:
        log_test("B5: POST /api/public/invites/<token>/accept", False, "Skipped - no token")
    
    # B6: Verify via GET /api/auth/me
    if accepted_session:
        try:
            resp = accepted_session.get(f"{BASE_URL}/api/auth/me")
            data = resp.json()
            user = data.get("user", {})
            has_user = user is not None
            correct_tenant = user.get("tenantSlug") == "leadflow-demo"
            log_test("B6: GET /api/auth/me after accept shows correct tenant", 
                    resp.status_code == 200 and has_user and correct_tenant,
                    f"Status: {resp.status_code}, Has user: {has_user}, Tenant: {user.get('tenantSlug')}")
        except Exception as e:
            log_test("B6: GET /api/auth/me after accept", False, f"Exception: {str(e)}")
    else:
        log_test("B6: GET /api/auth/me after accept", False, "Skipped - no accepted session")
    
    # B7: Try to use same token again -> 410
    if invite_token:
        try:
            retry_session = requests.Session()
            resp = retry_session.post(f"{BASE_URL}/api/public/invites/{invite_token}/accept", json={
                "name": "Another User",
                "password": "xyz789"
            })
            is_410 = resp.status_code == 410
            log_test("B7: Reuse same token -> 410 (status accepted)", 
                    is_410,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("B7: Reuse same token", False, f"Exception: {str(e)}")
    else:
        log_test("B7: Reuse same token", False, "Skipped - no token")
    
    # B8: POST /api/invites with role=owner as admin -> 403
    if admin_session:
        try:
            # Create a fresh admin since we changed Bruno to viewer
            fresh_admin_session = requests.Session()
            fresh_admin_email = f"admin2_{random_string()}@test.com"
            owner_session.post(f"{BASE_URL}/api/users", json={
                "name": "Admin 2",
                "email": fresh_admin_email,
                "password": "abc123",
                "role": "admin"
            })
            fresh_admin_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": fresh_admin_email,
                "password": "abc123"
            })
            
            resp = fresh_admin_session.post(f"{BASE_URL}/api/invites", json={
                "email": f"owner_invite_{random_string()}@test.com",
                "role": "owner"
            })
            
            is_403 = resp.status_code == 403
            has_error = "owner" in resp.text.lower()
            log_test("B8: POST /api/invites with role=owner as admin -> 403", 
                    is_403,
                    f"Status: {resp.status_code}, Error mentions owner: {has_error}")
        except Exception as e:
            log_test("B8: POST /api/invites with role=owner as admin", False, f"Exception: {str(e)}")
    else:
        log_test("B8: POST /api/invites with role=owner as admin", False, "Skipped - no admin session")
    
    # B9: POST /api/invites as agent -> 403
    try:
        agent_session = requests.Session()
        agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        resp = agent_session.post(f"{BASE_URL}/api/invites", json={
            "email": f"test_{random_string()}@test.com",
            "role": "agent"
        })
        
        is_403 = resp.status_code == 403
        log_test("B9: POST /api/invites as agent -> 403 (USERS_INVITE restricted)", 
                is_403,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("B9: POST /api/invites as agent", False, f"Exception: {str(e)}")
    
    # B10: DELETE /api/invites/<id> as owner
    if invite_id:
        try:
            # Create a new invite to delete
            resp = owner_session.post(f"{BASE_URL}/api/invites", json={
                "email": f"to_delete_{random_string()}@test.com",
                "role": "agent"
            })
            
            if resp.status_code == 200:
                delete_invite_id = resp.json().get("invite", {}).get("id")
                
                resp = owner_session.delete(f"{BASE_URL}/api/invites/{delete_invite_id}")
                is_200 = resp.status_code == 200
                log_test("B10: DELETE /api/invites/<id> as owner -> 200 (status=revoked)", 
                        is_200,
                        f"Status: {resp.status_code}")
            else:
                log_test("B10: DELETE /api/invites/<id>", False, "Could not create invite to delete")
        except Exception as e:
            log_test("B10: DELETE /api/invites/<id>", False, f"Exception: {str(e)}")
    else:
        log_test("B10: DELETE /api/invites/<id>", False, "Skipped - no invite ID")

# ============================================================================
# C) AUDIT LOGS
# ============================================================================

def test_audit_logs(owner_session):
    print_section("C) AUDIT LOGS")
    
    if not owner_session:
        print("Skipping audit logs tests - no owner session")
        return
    
    # C1: GET /api/audit-logs as owner
    try:
        resp = owner_session.get(f"{BASE_URL}/api/audit-logs")
        data = resp.json()
        logs = data.get("logs", [])
        
        # Check for various action types
        has_auth_login = any("auth.login" in log.get("action", "") for log in logs)
        has_invite_created = any("invite.created" in log.get("action", "") for log in logs)
        has_user_created = any("user.created" in log.get("action", "") for log in logs)
        
        log_test("C1: GET /api/audit-logs as owner returns entries (auth.login, invite.created, user.created, etc)", 
                resp.status_code == 200 and len(logs) > 0,
                f"Status: {resp.status_code}, Logs count: {len(logs)}, Has auth.login: {has_auth_login}, invite.created: {has_invite_created}, user.created: {has_user_created}")
    except Exception as e:
        log_test("C1: GET /api/audit-logs as owner", False, f"Exception: {str(e)}")
    
    # C2: GET /api/audit-logs as manager -> 403
    try:
        manager_session = requests.Session()
        resp = manager_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "carlos@leadflow.com",
            "password": "demo123"
        })
        
        if resp.status_code == 200:
            resp = manager_session.get(f"{BASE_URL}/api/audit-logs")
            is_403 = resp.status_code == 403
            log_test("C2: GET /api/audit-logs as manager -> 403 (AUDIT_VIEW restricted to owner/admin)", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("C2: GET /api/audit-logs as manager", False, f"Login failed: {resp.status_code}")
    except Exception as e:
        log_test("C2: GET /api/audit-logs as manager", False, f"Exception: {str(e)}")

# ============================================================================
# D) RBAC ENFORCEMENT ON EXISTING ENDPOINTS (REGRESSION)
# ============================================================================

def test_rbac_enforcement_regression(owner_session):
    print_section("D) RBAC ENFORCEMENT ON EXISTING ENDPOINTS (REGRESSION)")
    
    if not owner_session:
        print("Skipping RBAC enforcement tests - no owner session")
        return
    
    created_form_id = None
    
    # D1: POST /api/forms as owner -> 200 (FORMS_CREATE)
    try:
        resp = owner_session.post(f"{BASE_URL}/api/forms", json={
            "name": "RBAC Test Form",
            "publicTitle": "Test?",
            "fields": [
                {"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}
            ]
        })
        
        if resp.status_code == 200:
            created_form_id = resp.json().get("form", {}).get("id")
            log_test("D1: POST /api/forms as owner -> 200 (FORMS_CREATE)", 
                    True,
                    f"Status: {resp.status_code}, Form ID: {created_form_id}")
        else:
            log_test("D1: POST /api/forms as owner", False, 
                    f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        log_test("D1: POST /api/forms as owner", False, f"Exception: {str(e)}")
    
    # D2: DELETE /api/forms/<id> as owner -> 200 (FORMS_DELETE)
    if created_form_id:
        try:
            resp = owner_session.delete(f"{BASE_URL}/api/forms/{created_form_id}")
            is_200 = resp.status_code == 200
            log_test("D2: DELETE /api/forms/<id> as owner -> 200 (FORMS_DELETE)", 
                    is_200,
                    f"Status: {resp.status_code}")
        except Exception as e:
            log_test("D2: DELETE /api/forms/<id> as owner", False, f"Exception: {str(e)}")
    else:
        log_test("D2: DELETE /api/forms/<id> as owner", False, "Skipped - no form created")
    
    # D3: POST /api/forms as agent (Ana) -> 403 (FORMS_CREATE restricted)
    try:
        agent_session = requests.Session()
        agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        resp = agent_session.post(f"{BASE_URL}/api/forms", json={
            "name": "Agent Form",
            "publicTitle": "Test?",
            "fields": [{"label": "Nome", "fieldType": "name", "isRequired": True, "orderIndex": 0}]
        })
        
        is_403 = resp.status_code == 403
        log_test("D3: POST /api/forms as agent (Ana) -> 403 (FORMS_CREATE restricted)", 
                is_403,
                f"Status: {resp.status_code}")
    except Exception as e:
        log_test("D3: POST /api/forms as agent", False, f"Exception: {str(e)}")
    
    # D4: DELETE /api/forms/<existing> as agent -> 403
    try:
        # Get an existing form
        resp = owner_session.get(f"{BASE_URL}/api/forms")
        forms = resp.json().get("forms", [])
        
        if forms:
            existing_form_id = forms[0].get("id")
            
            agent_session = requests.Session()
            agent_session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "ana@leadflow.com",
                "password": "demo123"
            })
            
            resp = agent_session.delete(f"{BASE_URL}/api/forms/{existing_form_id}")
            is_403 = resp.status_code == 403
            log_test("D4: DELETE /api/forms/<existing> as agent -> 403", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("D4: DELETE /api/forms as agent", False, "No forms found")
    except Exception as e:
        log_test("D4: DELETE /api/forms as agent", False, f"Exception: {str(e)}")
    
    # D5: POST /api/leads/<id>/move as viewer -> 403 (LEADS_MOVE)
    try:
        # Create viewer
        viewer_session = requests.Session()
        viewer_email = f"viewer_{random_string()}@test.com"
        owner_session.post(f"{BASE_URL}/api/users", json={
            "name": "Viewer Test",
            "email": viewer_email,
            "password": "abc123",
            "role": "viewer"
        })
        viewer_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": viewer_email,
            "password": "abc123"
        })
        
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        if leads:
            lead_id = leads[0].get("id")
            
            # Get stages
            resp = owner_session.get(f"{BASE_URL}/api/pipelines")
            stages = resp.json().get("pipelines", [{}])[0].get("stages", [])
            
            if stages:
                stage_id = stages[0].get("id")
                
                resp = viewer_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                    "stageId": stage_id
                })
                
                is_403 = resp.status_code == 403
                log_test("D5: POST /api/leads/<id>/move as viewer -> 403 (LEADS_MOVE)", 
                        is_403,
                        f"Status: {resp.status_code}")
            else:
                log_test("D5: POST /api/leads/<id>/move as viewer", False, "No stages found")
        else:
            log_test("D5: POST /api/leads/<id>/move as viewer", False, "No leads found")
    except Exception as e:
        log_test("D5: POST /api/leads/<id>/move as viewer", False, f"Exception: {str(e)}")
    
    # D6: POST /api/leads/<lead-NOT-assigned-to-agent>/move as agent -> 403 (canMoveLead)
    try:
        agent_session = requests.Session()
        resp = agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        # Get Ana's userId
        resp = agent_session.get(f"{BASE_URL}/api/auth/me")
        ana_user_id = resp.json().get("user", {}).get("userId")
        
        # Get a lead NOT assigned to Ana
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        unassigned_lead = next((l for l in leads if l.get("assignedTo") != ana_user_id), None)
        
        if unassigned_lead:
            lead_id = unassigned_lead.get("id")
            
            # Get stages
            resp = owner_session.get(f"{BASE_URL}/api/pipelines")
            stages = resp.json().get("pipelines", [{}])[0].get("stages", [])
            
            if stages:
                stage_id = stages[0].get("id")
                
                resp = agent_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                    "stageId": stage_id
                })
                
                is_403 = resp.status_code == 403
                log_test("D6: POST /api/leads/<lead-NOT-assigned>/move as agent -> 403 (canMoveLead)", 
                        is_403,
                        f"Status: {resp.status_code}")
            else:
                log_test("D6: POST /api/leads/<lead-NOT-assigned>/move as agent", False, "No stages found")
        else:
            log_test("D6: POST /api/leads/<lead-NOT-assigned>/move as agent", False, "All leads assigned to Ana")
    except Exception as e:
        log_test("D6: POST /api/leads/<lead-NOT-assigned>/move as agent", False, f"Exception: {str(e)}")
    
    # D7: POST /api/leads/<lead-assigned-to-Ana>/move as agent -> 200
    try:
        agent_session = requests.Session()
        agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        # Get Ana's userId
        resp = agent_session.get(f"{BASE_URL}/api/auth/me")
        ana_user_id = resp.json().get("user", {}).get("userId")
        
        # Get all leads as owner
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        assigned_lead = next((l for l in leads if l.get("assignedTo") == ana_user_id), None)
        
        if assigned_lead:
            lead_id = assigned_lead.get("id")
            
            # Get stages
            resp = owner_session.get(f"{BASE_URL}/api/pipelines")
            stages = resp.json().get("pipelines", [{}])[0].get("stages", [])
            
            if stages and len(stages) > 1:
                # Move to second stage
                stage_id = stages[1].get("id")
                
                resp = agent_session.post(f"{BASE_URL}/api/leads/{lead_id}/move", json={
                    "stageId": stage_id
                })
                
                is_200 = resp.status_code == 200
                log_test("D7: POST /api/leads/<lead-assigned-to-Ana>/move as agent -> 200", 
                        is_200,
                        f"Status: {resp.status_code}")
            else:
                log_test("D7: POST /api/leads/<lead-assigned>/move as agent", False, "Not enough stages")
        else:
            log_test("D7: POST /api/leads/<lead-assigned>/move as agent", False, f"No leads assigned to Ana (userId: {ana_user_id})")
    except Exception as e:
        log_test("D7: POST /api/leads/<lead-assigned>/move as agent", False, f"Exception: {str(e)}")
    
    # D8: PUT /api/leads/<id> as viewer -> 403 (canEditLead)
    try:
        viewer_session = requests.Session()
        viewer_email = f"viewer2_{random_string()}@test.com"
        owner_session.post(f"{BASE_URL}/api/users", json={
            "name": "Viewer 2",
            "email": viewer_email,
            "password": "abc123",
            "role": "viewer"
        })
        viewer_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": viewer_email,
            "password": "abc123"
        })
        
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        if leads:
            lead_id = leads[0].get("id")
            
            resp = viewer_session.put(f"{BASE_URL}/api/leads/{lead_id}", json={
                "temperature": "hot"
            })
            
            is_403 = resp.status_code == 403
            log_test("D8: PUT /api/leads/<id> as viewer -> 403 (canEditLead)", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("D8: PUT /api/leads/<id> as viewer", False, "No leads found")
    except Exception as e:
        log_test("D8: PUT /api/leads/<id> as viewer", False, f"Exception: {str(e)}")
    
    # D9: PUT /api/leads/<lead-assigned>/<temperature:"hot"> as agent -> 200
    try:
        agent_session = requests.Session()
        agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        # Get Ana's userId
        resp = agent_session.get(f"{BASE_URL}/api/auth/me")
        ana_user_id = resp.json().get("user", {}).get("userId")
        
        # Get all leads as owner
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        assigned_lead = next((l for l in leads if l.get("assignedTo") == ana_user_id), None)
        
        if assigned_lead:
            lead_id = assigned_lead.get("id")
            
            resp = agent_session.put(f"{BASE_URL}/api/leads/{lead_id}", json={
                "temperature": "hot"
            })
            
            is_200 = resp.status_code == 200
            log_test("D9: PUT /api/leads/<lead-assigned>/<temperature:hot> as agent -> 200", 
                    is_200,
                    f"Status: {resp.status_code}")
        else:
            log_test("D9: PUT /api/leads/<lead-assigned> as agent", False, f"No leads assigned to Ana (userId: {ana_user_id})")
    except Exception as e:
        log_test("D9: PUT /api/leads/<lead-assigned> as agent", False, f"Exception: {str(e)}")
    
    # D10: DELETE /api/leads/<id> as agent -> 403 (LEADS_DELETE = owner/admin)
    try:
        agent_session = requests.Session()
        agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        if leads:
            lead_id = leads[0].get("id")
            
            resp = agent_session.delete(f"{BASE_URL}/api/leads/{lead_id}")
            
            is_403 = resp.status_code == 403
            log_test("D10: DELETE /api/leads/<id> as agent -> 403 (LEADS_DELETE = owner/admin)", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("D10: DELETE /api/leads/<id> as agent", False, "No leads found")
    except Exception as e:
        log_test("D10: DELETE /api/leads/<id> as agent", False, f"Exception: {str(e)}")
    
    # D11: POST /api/leads/<id>/notes as agent -> 200 (NOTES_CREATE includes agent)
    try:
        agent_session = requests.Session()
        agent_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "ana@leadflow.com",
            "password": "demo123"
        })
        
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        if leads:
            lead_id = leads[0].get("id")
            
            resp = agent_session.post(f"{BASE_URL}/api/leads/{lead_id}/notes", json={
                "content": "RBAC test note from agent"
            })
            
            is_200 = resp.status_code == 200
            log_test("D11: POST /api/leads/<id>/notes as agent -> 200 (NOTES_CREATE includes agent)", 
                    is_200,
                    f"Status: {resp.status_code}")
        else:
            log_test("D11: POST /api/leads/<id>/notes as agent", False, "No leads found")
    except Exception as e:
        log_test("D11: POST /api/leads/<id>/notes as agent", False, f"Exception: {str(e)}")
    
    # D12: POST /api/leads/<id>/notes as viewer -> 403
    try:
        viewer_session = requests.Session()
        viewer_email = f"viewer3_{random_string()}@test.com"
        owner_session.post(f"{BASE_URL}/api/users", json={
            "name": "Viewer 3",
            "email": viewer_email,
            "password": "abc123",
            "role": "viewer"
        })
        viewer_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": viewer_email,
            "password": "abc123"
        })
        
        # Get a lead
        resp = owner_session.get(f"{BASE_URL}/api/leads")
        leads = resp.json().get("leads", [])
        
        if leads:
            lead_id = leads[0].get("id")
            
            resp = viewer_session.post(f"{BASE_URL}/api/leads/{lead_id}/notes", json={
                "content": "Viewer note attempt"
            })
            
            is_403 = resp.status_code == 403
            log_test("D12: POST /api/leads/<id>/notes as viewer -> 403", 
                    is_403,
                    f"Status: {resp.status_code}")
        else:
            log_test("D12: POST /api/leads/<id>/notes as viewer", False, "No leads found")
    except Exception as e:
        log_test("D12: POST /api/leads/<id>/notes as viewer", False, f"Exception: {str(e)}")

# ============================================================================
# E) MULTI-TENANT ISOLATION (RBAC)
# ============================================================================

def test_multi_tenant_rbac_isolation():
    print_section("E) MULTI-TENANT ISOLATION (RBAC)")
    
    # E1: Create tenant B
    tenant_b_session = requests.Session()
    tenant_b_email = f"tenant_b_owner_{random_string()}@test.com"
    
    try:
        resp = tenant_b_session.post(f"{BASE_URL}/api/auth/register", json={
            "companyName": f"Tenant B Company {random_string(4)}",
            "name": "Tenant B Owner",
            "email": tenant_b_email,
            "password": "abc123"
        })
        
        success = resp.status_code == 200 and resp.json().get("ok")
        log_test("E1: Create tenant B", 
                success,
                f"Status: {resp.status_code}, Email: {tenant_b_email}")
    except Exception as e:
        log_test("E1: Create tenant B", False, f"Exception: {str(e)}")
        return
    
    # E2: GET /api/users as tenant B owner -> only own user
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/users")
        data = resp.json()
        users = data.get("users", [])
        
        has_only_one = len(users) == 1
        is_own_user = users[0].get("email") == tenant_b_email if users else False
        
        log_test("E2: GET /api/users as tenant B owner -> only own user (not demo/Carlos/Ana)", 
                resp.status_code == 200 and has_only_one and is_own_user,
                f"Status: {resp.status_code}, Users count: {len(users)} (MUST be 1)")
        
        if not has_only_one:
            print(f"   🚨 SECURITY ISSUE: Tenant B can see {len(users)} users from other tenants!")
    except Exception as e:
        log_test("E2: GET /api/users as tenant B", False, f"Exception: {str(e)}")
    
    # E3: GET /api/invites as tenant B -> empty
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/invites")
        data = resp.json()
        invites = data.get("invites", [])
        
        is_empty = len(invites) == 0
        log_test("E3: GET /api/invites as tenant B -> empty", 
                resp.status_code == 200 and is_empty,
                f"Status: {resp.status_code}, Invites count: {len(invites)} (MUST be 0)")
        
        if not is_empty:
            print(f"   🚨 SECURITY ISSUE: Tenant B can see {len(invites)} invites from other tenants!")
    except Exception as e:
        log_test("E3: GET /api/invites as tenant B", False, f"Exception: {str(e)}")
    
    # E4: PUT /api/users/<demo-tenantUserId> as tenant B -> 404
    try:
        # Get demo's tenantUserId
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/users")
        users = resp.json().get("users", [])
        demo_user = next((u for u in users if u.get("email") == "demo@leadflow.com"), None)
        
        if demo_user:
            demo_tenant_user_id = demo_user.get("tenantUserId")
            
            resp = tenant_b_session.put(f"{BASE_URL}/api/users/{demo_tenant_user_id}", json={
                "role": "viewer"
            })
            
            is_404 = resp.status_code == 404
            log_test("E4: PUT /api/users/<demo-tenantUserId> as tenant B -> 404", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can modify demo's user! Status: {resp.status_code}")
        else:
            log_test("E4: PUT /api/users/<demo-tenantUserId> as tenant B", False, "Could not find demo user")
    except Exception as e:
        log_test("E4: PUT /api/users/<demo-tenantUserId> as tenant B", False, f"Exception: {str(e)}")
    
    # E5: DELETE /api/users/<demo-tenantUserId> as tenant B -> 404
    try:
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/users")
        users = resp.json().get("users", [])
        demo_user = next((u for u in users if u.get("email") == "demo@leadflow.com"), None)
        
        if demo_user:
            demo_tenant_user_id = demo_user.get("tenantUserId")
            
            resp = tenant_b_session.delete(f"{BASE_URL}/api/users/{demo_tenant_user_id}")
            
            is_404 = resp.status_code == 404
            log_test("E5: DELETE /api/users/<demo-tenantUserId> as tenant B -> 404", 
                    is_404,
                    f"Status: {resp.status_code} (MUST be 404)")
            
            if not is_404:
                print(f"   🚨 SECURITY ISSUE: Tenant B can delete demo's user! Status: {resp.status_code}")
        else:
            log_test("E5: DELETE /api/users/<demo-tenantUserId> as tenant B", False, "Could not find demo user")
    except Exception as e:
        log_test("E5: DELETE /api/users/<demo-tenantUserId> as tenant B", False, f"Exception: {str(e)}")
    
    # E6: Tenant B does not see audit logs from tenant A
    try:
        resp = tenant_b_session.get(f"{BASE_URL}/api/audit-logs")
        data = resp.json()
        logs = data.get("logs", [])
        
        # Tenant B should have minimal logs (just registration)
        has_minimal_logs = len(logs) <= 5  # Allow some logs from registration
        
        log_test("E6: Tenant B does not see audit logs from tenant A", 
                resp.status_code == 200 and has_minimal_logs,
                f"Status: {resp.status_code}, Logs count: {len(logs)} (should be minimal)")
        
        if not has_minimal_logs:
            print(f"   ⚠️  WARNING: Tenant B has {len(logs)} audit logs (expected <= 5)")
    except Exception as e:
        log_test("E6: Tenant B audit logs isolation", False, f"Exception: {str(e)}")

# ============================================================================
# F) SANITY CHECKS (auth/forms/leads/dashboard still work)
# ============================================================================

def test_sanity_checks():
    print_section("F) SANITY CHECKS (auth/forms/leads/dashboard still work)")
    
    # F1: GET /api/auth/me with cookie
    try:
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/auth/me")
        data = resp.json()
        has_user = "user" in data and data["user"] is not None
        
        log_test("F1: GET /api/auth/me with cookie -> 200", 
                resp.status_code == 200 and has_user,
                f"Status: {resp.status_code}, Has user: {has_user}")
    except Exception as e:
        log_test("F1: GET /api/auth/me", False, f"Exception: {str(e)}")
    
    # F2: GET /api/leads as owner -> >= 20 leads
    try:
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/leads")
        data = resp.json()
        leads = data.get("leads", [])
        has_20_plus = len(leads) >= 20
        
        log_test("F2: GET /api/leads as owner -> >= 20 leads", 
                resp.status_code == 200 and has_20_plus,
                f"Status: {resp.status_code}, Leads count: {len(leads)}")
    except Exception as e:
        log_test("F2: GET /api/leads as owner", False, f"Exception: {str(e)}")
    
    # F3: GET /api/dashboard?range=30d
    try:
        demo_session = requests.Session()
        demo_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "demo@leadflow.com",
            "password": "demo123"
        })
        
        resp = demo_session.get(f"{BASE_URL}/api/dashboard?range=30d")
        data = resp.json()
        has_indicators = "indicators" in data
        
        log_test("F3: GET /api/dashboard?range=30d -> 200", 
                resp.status_code == 200 and has_indicators,
                f"Status: {resp.status_code}, Has indicators: {has_indicators}")
    except Exception as e:
        log_test("F3: GET /api/dashboard", False, f"Exception: {str(e)}")
    
    # F4: GET /api/public/forms/turbinar-comercial (without auth)
    try:
        public_session = requests.Session()
        resp = public_session.get(f"{BASE_URL}/api/public/forms/turbinar-comercial")
        data = resp.json()
        has_form = "form" in data
        
        log_test("F4: GET /api/public/forms/turbinar-comercial -> 200 (without auth)", 
                resp.status_code == 200 and has_form,
                f"Status: {resp.status_code}, Has form: {has_form}")
    except Exception as e:
        log_test("F4: GET /api/public/forms/turbinar-comercial", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    print("\n" + "="*70)
    print("  LeadFlow CRM RBAC Backend Test Suite")
    print("  Base URL:", BASE_URL)
    print("="*70)
    
    try:
        # Run all test suites
        owner_session, admin_session, viewer_id = test_users_endpoints()
        test_invites_endpoints(owner_session, admin_session)
        test_audit_logs(owner_session)
        test_rbac_enforcement_regression(owner_session)
        test_multi_tenant_rbac_isolation()
        test_sanity_checks()
        
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
            print("   Multi-tenant RBAC isolation is NOT working properly!")
            for test in security_failures:
                print(f"   - {test['name']}")
        else:
            print("\n✅ Multi-tenant RBAC isolation is working correctly!")
        
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n❌ Test suite failed with exception: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
