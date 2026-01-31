#!/usr/bin/env node
/**
 * Generate test files for PAKK benchmarks
 */

const { writeFileSync, mkdirSync, existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const BASE_DIR = join(__dirname, '..', 'test-samples');

// Ensure directories exist
['small', 'medium', 'large'].forEach(size => {
  const dir = join(BASE_DIR, size);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

// Copy small files that already exist
const smallDir = join(BASE_DIR, 'small');

// Generate medium Python (~15KB)
function genPythonMedium() {
  let code = `#!/usr/bin/env python3
"""Medium Python sample - REST API with authentication"""

import os
import json
import logging
import hashlib
import secrets
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UserRole(Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"

@dataclass
class User:
    id: int
    username: str
    email: str
    password_hash: str
    role: UserRole = UserRole.USER
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "role": self.role.value,
            "created_at": self.created_at.isoformat()
        }

class UserRepository:
    def __init__(self):
        self._users: Dict[int, User] = {}
        self._next_id = 1

    async def create(self, username: str, email: str, password: str) -> User:
        user = User(
            id=self._next_id,
            username=username,
            email=email,
            password_hash=hashlib.sha256(password.encode()).hexdigest()
        )
        self._users[user.id] = user
        self._next_id += 1
        return user

    async def get(self, user_id: int) -> Optional[User]:
        return self._users.get(user_id)

    async def list(self) -> List[User]:
        return list(self._users.values())

    async def delete(self, user_id: int) -> bool:
        if user_id in self._users:
            del self._users[user_id]
            return True
        return False

`;

  // Add more code to reach ~15KB
  for (let i = 0; i < 50; i++) {
    code += `
class Service${i}:
    def __init__(self, repo):
        self.repo = repo
        self.cache = {}

    async def process(self, data: Dict) -> Dict:
        result = {k: v * 2 for k, v in data.items() if isinstance(v, (int, float))}
        self.cache[str(data)] = result
        return result

    def validate(self, data: Dict) -> bool:
        return all(isinstance(v, (str, int, float)) for v in data.values())

`;
  }

  return code;
}

// Generate medium Rust (~20KB)
function genRustMedium() {
  let code = `//! Medium Rust sample - Async HTTP server

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

#[derive(Debug, Clone)]
pub enum Error {
    NotFound(String),
    BadRequest(String),
    Internal(String),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl User {
    pub fn new(username: String, email: String) -> Self {
        Self {
            id: 0,
            username,
            email,
            created_at: chrono::Utc::now(),
        }
    }
}

pub struct Repository {
    users: RwLock<HashMap<i64, User>>,
    next_id: Mutex<i64>,
}

impl Repository {
    pub fn new() -> Self {
        Self {
            users: RwLock::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    pub async fn create(&self, mut user: User) -> Result<User> {
        let mut next_id = self.next_id.lock().await;
        user.id = *next_id;
        *next_id += 1;
        let mut users = self.users.write().await;
        users.insert(user.id, user.clone());
        Ok(user)
    }

    pub async fn get(&self, id: i64) -> Result<Option<User>> {
        let users = self.users.read().await;
        Ok(users.get(&id).cloned())
    }

    pub async fn list(&self) -> Result<Vec<User>> {
        let users = self.users.read().await;
        Ok(users.values().cloned().collect())
    }
}

`;

  for (let i = 0; i < 60; i++) {
    code += `
pub struct Service${i}<T> {
    data: T,
    id: i32,
}

impl<T: Clone> Service${i}<T> {
    pub fn new(data: T) -> Self {
        Self { data, id: ${i} }
    }

    pub fn get(&self) -> T {
        self.data.clone()
    }

    pub fn process(&self) -> Option<T> {
        Some(self.data.clone())
    }
}

`;
  }

  return code;
}

// Generate medium Go (~15KB)
function genGoMedium() {
  let code = `// Medium Go sample - REST API server
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

type User struct {
	ID        int64     \`json:"id"\`
	Username  string    \`json:"username"\`
	Email     string    \`json:"email"\`
	CreatedAt time.Time \`json:"created_at"\`
}

type Repository struct {
	mu     sync.RWMutex
	users  map[int64]*User
	nextID int64
}

func NewRepository() *Repository {
	return &Repository{
		users:  make(map[int64]*User),
		nextID: 1,
	}
}

func (r *Repository) Create(ctx context.Context, user *User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	user.ID = r.nextID
	user.CreatedAt = time.Now()
	r.nextID++
	r.users[user.ID] = user
	return nil
}

func (r *Repository) Get(ctx context.Context, id int64) (*User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if user, ok := r.users[id]; ok {
		return user, nil
	}
	return nil, nil
}

func (r *Repository) List(ctx context.Context) ([]*User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	users := make([]*User, 0, len(r.users))
	for _, u := range r.users {
		users = append(users, u)
	}
	return users, nil
}

`;

  for (let i = 0; i < 50; i++) {
    code += `
type Service${i} struct {
	repo   *Repository
	cache  map[string]interface{}
	mu     sync.RWMutex
}

func NewService${i}(repo *Repository) *Service${i} {
	return &Service${i}{
		repo:  repo,
		cache: make(map[string]interface{}),
	}
}

func (s *Service${i}) Process(ctx context.Context, data interface{}) (interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache["last"] = data
	return data, nil
}

`;
  }

  return code;
}

// Generate medium Java (~15KB)
function genJavaMedium() {
  let code = `package com.example.api;

import java.util.*;
import java.util.concurrent.*;
import java.time.*;

public class Application {

    public record User(long id, String username, String email, Instant createdAt) {}

    public interface Repository<T, ID> {
        T save(T entity);
        Optional<T> findById(ID id);
        List<T> findAll();
        void deleteById(ID id);
    }

    public static class UserRepository implements Repository<User, Long> {
        private final Map<Long, User> storage = new ConcurrentHashMap<>();
        private final AtomicLong idGen = new AtomicLong(1);

        @Override
        public User save(User user) {
            long id = idGen.getAndIncrement();
            User saved = new User(id, user.username(), user.email(), Instant.now());
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
    }

`;

  for (let i = 0; i < 50; i++) {
    code += `
    public static class Service${i}<T> {
        private final Map<String, T> cache = new ConcurrentHashMap<>();
        private final int id = ${i};

        public T process(T data) {
            cache.put("last", data);
            return data;
        }

        public Optional<T> getCached(String key) {
            return Optional.ofNullable(cache.get(key));
        }

        public int getId() { return id; }
    }

`;
  }

  code += `
    public static void main(String[] args) {
        var repo = new UserRepository();
        var user = repo.save(new User(0, "john", "john@example.com", null));
        System.out.println("Created: " + user);
    }
}
`;

  return code;
}

// Generate medium C (~15KB)
function genCMedium() {
  let code = `/* Medium C sample - Connection pool */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <stdbool.h>

#define MAX_POOL_SIZE 100

typedef struct {
    int id;
    bool in_use;
} connection_t;

typedef struct {
    connection_t connections[MAX_POOL_SIZE];
    int size;
    pthread_mutex_t mutex;
} pool_t;

pool_t* pool_create(int size) {
    pool_t* pool = malloc(sizeof(pool_t));
    pool->size = size > MAX_POOL_SIZE ? MAX_POOL_SIZE : size;
    pthread_mutex_init(&pool->mutex, NULL);
    for (int i = 0; i < pool->size; i++) {
        pool->connections[i].id = i;
        pool->connections[i].in_use = false;
    }
    return pool;
}

connection_t* pool_acquire(pool_t* pool) {
    pthread_mutex_lock(&pool->mutex);
    for (int i = 0; i < pool->size; i++) {
        if (!pool->connections[i].in_use) {
            pool->connections[i].in_use = true;
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
    pthread_mutex_unlock(&pool->mutex);
}

`;

  for (let i = 0; i < 50; i++) {
    code += `
typedef struct service_${i} {
    int id;
    void* data;
    size_t size;
} service_${i}_t;

service_${i}_t* service_${i}_create(void* data, size_t size) {
    service_${i}_t* s = malloc(sizeof(service_${i}_t));
    s->id = ${i};
    s->data = data;
    s->size = size;
    return s;
}

void service_${i}_destroy(service_${i}_t* s) {
    free(s);
}

void* service_${i}_process(service_${i}_t* s) {
    return s->data;
}

`;
  }

  code += `
int main(void) {
    pool_t* pool = pool_create(10);
    printf("Pool created\\n");
    pool_release(pool, pool_acquire(pool));
    return 0;
}
`;

  return code;
}

// Generate medium C++ (~20KB)
function genCppMedium() {
  let code = `// Medium C++ sample - Event system
#include <iostream>
#include <functional>
#include <map>
#include <vector>
#include <memory>
#include <mutex>

namespace app {

template<typename... Args>
class Event {
public:
    using Handler = std::function<void(Args...)>;

    int subscribe(Handler h) {
        std::lock_guard<std::mutex> lock(mutex_);
        handlers_[next_id_] = std::move(h);
        return next_id_++;
    }

    void emit(Args... args) const {
        std::lock_guard<std::mutex> lock(mutex_);
        for (const auto& [id, h] : handlers_) h(args...);
    }

private:
    mutable std::mutex mutex_;
    std::map<int, Handler> handlers_;
    int next_id_ = 0;
};

template<typename T>
class Repository {
public:
    virtual ~Repository() = default;
    virtual T create(T entity) = 0;
    virtual std::optional<T> find(int id) = 0;
    virtual std::vector<T> findAll() = 0;
};

} // namespace app

`;

  for (let i = 0; i < 60; i++) {
    code += `
template<typename T>
class Service${i} {
public:
    explicit Service${i}(T data) : data_(std::move(data)), id_(${i}) {}
    const T& data() const { return data_; }
    int id() const { return id_; }
    T process() const { return data_; }
private:
    T data_;
    int id_;
};

`;
  }

  code += `
int main() {
    app::Event<std::string, int> event;
    event.subscribe([](const std::string& msg, int code) {
        std::cout << msg << " (" << code << ")\\n";
    });
    event.emit("Hello", 200);
    return 0;
}
`;

  return code;
}

// Generate medium React (~15KB)
function genReactMedium() {
  let code = `// Medium React sample - Dashboard
import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

interface State {
  users: User[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'DELETE_USER'; payload: number };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_USERS': return { ...state, users: action.payload };
    case 'SET_LOADING': return { ...state, loading: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload };
    case 'DELETE_USER': return { ...state, users: state.users.filter(u => u.id !== action.payload) };
    default: return state;
  }
}

const UserCard: React.FC<{ user: User; onDelete: (id: number) => void }> = ({ user, onDelete }) => (
  <div className="user-card">
    <h3>{user.name}</h3>
    <p>{user.email}</p>
    <span className={\`badge-\${user.role}\`}>{user.role}</span>
    <button onClick={() => onDelete(user.id)}>Delete</button>
  </div>
);

`;

  for (let i = 0; i < 30; i++) {
    code += `
const Component${i}: React.FC<{ data: unknown }> = React.memo(({ data }) => {
  const [count, setCount] = useState(${i});
  const doubled = useMemo(() => count * 2, [count]);

  useEffect(() => {
    console.log('Component${i} mounted');
  }, []);

  const handleClick = useCallback(() => setCount(c => c + 1), []);

  return (
    <div onClick={handleClick} className="component-${i}">
      <span>Count: {count}, Doubled: {doubled}</span>
    </div>
  );
});

`;
  }

  code += `
const Dashboard: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, { users: [], loading: false, error: null });

  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: true });
    fetch('/api/users')
      .then(r => r.json())
      .then(data => dispatch({ type: 'SET_USERS', payload: data }))
      .catch(e => dispatch({ type: 'SET_ERROR', payload: e.message }))
      .finally(() => dispatch({ type: 'SET_LOADING', payload: false }));
  }, []);

  return (
    <div className="dashboard">
      {state.loading && <div>Loading...</div>}
      {state.error && <div>Error: {state.error}</div>}
      {state.users.map(u => <UserCard key={u.id} user={u} onDelete={id => dispatch({ type: 'DELETE_USER', payload: id })} />)}
    </div>
  );
};

export default Dashboard;
`;

  return code;
}

// Generate medium Vue (~15KB)
function genVueMedium() {
  let code = `<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const users = ref<User[]>([]);
const loading = ref(true);
const filter = ref('');
const page = ref(1);

const filtered = computed(() =>
  users.value.filter(u =>
    u.name.toLowerCase().includes(filter.value.toLowerCase())
  )
);

const paginated = computed(() => {
  const start = (page.value - 1) * 10;
  return filtered.value.slice(start, start + 10);
});

async function fetchUsers() {
  loading.value = true;
  try {
    const res = await fetch('/api/users');
    users.value = await res.json();
  } finally {
    loading.value = false;
  }
}

function deleteUser(id: number) {
  users.value = users.value.filter(u => u.id !== id);
}

onMounted(fetchUsers);
watch(filter, () => { page.value = 1; });

`;

  for (let i = 0; i < 30; i++) {
    code += `
const count${i} = ref(${i});
const doubled${i} = computed(() => count${i}.value * 2);
function increment${i}() { count${i}.value++; }

`;
  }

  code += `</script>

<template>
  <div class="dashboard">
    <input v-model="filter" placeholder="Search..." />
    <div v-if="loading">Loading...</div>
    <div v-else class="grid">
      <div v-for="user in paginated" :key="user.id" class="card">
        <h3>{{ user.name }}</h3>
        <p>{{ user.email }}</p>
        <button @click="deleteUser(user.id)">Delete</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { padding: 20px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.card { border: 1px solid #ddd; padding: 15px; }
</style>
`;

  return code;
}

// Generate medium CSS (~15KB)
function genCssMedium() {
  let css = `/* Medium CSS - Design System */
:root {
  --primary: #3b82f6;
  --secondary: #6366f1;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --gray-100: #f3f4f6;
  --gray-800: #1f2937;
  --radius: 8px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--gray-800);
}

.container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
}

.btn-primary { background: var(--primary); color: white; }
.btn-secondary { background: var(--secondary); color: white; }

.card {
  background: white;
  border-radius: var(--radius);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  padding: 20px;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: var(--radius);
}

`;

  for (let i = 0; i < 100; i++) {
    css += `
.element-${i} {
  padding: ${i % 30}px;
  margin: ${i % 20}px;
  border-radius: ${i % 15}px;
  background: hsl(${(i * 3.6) % 360}, 70%, 60%);
}
.element-${i}:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
`;
  }

  return css;
}

// Generate medium JSON (~20KB)
function genJsonMedium() {
  const users = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    username: `user${i + 1}`,
    email: `user${i + 1}@example.com`,
    profile: {
      firstName: `First${i + 1}`,
      lastName: `Last${i + 1}`,
      age: 20 + (i % 50),
    },
    settings: {
      theme: i % 2 === 0 ? 'light' : 'dark',
      notifications: i % 3 !== 0,
    },
    createdAt: new Date(2024, i % 12, (i % 28) + 1).toISOString(),
  }));

  return JSON.stringify({ users, total: users.length }, null, 2);
}

// Generate medium TypeScript (~15KB)
function genTsMedium() {
  let code = `// Medium TypeScript - Type utilities
export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };

export interface Result<T, E = Error> {
  ok: boolean;
  data?: T;
  error?: E;
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let id: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  }) as T;
}

export class EventEmitter<T extends Record<string, unknown[]>> {
  private listeners = new Map<keyof T, Set<(...args: unknown[]) => void>>();

  on<K extends keyof T>(event: K, listener: (...args: T[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof T>(event: K, listener: (...args: T[K]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    this.listeners.get(event)?.forEach(l => l(...args));
  }
}

`;

  for (let i = 0; i < 50; i++) {
    code += `
interface Model${i}<T> {
  id: number;
  data: T;
}

function createModel${i}<T>(data: T): Model${i}<T> {
  return { id: ${i}, data };
}

class Service${i}<T> {
  private items: Model${i}<T>[] = [];

  add(item: T): Model${i}<T> {
    const model = createModel${i}(item);
    this.items.push(model);
    return model;
  }

  getAll(): Model${i}<T>[] {
    return [...this.items];
  }
}

`;
  }

  return code;
}

// Write medium files
console.log('Generating medium files...');
writeFileSync(join(BASE_DIR, 'medium', 'api.py'), genPythonMedium());
writeFileSync(join(BASE_DIR, 'medium', 'server.rs'), genRustMedium());
writeFileSync(join(BASE_DIR, 'medium', 'server.go'), genGoMedium());
writeFileSync(join(BASE_DIR, 'medium', 'Application.java'), genJavaMedium());
writeFileSync(join(BASE_DIR, 'medium', 'database.c'), genCMedium());
writeFileSync(join(BASE_DIR, 'medium', 'framework.cpp'), genCppMedium());
writeFileSync(join(BASE_DIR, 'medium', 'Dashboard.tsx'), genReactMedium());
writeFileSync(join(BASE_DIR, 'medium', 'Admin.vue'), genVueMedium());
writeFileSync(join(BASE_DIR, 'medium', 'design-system.css'), genCssMedium());
writeFileSync(join(BASE_DIR, 'medium', 'api-data.json'), genJsonMedium());
writeFileSync(join(BASE_DIR, 'medium', 'framework.ts'), genTsMedium());

// Generate large files (repeat medium content 3-5x)
console.log('Generating large files...');
writeFileSync(join(BASE_DIR, 'large', 'enterprise.py'), genPythonMedium() + genPythonMedium() + genPythonMedium());
writeFileSync(join(BASE_DIR, 'large', 'application.rs'), genRustMedium() + genRustMedium() + genRustMedium());
writeFileSync(join(BASE_DIR, 'large', 'microservice.go'), genGoMedium() + genGoMedium() + genGoMedium());
writeFileSync(join(BASE_DIR, 'large', 'Enterprise.java'), genJavaMedium() + genJavaMedium() + genJavaMedium());
writeFileSync(join(BASE_DIR, 'large', 'kernel.c'), genCMedium() + genCMedium() + genCMedium());
writeFileSync(join(BASE_DIR, 'large', 'engine.cpp'), genCppMedium() + genCppMedium() + genCppMedium());
writeFileSync(join(BASE_DIR, 'large', 'Application.tsx'), genReactMedium() + genReactMedium() + genReactMedium());
writeFileSync(join(BASE_DIR, 'large', 'CRM.vue'), genVueMedium() + genVueMedium() + genVueMedium());
writeFileSync(join(BASE_DIR, 'large', 'framework.css'), genCssMedium() + genCssMedium() + genCssMedium());
writeFileSync(join(BASE_DIR, 'large', 'sdk.ts'), genTsMedium() + genTsMedium() + genTsMedium());

// Generate large JSON (~100KB)
const largeJsonItems = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  uuid: `${Math.random().toString(36).substring(2)}-${Math.random().toString(36).substring(2)}`,
  name: `Item ${i + 1}`,
  description: `Detailed description for item ${i + 1} with additional context`,
  price: Math.round(Math.random() * 10000) / 100,
  quantity: Math.floor(Math.random() * 1000),
  category: ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'][i % 5],
  tags: ['tag1', 'tag2', 'tag3'].slice(0, (i % 3) + 1),
  attributes: {
    color: ['red', 'blue', 'green', 'black', 'white'][i % 5],
    size: ['S', 'M', 'L', 'XL'][i % 4],
  },
  createdAt: new Date(2024, i % 12, (i % 28) + 1).toISOString(),
}));
writeFileSync(join(BASE_DIR, 'large', 'database.json'), JSON.stringify({ items: largeJsonItems, total: largeJsonItems.length }, null, 2));

console.log('Test files generated successfully!');
console.log('');
console.log('Files created:');
console.log('- test-samples/small/ : 11 files (~1-3KB each)');
console.log('- test-samples/medium/: 11 files (~15-20KB each)');
console.log('- test-samples/large/ : 11 files (~50-100KB each)');
