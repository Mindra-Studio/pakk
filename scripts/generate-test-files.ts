#!/usr/bin/env tsx
/**
 * Generate test files of various sizes for PAKK benchmarks
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE_DIR = join(process.cwd(), 'test-samples');

// Ensure directories exist
['small', 'medium', 'large'].forEach(size => {
  const dir = join(BASE_DIR, size);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Python medium (~15KB)
const pythonMedium = `#!/usr/bin/env python3
"""
Medium Python sample - Full REST API with FastAPI
"""

import os
import json
import logging
import hashlib
import secrets
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps
from collections import defaultdict
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UserRole(Enum):
    ADMIN = "admin"
    MODERATOR = "moderator"
    USER = "user"
    GUEST = "guest"

class Status(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    DELETED = "deleted"

@dataclass
class BaseModel:
    id: int
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data['created_at'] = self.created_at.isoformat()
        if self.updated_at:
            data['updated_at'] = self.updated_at.isoformat()
        return data

@dataclass
class User(BaseModel):
    username: str = ""
    email: str = ""
    password_hash: str = ""
    role: UserRole = UserRole.USER
    status: Status = Status.ACTIVE
    profile: Dict[str, Any] = field(default_factory=dict)
    permissions: List[str] = field(default_factory=list)
    last_login: Optional[datetime] = None

    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_hex(16)
        hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return f"{salt}:{hash_obj.hex()}"

    def verify_password(self, password: str) -> bool:
        try:
            salt, hash_value = self.password_hash.split(':')
            hash_obj = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
            return hash_obj.hex() == hash_value
        except ValueError:
            return False

    def has_permission(self, permission: str) -> bool:
        if self.role == UserRole.ADMIN:
            return True
        return permission in self.permissions

@dataclass
class Session(BaseModel):
    user_id: int = 0
    token: str = ""
    expires_at: datetime = field(default_factory=lambda: datetime.now() + timedelta(hours=24))
    ip_address: str = ""
    user_agent: str = ""
    is_active: bool = True

    def is_expired(self) -> bool:
        return datetime.now() > self.expires_at

@dataclass
class AuditLog(BaseModel):
    user_id: int = 0
    action: str = ""
    resource: str = ""
    resource_id: Optional[int] = None
    details: Dict[str, Any] = field(default_factory=dict)
    ip_address: str = ""

class DatabaseError(Exception):
    pass

class AuthenticationError(Exception):
    pass

class AuthorizationError(Exception):
    pass

class ValidationError(Exception):
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")

class Repository:
    def __init__(self):
        self._data: Dict[int, Any] = {}
        self._next_id = 1
        self._lock = asyncio.Lock()

    async def create(self, item: Any) -> Any:
        async with self._lock:
            item.id = self._next_id
            self._data[item.id] = item
            self._next_id += 1
            return item

    async def get(self, id: int) -> Optional[Any]:
        return self._data.get(id)

    async def list(self, skip: int = 0, limit: int = 100) -> List[Any]:
        items = list(self._data.values())
        return items[skip:skip + limit]

    async def update(self, id: int, updates: Dict[str, Any]) -> Optional[Any]:
        async with self._lock:
            if id not in self._data:
                return None
            item = self._data[id]
            for key, value in updates.items():
                if hasattr(item, key):
                    setattr(item, key, value)
            item.updated_at = datetime.now()
            return item

    async def delete(self, id: int) -> bool:
        async with self._lock:
            if id in self._data:
                del self._data[id]
                return True
            return False

    async def find_by(self, **kwargs) -> List[Any]:
        results = []
        for item in self._data.values():
            match = all(getattr(item, k, None) == v for k, v in kwargs.items())
            if match:
                results.append(item)
        return results

class UserRepository(Repository):
    async def get_by_username(self, username: str) -> Optional[User]:
        users = await self.find_by(username=username)
        return users[0] if users else None

    async def get_by_email(self, email: str) -> Optional[User]:
        users = await self.find_by(email=email)
        return users[0] if users else None

    async def get_active_users(self) -> List[User]:
        return await self.find_by(status=Status.ACTIVE)

class SessionRepository(Repository):
    async def get_by_token(self, token: str) -> Optional[Session]:
        sessions = await self.find_by(token=token)
        return sessions[0] if sessions else None

    async def invalidate_user_sessions(self, user_id: int) -> int:
        sessions = await self.find_by(user_id=user_id, is_active=True)
        count = 0
        for session in sessions:
            session.is_active = False
            count += 1
        return count

class AuthService:
    def __init__(self, user_repo: UserRepository, session_repo: SessionRepository):
        self.user_repo = user_repo
        self.session_repo = session_repo
        self.audit_logs: List[AuditLog] = []

    async def register(self, username: str, email: str, password: str) -> User:
        if await self.user_repo.get_by_username(username):
            raise ValidationError("username", "Already exists")
        if await self.user_repo.get_by_email(email):
            raise ValidationError("email", "Already exists")
        if len(password) < 8:
            raise ValidationError("password", "Must be at least 8 characters")

        user = User(
            id=0,
            username=username,
            email=email,
            password_hash=User.hash_password(password)
        )
        user = await self.user_repo.create(user)
        self._log_action(user.id, "register", "user", user.id)
        return user

    async def login(self, username: str, password: str, ip: str = "", user_agent: str = "") -> Session:
        user = await self.user_repo.get_by_username(username)
        if not user or not user.verify_password(password):
            raise AuthenticationError("Invalid credentials")
        if user.status != Status.ACTIVE:
            raise AuthenticationError("Account is not active")

        session = Session(
            id=0,
            user_id=user.id,
            token=secrets.token_urlsafe(32),
            ip_address=ip,
            user_agent=user_agent
        )
        session = await self.session_repo.create(session)
        user.last_login = datetime.now()
        self._log_action(user.id, "login", "session", session.id)
        return session

    async def logout(self, token: str) -> bool:
        session = await self.session_repo.get_by_token(token)
        if session and session.is_active:
            session.is_active = False
            self._log_action(session.user_id, "logout", "session", session.id)
            return True
        return False

    async def validate_session(self, token: str) -> Optional[User]:
        session = await self.session_repo.get_by_token(token)
        if not session or not session.is_active or session.is_expired():
            return None
        return await self.user_repo.get(session.user_id)

    def _log_action(self, user_id: int, action: str, resource: str, resource_id: int):
        log = AuditLog(
            id=len(self.audit_logs) + 1,
            user_id=user_id,
            action=action,
            resource=resource,
            resource_id=resource_id
        )
        self.audit_logs.append(log)

def require_auth(func):
    @wraps(func)
    async def wrapper(self, token: str, *args, **kwargs):
        user = await self.auth_service.validate_session(token)
        if not user:
            raise AuthenticationError("Invalid or expired session")
        return await func(self, user, *args, **kwargs)
    return wrapper

def require_permission(permission: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(self, user: User, *args, **kwargs):
            if not user.has_permission(permission):
                raise AuthorizationError(f"Missing permission: {permission}")
            return await func(self, user, *args, **kwargs)
        return wrapper
    return decorator

class UserService:
    def __init__(self, auth_service: AuthService, user_repo: UserRepository):
        self.auth_service = auth_service
        self.user_repo = user_repo

    @require_auth
    async def get_profile(self, user: User) -> Dict[str, Any]:
        return user.to_dict()

    @require_auth
    async def update_profile(self, user: User, updates: Dict[str, Any]) -> User:
        allowed_fields = {'email', 'profile'}
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}
        updated_user = await self.user_repo.update(user.id, filtered_updates)
        return updated_user

    @require_auth
    @require_permission("users:read")
    async def list_users(self, user: User, skip: int = 0, limit: int = 100) -> List[Dict]:
        users = await self.user_repo.list(skip, limit)
        return [u.to_dict() for u in users]

    @require_auth
    @require_permission("users:write")
    async def update_user_status(self, admin: User, user_id: int, status: Status) -> User:
        target_user = await self.user_repo.get(user_id)
        if not target_user:
            raise DatabaseError("User not found")
        if target_user.role == UserRole.ADMIN and admin.id != target_user.id:
            raise AuthorizationError("Cannot modify another admin")
        return await self.user_repo.update(user_id, {'status': status})

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[datetime]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = datetime.now()
        cutoff = now - timedelta(seconds=self.window_seconds)
        self.requests[key] = [t for t in self.requests[key] if t > cutoff]
        if len(self.requests[key]) >= self.max_requests:
            return False
        self.requests[key].append(now)
        return True

class Cache:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self._cache: Dict[str, tuple] = {}

    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            value, expires_at = self._cache[key]
            if datetime.now() < expires_at:
                return value
            del self._cache[key]
        return None

    def set(self, key: str, value: Any) -> None:
        expires_at = datetime.now() + timedelta(seconds=self.ttl_seconds)
        self._cache[key] = (value, expires_at)

    def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        self._cache.clear()

async def main():
    user_repo = UserRepository()
    session_repo = SessionRepository()
    auth_service = AuthService(user_repo, session_repo)
    user_service = UserService(auth_service, user_repo)

    # Register users
    admin = await auth_service.register("admin", "admin@example.com", "admin123456")
    admin.role = UserRole.ADMIN
    admin.permissions = ["users:read", "users:write", "users:delete"]

    user1 = await auth_service.register("john", "john@example.com", "password123")
    user2 = await auth_service.register("jane", "jane@example.com", "password456")

    # Login
    admin_session = await auth_service.login("admin", "admin123456")
    user_session = await auth_service.login("john", "password123")

    print(f"Admin logged in with token: {admin_session.token[:20]}...")
    print(f"User logged in with token: {user_session.token[:20]}...")

    # Test rate limiter
    limiter = RateLimiter(max_requests=100, window_seconds=60)
    for i in range(105):
        allowed = limiter.is_allowed("test_key")
        if not allowed:
            print(f"Rate limited at request {i + 1}")
            break

    # Test cache
    cache = Cache(ttl_seconds=60)
    cache.set("user:1", admin.to_dict())
    cached_user = cache.get("user:1")
    print(f"Cached user: {cached_user['username']}")

if __name__ == "__main__":
    asyncio.run(main())
`;

// Rust medium (~20KB)
const rustMedium = `//! Medium Rust sample - Async HTTP server with database

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};

// ============ Error Handling ============

#[derive(Debug, Clone)]
pub enum AppError {
    NotFound(String),
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    Internal(String),
    Database(String),
    Validation(Vec<ValidationError>),
}

#[derive(Debug, Clone)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            AppError::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            AppError::Forbidden(msg) => write!(f, "Forbidden: {}", msg),
            AppError::Internal(msg) => write!(f, "Internal error: {}", msg),
            AppError::Database(msg) => write!(f, "Database error: {}", msg),
            AppError::Validation(errors) => {
                let msgs: Vec<String> = errors.iter()
                    .map(|e| format!("{}: {}", e.field, e.message))
                    .collect();
                write!(f, "Validation errors: {}", msgs.join(", "))
            }
        }
    }
}

impl std::error::Error for AppError {}

pub type Result<T> = std::result::Result<T, AppError>;

// ============ Domain Models ============

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum UserRole {
    Admin,
    Moderator,
    User,
    Guest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UserStatus {
    Active,
    Inactive,
    Suspended,
    Deleted,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: UserRole,
    pub status: UserStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub profile: HashMap<String, String>,
    pub permissions: Vec<String>,
}

impl User {
    pub fn new(username: String, email: String, password_hash: String) -> Self {
        Self {
            id: 0,
            username,
            email,
            password_hash,
            role: UserRole::User,
            status: UserStatus::Active,
            created_at: chrono::Utc::now(),
            updated_at: None,
            profile: HashMap::new(),
            permissions: Vec::new(),
        }
    }

    pub fn has_permission(&self, permission: &str) -> bool {
        if self.role == UserRole::Admin {
            return true;
        }
        self.permissions.contains(&permission.to_string())
    }

    pub fn is_active(&self) -> bool {
        self.status == UserStatus::Active
    }
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: i64,
    pub user_id: i64,
    pub token: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub ip_address: String,
    pub user_agent: String,
    pub is_active: bool,
}

impl Session {
    pub fn new(user_id: i64, token: String) -> Self {
        let now = chrono::Utc::now();
        Self {
            id: 0,
            user_id,
            token,
            created_at: now,
            expires_at: now + chrono::Duration::hours(24),
            ip_address: String::new(),
            user_agent: String::new(),
            is_active: true,
        }
    }

    pub fn is_expired(&self) -> bool {
        chrono::Utc::now() > self.expires_at
    }
}

// ============ Repository Traits ============

#[async_trait::async_trait]
pub trait UserRepository: Send + Sync {
    async fn create(&self, user: User) -> Result<User>;
    async fn get(&self, id: i64) -> Result<Option<User>>;
    async fn get_by_username(&self, username: &str) -> Result<Option<User>>;
    async fn get_by_email(&self, email: &str) -> Result<Option<User>>;
    async fn update(&self, user: User) -> Result<User>;
    async fn delete(&self, id: i64) -> Result<bool>;
    async fn list(&self, skip: usize, limit: usize) -> Result<Vec<User>>;
}

#[async_trait::async_trait]
pub trait SessionRepository: Send + Sync {
    async fn create(&self, session: Session) -> Result<Session>;
    async fn get_by_token(&self, token: &str) -> Result<Option<Session>>;
    async fn invalidate(&self, id: i64) -> Result<bool>;
    async fn invalidate_user_sessions(&self, user_id: i64) -> Result<usize>;
}

// ============ In-Memory Repositories ============

pub struct InMemoryUserRepository {
    users: RwLock<HashMap<i64, User>>,
    next_id: Mutex<i64>,
}

impl InMemoryUserRepository {
    pub fn new() -> Self {
        Self {
            users: RwLock::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
}

impl Default for InMemoryUserRepository {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl UserRepository for InMemoryUserRepository {
    async fn create(&self, mut user: User) -> Result<User> {
        let mut next_id = self.next_id.lock().await;
        user.id = *next_id;
        *next_id += 1;

        let mut users = self.users.write().await;
        users.insert(user.id, user.clone());
        Ok(user)
    }

    async fn get(&self, id: i64) -> Result<Option<User>> {
        let users = self.users.read().await;
        Ok(users.get(&id).cloned())
    }

    async fn get_by_username(&self, username: &str) -> Result<Option<User>> {
        let users = self.users.read().await;
        Ok(users.values().find(|u| u.username == username).cloned())
    }

    async fn get_by_email(&self, email: &str) -> Result<Option<User>> {
        let users = self.users.read().await;
        Ok(users.values().find(|u| u.email == email).cloned())
    }

    async fn update(&self, user: User) -> Result<User> {
        let mut users = self.users.write().await;
        if users.contains_key(&user.id) {
            users.insert(user.id, user.clone());
            Ok(user)
        } else {
            Err(AppError::NotFound(format!("User {} not found", user.id)))
        }
    }

    async fn delete(&self, id: i64) -> Result<bool> {
        let mut users = self.users.write().await;
        Ok(users.remove(&id).is_some())
    }

    async fn list(&self, skip: usize, limit: usize) -> Result<Vec<User>> {
        let users = self.users.read().await;
        let mut all: Vec<User> = users.values().cloned().collect();
        all.sort_by_key(|u| u.id);
        Ok(all.into_iter().skip(skip).take(limit).collect())
    }
}

pub struct InMemorySessionRepository {
    sessions: RwLock<HashMap<i64, Session>>,
    next_id: Mutex<i64>,
}

impl InMemorySessionRepository {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }
}

impl Default for InMemorySessionRepository {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl SessionRepository for InMemorySessionRepository {
    async fn create(&self, mut session: Session) -> Result<Session> {
        let mut next_id = self.next_id.lock().await;
        session.id = *next_id;
        *next_id += 1;

        let mut sessions = self.sessions.write().await;
        sessions.insert(session.id, session.clone());
        Ok(session)
    }

    async fn get_by_token(&self, token: &str) -> Result<Option<Session>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.values().find(|s| s.token == token).cloned())
    }

    async fn invalidate(&self, id: i64) -> Result<bool> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(&id) {
            session.is_active = false;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    async fn invalidate_user_sessions(&self, user_id: i64) -> Result<usize> {
        let mut sessions = self.sessions.write().await;
        let mut count = 0;
        for session in sessions.values_mut() {
            if session.user_id == user_id && session.is_active {
                session.is_active = false;
                count += 1;
            }
        }
        Ok(count)
    }
}

// ============ Services ============

pub struct AuthService {
    user_repo: Arc<dyn UserRepository>,
    session_repo: Arc<dyn SessionRepository>,
}

impl AuthService {
    pub fn new(
        user_repo: Arc<dyn UserRepository>,
        session_repo: Arc<dyn SessionRepository>,
    ) -> Self {
        Self { user_repo, session_repo }
    }

    pub async fn register(&self, username: String, email: String, password: String) -> Result<User> {
        // Validation
        let mut errors = Vec::new();

        if username.len() < 3 {
            errors.push(ValidationError {
                field: "username".to_string(),
                message: "Must be at least 3 characters".to_string(),
            });
        }

        if !email.contains('@') {
            errors.push(ValidationError {
                field: "email".to_string(),
                message: "Invalid email format".to_string(),
            });
        }

        if password.len() < 8 {
            errors.push(ValidationError {
                field: "password".to_string(),
                message: "Must be at least 8 characters".to_string(),
            });
        }

        if !errors.is_empty() {
            return Err(AppError::Validation(errors));
        }

        // Check for existing user
        if self.user_repo.get_by_username(&username).await?.is_some() {
            return Err(AppError::BadRequest("Username already exists".to_string()));
        }

        if self.user_repo.get_by_email(&email).await?.is_some() {
            return Err(AppError::BadRequest("Email already exists".to_string()));
        }

        // Create user
        let password_hash = self.hash_password(&password);
        let user = User::new(username, email, password_hash);
        self.user_repo.create(user).await
    }

    pub async fn login(&self, username: &str, password: &str) -> Result<Session> {
        let user = self.user_repo.get_by_username(username).await?
            .ok_or_else(|| AppError::Unauthorized("Invalid credentials".to_string()))?;

        if !self.verify_password(password, &user.password_hash) {
            return Err(AppError::Unauthorized("Invalid credentials".to_string()));
        }

        if !user.is_active() {
            return Err(AppError::Unauthorized("Account is not active".to_string()));
        }

        let token = self.generate_token();
        let session = Session::new(user.id, token);
        self.session_repo.create(session).await
    }

    pub async fn logout(&self, token: &str) -> Result<bool> {
        if let Some(session) = self.session_repo.get_by_token(token).await? {
            self.session_repo.invalidate(session.id).await
        } else {
            Ok(false)
        }
    }

    pub async fn validate_session(&self, token: &str) -> Result<Option<User>> {
        if let Some(session) = self.session_repo.get_by_token(token).await? {
            if !session.is_active || session.is_expired() {
                return Ok(None);
            }
            self.user_repo.get(session.user_id).await
        } else {
            Ok(None)
        }
    }

    fn hash_password(&self, password: &str) -> String {
        // In production, use bcrypt or argon2
        format!("hashed:{}", password)
    }

    fn verify_password(&self, password: &str, hash: &str) -> bool {
        hash == format!("hashed:{}", password)
    }

    fn generate_token(&self) -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..32)
            .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
            .collect()
    }
}

// ============ Rate Limiting ============

pub struct RateLimiter {
    max_requests: usize,
    window: Duration,
    requests: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            requests: Mutex::new(HashMap::new()),
        }
    }

    pub async fn is_allowed(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut requests = self.requests.lock().await;

        let entry = requests.entry(key.to_string()).or_insert_with(Vec::new);
        entry.retain(|&t| now.duration_since(t) < self.window);

        if entry.len() >= self.max_requests {
            false
        } else {
            entry.push(now);
            true
        }
    }
}

// ============ Caching ============

pub struct Cache<V> {
    data: RwLock<HashMap<String, (V, Instant)>>,
    ttl: Duration,
}

impl<V: Clone> Cache<V> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            data: RwLock::new(HashMap::new()),
            ttl,
        }
    }

    pub async fn get(&self, key: &str) -> Option<V> {
        let data = self.data.read().await;
        if let Some((value, created)) = data.get(key) {
            if created.elapsed() < self.ttl {
                return Some(value.clone());
            }
        }
        None
    }

    pub async fn set(&self, key: String, value: V) {
        let mut data = self.data.write().await;
        data.insert(key, (value, Instant::now()));
    }

    pub async fn delete(&self, key: &str) -> bool {
        let mut data = self.data.write().await;
        data.remove(key).is_some()
    }

    pub async fn clear(&self) {
        let mut data = self.data.write().await;
        data.clear();
    }
}

// ============ Main ============

#[tokio::main]
async fn main() -> Result<()> {
    let user_repo = Arc::new(InMemoryUserRepository::new());
    let session_repo = Arc::new(InMemorySessionRepository::new());
    let auth_service = AuthService::new(user_repo.clone(), session_repo);

    // Register users
    let admin = auth_service.register(
        "admin".to_string(),
        "admin@example.com".to_string(),
        "admin123456".to_string(),
    ).await?;
    println!("Created admin: {} (id: {})", admin.username, admin.id);

    let user = auth_service.register(
        "john".to_string(),
        "john@example.com".to_string(),
        "password123".to_string(),
    ).await?;
    println!("Created user: {} (id: {})", user.username, user.id);

    // Login
    let session = auth_service.login("john", "password123").await?;
    println!("Session token: {}...", &session.token[..20]);

    // Validate session
    if let Some(validated_user) = auth_service.validate_session(&session.token).await? {
        println!("Session valid for user: {}", validated_user.username);
    }

    // Test rate limiter
    let limiter = RateLimiter::new(100, Duration::from_secs(60));
    for i in 0..105 {
        if !limiter.is_allowed("test_key").await {
            println!("Rate limited at request {}", i + 1);
            break;
        }
    }

    // Test cache
    let cache: Cache<String> = Cache::new(Duration::from_secs(300));
    cache.set("key1".to_string(), "value1".to_string()).await;
    if let Some(value) = cache.get("key1").await {
        println!("Cached value: {}", value);
    }

    println!("\\nServer started successfully!");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_user_creation() {
        let repo = InMemoryUserRepository::new();
        let user = User::new(
            "test".to_string(),
            "test@example.com".to_string(),
            "hash".to_string(),
        );
        let created = repo.create(user).await.unwrap();
        assert_eq!(created.id, 1);
    }

    #[tokio::test]
    async fn test_rate_limiter() {
        let limiter = RateLimiter::new(5, Duration::from_secs(1));
        for _ in 0..5 {
            assert!(limiter.is_allowed("key").await);
        }
        assert!(!limiter.is_allowed("key").await);
    }

    #[tokio::test]
    async fn test_cache() {
        let cache: Cache<i32> = Cache::new(Duration::from_secs(1));
        cache.set("key".to_string(), 42).await;
        assert_eq!(cache.get("key").await, Some(42));
    }
}
`;

// Generate more medium files...
const goMedium = generateGoMedium();
const javaMedium = generateJavaMedium();
const cMedium = generateCMedium();
const cppMedium = generateCppMedium();
const reactMedium = generateReactMedium();
const vueMedium = generateVueMedium();
const cssMedium = generateCssMedium();
const jsonMedium = generateJsonMedium();
const tsMedium = generateTsMedium();

// Write medium files
writeFileSync(join(BASE_DIR, 'medium', 'api.py'), pythonMedium);
writeFileSync(join(BASE_DIR, 'medium', 'server.rs'), rustMedium);
writeFileSync(join(BASE_DIR, 'medium', 'server.go'), goMedium);
writeFileSync(join(BASE_DIR, 'medium', 'Application.java'), javaMedium);
writeFileSync(join(BASE_DIR, 'medium', 'database.c'), cMedium);
writeFileSync(join(BASE_DIR, 'medium', 'framework.cpp'), cppMedium);
writeFileSync(join(BASE_DIR, 'medium', 'Dashboard.tsx'), reactMedium);
writeFileSync(join(BASE_DIR, 'medium', 'Admin.vue'), vueMedium);
writeFileSync(join(BASE_DIR, 'medium', 'design-system.css'), cssMedium);
writeFileSync(join(BASE_DIR, 'medium', 'api-data.json'), jsonMedium);
writeFileSync(join(BASE_DIR, 'medium', 'framework.ts'), tsMedium);

// Generate large files by repeating and expanding
const largePython = pythonMedium + '\n' + generateMorePython();
const largeRust = rustMedium + '\n' + generateMoreRust();
const largeGo = goMedium + '\n' + generateMoreGo();
const largeJava = javaMedium + '\n' + generateMoreJava();
const largeC = cMedium + '\n' + generateMoreC();
const largeCpp = cppMedium + '\n' + generateMoreCpp();
const largeReact = reactMedium + '\n' + generateMoreReact();
const largeVue = vueMedium + '\n' + generateMoreVue();
const largeCss = cssMedium + '\n' + generateMoreCss();
const largeJson = generateLargeJson();
const largeTs = tsMedium + '\n' + generateMoreTs();

writeFileSync(join(BASE_DIR, 'large', 'enterprise.py'), largePython);
writeFileSync(join(BASE_DIR, 'large', 'application.rs'), largeRust);
writeFileSync(join(BASE_DIR, 'large', 'microservice.go'), largeGo);
writeFileSync(join(BASE_DIR, 'large', 'Enterprise.java'), largeJava);
writeFileSync(join(BASE_DIR, 'large', 'kernel.c'), largeC);
writeFileSync(join(BASE_DIR, 'large', 'engine.cpp'), largeCpp);
writeFileSync(join(BASE_DIR, 'large', 'Application.tsx'), largeReact);
writeFileSync(join(BASE_DIR, 'large', 'CRM.vue'), largeVue);
writeFileSync(join(BASE_DIR, 'large', 'framework.css'), largeCss);
writeFileSync(join(BASE_DIR, 'large', 'database.json'), largeJson);
writeFileSync(join(BASE_DIR, 'large', 'sdk.ts'), largeTs);

console.log('Test files generated successfully!');

// Helper functions
function generateGoMedium(): string {
  return \`// Medium Go sample - Microservice with database
package main

import (
  "context"
  "encoding/json"
  "fmt"
  "log"
  "net/http"
  "sync"
  "time"
)

type User struct {
  ID        int64     \\\`json:"id"\\\`
  Username  string    \\\`json:"username"\\\`
  Email     string    \\\`json:"email"\\\`
  Role      string    \\\`json:"role"\\\`
  CreatedAt time.Time \\\`json:"created_at"\\\`
  UpdatedAt time.Time \\\`json:"updated_at"\\\`
}

type Repository interface {
  Create(ctx context.Context, user *User) error
  Get(ctx context.Context, id int64) (*User, error)
  Update(ctx context.Context, user *User) error
  Delete(ctx context.Context, id int64) error
  List(ctx context.Context, offset, limit int) ([]*User, error)
}

type InMemoryRepo struct {
  mu     sync.RWMutex
  users  map[int64]*User
  nextID int64
}

func NewInMemoryRepo() *InMemoryRepo {
  return &InMemoryRepo{
    users:  make(map[int64]*User),
    nextID: 1,
  }
}

func (r *InMemoryRepo) Create(ctx context.Context, user *User) error {
  r.mu.Lock()
  defer r.mu.Unlock()
  user.ID = r.nextID
  user.CreatedAt = time.Now()
  r.nextID++
  r.users[user.ID] = user
  return nil
}

func (r *InMemoryRepo) Get(ctx context.Context, id int64) (*User, error) {
  r.mu.RLock()
  defer r.mu.RUnlock()
  if user, ok := r.users[id]; ok {
    return user, nil
  }
  return nil, fmt.Errorf("user not found")
}

func (r *InMemoryRepo) Update(ctx context.Context, user *User) error {
  r.mu.Lock()
  defer r.mu.Unlock()
  if _, ok := r.users[user.ID]; !ok {
    return fmt.Errorf("user not found")
  }
  user.UpdatedAt = time.Now()
  r.users[user.ID] = user
  return nil
}

func (r *InMemoryRepo) Delete(ctx context.Context, id int64) error {
  r.mu.Lock()
  defer r.mu.Unlock()
  delete(r.users, id)
  return nil
}

func (r *InMemoryRepo) List(ctx context.Context, offset, limit int) ([]*User, error) {
  r.mu.RLock()
  defer r.mu.RUnlock()
  users := make([]*User, 0, len(r.users))
  for _, u := range r.users {
    users = append(users, u)
  }
  if offset >= len(users) {
    return []*User{}, nil
  }
  end := offset + limit
  if end > len(users) {
    end = len(users)
  }
  return users[offset:end], nil
}

type Service struct {
  repo   Repository
  cache  *Cache
  logger *log.Logger
}

type Cache struct {
  mu   sync.RWMutex
  data map[string]cacheEntry
  ttl  time.Duration
}

type cacheEntry struct {
  value     interface{}
  expiresAt time.Time
}

func NewCache(ttl time.Duration) *Cache {
  return &Cache{
    data: make(map[string]cacheEntry),
    ttl:  ttl,
  }
}

func (c *Cache) Get(key string) (interface{}, bool) {
  c.mu.RLock()
  defer c.mu.RUnlock()
  if entry, ok := c.data[key]; ok {
    if time.Now().Before(entry.expiresAt) {
      return entry.value, true
    }
  }
  return nil, false
}

func (c *Cache) Set(key string, value interface{}) {
  c.mu.Lock()
  defer c.mu.Unlock()
  c.data[key] = cacheEntry{
    value:     value,
    expiresAt: time.Now().Add(c.ttl),
  }
}

func NewService(repo Repository, cache *Cache, logger *log.Logger) *Service {
  return &Service{repo: repo, cache: cache, logger: logger}
}

func (s *Service) CreateUser(ctx context.Context, user *User) error {
  if err := s.repo.Create(ctx, user); err != nil {
    s.logger.Printf("Failed to create user: %v", err)
    return err
  }
  s.logger.Printf("Created user: %s", user.Username)
  return nil
}

func (s *Service) GetUser(ctx context.Context, id int64) (*User, error) {
  key := fmt.Sprintf("user:%d", id)
  if cached, ok := s.cache.Get(key); ok {
    return cached.(*User), nil
  }
  user, err := s.repo.Get(ctx, id)
  if err != nil {
    return nil, err
  }
  s.cache.Set(key, user)
  return user, nil
}

type Handler struct {
  service *Service
}

func NewHandler(service *Service) *Handler {
  return &Handler{service: service}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Content-Type", "application/json")
  switch r.Method {
  case http.MethodGet:
    h.handleList(w, r)
  case http.MethodPost:
    h.handleCreate(w, r)
  default:
    http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
  }
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
  users, err := h.service.repo.List(r.Context(), 0, 100)
  if err != nil {
    http.Error(w, err.Error(), http.StatusInternalServerError)
    return
  }
  json.NewEncoder(w).Encode(users)
}

func (h *Handler) handleCreate(w http.ResponseWriter, r *http.Request) {
  var user User
  if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
    http.Error(w, err.Error(), http.StatusBadRequest)
    return
  }
  if err := h.service.CreateUser(r.Context(), &user); err != nil {
    http.Error(w, err.Error(), http.StatusInternalServerError)
    return
  }
  w.WriteHeader(http.StatusCreated)
  json.NewEncoder(w).Encode(user)
}

func main() {
  logger := log.Default()
  repo := NewInMemoryRepo()
  cache := NewCache(5 * time.Minute)
  service := NewService(repo, cache, logger)
  handler := NewHandler(service)

  logger.Println("Starting server on :8080")
  if err := http.ListenAndServe(":8080", handler); err != nil {
    logger.Fatal(err)
  }
}
\`;
}

function generateJavaMedium(): string {
  return \`package com.example.enterprise;

import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;
import java.time.*;

public class Application {
    public record User(long id, String username, String email, UserRole role, Instant createdAt) {}
    public enum UserRole { ADMIN, MODERATOR, USER, GUEST }

    public interface Repository<T, ID> {
        T save(T entity);
        Optional<T> findById(ID id);
        List<T> findAll();
        void deleteById(ID id);
        boolean existsById(ID id);
    }

    public static class InMemoryUserRepository implements Repository<User, Long> {
        private final Map<Long, User> storage = new ConcurrentHashMap<>();
        private final AtomicLong idGenerator = new AtomicLong(1);

        @Override
        public User save(User user) {
            long id = user.id() == 0 ? idGenerator.getAndIncrement() : user.id();
            User saved = new User(id, user.username(), user.email(), user.role(), Instant.now());
            storage.put(id, saved);
            return saved;
        }

        @Override
        public Optional<User> findById(Long id) {
            return Optional.ofNullable(storage.get(id));
        }

        @Override
        public List<User> findAll() {
            return new ArrayList<>(storage.values());
        }

        @Override
        public void deleteById(Long id) {
            storage.remove(id);
        }

        @Override
        public boolean existsById(Long id) {
            return storage.containsKey(id);
        }
    }

    public static class UserService {
        private final Repository<User, Long> repository;

        public UserService(Repository<User, Long> repository) {
            this.repository = repository;
        }

        public User createUser(String username, String email) {
            User user = new User(0, username, email, UserRole.USER, null);
            return repository.save(user);
        }

        public Optional<User> findUser(long id) {
            return repository.findById(id);
        }

        public List<User> listUsers() {
            return repository.findAll();
        }
    }

    public static void main(String[] args) {
        var repo = new InMemoryUserRepository();
        var service = new UserService(repo);

        var user1 = service.createUser("john", "john@example.com");
        var user2 = service.createUser("jane", "jane@example.com");

        System.out.println("Created users:");
        service.listUsers().forEach(u ->
            System.out.printf("- %s (%s)%n", u.username(), u.email())
        );
    }
}
\`;
}

function generateCMedium(): string {
  return \`/* Medium C sample - Database connection pool */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <stdbool.h>
#include <time.h>

#define MAX_POOL_SIZE 100
#define MAX_QUERY_LEN 4096

typedef struct {
    int id;
    bool in_use;
    time_t last_used;
} connection_t;

typedef struct {
    connection_t connections[MAX_POOL_SIZE];
    int size;
    int available;
    pthread_mutex_t mutex;
    pthread_cond_t cond;
} pool_t;

pool_t* pool_create(int size) {
    pool_t* pool = malloc(sizeof(pool_t));
    pool->size = size > MAX_POOL_SIZE ? MAX_POOL_SIZE : size;
    pool->available = pool->size;
    pthread_mutex_init(&pool->mutex, NULL);
    pthread_cond_init(&pool->cond, NULL);

    for (int i = 0; i < pool->size; i++) {
        pool->connections[i].id = i;
        pool->connections[i].in_use = false;
        pool->connections[i].last_used = 0;
    }
    return pool;
}

connection_t* pool_acquire(pool_t* pool) {
    pthread_mutex_lock(&pool->mutex);
    while (pool->available == 0) {
        pthread_cond_wait(&pool->cond, &pool->mutex);
    }

    for (int i = 0; i < pool->size; i++) {
        if (!pool->connections[i].in_use) {
            pool->connections[i].in_use = true;
            pool->connections[i].last_used = time(NULL);
            pool->available--;
            pthread_mutex_unlock(&pool->mutex);
            return &pool->connections[i];
        }
    }
    pthread_mutex_unlock(&pool->mutex);
    return NULL;
}

void pool_release(pool_t* pool, connection_t* conn) {
    pthread_mutex_lock(&pool->mutex);
    conn->in_use = false;
    pool->available++;
    pthread_cond_signal(&pool->cond);
    pthread_mutex_unlock(&pool->mutex);
}

void pool_destroy(pool_t* pool) {
    pthread_mutex_destroy(&pool->mutex);
    pthread_cond_destroy(&pool->cond);
    free(pool);
}

int main(void) {
    pool_t* pool = pool_create(10);
    printf("Pool created with %d connections\\n", pool->size);

    connection_t* conn = pool_acquire(pool);
    printf("Acquired connection %d\\n", conn->id);

    pool_release(pool, conn);
    printf("Released connection\\n");

    pool_destroy(pool);
    return 0;
}
\`;
}

function generateCppMedium(): string {
  return \`// Medium C++ sample - Event-driven framework
#include <iostream>
#include <functional>
#include <map>
#include <vector>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <condition_variable>
#include <chrono>
#include <optional>

namespace events {

template<typename... Args>
class Event {
public:
    using Handler = std::function<void(Args...)>;

    int subscribe(Handler handler) {
        std::lock_guard<std::mutex> lock(mutex_);
        int id = next_id_++;
        handlers_[id] = std::move(handler);
        return id;
    }

    void unsubscribe(int id) {
        std::lock_guard<std::mutex> lock(mutex_);
        handlers_.erase(id);
    }

    void emit(Args... args) const {
        std::lock_guard<std::mutex> lock(mutex_);
        for (const auto& [id, handler] : handlers_) {
            handler(args...);
        }
    }

private:
    mutable std::mutex mutex_;
    std::map<int, Handler> handlers_;
    int next_id_ = 0;
};

class EventLoop {
public:
    using Task = std::function<void()>;

    void run() {
        running_ = true;
        while (running_) {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this] { return !tasks_.empty() || !running_; });

            if (!running_ && tasks_.empty()) break;

            auto task = std::move(tasks_.front());
            tasks_.pop();
            lock.unlock();

            task();
        }
    }

    void post(Task task) {
        std::lock_guard<std::mutex> lock(mutex_);
        tasks_.push(std::move(task));
        cv_.notify_one();
    }

    void stop() {
        running_ = false;
        cv_.notify_all();
    }

private:
    std::mutex mutex_;
    std::condition_variable cv_;
    std::queue<Task> tasks_;
    bool running_ = false;
};

} // namespace events

int main() {
    events::Event<std::string, int> messageEvent;
    events::EventLoop loop;

    auto id = messageEvent.subscribe([](const std::string& msg, int code) {
        std::cout << "Message: " << msg << " (code: " << code << ")\\n";
    });

    std::thread loopThread([&loop] { loop.run(); });

    loop.post([&messageEvent] {
        messageEvent.emit("Hello, World!", 200);
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    loop.stop();
    loopThread.join();

    return 0;
}
\`;
}

function generateReactMedium(): string {
  return \`// Medium React sample - Dashboard application
import React, { useState, useEffect, useCallback, useMemo, useContext, createContext, useReducer } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  avatar?: string;
  lastLogin: Date;
}

interface AppState {
  users: User[];
  loading: boolean;
  error: string | null;
  currentPage: number;
  itemsPerPage: number;
}

type Action =
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'DELETE_USER'; payload: number };

const initialState: AppState = {
  users: [],
  loading: false,
  error: null,
  currentPage: 1,
  itemsPerPage: 10,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_PAGE':
      return { ...state, currentPage: action.payload };
    case 'DELETE_USER':
      return { ...state, users: state.users.filter(u => u.id !== action.payload) };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

const UserCard: React.FC<{ user: User; onDelete: (id: number) => void }> = React.memo(
  ({ user, onDelete }) => (
    <div className="user-card">
      <img src={user.avatar || '/default-avatar.png'} alt={user.name} />
      <div className="user-info">
        <h3>{user.name}</h3>
        <p>{user.email}</p>
        <span className={\\\`badge badge-\\\${user.role}\\\`}>{user.role}</span>
      </div>
      <button onClick={() => onDelete(user.id)} className="btn-delete">Delete</button>
    </div>
  )
);

const UserList: React.FC = () => {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState('');

  const filteredUsers = useMemo(() => {
    return state.users.filter(
      u => u.name.toLowerCase().includes(filter.toLowerCase()) ||
           u.email.toLowerCase().includes(filter.toLowerCase())
    );
  }, [state.users, filter]);

  const paginatedUsers = useMemo(() => {
    const start = (state.currentPage - 1) * state.itemsPerPage;
    return filteredUsers.slice(start, start + state.itemsPerPage);
  }, [filteredUsers, state.currentPage, state.itemsPerPage]);

  const handleDelete = useCallback((id: number) => {
    dispatch({ type: 'DELETE_USER', payload: id });
  }, [dispatch]);

  return (
    <div className="user-list">
      <input
        type="text"
        placeholder="Search users..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <div className="grid">
        {paginatedUsers.map(user => (
          <UserCard key={user.id} user={user} onDelete={handleDelete} />
        ))}
      </div>
      <div className="pagination">
        <span>Total: {filteredUsers.length} users</span>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const fetchUsers = async () => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        dispatch({ type: 'SET_USERS', payload: data });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to fetch users' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    fetchUsers();
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div className="dashboard">
        <header><h1>Admin Dashboard</h1></header>
        {state.loading && <div className="loading">Loading...</div>}
        {state.error && <div className="error">{state.error}</div>}
        {!state.loading && !state.error && <UserList />}
      </div>
    </AppContext.Provider>
  );
};

export default Dashboard;
\`;
}

function generateVueMedium(): string {
  return \`<script setup lang="ts">
import { ref, computed, onMounted, watch, provide, inject } from 'vue';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

const users = ref<User[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const filter = ref('');
const currentPage = ref(1);
const itemsPerPage = 10;

const filteredUsers = computed(() => {
  return users.value.filter(
    u => u.name.toLowerCase().includes(filter.value.toLowerCase()) ||
         u.email.toLowerCase().includes(filter.value.toLowerCase())
  );
});

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredUsers.value.slice(start, start + itemsPerPage);
});

const totalPages = computed(() => Math.ceil(filteredUsers.value.length / itemsPerPage));

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await fetch('/api/users');
    users.value = await res.json();
  } catch (err) {
    error.value = 'Failed to fetch users';
  } finally {
    loading.value = false;
  }
}

function deleteUser(id: number) {
  users.value = users.value.filter(u => u.id !== id);
}

onMounted(fetchUsers);

watch(filter, () => { currentPage.value = 1; });

provide('users', users);
provide('deleteUser', deleteUser);
</script>

<template>
  <div class="dashboard">
    <header><h1>Admin Dashboard</h1></header>

    <div v-if="loading" class="loading">Loading...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <input v-model="filter" placeholder="Search users..." class="search" />

      <div class="user-grid">
        <div v-for="user in paginatedUsers" :key="user.id" class="user-card">
          <h3>{{ user.name }}</h3>
          <p>{{ user.email }}</p>
          <span :class="['badge', \\\`badge-\\\${user.role}\\\`]">{{ user.role }}</span>
          <button @click="deleteUser(user.id)">Delete</button>
        </div>
      </div>

      <div class="pagination">
        <button :disabled="currentPage === 1" @click="currentPage--">Prev</button>
        <span>Page {{ currentPage }} of {{ totalPages }}</span>
        <button :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard { padding: 20px; }
.user-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
.user-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
.badge-admin { background: #f00; color: #fff; }
.badge-user { background: #00f; color: #fff; }
.pagination { margin-top: 20px; display: flex; gap: 10px; align-items: center; }
</style>
\`;
}

function generateCssMedium(): string {
  let css = \`/* Medium CSS sample - Design system */
:root {
  --primary: #3b82f6;
  --secondary: #6366f1;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.1);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--gray-800);
}

.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: #2563eb; }
.btn-secondary { background: var(--secondary); color: white; }
.btn-success { background: var(--success); color: white; }
.btn-warning { background: var(--warning); color: white; }
.btn-error { background: var(--error); color: white; }

.card {
  background: white;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px;
}

.card-header { border-bottom: 1px solid var(--gray-200); padding-bottom: 15px; margin-bottom: 15px; }
.card-title { font-size: 18px; font-weight: 600; }
.card-body { }
.card-footer { border-top: 1px solid var(--gray-200); padding-top: 15px; margin-top: 15px; }

.form-group { margin-bottom: 15px; }
.form-label { display: block; margin-bottom: 5px; font-weight: 500; }
.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--gray-300);
  border-radius: var(--radius);
  font-size: 14px;
}
.form-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

.grid { display: grid; gap: 20px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 768px) {
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}

.flex { display: flex; }
.flex-center { align-items: center; justify-content: center; }
.flex-between { align-items: center; justify-content: space-between; }
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-4 { gap: 16px; }

.text-primary { color: var(--primary); }
.text-secondary { color: var(--secondary); }
.text-success { color: var(--success); }
.text-warning { color: var(--warning); }
.text-error { color: var(--error); }
\`;

  // Add more CSS rules to reach ~15KB
  for (let i = 1; i <= 50; i++) {
    css += \`
.component-\${i} { padding: \${i}px; margin: \${i}px; }
.component-\${i}:hover { transform: translateY(-2px); }
.component-\${i}::before { content: ''; display: block; }
\`;
  }

  return css;
}

function generateJsonMedium(): string {
  const users = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    username: \`user\${i + 1}\`,
    email: \`user\${i + 1}@example.com\`,
    profile: {
      firstName: \`First\${i + 1}\`,
      lastName: \`Last\${i + 1}\`,
      age: 20 + (i % 50),
      country: ['USA', 'UK', 'Canada', 'France', 'Germany'][i % 5],
    },
    settings: {
      theme: i % 2 === 0 ? 'light' : 'dark',
      notifications: i % 3 !== 0,
      language: ['en', 'fr', 'de', 'es'][i % 4],
    },
    createdAt: new Date(2024, i % 12, (i % 28) + 1).toISOString(),
  }));

  return JSON.stringify({ users, total: users.length, page: 1, limit: 100 }, null, 2);
}

function generateTsMedium(): string {
  return \`// Medium TypeScript sample - Type-safe framework
export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };
export type DeepRequired<T> = { [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P] };

export interface Result<T, E = Error> {
  ok: boolean;
  data?: T;
  error?: E;
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export async function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export class EventEmitter<T extends Record<string, unknown[]>> {
  private listeners = new Map<keyof T, Set<(...args: unknown[]) => void>>();

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as (...args: unknown[]) => void);
    return () => this.off(event, listener);
  }

  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    this.listeners.get(event)?.forEach(l => l(...args));
  }
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let id: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let throttled = false;
  return ((...args: Parameters<T>) => {
    if (!throttled) {
      fn(...args);
      throttled = true;
      setTimeout(() => { throttled = false; }, ms);
    }
  }) as T;
}
\`;
}

// Generate more content for large files
function generateMorePython(): string {
  let code = '\n# Additional Python code for large file\n';
  for (let i = 0; i < 50; i++) {
    code += \`
class Model\${i}:
    def __init__(self, data):
        self.data = data
        self.id = \${i}

    def process(self):
        return {k: v * 2 for k, v in self.data.items()}

    async def async_process(self):
        await asyncio.sleep(0.1)
        return self.process()
\`;
  }
  return code;
}

function generateMoreRust(): string {
  let code = '\n// Additional Rust code for large file\n';
  for (let i = 0; i < 50; i++) {
    code += \`
pub struct Model\${i}<T> {
    data: T,
    id: i32,
}

impl<T: Clone> Model\${i}<T> {
    pub fn new(data: T) -> Self {
        Self { data, id: \${i} }
    }

    pub fn get_data(&self) -> T {
        self.data.clone()
    }

    pub fn process(&self) -> Option<T> {
        Some(self.data.clone())
    }
}
\`;
  }
  return code;
}

function generateMoreGo(): string {
  let code = '\n// Additional Go code for large file\n';
  for (let i = 0; i < 50; i++) {
    code += \`
type Model\${i} struct {
    ID   int
    Data interface{}
}

func NewModel\${i}(data interface{}) *Model\${i} {
    return &Model\${i}{ID: \${i}, Data: data}
}

func (m *Model\${i}) Process() interface{} {
    return m.Data
}
\`;
  }
  return code;
}

function generateMoreJava(): string {
  let code = '\n// Additional Java code for large file\n';
  for (let i = 0; i < 50; i++) {
    code += \`
class Model\${i}<T> {
    private final int id = \${i};
    private T data;

    public Model\${i}(T data) { this.data = data; }
    public T getData() { return data; }
    public int getId() { return id; }
    public void setData(T data) { this.data = data; }
}
\`;
  }
  return code;
}

function generateMoreC(): string {
  let code = '\n/* Additional C code for large file */\n';
  for (let i = 0; i < 50; i++) {
    code += \`
typedef struct model_\${i} {
    int id;
    void* data;
    size_t size;
} model_\${i}_t;

model_\${i}_t* model_\${i}_create(void* data, size_t size) {
    model_\${i}_t* m = malloc(sizeof(model_\${i}_t));
    m->id = \${i};
    m->data = data;
    m->size = size;
    return m;
}

void model_\${i}_destroy(model_\${i}_t* m) {
    free(m);
}
\`;
  }
  return code;
}

function generateMoreCpp(): string {
  let code = '\n// Additional C++ code for large file\n';
  for (let i = 0; i < 50; i++) {
    code += \`
template<typename T>
class Model\${i} {
public:
    explicit Model\${i}(T data) : data_(std::move(data)), id_(\${i}) {}

    const T& data() const { return data_; }
    int id() const { return id_; }

    template<typename Func>
    auto transform(Func&& f) const { return f(data_); }

private:
    T data_;
    int id_;
};
\`;
  }
  return code;
}

function generateMoreReact(): string {
  let code = '\n// Additional React code for large file\n';
  for (let i = 0; i < 30; i++) {
    code += \`
const Component\${i}: React.FC<{ data: unknown }> = React.memo(({ data }) => {
  const [state, setState] = useState(\${i});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('Component\${i} mounted');
    return () => console.log('Component\${i} unmounted');
  }, []);

  const handleClick = useCallback(() => {
    setState(prev => prev + 1);
  }, []);

  return (
    <div ref={ref} onClick={handleClick} className="component-\${i}">
      <span>Component \${i}: {state}</span>
    </div>
  );
});
\`;
  }
  return code;
}

function generateMoreVue(): string {
  let code = '\n<!-- Additional Vue code for large file -->\n';
  for (let i = 0; i < 20; i++) {
    code += \`
<script setup>
const count\${i} = ref(\${i});
const doubled\${i} = computed(() => count\${i}.value * 2);
function increment\${i}() { count\${i}.value++; }
</script>
\`;
  }
  return code;
}

function generateMoreCss(): string {
  let css = '\n/* Additional CSS for large file */\n';
  for (let i = 0; i < 100; i++) {
    css += \`
.element-\${i} {
  padding: \${i % 50}px;
  margin: \${i % 30}px;
  border-radius: \${i % 20}px;
  background: hsl(\${(i * 3.6) % 360}, 70%, 60%);
  transform: rotate(\${i % 360}deg);
}
.element-\${i}:hover {
  transform: scale(1.1) rotate(\${i % 360}deg);
  box-shadow: 0 \${i % 10}px \${i % 20}px rgba(0,0,0,0.2);
}
\`;
  }
  return css;
}

function generateMoreTs(): string {
  let code = '\n// Additional TypeScript for large file\n';
  for (let i = 0; i < 50; i++) {
    code += \`
interface Model\${i}<T> {
  id: number;
  data: T;
  metadata?: Record<string, unknown>;
}

function createModel\${i}<T>(data: T): Model\${i}<T> {
  return { id: \${i}, data };
}

class Service\${i}<T> {
  private items: Model\${i}<T>[] = [];

  add(item: T): Model\${i}<T> {
    const model = createModel\${i}(item);
    this.items.push(model);
    return model;
  }

  getAll(): Model\${i}<T>[] {
    return [...this.items];
  }
}
\`;
  }
  return code;
}

function generateLargeJson(): string {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    uuid: \`\${Math.random().toString(36).substring(2)}-\${Math.random().toString(36).substring(2)}\`,
    name: \`Item \${i + 1}\`,
    description: \`Description for item \${i + 1} with some longer text to make it more realistic\`,
    price: Math.round(Math.random() * 10000) / 100,
    quantity: Math.floor(Math.random() * 1000),
    category: ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'][i % 5],
    tags: ['tag1', 'tag2', 'tag3'].slice(0, (i % 3) + 1),
    attributes: {
      color: ['red', 'blue', 'green', 'black', 'white'][i % 5],
      size: ['S', 'M', 'L', 'XL'][i % 4],
      weight: Math.round(Math.random() * 100) / 10,
    },
    createdAt: new Date(2024, i % 12, (i % 28) + 1).toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return JSON.stringify({ items, total: items.length, generated: new Date().toISOString() }, null, 2);
}

class AtomicLong {
  private value: number;
  constructor(initial: number = 0) { this.value = initial; }
  getAndIncrement(): number { return this.value++; }
}
