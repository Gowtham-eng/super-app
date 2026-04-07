#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class KissflowIAMTester:
    def __init__(self, base_url="https://kissflow-access-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.org_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.created_resources = {
            'org_id': None,
            'user_id': None,
            'group_id': None,
            'role_id': None,
            'saml_app_id': None,
            'oidc_app_id': None,
            'policy_id': None,
            'request_id': None
        }

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

    def test_create_organization(self):
        """Test organization creation"""
        org_data = {
            "name": "Acme Corp",
            "domain": "acme.com",
            "description": "Test organization for IAM testing"
        }
        success, response = self.run_test("Create Organization", "POST", "organizations", 200, org_data)
        if success and 'id' in response:
            self.created_resources['org_id'] = response['id']
            self.org_id = response['id']
            print(f"   Created org ID: {self.org_id}")
            return True
        return False

    def test_register_admin(self):
        """Test admin registration"""
        if not self.org_id:
            print("❌ No organization ID available for registration")
            return False
            
        admin_data = {
            "email": "admin@acme.com",
            "password": "Admin123!",
            "name": "Admin User",
            "org_id": self.org_id
        }
        success, response = self.run_test("Admin Registration", "POST", "auth/register", 200, admin_data)
        if success and 'token' in response:
            self.token = response['token']
            self.created_resources['user_id'] = response['user']['id']
            print(f"   Admin token obtained: {self.token[:20]}...")
            return True
        return False

    def test_login_admin(self):
        """Test admin login"""
        login_data = {
            "email": "admin@acme.com",
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

    def test_permissions_list(self):
        """Test permissions list"""
        return self.run_test("List Permissions", "GET", "permissions", 200)

    def test_roles_operations(self):
        """Test roles CRUD operations"""
        print("\n👑 Testing Roles Operations...")
        
        # List roles
        success, roles = self.run_test("List Roles", "GET", "roles", 200)
        
        # Create custom role
        role_data = {
            "name": "Test Manager",
            "description": "Test role for IAM testing",
            "permissions": ["perm_users_read", "perm_apps_read"],
            "org_id": self.org_id
        }
        
        success, response = self.run_test("Create Role", "POST", "roles", 200, role_data)
        if success and 'id' in response:
            role_id = response['id']
            self.created_resources['role_id'] = role_id
            print(f"   Created role ID: {role_id}")
            
            # Update role
            update_data = {
                "description": "Updated test role description",
                "permissions": ["perm_users_read", "perm_apps_read", "perm_groups_manage"]
            }
            self.run_test("Update Role", "PUT", f"roles/{role_id}", 200, update_data)
            
            return True
        return False

    def test_groups_operations(self):
        """Test groups CRUD operations"""
        print("\n👥 Testing Groups Operations...")
        
        # List groups
        success, groups = self.run_test("List Groups", "GET", "groups", 200)
        
        # Create group
        group_data = {
            "name": "Test Group",
            "description": "Test group for IAM testing",
            "org_id": self.org_id,
            "role_ids": [self.created_resources['role_id']] if self.created_resources['role_id'] else []
        }
        
        success, response = self.run_test("Create Group", "POST", "groups", 200, group_data)
        if success and 'id' in response:
            group_id = response['id']
            self.created_resources['group_id'] = group_id
            print(f"   Created group ID: {group_id}")
            
            # Update group
            update_data = {
                "description": "Updated test group description"
            }
            self.run_test("Update Group", "PUT", f"groups/{group_id}", 200, update_data)
            
            return True
        return False

    def test_users_operations(self):
        """Test users CRUD operations"""
        print("\n👤 Testing Users Operations...")
        
        # List users
        success, users = self.run_test("List Users", "GET", "users", 200)
        
        # Create user
        user_data = {
            "email": "testuser@acme.com",
            "password": "TestUser123!",
            "name": "Test User",
            "org_id": self.org_id
        }
        
        success, response = self.run_test("Create User", "POST", "users", 200, user_data)
        if success and 'id' in response:
            user_id = response['id']
            print(f"   Created user ID: {user_id}")
            
            # Update user
            update_data = {
                "name": "Updated Test User",
                "group_ids": [self.created_resources['group_id']] if self.created_resources['group_id'] else []
            }
            self.run_test("Update User", "PUT", f"users/{user_id}", 200, update_data)
            
            return True
        return False

    def test_saml_apps_operations(self):
        """Test SAML apps CRUD operations"""
        print("\n🛡️ Testing SAML Apps Operations...")
        
        # List SAML apps
        success, apps = self.run_test("List SAML Apps", "GET", "apps/saml", 200)
        
        # Create SAML app
        saml_data = {
            "name": "Test SAML App",
            "description": "Test SAML application",
            "org_id": self.org_id,
            "entity_id": "https://test.acme.com/saml",
            "acs_url": "https://test.acme.com/saml/acs",
            "slo_url": "https://test.acme.com/saml/slo",
            "name_id_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "sign_assertions": True,
            "sign_response": True,
            "allowed_group_ids": [self.created_resources['group_id']] if self.created_resources['group_id'] else []
        }
        
        success, response = self.run_test("Create SAML App", "POST", "apps/saml", 200, saml_data)
        if success and 'id' in response:
            app_id = response['id']
            self.created_resources['saml_app_id'] = app_id
            print(f"   Created SAML app ID: {app_id}")
            
            # Get SAML app
            self.run_test("Get SAML App", "GET", f"apps/saml/{app_id}", 200)
            
            # Get SAML metadata
            self.run_test("Get SAML Metadata", "GET", f"apps/saml/{app_id}/metadata", 200)
            
            # Update SAML app
            update_data = {
                "description": "Updated SAML app description"
            }
            self.run_test("Update SAML App", "PUT", f"apps/saml/{app_id}", 200, update_data)
            
            return True
        return False

    def test_oidc_apps_operations(self):
        """Test OIDC apps CRUD operations"""
        print("\n🔑 Testing OIDC Apps Operations...")
        
        # List OIDC apps
        success, apps = self.run_test("List OIDC Apps", "GET", "apps/oidc", 200)
        
        # Create OIDC app
        oidc_data = {
            "name": "Test OIDC App",
            "description": "Test OIDC application",
            "org_id": self.org_id,
            "redirect_uris": ["https://test.acme.com/callback"],
            "logout_uris": ["https://test.acme.com/logout"],
            "scopes": ["openid", "profile", "email"],
            "grant_types": ["authorization_code"],
            "allowed_group_ids": [self.created_resources['group_id']] if self.created_resources['group_id'] else []
        }
        
        success, response = self.run_test("Create OIDC App", "POST", "apps/oidc", 200, oidc_data)
        if success and 'id' in response:
            app_id = response['id']
            self.created_resources['oidc_app_id'] = app_id
            print(f"   Created OIDC app ID: {app_id}")
            
            # Get OIDC app
            self.run_test("Get OIDC App", "GET", f"apps/oidc/{app_id}", 200)
            
            # Get OIDC discovery
            self.run_test("Get OIDC Discovery", "GET", f"apps/oidc/{app_id}/.well-known/openid-configuration", 200)
            
            # Update OIDC app
            update_data = {
                "description": "Updated OIDC app description"
            }
            self.run_test("Update OIDC App", "PUT", f"apps/oidc/{app_id}", 200, update_data)
            
            return True
        return False

    def test_policies_operations(self):
        """Test access policies CRUD operations"""
        print("\n🛡️ Testing Access Policies Operations...")
        
        # List policies
        success, policies = self.run_test("List Policies", "GET", "policies", 200)
        
        # Create policy
        policy_data = {
            "name": "Test Access Policy",
            "description": "Test access policy for IAM testing",
            "org_id": self.org_id,
            "app_ids": [self.created_resources['saml_app_id']] if self.created_resources['saml_app_id'] else [],
            "conditions": {
                "ip_whitelist": ["192.168.1.0/24"],
                "time_restrictions": {
                    "start_hour": 9,
                    "end_hour": 17,
                    "allowed_days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
                }
            }
        }
        
        success, response = self.run_test("Create Policy", "POST", "policies", 200, policy_data)
        if success and 'id' in response:
            policy_id = response['id']
            self.created_resources['policy_id'] = policy_id
            print(f"   Created policy ID: {policy_id}")
            
            # Update policy
            update_data = {
                "description": "Updated access policy description",
                "enabled": False
            }
            self.run_test("Update Policy", "PUT", f"policies/{policy_id}", 200, update_data)
            
            return True
        return False

    def test_access_requests_operations(self):
        """Test access requests operations"""
        print("\n📋 Testing Access Requests Operations...")
        
        # List access requests
        success, requests = self.run_test("List Access Requests", "GET", "access-requests", 200)
        
        # Create access request (if we have an app)
        if self.created_resources['saml_app_id']:
            request_data = {
                "app_id": self.created_resources['saml_app_id'],
                "reason": "Need access for testing purposes"
            }
            
            success, response = self.run_test("Create Access Request", "POST", "access-requests", 200, request_data)
            if success and 'id' in response:
                request_id = response['id']
                self.created_resources['request_id'] = request_id
                print(f"   Created access request ID: {request_id}")
                
                # Review access request (approve)
                self.run_test("Approve Access Request", "PUT", f"access-requests/{request_id}?action=approve", 200)
                
                return True
        return False

    def test_audit_logs_operations(self):
        """Test audit logs operations"""
        print("\n📊 Testing Audit Logs Operations...")
        
        # List audit logs
        success, logs = self.run_test("List Audit Logs", "GET", "audit-logs", 200)
        
        # Get audit summary
        success, summary = self.run_test("Get Audit Summary", "GET", "audit-logs/summary", 200)
        
        return success

    def test_app_launcher_operations(self):
        """Test app launcher operations"""
        print("\n🚀 Testing App Launcher Operations...")
        
        # Get user apps
        success, apps = self.run_test("Get User Apps", "GET", "launcher/apps", 200)
        
        # Get app catalog
        success, catalog = self.run_test("Get App Catalog", "GET", "catalog/apps", 200)
        
        return success

    def cleanup_resources(self):
        """Clean up created resources"""
        print("\n🧹 Cleaning up test resources...")
        
        # Delete in reverse order of dependencies
        if self.created_resources['request_id']:
            self.run_test("Delete Access Request", "DELETE", f"access-requests/{self.created_resources['request_id']}", 200)
        
        if self.created_resources['policy_id']:
            self.run_test("Delete Policy", "DELETE", f"policies/{self.created_resources['policy_id']}", 200)
        
        if self.created_resources['oidc_app_id']:
            self.run_test("Delete OIDC App", "DELETE", f"apps/oidc/{self.created_resources['oidc_app_id']}", 200)
        
        if self.created_resources['saml_app_id']:
            self.run_test("Delete SAML App", "DELETE", f"apps/saml/{self.created_resources['saml_app_id']}", 200)
        
        if self.created_resources['group_id']:
            self.run_test("Delete Group", "DELETE", f"groups/{self.created_resources['group_id']}", 200)
        
        if self.created_resources['role_id']:
            self.run_test("Delete Role", "DELETE", f"roles/{self.created_resources['role_id']}", 200)

def main():
    print("🚀 Starting Kissflow IAM System Backend Tests")
    print("=" * 60)
    
    tester = KissflowIAMTester()
    
    # Test sequence
    tests_sequence = [
        ("Health Check", tester.test_health_check),
        ("Create Organization", tester.test_create_organization),
        ("Admin Registration", tester.test_register_admin),
        ("Admin Login", tester.test_login_admin),
        ("Get Current User", tester.test_get_current_user),
        ("Dashboard Stats", tester.test_dashboard_stats),
        ("List Permissions", tester.test_permissions_list),
        ("Roles Operations", tester.test_roles_operations),
        ("Groups Operations", tester.test_groups_operations),
        ("Users Operations", tester.test_users_operations),
        ("SAML Apps Operations", tester.test_saml_apps_operations),
        ("OIDC Apps Operations", tester.test_oidc_apps_operations),
        ("Policies Operations", tester.test_policies_operations),
        ("Access Requests Operations", tester.test_access_requests_operations),
        ("Audit Logs Operations", tester.test_audit_logs_operations),
        ("App Launcher Operations", tester.test_app_launcher_operations),
        ("Cleanup Resources", tester.cleanup_resources)
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