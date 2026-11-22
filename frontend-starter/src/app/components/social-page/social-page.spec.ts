import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SocialPageComponent } from './social-page';

describe('SocialPageComponent', () => {
  let fixture: ComponentFixture<SocialPageComponent>;
  let component: SocialPageComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SocialPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Intercepte les deux appels lancés dans ngOnInit()
    httpMock.expectOne('/api/friends').flush({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
    });
    httpMock.expectOne('/api/feed').flush([]);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('crée la page sociale et bascule correctement entre les onglets', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('feed');

    component.selectTab('discover');
    expect(component.activeTab()).toBe('discover');
  });
});