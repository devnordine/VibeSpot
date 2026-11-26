import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';

const memoryStore = new Map<string, string>();
const mockLocalStorage: Storage = {
  get length() {
    return memoryStore.size;
  },
  clear: () => memoryStore.clear(),
  getItem: (key: string) => memoryStore.get(key) ?? null,
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  setItem: (key: string, value: string) => {
    memoryStore.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  function createService(token: string | null): AuthService {
    if (token) localStorage.setItem('gpc_token', token);
    else localStorage.removeItem('gpc_token');
    TestBed.configureTestingModule({ providers: [AuthService, provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => {
    httpMock?.verify();
    localStorage.clear();
  });

  it('ne fait aucune requête à la construction (évite la dépendance circulaire avec l’intercepteur)', () => {
    createService('jwt-123');
    httpMock.expectNone('/api/users/me');
  });

  it('restoreSession() recharge le profil quand un token existe', () => {
    const service = createService('jwt-123');
    service.restoreSession();

    httpMock.expectOne('/api/users/me').flush({ id: 'u1', name: 'Noa', email: 'noa@example.com', createdAt: '' });
    expect(service.currentUser()?.name).toBe('Noa');
  });

  it('restoreSession() ne fait rien sans token', () => {
    const service = createService(null);
    service.restoreSession();
    httpMock.expectNone('/api/users/me');
  });

  it('restoreSession() déconnecte si le token est refusé', () => {
    const service = createService('expired');
    service.restoreSession();

    httpMock.expectOne('/api/users/me').flush({ message: 'Token invalide' }, { status: 401, statusText: 'Unauthorized' });
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('gpc_token')).toBeNull();
  });

  it('login() stocke le token et l’utilisateur', () => {
    const service = createService(null);
    service.login('demo@example.com', 'Demo1234!').subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'demo@example.com', password: 'Demo1234!' });
    req.flush({ token: 'new-jwt', user: { id: 'u1', name: 'Demo', email: 'demo@example.com', createdAt: '' } });

    expect(service.token()).toBe('new-jwt');
    expect(localStorage.getItem('gpc_token')).toBe('new-jwt');
    expect(service.currentUser()?.id).toBe('u1');
  });
});
