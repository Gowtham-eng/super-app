"""
SAML SSO Integration Tests for Kissflow IAM System
Tests the SAML SSO redirect flow, SAML response signing, and URL configuration
"""
import pytest
import requests
import os
import base64
import re
from xml.etree import ElementTree as ET

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
PUBLIC_DOMAIN = "kissflow-access-hub.preview.emergentagent.com"
SAML_APP_ID = "e5a4c999-65fd-4301-9ebd-8948893eea0d"

# Test credentials
ACME_ADMIN = {"email": "admin@acme.com", "password": "Admin123!"}
REFEX_ADMIN = {"email": "gowtham.s@refex.co.in", "password": "Admin123!"}


class TestHealthAndBasics:
    """Basic health and connectivity tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Health endpoint working: {data}")


class TestAuthentication:
    """Authentication tests for both admin accounts"""
    
    def test_acme_admin_login(self):
        """Test Acme admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ACME_ADMIN)
        assert response.status_code == 200, f"Acme admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ACME_ADMIN["email"]
        print(f"✓ Acme admin login successful: {data['user']['email']}")
        return data["token"]
    
    def test_refex_admin_login(self):
        """Test Refex admin login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        assert response.status_code == 200, f"Refex admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == REFEX_ADMIN["email"]
        print(f"✓ Refex admin login successful: {data['user']['email']}")
        return data["token"]


class TestSAMLSSORedirect:
    """Test SAML SSO redirect endpoint returns public URLs"""
    
    def test_saml_sso_returns_html(self):
        """Test GET /api/saml/{app_id}/sso returns HTML"""
        response = requests.get(f"{BASE_URL}/api/saml/{SAML_APP_ID}/sso")
        assert response.status_code == 200, f"SAML SSO endpoint failed: {response.text}"
        assert "text/html" in response.headers.get("content-type", "")
        print(f"✓ SAML SSO endpoint returns HTML")
    
    def test_saml_sso_contains_public_url(self):
        """Test SAML SSO HTML contains public URL, NOT internal cluster URLs"""
        response = requests.get(f"{BASE_URL}/api/saml/{SAML_APP_ID}/sso")
        assert response.status_code == 200
        html_content = response.text
        
        # Check that public URL is present in the Sign In link
        assert PUBLIC_DOMAIN in html_content, f"Public domain {PUBLIC_DOMAIN} not found in SSO HTML"
        
        # Check that internal cluster URLs are NOT present
        internal_patterns = [
            "backend-service.default.svc.cluster.local",
            "localhost:8001",
            "127.0.0.1:8001",
            "0.0.0.0:8001"
        ]
        for pattern in internal_patterns:
            assert pattern not in html_content, f"Internal URL pattern '{pattern}' found in SSO HTML - should use public URL"
        
        # Verify the login URL format
        expected_login_url = f"https://{PUBLIC_DOMAIN}/login?sso_app={SAML_APP_ID}"
        assert expected_login_url in html_content, f"Expected login URL not found: {expected_login_url}"
        
        print(f"✓ SAML SSO HTML contains correct public URL: https://{PUBLIC_DOMAIN}")
    
    def test_saml_sso_with_relay_state(self):
        """Test SAML SSO preserves RelayState parameter"""
        relay_state = "https://refexgroup.kissflow.com/dashboard"
        response = requests.get(f"{BASE_URL}/api/saml/{SAML_APP_ID}/sso?RelayState={relay_state}")
        assert response.status_code == 200
        html_content = response.text
        
        # RelayState should be included in the login URL
        assert "relay_state=" in html_content, "RelayState not preserved in login URL"
        print(f"✓ SAML SSO preserves RelayState parameter")


class TestSAMLComplete:
    """Test SAML Complete endpoint generates signed SAML responses"""
    
    @pytest.fixture
    def refex_token(self):
        """Get auth token for Refex admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_saml_complete_requires_auth(self):
        """Test SAML complete redirects to login without token"""
        response = requests.get(f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete", allow_redirects=False)
        # Should redirect to login
        assert response.status_code in [302, 307, 200], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            # Check if it's a redirect HTML or login page
            assert "login" in response.text.lower() or "redirect" in response.text.lower()
        print(f"✓ SAML complete requires authentication")
    
    def test_saml_complete_returns_html_form(self, refex_token):
        """Test SAML complete returns HTML form with SAMLResponse"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete?token={refex_token}",
            allow_redirects=False
        )
        assert response.status_code == 200, f"SAML complete failed: {response.text}"
        html_content = response.text
        
        # Check it's an HTML form
        assert "<form" in html_content, "No form element found"
        assert "SAMLResponse" in html_content, "SAMLResponse input not found"
        
        print(f"✓ SAML complete returns HTML form with SAMLResponse")
    
    def test_saml_complete_posts_to_correct_acs(self, refex_token):
        """Test SAML complete form posts to correct ACS URL"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete?token={refex_token}",
            allow_redirects=False
        )
        assert response.status_code == 200
        html_content = response.text
        
        # Check form action is the Kissflow ACS URL
        expected_acs = "https://refexgroup.kissflow.com/signin/2/AcCMptlq60zH/saml/?acs"
        assert expected_acs in html_content, f"Expected ACS URL not found: {expected_acs}"
        
        print(f"✓ SAML complete form posts to correct ACS URL: {expected_acs}")
    
    def test_saml_response_is_signed(self, refex_token):
        """Test SAML response contains signature elements"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete?token={refex_token}",
            allow_redirects=False
        )
        assert response.status_code == 200
        html_content = response.text
        
        # Extract SAMLResponse value
        match = re.search(r'name="SAMLResponse"\s+value="([^"]+)"', html_content)
        assert match, "Could not extract SAMLResponse value"
        
        saml_response_b64 = match.group(1)
        saml_response_xml = base64.b64decode(saml_response_b64).decode('utf-8')
        
        # Check for signature elements
        assert "SignatureValue" in saml_response_xml, "SignatureValue not found - SAML response is NOT signed"
        assert "DigestValue" in saml_response_xml, "DigestValue not found - SAML response is NOT signed"
        assert "X509Certificate" in saml_response_xml, "X509Certificate not found - SAML response is NOT signed"
        
        # Verify SignatureValue is not empty
        sig_match = re.search(r'<ds:SignatureValue[^>]*>([^<]+)</ds:SignatureValue>', saml_response_xml)
        if not sig_match:
            sig_match = re.search(r'<SignatureValue[^>]*>([^<]+)</SignatureValue>', saml_response_xml)
        assert sig_match, "SignatureValue element is empty or malformed"
        sig_value = sig_match.group(1).strip()
        assert len(sig_value) > 50, f"SignatureValue appears too short: {len(sig_value)} chars"
        
        print(f"✓ SAML response is SIGNED with SignatureValue ({len(sig_value)} chars)")
    
    def test_saml_response_issuer_uses_public_url(self, refex_token):
        """Test SAML response Issuer uses public URL"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete?token={refex_token}",
            allow_redirects=False
        )
        assert response.status_code == 200
        html_content = response.text
        
        # Extract SAMLResponse
        match = re.search(r'name="SAMLResponse"\s+value="([^"]+)"', html_content)
        assert match
        
        saml_response_xml = base64.b64decode(match.group(1)).decode('utf-8')
        
        # Check Issuer contains public URL
        expected_issuer = f"https://{PUBLIC_DOMAIN}/api/saml/{SAML_APP_ID}"
        assert expected_issuer in saml_response_xml, f"Expected Issuer not found: {expected_issuer}"
        
        # Verify no internal URLs in the SAML response
        internal_patterns = [
            "backend-service.default.svc.cluster.local",
            "localhost:8001",
            "127.0.0.1:8001"
        ]
        for pattern in internal_patterns:
            assert pattern not in saml_response_xml, f"Internal URL '{pattern}' found in SAML response"
        
        print(f"✓ SAML response Issuer uses public URL: {expected_issuer}")
    
    def test_saml_response_nameid_is_user_email(self, refex_token):
        """Test SAML response NameID is the user's email"""
        response = requests.get(
            f"{BASE_URL}/api/saml/{SAML_APP_ID}/complete?token={refex_token}",
            allow_redirects=False
        )
        assert response.status_code == 200
        html_content = response.text
        
        # Extract SAMLResponse
        match = re.search(r'name="SAMLResponse"\s+value="([^"]+)"', html_content)
        assert match
        
        saml_response_xml = base64.b64decode(match.group(1)).decode('utf-8')
        
        # Check NameID contains user email
        expected_email = REFEX_ADMIN["email"]
        assert expected_email in saml_response_xml, f"User email {expected_email} not found in SAML response NameID"
        
        print(f"✓ SAML response NameID contains user email: {expected_email}")


class TestKissflowConfig:
    """Test Kissflow configuration endpoint returns public URLs"""
    
    def test_kissflow_config_returns_public_urls(self):
        """Test GET /api/apps/saml/{app_id}/kissflow-config returns public URLs"""
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/kissflow-config")
        assert response.status_code == 200, f"Kissflow config failed: {response.text}"
        data = response.json()
        
        # Check all URLs use public domain
        assert PUBLIC_DOMAIN in data["idp_url"], f"idp_url should use public domain: {data['idp_url']}"
        assert PUBLIC_DOMAIN in data["sso_url"], f"sso_url should use public domain: {data['sso_url']}"
        assert PUBLIC_DOMAIN in data["slo_url"], f"slo_url should use public domain: {data['slo_url']}"
        assert PUBLIC_DOMAIN in data["metadata_url"], f"metadata_url should use public domain: {data['metadata_url']}"
        
        # Verify no internal URLs
        for key in ["idp_url", "sso_url", "slo_url", "metadata_url"]:
            assert "localhost" not in data[key], f"{key} contains localhost"
            assert "cluster.local" not in data[key], f"{key} contains cluster.local"
        
        print(f"✓ Kissflow config returns all public URLs:")
        print(f"  - idp_url: {data['idp_url']}")
        print(f"  - sso_url: {data['sso_url']}")
        print(f"  - metadata_url: {data['metadata_url']}")
    
    def test_kissflow_config_has_security_key(self):
        """Test Kissflow config includes security key (certificate fingerprint)"""
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/kissflow-config")
        assert response.status_code == 200
        data = response.json()
        
        assert "security_key" in data, "security_key not in response"
        assert len(data["security_key"]) > 0, "security_key is empty"
        
        # Should be a hex string (SHA256 fingerprint)
        assert all(c in '0123456789abcdef' for c in data["security_key"]), "security_key should be hex"
        
        print(f"✓ Kissflow config has security key: {data['security_key'][:32]}...")


class TestSAMLMetadata:
    """Test SAML metadata endpoint returns public URLs"""
    
    def test_metadata_returns_xml(self):
        """Test GET /api/apps/saml/{app_id}/metadata returns XML"""
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/metadata")
        assert response.status_code == 200, f"Metadata endpoint failed: {response.text}"
        assert "xml" in response.headers.get("content-type", "").lower()
        print(f"✓ Metadata endpoint returns XML")
    
    def test_metadata_contains_public_urls(self):
        """Test metadata XML contains public domain URLs"""
        response = requests.get(f"{BASE_URL}/api/apps/saml/{SAML_APP_ID}/metadata")
        assert response.status_code == 200
        xml_content = response.text
        
        # Check public domain is in metadata
        assert PUBLIC_DOMAIN in xml_content, f"Public domain {PUBLIC_DOMAIN} not found in metadata"
        
        # Check for SSO endpoint
        expected_sso = f"https://{PUBLIC_DOMAIN}/api/saml/{SAML_APP_ID}/sso"
        assert expected_sso in xml_content, f"Expected SSO URL not in metadata: {expected_sso}"
        
        # Verify no internal URLs
        internal_patterns = [
            "backend-service.default.svc.cluster.local",
            "localhost:8001",
            "127.0.0.1:8001"
        ]
        for pattern in internal_patterns:
            assert pattern not in xml_content, f"Internal URL '{pattern}' found in metadata"
        
        print(f"✓ Metadata contains public URLs: https://{PUBLIC_DOMAIN}")


class TestAppLauncher:
    """Test App Launcher functionality"""
    
    @pytest.fixture
    def refex_token(self):
        """Get auth token for Refex admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=REFEX_ADMIN)
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_launcher_apps_endpoint(self, refex_token):
        """Test /api/launcher/apps returns apps for authorized user"""
        headers = {"Authorization": f"Bearer {refex_token}"}
        response = requests.get(f"{BASE_URL}/api/launcher/apps", headers=headers)
        assert response.status_code == 200, f"Launcher apps failed: {response.text}"
        apps = response.json()
        
        # Should return a list
        assert isinstance(apps, list), "Response should be a list"
        
        # Check if Kissflow app is in the list
        kissflow_app = next((app for app in apps if app.get("id") == SAML_APP_ID), None)
        if kissflow_app:
            print(f"✓ Kissflow app found in launcher: {kissflow_app.get('name')}")
            assert "launch_url" in kissflow_app, "App should have launch_url"
        else:
            print(f"⚠ Kissflow app not in launcher (user may not have access)")
        
        print(f"✓ Launcher apps endpoint returns {len(apps)} apps")


class TestSAMLAppNotFound:
    """Test error handling for non-existent SAML apps"""
    
    def test_sso_invalid_app_returns_404(self):
        """Test SSO endpoint returns 404 for invalid app ID"""
        response = requests.get(f"{BASE_URL}/api/saml/invalid-app-id/sso")
        assert response.status_code == 404
        print(f"✓ SSO returns 404 for invalid app ID")
    
    def test_metadata_invalid_app_returns_404(self):
        """Test metadata endpoint returns 404 for invalid app ID"""
        response = requests.get(f"{BASE_URL}/api/apps/saml/invalid-app-id/metadata")
        assert response.status_code == 404
        print(f"✓ Metadata returns 404 for invalid app ID")
    
    def test_kissflow_config_invalid_app_returns_404(self):
        """Test kissflow-config endpoint returns 404 for invalid app ID"""
        response = requests.get(f"{BASE_URL}/api/apps/saml/invalid-app-id/kissflow-config")
        assert response.status_code == 404
        print(f"✓ Kissflow config returns 404 for invalid app ID")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
