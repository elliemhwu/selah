import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppSettings } from '../core/app-settings';
import type { CategoryDto } from '../finance/data/finance-api';
import { Toast } from '../ui/toast';
import { SettingsPage } from './settings-page';

const SETTINGS = '/api/v1/core/settings';
const CATEGORIES = '/api/v1/finance/categories';
const category = (id: string, parentId: string | null = null) => ({ id, name: id, parentId, sortOrder: 0 }) as CategoryDto;
/** Lets a save's promise chain finish after its response is flushed. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('SettingsPage', () => {
  let http: HttpTestingController;
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: Toast, useValue: toast }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function render(categories: CategoryDto[] = []) {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: SETTINGS }).flush({ weekStartDay: 7, defaultCurrency: 'JPY', updatedAt: null });
    http.expectOne(CATEGORIES).flush(categories);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const select = (id: string) => el.querySelector<HTMLSelectElement>(id) as HTMLSelectElement;
    const choose = async (id: string, index: number) => {
      select(id).selectedIndex = index;
      select(id).dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    return { fixture, el, select, choose };
  }

  it('shows the stored settings', async () => {
    const { select } = await render();
    expect(select('#set-week').selectedOptions[0].textContent?.trim()).toBe('Sunday');
    expect(select('#set-currency').value).toBe('JPY');
  });

  it('saves a change straight away', async () => {
    const { choose } = await render();
    await choose('#set-week', 0);
    const req = http.expectOne({ method: 'PUT', url: SETTINGS });
    expect(req.request.body).toEqual({ weekStartDay: 1, defaultCurrency: 'JPY' });
    req.flush({ weekStartDay: 1, defaultCurrency: 'JPY', updatedAt: '2026-10-14T00:00:00Z' });
    await settle();
    expect(TestBed.inject(AppSettings).value().weekStartDay).toBe(1);
    expect(toast.show).toHaveBeenCalledWith('Settings saved.');
  });

  it('puts the stored value back when a save fails', async () => {
    const { fixture, choose, select } = await render();
    await choose('#set-currency', 4);
    http.expectOne({ method: 'PUT', url: SETTINGS }).flush(null, { status: 0, statusText: 'Unknown Error' });
    await settle();
    fixture.detectChanges();
    expect(select('#set-currency').value).toBe('JPY');
    expect(toast.show).toHaveBeenCalledWith("Can't reach the server. Check your connection and try again.");
  });

  it('offers no choices until the stored settings are known', async () => {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    http.expectOne(CATEGORIES).flush([]);
    http.expectOne(SETTINGS).flush(null, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#set-week')).toBeNull();
    expect(el.textContent).toContain("Couldn't load your settings.");
  });

  it('lists the category tree, each linking to its form', async () => {
    const { el } = await render([category('Lunch', 'Food'), category('Food'), category('Travel')]);
    const links = [...el.querySelectorAll<HTMLAnchorElement>('.category')];
    expect(links.map((a) => [a.textContent?.trim(), a.classList.contains('sub')])).toEqual([
      ['Food', false],
      ['Lunch', true],
      ['Travel', false],
    ]);
    expect(links[1].getAttribute('href')).toBe('/settings/categories/Lunch');
    expect(el.querySelector('.new-category')?.getAttribute('href')).toBe('/settings/categories/new');
  });
});
