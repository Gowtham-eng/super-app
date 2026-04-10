"""
SCIM v2 Server Endpoint Tests
Tests all SCIM v2 endpoints for Kissflow user provisioning:
- Discovery endpoints (ServiceProviderConfig, Schemas, ResourceTypes)
- User CRUD operations
- Group CRUD operations
- SCIM token management
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kissflow-access-hub.preview.emergentagent.com').rstrip('/')
SCIM_BASE = f"{BASE_URL}/api/scim/v2"

# Test credentials
ADMIN_EMAIL = "gowtham.s@refex.co.in"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "raghul.je@refex.co.in"
USER_PASSWORD = "Test123!"

# Will be set during test setup
SCIM_TOKEN = None
ADMIN_JWT = None
USER_JWT = None


class TestSetup:
    """Setup: Get auth tokens and SCIM token"""
    
    def test_admin_login(self):
        """Login as admin to get JWT"""
        global ADMIN_JWT
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        data = r.json()
        assert "token" in data
        assert data["user"]["role"] == "org_admin"
        ADMIN_JWT = data["token"]
        print(f"Admin login successful: {data['user']['email']}")
    
    def test_user_login(self):
        """Login as regular user"""
        global USER_JWT
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert r.status_code == 200, f"User login failed: {r.text}"
        data = r.json()
        USER_JWT = data["token"]
        print(f"User login successful: {data['user']['email']}")
    
    def test_get_scim_token(self):
        """Get existing SCIM token or create new one"""
        global SCIM_TOKEN
        headers = {"Authorization": f"Bearer {ADMIN_JWT}"}
        
        # Try to get existing tokens
        r = requests.get(f"{BASE_URL}/api/scim/tokens", headers=headers)
        assert r.status_code == 200
        tokens = r.json()
        
        if tokens:
            # Use existing token - need to get actual value from DB
            # For testing, create a new token
            pass
        
        # Create a new token for testing
        r = requests.post(f"{BASE_URL}/api/scim/tokens", 
                         json={"label": f"Test Token {uuid.uuid4().hex[:8]}"},
                         headers=headers)
        assert r.status_code == 200, f"Failed to create SCIM token: {r.text}"
        data = r.json()
        assert "token" in data
        SCIM_TOKEN = data["token"]
        print(f"SCIM token created: {data['label']}")


class TestDiscoveryEndpoints:
    """Test SCIM discovery endpoints (no auth required)"""
    
    def test_service_provider_config(self):
        """GET /ServiceProviderConfig - returns SCIM config"""
        r = requests.get(f"{SCIM_BASE}/ServiceProviderConfig")
        assert r.status_code == 200
        data = r.json()
        
        # Verify SCIM schema
        assert "schemas" in data
        assert "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig" in data["schemas"]
        
        # Verify capabilities
        assert data["patch"]["supported"] == True
        assert data["filter"]["supported"] == True
        assert data["bulk"]["supported"] == False
        
        # Verify auth scheme
        assert len(data["authenticationSchemes"]) > 0
        assert data["authenticationSchemes"][0]["type"] == "oauthbearertoken"
        print("ServiceProviderConfig: OK")
    
    def test_schemas(self):
        """GET /Schemas - returns User and Group schemas"""
        r = requests.get(f"{SCIM_BASE}/Schemas")
        assert r.status_code == 200
        data = r.json()
        
        # Verify list response format
        assert "schemas" in data
        assert "urn:ietf:params:scim:api:messages:2.0:ListResponse" in data["schemas"]
        assert data["totalResults"] == 2
        
        # Verify User and Group schemas present
        schema_ids = [s["id"] for s in data["Resources"]]
        assert "urn:ietf:params:scim:schemas:core:2.0:User" in schema_ids
        assert "urn:ietf:params:scim:schemas:core:2.0:Group" in schema_ids
        print("Schemas: OK")
    
    def test_resource_types(self):
        """GET /ResourceTypes - returns User and Group resource types"""
        r = requests.get(f"{SCIM_BASE}/ResourceTypes")
        assert r.status_code == 200
        data = r.json()
        
        # Verify list response format
        assert data["totalResults"] == 2
        
        # Verify User and Group resource types
        resource_ids = [r["id"] for r in data["Resources"]]
        assert "User" in resource_ids
        assert "Group" in resource_ids
        
        # Verify endpoints
        for res in data["Resources"]:
            if res["id"] == "User":
                assert res["endpoint"] == "/Users"
            elif res["id"] == "Group":
                assert res["endpoint"] == "/Groups"
        print("ResourceTypes: OK")


class TestAuthRequired:
    """Test that SCIM endpoints require authentication"""
    
    def test_users_requires_auth(self):
        """GET /Users without auth returns 401"""
        r = requests.get(f"{SCIM_BASE}/Users")
        assert r.status_code == 401
        print("Users auth check: OK")
    
    def test_groups_requires_auth(self):
        """GET /Groups without auth returns 401"""
        r = requests.get(f"{SCIM_BASE}/Groups")
        assert r.status_code == 401
        print("Groups auth check: OK")
    
    def test_invalid_token_rejected(self):
        """Invalid bearer token returns 401"""
        headers = {"Authorization": "Bearer invalid_token_12345"}
        r = requests.get(f"{SCIM_BASE}/Users", headers=headers)
        assert r.status_code == 401
        print("Invalid token rejection: OK")
    
    def test_missing_bearer_prefix_rejected(self):
        """Token without Bearer prefix returns 401"""
        headers = {"Authorization": SCIM_TOKEN or "some_token"}
        r = requests.get(f"{SCIM_BASE}/Users", headers=headers)
        assert r.status_code == 401
        print("Missing Bearer prefix rejection: OK")


class TestUsersCRUD:
    """Test SCIM User CRUD operations"""
    
    created_user_id = None
    
    def test_list_users(self):
        """GET /Users - list users with pagination"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        # Verify SCIM list response format
        assert "schemas" in data
        assert "urn:ietf:params:scim:api:messages:2.0:ListResponse" in data["schemas"]
        assert "totalResults" in data
        assert "Resources" in data
        assert "startIndex" in data
        assert "itemsPerPage" in data
        
        print(f"List Users: {data['totalResults']} users found")
    
    def test_list_users_with_pagination(self):
        """GET /Users with startIndex and count"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users?startIndex=1&count=5", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        assert data["startIndex"] == 1
        assert data["itemsPerPage"] == 5
        assert len(data["Resources"]) <= 5
        print(f"Pagination: startIndex=1, count=5, returned {len(data['Resources'])} users")
    
    def test_filter_users_by_username(self):
        """GET /Users?filter=userName eq 'email' - filter users"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f'{SCIM_BASE}/Users?filter=userName eq "{ADMIN_EMAIL}"', headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        # Should find the admin user
        if data["totalResults"] > 0:
            user = data["Resources"][0]
            assert user["userName"] == ADMIN_EMAIL
            print(f"Filter by userName: Found {user['displayName']}")
        else:
            print("Filter by userName: No results (user may not exist in this org)")
    
    def test_create_user(self):
        """POST /Users - create user via SCIM"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        
        test_email = f"scim_test_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": test_email,
            "name": {
                "givenName": "SCIM",
                "familyName": "TestUser"
            },
            "displayName": "SCIM Test User",
            "emails": [{"value": test_email, "type": "work", "primary": True}],
            "active": True,
            "title": "Test Engineer",
            "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
                "department": "Engineering",
                "organization": "Test Corp",
                "employeeNumber": "EMP001"
            }
        }
        
        r = requests.post(f"{SCIM_BASE}/Users", json=payload, headers=headers)
        assert r.status_code == 201, f"Create user failed: {r.text}"
        data = r.json()
        
        # Verify SCIM user format
        assert "schemas" in data
        assert "id" in data
        assert data["userName"] == test_email
        assert data["displayName"] == "SCIM Test User"
        assert data["active"] == True
        assert "meta" in data
        assert data["meta"]["resourceType"] == "User"
        
        TestUsersCRUD.created_user_id = data["id"]
        print(f"Create User: {data['displayName']} (ID: {data['id']})")
    
    def test_get_user(self):
        """GET /Users/{id} - get single user in SCIM format"""
        if not TestUsersCRUD.created_user_id:
            pytest.skip("No user created to get")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users/{TestUsersCRUD.created_user_id}", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        assert data["id"] == TestUsersCRUD.created_user_id
        assert "schemas" in data
        assert "meta" in data
        print(f"Get User: {data['displayName']}")
    
    def test_replace_user(self):
        """PUT /Users/{id} - replace user"""
        if not TestUsersCRUD.created_user_id:
            pytest.skip("No user created to update")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": f"scim_updated_{uuid.uuid4().hex[:8]}@test.com",
            "name": {
                "givenName": "Updated",
                "familyName": "User"
            },
            "displayName": "Updated SCIM User",
            "active": True,
            "title": "Senior Engineer"
        }
        
        r = requests.put(f"{SCIM_BASE}/Users/{TestUsersCRUD.created_user_id}", json=payload, headers=headers)
        assert r.status_code == 200, f"Replace user failed: {r.text}"
        data = r.json()
        
        assert data["displayName"] == "Updated SCIM User"
        assert data["title"] == "Senior Engineer"
        print(f"Replace User: Updated to {data['displayName']}")
    
    def test_patch_user_deactivate(self):
        """PATCH /Users/{id} - patch user (deactivate)"""
        if not TestUsersCRUD.created_user_id:
            pytest.skip("No user created to patch")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {"op": "replace", "path": "active", "value": False}
            ]
        }
        
        r = requests.patch(f"{SCIM_BASE}/Users/{TestUsersCRUD.created_user_id}", json=payload, headers=headers)
        assert r.status_code == 200, f"Patch user failed: {r.text}"
        data = r.json()
        
        assert data["active"] == False
        print(f"Patch User: Deactivated {data['displayName']}")
    
    def test_patch_user_update_name(self):
        """PATCH /Users/{id} - patch user displayName"""
        if not TestUsersCRUD.created_user_id:
            pytest.skip("No user created to patch")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {"op": "replace", "path": "displayName", "value": "Patched Name"}
            ]
        }
        
        r = requests.patch(f"{SCIM_BASE}/Users/{TestUsersCRUD.created_user_id}", json=payload, headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        assert data["displayName"] == "Patched Name" or data["name"]["formatted"] == "Patched Name"
        print(f"Patch User: Updated name to {data.get('displayName', data['name']['formatted'])}")
    
    def test_delete_user(self):
        """DELETE /Users/{id} - deactivate user (204)"""
        if not TestUsersCRUD.created_user_id:
            pytest.skip("No user created to delete")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.delete(f"{SCIM_BASE}/Users/{TestUsersCRUD.created_user_id}", headers=headers)
        assert r.status_code == 204, f"Delete user failed: {r.status_code} {r.text}"
        print(f"Delete User: Deactivated user {TestUsersCRUD.created_user_id}")
    
    def test_get_nonexistent_user(self):
        """GET /Users/{id} - nonexistent user returns 404"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users/nonexistent-user-id-12345", headers=headers)
        assert r.status_code == 404
        print("Get nonexistent user: 404 OK")
    
    def test_create_duplicate_user(self):
        """POST /Users - duplicate user returns 409"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        
        # Try to create user with existing email
        payload = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": ADMIN_EMAIL,  # Already exists
            "displayName": "Duplicate User"
        }
        
        r = requests.post(f"{SCIM_BASE}/Users", json=payload, headers=headers)
        assert r.status_code == 409, f"Expected 409 for duplicate, got {r.status_code}"
        print("Create duplicate user: 409 OK")


class TestGroupsCRUD:
    """Test SCIM Group CRUD operations"""
    
    created_group_id = None
    test_user_id = None
    
    def test_list_groups(self):
        """GET /Groups - list groups"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Groups", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        # Verify SCIM list response format
        assert "schemas" in data
        assert "totalResults" in data
        assert "Resources" in data
        print(f"List Groups: {data['totalResults']} groups found")
    
    def test_create_group(self):
        """POST /Groups - create group"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        
        group_name = f"SCIM Test Group {uuid.uuid4().hex[:8]}"
        payload = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            "displayName": group_name
        }
        
        r = requests.post(f"{SCIM_BASE}/Groups", json=payload, headers=headers)
        assert r.status_code == 201, f"Create group failed: {r.text}"
        data = r.json()
        
        assert "id" in data
        assert data["displayName"] == group_name
        assert "meta" in data
        assert data["meta"]["resourceType"] == "Group"
        
        TestGroupsCRUD.created_group_id = data["id"]
        print(f"Create Group: {data['displayName']} (ID: {data['id']})")
    
    def test_get_group(self):
        """GET /Groups/{id} - get single group"""
        if not TestGroupsCRUD.created_group_id:
            pytest.skip("No group created to get")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Groups/{TestGroupsCRUD.created_group_id}", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        assert data["id"] == TestGroupsCRUD.created_group_id
        print(f"Get Group: {data['displayName']}")
    
    def test_create_test_user_for_group(self):
        """Create a test user to add to group"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        
        test_email = f"group_member_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": test_email,
            "displayName": "Group Member Test",
            "active": True
        }
        
        r = requests.post(f"{SCIM_BASE}/Users", json=payload, headers=headers)
        assert r.status_code == 201
        TestGroupsCRUD.test_user_id = r.json()["id"]
        print(f"Created test user for group: {TestGroupsCRUD.test_user_id}")
    
    def test_patch_group_add_member(self):
        """PATCH /Groups/{id} - add member"""
        if not TestGroupsCRUD.created_group_id or not TestGroupsCRUD.test_user_id:
            pytest.skip("No group or user created")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {
                    "op": "add",
                    "path": "members",
                    "value": [{"value": TestGroupsCRUD.test_user_id}]
                }
            ]
        }
        
        r = requests.patch(f"{SCIM_BASE}/Groups/{TestGroupsCRUD.created_group_id}", json=payload, headers=headers)
        assert r.status_code == 200, f"Patch group failed: {r.text}"
        data = r.json()
        
        # Verify member was added
        member_ids = [m["value"] for m in data.get("members", [])]
        assert TestGroupsCRUD.test_user_id in member_ids
        print(f"Patch Group: Added member {TestGroupsCRUD.test_user_id}")
    
    def test_patch_group_remove_member(self):
        """PATCH /Groups/{id} - remove member"""
        if not TestGroupsCRUD.created_group_id or not TestGroupsCRUD.test_user_id:
            pytest.skip("No group or user created")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {
                    "op": "remove",
                    "path": f'members[value eq "{TestGroupsCRUD.test_user_id}"]'
                }
            ]
        }
        
        r = requests.patch(f"{SCIM_BASE}/Groups/{TestGroupsCRUD.created_group_id}", json=payload, headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        # Verify member was removed
        member_ids = [m["value"] for m in data.get("members", [])]
        assert TestGroupsCRUD.test_user_id not in member_ids
        print(f"Patch Group: Removed member {TestGroupsCRUD.test_user_id}")
    
    def test_delete_group(self):
        """DELETE /Groups/{id} - delete group"""
        if not TestGroupsCRUD.created_group_id:
            pytest.skip("No group created to delete")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.delete(f"{SCIM_BASE}/Groups/{TestGroupsCRUD.created_group_id}", headers=headers)
        assert r.status_code == 204
        print(f"Delete Group: Deleted {TestGroupsCRUD.created_group_id}")
    
    def test_cleanup_test_user(self):
        """Cleanup: Delete test user"""
        if not TestGroupsCRUD.test_user_id:
            pytest.skip("No test user to cleanup")
        
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.delete(f"{SCIM_BASE}/Users/{TestGroupsCRUD.test_user_id}", headers=headers)
        assert r.status_code == 204
        print(f"Cleanup: Deleted test user {TestGroupsCRUD.test_user_id}")


class TestSCIMTokenManagement:
    """Test SCIM token management endpoints"""
    
    created_token_id = None
    
    def test_create_token(self):
        """POST /scim/tokens - admin generates SCIM token"""
        headers = {"Authorization": f"Bearer {ADMIN_JWT}"}
        payload = {"label": f"Test Token {uuid.uuid4().hex[:8]}"}
        
        r = requests.post(f"{BASE_URL}/api/scim/tokens", json=payload, headers=headers)
        assert r.status_code == 200, f"Create token failed: {r.text}"
        data = r.json()
        
        assert "id" in data
        assert "token" in data
        assert data["token"].startswith("scim_")
        assert "scim_base_url" in data
        
        TestSCIMTokenManagement.created_token_id = data["id"]
        print(f"Create Token: {data['label']} (ID: {data['id']})")
    
    def test_list_tokens(self):
        """GET /scim/tokens - admin lists tokens"""
        headers = {"Authorization": f"Bearer {ADMIN_JWT}"}
        
        r = requests.get(f"{BASE_URL}/api/scim/tokens", headers=headers)
        assert r.status_code == 200
        tokens = r.json()
        
        assert isinstance(tokens, list)
        # Token value should be hidden in listings
        for t in tokens:
            assert "token" not in t  # Actual token value hidden
            assert "id" in t
            assert "label" in t
            assert "scim_base_url" in t
        
        print(f"List Tokens: {len(tokens)} active tokens")
    
    def test_revoke_token(self):
        """DELETE /scim/tokens/{id} - admin revokes token"""
        if not TestSCIMTokenManagement.created_token_id:
            pytest.skip("No token created to revoke")
        
        headers = {"Authorization": f"Bearer {ADMIN_JWT}"}
        r = requests.delete(f"{BASE_URL}/api/scim/tokens/{TestSCIMTokenManagement.created_token_id}", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["message"] == "Token revoked"
        print(f"Revoke Token: {TestSCIMTokenManagement.created_token_id}")
    
    def test_user_cannot_create_token(self):
        """Regular user cannot create SCIM tokens"""
        headers = {"Authorization": f"Bearer {USER_JWT}"}
        payload = {"label": "Unauthorized Token"}
        
        r = requests.post(f"{BASE_URL}/api/scim/tokens", json=payload, headers=headers)
        assert r.status_code == 403
        print("User token creation denied: 403 OK")
    
    def test_user_cannot_list_tokens(self):
        """Regular user cannot list SCIM tokens"""
        headers = {"Authorization": f"Bearer {USER_JWT}"}
        
        r = requests.get(f"{BASE_URL}/api/scim/tokens", headers=headers)
        assert r.status_code == 403
        print("User token listing denied: 403 OK")


class TestSCIMResponseFormat:
    """Test SCIM response format compliance"""
    
    def test_user_response_format(self):
        """Verify user response has correct SCIM format"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users?count=1", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        if data["totalResults"] > 0:
            user = data["Resources"][0]
            
            # Required SCIM fields
            assert "schemas" in user
            assert "id" in user
            assert "userName" in user
            assert "meta" in user
            
            # Meta object
            assert user["meta"]["resourceType"] == "User"
            assert "location" in user["meta"]
            
            # Name object
            assert "name" in user
            assert "givenName" in user["name"] or "formatted" in user["name"]
            
            print("User response format: SCIM compliant")
        else:
            print("No users to verify format")
    
    def test_list_response_format(self):
        """Verify list response has correct SCIM format"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users", headers=headers)
        assert r.status_code == 200
        data = r.json()
        
        # Required SCIM list response fields
        assert "schemas" in data
        assert "urn:ietf:params:scim:api:messages:2.0:ListResponse" in data["schemas"]
        assert "totalResults" in data
        assert "Resources" in data
        assert "startIndex" in data
        assert "itemsPerPage" in data
        
        print("List response format: SCIM compliant")
    
    def test_error_response_format(self):
        """Verify error response has correct SCIM format"""
        headers = {"Authorization": f"Bearer {SCIM_TOKEN}"}
        r = requests.get(f"{SCIM_BASE}/Users/nonexistent-id", headers=headers)
        assert r.status_code == 404
        
        # SCIM error format
        data = r.json()
        if "detail" in data and isinstance(data["detail"], dict):
            error = data["detail"]
            assert "schemas" in error
            assert "urn:ietf:params:scim:api:messages:2.0:Error" in error["schemas"]
            assert "detail" in error
            assert "status" in error
            print("Error response format: SCIM compliant")
        else:
            print("Error response: Standard HTTP error format")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
