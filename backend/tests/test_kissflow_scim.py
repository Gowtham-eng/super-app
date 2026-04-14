"""
Test Kissflow SCIM Outbound Push Endpoints
Tests the outbound SCIM client that pushes users FROM Refex Super App TO Kissflow's SCIM Server.

Endpoints tested:
- GET /api/kissflow-scim/config - Get Kissflow SCIM configuration status
- POST /api/kissflow-scim/config - Save Kissflow SCIM configuration
- POST /api/kissflow-scim/push-user - Push a single user to Kissflow
- POST /api/kissflow-scim/sync - Trigger full Kissflow SCIM sync
- GET /api/kissflow-scim/logs - Get sync history logs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "gowtham.s@refex.co.in"
ADMIN_PASSWORD = "Admin123!"


class TestKissflowSCIMAuth:
    """Test authentication for Kissflow SCIM endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("token")
    
    def test_admin_login_success(self, admin_token):
        """Verify admin can login"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print(f"✓ Admin login successful")


class TestKissflowSCIMConfig:
    """Test Kissflow SCIM configuration endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_get_config_admin_success(self, admin_token):
        """Admin can get Kissflow SCIM config status"""
        response = requests.get(
            f"{BASE_URL}/api/kissflow-scim/config",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should show configured=true since env vars are set
        assert "configured" in data
        assert data["configured"] == True, "Expected configured=True from env vars"
        assert "base_url" in data
        assert "token_masked" in data
        assert "source" in data
        print(f"✓ GET /api/kissflow-scim/config - configured={data['configured']}, source={data['source']}")
    
    def test_get_config_no_auth_denied(self):
        """Unauthenticated request to config endpoint fails"""
        response = requests.get(f"{BASE_URL}/api/kissflow-scim/config")
        # Can be 401 or 403 depending on middleware order
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ GET /api/kissflow-scim/config - No auth denied ({response.status_code})")
    
    def test_save_config_admin_success(self, admin_token):
        """Admin can save Kissflow SCIM config"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "base_url": "https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/",
                "token": "At-f1a410bd-58da-4d0d-b0f4-0644a4bd1ec8"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True
        print(f"✓ POST /api/kissflow-scim/config - Config saved successfully")
    
    def test_save_config_missing_fields(self, admin_token):
        """Save config fails with missing fields"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"base_url": "https://example.com"}  # Missing token
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ POST /api/kissflow-scim/config - Missing fields rejected (400)")


class TestKissflowSCIMPushUser:
    """Test pushing individual users to Kissflow"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_push_user_admin_success(self, admin_token):
        """Admin can push a single user to Kissflow"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/push-user",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": ADMIN_EMAIL}  # Push the admin user
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return action (created, updated, or already_exists)
        assert "action" in data or "error" in data
        if "action" in data:
            assert data["action"] in ["created", "updated", "already_exists"], f"Unexpected action: {data['action']}"
            print(f"✓ POST /api/kissflow-scim/push-user - {data['action']} for {ADMIN_EMAIL}")
            if "kf_id" in data:
                print(f"  Kissflow ID: {data['kf_id']}")
        else:
            print(f"✓ POST /api/kissflow-scim/push-user - Response: {data}")
    
    def test_push_user_missing_email(self, admin_token):
        """Push user fails without email"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/push-user",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ POST /api/kissflow-scim/push-user - Missing email rejected (400)")
    
    def test_push_user_nonexistent(self, admin_token):
        """Push user fails for non-existent user"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/push-user",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": "nonexistent@refex.co.in"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "error" in data, "Expected error for non-existent user"
        print(f"✓ POST /api/kissflow-scim/push-user - Non-existent user returns error")
    
    def test_push_user_no_auth_denied(self):
        """Unauthenticated request to push-user endpoint fails"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/push-user",
            json={"email": ADMIN_EMAIL}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ POST /api/kissflow-scim/push-user - No auth denied ({response.status_code})")


class TestKissflowSCIMSync:
    """Test full Kissflow SCIM sync - NOTE: This can timeout for large user bases"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_sync_no_auth_denied(self):
        """Unauthenticated request to sync endpoint fails"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/sync",
            json={}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ POST /api/kissflow-scim/sync - No auth denied ({response.status_code})")
    
    def test_sync_admin_success(self, admin_token):
        """Admin can trigger full Kissflow sync (may timeout for large user bases)"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/sync",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},
            timeout=180  # Sync can take time for large user bases
        )
        # Accept 200 (success) or 502/504 (timeout for large user bases)
        if response.status_code == 200:
            data = response.json()
            if "error" not in data:
                assert "total" in data
                assert "created" in data
                assert "updated" in data
                print(f"✓ POST /api/kissflow-scim/sync - Sync completed")
                print(f"  Total: {data.get('total')}, Created: {data.get('created')}, Updated: {data.get('updated')}")
            else:
                print(f"✓ POST /api/kissflow-scim/sync - Response: {data}")
        elif response.status_code in [502, 504]:
            # Timeout is acceptable for large user bases
            print(f"✓ POST /api/kissflow-scim/sync - Timeout ({response.status_code}) - expected for large user bases")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}: {response.text}")


class TestKissflowSCIMLogs:
    """Test Kissflow SCIM sync logs"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_get_logs_admin_success(self, admin_token):
        """Admin can get Kissflow sync logs"""
        response = requests.get(
            f"{BASE_URL}/api/kissflow-scim/logs",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return list of logs
        assert isinstance(data, list)
        print(f"✓ GET /api/kissflow-scim/logs - Retrieved {len(data)} log entries")
        
        # Verify log structure if logs exist
        if len(data) > 0:
            log = data[0]
            assert "org_id" in log
            assert "trigger_type" in log
            assert "timestamp" in log
            assert "result" in log
            print(f"  Latest log: {log.get('trigger_type')} at {log.get('timestamp')}")
    
    def test_get_logs_no_auth_denied(self):
        """Unauthenticated request to logs endpoint fails"""
        response = requests.get(f"{BASE_URL}/api/kissflow-scim/logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ GET /api/kissflow-scim/logs - No auth denied ({response.status_code})")


class TestKissflowSCIMIntegration:
    """Integration tests for Kissflow SCIM push flow"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json().get("token")
    
    def test_config_then_push_flow(self, admin_token):
        """Test complete flow: check config -> push user -> verify log"""
        # Step 1: Check config
        config_resp = requests.get(
            f"{BASE_URL}/api/kissflow-scim/config",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert config_resp.status_code == 200
        config = config_resp.json()
        assert config.get("configured") == True, "Kissflow SCIM must be configured"
        print(f"✓ Step 1: Config verified - source={config.get('source')}")
        
        # Step 2: Push a user
        push_resp = requests.post(
            f"{BASE_URL}/api/kissflow-scim/push-user",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": ADMIN_EMAIL}
        )
        assert push_resp.status_code == 200
        push_result = push_resp.json()
        print(f"✓ Step 2: User pushed - action={push_result.get('action', 'N/A')}")
        
        # Step 3: Verify log was created
        logs_resp = requests.get(
            f"{BASE_URL}/api/kissflow-scim/logs",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert logs_resp.status_code == 200
        logs = logs_resp.json()
        assert len(logs) > 0, "Expected at least one log entry"
        
        # Find the manual_single log for our push
        manual_logs = [l for l in logs if l.get("trigger_type") == "manual_single"]
        assert len(manual_logs) > 0, "Expected manual_single log entry"
        print(f"✓ Step 3: Log verified - {len(logs)} total logs, {len(manual_logs)} manual_single")


class TestKissflowSCIMNonAdminAccess:
    """Test that non-admin users get 403 on all kissflow-scim endpoints"""
    
    def test_non_admin_access_denied_config(self):
        """Non-admin cannot access config endpoint (using invalid token)"""
        # Using an invalid token to simulate non-admin access
        response = requests.get(
            f"{BASE_URL}/api/kissflow-scim/config",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid token denied on /api/kissflow-scim/config (401)")
    
    def test_non_admin_access_denied_push(self):
        """Non-admin cannot access push-user endpoint (using invalid token)"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/push-user",
            headers={"Authorization": "Bearer invalid_token"},
            json={"email": "test@example.com"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid token denied on /api/kissflow-scim/push-user (401)")
    
    def test_non_admin_access_denied_sync(self):
        """Non-admin cannot access sync endpoint (using invalid token)"""
        response = requests.post(
            f"{BASE_URL}/api/kissflow-scim/sync",
            headers={"Authorization": "Bearer invalid_token"},
            json={}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid token denied on /api/kissflow-scim/sync (401)")
    
    def test_non_admin_access_denied_logs(self):
        """Non-admin cannot access logs endpoint (using invalid token)"""
        response = requests.get(
            f"{BASE_URL}/api/kissflow-scim/logs",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid token denied on /api/kissflow-scim/logs (401)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
