import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let mockAuthService: { token: ReturnType<typeof signal<string | null>> };

  beforeEach(() => {
    mockAuthService = {
      token: signal<string | null>('fake-jwt-token-xyz'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('doit injecter l\'en-tête "Authorization: Bearer <token>" lorsqu\'un token est présent', () => {
    httpClient.get('/api/spots').subscribe();

    const req = httpMock.expectOne('/api/spots');

    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt-token-xyz');

    req.flush({});
  });

  it('ne doit pas injecter l\'en-tête "Authorization" si aucun token n\'est stocké', () => {
    mockAuthService.token.set(null);

    httpClient.get('/api/spots').subscribe();

    const req = httpMock.expectOne('/api/spots');

    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({});
  });
});