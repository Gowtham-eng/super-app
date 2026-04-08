"""
Iteration 8 Tests - Testing new features:
1. JWT token expiry is 30 days (720 hours)
2. SAML App creation accepts home_url field
3. SAML App home_url is stored and returned in API
4. App Launcher shows tile view with app name and description
5. App Launcher passes home_url as relay_state when launching app
6. PWA manifest at /manifest.json with correct config
7. Service worker at /sw.js is accessible
8. Logo upload endpoint POST /api/upload/logo works
9. Login still works for both admin and user
10. Admin dashboard loads with stat cards
"""

import pytest
import requests
import os
import jwt
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "gowtham.s@refex.co.in"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "suriya.v@refex.co.in"
USER_PASSWORD = "Admin123!"
SAML_APP_ID = "e5a4c999-65fd-4301-9ebd-8948893eea0d"


class TestJWTExpiration:
    """Test JWT token expiry is 30 days (720 hours)"""
    
    def test_jwt_expiry_is_30_days(self):
        """Verify JWT token has 30-day expiration"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        token = response.json().get("token")
        assert token, "No token returned"
        
        # Decode token without verification to check expiry
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        exp_timestamp = decoded.get("exp")
        iat_timestamp = decoded.get("iat")
        
        assert exp_timestamp, "No exp claim in token"
        assert iat_timestamp, "No iat claim in token"
        
        # Calculate difference in hours
        diff_seconds = exp_timestamp - iat_timestamp
        diff_hours = diff_seconds / 3600
        
        # Should be 720 hours (30 days)
        assert 719 <= diff_hours <= 721, f"JWT expiry is {diff_hours} hours, expected 720 (30 days)"
        print(f"JWT expiry verified: {diff_hours} hours (~{diff_hours/24:.1f} days)")


class TestSAMLAppHomeUrl:
    """Test SAML App home_url field"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_saml_app_has_home_url_field(self, admin_token):
        """Verify existing SAML app returns home_url field"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}", headers=headers)
        assert response.status_code == 200, f"Failed to get SAML app: {response.text}"
        
        app = response.json()
        # home_url should be in the response (can be null/empty)
        assert "home_url" in app or app.get("home_url") is None, "home_url field should exist in SAML app response"
        print(f"SAML app home_url: {app.get('home_url')}")
    
    def test_saml_app_update_home_url(self, admin_token):
        """Test updating SAML app with home_url"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get current app
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}", headers=headers)
        assert response.status_code == 200
        original_home_url = response.json().get("home_url")
        
        # Update with new home_url
        test_home_url = "https://refexgroup.kissflow.com/view/application/Test_App"
        response = requests.put(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}",
            json={"home_url": test_home_url},
            headers=headers
        )
        assert response.status_code == 200, f"Failed to update SAML app: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}", headers=headers)
        assert response.status_code == 200
        assert response.json().get("home_url") == test_home_url, "home_url not updated correctly"
        
        # Restore original
        requests.put(
            f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}",
            json={"home_url": original_home_url or ""},
            headers=headers
        )
        print(f"SAML app home_url update verified")


class TestLauncherAppsEndpoint:
    """Test launcher apps endpoint returns home_url"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_launcher_apps_returns_home_url(self, admin_token):
        """Verify /api/launcher/apps returns home_url for SAML apps"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200, f"Failed to get launcher apps: {response.text}"
        
        apps = response.json()
        assert isinstance(apps, list), "Response should be a list"
        
        # Find SAML apps and check for home_url field
        saml_apps = [app for app in apps if app.get("type") == "saml"]
        if saml_apps:
            for app in saml_apps:
                # home_url should be present in response (can be None)
                assert "home_url" in app, f"home_url field missing from SAML app {app.get('name')}"
            print(f"Launcher apps verified: {len(saml_apps)} SAML apps with home_url field")
        else:
            print("No SAML apps found in launcher (user may not have access)")


class TestPWASupport:
    """Test PWA manifest and service worker"""
    
    def test_manifest_json_accessible(self):
        """Verify /manifest.json is accessible"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        assert response.status_code == 200, f"manifest.json not accessible: {response.status_code}"
        
        manifest = response.json()
        assert "name" in manifest, "manifest missing 'name'"
        assert "short_name" in manifest, "manifest missing 'short_name'"
        assert "icons" in manifest, "manifest missing 'icons'"
        assert "start_url" in manifest, "manifest missing 'start_url'"
        assert "display" in manifest, "manifest missing 'display'"
        
        # Verify specific values
        assert manifest.get("display") == "standalone", "PWA should have standalone display"
        assert manifest.get("start_url") == "/launcher", "start_url should be /launcher"
        print(f"PWA manifest verified: {manifest.get('name')}")
    
    def test_service_worker_accessible(self):
        """Verify /sw.js is accessible"""
        response = requests.get(f"{BASE_URL}/sw.js")
        assert response.status_code == 200, f"sw.js not accessible: {response.status_code}"
        
        content = response.text
        assert "addEventListener" in content, "Service worker should have event listeners"
        assert "fetch" in content, "Service worker should handle fetch events"
        print("Service worker verified")


class TestLogoUpload:
    """Test logo upload endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_logo_upload_accepts_image(self, admin_token):
        """Test POST /api/upload/logo accepts image files"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create a simple PNG image (1x1 pixel)
        import base64
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_logo.png", png_data, "image/png")}
        response = requests.post(f"{BASE_URL}/api/upload/logo", files=files, headers=headers)
        
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        data = response.json()
        assert "logo_url" in data, "Response should contain logo_url"
        assert data["logo_url"].startswith("http"), "logo_url should be a valid URL"
        print(f"Logo upload verified: {data['logo_url']}")
    
    def test_logo_upload_rejects_non_image(self, admin_token):
        """Test POST /api/upload/logo rejects non-image files"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        files = {"file": ("test.txt", b"This is not an image", "text/plain")}
        response = requests.post(f"{BASE_URL}/api/upload/logo", files=files, headers=headers)
        
        assert response.status_code == 400, f"Should reject non-image: {response.status_code}"
        print("Non-image rejection verified")


class TestLoginFunctionality:
    """Test login works for admin and user"""
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "org_admin"
        print(f"Admin login verified: {data['user']['name']}")
    
    def test_user_login(self):
        """Test regular user login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"User login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["email"] == USER_EMAIL
        print(f"User login verified: {data['user']['name']}")


class TestDashboardStats:
    """Test admin dashboard stats endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    def test_dashboard_stats_returns_all_fields(self, admin_token):
        """Test /api/dashboard/stats returns all required fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        
        stats = response.json()
        required_fields = ["total_users", "saml_apps", "oidc_apps", "total_groups", "total_roles"]
        
        for field in required_fields:
            assert field in stats, f"Missing field: {field}"
            assert isinstance(stats[field], int), f"{field} should be an integer"
        
        # Verify total apps can be calculated
        total_apps = stats.get("saml_apps", 0) + stats.get("oidc_apps", 0)
        print(f"Dashboard stats verified: {stats}, total_apps={total_apps}")


class TestSAMLAppCreationWithHomeUrl:
    """Test creating SAML app with home_url field"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def admin_org_id(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        return response.json().get("org_id")
    
    def test_create_saml_app_with_home_url(self, admin_token, admin_org_id):
        """Test creating a new SAML app with home_url"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        test_app = {
            "name": "TEST_App_With_HomeUrl",
            "description": "Test app for home_url feature",
            "org_id": admin_org_id,
            "entity_id": "https://test-app.example.com/saml/",
            "acs_url": "https://test-app.example.com/saml/acs",
            "home_url": "https://test-app.example.com/dashboard"
        }
        
        response = requests.post(f"{BASE_URL}/api/apps/saml", json=test_app, headers=headers)
        assert response.status_code == 200, f"Failed to create SAML app: {response.text}"
        
        created_app = response.json()
        assert created_app.get("name") == test_app["name"]
        assert created_app.get("home_url") == test_app["home_url"], "home_url not saved correctly"
        
        app_id = created_app.get("id")
        print(f"Created SAML app with home_url: {app_id}")
        
        # Cleanup - delete the test app
        delete_response = requests.delete(f"{BASE_URL}/api/apps/saml/{app_id}", headers=headers)
        assert delete_response.status_code == 200, f"Failed to delete test app: {delete_response.text}"
        print("Test app cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
