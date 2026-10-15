import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppSettings } from '../core/app-settings';
import { type DeviceSnapshot, type DeviceStorage, MemoryStorage } from '../data/device-storage';
import { DEVICE_STORAGE } from '../data/device-store';
import { flushSaves, settle, storedCategory } from '../data/testing';
import { Toast } from '../ui/toast';
import { SettingsPage } from './settings-page';

const settings = { id: 'settings' as const, weekStartDay: 7 as const, defaultCurrency: 'JPY' as const, updatedAt: '2026-10-01T00:00:00Z' };

describe('SettingsPage', () => {
  let toast: { show: ReturnType<typeof vi.fn> };

  async function render(seed: Partial<DeviceSnapshot> = {}, storage: DeviceStorage = new MemoryStorage({ settings, ...seed })) {
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideRouter([]), { provide: Toast, useValue: toast }, { provide: DEVICE_STORAGE, useValue: storage }],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const select = (id: string) => el.querySelector<HTMLSelectElement>(id) as HTMLSelectElement;
    const choose = async (id: string, index: number) => {
      select(id).selectedIndex = index;
      select(id).dispatchEvent(new Event('change'));
      await flushSaves();
      fixture.detectChanges();
    };
    return { fixture, el, select, choose, storage };
  }

  it('shows the stored settings', async () => {
    const { select } = await render();
    expect(select('#set-week').selectedOptions[0].textContent?.trim()).toBe('Sunday');
    expect(select('#set-currency').value).toBe('JPY');
  });

  it('shows the defaults before anything is saved', async () => {
    const { select } = await render({}, new MemoryStorage());
    expect(select('#set-week').selectedOptions[0].textContent?.trim()).toBe('Monday');
    expect(select('#set-currency').value).toBe('TWD');
  });

  it('saves a change straight away', async () => {
    const storage = new MemoryStorage({ settings });
    const { choose } = await render({}, storage);
    await choose('#set-week', 0);
    expect(storage.snapshot().settings).toMatchObject({ weekStartDay: 1, defaultCurrency: 'JPY' });
    expect(TestBed.inject(AppSettings).value().weekStartDay).toBe(1);
    expect(toast.show).toHaveBeenCalledWith('Settings saved.');
  });

  it('puts the stored value back when a save fails', async () => {
    const failing = new MemoryStorage({ settings });
    failing.save = () => Promise.reject(new Error('quota'));
    const { choose, select } = await render({}, failing);
    await choose('#set-currency', 4);
    expect(select('#set-currency').value).toBe('JPY');
    expect(toast.show).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });

  it("offers no choices when the device's data can't be opened", async () => {
    const broken: DeviceStorage = {
      load: () => Promise.reject(new Error('blocked')),
      save: () => Promise.reject(new Error('blocked')),
      watch: () => () => undefined,
    };
    const { el } = await render({}, broken);
    expect(el.querySelector('#set-week')).toBeNull();
    expect(el.textContent).toContain("Couldn't load your settings.");
  });

  it('lists the category tree, each linking to its form', async () => {
    const { el } = await render({
      categories: [storedCategory('Lunch', 'Food'), storedCategory('Food'), storedCategory('Travel'), storedCategory('Old', null, { deletedAt: 'x' })],
    });
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
