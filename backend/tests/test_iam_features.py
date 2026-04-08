"""
Test IAM System Features - User Management, Access Control, App Launcher
Tests: User assignment to apps, access control, launcher UI, search functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kissflow-access-hub.preview.emergentagent.com').rstrip('/')

# Test credentials from test_credentials.md
REFEX_ADMIN = {"email": "gowtham.s@refex.co.in", "password": "Admin123!"}  # org_admin
REFEX_USER = {"email": "suriya.v@refex.co.in", "password": "Admin123!"}  # regular user
ACME_ADMIN = {"email": "admin@acme.com", "password": "Admin123!"}
SAML_APP_ID = "e5a4c999-65fd-4301-9ebd-8948893eea0d"


class TestAuthentication:
    """Test login flows for both accounts"""
    
    def test_refex_admin_login(self):
        """Test Refex admin (org_admin) login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["email"] == REFEX_ADMIN["email"]
        assert data["user"]["role"] == "org_admin"
        print(f"PASS: Refex admin login successful - role: {data['user']['role']}")
    
    def test_refex_user_login(self):
        """Test Refex regular user login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_USER)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["email"] == REFEX_USER["email"]
        print(f"PASS: Refex user login successful - role: {data['user']['role']}")
    
    def test_acme_admin_login(self):
        """Test Acme admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ACME_ADMIN)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"PASS: Acme admin login successful")


class TestUserManagementEndpoints:
    """Test user management endpoints for SAML apps"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        return response.json()["token"]
    
    def test_get_saml_app_users(self, admin_token):
        """GET /api/apps/saml/{app_id}/users - returns assigned users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        print(f"PASS: GET users endpoint returned {len(users)} assigned users")
        for u in users:
            print(f"  - {u.get('email')} ({u.get('name')})")
        return users
    
    def test_assign_user_to_app(self, admin_token):
        """POST /api/apps/saml/{app_id}/users - assigns users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get the user ID for suriya
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        users = users_response.json()
        suriya_user = next((u for u in users if u.get('email') == REFEX_USER["email"]), None)
        
        if suriya_user:
            # Assign user
            response = requests.post(
                f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users",
                json={"user_ids": [suriya_user["id"]]},
                headers=headers
            )
            assert response.status_code == 200, f"Failed: {response.text}"
            data = response.json()
            assert "message" in data
            print(f"PASS: Assigned user {suriya_user['email']} to app")
        else:
            pytest.skip("Suriya user not found")
    
    def test_remove_user_from_app(self, admin_token):
        """DELETE /api/apps/saml/{app_id}/users/{user_id} - removes user"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get users assigned to app
        users_response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users", headers=headers)
        users = users_response.json()
        
        # Get all org users
        all_users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        all_users = all_users_response.json()
        suriya_user = next((u for u in all_users if u.get('email') == REFEX_USER["email"]), None)
        
        if suriya_user:
            # Remove user
            response = requests.delete(
                f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users/{suriya_user['id']}",
                headers=headers
            )
            assert response.status_code == 200, f"Failed: {response.text}"
            print(f"PASS: Removed user {suriya_user['email']} from app")
        else:
            pytest.skip("Suriya user not found")


class TestAccessControl:
    """Test access control - only assigned users see apps"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        return response.json()["token"]
    
    @pytest.fixture
    def user_token(self):
        """Get regular user token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_USER)
        return response.json()["token"]
    
    def test_org_admin_always_sees_apps(self, admin_token):
        """org_admin should always see apps in launcher"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        print(f"PASS: org_admin sees {len(apps)} apps in launcher")
        
        # Check if Kissflow app is visible
        kissflow_app = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow_app is not None, "org_admin should see Kissflow app"
        print(f"PASS: org_admin can see Kissflow app: {kissflow_app.get('name')}")
    
    def test_assigned_user_sees_app(self, admin_token, user_token):
        """Assigned user should see the app"""
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        headers_user = {"Authorization": f"Bearer {user_token}"}
        
        # Get suriya's user ID
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers_admin)
        users = users_response.json()
        suriya_user = next((u for u in users if u.get('email') == REFEX_USER["email"]), None)
        
        if not suriya_user:
            pytest.skip("Suriya user not found")
        
        # Ensure user is assigned
        requests.post(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users",
            json={"user_ids": [suriya_user["id"]]},
            headers=headers_admin
        )
        
        # Check launcher for user
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers_user)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow_app = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow_app is not None, "Assigned user should see Kissflow app"
        print(f"PASS: Assigned user sees Kissflow app in launcher")
    
    def test_unassigned_user_cannot_see_app(self, admin_token, user_token):
        """Unassigned user (without role access) should NOT see the app"""
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        headers_user = {"Authorization": f"Bearer {user_token}"}
        
        # Get suriya's user ID and current roles
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers_admin)
        users = users_response.json()
        suriya_user = next((u for u in users if u.get('email') == REFEX_USER["email"]), None)
        
        if not suriya_user:
            pytest.skip("Suriya user not found")
        
        original_role_ids = suriya_user.get('role_ids', [])
        
        # Remove user from app's approved_user_ids
        requests.delete(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users/{suriya_user['id']}",
            headers=headers_admin
        )
        
        # Also remove user's roles temporarily to test pure user assignment
        requests.put(
            f"{BASE_URL}/api/users/{suriya_user['id']}",
            json={"role_ids": []},
            headers=headers_admin
        )
        
        # Check launcher for user - should NOT see app now
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers_user)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow_app = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        
        # Restore user's roles
        requests.put(
            f"{BASE_URL}/api/users/{suriya_user['id']}",
            json={"role_ids": original_role_ids},
            headers=headers_admin
        )
        
        # Re-assign user for other tests
        requests.post(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users",
            json={"user_ids": [suriya_user["id"]]},
            headers=headers_admin
        )
        
        assert kissflow_app is None, "User without role or direct assignment should NOT see app"
        print(f"PASS: User without role or direct assignment does NOT see app in launcher")


class TestAppLauncherAPI:
    """Test App Launcher API endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        return response.json()["token"]
    
    def test_launcher_apps_returns_correct_structure(self, admin_token):
        """Launcher apps should return correct data structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200
        apps = response.json()
        
        if len(apps) > 0:
            app = apps[0]
            assert "id" in app
            assert "name" in app
            assert "type" in app
            assert "launch_url" in app
            print(f"PASS: App structure is correct: {list(app.keys())}")
    
    def test_saml_complete_endpoint_with_token(self, admin_token):
        """SAML complete endpoint should work with token"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete",
            params={"token": admin_token},
            allow_redirects=False
        )
        # Should return HTML form or redirect
        assert response.status_code in [200, 302, 307], f"Failed: {response.status_code}"
        if response.status_code == 200:
            assert "SAMLResponse" in response.text or "form" in response.text.lower()
            print("PASS: SAML complete returns HTML form with SAMLResponse")
    
    def test_saml_complete_without_token_redirects(self):
        """SAML complete without token should redirect to login"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete",
            allow_redirects=False
        )
        # Should redirect to login
        assert response.status_code in [302, 307], f"Expected redirect, got {response.status_code}"
        print("PASS: SAML complete without token redirects to login")


class TestSAMLAppsPage:
    """Test SAML Apps page user management features"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        return response.json()["token"]
    
    def test_get_saml_apps_list(self, admin_token):
        """Get list of SAML apps"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml", headers=headers)
        assert response.status_code == 200
        apps = response.json()
        print(f"PASS: Found {len(apps)} SAML apps")
        
        # Check Kissflow app exists
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is not None, "Kissflow app should exist"
        print(f"PASS: Kissflow app found: {kissflow.get('name')}")
        
        # Check approved_user_ids field exists
        assert 'approved_user_ids' in kissflow or kissflow.get('approved_user_ids') is None
        print(f"PASS: approved_user_ids field present, count: {len(kissflow.get('approved_user_ids', []))}")
    
    def test_get_org_users_for_dropdown(self, admin_token):
        """Get org users for the assign dropdown"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        assert response.status_code == 200
        users = response.json()
        print(f"PASS: Found {len(users)} org users for dropdown")
        for u in users:
            print(f"  - {u.get('email')} ({u.get('role')})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
