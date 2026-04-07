#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class KissflowSSOTester:
    def __init__(self, base_url="https://kissflow-access-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    return True, response_data
                except:
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                self.failed_tests.append({
                    'test': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'response': response.text[:200]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                'test': name,
                'error': str(e)
            })
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "health", 200)

    def test_register_admin(self):
        """Test admin registration"""
        admin_data = {
            "email": "admin@kissflow.com",
            "password": "Admin123!",
            "name": "Admin User",
            "role": "admin"
        }
        success, response = self.run_test("Admin Registration", "POST", "auth/register", 200, admin_data)
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Admin token obtained: {self.token[:20]}...")
            return True
        return False

    def test_login_admin(self):
        """Test admin login"""
        login_data = {
            "email": "admin@kissflow.com",
            "password": "Admin123!"
        }
        success, response = self.run_test("Admin Login", "POST", "auth/login", 200, login_data)
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Admin token obtained: {self.token[:20]}...")
            return True
        return False

    def test_get_current_user(self):
        """Test get current user"""
        return self.run_test("Get Current User", "GET", "auth/me", 200)

    def test_dashboard_stats(self):
        """Test dashboard stats"""
        return self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)

    def test_saml_config_operations(self):
        """Test SAML configuration operations"""
        print("\n📋 Testing SAML Configuration...")
        
        # Get initial config (should be empty)
        self.run_test("Get SAML Config (Empty)", "GET", "saml/config", 200)
        
        # Create SAML config
        saml_config = {
            "entity_id": "https://refexgroup.kissflow.com/saml/",
            "acs_url": "https://refexgroup.kissflow.com/signin/2/saml/?acs",
            "slo_url": "https://refexgroup.kissflow.com/logout",
            "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "sign_assertions": True,
            "sign_response": True
        }
        
        success, response = self.run_test("Create SAML Config", "POST", "saml/config", 200, saml_config)
        if success:
            # Get config after creation
            self.run_test("Get SAML Config (After Creation)", "GET", "saml/config", 200)
            
            # Get metadata
            self.run_test("Get SAML Metadata", "GET", "saml/metadata", 200)
            
            # Get certificate
            self.run_test("Get SAML Certificate", "GET", "saml/certificate", 200)
            
            # Test connection
            test_data = {"protocol": "saml", "config_id": "test"}
            self.run_test("Test SAML Connection", "POST", "connection/test", 200, test_data)
            
            return True
        return False

    def test_oidc_config_operations(self):
        """Test OIDC configuration operations"""
        print("\n🔑 Testing OIDC Configuration...")
        
        # Get initial config (should be empty)
        self.run_test("Get OIDC Config (Empty)", "GET", "oidc/config", 200)
        
        # Create OIDC config
        oidc_config = {
            "client_id": "kissflow-client",
            "redirect_uris": ["https://refexgroup.kissflow.com/callback"],
            "scopes": ["openid", "profile", "email"]
        }
        
        success, response = self.run_test("Create OIDC Config", "POST", "oidc/config", 200, oidc_config)
        if success:
            # Get config after creation
            self.run_test("Get OIDC Config (After Creation)", "GET", "oidc/config", 200)
            
            # Get discovery document
            self.run_test("Get OIDC Discovery", "GET", "oidc/.well-known/openid-configuration", 200)
            
            # Get JWKS
            self.run_test("Get OIDC JWKS", "GET", "oidc/jwks", 200)
            
            # Test connection
            test_data = {"protocol": "oidc", "config_id": "test"}
            self.run_test("Test OIDC Connection", "POST", "connection/test", 200, test_data)
            
            return True
        return False

    def test_user_management(self):
        """Test user management operations"""
        print("\n👥 Testing User Management...")
        
        # Get users list
        success, users = self.run_test("Get Users List", "GET", "users", 200)
        
        # Provision a new user
        provision_data = {
            "email": "test.user@kissflow.com",
            "name": "Test User",
            "role": "user",
            "provisioning_type": "manual"
        }
        
        success, user_response = self.run_test("Provision User", "POST", "users/provision", 200, provision_data)
        
        if success and 'id' in user_response:
            user_id = user_response['id']
            print(f"   Created user ID: {user_id}")
            
            # Update user
            update_data = {
                "name": "Updated Test User",
                "role": "user",
                "status": "active"
            }
            self.run_test("Update User", "PUT", f"users/{user_id}", 200, update_data)
            
            # Delete user
            self.run_test("Delete User", "DELETE", f"users/{user_id}", 200)
            
            return True
        return False

    def test_scim_operations(self):
        """Test SCIM operations"""
        print("\n🤖 Testing SCIM Operations...")
        
        # List SCIM users
        self.run_test("SCIM List Users", "GET", "scim/v2/Users", 200)
        
        # Create SCIM user
        scim_user = {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": "scim.user@kissflow.com",
            "name": {
                "formatted": "SCIM Test User",
                "givenName": "SCIM",
                "familyName": "User"
            },
            "emails": [{"value": "scim.user@kissflow.com", "primary": True}],
            "active": True
        }
        
        success, response = self.run_test("SCIM Create User", "POST", "scim/v2/Users", 200, scim_user)
        return success

def main():
    print("🚀 Starting Kissflow SSO Super App Backend Tests")
    print("=" * 60)
    
    tester = KissflowSSOTester()
    
    # Test sequence
    tests_sequence = [
        ("Health Check", tester.test_health_check),
        ("Admin Registration", tester.test_register_admin),
        ("Admin Login", tester.test_login_admin),
        ("Get Current User", tester.test_get_current_user),
        ("Dashboard Stats", tester.test_dashboard_stats),
        ("SAML Operations", tester.test_saml_config_operations),
        ("OIDC Operations", tester.test_oidc_config_operations),
        ("User Management", tester.test_user_management),
        ("SCIM Operations", tester.test_scim_operations)
    ]
    
    # Run tests
    for test_name, test_func in tests_sequence:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test suite '{test_name}' failed with error: {str(e)}")
            tester.failed_tests.append({
                'test_suite': test_name,
                'error': str(e)
            })
    
    # Print final results
    print(f"\n{'='*60}")
    print(f"📊 Test Results Summary")
    print(f"{'='*60}")
    print(f"Total tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%" if tester.tests_run > 0 else "0%")
    
    if tester.failed_tests:
        print(f"\n❌ Failed Tests:")
        for i, failure in enumerate(tester.failed_tests, 1):
            print(f"{i}. {failure.get('test', failure.get('test_suite', 'Unknown'))}")
            if 'error' in failure:
                print(f"   Error: {failure['error']}")
            if 'expected' in failure:
                print(f"   Expected: {failure['expected']}, Got: {failure['actual']}")
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())