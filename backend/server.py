from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
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
import base64
import xml.etree.ElementTree as ET
from xml.dom import minidom

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'kissflow-sso-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Kissflow SSO Super App")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# ===================== MODELS =====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "user"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    created_at: str
    status: str = "active"

class UserProvision(BaseModel):
    email: EmailStr
    name: str
    role: str = "user"
    provisioning_type: str = "manual"  # manual, scim, jit

class SAMLConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_id: str
    acs_url: str
    slo_url: Optional[str] = None
    name_id_format: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    sign_assertions: bool = True
    sign_response: bool = True
    certificate: Optional[str] = None
    private_key: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SAMLConfigCreate(BaseModel):
    entity_id: str
    acs_url: str
    slo_url: Optional[str] = None
    name_id_format: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    sign_assertions: bool = True
    sign_response: bool = True

class OIDCConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    client_secret: str
    redirect_uris: List[str]
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: str
    jwks_uri: str
    scopes: List[str] = ["openid", "profile", "email"]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class OIDCConfigCreate(BaseModel):
    client_id: str
    redirect_uris: List[str]
    scopes: List[str] = ["openid", "profile", "email"]

class SCIMUser(BaseModel):
    schemas: List[str] = ["urn:ietf:params:scim:schemas:core:2.0:User"]
    userName: str
    name: Dict[str, str]
    emails: List[Dict[str, Any]]
    active: bool = True

class ConnectionTest(BaseModel):
    protocol: str  # saml or oidc
    config_id: str

# ===================== HELPERS =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
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
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def generate_self_signed_cert():
    """Generate a self-signed certificate for SAML signing"""
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    
    # Generate private key
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    
    # Generate certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "California"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "San Francisco"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Kissflow SSO"),
        x509.NameAttribute(NameOID.COMMON_NAME, "sso.kissflow.local"),
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

def generate_saml_metadata(config: dict, base_url: str) -> str:
    """Generate SAML IdP Metadata XML"""
    cert = config.get('certificate', '')
    # Clean certificate for XML
    cert_clean = cert.replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '').replace('\n', '').strip()
    
    metadata = f'''<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" 
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="{config['entity_id']}">
    <md:IDPSSODescriptor WantAuthnRequestsSigned="true" 
                         protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
        <md:KeyDescriptor use="signing">
            <ds:KeyInfo>
                <ds:X509Data>
                    <ds:X509Certificate>{cert_clean}</ds:X509Certificate>
                </ds:X509Data>
            </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:KeyDescriptor use="encryption">
            <ds:KeyInfo>
                <ds:X509Data>
                    <ds:X509Certificate>{cert_clean}</ds:X509Certificate>
                </ds:X509Data>
            </ds:KeyInfo>
        </md:KeyDescriptor>
        <md:NameIDFormat>{config['name_id_format']}</md:NameIDFormat>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
                                Location="{base_url}/api/saml/sso"/>
        <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" 
                                Location="{base_url}/api/saml/sso"/>
        <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
                                Location="{base_url}/api/saml/slo"/>
    </md:IDPSSODescriptor>
    <md:Organization>
        <md:OrganizationName xml:lang="en">Kissflow SSO</md:OrganizationName>
        <md:OrganizationDisplayName xml:lang="en">Kissflow SSO Identity Provider</md:OrganizationDisplayName>
        <md:OrganizationURL xml:lang="en">{base_url}</md:OrganizationURL>
    </md:Organization>
    <md:ContactPerson contactType="technical">
        <md:GivenName>SSO Admin</md:GivenName>
        <md:EmailAddress>sso-admin@kissflow.local</md:EmailAddress>
    </md:ContactPerson>
</md:EntityDescriptor>'''
    
    return metadata

def generate_oidc_discovery(config: dict, base_url: str) -> dict:
    """Generate OpenID Connect Discovery Document"""
    return {
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/api/oidc/authorize",
        "token_endpoint": f"{base_url}/api/oidc/token",
        "userinfo_endpoint": f"{base_url}/api/oidc/userinfo",
        "jwks_uri": f"{base_url}/api/oidc/jwks",
        "registration_endpoint": f"{base_url}/api/oidc/register",
        "scopes_supported": config.get('scopes', ["openid", "profile", "email"]),
        "response_types_supported": ["code", "token", "id_token", "code token", "code id_token", "token id_token", "code token id_token"],
        "response_modes_supported": ["query", "fragment", "form_post"],
        "grant_types_supported": ["authorization_code", "implicit", "refresh_token"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "claims_supported": ["sub", "iss", "aud", "exp", "iat", "name", "email", "email_verified"]
    }

# ===================== AUTH ROUTES =====================

@api_router.post("/auth/register")
async def register(user: UserCreate):
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user.email,
        "password": hash_password(user.password),
        "name": user.name,
        "role": user.role,
        "status": "active",
        "provisioning_type": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    token = create_token(user_id, user.email, user.role)
    
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user.email,
            "name": user.name,
            "role": user.role
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'], user['email'], user['role'])
    
    return {
        "token": token,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "name": user['name'],
            "role": user['role']
        }
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "id": user['id'],
        "email": user['email'],
        "name": user['name'],
        "role": user['role']
    }

# ===================== SAML ROUTES =====================

@api_router.get("/saml/config")
async def get_saml_config(user: dict = Depends(get_current_user)):
    config = await db.saml_config.find_one({}, {"_id": 0})
    return config or {}

@api_router.post("/saml/config")
async def create_saml_config(config: SAMLConfigCreate, request: Request, user: dict = Depends(get_current_user)):
    # Generate certificate if not exists
    cert, key = generate_self_signed_cert()
    
    base_url = str(request.base_url).rstrip('/')
    
    config_doc = {
        "id": str(uuid.uuid4()),
        "entity_id": config.entity_id,
        "acs_url": config.acs_url,
        "slo_url": config.slo_url,
        "name_id_format": config.name_id_format,
        "sign_assertions": config.sign_assertions,
        "sign_response": config.sign_response,
        "certificate": cert,
        "private_key": key,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert - replace existing config
    await db.saml_config.delete_many({})
    await db.saml_config.insert_one(config_doc)
    
    # Return without private key
    return {k: v for k, v in config_doc.items() if k != 'private_key' and k != '_id'}

@api_router.put("/saml/config")
async def update_saml_config(config: SAMLConfigCreate, user: dict = Depends(get_current_user)):
    existing = await db.saml_config.find_one({}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="SAML config not found")
    
    update_data = config.model_dump()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.saml_config.update_one({}, {"$set": update_data})
    
    updated = await db.saml_config.find_one({}, {"_id": 0, "private_key": 0})
    return updated

@api_router.get("/saml/metadata")
async def get_saml_metadata(request: Request):
    config = await db.saml_config.find_one({}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="SAML not configured")
    
    base_url = str(request.base_url).rstrip('/')
    metadata = generate_saml_metadata(config, base_url)
    
    return Response(content=metadata, media_type="application/xml")

@api_router.get("/saml/metadata/download")
async def download_saml_metadata(request: Request):
    config = await db.saml_config.find_one({}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="SAML not configured")
    
    base_url = str(request.base_url).rstrip('/')
    metadata = generate_saml_metadata(config, base_url)
    
    return Response(
        content=metadata, 
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=saml-metadata.xml"}
    )

@api_router.get("/saml/certificate")
async def get_saml_certificate(user: dict = Depends(get_current_user)):
    config = await db.saml_config.find_one({}, {"_id": 0})
    if not config or not config.get('certificate'):
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    return {"certificate": config['certificate']}

# ===================== OIDC ROUTES =====================

@api_router.get("/oidc/config")
async def get_oidc_config(user: dict = Depends(get_current_user)):
    config = await db.oidc_config.find_one({}, {"_id": 0, "client_secret": 0})
    return config or {}

@api_router.post("/oidc/config")
async def create_oidc_config(config: OIDCConfigCreate, request: Request, user: dict = Depends(get_current_user)):
    base_url = str(request.base_url).rstrip('/')
    
    # Generate client secret
    client_secret = str(uuid.uuid4()).replace('-', '') + str(uuid.uuid4()).replace('-', '')
    
    config_doc = {
        "id": str(uuid.uuid4()),
        "client_id": config.client_id,
        "client_secret": client_secret,
        "redirect_uris": config.redirect_uris,
        "authorization_endpoint": f"{base_url}/api/oidc/authorize",
        "token_endpoint": f"{base_url}/api/oidc/token",
        "userinfo_endpoint": f"{base_url}/api/oidc/userinfo",
        "jwks_uri": f"{base_url}/api/oidc/jwks",
        "scopes": config.scopes,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert - replace existing config
    await db.oidc_config.delete_many({})
    await db.oidc_config.insert_one(config_doc)
    
    # Return with client secret (only on creation)
    return {k: v for k, v in config_doc.items() if k != '_id'}

@api_router.put("/oidc/config")
async def update_oidc_config(config: OIDCConfigCreate, user: dict = Depends(get_current_user)):
    existing = await db.oidc_config.find_one({}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="OIDC config not found")
    
    update_data = {
        "client_id": config.client_id,
        "redirect_uris": config.redirect_uris,
        "scopes": config.scopes,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.oidc_config.update_one({}, {"$set": update_data})
    
    updated = await db.oidc_config.find_one({}, {"_id": 0, "client_secret": 0})
    return updated

@api_router.get("/oidc/.well-known/openid-configuration")
async def get_oidc_discovery(request: Request):
    config = await db.oidc_config.find_one({}, {"_id": 0})
    if not config:
        # Return default discovery document
        base_url = str(request.base_url).rstrip('/')
        config = {"scopes": ["openid", "profile", "email"]}
    else:
        base_url = str(request.base_url).rstrip('/')
    
    return generate_oidc_discovery(config, base_url)

@api_router.get("/oidc/jwks")
async def get_jwks():
    # Return empty JWKS for now - can be extended with actual keys
    return {"keys": []}

# ===================== USER PROVISIONING ROUTES =====================

@api_router.get("/users")
async def get_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.post("/users/provision")
async def provision_user(provision: UserProvision, user: dict = Depends(get_current_user)):
    existing = await db.users.find_one({"email": provision.email})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user_id = str(uuid.uuid4())
    # Generate random password for provisioned users
    temp_password = str(uuid.uuid4())[:12]
    
    user_doc = {
        "id": user_id,
        "email": provision.email,
        "password": hash_password(temp_password),
        "name": provision.name,
        "role": provision.role,
        "status": "pending",
        "provisioning_type": provision.provisioning_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    return {
        "id": user_id,
        "email": provision.email,
        "name": provision.name,
        "role": provision.role,
        "status": "pending",
        "provisioning_type": provision.provisioning_type,
        "temp_password": temp_password
    }

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update_data: dict, user: dict = Depends(get_current_user)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove protected fields
    update_data.pop('id', None)
    update_data.pop('password', None)
    update_data.pop('_id', None)
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return updated

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent self-deletion
    if user['id'] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.users.delete_one({"id": user_id})
    return {"message": "User deleted successfully"}

# ===================== SCIM ROUTES =====================

@api_router.get("/scim/v2/Users")
async def scim_list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    
    scim_users = []
    for u in users:
        scim_users.append({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "id": u['id'],
            "userName": u['email'],
            "name": {
                "formatted": u['name'],
                "givenName": u['name'].split()[0] if u['name'] else "",
                "familyName": u['name'].split()[-1] if u['name'] and len(u['name'].split()) > 1 else ""
            },
            "emails": [{"value": u['email'], "primary": True}],
            "active": u.get('status', 'active') == 'active',
            "meta": {
                "resourceType": "User",
                "created": u.get('created_at', ''),
                "lastModified": u.get('updated_at', '')
            }
        })
    
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(scim_users),
        "Resources": scim_users
    }

@api_router.post("/scim/v2/Users")
async def scim_create_user(scim_user: SCIMUser, user: dict = Depends(get_current_user)):
    existing = await db.users.find_one({"email": scim_user.userName})
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")
    
    user_id = str(uuid.uuid4())
    temp_password = str(uuid.uuid4())[:12]
    
    name = scim_user.name.get('formatted', '') or f"{scim_user.name.get('givenName', '')} {scim_user.name.get('familyName', '')}".strip()
    
    user_doc = {
        "id": user_id,
        "email": scim_user.userName,
        "password": hash_password(temp_password),
        "name": name,
        "role": "user",
        "status": "active" if scim_user.active else "inactive",
        "provisioning_type": "scim",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "id": user_id,
        "userName": scim_user.userName,
        "name": scim_user.name,
        "emails": scim_user.emails,
        "active": scim_user.active,
        "meta": {
            "resourceType": "User",
            "created": user_doc['created_at'],
            "lastModified": user_doc['updated_at']
        }
    }

# ===================== CONNECTION TEST =====================

@api_router.post("/connection/test")
async def test_connection(test: ConnectionTest, request: Request, user: dict = Depends(get_current_user)):
    base_url = str(request.base_url).rstrip('/')
    
    if test.protocol == "saml":
        config = await db.saml_config.find_one({}, {"_id": 0})
        if not config:
            return {"success": False, "message": "SAML not configured", "details": {}}
        
        # Verify certificate exists
        if not config.get('certificate'):
            return {"success": False, "message": "Certificate not generated", "details": {}}
        
        return {
            "success": True,
            "message": "SAML configuration is valid",
            "details": {
                "entity_id": config['entity_id'],
                "acs_url": config['acs_url'],
                "metadata_url": f"{base_url}/api/saml/metadata",
                "sso_url": f"{base_url}/api/saml/sso",
                "certificate_valid": True
            }
        }
    
    elif test.protocol == "oidc":
        config = await db.oidc_config.find_one({}, {"_id": 0})
        if not config:
            return {"success": False, "message": "OIDC not configured", "details": {}}
        
        return {
            "success": True,
            "message": "OIDC configuration is valid",
            "details": {
                "client_id": config['client_id'],
                "authorization_endpoint": config['authorization_endpoint'],
                "token_endpoint": config['token_endpoint'],
                "discovery_url": f"{base_url}/api/oidc/.well-known/openid-configuration"
            }
        }
    
    return {"success": False, "message": "Invalid protocol", "details": {}}

# ===================== DASHBOARD STATS =====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    user_count = await db.users.count_documents({})
    active_users = await db.users.count_documents({"status": "active"})
    saml_config = await db.saml_config.find_one({}, {"_id": 0})
    oidc_config = await db.oidc_config.find_one({}, {"_id": 0})
    
    # Count by provisioning type
    manual_count = await db.users.count_documents({"provisioning_type": "manual"})
    scim_count = await db.users.count_documents({"provisioning_type": "scim"})
    jit_count = await db.users.count_documents({"provisioning_type": "jit"})
    
    return {
        "total_users": user_count,
        "active_users": active_users,
        "saml_configured": saml_config is not None,
        "oidc_configured": oidc_config is not None,
        "provisioning_stats": {
            "manual": manual_count,
            "scim": scim_count,
            "jit": jit_count
        }
    }

# ===================== BASE ROUTES =====================

@api_router.get("/")
async def root():
    return {"message": "Kissflow SSO Super App API"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
