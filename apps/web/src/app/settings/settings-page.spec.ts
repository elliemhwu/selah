import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppSettings } from '../core/app-settings';
import { TODAY } from '../core/today';
import { toBackupJson } from '../data/backup';
import { SAVE_FILE } from '../data/backups';
import { type DeviceSnapshot, type DeviceStorage, EMPTY_SNAPSHOT, MemoryStorage } from '../data/device-storage';
import { DEVICE_STORAGE } from '../data/device-store';
import { Sync } from '../data/sync';
import { SYNC_SERVER, SyncError } from '../data/sync-server';
import { brokenStorage, FakeSyncServer, flushSaves, problem, settle, storedAccount, storedCategory, storedRecord } from '../data/testing';
import { Toast } from '../ui/toast';
import { SettingsPage } from './settings-page';

const settings = { id: 'settings' as const, weekStartDay: 7 as const, defaultCurrency: 'JPY' as const, updatedAt: '2026-10-01T00:00:00Z' };

describe('SettingsPage', () => {
  let toast: { show: ReturnType<typeof vi.fn> };
  let saveFile: ReturnType<typeof vi.fn>;
  let server: FakeSyncServer;

  async function render(seed: Partial<DeviceSnapshot> = {}, storage: DeviceStorage = new MemoryStorage({ settings, ...seed })) {
    toast = { show: vi.fn() };
    saveFile = vi.fn();
    server = new FakeSyncServer();
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        { provide: Toast, useValue: toast },
        { provide: DEVICE_STORAGE, useValue: storage },
        { provide: SAVE_FILE, useValue: saveFile },
        { provide: SYNC_SERVER, useValue: server.factory },
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
    const broken = brokenStorage();
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
      expect(confirm).toContain('Restore selah-backup-2026-10-01.json');
      expect(confirm).toContain('with 2 entries and 1 accounts? This replaces everything on this device.');
      expect(storage.snapshot().accounts.map((a) => a.id)).toEqual(['old']);

      button(el, 'Replace my data').click();
      await flushSaves();
      expect(storage.snapshot()).toEqual(backup);
      expect(TestBed.inject(AppSettings).value().weekStartDay).toBe(1); // the backup had no settings
      expect(toast.show).toHaveBeenCalledWith('Backup restored.');
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

  describe('sync (ADR 0028)', () => {
    const type = (el: HTMLElement, id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }, el: HTMLElement) => {
      el.querySelector<HTMLFormElement>('#sync form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      await flushSaves();
      fixture.detectChanges();
    };

    it('connects to a server, sends what is on the device, and says so', async () => {
      const { fixture, el } = await render({ accounts: [storedAccount('cash')] });
      type(el, '#sync-server', 'https://selah.test/');
      type(el, '#sync-token', 'secret');
      await submit(fixture, el);

      expect(server.opened[0]).toEqual(['https://selah.test', 'secret']);
      expect(server.pushes()).toContain('PUT finance/accounts/cash');
      expect(el.querySelector('#sync')?.textContent).toContain('This device syncs with https://selah.test.');
      expect(el.querySelector('#sync')?.textContent).toContain('Last synced');
      expect(toast.show).toHaveBeenCalledWith('Connected. This device now syncs.');
    });

    it("says why it couldn't connect, and keeps the form", async () => {
      const { fixture, el } = await render();
      server.fail = new SyncError('unauthorized', "The server didn't accept the access token.");
      type(el, '#sync-server', 'https://selah.test');
      type(el, '#sync-token', 'wrong');
      await submit(fixture, el);

      expect(el.querySelector('#sync [role="alert"]')?.textContent).toContain("didn't accept the access token");
      expect(el.querySelector('#sync-server')).not.toBeNull();
    });

    it('lists changes the server refused, and drops one for the server copy', async () => {
      const storage = new MemoryStorage({ settings });
      await storage.setConnection({ id: 'sync', server: 'https://selah.test', token: 't', cursor: 'c1', lastSyncedAt: null });
      await storage.save({ accounts: [storedAccount('cash', 'TWD', { name: 'Wallet' })] });
      const { fixture, el } = await render({}, storage);
      server.refuse = (method) => (method === 'PUT' ? problem(409, 'An account named "Wallet" already exists.') : undefined);
      await TestBed.inject(Sync).syncNow();
      fixture.detectChanges();

      const item = el.querySelector('.attention li');
      expect(item?.textContent).toContain('Account Wallet');
      expect(item?.textContent).toContain('An account named "Wallet" already exists.');

      const useServer = [...(item?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes("server's copy"));
      useServer?.click();
      await fixture.whenStable();
      await flushSaves();
      fixture.detectChanges();
      expect(el.querySelector('.attention')).toBeNull();
      expect(server.log.at(-1)).toBe('GET sync/changes');
    });

    it('stops syncing on request', async () => {
      const storage = new MemoryStorage({ settings });
      await storage.setConnection({ id: 'sync', server: 'https://selah.test', token: 't', cursor: null, lastSyncedAt: null });
      const { fixture, el } = await render({}, storage);
      await TestBed.inject(Sync).syncNow();
      fixture.detectChanges();
      const stop = [...el.querySelectorAll<HTMLButtonElement>('#sync button')].find((b) => b.textContent?.includes('Stop syncing'));
      stop?.click();
      await fixture.whenStable();
      await flushSaves();
      fixture.detectChanges();
      expect(await storage.connection()).toBeNull();
      expect(el.querySelector('#sync-server')).not.toBeNull();
    });
  });
});
