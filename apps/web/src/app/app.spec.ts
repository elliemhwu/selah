import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the API health status', async () => {
    const fixture = render();
    http.expectOne('/api/v1/health').flush({ status: 'ok', database: 'ok' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Selah');
    expect(el.querySelector('.status')?.textContent).toContain(
      'API ok, database ok',
    );
  });

  it('says when the API is unreachable', async () => {
    const fixture = render();
    http
      .expectOne('/api/v1/health')
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.status')?.textContent).toContain(
      'API unreachable',
    );
  });
});
