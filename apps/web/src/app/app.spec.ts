import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import type { DeviceStorage } from './data/device-storage';
import { DEVICE_STORAGE } from './data/device-store';
import { deviceData, settle } from './data/testing';

describe('App', () => {
  async function render(storage: DeviceStorage = deviceData().storage) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: DEVICE_STORAGE, useValue: storage }],
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
    const broken: DeviceStorage = {
      load: () => Promise.reject(new Error('blocked')),
      save: () => Promise.reject(new Error('blocked')),
      replace: () => Promise.reject(new Error('blocked')),
      watch: () => () => undefined,
    };
    const el = await render(broken);
    expect(el.querySelector('.offline')?.textContent).toContain("Couldn't open the data on this device.");
  });
});
