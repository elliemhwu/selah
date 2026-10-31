import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppSettings } from '../core/app-settings';
import { TODAY } from '../core/today';
import { toBackupJson } from '../data/backup';
import { SAVE_FILE } from '../data/backups';
import { type DeviceSnapshot, type DeviceStorage, EMPTY_SNAPSHOT, MemoryStorage } from '../data/device-storage';
import { DEVICE_STORAGE } from '../data/device-store';
import { flushSaves, settle, storedAccount, storedCategory, storedRecord } from '../data/testing';
import { Toast } from '../ui/toast';
import { SettingsPage } from './settings-page';

const settings = { id: 'settings' as const, weekStartDay: 7 as const, defaultCurrency: 'JPY' as const, updatedAt: '2026-10-01T00:00:00Z' };

describe('SettingsPage', () => {
  let toast: { show: ReturnType<typeof vi.fn> };
  let saveFile: ReturnType<typeof vi.fn>;

  async function render(seed: Partial<DeviceSnapshot> = {}, storage: DeviceStorage = new MemoryStorage({ settings, ...seed })) {
    toast = { show: vi.fn() };
    saveFile = vi.fn();
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: Toast, useValue: toast },
        { provide: DEVICE_STORAGE, useValue: storage },
        { provide: SAVE_FILE, useValue: saveFile },
        { provide: TODAY, useValue: () => '2026-10-15' },
      ],
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
      replace: () => Promise.reject(new Error('blocked')),
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
    expect(links[1].getAttribute('href')).toBe('/finance/categories/Lunch');
    expect(el.querySelector('.new-category')?.getAttribute('href')).toBe('/finance/categories/new');
  });

  describe('backup', () => {
    const button = (el: HTMLElement, label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
    /** Picks `text` as the backup file, as the file chooser would. */
    async function pick(fixture: { componentInstance: unknown; detectChanges(): void }, el: HTMLElement, text: string) {
      const input = el.querySelector<HTMLInputElement>('input[type=file]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File([text], 'selah-backup-2026-10-01.json')], configurable: true });
      input.dispatchEvent(new Event('change'));
      // Reading a file takes a few turns: wait until the page offers the restore or says why not.
      const page = fixture.componentInstance as { pending(): unknown };
      await vi.waitFor(() => expect(!!page.pending() || toast.show.mock.calls.length > 0).toBe(true));
      fixture.detectChanges();
    }

    it('downloads everything on the device and remembers when', async () => {
      const { fixture, el } = await render({ accounts: [storedAccount('cash')] });
      expect(el.textContent).toContain('No backup from this device yet.');
      button(el, 'Download a backup').click();
      fixture.detectChanges();
      const [name, text] = saveFile.mock.calls[0];
      expect(name).toBe('selah-backup-2026-10-15.json');
      expect(JSON.parse(text)).toMatchObject({ format: 'selah-backup', version: 1, data: { accounts: [{ id: 'cash' }], settings } });
      expect(el.textContent).toContain('Last backup on this device:');
    });

    it('restores a backup after saying what it holds, replacing everything', async () => {
      const storage = new MemoryStorage({ settings, accounts: [storedAccount('old')] });
      const { fixture, el } = await render({}, storage);
      const backup = { ...EMPTY_SNAPSHOT, accounts: [storedAccount('cash')], records: [storedRecord('r1'), storedRecord('r2')] };
      await pick(fixture, el, toBackupJson(backup, '2026-10-01T09:30:00Z'));
      const confirm = el.querySelector('.restore-confirm')?.textContent?.replace(/\s+/g, ' ');
      expect(confirm).toContain('selah-backup-2026-10-01.json, from 1 Oct 2026');
      expect(confirm).toContain('with 2 entries and 1 accounts.');
      expect(confirm).toContain('Merge adds 3 rows');
      expect(storage.snapshot().accounts.map((a) => a.id)).toEqual(['old']);

      button(el, 'Replace my data').click();
      await flushSaves();
      expect(storage.snapshot()).toEqual(backup);
      expect(TestBed.inject(AppSettings).value().weekStartDay).toBe(1); // the backup had no settings
      expect(toast.show).toHaveBeenCalledWith('Backup restored.');
    });

    it('merges a backup into this device, keeping what only this device has', async () => {
      const storage = new MemoryStorage({ settings, accounts: [storedAccount('old')] });
      const { fixture, el } = await render({}, storage);
      const backup = { ...EMPTY_SNAPSHOT, accounts: [storedAccount('cash')], records: [storedRecord('r1')] };
      await pick(fixture, el, toBackupJson(backup, '2026-10-01T09:30:00Z'));
      button(el, 'Merge').click();
      await flushSaves();
      expect(storage.snapshot().accounts.map((a) => a.id).sort()).toEqual(['cash', 'old']);
      expect(storage.snapshot().records.map((r) => r.id)).toEqual(['r1']);
      expect(toast.show).toHaveBeenCalledWith('Backup merged.');
    });

    it("refuses a file that isn't a backup, changing nothing", async () => {
      const storage = new MemoryStorage({ settings, accounts: [storedAccount('old')] });
      const { fixture, el } = await render({}, storage);
      await pick(fixture, el, '{"hello": 1}');
      expect(toast.show).toHaveBeenCalledWith("This file isn't a Selah backup.");
      expect(el.querySelector('.restore-confirm')).toBeNull();
      expect(storage.snapshot().accounts.map((a) => a.id)).toEqual(['old']);
    });
  });
});
