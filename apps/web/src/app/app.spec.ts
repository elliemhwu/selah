import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import type { DeviceStorage } from './data/device-storage';
import { DEVICE_STORAGE } from './data/device-store';
import { MemoryStorage } from './data/device-storage';
import { SYNC_SERVER } from './data/sync-server';
import { brokenStorage, deviceData, FakeSyncServer, problem, settle, storedAccount } from './data/testing';

describe('App', () => {
  async function render(storage: DeviceStorage = deviceData().storage, server = new FakeSyncServer()) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: DEVICE_STORAGE, useValue: storage },
        { provide: SYNC_SERVER, useValue: server.factory },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the navigation, with no server to reach', async () => {
    const el = await render();
    const labels = [...el.querySelectorAll('.bottom-nav .label')].map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Home', 'Records', 'Budget', 'Review', 'Accounts']);
    expect(el.querySelector('.offline')).toBeNull();
  });

  it("says when the device's data can't be opened", async () => {
    const broken = brokenStorage();
    const el = await render(broken);
    expect(el.querySelector('.offline')?.textContent).toContain("Couldn't open the data on this device.");
  });

  it('syncs when it opens, and points to Settings when the server refused a change', async () => {
    const storage = new MemoryStorage();
    await storage.setConnection({ id: 'sync', server: 'https://selah.test', token: 't', cursor: null, lastSyncedAt: null });
    await storage.save({ accounts: [storedAccount('cash')] });
    const server = new FakeSyncServer();
    server.refuse = (method) => (method === 'PUT' ? problem(422, 'No.') : undefined);
    const el = await render(storage, server);
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();

    expect(server.pushes()).toEqual(['PUT finance/accounts/cash']);
    expect(el.querySelector('.offline')?.textContent).toContain("Some changes couldn't sync.");
    expect(el.querySelector('.offline a')?.getAttribute('href')).toBe('/settings#sync');
  });
});
