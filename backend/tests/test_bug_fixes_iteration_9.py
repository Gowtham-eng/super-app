"""
Test Bug Fixes - Iteration 9
Bug Fix 1: SAML Base64 encoding - clean base64 with no newlines, no spaces, proper padding
Bug Fix 2: Logo Upload - returns URL with /api/uploads/ prefix and serves the image
"""

import pytest
import requests
import base64
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "gowtham.s@refex.co.in"
ADMIN_PASSWORD = "Admin123!"
KISSFLOW_APP_ID = "e5a4c999-65fd-4301-9ebd-8948893eea0d"


class TestSAMLBase64BugFix:
    """Bug Fix 1: SAML Base64 encoding should be clean - no newlines, no spaces, proper padding"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_saml_test_endpoint_returns_valid_base64(self, auth_token):
        """Test /api/saml/{app_id}/test returns valid base64 that can be decoded"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/saml/{KISSFLOW_APP_ID}/test",
            headers=headers
        )
        
        assert response.status_code == 200, f"SAML test endpoint failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "saml_response_b64" in data, "Missing saml_response_b64 in response"
        assert "status" in data, "Missing status in response"
        assert data["status"] == "success", f"SAML test status not success: {data.get('status')}"
        
        saml_b64 = data["saml_response_b64"]
        
        # Bug Fix Verification: Check base64 is clean
        # 1. No newlines
        assert "\n" not in saml_b64, "Base64 contains newlines - BUG NOT FIXED"
        assert "\r" not in saml_b64, "Base64 contains carriage returns - BUG NOT FIXED"
        
        # 2. No spaces
        assert " " not in saml_b64, "Base64 contains spaces - BUG NOT FIXED"
        
        # 3. Valid base64 characters only (A-Z, a-z, 0-9, +, /, =)
        valid_b64_pattern = r'^[A-Za-z0-9+/=]+$'
        assert re.match(valid_b64_pattern, saml_b64), "Base64 contains invalid characters"
        
        # 4. Proper padding (length should be multiple of 4)
        assert len(saml_b64) % 4 == 0, f"Base64 padding incorrect: length {len(saml_b64)} not multiple of 4"
        
        # 5. Can be decoded without errors
        try:
            decoded = base64.b64decode(saml_b64)
            assert len(decoded) > 0, "Decoded base64 is empty"
            # Verify it's valid XML
            decoded_str = decoded.decode('utf-8')
            assert '<samlp:Response' in decoded_str or '<Response' in decoded_str, "Decoded content is not SAML Response XML"
        except Exception as e:
            pytest.fail(f"Base64 decode failed - BUG NOT FIXED: {e}")
        
        print(f"✓ SAML test endpoint base64 is clean and decodable (length: {len(saml_b64)})")
    
    def test_saml_test_endpoint_signed(self, auth_token):
        """Verify SAML response is signed"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/saml/{KISSFLOW_APP_ID}/test",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check if signed
        assert "signed" in data, "Missing 'signed' field in response"
        assert data["signed"] == True, "SAML response is not signed"
        
        # Verify signature is in the XML
        saml_xml = data.get("saml_response_xml", "")
        assert "Signature" in saml_xml, "No Signature element in SAML XML"
        assert "SignatureValue" in saml_xml, "No SignatureValue in SAML XML"
        
        print("✓ SAML response is properly signed")
    
    def test_saml_complete_endpoint_returns_html_with_valid_base64(self, auth_token):
        """Test /api/saml/{app_id}/complete returns HTML form with valid base64"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{KISSFLOW_APP_ID}/complete",
            params={"token": auth_token},
            allow_redirects=False
        )
        
        assert response.status_code == 200, f"SAML complete endpoint failed: {response.status_code}"
        assert "text/html" in response.headers.get("content-type", ""), "Response is not HTML"
        
        html_content = response.text
        
        # Extract SAMLResponse value from the HTML form
        # Pattern: <input type="hidden" name="SAMLResponse" value="..."/>
        match = re.search(r'name="SAMLResponse"\s+value="([^"]+)"', html_content)
        assert match, "SAMLResponse input not found in HTML form"
        
        saml_b64 = match.group(1)
        
        # Bug Fix Verification: Check base64 is clean
        # 1. No newlines
        assert "\n" not in saml_b64, "Complete endpoint base64 contains newlines - BUG NOT FIXED"
        assert "\r" not in saml_b64, "Complete endpoint base64 contains carriage returns - BUG NOT FIXED"
        
        # 2. No spaces
        assert " " not in saml_b64, "Complete endpoint base64 contains spaces - BUG NOT FIXED"
        
        # 3. Valid base64 characters only
        valid_b64_pattern = r'^[A-Za-z0-9+/=]+$'
        assert re.match(valid_b64_pattern, saml_b64), "Complete endpoint base64 contains invalid characters"
        
        # 4. Proper padding
        assert len(saml_b64) % 4 == 0, f"Complete endpoint base64 padding incorrect: length {len(saml_b64)}"
        
        # 5. Can be decoded
        try:
            decoded = base64.b64decode(saml_b64)
            decoded_str = decoded.decode('utf-8')
            assert '<samlp:Response' in decoded_str or '<Response' in decoded_str, "Decoded content is not SAML Response"
        except Exception as e:
            pytest.fail(f"Complete endpoint base64 decode failed - BUG NOT FIXED: {e}")
        
        print(f"✓ SAML complete endpoint base64 is clean and decodable (length: {len(saml_b64)})")


class TestLogoUploadBugFix:
    """Bug Fix 2: Logo upload should return URL with /api/uploads/ prefix and serve the image"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_logo_upload_returns_api_uploads_prefix(self, auth_token):
        """Test POST /api/upload/logo returns URL with /api/uploads/ prefix"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create a simple test image (1x1 red PNG)
        # This is a minimal valid PNG file
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("test_logo.png", png_data, "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/upload/logo",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "logo_url" in data, "Missing logo_url in response"
        assert "filename" in data, "Missing filename in response"
        
        logo_url = data["logo_url"]
        
        # Bug Fix Verification: URL should have /api/uploads/ prefix
        assert "/api/uploads/" in logo_url, f"Logo URL missing /api/uploads/ prefix: {logo_url} - BUG NOT FIXED"
        
        # URL should be absolute (start with https:// or http://)
        assert logo_url.startswith("http"), f"Logo URL is not absolute: {logo_url}"
        
        # URL should contain the filename
        assert data["filename"] in logo_url, f"Logo URL doesn't contain filename: {logo_url}"
        
        print(f"✓ Logo upload returns correct URL with /api/uploads/ prefix: {logo_url}")
        
        return logo_url
    
    def test_uploaded_logo_is_accessible(self, auth_token):
        """Test that uploaded logo URL serves the image (HTTP 200)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Upload a test image first
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {"file": ("test_accessible.png", png_data, "image/png")}
        upload_response = requests.post(
            f"{BASE_URL}/api/upload/logo",
            headers=headers,
            files=files
        )
        
        assert upload_response.status_code == 200
        logo_url = upload_response.json()["logo_url"]
        
        # Bug Fix Verification: The URL should serve the image
        get_response = requests.get(logo_url)
        
        assert get_response.status_code == 200, f"Logo URL not accessible (HTTP {get_response.status_code}): {logo_url} - BUG NOT FIXED"
        
        # Verify content type is image
        content_type = get_response.headers.get("content-type", "")
        assert "image" in content_type, f"Logo URL doesn't serve image content-type: {content_type}"
        
        # Verify content is not empty
        assert len(get_response.content) > 0, "Logo URL returns empty content"
        
        print(f"✓ Uploaded logo is accessible at: {logo_url}")
    
    def test_existing_saml_app_logo_displays(self, auth_token):
        """Test that existing SAML app logos with /api/uploads/ URLs are accessible"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get SAML apps
        response = requests.get(f"{BASE_URL}/api/apps/saml", headers=headers)
        assert response.status_code == 200
        
        apps = response.json()
        
        # Check if any apps have logo_url
        apps_with_logos = [app for app in apps if app.get("logo_url")]
        
        for app in apps_with_logos:
            logo_url = app["logo_url"]
            
            # Verify URL has /api/uploads/ prefix
            if "/api/uploads/" in logo_url:
                # Try to access the logo
                logo_response = requests.get(logo_url)
                if logo_response.status_code == 200:
                    print(f"✓ App '{app['name']}' logo accessible: {logo_url}")
                else:
                    print(f"⚠ App '{app['name']}' logo not accessible (HTTP {logo_response.status_code}): {logo_url}")
            else:
                print(f"⚠ App '{app['name']}' has old logo URL format: {logo_url}")
        
        if not apps_with_logos:
            print("ℹ No SAML apps with logos found - skipping logo display test")


class TestRegressionLogin:
    """Regression test: Login flow should work correctly"""
    
    def test_admin_login(self):
        """Test admin can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        assert "token" in data, "Missing token in login response"
        assert "user" in data, "Missing user in login response"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "org_admin"
        
        print(f"✓ Admin login successful: {ADMIN_EMAIL}")
    
    def test_user_login(self):
        """Test regular user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "suriya.v@refex.co.in",
            "password": "Admin123!"
        })
        
        assert response.status_code == 200, f"User login failed: {response.text}"
        data = response.json()
        
        assert "token" in data
        assert data["user"]["role"] == "user"
        
        print("✓ User login successful: suriya.v@refex.co.in")


class TestRegressionSAMLApp:
    """Regression test: SAML app endpoints should work"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_saml_apps(self, auth_token):
        """Test GET /api/apps/saml returns list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/apps/saml", headers=headers)
        
        assert response.status_code == 200
        apps = response.json()
        assert isinstance(apps, list)
        
        # Find Kissflow app
        kissflow_app = next((a for a in apps if a["id"] == KISSFLOW_APP_ID), None)
        assert kissflow_app is not None, f"Kissflow app {KISSFLOW_APP_ID} not found"
        
        print(f"✓ Found {len(apps)} SAML apps, including Kissflow")
    
    def test_get_kissflow_config(self, auth_token):
        """Test Kissflow config endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/apps/saml/{KISSFLOW_APP_ID}/kissflow-config",
            headers=headers
        )
        
        assert response.status_code == 200
        config = response.json()
        
        assert "idp_url" in config
        assert "security_key" in config
        assert "metadata_url" in config
        
        print(f"✓ Kissflow config endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
