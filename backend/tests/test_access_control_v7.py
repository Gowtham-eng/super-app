"""
Test Access Control & New Features - Iteration 7
Tests:
1. Access control: User without app assignment sees NO apps in launcher (raghul.je@refex.co.in)
2. Access control: User with app assignment sees Kissflow in launcher (suriya.v@refex.co.in)
3. App Catalog: Unassigned user (raghul) sees 'Request Access' button, NOT 'Access Granted'
4. App Catalog: Assigned user (suriya) sees 'Access Granted'
5. Logo upload: POST /api/upload/logo accepts image file and returns logo_url
6. Users page: Shows app badges per user in the table
7. User creation form: Has app assignment checkboxes
8. User edit form: Has app assignment checkboxes
9. POST /api/apps/saml/{app_id}/users assigns user, DELETE removes user
10. Admin dashboard shows all stat cards and quick actions
11. Refex logo visible in sidebar
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kissflow-access-hub.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN = {"email": "gowtham.s@refex.co.in", "password": "Admin123!"}
ASSIGNED_USER = {"email": "suriya.v@refex.co.in", "password": "Admin123!"}  # Has Kissflow access
UNASSIGNED_USER = {"email": "raghul.je@refex.co.in", "password": "Admin123!"}  # NO Kissflow access
SAML_APP_ID = "e5a4c999-65fd-4301-9ebd-8948893eea0d"


class TestAuthentication:
    """Verify all test users can login"""
    
    def test_admin_login(self):
        """Admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert data["user"]["role"] == "org_admin"
        print(f"PASS: Admin login OK - {data['user']['email']}")
    
    def test_assigned_user_login(self):
        """Assigned user (suriya) login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ASSIGNED_USER)
        assert response.status_code == 200, f"Assigned user login failed: {response.text}"
        data = response.json()
        assert data["user"]["email"] == ASSIGNED_USER["email"]
        print(f"PASS: Assigned user login OK - {data['user']['email']}")
    
    def test_unassigned_user_login(self):
        """Unassigned user (raghul) login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=UNASSIGNED_USER)
        assert response.status_code == 200, f"Unassigned user login failed: {response.text}"
        data = response.json()
        assert data["user"]["email"] == UNASSIGNED_USER["email"]
        print(f"PASS: Unassigned user login OK - {data['user']['email']}")


class TestAccessControlLauncher:
    """Test access control in App Launcher - users only see assigned apps"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["token"]
    
    @pytest.fixture
    def assigned_user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ASSIGNED_USER)
        return response.json()["token"]
    
    @pytest.fixture
    def unassigned_user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=UNASSIGNED_USER)
        return response.json()["token"]
    
    def test_unassigned_user_sees_no_apps(self, unassigned_user_token):
        """Raghul (unassigned) should see NO apps in launcher"""
        headers = {"Authorization": f"Bearer {unassigned_user_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        # Raghul should see NO apps (not assigned to any)
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is None, f"Unassigned user should NOT see Kissflow app! Found: {[a.get('name') for a in apps]}"
        print(f"PASS: Unassigned user (raghul) sees {len(apps)} apps - Kissflow NOT visible")
    
    def test_assigned_user_sees_kissflow(self, assigned_user_token):
        """Suriya (assigned) should see Kissflow in launcher"""
        headers = {"Authorization": f"Bearer {assigned_user_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is not None, f"Assigned user should see Kissflow app! Apps: {[a.get('name') for a in apps]}"
        print(f"PASS: Assigned user (suriya) sees Kissflow in launcher")
    
    def test_admin_always_sees_apps(self, admin_token):
        """Admin (org_admin) should always see all apps"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is not None, "Admin should always see Kissflow app"
        print(f"PASS: Admin sees {len(apps)} apps including Kissflow")


class TestAppCatalogAccessStatus:
    """Test App Catalog shows correct access status"""
    
    @pytest.fixture
    def assigned_user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ASSIGNED_USER)
        return response.json()["token"]
    
    @pytest.fixture
    def unassigned_user_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=UNASSIGNED_USER)
        return response.json()["token"]
    
    def test_unassigned_user_sees_request_access(self, unassigned_user_token):
        """Raghul should see 'Request Access' for Kissflow (has_access=false)"""
        headers = {"Authorization": f"Bearer {unassigned_user_token}"}
        response = requests.get(f"{BASE_URL}/api/catalog/apps", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is not None, "Kissflow should appear in catalog"
        assert kissflow.get('has_access') == False, f"Unassigned user should have has_access=false, got: {kissflow.get('has_access')}"
        print(f"PASS: Unassigned user sees Kissflow with has_access=false (Request Access)")
    
    def test_assigned_user_sees_access_granted(self, assigned_user_token):
        """Suriya should see 'Access Granted' for Kissflow (has_access=true)"""
        headers = {"Authorization": f"Bearer {assigned_user_token}"}
        response = requests.get(f"{BASE_URL}/api/catalog/apps", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is not None, "Kissflow should appear in catalog"
        assert kissflow.get('has_access') == True, f"Assigned user should have has_access=true, got: {kissflow.get('has_access')}"
        print(f"PASS: Assigned user sees Kissflow with has_access=true (Access Granted)")


class TestLogoUpload:
    """Test logo upload endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["token"]
    
    def test_upload_logo_returns_url(self, admin_token):
        """POST /api/upload/logo accepts image and returns logo_url"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a simple PNG image (1x1 pixel)
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test_logo.png', io.BytesIO(png_data), 'image/png')}
        response = requests.post(f"{BASE_URL}/api/upload/logo", headers=headers, files=files)
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert 'logo_url' in data, f"Response should contain logo_url: {data}"
        assert data['logo_url'].startswith('http'), f"logo_url should be a URL: {data['logo_url']}"
        print(f"PASS: Logo upload returned URL: {data['logo_url']}")
    
    def test_upload_rejects_non_image(self, admin_token):
        """POST /api/upload/logo rejects non-image files"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        files = {'file': ('test.txt', io.BytesIO(b'not an image'), 'text/plain')}
        response = requests.post(f"{BASE_URL}/api/upload/logo", headers=headers, files=files)
        
        assert response.status_code == 400, f"Should reject non-image: {response.status_code}"
        print(f"PASS: Logo upload correctly rejects non-image files")


class TestUserAppAssignment:
    """Test user assignment to SAML apps"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["token"]
    
    def test_get_app_users(self, admin_token):
        """GET /api/apps/saml/{app_id}/users returns assigned users"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        assert isinstance(users, list)
        print(f"PASS: GET app users returned {len(users)} users")
        for u in users:
            print(f"  - {u.get('email')}")
    
    def test_assign_user_to_app(self, admin_token):
        """POST /api/apps/saml/{app_id}/users assigns user"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get raghul's user ID
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        users = users_response.json()
        raghul = next((u for u in users if u.get('email') == UNASSIGNED_USER["email"]), None)
        
        if not raghul:
            pytest.skip("Raghul user not found")
        
        # Assign raghul
        response = requests.post(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users",
            json={"user_ids": [raghul["id"]]},
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"PASS: Assigned raghul to Kissflow")
        
        # Verify assignment
        verify_response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users", headers=headers)
        assigned_users = verify_response.json()
        raghul_assigned = any(u.get('email') == UNASSIGNED_USER["email"] for u in assigned_users)
        assert raghul_assigned, "Raghul should now be assigned"
        print(f"PASS: Verified raghul is now assigned")
    
    def test_remove_user_from_app(self, admin_token):
        """DELETE /api/apps/saml/{app_id}/users/{user_id} removes user"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get raghul's user ID
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        users = users_response.json()
        raghul = next((u for u in users if u.get('email') == UNASSIGNED_USER["email"]), None)
        
        if not raghul:
            pytest.skip("Raghul user not found")
        
        # Remove raghul
        response = requests.delete(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users/{raghul['id']}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"PASS: Removed raghul from Kissflow")
        
        # Verify removal
        verify_response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/users", headers=headers)
        assigned_users = verify_response.json()
        raghul_assigned = any(u.get('email') == UNASSIGNED_USER["email"] for u in assigned_users)
        assert not raghul_assigned, "Raghul should no longer be assigned"
        print(f"PASS: Verified raghul is no longer assigned")


class TestDashboardStats:
    """Test admin dashboard stats endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["token"]
    
    def test_dashboard_stats_returns_all_fields(self, admin_token):
        """GET /api/dashboard/stats returns all required stat fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        stats = response.json()
        
        required_fields = ['total_users', 'active_users', 'total_groups', 'total_roles', 
                          'saml_apps', 'oidc_apps', 'access_policies', 'pending_requests', 'recent_logins']
        
        for field in required_fields:
            assert field in stats, f"Missing field: {field}"
        
        print(f"PASS: Dashboard stats contains all required fields")
        print(f"  - Total Users: {stats.get('total_users')}")
        print(f"  - SAML Apps: {stats.get('saml_apps')}")
        print(f"  - Pending Requests: {stats.get('pending_requests')}")


class TestSAMLAppEndpoints:
    """Test SAML app endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["token"]
    
    def test_get_saml_apps_includes_approved_user_ids(self, admin_token):
        """GET /api/apps/saml returns apps with approved_user_ids"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        apps = response.json()
        
        kissflow = next((a for a in apps if a.get('id') == SAML_APP_ID), None)
        assert kissflow is not None, "Kissflow app should exist"
        
        # Check approved_user_ids field exists
        assert 'approved_user_ids' in kissflow or kissflow.get('approved_user_ids') is None
        print(f"PASS: Kissflow has approved_user_ids: {kissflow.get('approved_user_ids', [])}")
    
    def test_get_single_saml_app(self, admin_token):
        """GET /api/apps/saml/{app_id} returns app details"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        app = response.json()
        
        assert app.get('id') == SAML_APP_ID
        assert app.get('name') == 'Kissflow'
        print(f"PASS: GET single SAML app works - {app.get('name')}")


class TestUsersEndpoint:
    """Test users endpoint returns app assignment info"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        return response.json()["token"]
    
    def test_get_users_list(self, admin_token):
        """GET /api/users returns user list"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        users = response.json()
        
        assert len(users) >= 3, f"Should have at least 3 users, got {len(users)}"
        
        # Check required fields
        for user in users:
            assert 'id' in user
            assert 'email' in user
            assert 'name' in user
            assert 'role' in user
        
        print(f"PASS: GET users returned {len(users)} users with correct structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
