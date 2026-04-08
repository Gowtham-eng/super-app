from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import ipaddress

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'kissflow-iam-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 720  # 30 days

# Public URL - MUST be set for SAML SSO to work in Kubernetes
PUBLIC_URL = os.environ.get('PUBLIC_URL', '').rstrip('/')

app = FastAPI(title="Kissflow IAM - Identity & Access Management")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Static uploads directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)
from fastapi.staticfiles import StaticFiles
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ===================== MODELS =====================

# Organization Models
class OrganizationCreate(BaseModel):
    name: str
    domain: str
    description: Optional[str] = None

class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    domain: str
    description: Optional[str] = None
    created_at: str
    status: str = "active"

# Permission & Role Models
class Permission(BaseModel):
    id: str
    name: str
    description: str
    resource: str  # apps, users, groups, settings, audit
    actions: List[str]  # create, read, update, delete, manage

class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[str]  # permission IDs
    org_id: str

class Role(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    permissions: List[str]
    org_id: str
    is_system: bool = False
    created_at: str

# Group Models
class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    org_id: str
    parent_id: Optional[str] = None
    role_ids: List[str] = []

class Group(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    org_id: str
    parent_id: Optional[str] = None
    role_ids: List[str] = []
    member_count: int = 0
    created_at: str

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    org_id: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    group_ids: Optional[List[str]] = None
    role_ids: Optional[List[str]] = None

# Application Models (SAML & OIDC)
class SAMLAppCreate(BaseModel):
    name: str
    description: Optional[str] = None
    org_id: str
    entity_id: str
    acs_url: str
    slo_url: Optional[str] = None
    home_url: Optional[str] = None
    name_id_format: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    sign_assertions: bool = True
    sign_response: bool = True
    attribute_mappings: Dict[str, str] = {}
    logo_url: Optional[str] = None
    allowed_group_ids: List[str] = []
    allowed_role_ids: List[str] = []

class OIDCAppCreate(BaseModel):
    name: str
    description: Optional[str] = None
    org_id: str
    redirect_uris: List[str]
    logout_uris: List[str] = []
    scopes: List[str] = ["openid", "profile", "email"]
    grant_types: List[str] = ["authorization_code"]
    logo_url: Optional[str] = None
    allowed_group_ids: List[str] = []
    allowed_role_ids: List[str] = []

# Access Policy Models
class AccessPolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    org_id: str
    app_ids: List[str] = []  # Empty means all apps
    conditions: Dict[str, Any] = {}  # ip_whitelist, ip_blacklist, time_restrictions, mfa_required

class AccessPolicy(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: Optional[str] = None
    org_id: str
    app_ids: List[str] = []
    conditions: Dict[str, Any] = {}
    enabled: bool = True
    created_at: str

# Access Request Models
class AccessRequestCreate(BaseModel):
    app_id: str
    reason: str

class AccessRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    user_email: str
    user_name: str
    app_id: str
    app_name: str
    app_type: str  # saml or oidc
    reason: str
    status: str = "pending"  # pending, approved, rejected
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    org_id: str
    created_at: str

# Audit Log Models
class AuditLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    org_id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    action: str  # login, logout, app_access, user_created, role_changed, etc.
    resource_type: str  # user, app, group, role, policy
    resource_id: Optional[str] = None
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: str
    status: str = "success"  # success, failure

# ===================== HELPERS =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, org_id: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'org_id': org_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def log_audit(org_id: str, action: str, resource_type: str, user_id: str = None, 
                   user_email: str = None, resource_id: str = None, details: dict = None,
                   ip_address: str = None, status: str = "success"):
    audit_doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "user_id": user_id,
        "user_email": user_email,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
        "ip_address": ip_address,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status
    }
    await db.audit_logs.insert_one(audit_doc)

def get_public_base_url(request: Request = None) -> str:
    """Get the public-facing base URL. Uses PUBLIC_URL env var, falls back to request headers."""
    if PUBLIC_URL:
        return PUBLIC_URL
    if request:
        forwarded_host = request.headers.get('x-forwarded-host')
        host = forwarded_host or request.headers.get('host', '')
        scheme = request.headers.get('x-forwarded-proto', 'https')
        return f"{scheme}://{host}"
    return 'http://localhost:8001'

def generate_self_signed_cert():
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Kissflow IAM"),
        x509.NameAttribute(NameOID.COMMON_NAME, "iam.kissflow.local"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
        .sign(key, hashes.SHA256())
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    ).decode()
    return cert_pem, key_pem

def generate_saml_metadata(app: dict, base_url: str) -> str:
    cert = app.get('certificate', '')
    cert_clean = cert.replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '').replace('\n', '').strip()
    
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" 
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="{app['entity_id']}">
    <md:IDPSSODescriptor WantAuthnRequestsSigned="true" 
                         protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing">
            <ds:KeyInfo><ds:X509Data><ds:X509Certificate>{cert_clean}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>
        </md:KeyDescriptor>
        <md:NameIDFormat>{app['name_id_format']}</md:NameIDFormat>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="{base_url}/api/saml/{app['id']}/sso"/>
        <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="{base_url}/api/saml/{app['id']}/slo"/>
    </md:IDPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en">{app['name']}</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en">{app['name']}</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en">{base_url}</md:OrganizationURL>
    </md:Organization>
</md:EntityDescriptor>'''

async def check_user_app_access(user: dict, app: dict) -> bool:
    """Check if user has access to an application based on direct approval, groups, or roles.
    Access must be explicitly granted - no implicit access for unrestricted apps."""
    user_id = user.get('id')
    user_groups = set(user.get('group_ids', []))
    user_roles = set(user.get('role_ids', []))
    
    allowed_groups = set(app.get('allowed_group_ids', []))
    allowed_roles = set(app.get('allowed_role_ids', []))
    approved_users = set(app.get('approved_user_ids', []))
    
    # Org admins always have access
    if user.get('role') == 'org_admin':
        return True
    
    # Check if user was directly approved for this app
    if user_id in approved_users:
        return True
    
    # Check group membership
    if allowed_groups and user_groups.intersection(allowed_groups):
        return True
    
    # Check role assignment
    if allowed_roles and user_roles.intersection(allowed_roles):
        return True
    
    # Check if user is in a group that has an allowed role
    for group_id in user_groups:
        group = await db.groups.find_one({"id": group_id}, {"_id": 0})
        if group:
            group_roles = set(group.get('role_ids', []))
            if group_roles.intersection(allowed_roles):
                return True
    
    return False

async def check_access_policies(user: dict, app: dict, request: Request) -> tuple:
    """Check access policies and return (allowed, reason)"""
    org_id = user.get('org_id')
    app_id = app.get('id')
    client_ip = request.client.host if request.client else None
    
    policies = await db.access_policies.find({
        "org_id": org_id,
        "enabled": True,
        "$or": [
            {"app_ids": []},
            {"app_ids": app_id}
        ]
    }, {"_id": 0}).to_list(100)
    
    for policy in policies:
        conditions = policy.get('conditions', {})
        
        # IP Whitelist check
        if 'ip_whitelist' in conditions and conditions['ip_whitelist']:
            if client_ip:
                allowed = False
                for ip_range in conditions['ip_whitelist']:
                    try:
                        if '/' in ip_range:
                            if ipaddress.ip_address(client_ip) in ipaddress.ip_network(ip_range, strict=False):
                                allowed = True
                                break
                        elif client_ip == ip_range:
                            allowed = True
                            break
                    except:
                        pass
                if not allowed:
                    return False, f"IP {client_ip} not in whitelist"
        
        # IP Blacklist check
        if 'ip_blacklist' in conditions and conditions['ip_blacklist']:
            if client_ip:
                for ip_range in conditions['ip_blacklist']:
                    try:
                        if '/' in ip_range:
                            if ipaddress.ip_address(client_ip) in ipaddress.ip_network(ip_range, strict=False):
                                return False, f"IP {client_ip} is blacklisted"
                        elif client_ip == ip_range:
                            return False, f"IP {client_ip} is blacklisted"
                    except:
                        pass
        
        # Time restrictions check
        if 'time_restrictions' in conditions:
            tr = conditions['time_restrictions']
            now = datetime.now(timezone.utc)
            
            if 'allowed_days' in tr:
                if now.strftime('%A').lower() not in [d.lower() for d in tr['allowed_days']]:
                    return False, "Access not allowed on this day"
            
            if 'start_hour' in tr and 'end_hour' in tr:
                current_hour = now.hour
                if not (tr['start_hour'] <= current_hour < tr['end_hour']):
                    return False, f"Access only allowed between {tr['start_hour']}:00 and {tr['end_hour']}:00 UTC"
    
    return True, None

# ===================== DEFAULT DATA SEEDING =====================

async def seed_default_permissions():
    """Seed default system permissions"""
    default_permissions = [
        {"id": "perm_apps_manage", "name": "Manage Applications", "description": "Create, edit, delete applications", "resource": "apps", "actions": ["create", "read", "update", "delete"]},
        {"id": "perm_apps_read", "name": "View Applications", "description": "View application list and details", "resource": "apps", "actions": ["read"]},
        {"id": "perm_users_manage", "name": "Manage Users", "description": "Create, edit, delete users", "resource": "users", "actions": ["create", "read", "update", "delete"]},
        {"id": "perm_users_read", "name": "View Users", "description": "View user list and details", "resource": "users", "actions": ["read"]},
        {"id": "perm_groups_manage", "name": "Manage Groups", "description": "Create, edit, delete groups", "resource": "groups", "actions": ["create", "read", "update", "delete"]},
        {"id": "perm_roles_manage", "name": "Manage Roles", "description": "Create, edit, delete roles", "resource": "roles", "actions": ["create", "read", "update", "delete"]},
        {"id": "perm_policies_manage", "name": "Manage Policies", "description": "Create, edit, delete access policies", "resource": "policies", "actions": ["create", "read", "update", "delete"]},
        {"id": "perm_audit_read", "name": "View Audit Logs", "description": "View audit logs and reports", "resource": "audit", "actions": ["read"]},
        {"id": "perm_requests_manage", "name": "Manage Access Requests", "description": "Approve or reject access requests", "resource": "requests", "actions": ["read", "update"]},
        {"id": "perm_org_manage", "name": "Manage Organization", "description": "Edit organization settings", "resource": "organization", "actions": ["read", "update"]},
    ]
    
    for perm in default_permissions:
        existing = await db.permissions.find_one({"id": perm['id']})
        if not existing:
            await db.permissions.insert_one(perm)

# ===================== AUTH ROUTES =====================

@api_router.post("/auth/register")
async def register(user: UserCreate, request: Request):
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Verify organization exists
    org = await db.organizations.find_one({"id": user.org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=400, detail="Organization not found")
    
    user_id = str(uuid.uuid4())
    user_count = await db.users.count_documents({"org_id": user.org_id})
    role = "org_admin" if user_count == 0 else "user"
    
    user_doc = {
        "id": user_id,
        "email": user.email,
        "password": hash_password(user.password),
        "name": user.name,
        "org_id": user.org_id,
        "role": role,
        "group_ids": [],
        "role_ids": [],
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.users.insert_one(user_doc)
    await log_audit(user.org_id, "user_registered", "user", user_id, user.email, user_id, 
                   {"name": user.name}, request.client.host if request.client else None)
    
    token = create_token(user_id, user.email, user.org_id, role)
    return {"token": token, "user": {"id": user_id, "email": user.email, "name": user.name, "role": role, "org_id": user.org_id}}

@api_router.post("/auth/login")
async def login(credentials: UserLogin, request: Request):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user.get('status') != 'active':
        raise HTTPException(status_code=403, detail="Account is not active")
    
    await log_audit(user['org_id'], "user_login", "user", user['id'], user['email'], user['id'],
                   {}, request.client.host if request.client else None)
    
    token = create_token(user['id'], user['email'], user['org_id'], user['role'])
    return {"token": token, "user": {"id": user['id'], "email": user['email'], "name": user['name'], 
                                      "role": user['role'], "org_id": user['org_id']}}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user['org_id']}, {"_id": 0})
    return {**user, "organization": org}


# ===================== FILE UPLOAD =====================

@api_router.post("/upload/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload a logo image and return URL"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'png'
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = UPLOAD_DIR / filename
    
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    
    with open(filepath, 'wb') as f:
        f.write(contents)
    
    base_url = get_public_base_url()
    logo_url = f"{base_url}/api/uploads/{filename}"
    return {"logo_url": logo_url, "filename": filename}


# ===================== ORGANIZATION ROUTES =====================

@api_router.post("/organizations")
async def create_organization(org: OrganizationCreate):
    existing = await db.organizations.find_one({"domain": org.domain})
    if existing:
        raise HTTPException(status_code=400, detail="Domain already registered")
    
    org_id = str(uuid.uuid4())
    org_doc = {
        "id": org_id,
        "name": org.name,
        "domain": org.domain,
        "description": org.description,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.organizations.insert_one(org_doc)
    
    # Create default roles for the organization
    default_roles = [
        {"id": str(uuid.uuid4()), "name": "Administrator", "description": "Full access to all features", 
         "permissions": ["perm_apps_manage", "perm_users_manage", "perm_groups_manage", "perm_roles_manage", 
                        "perm_policies_manage", "perm_audit_read", "perm_requests_manage", "perm_org_manage"],
         "org_id": org_id, "is_system": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "User Manager", "description": "Manage users and groups",
         "permissions": ["perm_users_manage", "perm_groups_manage", "perm_apps_read"],
         "org_id": org_id, "is_system": True, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Viewer", "description": "Read-only access",
         "permissions": ["perm_apps_read", "perm_users_read"],
         "org_id": org_id, "is_system": True, "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    for role in default_roles:
        await db.roles.insert_one(role)
    
    await seed_default_permissions()
    return {**org_doc, "_id": None}

@api_router.get("/organizations")
async def list_organizations():
    orgs = await db.organizations.find({}, {"_id": 0}).to_list(100)
    return orgs

@api_router.get("/organizations/{org_id}")
async def get_organization(org_id: str, user: dict = Depends(get_current_user)):
    if user['org_id'] != org_id and user['role'] != 'super_admin':
        raise HTTPException(status_code=403, detail="Access denied")
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

# ===================== ROLE ROUTES =====================

@api_router.get("/roles")
async def list_roles(user: dict = Depends(get_current_user)):
    roles = await db.roles.find({"org_id": user['org_id']}, {"_id": 0}).to_list(100)
    return roles

@api_router.post("/roles")
async def create_role(role: RoleCreate, request: Request, user: dict = Depends(get_current_user)):
    if role.org_id != user['org_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    role_id = str(uuid.uuid4())
    role_doc = {
        "id": role_id,
        "name": role.name,
        "description": role.description,
        "permissions": role.permissions,
        "org_id": role.org_id,
        "is_system": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.roles.insert_one(role_doc)
    await log_audit(user['org_id'], "role_created", "role", user['id'], user['email'], role_id,
                   {"name": role.name}, request.client.host if request.client else None)
    return {**role_doc, "_id": None}

@api_router.put("/roles/{role_id}")
async def update_role(role_id: str, update: dict, request: Request, user: dict = Depends(get_current_user)):
    role = await db.roles.find_one({"id": role_id, "org_id": user['org_id']}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get('is_system'):
        raise HTTPException(status_code=400, detail="Cannot modify system roles")
    
    update.pop('id', None)
    update.pop('org_id', None)
    update.pop('is_system', None)
    await db.roles.update_one({"id": role_id}, {"$set": update})
    await log_audit(user['org_id'], "role_updated", "role", user['id'], user['email'], role_id,
                   update, request.client.host if request.client else None)
    return await db.roles.find_one({"id": role_id}, {"_id": 0})

@api_router.delete("/roles/{role_id}")
async def delete_role(role_id: str, request: Request, user: dict = Depends(get_current_user)):
    role = await db.roles.find_one({"id": role_id, "org_id": user['org_id']}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get('is_system'):
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    
    await db.roles.delete_one({"id": role_id})
    await log_audit(user['org_id'], "role_deleted", "role", user['id'], user['email'], role_id,
                   {"name": role['name']}, request.client.host if request.client else None)
    return {"message": "Role deleted"}

@api_router.get("/permissions")
async def list_permissions(user: dict = Depends(get_current_user)):
    permissions = await db.permissions.find({}, {"_id": 0}).to_list(100)
    return permissions

# ===================== GROUP ROUTES =====================

@api_router.get("/groups")
async def list_groups(user: dict = Depends(get_current_user)):
    groups = await db.groups.find({"org_id": user['org_id']}, {"_id": 0}).to_list(100)
    # Add member count
    for group in groups:
        group['member_count'] = await db.users.count_documents({"group_ids": group['id']})
    return groups

@api_router.post("/groups")
async def create_group(group: GroupCreate, request: Request, user: dict = Depends(get_current_user)):
    if group.org_id != user['org_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    group_id = str(uuid.uuid4())
    group_doc = {
        "id": group_id,
        "name": group.name,
        "description": group.description,
        "org_id": group.org_id,
        "parent_id": group.parent_id,
        "role_ids": group.role_ids,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.groups.insert_one(group_doc)
    await log_audit(user['org_id'], "group_created", "group", user['id'], user['email'], group_id,
                   {"name": group.name}, request.client.host if request.client else None)
    return {**group_doc, "_id": None, "member_count": 0}

@api_router.put("/groups/{group_id}")
async def update_group(group_id: str, update: dict, request: Request, user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id, "org_id": user['org_id']}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    update.pop('id', None)
    update.pop('org_id', None)
    await db.groups.update_one({"id": group_id}, {"$set": update})
    await log_audit(user['org_id'], "group_updated", "group", user['id'], user['email'], group_id,
                   update, request.client.host if request.client else None)
    return await db.groups.find_one({"id": group_id}, {"_id": 0})

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, request: Request, user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id, "org_id": user['org_id']}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Remove group from users
    await db.users.update_many({"group_ids": group_id}, {"$pull": {"group_ids": group_id}})
    await db.groups.delete_one({"id": group_id})
    await log_audit(user['org_id'], "group_deleted", "group", user['id'], user['email'], group_id,
                   {"name": group['name']}, request.client.host if request.client else None)
    return {"message": "Group deleted"}

@api_router.post("/groups/{group_id}/members")
async def add_group_members(group_id: str, user_ids: List[str], request: Request, user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id, "org_id": user['org_id']}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.users.update_many(
        {"id": {"$in": user_ids}, "org_id": user['org_id']},
        {"$addToSet": {"group_ids": group_id}}
    )
    await log_audit(user['org_id'], "group_members_added", "group", user['id'], user['email'], group_id,
                   {"user_ids": user_ids}, request.client.host if request.client else None)
    return {"message": f"Added {len(user_ids)} members to group"}

@api_router.delete("/groups/{group_id}/members")
async def remove_group_members(group_id: str, user_ids: List[str], request: Request, user: dict = Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id, "org_id": user['org_id']}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.users.update_many(
        {"id": {"$in": user_ids}},
        {"$pull": {"group_ids": group_id}}
    )
    return {"message": f"Removed {len(user_ids)} members from group"}

# ===================== USER ROUTES =====================

@api_router.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({"org_id": user['org_id']}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.post("/users")
async def create_user(new_user: UserCreate, request: Request, user: dict = Depends(get_current_user)):
    if new_user.org_id != user['org_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    existing = await db.users.find_one({"email": new_user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": new_user.email,
        "password": hash_password(new_user.password),
        "name": new_user.name,
        "org_id": new_user.org_id,
        "role": "user",
        "group_ids": [],
        "role_ids": [],
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    await log_audit(user['org_id'], "user_created", "user", user['id'], user['email'], user_id,
                   {"name": new_user.name, "email": new_user.email}, request.client.host if request.client else None)
    
    return {k: v for k, v in user_doc.items() if k != 'password' and k != '_id'}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update: UserUpdate, request: Request, user: dict = Depends(get_current_user)):
    target_user = await db.users.find_one({"id": user_id, "org_id": user['org_id']}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
        await log_audit(user['org_id'], "user_updated", "user", user['id'], user['email'], user_id,
                       update_data, request.client.host if request.client else None)
    
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request, user: dict = Depends(get_current_user)):
    if user_id == user['id']:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    target_user = await db.users.find_one({"id": user_id, "org_id": user['org_id']}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.delete_one({"id": user_id})
    await log_audit(user['org_id'], "user_deleted", "user", user['id'], user['email'], user_id,
                   {"email": target_user['email']}, request.client.host if request.client else None)
    return {"message": "User deleted"}

# ===================== SAML APP ROUTES =====================

@api_router.get("/apps/saml")
async def list_saml_apps(user: dict = Depends(get_current_user)):
    apps = await db.saml_apps.find({"org_id": user['org_id']}, {"_id": 0, "private_key": 0}).to_list(100)
    return apps

@api_router.post("/apps/saml")
async def create_saml_app(app: SAMLAppCreate, request: Request, user: dict = Depends(get_current_user)):
    if app.org_id != user['org_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    cert, key = generate_self_signed_cert()
    app_id = str(uuid.uuid4())
    
    app_doc = {
        "id": app_id,
        "name": app.name,
        "description": app.description,
        "org_id": app.org_id,
        "entity_id": app.entity_id,
        "acs_url": app.acs_url,
        "slo_url": app.slo_url,
        "home_url": app.home_url,
        "name_id_format": app.name_id_format,
        "sign_assertions": app.sign_assertions,
        "sign_response": app.sign_response,
        "attribute_mappings": app.attribute_mappings,
        "certificate": cert,
        "private_key": key,
        "logo_url": app.logo_url,
        "allowed_group_ids": app.allowed_group_ids,
        "allowed_role_ids": app.allowed_role_ids,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.saml_apps.insert_one(app_doc)
    await log_audit(user['org_id'], "saml_app_created", "app", user['id'], user['email'], app_id,
                   {"name": app.name}, request.client.host if request.client else None)
    
    return {k: v for k, v in app_doc.items() if k != 'private_key' and k != '_id'}

@api_router.get("/apps/saml/{app_id}")
async def get_saml_app(app_id: str, user: dict = Depends(get_current_user)):
    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0, "private_key": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app

@api_router.put("/apps/saml/{app_id}")
async def update_saml_app(app_id: str, update: dict, request: Request, user: dict = Depends(get_current_user)):
    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    update.pop('id', None)
    update.pop('org_id', None)
    update.pop('certificate', None)
    update.pop('private_key', None)
    
    await db.saml_apps.update_one({"id": app_id}, {"$set": update})
    await log_audit(user['org_id'], "saml_app_updated", "app", user['id'], user['email'], app_id,
                   update, request.client.host if request.client else None)
    return await db.saml_apps.find_one({"id": app_id}, {"_id": 0, "private_key": 0})

@api_router.delete("/apps/saml/{app_id}")
async def delete_saml_app(app_id: str, request: Request, user: dict = Depends(get_current_user)):
    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    await db.saml_apps.delete_one({"id": app_id})
    await log_audit(user['org_id'], "saml_app_deleted", "app", user['id'], user['email'], app_id,
                   {"name": app['name']}, request.client.host if request.client else None)
    return {"message": "App deleted"}


@api_router.get("/apps/saml/{app_id}/users")
async def get_saml_app_users(app_id: str, user: dict = Depends(get_current_user)):
    """Get users assigned to a SAML app"""
    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    approved_ids = app.get('approved_user_ids', [])
    users = []
    for uid in approved_ids:
        u = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
        if u:
            users.append({"id": u['id'], "email": u.get('email'), "name": u.get('name'), "role": u.get('role')})
    return users

@api_router.post("/apps/saml/{app_id}/users")
async def assign_users_to_saml_app(app_id: str, body: dict, request: Request, user: dict = Depends(get_current_user)):
    """Assign users to a SAML app"""
    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    user_ids = body.get('user_ids', [])
    await db.saml_apps.update_one({"id": app_id}, {"$addToSet": {"approved_user_ids": {"$each": user_ids}}})
    return {"message": f"Added {len(user_ids)} user(s)", "user_ids": user_ids}

@api_router.delete("/apps/saml/{app_id}/users/{user_id}")
async def remove_user_from_saml_app(app_id: str, user_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Remove a user from a SAML app"""
    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    await db.saml_apps.update_one({"id": app_id}, {"$pull": {"approved_user_ids": user_id}})
    return {"message": "User removed"}


@api_router.get("/apps/saml/{app_id}/metadata")
async def get_saml_metadata(app_id: str, request: Request):
    app = await db.saml_apps.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    base_url = get_public_base_url(request)
    metadata = generate_saml_metadata(app, base_url)
    return Response(content=metadata, media_type="application/xml")

@api_router.get("/apps/saml/{app_id}/kissflow-config")
async def get_kissflow_config(app_id: str, request: Request):
    """Get configuration values for Kissflow SSO setup (IdP URL, Security Key, etc.)"""
    import hashlib
    import base64
    
    app = await db.saml_apps.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    base_url = get_public_base_url(request)
    
    # Extract certificate and calculate SHA256 fingerprint
    cert_pem = app.get('certificate', '')
    fingerprint = ''
    
    if cert_pem:
        cert_b64 = cert_pem.replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '').replace('\n', '').strip()
        try:
            cert_der = base64.b64decode(cert_b64)
            fingerprint = hashlib.sha256(cert_der).hexdigest()
        except:
            fingerprint = 'Error calculating fingerprint'
    
    return {
        "app_name": app.get('name'),
        "entity_id": app.get('entity_id'),
        "idp_url": f"{base_url}/api/saml/{app_id}/sso",
        "sso_url": f"{base_url}/api/saml/{app_id}/sso",
        "slo_url": f"{base_url}/api/saml/{app_id}/slo",
        "security_key": fingerprint,
        "security_key_formatted": ':'.join(fingerprint[i:i+2] for i in range(0, len(fingerprint), 2)).upper() if fingerprint else '',
        "metadata_url": f"{base_url}/api/saml/{app_id}/metadata",
        "certificate": cert_pem,
        "name_id_format": app.get('name_id_format', 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
        "instructions": {
            "step1": "In Kissflow Admin > SSO Settings, select Manual configuration",
            "step2": f"Set IdP URL to: {base_url}/api/saml/{app_id}/sso",
            "step3": f"Set Sign-out URL to: {base_url}/api/saml/{app_id}/slo (optional)",
            "step4": f"Set Security Key to: {fingerprint}",
            "step5": "Save and test the SSO connection"
        }
    }

@api_router.get("/saml/{app_id}/sso")
@api_router.post("/saml/{app_id}/sso")
async def saml_sso(app_id: str, request: Request):
    """SAML Single Sign-On endpoint - handles both IdP-initiated and SP-initiated SSO"""
    app = await db.saml_apps.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="SAML App not found")
    
    base_url = get_public_base_url(request)
    frontend_url = base_url
    
    # Capture RelayState if present (SP-initiated flow)
    params = dict(request.query_params)
    relay_state = params.get('RelayState', '')
    
    # Build login URL with SSO app and optional relay state
    login_url = f"{frontend_url}/login?sso_app={app_id}"
    if relay_state:
        from urllib.parse import quote
        login_url += f"&relay_state={quote(relay_state)}"

    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SSO Login - {app.get('name', 'SAML App')}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'IBM Plex Sans', -apple-system, sans-serif; background: #FAFAFA; min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
        .card {{ background: white; border: 1px solid #e5e5e5; padding: 48px; max-width: 480px; width: 90%; }}
        h1 {{ font-size: 24px; font-weight: 800; margin-bottom: 8px; }}
        p {{ color: #71717a; margin-bottom: 24px; }}
        .app-info {{ background: #f4f4f5; padding: 16px; margin-bottom: 24px; }}
        .app-name {{ font-weight: 600; font-size: 18px; }}
        .app-url {{ font-size: 12px; color: #71717a; font-family: monospace; word-break: break-all; }}
        .btn {{ display: block; width: 100%; padding: 16px; background: #0051FF; color: white; text-align: center; text-decoration: none; font-weight: 600; margin-bottom: 12px; }}
        .btn:hover {{ background: #003ECC; }}
        .btn-secondary {{ background: #f4f4f5; color: #18181b; }}
        .btn-secondary:hover {{ background: #e5e5e5; }}
        .info {{ font-size: 12px; color: #a1a1aa; margin-top: 24px; text-align: center; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Single Sign-On</h1>
        <p>You are about to sign in to:</p>
        
        <div class="app-info">
            <div class="app-name">{app.get('name', 'Application')}</div>
            <div class="app-url">{app.get('entity_id', '')}</div>
        </div>
        
        <a href="{login_url}" class="btn">Sign In with Kissflow IAM</a>
        <a href="{app.get('acs_url', '#')}" class="btn btn-secondary">Cancel</a>
        
        <p class="info">
            This is the SAML Identity Provider endpoint.<br>
            Entity ID: {app.get('entity_id')}<br>
            ACS URL: {app.get('acs_url')}
        </p>
    </div>
</body>
</html>'''
    
    return Response(content=html_content, media_type="text/html")

@api_router.get("/saml/{app_id}/slo")
@api_router.post("/saml/{app_id}/slo")
async def saml_slo(app_id: str, request: Request):
    """SAML Single Logout endpoint"""
    app = await db.saml_apps.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="SAML App not found")
    
    # For SLO, redirect back to the app's SLO URL or a logout confirmation page
    slo_url = app.get('slo_url')
    if slo_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=slo_url)
    
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logged Out - {app.get('name', 'SAML App')}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'IBM Plex Sans', -apple-system, sans-serif; background: #FAFAFA; min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
        .card {{ background: white; border: 1px solid #e5e5e5; padding: 48px; max-width: 400px; text-align: center; }}
        h1 {{ font-size: 24px; font-weight: 800; margin-bottom: 16px; color: #00CC66; }}
        p {{ color: #71717a; }}
    </style>
</head>
<body>
    <div class="card">
        <h1>Successfully Logged Out</h1>
        <p>You have been logged out of {app.get('name', 'the application')}.</p>
    </div>
</body>
</html>'''
    
    return Response(content=html_content, media_type="text/html")

@api_router.get("/saml/{app_id}/complete")
async def saml_complete_sso(app_id: str, request: Request, token: str = None, relay_state: str = None):
    """Complete SAML SSO - Generate signed SAML Response and POST to ACS URL"""
    import base64
    import uuid as uuid_module
    from xml.sax.saxutils import escape
    from lxml import etree
    
    app = await db.saml_apps.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="SAML App not found")
    
    base_url = get_public_base_url(request)
    
    # Get token from query param or Authorization header
    auth_token = token
    if not auth_token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            auth_token = auth_header[7:]
    
    if not auth_token:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"{base_url}/login?sso_app={app_id}")
    
    # Decode token and get user
    try:
        payload = decode_token(auth_token)
    except:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"{base_url}/login?sso_app={app_id}")
    
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Check user has access to this app
    has_access = await check_user_app_access(user, app)
    if not has_access:
        raise HTTPException(status_code=403, detail="You don't have access to this application")
    
    # Generate SAML Response timestamps
    now = datetime.now(timezone.utc)
    not_on_or_after = now + timedelta(minutes=5)
    response_id = f"_{''.join(str(uuid_module.uuid4()).split('-'))}"
    assertion_id = f"_{''.join(str(uuid_module.uuid4()).split('-'))}"
    
    issuer = f"{base_url}/api/saml/{app_id}"
    acs_url = app.get('acs_url', '')
    name_id = user.get('email', '')
    name_id_format = app.get('name_id_format', 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress')
    
    now_str = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    not_on_or_after_str = not_on_or_after.strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # Define SAML namespaces
    NSMAP = {
        'samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
        'saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
        'xs': 'http://www.w3.org/2001/XMLSchema',
        'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    }
    
    XS_NS = 'http://www.w3.org/2001/XMLSchema'
    XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
    
    # Build SAML Response XML using lxml
    response_elem = etree.Element('{urn:oasis:names:tc:SAML:2.0:protocol}Response', nsmap=NSMAP)
    response_elem.set('ID', response_id)
    response_elem.set('Version', '2.0')
    response_elem.set('IssueInstant', now_str)
    response_elem.set('Destination', acs_url)
    
    # Issuer
    issuer_elem = etree.SubElement(response_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Issuer')
    issuer_elem.text = issuer
    
    # Status
    status_elem = etree.SubElement(response_elem, '{urn:oasis:names:tc:SAML:2.0:protocol}Status')
    status_code_elem = etree.SubElement(status_elem, '{urn:oasis:names:tc:SAML:2.0:protocol}StatusCode')
    status_code_elem.set('Value', 'urn:oasis:names:tc:SAML:2.0:status:Success')
    
    # Assertion
    assertion_elem = etree.SubElement(response_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Assertion')
    assertion_elem.set('ID', assertion_id)
    assertion_elem.set('Version', '2.0')
    assertion_elem.set('IssueInstant', now_str)
    assertion_elem.set('{http://www.w3.org/2001/XMLSchema-instance}schemaLocation', 
                       'urn:oasis:names:tc:SAML:2.0:assertion http://docs.oasis-open.org/security/saml/v2.0/saml-schema-assertion-2.0.xsd')
    
    # Assertion > Issuer
    assertion_issuer = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Issuer')
    assertion_issuer.text = issuer
    
    # Assertion > Subject
    subject_elem = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Subject')
    name_id_elem = etree.SubElement(subject_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}NameID')
    name_id_elem.set('Format', name_id_format)
    name_id_elem.text = name_id
    
    subj_conf = etree.SubElement(subject_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}SubjectConfirmation')
    subj_conf.set('Method', 'urn:oasis:names:tc:SAML:2.0:cm:bearer')
    subj_conf_data = etree.SubElement(subj_conf, '{urn:oasis:names:tc:SAML:2.0:assertion}SubjectConfirmationData')
    subj_conf_data.set('NotOnOrAfter', not_on_or_after_str)
    subj_conf_data.set('Recipient', acs_url)
    
    # Assertion > Conditions
    conditions_elem = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Conditions')
    conditions_elem.set('NotBefore', now_str)
    conditions_elem.set('NotOnOrAfter', not_on_or_after_str)
    audience_restriction = etree.SubElement(conditions_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}AudienceRestriction')
    audience_elem = etree.SubElement(audience_restriction, '{urn:oasis:names:tc:SAML:2.0:assertion}Audience')
    audience_elem.text = app.get('entity_id', '')
    
    # Assertion > AuthnStatement
    authn_stmt = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}AuthnStatement')
    authn_stmt.set('AuthnInstant', now_str)
    authn_ctx = etree.SubElement(authn_stmt, '{urn:oasis:names:tc:SAML:2.0:assertion}AuthnContext')
    authn_ctx_ref = etree.SubElement(authn_ctx, '{urn:oasis:names:tc:SAML:2.0:assertion}AuthnContextClassRef')
    authn_ctx_ref.text = 'urn:oasis:names:tc:SAML:2.0:ac:classes:Password'
    
    # Assertion > AttributeStatement
    attr_stmt = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}AttributeStatement')
    
    email_attr = etree.SubElement(attr_stmt, '{urn:oasis:names:tc:SAML:2.0:assertion}Attribute')
    email_attr.set('Name', 'email')
    email_attr.set('NameFormat', 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic')
    email_val = etree.SubElement(email_attr, '{urn:oasis:names:tc:SAML:2.0:assertion}AttributeValue')
    email_val.set(f'{{{XSI_NS}}}type', 'xs:string')
    email_val.text = user.get('email', '')
    
    name_attr = etree.SubElement(attr_stmt, '{urn:oasis:names:tc:SAML:2.0:assertion}Attribute')
    name_attr.set('Name', 'name')
    name_attr.set('NameFormat', 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic')
    name_val = etree.SubElement(name_attr, '{urn:oasis:names:tc:SAML:2.0:assertion}AttributeValue')
    name_val.set(f'{{{XSI_NS}}}type', 'xs:string')
    name_val.text = user.get('name', '')
    
    # Sign the SAML Response
    cert_pem = app.get('certificate', '')
    key_pem = app.get('private_key', '')
    
    signed_response_xml = None
    
    if key_pem and cert_pem:
        try:
            import signxml
            from signxml import XMLSigner
            
            # Sign the assertion using signxml (enveloped signature)
            signer = XMLSigner(
                method=signxml.methods.enveloped,
                signature_algorithm="rsa-sha256",
                digest_algorithm="sha256",
                c14n_algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"
            )
            
            # Sign the assertion element
            signed_assertion = signer.sign(
                assertion_elem, 
                key=key_pem, 
                cert=cert_pem, 
                reference_uri=f'#{assertion_id}'
            )
            
            # Replace the unsigned assertion with the signed one in the response
            # Find and remove old assertion, add signed one
            for child in list(response_elem):
                if child.tag == '{urn:oasis:names:tc:SAML:2.0:assertion}Assertion':
                    response_elem.remove(child)
            response_elem.append(signed_assertion)
            
            # Move Signature to correct position per SAML schema: right after Issuer (index 1)
            # signxml appends Signature at the end; SAML requires Issuer, Signature, Subject, ...
            ds_ns = 'http://www.w3.org/2000/09/xmldsig#'
            sig_elem = signed_assertion.find(f'{{{ds_ns}}}Signature')
            if sig_elem is not None:
                signed_assertion.remove(sig_elem)
                # Insert after Issuer (position 1)
                signed_assertion.insert(1, sig_elem)
            
            # Clean base64 text content in signature elements (remove PEM newlines)
            # Kissflow's strict parser rejects newlines inside X509Certificate, SignatureValue, DigestValue
            for tag in ['X509Certificate', 'SignatureValue', 'DigestValue']:
                for elem in response_elem.iter(f'{{{ds_ns}}}{tag}'):
                    if elem.text:
                        elem.text = elem.text.replace('\n', '').replace('\r', '').replace(' ', '')
            
            signed_response_xml = etree.tostring(response_elem, xml_declaration=False, encoding='unicode', pretty_print=False)
            logging.info(f"SAML Response signed successfully for app {app_id}, user {name_id}")
        except Exception as e:
            logging.error(f"SAML signing failed: {e}")
            signed_response_xml = None
    
    if not signed_response_xml:
        signed_response_xml = etree.tostring(response_elem, xml_declaration=False, encoding='unicode', pretty_print=False)
        logging.warning(f"Sending UNSIGNED SAML response for app {app_id}")

    # Base64 encode the SAML Response - ensure clean encoding
    xml_clean = signed_response_xml.strip()
    saml_response_b64 = base64.b64encode(xml_clean.encode('utf-8')).decode('ascii')
    
    # Log the SSO attempt
    await log_audit(user['org_id'], "saml_sso_initiated", "app", user['id'], user['email'], app_id,
                   {"app_name": app.get('name'), "acs_url": acs_url}, 
                   request.client.host if request.client else None)
    
    # Return an HTML form that auto-submits to the ACS URL
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Redirecting to {escape(app.get('name', 'Application'))}...</title>
</head>
<body onload="document.forms[0].submit();">
    <noscript>
        <p>JavaScript is required. Please click the button below to continue.</p>
    </noscript>
    <form method="POST" action="{escape(acs_url)}">
        <input type="hidden" name="SAMLResponse" value="{saml_response_b64}"/>
        {'<input type="hidden" name="RelayState" value="' + escape(relay_state) + '"/>' if relay_state else ''}
        <noscript>
            <input type="submit" value="Continue to {escape(app.get('name', 'Application'))}"/>
        </noscript>
    </form>
    <p style="font-family: sans-serif; color: #666; text-align: center; margin-top: 50px;">
        Redirecting to {escape(app.get('name', 'Application'))}...
    </p>
</body>
</html>'''
    
    return Response(content=html_content, media_type="text/html")


@api_router.get("/saml/{app_id}/test")
async def saml_test_sso(app_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Test SAML SSO - Returns decoded SAML assertion details as JSON for inspection"""
    import base64
    import uuid as uuid_module
    from lxml import etree

    app = await db.saml_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="SAML App not found")

    base_url = get_public_base_url(request)

    now = datetime.now(timezone.utc)
    not_on_or_after = now + timedelta(minutes=5)
    response_id = f"_{''.join(str(uuid_module.uuid4()).split('-'))}"
    assertion_id = f"_{''.join(str(uuid_module.uuid4()).split('-'))}"

    issuer = f"{base_url}/api/saml/{app_id}"
    acs_url = app.get('acs_url', '')
    name_id = user.get('email', '')
    name_id_format = app.get('name_id_format', 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress')
    now_str = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    not_on_or_after_str = not_on_or_after.strftime('%Y-%m-%dT%H:%M:%SZ')

    NSMAP = {
        'samlp': 'urn:oasis:names:tc:SAML:2.0:protocol',
        'saml': 'urn:oasis:names:tc:SAML:2.0:assertion',
    }

    response_elem = etree.Element('{urn:oasis:names:tc:SAML:2.0:protocol}Response', nsmap=NSMAP)
    response_elem.set('ID', response_id)
    response_elem.set('Version', '2.0')
    response_elem.set('IssueInstant', now_str)
    response_elem.set('Destination', acs_url)

    issuer_elem = etree.SubElement(response_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Issuer')
    issuer_elem.text = issuer

    status_elem = etree.SubElement(response_elem, '{urn:oasis:names:tc:SAML:2.0:protocol}Status')
    status_code_elem = etree.SubElement(status_elem, '{urn:oasis:names:tc:SAML:2.0:protocol}StatusCode')
    status_code_elem.set('Value', 'urn:oasis:names:tc:SAML:2.0:status:Success')

    assertion_elem = etree.SubElement(response_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Assertion')
    assertion_elem.set('ID', assertion_id)
    assertion_elem.set('Version', '2.0')
    assertion_elem.set('IssueInstant', now_str)

    assertion_issuer = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Issuer')
    assertion_issuer.text = issuer

    subject_elem = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Subject')
    name_id_elem = etree.SubElement(subject_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}NameID')
    name_id_elem.set('Format', name_id_format)
    name_id_elem.text = name_id

    subj_conf = etree.SubElement(subject_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}SubjectConfirmation')
    subj_conf.set('Method', 'urn:oasis:names:tc:SAML:2.0:cm:bearer')
    subj_conf_data = etree.SubElement(subj_conf, '{urn:oasis:names:tc:SAML:2.0:assertion}SubjectConfirmationData')
    subj_conf_data.set('NotOnOrAfter', not_on_or_after_str)
    subj_conf_data.set('Recipient', acs_url)

    conditions_elem = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}Conditions')
    conditions_elem.set('NotBefore', now_str)
    conditions_elem.set('NotOnOrAfter', not_on_or_after_str)
    audience_restriction = etree.SubElement(conditions_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}AudienceRestriction')
    audience_elem = etree.SubElement(audience_restriction, '{urn:oasis:names:tc:SAML:2.0:assertion}Audience')
    audience_elem.text = app.get('entity_id', '')

    authn_stmt = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}AuthnStatement')
    authn_stmt.set('AuthnInstant', now_str)
    authn_ctx = etree.SubElement(authn_stmt, '{urn:oasis:names:tc:SAML:2.0:assertion}AuthnContext')
    authn_ctx_ref = etree.SubElement(authn_ctx, '{urn:oasis:names:tc:SAML:2.0:assertion}AuthnContextClassRef')
    authn_ctx_ref.text = 'urn:oasis:names:tc:SAML:2.0:ac:classes:Password'

    attr_stmt = etree.SubElement(assertion_elem, '{urn:oasis:names:tc:SAML:2.0:assertion}AttributeStatement')
    email_attr = etree.SubElement(attr_stmt, '{urn:oasis:names:tc:SAML:2.0:assertion}Attribute')
    email_attr.set('Name', 'email')
    email_val = etree.SubElement(email_attr, '{urn:oasis:names:tc:SAML:2.0:assertion}AttributeValue')
    email_val.text = user.get('email', '')
    name_attr = etree.SubElement(attr_stmt, '{urn:oasis:names:tc:SAML:2.0:assertion}Attribute')
    name_attr.set('Name', 'name')
    name_val = etree.SubElement(name_attr, '{urn:oasis:names:tc:SAML:2.0:assertion}AttributeValue')
    name_val.text = user.get('name', '')

    # Sign the assertion
    cert_pem = app.get('certificate', '')
    key_pem = app.get('private_key', '')
    signed = False

    if key_pem and cert_pem:
        try:
            import signxml
            from signxml import XMLSigner
            signer = XMLSigner(
                method=signxml.methods.enveloped,
                signature_algorithm="rsa-sha256",
                digest_algorithm="sha256",
                c14n_algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"
            )
            signed_assertion = signer.sign(assertion_elem, key=key_pem, cert=cert_pem, reference_uri=f'#{assertion_id}')
            for child in list(response_elem):
                if child.tag == '{urn:oasis:names:tc:SAML:2.0:assertion}Assertion':
                    response_elem.remove(child)
            response_elem.append(signed_assertion)
            signed = True
        except Exception as e:
            logging.error(f"SAML test signing failed: {e}")

    # Clean base64 text content in signature elements (remove PEM newlines)
    ds_ns = 'http://www.w3.org/2000/09/xmldsig#'
    for tag in ['X509Certificate', 'SignatureValue', 'DigestValue']:
        for elem in response_elem.iter(f'{{{ds_ns}}}{tag}'):
            if elem.text:
                elem.text = elem.text.replace('\n', '').replace('\r', '').replace(' ', '')

    xml_str = etree.tostring(response_elem, xml_declaration=False, encoding='unicode', pretty_print=False).strip()
    pretty_xml = etree.tostring(response_elem, pretty_print=True, xml_declaration=False, encoding='unicode')
    saml_b64 = base64.b64encode(xml_str.encode('utf-8')).decode('ascii')

    return {
        "status": "success",
        "signed": signed,
        "response_id": response_id,
        "assertion_id": assertion_id,
        "issuer": issuer,
        "destination": acs_url,
        "audience": app.get('entity_id', ''),
        "name_id": name_id,
        "name_id_format": name_id_format,
        "issue_instant": now_str,
        "not_on_or_after": not_on_or_after_str,
        "attributes": {"email": user.get('email', ''), "name": user.get('name', '')},
        "saml_response_b64": saml_b64,
        "saml_response_xml": pretty_xml,
        "acs_url": acs_url,
    }

# ===================== OIDC APP ROUTES =====================

@api_router.get("/apps/oidc")
async def list_oidc_apps(user: dict = Depends(get_current_user)):
    apps = await db.oidc_apps.find({"org_id": user['org_id']}, {"_id": 0, "client_secret": 0}).to_list(100)
    return apps

@api_router.post("/apps/oidc")
async def create_oidc_app(app: OIDCAppCreate, request: Request, user: dict = Depends(get_current_user)):
    if app.org_id != user['org_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    app_id = str(uuid.uuid4())
    client_id = f"oidc_{str(uuid.uuid4()).replace('-', '')[:16]}"
    client_secret = str(uuid.uuid4()).replace('-', '') + str(uuid.uuid4()).replace('-', '')
    base_url = get_public_base_url(request)
    
    app_doc = {
        "id": app_id,
        "name": app.name,
        "description": app.description,
        "org_id": app.org_id,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": app.redirect_uris,
        "logout_uris": app.logout_uris,
        "scopes": app.scopes,
        "grant_types": app.grant_types,
        "authorization_endpoint": f"{base_url}/api/oidc/{app_id}/authorize",
        "token_endpoint": f"{base_url}/api/oidc/{app_id}/token",
        "userinfo_endpoint": f"{base_url}/api/oidc/{app_id}/userinfo",
        "logo_url": app.logo_url,
        "allowed_group_ids": app.allowed_group_ids,
        "allowed_role_ids": app.allowed_role_ids,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.oidc_apps.insert_one(app_doc)
    await log_audit(user['org_id'], "oidc_app_created", "app", user['id'], user['email'], app_id,
                   {"name": app.name}, request.client.host if request.client else None)
    
    return {k: v for k, v in app_doc.items() if k != '_id'}

@api_router.get("/apps/oidc/{app_id}")
async def get_oidc_app(app_id: str, include_secret: bool = False, user: dict = Depends(get_current_user)):
    projection = {"_id": 0} if include_secret else {"_id": 0, "client_secret": 0}
    app = await db.oidc_apps.find_one({"id": app_id, "org_id": user['org_id']}, projection)
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    return app

@api_router.put("/apps/oidc/{app_id}")
async def update_oidc_app(app_id: str, update: dict, request: Request, user: dict = Depends(get_current_user)):
    app = await db.oidc_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    update.pop('id', None)
    update.pop('org_id', None)
    update.pop('client_id', None)
    update.pop('client_secret', None)
    
    await db.oidc_apps.update_one({"id": app_id}, {"$set": update})
    await log_audit(user['org_id'], "oidc_app_updated", "app", user['id'], user['email'], app_id,
                   update, request.client.host if request.client else None)
    return await db.oidc_apps.find_one({"id": app_id}, {"_id": 0, "client_secret": 0})

@api_router.delete("/apps/oidc/{app_id}")
async def delete_oidc_app(app_id: str, request: Request, user: dict = Depends(get_current_user)):
    app = await db.oidc_apps.find_one({"id": app_id, "org_id": user['org_id']}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    await db.oidc_apps.delete_one({"id": app_id})
    await log_audit(user['org_id'], "oidc_app_deleted", "app", user['id'], user['email'], app_id,
                   {"name": app['name']}, request.client.host if request.client else None)
    return {"message": "App deleted"}

@api_router.get("/apps/oidc/{app_id}/.well-known/openid-configuration")
async def get_oidc_discovery(app_id: str, request: Request):
    app = await db.oidc_apps.find_one({"id": app_id}, {"_id": 0})
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    base_url = get_public_base_url(request)
    return {
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/api/oidc/{app_id}/authorize",
        "token_endpoint": f"{base_url}/api/oidc/{app_id}/token",
        "userinfo_endpoint": f"{base_url}/api/oidc/{app_id}/userinfo",
        "jwks_uri": f"{base_url}/api/oidc/{app_id}/jwks",
        "scopes_supported": app.get('scopes', ["openid", "profile", "email"]),
        "response_types_supported": ["code", "token", "id_token"],
        "grant_types_supported": app.get('grant_types', ["authorization_code"]),
    }

# ===================== ACCESS POLICY ROUTES =====================

@api_router.get("/policies")
async def list_policies(user: dict = Depends(get_current_user)):
    policies = await db.access_policies.find({"org_id": user['org_id']}, {"_id": 0}).to_list(100)
    return policies

@api_router.post("/policies")
async def create_policy(policy: AccessPolicyCreate, request: Request, user: dict = Depends(get_current_user)):
    if policy.org_id != user['org_id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    policy_id = str(uuid.uuid4())
    policy_doc = {
        "id": policy_id,
        "name": policy.name,
        "description": policy.description,
        "org_id": policy.org_id,
        "app_ids": policy.app_ids,
        "conditions": policy.conditions,
        "enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.access_policies.insert_one(policy_doc)
    await log_audit(user['org_id'], "policy_created", "policy", user['id'], user['email'], policy_id,
                   {"name": policy.name}, request.client.host if request.client else None)
    return {**policy_doc, "_id": None}

@api_router.put("/policies/{policy_id}")
async def update_policy(policy_id: str, update: dict, request: Request, user: dict = Depends(get_current_user)):
    policy = await db.access_policies.find_one({"id": policy_id, "org_id": user['org_id']}, {"_id": 0})
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    update.pop('id', None)
    update.pop('org_id', None)
    await db.access_policies.update_one({"id": policy_id}, {"$set": update})
    await log_audit(user['org_id'], "policy_updated", "policy", user['id'], user['email'], policy_id,
                   update, request.client.host if request.client else None)
    return await db.access_policies.find_one({"id": policy_id}, {"_id": 0})

@api_router.delete("/policies/{policy_id}")
async def delete_policy(policy_id: str, request: Request, user: dict = Depends(get_current_user)):
    policy = await db.access_policies.find_one({"id": policy_id, "org_id": user['org_id']}, {"_id": 0})
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    await db.access_policies.delete_one({"id": policy_id})
    await log_audit(user['org_id'], "policy_deleted", "policy", user['id'], user['email'], policy_id,
                   {"name": policy['name']}, request.client.host if request.client else None)
    return {"message": "Policy deleted"}

# ===================== ACCESS REQUEST ROUTES =====================

@api_router.get("/access-requests")
async def list_access_requests(status: str = None, user: dict = Depends(get_current_user)):
    query = {"org_id": user['org_id']}
    if status:
        query['status'] = status
    requests = await db.access_requests.find(query, {"_id": 0}).to_list(100)
    return requests

@api_router.post("/access-requests")
async def create_access_request(req: AccessRequestCreate, request: Request, user: dict = Depends(get_current_user)):
    # Find the app
    app = await db.saml_apps.find_one({"id": req.app_id, "org_id": user['org_id']}, {"_id": 0})
    app_type = "saml"
    if not app:
        app = await db.oidc_apps.find_one({"id": req.app_id, "org_id": user['org_id']}, {"_id": 0})
        app_type = "oidc"
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    
    # Check if already has access
    has_access = await check_user_app_access(user, app)
    if has_access:
        raise HTTPException(status_code=400, detail="You already have access to this app")
    
    # Check for pending request
    existing = await db.access_requests.find_one({
        "user_id": user['id'],
        "app_id": req.app_id,
        "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request for this app")
    
    request_id = str(uuid.uuid4())
    request_doc = {
        "id": request_id,
        "user_id": user['id'],
        "user_email": user['email'],
        "user_name": user['name'],
        "app_id": req.app_id,
        "app_name": app['name'],
        "app_type": app_type,
        "reason": req.reason,
        "status": "pending",
        "org_id": user['org_id'],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.access_requests.insert_one(request_doc)
    await log_audit(user['org_id'], "access_request_created", "request", user['id'], user['email'], request_id,
                   {"app_name": app['name']}, request.client.host if request.client else None)
    return {**request_doc, "_id": None}

@api_router.put("/access-requests/{request_id}")
async def review_access_request(request_id: str, action: str, request: Request, user: dict = Depends(get_current_user)):
    if action not in ['approve', 'reject']:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
    
    access_req = await db.access_requests.find_one({"id": request_id, "org_id": user['org_id']}, {"_id": 0})
    if not access_req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if access_req['status'] != 'pending':
        raise HTTPException(status_code=400, detail="Request already processed")
    
    new_status = "approved" if action == "approve" else "rejected"
    
    await db.access_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": new_status,
            "reviewed_by": user['id'],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If approved, add user to an appropriate group or grant direct access
    if action == "approve":
        target_user = await db.users.find_one({"id": access_req['user_id']}, {"_id": 0})
        if target_user:
            app_id = access_req['app_id']
            app_type = access_req.get('app_type', 'saml')
            
            # Add user to app's approved_user_ids list for direct access
            if app_type == 'saml':
                await db.saml_apps.update_one(
                    {"id": app_id},
                    {"$addToSet": {"approved_user_ids": access_req['user_id']}}
                )
            else:
                await db.oidc_apps.update_one(
                    {"id": app_id},
                    {"$addToSet": {"approved_user_ids": access_req['user_id']}}
                )
            
            # Also add to group if the app has allowed_group_ids
            app = await db.saml_apps.find_one({"id": app_id}, {"_id": 0})
            if not app:
                app = await db.oidc_apps.find_one({"id": app_id}, {"_id": 0})
            
            if app and app.get('allowed_group_ids') and len(app['allowed_group_ids']) > 0:
                await db.users.update_one(
                    {"id": access_req['user_id']},
                    {"$addToSet": {"group_ids": app['allowed_group_ids'][0]}}
                )
    
    await log_audit(user['org_id'], f"access_request_{new_status}", "request", user['id'], user['email'], request_id,
                   {"requester": access_req['user_email'], "app": access_req['app_name']}, 
                   request.client.host if request.client else None)
    
    return await db.access_requests.find_one({"id": request_id}, {"_id": 0})

# ===================== AUDIT LOG ROUTES =====================

@api_router.get("/audit-logs")
async def list_audit_logs(
    action: str = None,
    resource_type: str = None,
    user_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = Query(default=100, le=500),
    user: dict = Depends(get_current_user)
):
    query = {"org_id": user['org_id']}
    
    if action:
        query['action'] = action
    if resource_type:
        query['resource_type'] = resource_type
    if user_id:
        query['user_id'] = user_id
    if start_date:
        query['timestamp'] = {"$gte": start_date}
    if end_date:
        if 'timestamp' in query:
            query['timestamp']['$lte'] = end_date
        else:
            query['timestamp'] = {"$lte": end_date}
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs

@api_router.get("/audit-logs/summary")
async def get_audit_summary(user: dict = Depends(get_current_user)):
    org_id = user['org_id']
    
    # Get counts by action type
    pipeline = [
        {"$match": {"org_id": org_id}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    action_counts = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    # Get recent activity
    recent = await db.audit_logs.find({"org_id": org_id}, {"_id": 0}).sort("timestamp", -1).to_list(10)
    
    # Get unique users
    unique_users = await db.audit_logs.distinct("user_id", {"org_id": org_id})
    
    return {
        "action_counts": {item['_id']: item['count'] for item in action_counts},
        "recent_activity": recent,
        "unique_users": len(unique_users),
        "total_logs": await db.audit_logs.count_documents({"org_id": org_id})
    }

# ===================== APP LAUNCHER / CATALOG ROUTES =====================

@api_router.get("/launcher/apps")
async def get_user_apps(request: Request, user: dict = Depends(get_current_user)):
    """Get all apps the user has access to"""
    org_id = user['org_id']
    
    # Get all SAML apps
    saml_apps = await db.saml_apps.find({"org_id": org_id, "status": "active"}, {"_id": 0, "private_key": 0, "certificate": 0}).to_list(100)
    # Get all OIDC apps  
    oidc_apps = await db.oidc_apps.find({"org_id": org_id, "status": "active"}, {"_id": 0, "client_secret": 0}).to_list(100)
    
    accessible_apps = []
    
    for app in saml_apps:
        has_access = await check_user_app_access(user, app)
        if has_access:
            allowed, reason = await check_access_policies(user, app, request)
            accessible_apps.append({
                "id": app['id'],
                "name": app['name'],
                "description": app.get('description'),
                "logo_url": app.get('logo_url'),
                "home_url": app.get('home_url'),
                "type": "saml",
                "launch_url": f"/api/saml/{app['id']}/sso",
                "policy_blocked": not allowed,
                "policy_reason": reason
            })
    
    for app in oidc_apps:
        has_access = await check_user_app_access(user, app)
        if has_access:
            allowed, reason = await check_access_policies(user, app, request)
            accessible_apps.append({
                "id": app['id'],
                "name": app['name'],
                "description": app.get('description'),
                "logo_url": app.get('logo_url'),
                "type": "oidc",
                "launch_url": f"/api/oidc/{app['id']}/authorize",
                "policy_blocked": not allowed,
                "policy_reason": reason
            })
    
    return accessible_apps

@api_router.get("/catalog/apps")
async def get_app_catalog(user: dict = Depends(get_current_user)):
    """Get all apps in the catalog (for requesting access)"""
    org_id = user['org_id']
    
    saml_apps = await db.saml_apps.find({"org_id": org_id, "status": "active"}, 
                                         {"_id": 0, "id": 1, "name": 1, "description": 1, "logo_url": 1, 
                                          "allowed_group_ids": 1, "allowed_role_ids": 1, "approved_user_ids": 1}).to_list(100)
    oidc_apps = await db.oidc_apps.find({"org_id": org_id, "status": "active"},
                                         {"_id": 0, "id": 1, "name": 1, "description": 1, "logo_url": 1,
                                          "allowed_group_ids": 1, "allowed_role_ids": 1, "approved_user_ids": 1}).to_list(100)
    
    catalog = []
    
    for app in saml_apps:
        has_access = await check_user_app_access(user, app)
        # requires_approval is always true - explicit assignment needed
        catalog.append({
            "id": app['id'],
            "name": app['name'],
            "description": app.get('description'),
            "logo_url": app.get('logo_url'),
            "type": "saml",
            "has_access": has_access,
            "requires_approval": True
        })
    
    for app in oidc_apps:
        has_access = await check_user_app_access(user, app)
        catalog.append({
            "id": app['id'],
            "name": app['name'],
            "description": app.get('description'),
            "logo_url": app.get('logo_url'),
            "type": "oidc",
            "has_access": has_access,
            "requires_approval": True
        })
    
    return catalog

# ===================== DASHBOARD STATS =====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    org_id = user['org_id']
    
    return {
        "total_users": await db.users.count_documents({"org_id": org_id}),
        "active_users": await db.users.count_documents({"org_id": org_id, "status": "active"}),
        "total_groups": await db.groups.count_documents({"org_id": org_id}),
        "total_roles": await db.roles.count_documents({"org_id": org_id}),
        "saml_apps": await db.saml_apps.count_documents({"org_id": org_id}),
        "oidc_apps": await db.oidc_apps.count_documents({"org_id": org_id}),
        "access_policies": await db.access_policies.count_documents({"org_id": org_id}),
        "pending_requests": await db.access_requests.count_documents({"org_id": org_id, "status": "pending"}),
        "recent_logins": await db.audit_logs.count_documents({
            "org_id": org_id, 
            "action": "user_login",
            "timestamp": {"$gte": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()}
        })
    }

# ===================== BASE ROUTES =====================

@api_router.get("/")
async def root():
    return {"message": "Kissflow IAM - Identity & Access Management API"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
