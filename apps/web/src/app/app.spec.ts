import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AppSettings } from './core/app-settings';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(health: () => void) {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('/api/v1/core/settings').flush({ weekStartDay: 1, defaultCurrency: 'TWD', updatedAt: null });
    health();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the navigation', async () => {
    const el = await render(() => http.expectOne('/api/v1/health').flush({ status: 'ok', database: 'ok' }));
    const labels = [...el.querySelectorAll('.bottom-nav .label')].map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Home', 'Records', 'Budget', 'Review', 'Accounts']);
    expect(el.querySelector('.offline')).toBeNull();
  });

  it('says when the API is unreachable', async () => {
    const el = await render(() =>
      http.expectOne('/api/v1/health').flush(null, { status: 502, statusText: 'Bad Gateway' }),
    );
    expect(el.querySelector('.offline')?.textContent).toContain("Can't reach the server");
  });

  it('loads the settings once for the forms', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('/api/v1/core/settings').flush({ weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: '2026-10-14T00:00:00Z' });
    http.expectOne('/api/v1/health').flush({ status: 'ok', database: 'ok' });
    await fixture.whenStable();
    expect(TestBed.inject(AppSettings).value()).toMatchObject({ weekStartDay: 7, defaultCurrency: 'JPY' });
  });

  it('says when the database is down', async () => {
    const el = await render(() => http.expectOne('/api/v1/health').flush({ status: 'ok', database: 'unavailable' }));
    expect(el.querySelector('.offline')).not.toBeNull();
  });
});
