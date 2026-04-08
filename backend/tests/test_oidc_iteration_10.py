"""
OIDC Provider Flow Tests - Iteration 10
Tests for:
1. OIDC App CRUD (create, read, update, delete)
2. OIDC OAuth2 Flow (authorize, token, userinfo)
3. OIDC Discovery endpoint
4. Logo upload functionality
5. App Launcher with OIDC apps
"""
import pytest
import requests
import os
import uuid
from urllib.parse import urlparse, parse_qs

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "gowtham.s@refex.co.in"
ADMIN_PASSWORD = "Admin123!"
ORG_ID = "15f688ad-ae0a-4947-b329-7a231859f226"


class TestOIDCAppCRUD:
    """OIDC Application CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.created_app_id = None
        yield
        # Cleanup: delete created app
        if self.created_app_id:
            requests.delete(f"{BASE_URL}/api/apps/oidc/{self.created_app_id}", headers=self.headers)
    
    def test_01_create_oidc_app(self):
        """Create OIDC app with name, redirect_uri, home_url, logo_url"""
        app_data = {
            "name": f"TEST_OIDC_App_{uuid.uuid4().hex[:8]}",
            "description": "Test OIDC application for iteration 10",
            "org_id": ORG_ID,
            "redirect_uris": ["https://test-app.example.com/callback"],
            "logout_uris": ["https://test-app.example.com/logout"],
            "scopes": ["openid", "profile", "email"],
            "grant_types": ["authorization_code"],
            "home_url": "https://test-app.example.com",
            "logo_url": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/apps/oidc", json=app_data, headers=self.headers)
        assert response.status_code == 200, f"Create OIDC app failed: {response.text}"
        
        data = response.json()
        self.created_app_id = data.get("id")
        
        # Verify response contains required fields
        assert "id" in data, "Response missing 'id'"
        assert "client_id" in data, "Response missing 'client_id'"
        assert "client_secret" in data, "Response missing 'client_secret' (should be shown on create)"
        assert data["name"] == app_data["name"], "Name mismatch"
        assert data["home_url"] == app_data["home_url"], "home_url mismatch"
        assert data["redirect_uris"] == app_data["redirect_uris"], "redirect_uris mismatch"
        
        # Verify integration endpoints are returned
        assert "authorization_endpoint" in data, "Missing authorization_endpoint"
        assert "token_endpoint" in data, "Missing token_endpoint"
        
        print(f"PASS: Created OIDC app with client_id: {data['client_id']}")
        return data
    
    def test_02_list_oidc_apps(self):
        """List OIDC apps"""
        response = requests.get(f"{BASE_URL}/api/apps/oidc", headers=self.headers)
        assert response.status_code == 200, f"List OIDC apps failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Listed {len(data)} OIDC apps")
    
    def test_03_get_oidc_app_with_secret(self):
        """Get OIDC app with client_secret revealed"""
        # First create an app
        app_data = {
            "name": f"TEST_OIDC_Secret_{uuid.uuid4().hex[:8]}",
            "org_id": ORG_ID,
            "redirect_uris": ["https://test.example.com/callback"],
            "home_url": "https://test.example.com"
        }
        create_resp = requests.post(f"{BASE_URL}/api/apps/oidc", json=app_data, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.created_app_id = created["id"]
        
        # Get with include_secret=true
        response = requests.get(f"{BASE_URL}/api/apps/oidc/{created['id']}?include_secret=true", headers=self.headers)
        assert response.status_code == 200, f"Get OIDC app failed: {response.text}"
        
        data = response.json()
        assert "client_secret" in data, "client_secret not returned with include_secret=true"
        print(f"PASS: Retrieved OIDC app with client_secret")
    
    def test_04_update_oidc_app(self):
        """Update OIDC app"""
        # First create an app
        app_data = {
            "name": f"TEST_OIDC_Update_{uuid.uuid4().hex[:8]}",
            "org_id": ORG_ID,
            "redirect_uris": ["https://test.example.com/callback"],
            "home_url": "https://test.example.com"
        }
        create_resp = requests.post(f"{BASE_URL}/api/apps/oidc", json=app_data, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.created_app_id = created["id"]
        
        # Update the app
        update_data = {
            "name": f"TEST_OIDC_Updated_{uuid.uuid4().hex[:8]}",
            "home_url": "https://updated.example.com"
        }
        response = requests.put(f"{BASE_URL}/api/apps/oidc/{created['id']}", json=update_data, headers=self.headers)
        assert response.status_code == 200, f"Update OIDC app failed: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"], "Name not updated"
        assert data["home_url"] == update_data["home_url"], "home_url not updated"
        print(f"PASS: Updated OIDC app")
    
    def test_05_delete_oidc_app(self):
        """Delete OIDC app"""
        # First create an app
        app_data = {
            "name": f"TEST_OIDC_Delete_{uuid.uuid4().hex[:8]}",
            "org_id": ORG_ID,
            "redirect_uris": ["https://test.example.com/callback"]
        }
        create_resp = requests.post(f"{BASE_URL}/api/apps/oidc", json=app_data, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        
        # Delete the app
        response = requests.delete(f"{BASE_URL}/api/apps/oidc/{created['id']}", headers=self.headers)
        assert response.status_code == 200, f"Delete OIDC app failed: {response.text}"
        
        # Verify it's deleted
        get_resp = requests.get(f"{BASE_URL}/api/apps/oidc/{created['id']}", headers=self.headers)
        assert get_resp.status_code == 404, "App should be deleted"
        print(f"PASS: Deleted OIDC app")


class TestOIDCDiscovery:
    """OIDC Discovery endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and create test OIDC app"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Create test app
        app_data = {
            "name": f"TEST_OIDC_Discovery_{uuid.uuid4().hex[:8]}",
            "org_id": ORG_ID,
            "redirect_uris": ["https://test.example.com/callback"]
        }
        create_resp = requests.post(f"{BASE_URL}/api/apps/oidc", json=app_data, headers=self.headers)
        assert create_resp.status_code == 200
        self.app = create_resp.json()
        yield
        # Cleanup
        requests.delete(f"{BASE_URL}/api/apps/oidc/{self.app['id']}", headers=self.headers)
    
    def test_oidc_discovery_endpoint(self):
        """GET /api/apps/oidc/{app_id}/.well-known/openid-configuration"""
        response = requests.get(f"{BASE_URL}/api/apps/oidc/{self.app['id']}/.well-known/openid-configuration")
        assert response.status_code == 200, f"Discovery endpoint failed: {response.text}"
        
        data = response.json()
        
        # Verify required OIDC discovery fields
        required_fields = [
            "issuer",
            "authorization_endpoint",
            "token_endpoint",
            "userinfo_endpoint",
            "response_types_supported",
            "subject_types_supported",
            "id_token_signing_alg_values_supported"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify endpoints contain correct paths
        assert "/api/oidc/" in data["authorization_endpoint"], "Invalid authorization_endpoint"
        assert "/api/oidc/" in data["token_endpoint"], "Invalid token_endpoint"
        assert "/api/oidc/userinfo" in data["userinfo_endpoint"], "Invalid userinfo_endpoint"
        
        print(f"PASS: OIDC Discovery endpoint returns valid config")
        print(f"  - issuer: {data['issuer']}")
        print(f"  - authorization_endpoint: {data['authorization_endpoint']}")
        print(f"  - token_endpoint: {data['token_endpoint']}")


class TestOIDCOAuth2Flow:
    """OIDC OAuth2 Authorization Code Flow tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and create test OIDC app"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Create test app
        app_data = {
            "name": f"TEST_OIDC_Flow_{uuid.uuid4().hex[:8]}",
            "org_id": ORG_ID,
            "redirect_uris": ["https://test.example.com/callback"],
            "scopes": ["openid", "profile", "email"]
        }
        create_resp = requests.post(f"{BASE_URL}/api/apps/oidc", json=app_data, headers=self.headers)
        assert create_resp.status_code == 200
        self.app = create_resp.json()
        
        # Get app with secret
        secret_resp = requests.get(f"{BASE_URL}/api/apps/oidc/{self.app['id']}?include_secret=true", headers=self.headers)
        assert secret_resp.status_code == 200
        self.app_with_secret = secret_resp.json()
        
        yield
        # Cleanup
        requests.delete(f"{BASE_URL}/api/apps/oidc/{self.app['id']}", headers=self.headers)
    
    def test_01_authorize_with_token_returns_302(self):
        """GET /api/oidc/{app_id}/authorize with valid token returns 302 with code"""
        params = {
            "response_type": "code",
            "client_id": self.app["client_id"],
            "redirect_uri": "https://test.example.com/callback",
            "scope": "openid",
            "state": "test_state_123",
            "token": self.token  # Pass IAM token to authenticate
        }
        
        response = requests.get(
            f"{BASE_URL}/api/oidc/{self.app['id']}/authorize",
            params=params,
            allow_redirects=False
        )
        
        assert response.status_code == 302, f"Expected 302 redirect, got {response.status_code}: {response.text}"
        
        location = response.headers.get("Location", "")
        assert "code=" in location, f"Redirect URL missing 'code' parameter: {location}"
        assert "state=test_state_123" in location, f"Redirect URL missing 'state' parameter: {location}"
        
        # Extract the code
        parsed = urlparse(location)
        query_params = parse_qs(parsed.query)
        self.auth_code = query_params.get("code", [None])[0]
        assert self.auth_code, "Failed to extract authorization code"
        
        print(f"PASS: Authorize endpoint returned 302 with code")
        print(f"  - Redirect: {location[:100]}...")
        return self.auth_code
    
    def test_02_authorize_without_token_redirects_to_login(self):
        """GET /api/oidc/{app_id}/authorize without token redirects to login"""
        params = {
            "response_type": "code",
            "client_id": self.app["client_id"],
            "redirect_uri": "https://test.example.com/callback",
            "scope": "openid"
        }
        
        response = requests.get(
            f"{BASE_URL}/api/oidc/{self.app['id']}/authorize",
            params=params,
            allow_redirects=False
        )
        
        assert response.status_code == 302, f"Expected 302 redirect, got {response.status_code}"
        location = response.headers.get("Location", "")
        assert "/login" in location, f"Should redirect to login page: {location}"
        
        print(f"PASS: Authorize without token redirects to login")
    
    def test_03_token_exchange(self):
        """POST /api/oidc/{app_id}/token exchanges code for tokens"""
        # First get an auth code
        params = {
            "response_type": "code",
            "client_id": self.app["client_id"],
            "redirect_uri": "https://test.example.com/callback",
            "scope": "openid profile email",
            "token": self.token
        }
        
        auth_resp = requests.get(
            f"{BASE_URL}/api/oidc/{self.app['id']}/authorize",
            params=params,
            allow_redirects=False
        )
        assert auth_resp.status_code == 302
        
        location = auth_resp.headers.get("Location", "")
        parsed = urlparse(location)
        query_params = parse_qs(parsed.query)
        auth_code = query_params.get("code", [None])[0]
        assert auth_code, "Failed to get auth code"
        
        # Exchange code for tokens
        token_data = {
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": "https://test.example.com/callback",
            "client_id": self.app["client_id"],
            "client_secret": self.app_with_secret["client_secret"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/oidc/{self.app['id']}/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        assert response.status_code == 200, f"Token exchange failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response missing access_token"
        assert "id_token" in data, "Response missing id_token"
        assert data.get("token_type") == "Bearer", "token_type should be Bearer"
        assert "expires_in" in data, "Response missing expires_in"
        
        self.access_token = data["access_token"]
        print(f"PASS: Token exchange successful")
        print(f"  - access_token: {data['access_token'][:50]}...")
        print(f"  - id_token: {data['id_token'][:50]}...")
        return data
    
    def test_04_userinfo_endpoint(self):
        """GET /api/oidc/userinfo returns user profile"""
        # First get tokens
        params = {
            "response_type": "code",
            "client_id": self.app["client_id"],
            "redirect_uri": "https://test.example.com/callback",
            "scope": "openid profile email",
            "token": self.token
        }
        
        auth_resp = requests.get(
            f"{BASE_URL}/api/oidc/{self.app['id']}/authorize",
            params=params,
            allow_redirects=False
        )
        location = auth_resp.headers.get("Location", "")
        parsed = urlparse(location)
        query_params = parse_qs(parsed.query)
        auth_code = query_params.get("code", [None])[0]
        
        token_data = {
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": "https://test.example.com/callback",
            "client_id": self.app["client_id"],
            "client_secret": self.app_with_secret["client_secret"]
        }
        
        token_resp = requests.post(
            f"{BASE_URL}/api/oidc/{self.app['id']}/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert token_resp.status_code == 200
        access_token = token_resp.json()["access_token"]
        
        # Call userinfo endpoint
        response = requests.get(
            f"{BASE_URL}/api/oidc/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        assert response.status_code == 200, f"UserInfo failed: {response.text}"
        
        data = response.json()
        assert "sub" in data, "Response missing 'sub'"
        assert "email" in data, "Response missing 'email'"
        assert data["email"] == ADMIN_EMAIL, f"Email mismatch: {data['email']}"
        
        print(f"PASS: UserInfo endpoint returns user profile")
        print(f"  - sub: {data['sub']}")
        print(f"  - email: {data['email']}")
        print(f"  - name: {data.get('name', 'N/A')}")
    
    def test_05_token_exchange_invalid_code(self):
        """Token exchange with invalid code returns error"""
        token_data = {
            "grant_type": "authorization_code",
            "code": "invalid_code_12345",
            "redirect_uri": "https://test.example.com/callback",
            "client_id": self.app["client_id"],
            "client_secret": self.app_with_secret["client_secret"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/oidc/{self.app['id']}/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Response should contain error"
        assert data["error"] == "invalid_grant", f"Expected invalid_grant error: {data}"
        
        print(f"PASS: Invalid code returns proper error")
    
    def test_06_token_exchange_invalid_client(self):
        """Token exchange with invalid client_secret returns error"""
        # First get a valid auth code
        params = {
            "response_type": "code",
            "client_id": self.app["client_id"],
            "redirect_uri": "https://test.example.com/callback",
            "scope": "openid",
            "token": self.token
        }
        
        auth_resp = requests.get(
            f"{BASE_URL}/api/oidc/{self.app['id']}/authorize",
            params=params,
            allow_redirects=False
        )
        location = auth_resp.headers.get("Location", "")
        parsed = urlparse(location)
        query_params = parse_qs(parsed.query)
        auth_code = query_params.get("code", [None])[0]
        
        token_data = {
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": "https://test.example.com/callback",
            "client_id": self.app["client_id"],
            "client_secret": "wrong_secret"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/oidc/{self.app['id']}/token",
            data=token_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert data.get("error") == "invalid_client", f"Expected invalid_client error: {data}"
        
        print(f"PASS: Invalid client_secret returns proper error")


class TestLogoUpload:
    """Logo upload functionality tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_logo_upload(self):
        """POST /api/upload/logo uploads image and returns URL"""
        # Create a simple PNG image (1x1 pixel)
        import base64
        # Minimal valid PNG
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_logo.png", png_data, "image/png")}
        
        response = requests.post(
            f"{BASE_URL}/api/upload/logo",
            files=files,
            headers=self.headers
        )
        
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        
        data = response.json()
        assert "logo_url" in data, "Response missing logo_url"
        assert "/api/uploads/" in data["logo_url"], f"logo_url should contain /api/uploads/: {data['logo_url']}"
        
        # Verify the uploaded file is accessible
        logo_resp = requests.get(data["logo_url"])
        assert logo_resp.status_code == 200, f"Uploaded logo not accessible: {logo_resp.status_code}"
        
        print(f"PASS: Logo upload successful")
        print(f"  - logo_url: {data['logo_url']}")


class TestAppLauncher:
    """App Launcher tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_launcher_apps_endpoint(self):
        """GET /api/launcher/apps returns SAML and OIDC apps"""
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=self.headers)
        assert response.status_code == 200, f"Launcher apps failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check for app types
        app_types = set(app.get("type") for app in data)
        print(f"PASS: Launcher apps endpoint returns {len(data)} apps")
        print(f"  - App types: {app_types}")
        
        # Verify app structure
        if data:
            app = data[0]
            assert "id" in app, "App missing 'id'"
            assert "name" in app, "App missing 'name'"
            assert "type" in app, "App missing 'type'"


class TestRegressionLogin:
    """Regression tests for login flow"""
    
    def test_admin_login(self):
        """Admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user"
        assert data["user"]["email"] == ADMIN_EMAIL
        
        print(f"PASS: Admin login successful")
    
    def test_auth_me_endpoint(self):
        """GET /api/auth/me returns user info"""
        # Login first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Auth me failed: {response.text}"
        
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert "organization" in data, "Response missing organization"
        
        print(f"PASS: Auth me endpoint returns user info")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
